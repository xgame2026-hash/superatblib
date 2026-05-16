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

  fetchRpcUsage()
    .then((payload) => json(res, 200, payload))
    .catch((error: unknown) => json(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) }));

  return true;
}

async function fetchRpcUsage() {
  const env = readEnv();
  const token = env.SUPERMTNODE_APP_TOKEN?.trim();
  const metrics = initialMetrics(env);

  if (!token) {
    for (const chain of chainKeys()) {
      if (metrics[chain].rpcConfigured) {
        metrics[chain] = emptyMetric(chain, env, "missing_credentials", "SUPERMTNODE_APP_TOKEN is not configured.");
      }
    }
    return { ok: false, source: "supermtnode", metrics };
  }

  try {
    const endpoints = await fetchSuperMtNodeEndpoints((env.SUPERMTNODE_API_BASE_URL?.trim() || "https://api.supermtnode.io").replace(/\/+$/, ""), token);
    for (const chain of chainKeys()) {
      const rpcUrl = env[chainEnvKeys[chain]]?.trim();
      if (!rpcUrl) continue;
      const endpoint = endpoints.find((item) => matchEndpoint(item, chain, rpcUrl));
      metrics[chain] = endpoint
        ? buildMetric(chain, env, endpoint)
        : emptyMetric(chain, env, "unmatched", "Configured RPC URL was not found in SuperMT Node rpc_endpoints.");
    }
    return { ok: true, source: "supermtnode", metrics };
  } catch (error) {
    for (const chain of chainKeys()) {
      if (metrics[chain].rpcConfigured) {
        metrics[chain] = emptyMetric(chain, env, "error", error instanceof Error ? error.message : String(error));
      }
    }
    return { ok: false, source: "supermtnode", metrics };
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
    status,
    message,
  };
}

function buildMetric(chain: ChainKey, env: Record<string, string>, endpoint: SuperMtNodeEndpoint): RpcUsageMetric {
  const requestCount = parseUsageCount(endpointValue(endpoint, "requestCount", "request_count"));
  const requestLimit = parseUsageCount(endpointValue(endpoint, "requestLimit", "request_limit"));
  return {
    chain,
    rpcConfigured: Boolean(env[chainEnvKeys[chain]]?.trim()),
    requestCount,
    requestLimit,
    remainingRequests: requestCount !== null && requestLimit !== null && requestLimit > 0 ? Math.max(0, requestLimit - requestCount) : null,
    status: "ok",
  };
}

async function fetchSuperMtNodeEndpoints(apiBaseUrl: string, token: string): Promise<SuperMtNodeEndpoint[]> {
  const response = await fetch(`${apiBaseUrl}/api/rpc-endpoints`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`SuperMT Node endpoint usage request failed (${response.status})`);
  const payload = (await response.json()) as { endpoints?: unknown[] };
  return Array.isArray(payload.endpoints)
    ? payload.endpoints.filter((item): item is SuperMtNodeEndpoint => Boolean(item) && typeof item === "object")
    : [];
}

function matchEndpoint(endpoint: SuperMtNodeEndpoint, chain: ChainKey, rpcUrl: string): boolean {
  const slug = rpcEndpointSlugFromUrl(rpcUrl);
  const endpointChain = typeof endpoint.chain === "string" ? endpoint.chain : "";
  const endpointSlug = endpointString(endpoint, "endpointSlug", "endpoint_slug");
  const endpointUrl = normalizeUrl(endpointString(endpoint, "httpUrl", "http_url"));
  return endpointChain === superMtNodeChainKeys[chain] && ((Boolean(slug) && endpointSlug === slug) || endpointUrl === normalizeUrl(rpcUrl));
}

function chainKeys(): ChainKey[] {
  return ["ethereum", "bnb", "arbitrum"];
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
