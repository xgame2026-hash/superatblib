import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

const PORT = Number(process.env.PORT || process.env.LIQUIDATION_SNAPSHOT_PORT || 8891);
const HOST = process.env.HOST || "127.0.0.1";
const REFRESH_INTERVAL_MS = Number(process.env.LIQUIDATION_SNAPSHOT_REFRESH_MS || 10_000);
const TIMEOUT_MS = Number(process.env.LIQUIDATION_SNAPSHOT_TIMEOUT_MS || 8_000);
const STORE_FILE = process.env.LIQUIDATION_SNAPSHOT_STORE_FILE || "/opt/supermt-liquidation-snapshot/data/ingest.json";
const INGEST_TOKEN = (process.env.LIQUIDATION_SNAPSHOT_INGEST_TOKEN || "").trim();
const UPSTREAM_SNAPSHOT_URL =
  process.env.UPSTREAM_LIQUIDATION_SNAPSHOT_URL || "https://market-snapshot.superarb.ai/api/public/liquidations/snapshot";
const MORPHO_GRAPHQL_URL = "https://api.morpho.org/graphql";
const MORPHO_MAX_HEALTH_FACTOR = boundedNumber(process.env.LIQUIDATION_CANDIDATE_MAX_HEALTH_FACTOR, 1.2, 1, 2);
const MORPHO_MIN_DEBT_USD = boundedNumber(process.env.LIQUIDATION_CANDIDATE_MIN_DEBT_USD, 50, 0, 1_000_000_000);
const MORPHO_MAX_POSITIONS = Math.trunc(boundedNumber(process.env.MORPHO_SNAPSHOT_MAX_POSITIONS, 1_500, 100, 5_000));
const MORPHO_ENABLED = process.env.MORPHO_SNAPSHOT_ENABLED?.trim().toLowerCase() !== "false";

const markets = [
  market("eth-aave-v3-monitor", "ethereum", "ETH", "Aave V3", "monitor", "ETHEREUM_RPC_URL"),
  market("eth-morpho-blue-monitor", "ethereum", "ETH", "Morpho Blue", "monitor", "ETHEREUM_RPC_URL"),
  market("eth-spark-monitor", "ethereum", "ETH", "Spark", "monitor", "ETHEREUM_RPC_URL"),
  market("eth-compound-v3-monitor", "ethereum", "ETH", "Compound V3", "monitor", "ETHEREUM_RPC_URL"),
  market("bnb-aave-v3-liquidation", "bnb", "BNB", "Aave V3", "execute", "BNB_RPC_URL"),
  market("bnb-venus-liquidation", "bnb", "BNB", "Venus", "execute", "BNB_RPC_URL"),
  market("bnb-compound-v2-fork-liquidation", "bnb", "BNB", "Compound V2 Fork", "execute", "BNB_RPC_URL"),
  market("bnb-morpho-blue-monitor", "bnb", "BNB", "Morpho Blue", "monitor", "BNB_RPC_URL"),
  market("arb-aave-v3-liquidation", "arbitrum", "ARB", "Aave V3", "execute", "ARBITRUM_RPC_URL"),
  market("arb-morpho-blue-liquidation", "arbitrum", "ARB", "Morpho Blue", "execute", "ARBITRUM_RPC_URL"),
  market("arb-spark-monitor", "arbitrum", "ARB", "Spark", "monitor", "ARBITRUM_RPC_URL"),
  market("arb-liquity-v2-stability-pool", "arbitrum", "ARB", "Liquity V2", "stability_pool", "ARBITRUM_RPC_URL"),
];

let ingestStore = await readStore();
let cachedSnapshot = buildSnapshot({}, ingestStore);
let lastRefreshError = "";

const server = createServer(async (req, res) => {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return send(res, 204, "");

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "supermt-liquidation-snapshot-channel",
        refreshIntervalMs: REFRESH_INTERVAL_MS,
        updatedAt: cachedSnapshot.data.updatedAt,
        lastRefreshError,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/public/liquidations/snapshot") {
      return json(res, 200, cachedSnapshot);
    }

    if (req.method === "POST" && url.pathname === "/api/ingest/liquidation-snapshot") {
      if (INGEST_TOKEN && ingestToken(req) !== INGEST_TOKEN) {
        return json(res, 401, { ok: false, error: "unauthorized" });
      }
      const payload = await readJson(req);
      ingestStore = mergeIngestStore(ingestStore, payload);
      await writeStore(ingestStore);
      cachedSnapshot = buildSnapshot(cachedSnapshot, ingestStore);
      return json(res, 200, { ok: true, updatedAt: cachedSnapshot.data.updatedAt });
    }

    return json(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    return json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[snapshot-channel] listening on http://${HOST}:${PORT}, refresh=${REFRESH_INTERVAL_MS}ms`);
});

await refresh();
setInterval(() => {
  void refresh();
}, REFRESH_INTERVAL_MS);

async function refresh() {
  try {
    let supplementalWarning = "";
    const upstream = await fetchJson(UPSTREAM_SNAPSHOT_URL);
    const morpho = MORPHO_ENABLED
      ? await fetchMorphoSnapshot().catch((error) => {
          supplementalWarning = error instanceof Error ? error.message : String(error);
          return {};
        })
      : {};
    ingestStore = await readStore();
    cachedSnapshot = buildSnapshot(upstream, mergeSupplementalStore(ingestStore, morpho), supplementalWarning);
    lastRefreshError = supplementalWarning;
  } catch (error) {
    lastRefreshError = error instanceof Error ? error.message : String(error);
    cachedSnapshot = buildSnapshot(cachedSnapshot, ingestStore, lastRefreshError);
  }
}

async function fetchMorphoSnapshot() {
  const queue = [];
  const updatedAt = new Date().toISOString();
  const pageSize = 500;

  for (let skip = 0; skip < MORPHO_MAX_POSITIONS; skip += pageSize) {
    const first = Math.min(pageSize, MORPHO_MAX_POSITIONS - skip);
    const response = await fetch(MORPHO_GRAPHQL_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query LiquidationCandidates($first: Int!, $skip: Int!, $maximumHealthFactor: Float!) {
            marketPositions(
              first: $first
              skip: $skip
              orderBy: HealthFactor
              orderDirection: Asc
              where: {
                chainId_in: [1, 42161]
                marketListed: true
                borrowShares_gte: 1
                healthFactor_lte: $maximumHealthFactor
              }
            ) {
              items {
                id
                healthFactor
                market {
                  marketId
                  chain { id network }
                  loanAsset { symbol }
                  collateralAsset { symbol }
                }
                user { address }
                state { collateralUsd borrowAssetsUsd }
              }
            }
          }
        `,
        variables: { first, skip, maximumHealthFactor: MORPHO_MAX_HEALTH_FACTOR },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Morpho upstream returned HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.errors?.length) throw new Error(`Morpho query failed: ${stringValue(payload.errors[0]?.message) || "unknown error"}`);
    const items = arrayFrom(payload.data?.marketPositions?.items);
    queue.push(...items.map((item) => normalizeMorphoPosition(item, updatedAt)).filter(Boolean));
    if (items.length < first) break;
  }

  const filteredQueue = queue.filter((row) => numberValue(row.debt) >= MORPHO_MIN_DEBT_USD);
  const sources = ["ethereum", "arbitrum"].map((chain) => {
    const queueCount = filteredQueue.filter((row) => row.chain === chain).length;
    return {
      id: `${chain}-morpho-blue-api`,
      chain,
      chainLabel: chainLabel(chain),
      source: "morpho-api-scanner",
      rpc: chain === "ethereum" ? "ETHEREUM_RPC_URL" : "ARBITRUM_RPC_URL",
      queueCount,
      liquidationCount: 0,
      protocolCount: 1,
      status: queueCount > 0 ? "有候选" : "API 就绪",
      updatedAt,
    };
  });
  return { queue: filteredQueue, sources, updatedAt };
}

function normalizeMorphoPosition(item, updatedAt) {
  const chainId = numberValue(item?.market?.chain?.id);
  const chain = chainId === 1 ? "ethereum" : chainId === 42161 ? "arbitrum" : "";
  const wallet = stringValue(item?.user?.address);
  const marketId = stringValue(item?.market?.marketId, item?.id);
  const healthFactor = numberValue(item?.healthFactor);
  const debt = numberValue(item?.state?.borrowAssetsUsd);
  if (!chain || !wallet || !marketId || healthFactor === null || healthFactor <= 0 || debt === null || debt <= 0) return null;
  return {
    id: `morpho:${chain}:${marketId}:${wallet.toLowerCase()}`,
    chain,
    chainLabel: chainLabel(chain),
    wallet,
    asset: stringValue(item?.market?.collateralAsset?.symbol) || "--",
    protocol: "Morpho Blue",
    rpc: chain === "ethereum" ? "ETHEREUM_RPC_URL" : "ARBITRUM_RPC_URL",
    healthFactor: formatDecimal(healthFactor, 4),
    debt: formatDecimal(debt, 2),
    debtSymbol: `${stringValue(item?.market?.loanAsset?.symbol) || "USD"} / USD`,
    collateralSymbol: numberValue(item?.state?.collateralUsd) === null ? "--" : formatDecimal(numberValue(item.state.collateralUsd), 2),
    grossProfit: "--",
    netProfit: "--",
    status: healthFactor < 1 ? "可清算" : healthFactor <= 1.05 ? "高风险" : "候选",
    source: "morpho-api-scanner",
    updatedAt,
  };
}

function mergeSupplementalStore(store, supplemental) {
  return {
    ...store,
    queue: [...arrayFrom(store.queue), ...arrayFrom(supplemental.queue)],
    sources: [...arrayFrom(store.sources), ...arrayFrom(supplemental.sources)],
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`upstream returned HTTP ${response.status}`);
  return response.json();
}

function buildSnapshot(upstream, store, warning = "") {
  const now = new Date().toISOString();
  const upstreamData = unwrapData(upstream);
  const upstreamQueue = arrayFrom(upstreamData.queue, upstreamData.candidates, upstreamData.strategyCandidates, upstreamData.strategy_candidates);
  const storeQueue = arrayFrom(store.queue, store.candidates, store.strategyCandidates, store.strategy_candidates);
  const queue = dedupeRows([...upstreamQueue, ...storeQueue].map(normalizeQueueRow).filter(Boolean));
  const protocols = buildProtocols(upstreamData, store, queue, now);
  const sources = buildSources(upstreamData, store, queue, now);
  const strategies = buildStrategies(upstreamData, store, queue, now);
  const updatedAt = stringValue(store.updatedAt, store.updated_at, upstreamData.updatedAt, upstreamData.updated_at) || now;

  return {
    success: true,
    data: {
      ok: true,
      source: "supermt-dedicated-liquidation-snapshot-channel",
      status: warning ? "degraded" : "connected",
      dataStatus: queue.length > 0 ? "borrower_candidates_ready" : "borrower_candidates_empty",
      missingDataSource: queue.length === 0,
      message:
        queue.length > 0
          ? "Borrower-level liquidation candidates are available."
          : "No borrower-level liquidation candidates are available yet. Connect a protocol indexer or POST borrower candidates to /api/ingest/liquidation-snapshot.",
      warning,
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      updatedAt,
      latest: arrayFrom(upstreamData.latest, upstreamData.rows, upstreamData.liquidations),
      liquidations: arrayFrom(upstreamData.liquidations, upstreamData.latest, upstreamData.rows),
      rows: arrayFrom(upstreamData.rows, upstreamData.latest, upstreamData.liquidations),
      queue,
      candidates: queue,
      strategyCandidates: queue,
      protocols,
      sources,
      strategies,
      rankings: upstreamData.rankings || emptyRankings(),
      ranking: arrayFrom(upstreamData.ranking),
    },
  };
}

function buildProtocols(upstreamData, store, queue, now) {
  const byKey = new Map();
  for (const item of arrayFrom(upstreamData.protocols, store.protocols)) {
    const protocol = stringValue(item.protocol, item.market, item.name);
    const chain = normalizeChain(stringValue(item.chain, item.network));
    if (!protocol || !chain) continue;
    byKey.set(`${chain}:${protocolKey(protocol)}`, {
      ...item,
      id: stringValue(item.id) || `${chain}-${protocolKey(protocol)}`,
      chain,
      chainLabel: stringValue(item.chainLabel, item.chain_label) || chainLabel(chain),
      protocol,
      updatedAt: stringValue(item.updatedAt, item.updated_at) || now,
    });
  }
  for (const item of markets) {
    const key = `${item.chain}:${protocolKey(item.protocol)}`;
    const protocolQueue = queue.filter((row) => row.chain === item.chain && protocolKey(row.protocol) === protocolKey(item.protocol));
    const existing = byKey.get(key) || {};
    byKey.set(key, {
      ...existing,
      id: `${item.chain}-${protocolKey(item.protocol)}`,
      chain: item.chain,
      chainLabel: item.chainLabel,
      protocol: item.protocol,
      amountUsd: numberValue(existing.amountUsd, existing.amount_usd) ?? null,
      count: protocolQueue.length,
      liquidators: numberValue(existing.liquidators) ?? 0,
      borrowers: protocolQueue.length,
      assets: [...new Set(protocolQueue.map((row) => row.asset).filter(Boolean))],
      updatedAt: protocolQueue[0]?.updatedAt || stringValue(existing.updatedAt, existing.updated_at) || now,
    });
  }
  return [...byKey.values()];
}

function buildSources(upstreamData, store, queue, now) {
  const sourceRows = arrayFrom(upstreamData.sources, store.sources);
  const byKey = new Map();
  for (const item of sourceRows) {
    const chain = normalizeChain(stringValue(item.chain, item.network));
    const source = stringValue(item.source, item.id);
    if (!chain || !source) continue;
    byKey.set(`${chain}:${source}`, normalizeSource(item, queue, now));
  }
  for (const item of markets) {
    const source = `${item.chainLabel.toLowerCase()}-${protocolKey(item.protocol)}-snapshot`;
    if (byKey.has(`${item.chain}:${source}`)) continue;
    const protocolQueue = queue.filter((row) => row.chain === item.chain && protocolKey(row.protocol) === protocolKey(item.protocol));
    byKey.set(`${item.chain}:${source}`, {
      id: `${item.chain}-${protocolKey(item.protocol)}-snapshot`,
      chain: item.chain,
      chainLabel: item.chainLabel,
      source,
      rpc: item.rpc,
      queueCount: protocolQueue.length,
      liquidationCount: 0,
      protocolCount: 1,
      status: protocolQueue.length > 0 ? "有候选" : "等待候选",
      updatedAt: now,
    });
  }
  return Object.fromEntries([...byKey.values()].map((item) => [item.id, item]));
}

function buildStrategies(upstreamData, store, queue, now) {
  const remoteStrategies = arrayFrom(upstreamData.strategies, store.strategies);
  const byId = new Map();
  for (const item of remoteStrategies) {
    const id = stringValue(item.id, item.strategyId, item.strategy_id);
    if (id) byId.set(id, item);
  }
  return markets.map((item) => {
    const remote = byId.get(item.id) || {};
    const protocolQueue = queue.filter((row) => row.chain === item.chain && protocolKey(row.protocol) === protocolKey(item.protocol));
    const remoteQueueCount = numberValue(remote.queueCount, remote.queue_count, remote.candidates, remote.candidateCount) ?? 0;
    const queueCount = Math.max(remoteQueueCount, protocolQueue.length);
    const status = stringValue(remote.status) || (queueCount > 0 ? "候选运行中" : item.mode === "execute" ? "候选运行中" : "监听待接入");
    return {
      id: item.id,
      chain: item.chain,
      chainLabel: item.chainLabel,
      protocol: item.protocol,
      strategy: item.strategy,
      mode: item.mode,
      rpc: item.rpc,
      priority: item.priority,
      minCapitalUsd: item.minCapitalUsd,
      note: item.note,
      status,
      statusTone: /运行|候选|ready/i.test(status) ? "ready" : "standby",
      queueCount,
      liquidationCount: numberValue(remote.liquidationCount, remote.liquidation_count, remote.liquidations) ?? 0,
      updatedAt: stringValue(remote.updatedAt, remote.updated_at, remote.timestamp) || now,
    };
  });
}

function normalizeQueueRow(row) {
  if (!row || typeof row !== "object") return null;
  const queueType = stringValue(row.queueType, row.queue_type, row.type, row.kind).toLowerCase();
  if (queueType === "endpoint-start") return null;
  const wallet = stringValue(row.wallet, row.walletAddress, row.account, row.user, row.borrower) || "";
  const chain = normalizeChain(stringValue(row.chain, row.network));
  const protocol = stringValue(row.protocol, row.market) || "";
  if (!chain || !protocol || !wallet) return null;
  const healthFactor = stringValue(row.healthFactor, row.health_factor, row.hf) || "--";
  const numericHealthFactor = Number(healthFactor.replace?.(/,/g, "") ?? healthFactor);
  if (!Number.isFinite(numericHealthFactor)) return null;
  return {
    id: stringValue(row.id) || `${chain}:${protocolKey(protocol)}:${wallet.toLowerCase()}`,
    chain,
    chainLabel: stringValue(row.chainLabel, row.chain_label) || chainLabel(chain),
    wallet,
    walletShort: shortAddress(wallet),
    asset: stringValue(row.asset, row.collateralAsset, row.collateral_asset) || "--",
    protocol,
    rpc: stringValue(row.rpc, row.rpcKey, row.rpc_key) || "--",
    healthFactor,
    debt: stringValue(row.debt, row.debtUsd, row.debt_usd, row.debtAmount, row.debt_amount) || "--",
    debtSymbol: stringValue(row.debtSymbol, row.debt_symbol, row.debtAsset, row.debt_asset) || "--",
    collateralSymbol: stringValue(row.collateralSymbol, row.collateral_symbol, row.collateralAsset, row.collateral_asset, row.asset) || "--",
    grossProfit: stringValue(row.grossProfit, row.grossProfitUsd, row.gross_profit, row.gross_profit_usd) || "--",
    netProfit: stringValue(row.netProfit, row.netProfitUsd, row.net_profit, row.net_profit_usd, row.roughNetProfit, row.rough_net_profit) || "--",
    status: stringValue(row.status) || "候选",
    source: stringValue(row.source) || "dedicated-snapshot-channel",
    updatedAt: stringValue(row.updatedAt, row.updated_at, row.timestamp) || new Date().toISOString(),
  };
}

function normalizeSource(item, queue, now) {
  const chain = normalizeChain(stringValue(item.chain, item.network));
  const id = stringValue(item.id) || `${chain}-${stringValue(item.source) || "snapshot"}`;
  const queueCount = numberValue(item.queueCount, item.queue_count, item.candidates) ?? queue.filter((row) => row.chain === chain).length;
  return {
    id,
    chain,
    chainLabel: stringValue(item.chainLabel, item.chain_label) || chainLabel(chain),
    source: stringValue(item.source) || id,
    rpc: stringValue(item.rpc, item.rpcKey, item.rpc_key) || "--",
    queueCount,
    liquidationCount: numberValue(item.liquidationCount, item.liquidation_count, item.liquidations) ?? 0,
    protocolCount: numberValue(item.protocolCount, item.protocol_count, item.protocols) ?? 1,
    status: stringValue(item.status) || (queueCount > 0 ? "有候选" : "等待候选"),
    updatedAt: stringValue(item.updatedAt, item.updated_at) || now,
  };
}

function mergeIngestStore(current, payload) {
  const incoming = unwrapData(payload);
  return {
    updatedAt: new Date().toISOString(),
    queue: dedupeRows([...arrayFrom(current.queue), ...arrayFrom(incoming.queue, incoming.candidates, incoming.strategyCandidates, incoming.strategy_candidates)]),
    protocols: [...arrayFrom(current.protocols), ...arrayFrom(incoming.protocols)],
    sources: [...arrayFrom(current.sources), ...arrayFrom(incoming.sources)],
    strategies: [...arrayFrom(current.strategies), ...arrayFrom(incoming.strategies)],
  };
}

function dedupeRows(rows) {
  const byKey = new Map();
  for (const row of rows.map(normalizeQueueRow).filter(Boolean)) {
    byKey.set(`${row.chain}:${protocolKey(row.protocol)}:${row.wallet.toLowerCase()}`, row);
  }
  return [...byKey.values()].sort((left, right) => Number(left.healthFactor) - Number(right.healthFactor));
}

async function readStore() {
  try {
    if (!existsSync(STORE_FILE)) return {};
    return JSON.parse(await readFile(STORE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeStore(value) {
  await mkdir(dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, STORE_FILE);
}

function market(id, chain, chainLabel, protocol, mode, rpc) {
  return {
    id,
    chain,
    chainLabel,
    protocol,
    mode,
    rpc,
    priority: mode === "execute" ? 80 : 60,
    minCapitalUsd: mode === "execute" ? 10_000 : 30_000,
    strategy: mode === "execute" ? `${chainLabel} 清算执行` : `${chainLabel} 清算监听`,
    note: `${protocol} dedicated liquidation snapshot channel`,
  };
}

function unwrapData(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (payload.data && typeof payload.data === "object") return payload.data;
  return payload;
}

function arrayFrom(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Object.values(value);
  }
  return [];
}

function stringValue(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function formatDecimal(value, digits) {
  return Number(value).toFixed(digits).replace(/\.?0+$/, "");
}

function normalizeChain(value) {
  const chain = (value || "").toLowerCase();
  if (chain.includes("bnb") || chain.includes("bsc")) return "bnb";
  if (chain.includes("arb")) return "arbitrum";
  if (chain.includes("eth")) return "ethereum";
  return "";
}

function chainLabel(chain) {
  if (chain === "bnb") return "BNB";
  if (chain === "arbitrum") return "ARB";
  return "ETH";
}

function protocolKey(protocol) {
  const normalized = (protocol || "").toLowerCase();
  if (normalized.includes("aave")) return "aave-v3";
  if (normalized.includes("morpho")) return "morpho-blue";
  if (normalized.includes("spark")) return "spark";
  if (normalized.includes("venus")) return "venus";
  if (normalized.includes("compound")) return normalized.includes("v3") ? "compound-v3" : "compound-v2-fork";
  if (normalized.includes("liquity")) return "liquity-v2";
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function shortAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function emptyRankings() {
  return { profit: [], event: [], liquidator: [], collateral: [], borrower: [] };
}

function ingestToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const headerToken = req.headers["x-ingest-token"];
  return Array.isArray(headerToken) ? headerToken[0]?.trim() || "" : headerToken?.trim() || "";
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-SuperMTNode-Auth-Code");
  res.setHeader("Cache-Control", "no-store");
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.end(payload);
}
