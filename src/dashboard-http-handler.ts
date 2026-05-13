import { existsSync, readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { createClient } from "redis";

type JsonResponder = (
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
) => void;

type TextResponder = (
  res: ServerResponse,
  statusCode: number,
  body: string,
  contentType?: string,
) => void;

type DashboardRunPayload = Record<string, unknown>;
type DashboardChainLike = { key: string };
type DashboardCliActionSpec = {
  action?: unknown;
  chain?: unknown;
  market?: unknown;
  args?: unknown;
};

type DashboardSnapshotPeriod = "1" | "7" | "30";

export type DashboardApiHandler = ((
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => Promise<void>) & {
  warmSnapshots: () => Promise<void>;
};

export type DashboardApiHandlerDeps = {
  activateLicense: (payload: Record<string, unknown>) => Promise<unknown>;
  buildCliActionSpec: (payload: DashboardRunPayload) => DashboardCliActionSpec;
  buildSummary: (entries: Record<string, unknown>[]) => Record<string, unknown>;
  dashboardConfig: () => Record<string, unknown>;
  historyFilePath: () => string;
  dashboardLiveStateFilePath: () => string;
  dashboardSettingsFilePath: () => string;
  executeCliAction: (
    payload: DashboardRunPayload,
    io?: {
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
    },
  ) => Promise<Record<string, unknown>>;
  fetchEigenphiLatestLiquidationPage: (payload: {
    chain: string;
    date?: string;
    page: number;
    pageSize: number;
  }) => Promise<unknown>;
  fetchEigenphiFlashloanOverview: (
    chain: string,
    period: DashboardSnapshotPeriod,
  ) => Promise<unknown>;
  fetchEigenphiLiquidationLeaderboard: (
    chain: string,
    period: DashboardSnapshotPeriod,
  ) => Promise<unknown>;
  fetchEigenphiLiquidationOverview: (
    chain: string,
    period: DashboardSnapshotPeriod,
  ) => Promise<unknown>;
  fetchMarketDataIndexStatus: () => unknown | Promise<unknown>;
  fetchMorphoBlueEthereumDashboardSnapshot: (payload: {
    force: boolean;
  }) => Promise<unknown>;
  fetchMorphoBlueBaseDashboardSnapshot: (payload: {
    force: boolean;
  }) => Promise<unknown>;
  fetchQuickNodeUsage: () => Promise<unknown>;
  fetchUserRpcUsage: () => Promise<unknown>;
  fetchPublicLiquidationFeed: (chain: string | null) => Promise<unknown>;
  scanBscTailProtocol: (payload: {
    protocolKey?: string;
    lookbackBlocks?: number;
    chunkSize?: number;
    limit?: number;
    nearLiquidityUsd?: number;
  }) => Promise<unknown>;
  fetchLiquidationQueueStatus: (chain: string | null, market: string | null) => Promise<unknown>;
  reportLiquidationQueueEvent: (payload: Record<string, unknown>) => Promise<unknown>;
  fetchTxGraph: (payload: {
    txHash: string | null;
    chain: string | null;
    rpcUrl: string | null;
  }) => Promise<unknown>;
  json: JsonResponder;
  liveStatePatchForResult: (result: Record<string, unknown>) => unknown;
  licenseStatus: (token: string | null) => Promise<unknown>;
  loadDashboardLiveState: () => unknown;
  loadDashboardSettings: () => unknown;
  parseOptionalString: (value: unknown) => string | undefined;
  readBody: (req: IncomingMessage) => Promise<string>;
  recentEntries: (limit: number, onlyBroadcast: boolean) => Record<string, unknown>[];
  requireLicensedFeature: (token: string | null, feature: string) => Promise<unknown>;
  saveDashboardLiveState: (patch: unknown) => void;
  saveDashboardSettings: (payload: Record<string, unknown>) => unknown;
  strategyMarketsSummary: () => unknown;
  streamArbitrageLoop: (
    payload: DashboardRunPayload,
    push: (payload: unknown) => void,
    isClosed: () => boolean,
  ) => Promise<void>;
  streamAutoExecutionLoop: (
    payload: DashboardRunPayload,
    push: (payload: unknown) => void,
    isClosed: () => boolean,
  ) => Promise<void>;
  supportedChains: () => DashboardChainLike[];
  truthy: (value: unknown) => boolean;
  walletSnapshotForChain: (chain: DashboardChainLike, options?: { force?: boolean }) => Promise<unknown>;
};

type DashboardHtmlResponderDeps = {
  html: string;
  text: TextResponder;
};

type DashboardStaticAssetResponderDeps = {
  json: JsonResponder;
  cwd?: string;
};

type OverviewSnapshotCacheEntry = {
  expiresAt: number;
  staleUntil: number;
  payload: Record<string, unknown>;
};

const OVERVIEW_SNAPSHOT_NEWS_URL = "https://news.supermtnode.io/api/news?limit=5";
let overviewSnapshotRedisClient: ReturnType<typeof createClient> | null = null;
let overviewSnapshotRedisConnect: Promise<ReturnType<typeof createClient> | null> | null = null;

function overviewSnapshotTtlMs(): number {
  const configured = Number(process.env.DASHBOARD_OVERVIEW_SNAPSHOT_TTL_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : 5 * 60_000;
}

function overviewSnapshotStaleMs(): number {
  const configured = Number(process.env.DASHBOARD_OVERVIEW_STALE_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : 30 * 60_000;
}

function overviewSnapshotPeriod(value: unknown): "1" | "7" | "30" {
  return value === "1" || value === "30" ? value : "7";
}

function overviewSnapshotSourceTimeoutMs(): number {
  const configured = Number(process.env.DASHBOARD_OVERVIEW_SOURCE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 8_000;
}

async function withOverviewSnapshotTimeout<T>(label: string, task: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} snapshot source timed out.`));
        }, overviewSnapshotSourceTimeoutMs());
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function overviewSnapshotRedis(): Promise<ReturnType<typeof createClient> | null> {
  const url =
    process.env.DASHBOARD_OVERVIEW_REDIS_URL ??
    process.env.DASHBOARD_REDIS_URL ??
    process.env.REDIS_URL;
  if (!url) return null;
  if (overviewSnapshotRedisClient?.isOpen) return overviewSnapshotRedisClient;
  if (overviewSnapshotRedisConnect) return overviewSnapshotRedisConnect;
  overviewSnapshotRedisConnect = (async () => {
    try {
      const client = createClient({ url });
      client.on("error", () => {
        // Redis is an optimization for the dashboard snapshot. Fall back to memory cache.
      });
      await client.connect();
      overviewSnapshotRedisClient = client;
      return client;
    } catch {
      overviewSnapshotRedisClient = null;
      return null;
    } finally {
      overviewSnapshotRedisConnect = null;
    }
  })();
  return overviewSnapshotRedisConnect;
}

async function readOverviewSnapshotCache(
  memoryCache: Map<string, OverviewSnapshotCacheEntry>,
  key: string,
  options?: { allowStale?: boolean },
): Promise<{
  backend: "redis" | "server-memory";
  payload: Record<string, unknown>;
  stale: boolean;
} | null> {
  const now = Date.now();
  const allowStale = Boolean(options?.allowStale);
  const redis = await overviewSnapshotRedis();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) {
        const payload = JSON.parse(raw) as Record<string, unknown>;
        const expiresAt = Date.parse(String(payload.expiresAt ?? ""));
        const stale = Number.isFinite(expiresAt) ? expiresAt <= now : false;
        if (stale && !allowStale) return null;
        return {
          backend: "redis",
          payload,
          stale,
        };
      }
    } catch {
      // Fall through to process memory.
    }
  }

  const cached = memoryCache.get(key);
  if (cached && (cached.expiresAt > now || (allowStale && cached.staleUntil > now))) {
    return {
      backend: "server-memory",
      payload: cached.payload,
      stale: cached.expiresAt <= now,
    };
  }
  return null;
}

async function writeOverviewSnapshotCache(
  memoryCache: Map<string, OverviewSnapshotCacheEntry>,
  key: string,
  payload: Record<string, unknown>,
  ttlMs: number,
): Promise<void> {
  const staleMs = overviewSnapshotStaleMs();
  memoryCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    staleUntil: Date.now() + ttlMs + staleMs,
    payload,
  });
  const redis = await overviewSnapshotRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(payload), {
      EX: Math.max(1, Math.ceil((ttlMs + staleMs) / 1000)),
    });
  } catch {
    // Memory cache already holds the snapshot.
  }
}

async function fetchStrategyNewsSnapshot(): Promise<unknown> {
  try {
    const response = await fetch(OVERVIEW_SNAPSHOT_NEWS_URL, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`News request failed (${response.status}).`);
    }
    return await response.json();
  } catch (error) {
    return {
      ok: false,
      rows: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function settledSnapshotValue<T>(
  result: PromiseSettledResult<T>,
  fallback: Record<string, unknown>,
): T | Record<string, unknown> {
  if (result.status === "fulfilled") return result.value;
  return {
    ...fallback,
    ok: false,
    sourceUnavailable: true,
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  };
}

function withDashboardCacheMeta(
  payload: unknown,
  cache: Record<string, unknown>,
): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    return {
      ...record,
      cache: {
        ...((record.cache as Record<string, unknown> | undefined) ?? {}),
        ...cache,
      },
    };
  }
  return {
    ok: true,
    data: payload,
    cache,
  };
}

// Route table for the dashboard HTTP surface. The caller injects all side effects.
export function createDashboardApiHandler(deps: DashboardApiHandlerDeps): DashboardApiHandler {
  const {
    activateLicense,
    buildCliActionSpec,
    buildSummary,
    dashboardConfig,
    historyFilePath,
    dashboardLiveStateFilePath,
    dashboardSettingsFilePath,
    executeCliAction,
    fetchEigenphiFlashloanOverview,
    fetchEigenphiLatestLiquidationPage,
    fetchEigenphiLiquidationLeaderboard,
    fetchEigenphiLiquidationOverview,
    fetchMarketDataIndexStatus,
    fetchMorphoBlueEthereumDashboardSnapshot,
    fetchMorphoBlueBaseDashboardSnapshot,
    fetchQuickNodeUsage,
    fetchUserRpcUsage,
    fetchPublicLiquidationFeed,
    scanBscTailProtocol,
    fetchLiquidationQueueStatus,
    reportLiquidationQueueEvent,
    fetchTxGraph,
    json,
    liveStatePatchForResult,
    licenseStatus,
    loadDashboardLiveState,
    loadDashboardSettings,
    parseOptionalString,
    readBody,
    recentEntries,
    requireLicensedFeature,
    saveDashboardLiveState,
    saveDashboardSettings,
    strategyMarketsSummary,
    streamArbitrageLoop,
    streamAutoExecutionLoop,
    supportedChains,
    truthy,
    walletSnapshotForChain,
  } = deps;

  const overviewSnapshotCache = new Map<string, OverviewSnapshotCacheEntry>();
  const overviewSnapshotRefreshes = new Map<string, Promise<void>>();
  const dashboardSnapshotCache = new Map<string, OverviewSnapshotCacheEntry>();
  const dashboardSnapshotRefreshes = new Map<string, Promise<void>>();

  const tokenFromRequest = (req: IncomingMessage): string | null =>
    parseOptionalString(req.headers?.authorization) ??
    parseOptionalString(req.headers?.["x-license-token"]) ??
    null;

  const enforceFeature = async (
    req: IncomingMessage,
    res: ServerResponse,
    feature: string,
  ): Promise<boolean> => {
    try {
      await requireLicensedFeature(tokenFromRequest(req), feature);
      return true;
    } catch (error) {
      json(res, 403, {
        ok: false,
        licensed: false,
        feature,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  const buildOverviewSnapshot = async (
    period: "1" | "7" | "30",
    flashloanPeriod: "1" | "7" | "30",
  ): Promise<Record<string, unknown>> => {
    const generatedAtMs = Date.now();
    const [
      liquidationOverview,
      flashloanOverview,
      morphoBlueMarkets,
      strategyNews,
    ] = await Promise.allSettled([
      withOverviewSnapshotTimeout(
        "liquidation-overview",
        fetchEigenphiLiquidationOverview("ethereum", period),
      ),
      withOverviewSnapshotTimeout(
        "flashloan-overview",
        fetchEigenphiFlashloanOverview("ethereum", flashloanPeriod),
      ),
      withOverviewSnapshotTimeout(
        "morpho-blue",
        fetchMorphoBlueEthereumDashboardSnapshot({ force: false }),
      ),
      withOverviewSnapshotTimeout("strategy-news", fetchStrategyNewsSnapshot()),
    ]);

    const ttlMs = overviewSnapshotTtlMs();
    return {
      ok: true,
      source: "overview-snapshot",
      generatedAt: new Date(generatedAtMs).toISOString(),
      expiresAt: new Date(generatedAtMs + ttlMs).toISOString(),
      cache: {
        hit: false,
        backend: "server-cache",
        ttlMs,
      },
      period,
      flashloanPeriod,
      data: {
        eigenphiOverview: settledSnapshotValue(liquidationOverview, {
          chain: "ethereum",
          period,
          summary: null,
        }),
        eigenphiFlashloanOverview: settledSnapshotValue(flashloanOverview, {
          chain: "ethereum",
          period: flashloanPeriod,
          summary: null,
          latest: { rows: [] },
        }),
        morphoBlueMarkets: settledSnapshotValue(morphoBlueMarkets, {
          chain: "ethereum",
          markets: [],
        }),
        strategyNews: settledSnapshotValue(strategyNews, {
          rows: [],
        }),
      },
    };
  };

  const refreshOverviewSnapshot = (
    cacheKey: string,
    period: "1" | "7" | "30",
    flashloanPeriod: "1" | "7" | "30",
  ): Promise<void> => {
    const inflight = overviewSnapshotRefreshes.get(cacheKey);
    if (inflight) return inflight;
    const refresh = (async () => {
      const payload = await buildOverviewSnapshot(period, flashloanPeriod);
      await writeOverviewSnapshotCache(
        overviewSnapshotCache,
        cacheKey,
        payload,
        overviewSnapshotTtlMs(),
      );
    })().catch(() => {
      // Keep serving the stale snapshot; the next request can retry the refresh.
    }).finally(() => {
      overviewSnapshotRefreshes.delete(cacheKey);
    });
    overviewSnapshotRefreshes.set(cacheKey, refresh);
    return refresh;
  };

  const refreshDashboardSnapshot = (
    cacheKey: string,
    buildPayload: () => Promise<unknown>,
  ): Promise<void> => {
    const inflight = dashboardSnapshotRefreshes.get(cacheKey);
    if (inflight) return inflight;
    const refresh = (async () => {
      const payload = withDashboardCacheMeta(await buildPayload(), {
        hit: false,
        backend: "server-cache",
        ttlMs: overviewSnapshotTtlMs(),
        generatedAt: new Date().toISOString(),
      });
      await writeOverviewSnapshotCache(
        dashboardSnapshotCache,
        cacheKey,
        payload,
        overviewSnapshotTtlMs(),
      );
    })().catch(() => {
      // Keep serving stale cached data; the next request can retry.
    }).finally(() => {
      dashboardSnapshotRefreshes.delete(cacheKey);
    });
    dashboardSnapshotRefreshes.set(cacheKey, refresh);
    return refresh;
  };

  const serveCachedDashboardSnapshot = async (
    res: ServerResponse,
    url: URL,
    cacheKey: string,
    buildPayload: () => Promise<unknown>,
  ): Promise<void> => {
    const ttlMs = overviewSnapshotTtlMs();
    const cached = truthy(url.searchParams.get("refresh"))
      ? null
      : await readOverviewSnapshotCache(dashboardSnapshotCache, cacheKey, { allowStale: true });
    if (cached) {
      const refreshing = cached.stale;
      if (refreshing) {
        void refreshDashboardSnapshot(cacheKey, buildPayload);
      }
      json(
        res,
        200,
        withDashboardCacheMeta(cached.payload, {
          hit: true,
          backend: cached.backend,
          ttlMs,
          stale: cached.stale,
          refreshing,
        }),
      );
      return;
    }

    try {
      const payload = withDashboardCacheMeta(await buildPayload(), {
        hit: false,
        backend: "server-cache",
        ttlMs,
        generatedAt: new Date().toISOString(),
      });
      await writeOverviewSnapshotCache(dashboardSnapshotCache, cacheKey, payload, ttlMs);
      json(res, 200, payload);
    } catch (error) {
      json(res, 200, {
        ok: false,
        sourceUnavailable: true,
        cache: {
          hit: false,
          backend: "server-cache",
          ttlMs,
        },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const warmSnapshots = async (): Promise<void> => {
    const periods: DashboardSnapshotPeriod[] = ["1", "7", "30"];
    const tasks: Promise<void>[] = [
      refreshOverviewSnapshot("overview:1:flashloan:1", "1", "1"),
      refreshDashboardSnapshot(
        "market-data:latest-liquidation:ethereum:all:0:10",
        () => fetchEigenphiLatestLiquidationPage({
          chain: "ethereum",
          page: 0,
          pageSize: 10,
        }),
      ),
    ];

    for (const period of periods) {
      tasks.push(
        refreshDashboardSnapshot(
          `market-data:liquidation-overview:ethereum:${period}`,
          () => fetchEigenphiLiquidationOverview("ethereum", period),
        ),
        refreshDashboardSnapshot(
          `market-data:liquidation-leaderboard:ethereum:${period}`,
          () => fetchEigenphiLiquidationLeaderboard("ethereum", period),
        ),
        refreshDashboardSnapshot(
          `market-data:flashloan-overview:ethereum:${period}`,
          () => fetchEigenphiFlashloanOverview("ethereum", period),
        ),
      );
    }

    await Promise.allSettled(tasks);
  };

  const serveApi = async function serveApi(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    if (url.pathname === "/api/health") {
      json(res, 200, {
        ok: true,
        historyFile: historyFilePath(),
        liveStateFile: dashboardLiveStateFilePath(),
        generatedAt: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === "/api/config") {
      json(res, 200, {
        ...dashboardConfig(),
        strategy: strategyMarketsSummary(),
      });
      return;
    }

    if (url.pathname === "/api/strategy-markets") {
      json(res, 200, strategyMarketsSummary());
      return;
    }

    if (url.pathname === "/api/overview-snapshot") {
      const period = overviewSnapshotPeriod(parseOptionalString(url.searchParams.get("period")));
      const flashloanPeriod = overviewSnapshotPeriod(
        parseOptionalString(url.searchParams.get("flashloanPeriod")),
      );
      const cacheKey = `overview:${period}:flashloan:${flashloanPeriod}`;
      const ttlMs = overviewSnapshotTtlMs();
      const cached = truthy(url.searchParams.get("refresh"))
        ? null
        : await readOverviewSnapshotCache(overviewSnapshotCache, cacheKey, { allowStale: true });
      if (cached) {
        const refreshing = cached.stale;
        if (refreshing) {
          void refreshOverviewSnapshot(cacheKey, period, flashloanPeriod);
        }
        json(res, 200, {
          ...cached.payload,
          cache: {
            ...((cached.payload.cache as Record<string, unknown> | undefined) ?? {}),
            hit: true,
            backend: cached.backend,
            stale: cached.stale,
            refreshing,
          },
        });
        return;
      }

      try {
        const payload = await buildOverviewSnapshot(period, flashloanPeriod);
        await writeOverviewSnapshotCache(overviewSnapshotCache, cacheKey, payload, ttlMs);
        json(res, 200, payload);
      } catch (error) {
        json(res, 502, {
          ok: false,
          source: "overview-snapshot",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/bsc-tail/scan") {
      try {
        const blocks = Number(url.searchParams.get("blocks"));
        const chunk = Number(url.searchParams.get("chunk"));
        const limit = Number(url.searchParams.get("limit"));
        const nearUsd = Number(url.searchParams.get("nearUsd"));
        json(res, 200, await scanBscTailProtocol({
          protocolKey: parseOptionalString(url.searchParams.get("protocol")),
          lookbackBlocks: Number.isFinite(blocks) && blocks > 0 ? blocks : undefined,
          chunkSize: Number.isFinite(chunk) && chunk > 0 ? chunk : undefined,
          limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
          nearLiquidityUsd: Number.isFinite(nearUsd) && nearUsd > 0 ? nearUsd : undefined,
        }));
      } catch (error) {
        json(res, 502, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/morpho-blue/markets") {
      const chain = parseOptionalString(url.searchParams.get("chain")) === "base" ? "base" : "ethereum";
      await serveCachedDashboardSnapshot(
        res,
        url,
        `morpho-blue:markets:${chain}`,
        () => chain === "base"
          ? fetchMorphoBlueBaseDashboardSnapshot({ force: false })
          : fetchMorphoBlueEthereumDashboardSnapshot({ force: false }),
      );
      return;
    }

    if (url.pathname === "/api/settings") {
      if (req.method === "GET") {
        json(res, 200, {
          file: dashboardSettingsFilePath(),
          settings: loadDashboardSettings(),
        });
        return;
      }

      if (req.method === "POST") {
        try {
          const body = await readBody(req);
          const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};
          const settings = saveDashboardSettings(payload);
          json(res, 200, {
            ok: true,
            file: dashboardSettingsFilePath(),
            settings,
          });
        } catch (error) {
          json(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
    }

    if (url.pathname === "/api/license/activate" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};
        json(res, 200, await activateLicense(payload));
      } catch (error) {
        json(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/license/status") {
      try {
        json(res, 200, await licenseStatus(tokenFromRequest(req)));
      } catch (error) {
        json(res, 401, {
          ok: false,
          licensed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/wallet") {
      const chainParam = parseOptionalString(url.searchParams.get("chain"));
      const force = truthy(url.searchParams.get("force"));
      if (chainParam) {
        const chain = supportedChains().find((item) => item.key === chainParam);
        if (!chain) {
          json(res, 400, { ok: false, error: `Unsupported chain: ${chainParam}` });
          return;
        }
        json(res, 200, {
          ok: true,
          wallet: await walletSnapshotForChain(chain, { force }),
        });
        return;
      }

      const wallets = await Promise.all(
        supportedChains().map((chain) => walletSnapshotForChain(chain, { force })),
      );
      json(res, 200, {
        ok: true,
        wallets,
      });
      return;
    }

    if (url.pathname === "/api/quicknode/usage") {
      json(res, 200, await fetchQuickNodeUsage());
      return;
    }

    if (url.pathname === "/api/rpc/usage") {
      json(res, 200, await fetchUserRpcUsage());
      return;
    }

    if (url.pathname === "/api/public-liquidation-feed") {
      try {
        json(res, 200, await fetchPublicLiquidationFeed(url.searchParams.get("chain")));
      } catch (error) {
        json(res, 502, {
          ok: false,
          source: "public-feed",
          chain: parseOptionalString(url.searchParams.get("chain")) ?? "ethereum",
          error: error instanceof Error ? error.message : String(error),
          targets: [],
          queue: {
            enabled: false,
            status: "error",
          },
        });
      }
      return;
    }

    if (url.pathname === "/api/liquidation-queue/status") {
      try {
        json(res, 200, await fetchLiquidationQueueStatus(
          url.searchParams.get("chain"),
          url.searchParams.get("market"),
        ));
      } catch (error) {
        json(res, 502, {
          ok: false,
          source: "local",
          chain: parseOptionalString(url.searchParams.get("chain")) ?? "ethereum",
          market: parseOptionalString(url.searchParams.get("market")) ?? "",
          eligible: false,
          reason: error instanceof Error ? error.message : String(error),
          queue: {
            enabled: false,
            status: "error",
          },
        });
      }
      return;
    }

    if (url.pathname === "/api/liquidation-queue/event" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};
        json(res, 200, await reportLiquidationQueueEvent(payload));
      } catch (error) {
        json(res, 502, {
          ok: false,
          source: "local",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/live-state") {
      json(res, 200, {
        file: dashboardLiveStateFilePath(),
        state: loadDashboardLiveState(),
      });
      return;
    }

    if (url.pathname === "/api/tx-graph") {
      try {
        json(
          res,
          200,
          await fetchTxGraph({
            txHash: url.searchParams.get("txHash"),
            chain: url.searchParams.get("chain"),
            rpcUrl: url.searchParams.get("rpcUrl"),
          }),
        );
      } catch (error) {
        json(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/market-data/index-status") {
      json(res, 200, await fetchMarketDataIndexStatus());
      return;
    }

    if (
      url.pathname === "/api/market-data/liquidation-overview" ||
      url.pathname === "/api/eigenphi/liquidation-overview"
    ) {
      if (!(await enforceFeature(req, res, "liquidation"))) return;
      const requestedChain = parseOptionalString(url.searchParams.get("chain")) ?? "ethereum";
      const chain = requestedChain.toLowerCase();
      const requestedPeriod = parseOptionalString(url.searchParams.get("period")) ?? "7";
      const period = ["1", "7", "30"].includes(requestedPeriod)
        ? (requestedPeriod as "1" | "7" | "30")
        : "7";

      if (chain !== "ethereum") {
        json(res, 400, {
          ok: false,
          error: `Unsupported market-data overview chain: ${requestedChain}`,
        });
        return;
      }

      await serveCachedDashboardSnapshot(
        res,
        url,
        `market-data:liquidation-overview:${chain}:${period}`,
        () => fetchEigenphiLiquidationOverview(chain, period),
      );
      return;
    }

    if (
      url.pathname === "/api/market-data/liquidation-leaderboard" ||
      url.pathname === "/api/eigenphi/liquidation-leaderboard"
    ) {
      if (!(await enforceFeature(req, res, "liquidation"))) return;
      const requestedChain = parseOptionalString(url.searchParams.get("chain")) ?? "ethereum";
      const chain = requestedChain.toLowerCase();
      const requestedPeriod = parseOptionalString(url.searchParams.get("period")) ?? "7";
      const period = ["1", "7", "30"].includes(requestedPeriod)
        ? (requestedPeriod as "1" | "7" | "30")
        : "7";

      if (chain !== "ethereum") {
        json(res, 400, {
          ok: false,
          error: `Unsupported market-data leaderboard chain: ${requestedChain}`,
        });
        return;
      }

      await serveCachedDashboardSnapshot(
        res,
        url,
        `market-data:liquidation-leaderboard:${chain}:${period}`,
        () => fetchEigenphiLiquidationLeaderboard(chain, period),
      );
      return;
    }

    if (
      url.pathname === "/api/market-data/flashloan-overview" ||
      url.pathname === "/api/eigenphi/flashloan-overview"
    ) {
      if (!(await enforceFeature(req, res, "flashloan"))) return;
      const requestedChain = parseOptionalString(url.searchParams.get("chain")) ?? "ethereum";
      const chain = requestedChain.toLowerCase();
      const requestedPeriod = parseOptionalString(url.searchParams.get("period")) ?? "7";
      const period = ["1", "7", "30"].includes(requestedPeriod)
        ? (requestedPeriod as "1" | "7" | "30")
        : "7";

      if (chain !== "ethereum") {
        json(res, 400, {
          ok: false,
          error: `Unsupported market-data flashloan chain: ${requestedChain}`,
        });
        return;
      }

      await serveCachedDashboardSnapshot(
        res,
        url,
        `market-data:flashloan-overview:${chain}:${period}`,
        () => fetchEigenphiFlashloanOverview(chain, period),
      );
      return;
    }

    if (
      url.pathname === "/api/market-data/latest-liquidation" ||
      url.pathname === "/api/eigenphi/latest-liquidation"
    ) {
      if (!(await enforceFeature(req, res, "liquidation"))) return;
      const requestedChain = parseOptionalString(url.searchParams.get("chain")) ?? "ethereum";
      const chain = requestedChain.toLowerCase();
      const date = parseOptionalString(url.searchParams.get("date"));
      const page = Number(url.searchParams.get("page") ?? "0");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "10");

      if (chain !== "ethereum") {
        json(res, 400, {
          ok: false,
          error: `Unsupported market-data latest liquidation chain: ${requestedChain}`,
        });
        return;
      }

      await serveCachedDashboardSnapshot(
        res,
        url,
        `market-data:latest-liquidation:${chain}:${date ?? "all"}:${page}:${pageSize}`,
        () => fetchEigenphiLatestLiquidationPage({
          chain,
          date,
          page,
          pageSize,
        }),
      );
      return;
    }

    if (url.pathname === "/api/history") {
      const limit = Number(url.searchParams.get("limit") ?? "25");
      const includeSimulation =
        url.searchParams.get("includeSimulation") === "1" ||
        url.searchParams.get("includeSimulation") === "true";
      const safeLimit = Number.isFinite(limit)
        ? Math.max(1, Math.min(200, Math.trunc(limit)))
        : 25;
      const entries = recentEntries(safeLimit, !includeSimulation);
      json(res, 200, {
        summary: buildSummary(entries),
        entries,
      });
      return;
    }

    if (url.pathname === "/api/run" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const payload = body ? (JSON.parse(body) as DashboardRunPayload) : {};
        const result = await executeCliAction(payload);
        try {
          saveDashboardLiveState(liveStatePatchForResult(result));
        } catch {
          // Ignore state persistence failures so the command result still returns.
        }
        json(res, 200, result);
      } catch (error) {
        json(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/run-stream" && req.method === "POST") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("connection", "keep-alive");

      const push = (payload: unknown): void => {
        res.write(`${JSON.stringify(payload)}\n`);
      };

      try {
        const body = await readBody(req);
        const payload = body ? (JSON.parse(body) as DashboardRunPayload) : {};
        const spec = buildCliActionSpec(payload);
        push({
          type: "meta",
          action: spec.action,
          chain: spec.chain,
          market: spec.market,
          args: spec.args,
        });

        const result = await executeCliAction(payload, {
          onStdout: (chunk) => push({ type: "stdout", data: chunk }),
          onStderr: (chunk) => push({ type: "stderr", data: chunk }),
        });
        try {
          saveDashboardLiveState(liveStatePatchForResult(result));
        } catch {
          // Ignore state persistence failures so the command result still returns.
        }
        push({ type: "result", data: result });
      } catch (error) {
        push({
          type: "result",
          data: {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        res.end();
      }
      return;
    }

    if (
      (url.pathname === "/api/auto-execute-stream" ||
        url.pathname === "/api/arbitrage-stream") &&
      (req.method === "POST" || req.method === "GET")
    ) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("connection", "keep-alive");
      res.flushHeaders?.();

      let closed = false;
      req.on("close", () => {
        closed = true;
      });
      res.on("close", () => {
        closed = true;
      });

      const push = (payload: unknown): void => {
        if (closed) {
          return;
        }
        try {
          res.write(`${JSON.stringify(payload)}\n`);
        } catch {
          closed = true;
        }
      };

      try {
        let parsedPayload: DashboardRunPayload = {};
        if (req.method === "GET") {
          parsedPayload = {
            chain: parseOptionalString(url.searchParams.get("chain")) ?? undefined,
            market: parseOptionalString(url.searchParams.get("market")) ?? undefined,
            lookbackBlocks:
              parseOptionalString(url.searchParams.get("lookbackBlocks")) ??
              undefined,
            limit: parseOptionalString(url.searchParams.get("limit")) ?? undefined,
            resumeFromBlock:
              parseOptionalString(url.searchParams.get("resumeFromBlock")) ??
              undefined,
            resumeChunkStart:
              parseOptionalString(url.searchParams.get("resumeChunkStart")) ??
              undefined,
            resumeChunkEnd:
              parseOptionalString(url.searchParams.get("resumeChunkEnd")) ??
              undefined,
            resumeUserOffset:
              parseOptionalString(url.searchParams.get("resumeUserOffset")) ??
              undefined,
            rpcUrl: parseOptionalString(url.searchParams.get("rpcUrl")) ?? undefined,
            contract:
              parseOptionalString(url.searchParams.get("contract")) ?? undefined,
            hfMax: parseOptionalString(url.searchParams.get("hfMax")) ?? undefined,
            allowRisky:
              parseOptionalString(url.searchParams.get("allowRisky")) ?? undefined,
            autoSwap:
              parseOptionalString(url.searchParams.get("autoSwap")) ?? undefined,
            broadcast:
              parseOptionalString(url.searchParams.get("broadcast")) ?? undefined,
            minNetProfit:
              parseOptionalString(url.searchParams.get("minNetProfit")) ?? undefined,
            token: parseOptionalString(url.searchParams.get("token")) ?? undefined,
            venues: parseOptionalString(url.searchParams.get("venues")) ?? undefined,
          };
        } else {
          const body = await readBody(req);
          parsedPayload = body ? (JSON.parse(body) as DashboardRunPayload) : {};
        }
        if (url.pathname === "/api/arbitrage-stream") {
          await streamArbitrageLoop(parsedPayload, push, () => closed);
        } else {
          await streamAutoExecutionLoop(parsedPayload, push, () => closed);
        }
        push({
          type: "result",
          data: {
            ok: true,
            action:
              url.pathname === "/api/arbitrage-stream"
                ? "arbitrage"
                : "auto-execute",
          },
        });
      } catch (error) {
        push({
          type: "result",
          data: {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        if (!closed) {
          res.end();
        }
      }
      return;
    }

    json(res, 404, { error: "Not found" });
  } as DashboardApiHandler;

  serveApi.warmSnapshots = warmSnapshots;
  return serveApi;
}

export function serveDashboardHtml(
  deps: DashboardHtmlResponderDeps,
  res: ServerResponse,
): void {
  deps.text(res, 200, deps.html, "text/html; charset=utf-8");
}

export function serveDashboardStaticAsset(
  deps: DashboardStaticAssetResponderDeps,
  res: ServerResponse,
  pathname: string,
): boolean {
  const cwd = deps.cwd ?? process.cwd();

  if (pathname === "/vendor/chart.js") {
    const assetPath = path.resolve(cwd, "node_modules", "chart.js", "dist", "chart.umd.js");
    if (!existsSync(assetPath)) {
      deps.json(res, 404, { error: "Not found" });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.end(readFileSync(assetPath));
    return true;
  }

  if (pathname === "/vendor/cytoscape.js") {
    const assetPath = path.resolve(cwd, "node_modules", "cytoscape", "dist", "cytoscape.umd.js");
    if (!existsSync(assetPath)) {
      deps.json(res, 404, { error: "Not found" });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.end(readFileSync(assetPath));
    return true;
  }

  if (pathname === "/vendor/webcola.js") {
    const assetPath = path.resolve(cwd, "node_modules", "webcola", "WebCola", "cola.js");
    if (!existsSync(assetPath)) {
      deps.json(res, 404, { error: "Not found" });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.end(readFileSync(assetPath));
    return true;
  }

  if (pathname === "/vendor/cytoscape-cola.js") {
    const assetPath = path.resolve(cwd, "node_modules", "cytoscape-cola", "cytoscape-cola.js");
    if (!existsSync(assetPath)) {
      deps.json(res, 404, { error: "Not found" });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.end(readFileSync(assetPath));
    return true;
  }

  if (pathname === "/favicon.ico") {
    const assetPath = path.resolve(cwd, "src", "img", "favicon.ico");
    if (!existsSync(assetPath)) {
      deps.json(res, 404, { error: "Not found" });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "image/x-icon");
    res.setHeader("cache-control", "no-cache");
    res.end(readFileSync(assetPath));
    return true;
  }

  if (pathname === "/manifest.webmanifest") {
    const assetPath = path.resolve(cwd, "src", "manifest.webmanifest");
    if (!existsSync(assetPath)) {
      deps.json(res, 404, { error: "Not found" });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/manifest+json; charset=utf-8");
    res.setHeader("cache-control", "no-cache");
    res.end(readFileSync(assetPath));
    return true;
  }

	  if (
	    !pathname.startsWith("/img/") &&
	    !pathname.startsWith("/chain/") &&
	    !pathname.startsWith("/cryptoimg/") &&
	    !pathname.startsWith("/font/")
	  ) {
    return false;
  }

	  const assetName = path.basename(pathname);
	  const assetDir = pathname.startsWith("/cryptoimg/")
	    ? "cryptoimg"
	    : pathname.startsWith("/chain/")
	      ? "chain"
	    : pathname.startsWith("/font/")
	      ? "font"
	      : "img";
  const assetPath = path.resolve(cwd, "src", assetDir, assetName);
  if (!existsSync(assetPath)) {
    deps.json(res, 404, { error: "Not found" });
    return true;
  }

  const ext = path.extname(assetPath).toLowerCase();
  const contentType =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".otf"
            ? "font/otf"
            : "application/octet-stream";

  res.statusCode = 200;
  res.setHeader("content-type", contentType);
  if (assetName.startsWith("SuperARB_")) {
    res.setHeader("cache-control", "no-cache");
  }
  res.end(readFileSync(assetPath));
  return true;
}
