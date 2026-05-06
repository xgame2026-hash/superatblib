import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  fetchOnchainDashboardPayload,
  onchainDashboardProviderSummary,
} from "./onchain-dashboard-provider.js";
import {
  fetchDatabaseMarketDataPayload,
  marketDataDatabaseConfigured,
} from "./market-data-db.js";

export type EigenphiDashboardPeriod = "1" | "7" | "30";

export type EigenphiDashboardProviderKey =
  | "flashloan-overview"
  | "latest-liquidation"
  | "liquidation-leaderboard"
  | "liquidation-overview";

export type EigenphiDashboardProviderContext = {
  key: EigenphiDashboardProviderKey;
  chain: string;
  period?: EigenphiDashboardPeriod;
  date?: string;
  page?: number;
  pageSize?: number;
  sourcePage: string;
};

type CacheEntry = {
  savedAt: string;
  payload: Record<string, unknown>;
};

type ProviderAttempt = {
  provider: string;
  error: string;
};

type ProviderFetcher = () => Promise<Record<string, unknown> | null>;

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;

function hasRealValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim();
  return Boolean(normalized) && !normalized.includes("YOUR_") && normalized !== "undefined";
}

function providerCacheDir(): string {
  return (
    process.env.DASHBOARD_MARKET_DATA_CACHE_DIR ??
    path.resolve(process.cwd(), ".data", "market-data")
  );
}

function providerCacheTtlMs(): number {
  const configured = Number(process.env.DASHBOARD_MARKET_DATA_CACHE_TTL_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_CACHE_TTL_MS;
}

function providerTimeoutMs(): number {
  const configured = Number(process.env.DASHBOARD_MARKET_DATA_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.trunc(configured)
    : DEFAULT_PROVIDER_TIMEOUT_MS;
}

function onchainMarketDataFallbackEnabled(): boolean {
  return process.env.DASHBOARD_ONCHAIN_MARKET_DATA_FALLBACK !== "0";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function cacheName(context: EigenphiDashboardProviderContext): string {
  const parts = [
    "v3-market-events",
    context.key,
    context.chain,
    context.period ?? "live",
    context.date ?? "all",
    String(context.page ?? 0),
    String(context.pageSize ?? 0),
  ];
  return `${parts.map((part) => part.replace(/[^a-z0-9_-]/gi, "_")).join("__")}.json`;
}

function cachePath(context: EigenphiDashboardProviderContext): string {
  return path.join(providerCacheDir(), cacheName(context));
}

function readCache(context: EigenphiDashboardProviderContext): CacheEntry | null {
  const filePath = cachePath(context);
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as CacheEntry;
    if (!parsed || typeof parsed !== "object" || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(context: EigenphiDashboardProviderContext, payload: Record<string, unknown>): void {
  try {
    mkdirSync(providerCacheDir(), { recursive: true });
    writeFileSync(
      cachePath(context),
      JSON.stringify({ savedAt: new Date().toISOString(), payload }, null, 2),
      "utf8",
    );
  } catch {
    // Cache writes must never block live dashboard data.
  }
}

function isFreshCache(entry: CacheEntry): boolean {
  const ttlMs = providerCacheTtlMs();
  if (ttlMs === 0) return false;
  const savedAt = Date.parse(entry.savedAt);
  return Number.isFinite(savedAt) && Date.now() - savedAt <= ttlMs;
}

function isUsablePayload(payload: Record<string, unknown> | null): boolean {
  return Boolean(payload && payload.ok !== false);
}

function withProviderMeta(
  payload: Record<string, unknown>,
  provider: string,
  cacheStatus?: "fresh" | "stale",
): Record<string, unknown> {
  return {
    ...payload,
    dataProvider: provider,
    ...(cacheStatus ? { cacheStatus } : {}),
  };
}

function sourceUnavailablePayload(
  context: EigenphiDashboardProviderContext,
  attempts: ProviderAttempt[],
): Record<string, unknown> {
  const configuredAttempts = attempts.filter(
    (attempt) => attempt.error !== "not configured",
  );
  const error = configuredAttempts.length
    ? configuredAttempts.map((attempt) => `${attempt.provider}: ${attempt.error}`).join(" | ")
    : "No configured market-data provider returned data.";
  const base = {
    ok: false,
    sourceUnavailable: true,
    dataProvider: "none",
    chain: context.chain,
    period: context.period,
    date: context.date ?? null,
    page: context.page ?? 0,
    pageSize: context.pageSize ?? 0,
    error,
    providerAttempts: configuredAttempts,
    sourcePage: context.sourcePage,
  };

  if (context.key === "flashloan-overview") {
    return {
      ...base,
      summary: {
        data: {
          txCount: 0,
          amount: 0,
          fee: 0,
          flashloanCount: 0,
          flashloanBorrowerCount: 0,
          flashloanAssetCount: 0,
        },
        updateTimestamp: null,
      },
      trend: { data: [] },
      protocols: { data: [] },
      latest: { rows: [] },
      top: { rows: [] },
    };
  }

  if (context.key === "liquidation-leaderboard") {
    return {
      ...base,
      latest: { rows: [] },
      tabs: {
        txProfit: { rows: [] },
        liquidations: { rows: [] },
        liquidators: { rows: [] },
        liquidatedAssets: { rows: [] },
        liquidatedBorrowers: { rows: [] },
      },
    };
  }

  if (context.key === "latest-liquidation") {
    return {
      ...base,
      rows: [],
      hasPrev: false,
      hasNext: false,
      rangeStart: 0,
      rangeEnd: 0,
      updateTimestamp: null,
    };
  }

  return {
    ...base,
    summary: {
      data: {
        txCount: 0,
        liquidationAmount: 0,
        profit: 0,
        cost: 0,
        revenue: 0,
        liquidatedBorrowerCount: 0,
        liquidatedAssetCount: 0,
        liquidatorCount: 0,
      },
      updateTimestamp: null,
    },
    trend: { data: [] },
    distribution: { data: [] },
    protocols: { data: [] },
  };
}

function contextEnvSuffix(context: EigenphiDashboardProviderContext): string {
  return context.key.replace(/-/g, "_").toUpperCase();
}

function readOptionalFile(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("\n") || trimmed.trimStart().startsWith("{")) return trimmed;
  const filePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
  if (!existsSync(filePath)) return trimmed;
  return readFileSync(filePath, "utf8");
}

function normalizeExternalPayload(
  context: EigenphiDashboardProviderContext,
  payload: unknown,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const embedded =
    record.payload ??
    record.dashboardPayload ??
    record.resultPayload ??
    record.data;
  if (typeof embedded === "string") {
    try {
      return normalizeExternalPayload(context, JSON.parse(embedded));
    } catch {
      return null;
    }
  }
  if (embedded && typeof embedded === "object") {
    return normalizeExternalPayload(context, embedded);
  }

  const hasExpectedShape =
    "ok" in record ||
    "summary" in record ||
    "trend" in record ||
    "tabs" in record ||
    "latest" in record ||
    "rows" in record;
  if (!hasExpectedShape) return null;

  return {
    ok: true,
    sourcePage: context.sourcePage,
    chain: context.chain,
    ...(context.period ? { period: context.period } : {}),
    fetchedAt: new Date().toISOString(),
    ...record,
  };
}

async function fetchDunePayload(
  context: EigenphiDashboardProviderContext,
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.DUNE_API_KEY;
  const suffix = contextEnvSuffix(context);
  const queryId =
    process.env[`DUNE_EIGENPHI_${suffix}_QUERY_ID`] ??
    process.env[`DUNE_${suffix}_QUERY_ID`];
  if (!hasRealValue(apiKey) || !hasRealValue(queryId)) return null;

  const url = new URL(`https://api.dune.com/api/v1/query/${queryId}/results`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-dune-api-key": apiKey as string,
    },
  });
  if (!response.ok) {
    throw new Error(`Dune request failed (${response.status}) for ${context.key}.`);
  }
  const body = (await response.json()) as Record<string, unknown>;
  const rows = (((body.result as Record<string, unknown> | undefined)?.rows ?? []) as unknown[])
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
  return normalizeExternalPayload(context, rows[0] ?? body);
}

async function fetchBitqueryPayload(
  context: EigenphiDashboardProviderContext,
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.BITQUERY_API_KEY;
  const suffix = contextEnvSuffix(context);
  const query = readOptionalFile(
    process.env[`BITQUERY_EIGENPHI_${suffix}_QUERY`] ??
      process.env[`BITQUERY_${suffix}_QUERY`],
  );
  if (!hasRealValue(apiKey) || !query) return null;

  const endpoint = process.env.BITQUERY_GRAPHQL_URL ?? "https://streaming.bitquery.io/graphql";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        chain: context.chain,
        period: context.period,
        date: context.date,
        page: context.page ?? 0,
        pageSize: context.pageSize ?? 10,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Bitquery request failed (${response.status}) for ${context.key}.`);
  }
  const body = (await response.json()) as Record<string, unknown>;
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`Bitquery returned errors for ${context.key}: ${JSON.stringify(body.errors)}`);
  }
  return normalizeExternalPayload(context, body.data ?? body);
}

export async function fetchEigenphiDashboardPayload(
  context: EigenphiDashboardProviderContext,
  firestoreFetcher: ProviderFetcher,
): Promise<Record<string, unknown>> {
  const attempts: ProviderAttempt[] = [];
  const cached = readCache(context);
  if (cached && isFreshCache(cached) && isUsablePayload(cached.payload)) {
    return withProviderMeta(cached.payload, "local-cache", "fresh");
  }

  const providers: Array<[string, ProviderFetcher]> = [
    ["mysql-market-events", () => fetchDatabaseMarketDataPayload(context)],
  ];
  if (onchainMarketDataFallbackEnabled()) {
    providers.push(["onchain-market-events", () => fetchOnchainDashboardPayload(context)]);
  } else {
    providers.push(["onchain-market-events", async () => null]);
  }
  providers.push(
    ["bitquery", () => fetchBitqueryPayload(context)],
    ["dune", () => fetchDunePayload(context)],
  );
  if (process.env.EIGENPHI_FIRESTORE_FALLBACK === "1") {
    providers.push(["eigenphi-firestore", firestoreFetcher]);
  }

  for (const [provider, fetcher] of providers) {
    try {
      const payload = await withTimeout(fetcher(), providerTimeoutMs(), provider);
      if (!payload) {
        attempts.push({ provider, error: "not configured" });
        continue;
      }
      if (isUsablePayload(payload)) {
        writeCache(context, payload);
        return withProviderMeta(payload, provider);
      }
      attempts.push({
        provider,
        error: typeof payload.error === "string" ? payload.error : "provider returned ok:false",
      });
    } catch (error) {
      attempts.push({
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (cached && isUsablePayload(cached.payload)) {
    return withProviderMeta(cached.payload, "local-cache", "stale");
  }

  return sourceUnavailablePayload(context, attempts);
}

export function eigenphiDashboardProviderSummary(): Record<string, unknown> {
  return {
    cacheDir: providerCacheDir(),
    cacheTtlMs: providerCacheTtlMs(),
    databaseConfigured: marketDataDatabaseConfigured(),
    primary: onchainDashboardProviderSummary(),
    onchainFallbackEnabled: onchainMarketDataFallbackEnabled(),
    bitqueryConfigured: hasRealValue(process.env.BITQUERY_API_KEY),
    duneConfigured: hasRealValue(process.env.DUNE_API_KEY),
    firestoreFallback: process.env.EIGENPHI_FIRESTORE_FALLBACK === "1",
  };
}
