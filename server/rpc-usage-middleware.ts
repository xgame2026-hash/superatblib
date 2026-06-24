import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";

const ENV_FILE = resolve(process.cwd(), ".env");

type ChainKey = "ethereum" | "bnb" | "arbitrum";

type RpcUsageMetric = {
  chain: ChainKey;
  rpcConfigured: boolean;
  requestCount: number | null;
  requestLimit: number | null;
  remainingRequests: number | null;
  creditBurnPerSecond: number | null;
  tokenExpiresAt?: string;
  status: "ok" | "missing_rpc" | "missing_credentials" | "unmatched" | "error";
  message?: string;
};

type SuperMtNodeEndpoint = {
  chain?: unknown;
  endpointSlug?: unknown;
  endpoint_slug?: unknown;
  httpUrl?: unknown;
  http_url?: unknown;
  requestCount?: unknown;
  request_count?: unknown;
  requestLimit?: unknown;
  request_limit?: unknown;
  creditBurnPerSecond?: unknown;
  credit_burn_per_second?: unknown;
};

type EndpointFetchResult = {
  endpoints: SuperMtNodeEndpoint[];
  sourceUrl: string;
};

const chainEnvKeys: Record<ChainKey, string> = {
  ethereum: "ETHEREUM_RPC_URL",
  bnb: "BNB_RPC_URL",
  arbitrum: "ARBITRUM_RPC_URL",
};

const superMtNodeChainKeys: Record<ChainKey, string> = {
  ethereum: "eth",
  bnb: "bnb",
  arbitrum: "arb",
};

export function handleRpcUsageRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/api/rpc/usage")) return false;

  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }

  fetchRpcUsage(req)
    .then((payload) => json(res, 200, payload))
    .catch((error: unknown) => json(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) }));

  return true;
}

async function fetchRpcUsage(req: IncomingMessage) {
  const env = readEnv();
  const token = env.SUPERMTNODE_APP_TOKEN?.trim();
  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
  const metrics = initialMetrics(env);
  let licenseError = "";

  if (token) {
    const tokenExpiry = jwtExpiry(token);
    if (tokenExpiry && tokenExpiry.getTime() <= Date.now()) {
      const message = `SUPERMTNODE_APP_TOKEN expired at ${tokenExpiry.toISOString()}.`;
      for (const chain of chainKeys()) {
        if (metrics[chain].rpcConfigured) {
          metrics[chain] = emptyMetric(chain, env, "error", message);
        }
      }
      return { ok: false, source: "supermtnode", metrics, error: message };
    }

    try {
      const result = await fetchSuperMtNodeEndpoints(env, token);
      applyEndpointMetrics(metrics, env, result.endpoints);
      return { ok: true, source: "supermtnode", sourceUrl: result.sourceUrl, metrics };
    } catch (error) {
      licenseError = error instanceof Error ? error.message : String(error);
    }
  }

  if (authCode) {
    try {
      const result = await fetchSuperMtNodeEndpointsByLicense(env, authCode);
      applyEndpointMetrics(metrics, env, result.endpoints);
      return { ok: true, source: "supermtnode-license", sourceUrl: result.sourceUrl, metrics };
    } catch (error) {
      licenseError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!token) {
    const message = licenseError || "SUPERMTNODE_APP_TOKEN is not configured.";
    for (const chain of chainKeys()) {
      if (metrics[chain].rpcConfigured) {
        metrics[chain] = emptyMetric(chain, env, "missing_credentials", message);
      }
    }
    return { ok: false, source: authCode ? "supermtnode-license" : "supermtnode", metrics, error: message };
  }

  for (const chain of chainKeys()) {
    if (metrics[chain].rpcConfigured) {
      metrics[chain] = emptyMetric(chain, env, "error", licenseError);
    }
  }
  return { ok: false, source: "supermtnode", metrics, error: licenseError };
}

function applyEndpointMetrics(metrics: Record<ChainKey, RpcUsageMetric>, env: Record<string, string>, endpoints: SuperMtNodeEndpoint[]): void {
  for (const chain of chainKeys()) {
    const rpcUrl = env[chainEnvKeys[chain]]?.trim();
    if (!rpcUrl) continue;
    const endpoint = endpoints.find((item) => matchEndpoint(item, chain, rpcUrl));
    const sameChainCount = endpoints.filter((item) => matchChain(item, chain)).length;
    metrics[chain] = endpoint
      ? buildMetric(chain, env, endpoint)
      : emptyMetric(
          chain,
          env,
          "unmatched",
          sameChainCount > 0
            ? "Configured RPC URL did not exactly match this token/license endpoint; usage display was stopped to avoid cross-endpoint data."
            : "Configured RPC URL was not found in SuperMT Node rpc_endpoints.",
        );
  }
}

function jwtExpiry(token: string): Date | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof parsed.exp === "number" && Number.isFinite(parsed.exp) ? new Date(parsed.exp * 1000) : null;
  } catch {
    return null;
  }
}

function initialMetrics(env: Record<string, string>): Record<ChainKey, RpcUsageMetric> {
  return {
    ethereum: emptyMetric("ethereum", env, env.ETHEREUM_RPC_URL?.trim() ? "unmatched" : "missing_rpc"),
    bnb: emptyMetric("bnb", env, env.BNB_RPC_URL?.trim() ? "unmatched" : "missing_rpc"),
    arbitrum: emptyMetric("arbitrum", env, env.ARBITRUM_RPC_URL?.trim() ? "unmatched" : "missing_rpc"),
  };
}

function emptyMetric(chain: ChainKey, env: Record<string, string>, status: RpcUsageMetric["status"], message?: string): RpcUsageMetric {
  return {
    chain,
    rpcConfigured: Boolean(env[chainEnvKeys[chain]]?.trim()),
    requestCount: null,
    requestLimit: null,
    remainingRequests: null,
    creditBurnPerSecond: null,
    status,
    message,
  };
}

function buildMetric(chain: ChainKey, env: Record<string, string>, endpoint: SuperMtNodeEndpoint): RpcUsageMetric {
  const requestCount = parseUsageCount(endpointValue(endpoint, "requestCount", "request_count"));
  const requestLimit = parseUsageCount(endpointValue(endpoint, "requestLimit", "request_limit"));
  const creditBurnPerSecond = parseUsageCount(endpointValue(endpoint, "creditBurnPerSecond", "credit_burn_per_second"));
  const tokenExpiry = jwtExpiry(env.SUPERMTNODE_APP_TOKEN?.trim() ?? "");
  return {
    chain,
    rpcConfigured: Boolean(env[chainEnvKeys[chain]]?.trim()),
    requestCount,
    requestLimit,
    remainingRequests: requestCount !== null && requestLimit !== null && requestLimit > 0 ? Math.max(0, requestLimit - requestCount) : null,
    creditBurnPerSecond,
    ...(tokenExpiry ? { tokenExpiresAt: tokenExpiry.toISOString() } : {}),
    status: "ok",
  };
}

async function fetchSuperMtNodeEndpoints(env: Record<string, string>, token: string): Promise<EndpointFetchResult> {
  const apiBaseUrls = superMtNodeApiBaseUrls(env);
  const errors: string[] = [];
  for (const apiBaseUrl of apiBaseUrls) {
    try {
      return { endpoints: await fetchSuperMtNodeEndpointsFrom(apiBaseUrl, token), sourceUrl: apiBaseUrl };
    } catch (error) {
      errors.push(`${apiBaseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join("; "));
}

async function fetchSuperMtNodeEndpointsFrom(apiBaseUrl: string, token: string): Promise<SuperMtNodeEndpoint[]> {
  const response = await fetch(`${apiBaseUrl}/api/rpc-endpoints`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
    const detail = typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : "";
    throw new Error(`SuperMT Node endpoint usage request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const payload = (await response.json()) as { endpoints?: unknown[] };
  return Array.isArray(payload.endpoints)
    ? payload.endpoints.filter((item): item is SuperMtNodeEndpoint => Boolean(item) && typeof item === "object")
    : [];
}

async function fetchSuperMtNodeEndpointsByLicense(env: Record<string, string>, authCode: string): Promise<EndpointFetchResult> {
  const apiBaseUrls = superMtNodeApiBaseUrls(env);
  const errors: string[] = [];
  for (const apiBaseUrl of apiBaseUrls) {
    try {
      return { endpoints: await fetchSuperMtNodeEndpointsByLicenseFrom(apiBaseUrl, authCode), sourceUrl: apiBaseUrl };
    } catch (error) {
      errors.push(`${apiBaseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join("; "));
}

async function fetchSuperMtNodeEndpointsByLicenseFrom(apiBaseUrl: string, authCode: string): Promise<SuperMtNodeEndpoint[]> {
  const response = await fetch(`${apiBaseUrl}/api/rpc-endpoints/by-license`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-license-code": authCode,
    },
    body: JSON.stringify({ code: authCode }),
    signal: AbortSignal.timeout(8_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { endpoints?: unknown[]; error?: unknown; message?: unknown; reason?: unknown; valid?: unknown; status?: unknown };
  if (!response.ok) {
    const detail = typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : "";
    throw new Error(`SuperMT Node license endpoint usage request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  if (payload.valid === false) {
    const status = typeof payload.status === "string" ? payload.status : "invalid";
    const reason = typeof payload.reason === "string" ? payload.reason : `license status: ${status}`;
    throw new Error(reason);
  }
  return Array.isArray(payload.endpoints)
    ? payload.endpoints.filter((item): item is SuperMtNodeEndpoint => Boolean(item) && typeof item === "object")
    : [];
}

function superMtNodeApiBaseUrls(_env: Record<string, string>): string[] {
  return ["https://supermtnode.io", "https://api.supermtnode.io"].map((value) => value.replace(/\/+$/, ""));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function matchEndpoint(endpoint: SuperMtNodeEndpoint, chain: ChainKey, rpcUrl: string): boolean {
  const slug = rpcEndpointSlugFromUrl(rpcUrl);
  const endpointChain = normalizeEndpointChain(endpoint.chain);
  const endpointSlug = normalizeEndpointSlug(endpointString(endpoint, "endpointSlug", "endpoint_slug"));
  const endpointUrl = normalizeUrl(endpointString(endpoint, "httpUrl", "http_url"));
  return endpointChain === superMtNodeChainKeys[chain] && ((Boolean(slug) && endpointSlug === normalizeEndpointSlug(slug)) || endpointUrl === normalizeUrl(rpcUrl));
}

function chainKeys(): ChainKey[] {
  return ["ethereum", "bnb", "arbitrum"];
}

function matchChain(endpoint: SuperMtNodeEndpoint, chain: ChainKey): boolean {
  return normalizeEndpointChain(endpoint.chain) === superMtNodeChainKeys[chain];
}

function normalizeEndpointChain(value: unknown): string {
  const chain = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (chain === "bsc" || chain === "binance" || chain === "bnb" || chain === "bnb chain") return "bnb";
  if (chain === "arb" || chain === "arbitrum" || chain === "arbitrum one") return "arb";
  if (chain === "eth" || chain === "ethereum" || chain === "mainnet") return "eth";
  return chain;
}

function normalizeEndpointSlug(value?: string): string {
  return (value ?? "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
}

function rpcEndpointSlugFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).pathname.split("/").filter(Boolean).pop();
  } catch {
    return value.split("/").filter(Boolean).pop();
  }
}

function normalizeUrl(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

function parseUsageCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function endpointString(endpoint: SuperMtNodeEndpoint, camelKey: keyof SuperMtNodeEndpoint, snakeKey: keyof SuperMtNodeEndpoint): string | undefined {
  const camel = endpoint[camelKey];
  if (typeof camel === "string" && camel.trim()) return camel.trim();
  const snake = endpoint[snakeKey];
  return typeof snake === "string" && snake.trim() ? snake.trim() : undefined;
}

function endpointValue(endpoint: SuperMtNodeEndpoint, camelKey: keyof SuperMtNodeEndpoint, snakeKey: keyof SuperMtNodeEndpoint): unknown {
  return endpoint[camelKey] ?? endpoint[snakeKey];
}

function readEnv(): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return parsed;
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    parsed[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return parsed;
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
