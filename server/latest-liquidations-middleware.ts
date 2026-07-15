import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { assertOfficialConfig } from "./official-config";
import { PHASE1_LIQUIDATION_STRATEGIES, type Phase1Strategy } from "./phase1-liquidation-strategies";
import { queueWssToken } from "./queue-token";

const ENV_FILE = resolve(process.cwd(), ".env");
const ASSET_CHANGE_DB_FILE = resolve(process.cwd(), ".superarb/wallet-asset-change-db.json");
const LOCAL_QUEUE_STATE_FILE = resolve(process.cwd(), ".superarb/liquidation-queue-client.json");
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_SNAPSHOT_API_URL = "https://market-snapshot.superarb.ai/api/public/liquidations/snapshot";
const LEGACY_SNAPSHOT_API_URLS = new Set([
  "https://api.supermtnode.io/api/public/liquidations/snapshot",
  "https://bsc.rpc.supermtnode.io/api/public/liquidations/snapshot",
]);
const DEFAULT_ONLINE_USERS_API_URL = "https://privateapi.superarb.ai/online-users";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BALANCE_OF_SELECTOR = "0x70a08231";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ASSET_CHANGE_CACHE_MS = 10 * 60 * 1000;
const ASSET_CHANGE_REFRESH_MS = 10 * 60 * 1000;
const ASSET_CHANGE_ERROR_RETRY_MS = 2 * 60 * 1000;
const QUEUE_BALANCE_CACHE_MS = 10 * 1000;
const DEFAULT_TX2_CONTRACT_EVENTS_API_PATH = "/api/liquidation-queue/contract-events/today";

type ChainKey = "ethereum" | "bnb" | "arbitrum";
type RankingKey = "profit" | "event" | "liquidator" | "collateral" | "borrower";

type RankingRow = {
  date: string;
  time: string;
  hash: string;
  fullHash: string;
  chain: ChainKey;
  liquidator: string;
  asset: string;
  profit: string;
  cost: string;
  revenue: string;
  protocol: string;
};

type ProtocolRow = {
  protocol: string;
  volume: string;
  count: string;
  liquidators: string;
  borrowers: string;
  assets: string;
};

type SnapshotSourceRow = {
  id: string;
  chain: ChainKey;
  chainLabel: string;
  source: string;
  rpc: string;
  queueCount: number;
  liquidationCount: number;
  protocolCount: number;
  status: string;
  updatedAt: string;
};

type SnapshotQueueRow = {
  id: string;
  chain: ChainKey;
  chainLabel: string;
  wallet: string;
  walletShort: string;
  asset: string;
  assetDetails?: string;
  assetChange7d?: string;
  assetChange7Days?: string;
  change7d?: string;
  usdt?: string;
  usdtBalance?: string;
  usdt_balance?: string;
  usdtAmount?: string;
  usdt_amount?: string;
  todayAssetChange?: string;
  todayContractChange?: string;
  balances?: unknown;
  protocol: string;
  rpc: string;
  endpointId?: string;
  endpointSlug?: string;
  participantId?: string;
  queueMemberKey?: string;
  dedupeKey?: string;
  queueType?: string;
  healthFactor: string;
  debt: string;
  debtSymbol: string;
  collateralSymbol: string;
  grossProfit: string;
  netProfit: string;
  status: string;
  source: string;
  registeredAt?: string;
  joinedAt?: string;
  startedAt?: string;
  expiresAt?: string;
  updatedAt: string;
};

type StrategyRow = Phase1Strategy & {
  status: string;
  statusTone: "ready" | "standby" | "locked";
  queueCount: number;
  liquidationCount: number;
  updatedAt: string;
};

type SnapshotLiquidation = {
  date?: unknown;
  time?: unknown;
  occurredAt?: unknown;
  occurred_at?: unknown;
  timestamp?: unknown;
  blockTimestamp?: unknown;
  block_timestamp?: unknown;
  hash?: unknown;
  fullHash?: unknown;
  txHash?: unknown;
  tx_hash?: unknown;
  transactionHash?: unknown;
  transaction_hash?: unknown;
  chain?: unknown;
  network?: unknown;
  liquidator?: unknown;
  borrower?: unknown;
  account?: unknown;
  user?: unknown;
  asset?: unknown;
  collateralAsset?: unknown;
  collateral_asset?: unknown;
  liquidatedAsset?: unknown;
  liquidated_asset?: unknown;
  debtAsset?: unknown;
  debt_asset?: unknown;
  profit?: unknown;
  profitUsd?: unknown;
  profit_usd?: unknown;
  gasCostUsd?: unknown;
  gas_cost_usd?: unknown;
  cost?: unknown;
  revenue?: unknown;
  revenueUsd?: unknown;
  revenue_usd?: unknown;
  valueUsd?: unknown;
  value_usd?: unknown;
  protocol?: unknown;
  market?: unknown;
};

type SnapshotPayload = {
  ok?: unknown;
  source?: unknown;
  data?: unknown;
  latest?: unknown;
  rows?: unknown;
  liquidations?: unknown;
  ranking?: unknown;
  rankings?: unknown;
  protocols?: unknown;
  sources?: unknown;
  queue?: unknown;
  queues?: unknown;
  queuedWallets?: unknown;
  queued_wallets?: unknown;
  onlineUsers?: unknown;
  online_users?: unknown;
  users?: unknown;
  candidateQueue?: unknown;
  candidate_queue?: unknown;
  strategyCandidates?: unknown;
  strategy_candidates?: unknown;
  items?: unknown;
  candidates?: unknown;
  strategies?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
  transport?: unknown;
  participantCount?: unknown;
  participant_count?: unknown;
  subscribers?: unknown;
};

type StableToken = { address: string; decimals: number };
type AssetChangeCacheEntry = { value?: string; expiresAt: number };
type QueueBalanceCacheEntry = { value?: string; expiresAt: number };
type BlockCacheEntry = { blockTag: string; expiresAt: number };
type TransferLog = { data?: string; topics?: string[]; blockNumber?: string; transactionHash?: string };
type AssetChangePoint = { date: string; label: string; value: number };
type ContractUsdtEvent = {
  txHash: string;
  blockNumber: number;
  direction: "in" | "out";
  amount: number;
  counterparty: string;
  tradeType?: string;
  txTime?: string;
};
type AssetChangeDbRecord = {
  chain: ChainKey;
  wallet: string;
  assetChange7d: number;
  todayContractChange: number;
  todayDate?: string;
  todayContractEvents?: ContractUsdtEvent[];
  todayContractChangeSource?: "private-member-db" | "chain-scan";
  dailyContractDeltas: AssetChangePoint[];
  updatedAt: string;
  refreshStartedAt?: string;
  error?: string;
};
type AssetChangeDb = {
  version: 1;
  records: Record<string, AssetChangeDbRecord>;
};

const tokenContracts: Record<ChainKey, { usdt: StableToken; usdc: StableToken }> = {
  ethereum: {
    usdt: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    usdc: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  },
  bnb: {
    usdt: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    usdc: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  },
  arbitrum: {
    usdt: { address: "0xFd086bC7CD5C481DCC9C85EBE478A1C0b69FCbb9", decimals: 6 },
    usdc: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
  },
};

const rpcEnvKeys: Record<ChainKey, string[]> = {
  ethereum: ["ETHEREUM_RPC_URL", "ETH_RPC_URL"],
  bnb: ["BNB_FALLBACK_RPC_URL", "BNB_RPC_URL", "BSC_RPC_URL"],
  arbitrum: ["ARBITRUM_RPC_URL", "ARB_RPC_URL"],
};

const publicRpcUrls: Record<ChainKey, string[]> = {
  ethereum: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"],
  bnb: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org"],
  arbitrum: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"],
};

const sevenDayBlockSearchWindow: Record<ChainKey, number> = {
  ethereum: 80_000,
  bnb: 260_000,
  arbitrum: 5_000_000,
};

const logScanChunkSize: Record<ChainKey, number> = {
  ethereum: 10_000,
  bnb: 50_000,
  arbitrum: 500_000,
};

const assetChangeCache = new Map<string, AssetChangeCacheEntry>();
const queueBalanceCache = new Map<string, QueueBalanceCacheEntry>();
const sevenDayBlockCache = new Map<ChainKey, BlockCacheEntry>();
const blockAtTimestampCache = new Map<string, BlockCacheEntry>();
const assetChangeRefreshInFlight = new Set<string>();

export function handleLatestLiquidationsRequest(req: IncomingMessage, res: ServerResponse): boolean {
  // The execution-page list is deliberately independent from public market
  // snapshots. It is the LIQ2 private-member online-wallet list only.
  if (req.url?.startsWith("/api/liq2/online-wallets")) {
    if (req.method !== "GET") {
      json(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }

    fetchLiq2OnlineWallets(req)
      .then((payload) => json(res, 200, payload))
      .catch((error: unknown) => {
        json(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });

    return true;
  }

  if (req.url?.startsWith("/api/market-snapshot")) {
    if (req.method !== "GET") {
      json(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }

    fetchMarketSnapshot(req)
      .then((payload) => json(res, 200, payload))
      .catch((error: unknown) => {
        json(res, 200, emptySnapshot(error instanceof Error ? error.message : String(error)));
      });

    return true;
  }

  if (!req.url?.startsWith("/api/latest-liquidations")) return false;

  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }

  const requestUrl = new URL(req.url, "http://localhost");
  const fast = requestUrl.searchParams.get("marketStatus") === "1";
  const queueOnly = requestUrl.searchParams.get("fast") === "1";
  fetchLiquidationSnapshot(req, { fast, queueOnly })
    .then((payload) => json(res, 200, payload))
    .catch((error: unknown) => {
      json(res, 200, emptySnapshot(error instanceof Error ? error.message : String(error)));
    });

  return true;
}

/**
 * Read the server-maintained LIQ2 online-wallet cache. Do not attach market
 * snapshot candidates, local mirrors, or client-side RPC balance probes here:
 * privateapi owns the online filter and its balance worker owns the values.
 */
async function fetchLiq2OnlineWallets(req: IncomingMessage) {
  const env = readEnv();
  if (!privateMemberQueueStatusToken(env)) {
    const updatedAt = new Date().toISOString();
    return {
      ok: true,
      configurationRequired: true,
      source: "privateapi.superarb.ai/online-users",
      queueTransport: "unconfigured",
      queueSource: "local configuration required",
      queueParticipantCount: 0,
      queueSubscribers: 0,
      queueUpdatedAt: updatedAt,
      updatedAt,
      queuedWallets: [],
    };
  }
  const online = await fetchWssQueuedWallets(env, req);
  const queuedWallets = sortQueueRowsByRealtimeUsdtDesc(dedupeAndSortStateRows(online.rows));
  const updatedAt = stringValue(online.status.updatedAt, online.status.updated_at) ?? new Date().toISOString();
  return {
    ok: true,
    source: "privateapi.superarb.ai/online-users",
    queueTransport: "private-global",
    queueSource: "privateapi.superarb.ai/online-users (liq2 wallets with valid heartbeat)",
    queueParticipantCount: queuedWallets.length,
    queueSubscribers: 0,
    queueUpdatedAt: updatedAt,
    updatedAt,
    queuedWallets,
  };
}

async function fetchMarketSnapshot(req: IncomingMessage) {
  const env = readEnv();
  assertOfficialConfig("全部市场快照读取", env);
  const snapshotUrl = normalizeSnapshotUrl(env.LIQUIDATION_SNAPSHOT_API_URL?.trim() || DEFAULT_SNAPSHOT_API_URL);
  const payload = await fetchSnapshotPayload(snapshotUrl, env, req);
  const response = buildSnapshotResponse(payload, env, [], emptyWssQueueSnapshot());
  response.queueTransport = "snapshot";
  response.queueSource = "liquidation-snapshot-service";
  response.queueParticipantCount = 0;
  response.queueSubscribers = 0;
  response.queueUpdatedAt = response.updatedAt;
  response.queuedWallets = [];
  response.queue = response.queue.filter(isLicensedQueueRow);
  return response;
}

async function fetchLiquidationSnapshot(req: IncomingMessage, options: { fast?: boolean; queueOnly?: boolean } = {}) {
  const env = readEnv();
  assertOfficialConfig("清算快照读取", env);
  const snapshotUrl = normalizeSnapshotUrl(env.LIQUIDATION_SNAPSHOT_API_URL?.trim() || DEFAULT_SNAPSHOT_API_URL);
  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
  const wssQueue = options.fast ? emptyWssQueueSnapshot() : await fetchWssQueuedWallets(env, req).catch(() => emptyWssQueueSnapshot());
  const privateProfileRows = await fetchPrivateProfileQueuedWallets(env).catch(() => []);
  const payload = options.queueOnly ? ({} as SnapshotPayload) : await fetchSnapshotPayload(snapshotUrl, env, req);
  const response = buildSnapshotResponse(payload, env, wssQueue.rows, wssQueue);
  const localQueuedWallets = readLocalQueuedWallets();
  response.queuedWallets = dedupeAndSortStateRows([...privateProfileRows, ...wssQueue.rows, ...localQueuedWallets]);
  response.queueTransport =
    privateProfileRows.length > 0 ? "private-global" : wssQueue.ok ? "private" : localQueuedWallets.length > 0 ? "private-local-mirror" : "private-local-empty";
  response.queueSource = privateProfileRows.length > 0 ? "privateapi.superarb.ai/online-users" : wssQueue.ok ? "privateapi.superarb.ai/online-users" : "privateapi.superarb.ai/local-liq2";
  response.queueParticipantCount = response.queuedWallets.length;
  response.queueUpdatedAt = new Date().toISOString();
  if (options.queueOnly) {
    response.queue = [];
  }
  response.queue = response.queue.filter(isLicensedQueueRow);
  response.queuedWallets = response.queuedWallets.filter(isLicensedQueueRow);
  const queuedWallets = await enrichQueuedWalletBalances(dedupeEndpointQueueRows(response.queuedWallets), env);
  const queuedWalletsWithChanges = options.queueOnly ? queuedWallets : await enrichExactTodayContractChanges(queuedWallets, env, authCode);
  response.queuedWallets = sortQueueRowsByRealtimeUsdtDesc(queuedWalletsWithChanges);
  return response;
}

function readLocalQueuedWallets(): SnapshotQueueRow[] {
  if (!existsSync(LOCAL_QUEUE_STATE_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(LOCAL_QUEUE_STATE_FILE, "utf8")) as { items?: unknown };
    return dedupeAndSortStateRows(readQueue(parsed.items));
  } catch {
    return [];
  }
}

function dedupeAndSortStateRows(rows: SnapshotQueueRow[]): SnapshotQueueRow[] {
  const merged = new Map<string, SnapshotQueueRow>();
  for (const row of rows) {
    if (isExpiredQueueRow(row)) continue;
    merged.set(queueMergeKey(row), row);
  }
  return sortQueueRowsByRealtimeUsdtDesc([...merged.values()]);
}

function sortQueueRowsByRealtimeUsdtDesc(rows: SnapshotQueueRow[]): SnapshotQueueRow[] {
  return [...rows].sort((left, right) => {
    const usdtDelta = queueUsdtNumber(right) - queueUsdtNumber(left);
    if (usdtDelta !== 0) return usdtDelta;
    return toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
  });
}

function queueMergeKey(row: SnapshotQueueRow): string {
  return [row.chain || row.chainLabel || "unknown", row.wallet.toLowerCase()].join(":");
}

async function fetchSnapshotPayload(snapshotUrl: string, env: Record<string, string>, req: IncomingMessage): Promise<SnapshotPayload> {
  const headers: Record<string, string> = { accept: "application/json" };
  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
  if (authCode) {
    headers["x-supermtnode-auth-code"] = authCode;
  } else {
    const token = env.LIQUIDATION_SNAPSHOT_TOKEN?.trim();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(snapshotUrl, {
    headers,
    signal: AbortSignal.timeout(timeoutMs(env)),
  });
  if (!response.ok) throw new Error(`清算快照服务请求失败 (${response.status})`);
  return (await response.json()) as SnapshotPayload;
}

function normalizeSnapshotUrl(value: string): string {
  try {
    const url = new URL(value);
    url.searchParams.delete("limit");
    return url.toString();
  } catch {
    return value.replace(/([?&])limit=\d+(&?)/i, (_match, prefix: string, suffix: string) => (suffix ? prefix : ""));
  }
}

async function fetchWssQueuedWallets(env: Record<string, string>, req: IncomingMessage, includeAllLiq2 = false): Promise<{ ok: boolean; rows: SnapshotQueueRow[]; status: SnapshotPayload }> {
  const queueUrl = new URL(env.LIQ2_ONLINE_USERS_API_URL?.trim() || DEFAULT_ONLINE_USERS_API_URL);
  if (includeAllLiq2) queueUrl.searchParams.set("scope", "all");
  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
  const response = await fetch(queueUrl, {
    headers: privateMemberQueueStatusHeaders(env, authCode),
    signal: AbortSignal.timeout(timeoutMs(env)),
  });
  if (!response.ok) throw new Error(`WSS 队列状态请求失败 (${response.status})`);
  const payload = (await response.json()) as SnapshotPayload;
  const sourcePayload = unwrapPayload(payload);
  return {
    ok: true,
    rows: readQueue(sourcePayload.onlineUsers ?? sourcePayload.online_users ?? sourcePayload.users ?? sourcePayload.queuedWallets ?? sourcePayload.queued_wallets ?? sourcePayload.items ?? sourcePayload.queue ?? sourcePayload.queues ?? sourcePayload.rows),
    status: sourcePayload,
  };
}

async function fetchPrivateProfileQueuedWallets(env: Record<string, string>): Promise<SnapshotQueueRow[]> {
  const response = await fetch(env.LIQ2_ONLINE_USERS_API_URL?.trim() || DEFAULT_ONLINE_USERS_API_URL, {
    headers: privateMemberQueueStatusHeaders(env, ""),
    signal: AbortSignal.timeout(timeoutMs(env)),
  });
  if (!response.ok) throw new Error(`privateapi online users request failed (${response.status})`);
  const payload = (await response.json()) as SnapshotPayload;
  const sourcePayload = unwrapPayload(payload);
  const payloadRecord = sourcePayload as Record<string, unknown>;
  return readQueue(payloadRecord.onlineUsers ?? payloadRecord.online_users ?? payloadRecord.users ?? payloadRecord.queuedWallets ?? sourcePayload.queue ?? sourcePayload.rows ?? []);
}

function privateMemberQueueStatusHeaders(env: Record<string, string>, authCode: string): Record<string, string> {
  const queueToken = firstUsableToken(queueWssToken(env));
  const token = privateMemberQueueStatusToken(env);
  return {
    accept: "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode, "x-license-code": authCode } : {}),
    ...(token ? { authorization: `Bearer ${token}`, "x-supermtnode-token": token, "x-supermtnode-app-token": token } : {}),
    ...(queueToken ? { "x-queue-token": queueToken, "x-liquidation-queue-token": queueToken } : {}),
  };
}

function privateMemberQueueStatusToken(env: Record<string, string>): string {
  return firstUsableToken(
    env.SUPERMTNODE_APP_TOKEN,
    queueWssToken(env),
    env.LIQUIDATION_QUEUE_PUBLIC_TOKEN,
    env.LIQUIDATION_SNAPSHOT_TOKEN,
  );
}

function emptyWssQueueSnapshot() {
  return { ok: false, rows: [] as SnapshotQueueRow[], status: {} as SnapshotPayload };
}

function buildSnapshotResponse(
  payload: SnapshotPayload,
  env: Record<string, string>,
  queuedWallets: SnapshotQueueRow[],
  wssQueue: { ok: boolean; rows: SnapshotQueueRow[]; status: SnapshotPayload },
) {
  const sourcePayload = unwrapPayload(payload);
  const sourceRows = readRows(sourcePayload);
  const rankingRows = readRankingRows(sourcePayload);
  const rankings = normalizeRankingGroups(sourcePayload.rankings, rankingRows.length > 0 ? rankingRows : sourceRows);
  const protocols = readProtocols(sourcePayload.protocols);
  const snapshotSources = readSources(sourcePayload.sources);
  const rawQueue = readQueue(
    sourcePayload.candidateQueue ??
      sourcePayload.candidate_queue ??
      sourcePayload.strategyCandidates ??
      sourcePayload.strategy_candidates ??
      sourcePayload.candidates ??
      sourcePayload.queue ??
      sourcePayload.queues,
  );
  const queue = dedupeQueue(rawQueue.filter(isStrategyCandidateQueueRow));
  const sources = normalizeCandidateSources(snapshotSources, queue);
  const updatedAt = stringValue(sourcePayload.updatedAt, sourcePayload.updated_at) ?? new Date().toISOString();

  return {
    ok: true,
    source: "liquidation-snapshot-service",
    status: "connected",
    queueTransport: wssQueue.ok ? "wss" : "unavailable",
    queueSource: stringValue(wssQueue.status.source) ?? "privateMember-liquidation-queue-wss",
    queueParticipantCount: numberValue(wssQueue.status.participantCount, wssQueue.status.participant_count) ?? queuedWallets.length,
    queueSubscribers: numberValue(wssQueue.status.subscribers) ?? 0,
    queueUpdatedAt: stringValue(wssQueue.status.updatedAt, wssQueue.status.updated_at) ?? updatedAt,
    rankings,
    ranking: rankings.profit,
    protocols: protocols.length > 0 ? protocols : aggregateProtocols(sourceRows),
    sources,
    queue,
    queuedWallets,
    strategies: readStrategies(sourcePayload.strategies, sources, queue, updatedAt, env),
    updatedAt,
  };
}

function unwrapPayload(payload: SnapshotPayload): SnapshotPayload {
  if (Array.isArray(payload)) return { rows: payload } as SnapshotPayload;
  if (isRecord(payload.data)) {
    const data = payload.data as SnapshotPayload;
    if (Array.isArray(data)) return { rows: data } as SnapshotPayload;
    return data;
  }
  return payload;
}

function normalizeRankingGroups(source: unknown, fallbackRows: RankingRow[]): Record<RankingKey, RankingRow[]> {
  const sourceRecord = isRecord(source) ? source : {};
  const profitRows = readRankingRows(sourceRecord.profit);
  const legacyRows = profitRows.length > 0 ? profitRows : fallbackRows;

  return {
    profit: legacyRows.sort(byNumberDesc("profit")).slice(0, 10),
    event: readRankingRows(sourceRecord.event ?? sourceRecord.events).sort(byTimeDesc).slice(0, 10),
    liquidator: readRankingRows(sourceRecord.liquidator ?? sourceRecord.liquidators).sort(byText("liquidator")).slice(0, 10),
    collateral: readRankingRows(sourceRecord.collateral ?? sourceRecord.collaterals ?? sourceRecord.asset).sort(byText("asset")).slice(0, 10),
    borrower: readRankingRows(sourceRecord.borrower ?? sourceRecord.borrowers).sort(byNumberDesc("revenue")).slice(0, 10),
  };
}

function readRows(payload: SnapshotPayload): RankingRow[] {
  return readRankingRows(payload.latest ?? payload.rows ?? payload.liquidations ?? []);
}

function readRankingRows(value: unknown): RankingRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is SnapshotLiquidation => isRecord(item))
    .map(normalizeRow)
    .filter((row): row is RankingRow => Boolean(row));
}

function normalizeRow(row: SnapshotLiquidation): RankingRow | null {
  const fullHash = stringValue(row.fullHash, row.hash, row.txHash, row.tx_hash, row.transactionHash, row.transaction_hash);
  if (!fullHash) return null;

  const occurredAt = parseOccurrence(row);
  const chain = normalizeChain(stringValue(row.chain, row.network));
  const profitValue = numberValue(row.profitUsd, row.profit_usd, row.profit);
  const costValue = numberValue(row.gasCostUsd, row.gas_cost_usd, row.cost);
  const revenueValue = numberValue(row.revenueUsd, row.revenue_usd, row.revenue, row.valueUsd, row.value_usd);

  return {
    date: occurredAt.date,
    time: occurredAt.time,
    hash: shortHash(fullHash),
    fullHash,
    chain,
    liquidator: shortAddress(stringValue(row.liquidator) ?? "--"),
    asset: stringValue(row.asset, row.collateralAsset, row.collateral_asset, row.liquidatedAsset, row.liquidated_asset) ?? "--",
    profit: formatUsd(profitValue),
    cost: formatUsd(costValue),
    revenue: formatUsd(revenueValue ?? ((profitValue ?? 0) + (costValue ?? 0))),
    protocol: stringValue(row.protocol, row.market) ?? "--",
  };
}

function aggregateProtocols(rows: RankingRow[]): ProtocolRow[] {
  const groups = new Map<string, { volume: number; count: number; liquidators: Set<string>; assets: Set<string> }>();
  for (const row of rows) {
    const key = row.protocol || "--";
    const group = groups.get(key) ?? { volume: 0, count: 0, liquidators: new Set<string>(), assets: new Set<string>() };
    group.volume += parseMoney(row.revenue);
    group.count += 1;
    if (row.liquidator && row.liquidator !== "--") group.liquidators.add(row.liquidator);
    if (row.asset && row.asset !== "--") group.assets.add(row.asset);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([protocol, group]) => ({
      protocol,
      volume: formatUsd(group.volume),
      count: group.count.toString(),
      liquidators: group.liquidators.size.toString(),
      borrowers: "--",
      assets: group.assets.size > 0 ? [...group.assets].slice(0, 4).join(" / ") : "--",
    }))
    .sort((left, right) => parseMoney(right.volume) - parseMoney(left.volume));
}

function readProtocols(value: unknown): ProtocolRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      protocol: stringValue(item.protocol, item.market, item.name) ?? "--",
      volume: formatMaybeMoney(item.volume ?? item.volumeUsd ?? item.volume_usd ?? item.amountUsd ?? item.amount_usd),
      count: formatCount(item.count ?? item.events ?? item.liquidationCount ?? item.liquidation_count),
      liquidators: formatCount(item.liquidators ?? item.liquidatorCount ?? item.liquidator_count),
      borrowers: formatCount(item.borrowers ?? item.borrowerCount ?? item.borrower_count),
      assets: stringValue(item.assets, item.assetList, item.asset_list) ?? "--",
    }));
}

function readSources(value: unknown): SnapshotSourceRow[] {
  const rows = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
  return rows
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map(normalizeSource)
    .filter((row): row is SnapshotSourceRow => Boolean(row));
}

function normalizeSource(row: Record<string, unknown>, index: number): SnapshotSourceRow {
  const chain = normalizeChain(stringValue(row.chain, row.network, row.chainKey, row.chain_key));
  const source = stringValue(row.source, row.name, row.queue, row.queueName, row.queue_name) ?? "--";
  const rpc = stringValue(row.rpc, row.rpcKey, row.rpc_key, row.endpoint) ?? "--";
  const queueCount = numberValue(row.queueCount, row.queue_count, row.candidates, row.candidateCount) ?? 0;
  const liquidationCount = numberValue(row.liquidationCount, row.liquidation_count, row.liquidations) ?? 0;
  const protocolCount = numberValue(row.protocolCount, row.protocol_count, row.protocols) ?? 0;

  return {
    id: stringValue(row.id) ?? `${chain}-${source}-${index}`,
    chain,
    chainLabel: stringValue(row.chainLabel, row.chain_label) ?? chainLabel(chain),
    source,
    rpc,
    queueCount,
    liquidationCount,
    protocolCount,
    status: stringValue(row.status) ?? (rpc === "--" ? "待部署" : queueCount > 0 ? "有候选" : "RPC 就绪"),
    updatedAt: stringValue(row.updatedAt, row.updated_at, row.timestamp) ?? new Date().toISOString(),
  };
}

function readQueue(value: unknown): SnapshotQueueRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map(normalizeQueue)
    .filter((row): row is SnapshotQueueRow => Boolean(row));
}

function normalizeQueue(row: Record<string, unknown>, index: number): SnapshotQueueRow | null {
  const wallet = stringValue(row.wallet, row.walletAddress, row.wallet_address, row.address, row.account, row.user, row.borrower);
  if (!wallet) return null;

  const chain = normalizeChain(stringValue(row.chain, row.network, row.chainKey, row.chain_key));
  const balances = normalizeQueueBalances(row);

  return {
    id: stringValue(row.id) ?? `${chain}-${wallet}-${index}`,
    chain,
    chainLabel: stringValue(row.chainLabel, row.chain_label) ?? chainLabel(chain),
    wallet,
    walletShort: shortAddress(wallet),
    asset: stringValue(row.asset, row.collateralAsset, row.collateral_asset) ?? "--",
    assetDetails: stringValue(row.assetDetails, row.asset_details),
    assetChange7d: stringValue(row.assetChange7d, row.asset_change_7d),
    assetChange7Days: stringValue(row.assetChange7Days, row.asset_change_7_days),
    change7d: stringValue(row.change7d, row.change_7d),
    todayAssetChange: stringValue(row.todayAssetChange, row.today_asset_change),
    todayContractChange: stringValue(row.todayContractChange, row.today_contract_change),
    balances,
    protocol: stringValue(row.protocol, row.market) ?? "--",
    rpc: stringValue(row.rpc, row.rpcKey, row.rpc_key) ?? "--",
    endpointId: stringValue(row.endpointId, row.endpoint_id),
    endpointSlug: stringValue(row.endpointSlug, row.endpoint_slug),
    participantId: stringValue(row.participantId, row.participant_id, row.participantKey, row.participant_key),
    queueMemberKey: stringValue(row.queueMemberKey, row.queue_member_key, row.queueCredential, row.queue_credential),
    dedupeKey: stringValue(row.dedupeKey, row.dedupe_key),
    queueType: stringValue(row.queueType, row.queue_type),
    healthFactor: formatPlainNumber(row.healthFactor, row.health_factor, row.hf),
    debt: formatMaybeMoney(row.debt, row.debtUsd, row.debt_usd, row.debtAmount, row.debt_amount),
    debtSymbol: stringValue(row.debtSymbol, row.debt_symbol, row.debtAsset, row.debt_asset) ?? "--",
    collateralSymbol: stringValue(row.collateralSymbol, row.collateral_symbol, row.collateralAsset, row.collateral_asset, row.asset) ?? "--",
    grossProfit: formatMaybeMoney(row.grossProfit, row.grossProfitUsd, row.gross_profit, row.gross_profit_usd),
    netProfit: formatMaybeMoney(row.netProfit, row.netProfitUsd, row.net_profit, row.net_profit_usd, row.roughNetProfit, row.rough_net_profit),
    status: stringValue(row.status) ?? "候选",
    source: stringValue(row.source) ?? "--",
    registeredAt: stringValue(row.registeredAt, row.registered_at),
    joinedAt: stringValue(row.joinedAt, row.joined_at),
    startedAt: stringValue(row.startedAt, row.started_at),
    expiresAt: stringValue(row.expiresAt, row.expires_at),
    updatedAt: stringValue(row.updatedAt, row.updated_at, row.timestamp) ?? new Date().toISOString(),
  };
}

function normalizeQueueBalances(row: Record<string, unknown>): Record<string, unknown> | undefined {
  const balances = isRecord(row.balances) ? { ...row.balances } : {};
  const usdt = firstDefined(row.usdt, row.USDT, row.usdtBalance, row.usdt_balance, row.usdtAmount, row.usdt_amount);
  if (usdt !== undefined && balances.usdt === undefined) {
    balances.usdt = isRecord(usdt) ? usdt : { symbol: "USDT", formatted: usdt };
  }
  return Object.keys(balances).length > 0 ? balances : undefined;
}

function normalizeCandidateSources(sources: SnapshotSourceRow[], queue: SnapshotQueueRow[]): SnapshotSourceRow[] {
  return sources.map((source) => {
    const queueCount = queue.filter((row) => row.chain === source.chain).length;
    return {
      ...source,
      queueCount,
      status: queueCount > 0 ? "有候选" : source.rpc === "--" ? "待部署" : "RPC 就绪",
    };
  });
}

function isStrategyCandidateQueueRow(row: SnapshotQueueRow): boolean {
  if (isEndpointQueueRow(row)) return false;
  if (row.healthFactor && row.healthFactor !== "--") return true;
  return /scanner|strategy|scan|策略/i.test(row.source || "");
}

function isEndpointQueueRow(row: SnapshotQueueRow): boolean {
  const source = (row.source || "").toLowerCase();
  const queueType = (row.queueType || "").toLowerCase();
  const id = (row.id || "").toLowerCase();
  if (source.includes("rpc-queue") || source.includes("client-queue") || source.includes("endpoint-queue")) return true;
  if (queueType.includes("client") || queueType.includes("endpoint")) return true;
  if (id.startsWith("endpoint-start:")) return true;
  return Boolean(row.endpointSlug || row.endpointId);
}

function dedupeQueue(rows: SnapshotQueueRow[]): SnapshotQueueRow[] {
  const byKey = new Map<string, SnapshotQueueRow>();
  for (const row of rows) {
    const key = `${row.chain}:${row.protocol.toLowerCase()}:${row.wallet.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || snapshotRowScore(row) < snapshotRowScore(existing)) byKey.set(key, row);
  }
  return [...byKey.values()].sort((left, right) => snapshotRowScore(left) - snapshotRowScore(right));
}

function dedupeEndpointQueueRows(rows: SnapshotQueueRow[]): SnapshotQueueRow[] {
  const byWallet = new Map<string, SnapshotQueueRow>();
  for (const row of rows.filter((item) => !isExpiredQueueRow(item))) {
    const key = `${row.chain}:${row.wallet.toLowerCase()}`;
    const existing = byWallet.get(key);
    if (!existing || endpointRowScore(row) < endpointRowScore(existing)) byWallet.set(key, row);
  }
  return [...byWallet.values()].sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));
}

async function enrichQueuedWalletBalances(rows: SnapshotQueueRow[], env: Record<string, string>): Promise<SnapshotQueueRow[]> {
  const enriched = [...rows];
  const rowsByChain = new Map<ChainKey, Array<{ index: number; row: SnapshotQueueRow; wallet: string }>>();

  rows.forEach((row, index) => {
    const wallet = normalizeWallet(row.wallet);
    if (!wallet) return;
    if (hasQueueUsdtBalance(row)) return;
    const group = rowsByChain.get(row.chain) ?? [];
    group.push({ index, row, wallet });
    rowsByChain.set(row.chain, group);
  });

  for (const [chain, group] of rowsByChain) {
    const rpcUrls = queueBalanceRpcUrls(chain, env);
    if (rpcUrls.length === 0) continue;

    for (const batch of chunk(group, 8)) {
      await Promise.all(
        batch.map(async (item) => {
          const cacheKey = `${chain}:${item.wallet.toLowerCase()}:usdt-balance`;
          const cached = queueBalanceCache.get(cacheKey);
          const value = cached && cached.expiresAt > Date.now() ? cached.value : await readQueueUsdtBalanceWithFallback(chain, item.wallet, rpcUrls, env).catch(() => undefined);
          queueBalanceCache.set(cacheKey, { value, expiresAt: Date.now() + QUEUE_BALANCE_CACHE_MS });
          if (value !== undefined) enriched[item.index] = applyQueueUsdtBalance(item.row, value);
        }),
      );
    }
  }

  return enriched;
}

function hasQueueUsdtBalance(row: SnapshotQueueRow): boolean {
  const value = queueUsdtBalanceValue(row);
  if (value === undefined) return false;
  if (row.source === "private-liq2-user-profiles" && numberValue(value) === 0) return false;
  if (typeof value === "number") return Number.isFinite(value);
  return numberValue(value) !== null;
}

function queueUsdtBalanceValue(row: SnapshotQueueRow): unknown {
  if (!isRecord(row.balances)) return undefined;
  return balanceValue(row.balances.usdt) ?? balanceValue(row.balances.USDT) ?? row.balances.usdtBalance ?? row.balances.usdt_balance ?? row.balances.usdtAmount ?? row.balances.usdt_amount;
}

function balanceValue(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return value.formatted ?? value.value ?? value.amount;
}

function applyQueueUsdtBalance(row: SnapshotQueueRow, value: string): SnapshotQueueRow {
  const balances = isRecord(row.balances) ? { ...row.balances } : {};
  balances.usdt = { symbol: "USDT", formatted: value };
  return { ...row, usdt: value, usdtBalance: value, usdt_balance: value, usdtAmount: value, usdt_amount: value, balances };
}

function queueUsdtNumber(row: SnapshotQueueRow): number {
  return numberValue(queueUsdtBalanceValue(row), row.usdtBalance, row.usdt_balance, row.usdtAmount, row.usdt_amount, row.usdt) ?? 0;
}

function queueBalanceRpcUrls(chain: ChainKey, env: Record<string, string>): string[] {
  const configured = rpcEnvKeys[chain].map((key) => env[key]?.trim()).filter((value): value is string => Boolean(value));
  return [...new Set([...configured, ...(publicRpcUrls[chain] ?? [])])];
}

async function readQueueUsdtBalanceWithFallback(chain: ChainKey, wallet: string, rpcUrls: string[], env: Record<string, string>): Promise<string> {
  let lastError: unknown;
  for (const rpcUrl of rpcUrls) {
    try {
      return await readQueueUsdtBalance(chain, wallet, rpcUrl, env);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function readQueueUsdtBalance(chain: ChainKey, wallet: string, rpcUrl: string, env: Record<string, string>): Promise<string> {
  const token = tokenContracts[chain].usdt;
  const data = `${BALANCE_OF_SELECTOR}${wallet.slice(2).padStart(64, "0")}`;
  const value = await rpc<string>(rpcUrl, "eth_call", [{ to: token.address, data }, "latest"], env);
  return formatUnits(hexToBigInt(value), token.decimals, 2);
}

async function enrichExactTodayContractChanges(rows: SnapshotQueueRow[], env: Record<string, string>, authCode = ""): Promise<SnapshotQueueRow[]> {
  const db = readAssetChangeDb();
  const enriched = rows.map((row) => applyCachedTodayContractChange(row, db));
  const rowsByChain = new Map<ChainKey, Array<{ index: number; row: SnapshotQueueRow; wallet: string }>>();
  let shouldWriteDb = false;

  rows.forEach((row, index) => {
    const wallet = normalizeWallet(row.wallet);
    if (!wallet) return;

    const key = assetChangeDbKey(row.chain, wallet);
    if (assetChangeRefreshInFlight.has(key)) return;

    const group = rowsByChain.get(row.chain) ?? [];
    group.push({ index, row, wallet });
    rowsByChain.set(row.chain, group);
  });

  for (const [chain, group] of rowsByChain) {
    const wallets = [...new Set(group.map((item) => item.wallet.toLowerCase()))];
    for (const wallet of wallets) assetChangeRefreshInFlight.add(assetChangeDbKey(chain, wallet));
    try {
      const today = await readPrivateMemberTodayContractEvents(chain, wallets, env, authCode).catch(() => null);
      if (!today) continue;
      for (const item of group) {
        const todayContractEvents = today?.events.get(item.wallet.toLowerCase()) ?? [];
        const todayContractChange = sumTodayPositionPrincipalEvents(todayContractEvents);
        enriched[item.index] = applyExactTodayContractChange(item.row, todayContractChange, todayContractEvents);
        db.records[assetChangeDbKey(chain, item.wallet)] = {
          chain,
          wallet: item.wallet,
          assetChange7d: db.records[assetChangeDbKey(chain, item.wallet)]?.assetChange7d ?? 0,
          todayContractChange,
          todayDate: today.date,
          todayContractEvents,
          todayContractChangeSource: today.source,
          dailyContractDeltas: db.records[assetChangeDbKey(chain, item.wallet)]?.dailyContractDeltas ?? emptyDailyContractDeltas(),
          updatedAt: new Date().toISOString(),
        };
        shouldWriteDb = true;
      }
    } finally {
      for (const wallet of wallets) assetChangeRefreshInFlight.delete(assetChangeDbKey(chain, wallet));
    }
  }

  if (shouldWriteDb) writeAssetChangeDb(db);
  return enriched;
}

function applyCachedTodayContractChange(row: SnapshotQueueRow, db: AssetChangeDb): SnapshotQueueRow {
  const wallet = normalizeWallet(row.wallet);
  const record = wallet ? db.records[assetChangeDbKey(row.chain, wallet)] : undefined;
  if (record?.todayDate === formatLocalDate(new Date()) && record.updatedAt) {
    return applyExactTodayContractChange(row, record.todayContractChange, record.todayContractEvents ?? []);
  }
  return applyExactTodayContractChange(row, undefined, undefined);
}

function applyExactTodayContractChange(row: SnapshotQueueRow, todayContractChange?: number, todayContractEvents?: ContractUsdtEvent[]): SnapshotQueueRow {
  const todayValue = todayContractChange === undefined ? undefined : formatSignedAssetChange(todayContractChange);
  const balances = isRecord(row.balances)
    ? {
        ...row.balances,
        ...(todayValue === undefined ? {} : { todayContractChange: todayValue }),
        ...(todayContractEvents === undefined ? {} : { todayContractEvents }),
      }
    : row.balances;

  return {
    ...row,
    ...(todayValue === undefined ? {} : { todayAssetChange: todayValue, todayContractChange: todayValue }),
    balances,
  };
}

async function refreshAssetChangeGroup(chain: ChainKey, wallets: string[], env: Record<string, string>): Promise<void> {
  if (wallets.length === 0) return;
  const db = readAssetChangeDb();

  try {
    const today = await readPrivateMemberTodayContractEvents(chain, wallets, env);
    if (!today) return;
    for (const wallet of wallets) {
      const key = assetChangeDbKey(chain, wallet);
      const existing = db.records[key];
      const todayContractEvents = today.events.get(wallet.toLowerCase()) ?? [];
      const todayContractChange = sumTodayPositionPrincipalEvents(todayContractEvents);
      db.records[key] = {
        chain,
        wallet,
        assetChange7d: existing?.assetChange7d ?? 0,
        todayContractChange,
        todayDate: today.date,
        todayContractEvents,
        todayContractChangeSource: today.source,
        dailyContractDeltas: existing?.dailyContractDeltas ?? emptyDailyContractDeltas(),
        updatedAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    for (const wallet of wallets) {
      const key = assetChangeDbKey(chain, wallet);
      const existing = db.records[key];
      db.records[key] = {
        chain,
        wallet,
        assetChange7d: existing?.assetChange7d ?? 0,
        todayContractChange: existing?.todayContractChange ?? 0,
        dailyContractDeltas: existing?.dailyContractDeltas ?? emptyDailyContractDeltas(),
        updatedAt: existing?.updatedAt ?? "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  writeAssetChangeDb(db);
}

async function readChainTodayContractEvents(
  chain: ChainKey,
  wallets: string[],
  env: Record<string, string>,
): Promise<{ date: string; source: AssetChangeDbRecord["todayContractChangeSource"]; events: Map<string, ContractUsdtEvent[]> }> {
  const rpcUrl = await firstUsableRpcUrl(chain, env);
  const today = await readTodayContractUsdtEvents(chain, rpcUrl, wallets, env);
  return { ...today, source: "chain-scan" };
}

async function readPrivateMemberTodayContractEvents(
  chain: ChainKey,
  wallets: string[],
  env: Record<string, string>,
  authCode = "",
): Promise<{ date: string; source: AssetChangeDbRecord["todayContractChangeSource"]; events: Map<string, ContractUsdtEvent[]> } | null> {
  const endpoint = privateMemberTodayContractEventsEndpoint(env);
  if (!endpoint) return null;
  const range = todayLocalDayRange();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: privateMemberTodayContractEventsHeaders(env, authCode),
    body: JSON.stringify({
      chain,
      wallets,
      date: range.date,
      from: range.from,
      to: range.to,
      token: "USDT",
    }),
    signal: AbortSignal.timeout(timeoutMs(env)),
  });

  if (response.status === 404 || response.status === 405) return null;
  if (!response.ok) throw new Error(`privateMember 今日合约流水请求失败 (${response.status})`);

  const payload = (await response.json()) as SnapshotPayload;
  const sourcePayload = unwrapPayload(payload) as SnapshotPayload & Record<string, unknown>;
  const rows = arrayValue(sourcePayload.items, sourcePayload.events, sourcePayload.rows, sourcePayload.changes);
  if (!rows) return null;

  const events = new Map(wallets.map((wallet) => [wallet.toLowerCase(), [] as ContractUsdtEvent[]]));
  for (const item of rows) {
    if (!isRecord(item)) continue;
    const rowChainValue = stringValue(item.chain, item.network, item.chainKey, item.chain_key);
    const rowChain = rowChainValue ? normalizeChain(rowChainValue) : chain;
    if (rowChain !== chain) continue;
    const wallet = normalizeWallet(stringValue(item.wallet, item.account, item.user, item.borrower) ?? "");
    if (!wallet || !events.has(wallet.toLowerCase())) continue;

    const rowEvents = readPrivateMemberContractEvents(item, wallet);
    if (rowEvents.length > 0) {
      events.set(wallet.toLowerCase(), rowEvents);
      continue;
    }

    const totalIn = numberValue(item.totalIn, item.total_in, item.inAmount, item.in_amount, item.contractIn, item.contract_in);
    const totalOut = numberValue(item.totalOut, item.total_out, item.outAmount, item.out_amount, item.contractOut, item.contract_out);
    const amount =
      totalIn !== null || totalOut !== null
        ? Math.abs(totalIn ?? 0) - Math.abs(totalOut ?? 0)
        : numberValue(item.todayContractChange, item.today_contract_change, item.amount, item.amountUsdt, item.amount_usdt, item.netAmount, item.net_amount);
    if (amount === null) continue;
    events.set(wallet.toLowerCase(), [
      {
        txHash: stringValue(item.txHash, item.tx_hash, item.hash) ?? "private-member-db",
        blockNumber: numberValue(item.blockNumber, item.block_number) ?? 0,
        direction: amount >= 0 ? "in" : "out",
        amount,
        counterparty: stringValue(item.counterparty, item.contract, item.contractAddress, item.contract_address) ?? "",
      },
    ]);
  }

  return {
    date: stringValue(sourcePayload.date, sourcePayload.todayDate, sourcePayload.today_date) ?? formatLocalDate(new Date()),
    source: "private-member-db",
    events,
  };
}

function sumTodayPositionPrincipalEvents(events: ContractUsdtEvent[]): number {
  let startedWithTodayBuy = false;
  return [...events]
    .sort((left, right) => eventSortTime(left) - eventSortTime(right))
    .reduce((total, event) => {
      const tradeType = event.tradeType?.toLowerCase();
      if (tradeType === "buy" || event.direction === "out") {
        startedWithTodayBuy = true;
        return total - Math.abs(event.amount);
      }
      if (!startedWithTodayBuy) return total;
      return total + Math.abs(event.amount);
    }, 0);
}

function eventSortTime(event: ContractUsdtEvent): number {
  const timestamp = event.txTime ? new Date(event.txTime).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : event.blockNumber;
}

function todayLocalDayRange(): { date: string; from: string; to: string; timezone: string } {
  const start = startOfLocalDay(new Date());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1000);
  return {
    date: formatLocalDate(start),
    from: start.toISOString(),
    to: end.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
  };
}

function privateMemberTodayContractEventsEndpoint(env: Record<string, string>): string {
  const configured = env.LIQUIDATION_QUEUE_TX_EVENTS_URL?.trim() || env.PRIVATE_MEMBER_TX2_CONTRACT_EVENTS_URL?.trim();
  if (configured) return configured;
  const privateMemberBase = env.LIQ2_PRIVATE_MEMBER_API_URL?.trim()?.replace(/\/+$/, "");
  return privateMemberBase ? `${privateMemberBase}${DEFAULT_TX2_CONTRACT_EVENTS_API_PATH}` : "";
}

function privateMemberTodayContractEventsHeaders(env: Record<string, string>, authCode = ""): Record<string, string> {
  const token = firstUsableToken(
    queueWssToken(env),
    env.SUPERMTNODE_APP_TOKEN,
    env.LIQUIDATION_SNAPSHOT_TOKEN,
  );
  return {
    accept: "application/json",
    "content-type": "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode, "x-license-code": authCode } : {}),
    ...(token ? { authorization: `Bearer ${token}`, "x-supermtnode-token": token } : {}),
  };
}

function readPrivateMemberContractEvents(row: Record<string, unknown>, wallet: string): ContractUsdtEvent[] {
  const source = arrayValue(row.events, row.contractEvents, row.contract_events, row.transfers);
  if (!source) return [];
  const normalizedWallet = wallet.toLowerCase();
  return source
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((event): ContractUsdtEvent | null => {
      const tradeType = stringValue(event.tradeType, event.trade_type, event.type);
      if (tradeType && !["buy", "sell", "reward"].includes(tradeType.toLowerCase())) return null;
      const amount = numberValue(event.amount, event.amountUsdt, event.amount_usdt, event.value);
      if (amount === null) return null;
      const from = stringValue(event.from, event.fromAddress, event.from_address)?.toLowerCase();
      const to = stringValue(event.to, event.toAddress, event.to_address)?.toLowerCase();
      const directionText = (stringValue(event.direction, event.side, event.type) ?? "").toLowerCase();
      const direction: ContractUsdtEvent["direction"] =
        from === normalizedWallet || directionText.includes("out") || amount < 0 ? "out" : to === normalizedWallet || directionText.includes("in") ? "in" : "in";
      const signedAmount = direction === "out" ? -Math.abs(amount) : Math.abs(amount);
      return {
        txHash: stringValue(event.txHash, event.tx_hash, event.hash) ?? "private-member-db",
        blockNumber: numberValue(event.blockNumber, event.block_number) ?? 0,
        direction,
        amount: signedAmount,
        counterparty: stringValue(event.counterparty, event.contract, event.contractAddress, event.contract_address) ?? "",
        tradeType,
        txTime: stringValue(event.txTime, event.tx_time, event.time),
      };
    })
    .filter((event): event is ContractUsdtEvent => Boolean(event));
}

async function readTodayContractUsdtEvents(
  chain: ChainKey,
  rpcUrl: string,
  wallets: string[],
  env: Record<string, string>,
): Promise<{ date: string; events: Map<string, ContractUsdtEvent[]> }> {
  const token = tokenContracts[chain].usdt;
  const today = await todayScanRange(chain, rpcUrl, env);
  const walletByTopic = new Map(wallets.map((wallet) => [addressTopic(wallet), wallet.toLowerCase()]));
  const walletTopics = [...walletByTopic.keys()];
  const rawToday = new Map(wallets.map((wallet) => [wallet.toLowerCase(), 0n]));
  const events = new Map(wallets.map((wallet) => [wallet.toLowerCase(), [] as ContractUsdtEvent[]]));
  const txContractCallCache = new Map<string, boolean>();
  const contractAddressCache = new Map<string, boolean>();

  for (let start = today.fromBlock; start <= today.toBlock; start += logScanChunkSize[chain]) {
    const end = Math.min(today.toBlock, start + logScanChunkSize[chain] - 1);
    const common = { address: token.address, fromBlock: numberToHex(start), toBlock: numberToHex(end) };
    const inLogs = await getLogsWithFallback(rpcUrl, { ...common, topics: [TRANSFER_TOPIC, null, walletTopics] }, env, logScanChunkSize[chain]);
    const outLogs = await getLogsWithFallback(rpcUrl, { ...common, topics: [TRANSFER_TOPIC, walletTopics, null] }, env, logScanChunkSize[chain]);
    await applyContractTransferLogs(inLogs, 1n, 7, chain, rpcUrl, token, walletByTopic, new Map(), rawToday, txContractCallCache, contractAddressCache, env, events);
    await applyContractTransferLogs(outLogs, -1n, 7, chain, rpcUrl, token, walletByTopic, new Map(), rawToday, txContractCallCache, contractAddressCache, env, events);
  }

  return { date: today.date, events };
}

async function enrichSevenDayAssetChangesLegacy(rows: SnapshotQueueRow[], env: Record<string, string>): Promise<SnapshotQueueRow[]> {
  const enriched = rows.map((row) => withoutManageAssetChange(row));
  const rowsByChain = new Map<ChainKey, Array<{ index: number; row: SnapshotQueueRow; wallet: string }>>();

  rows.forEach((row, index) => {
    const wallet = normalizeWallet(row.wallet);
    if (!wallet) return;

    const cacheKey = `${row.chain}:${wallet.toLowerCase()}:usdt-transfer-7d`;
    const cached = assetChangeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      enriched[index] = applyAssetChange(row, cached.value);
      return;
    }

    const group = rowsByChain.get(row.chain) ?? [];
    group.push({ index, row, wallet });
    rowsByChain.set(row.chain, group);
  });

  for (const [chain, group] of rowsByChain) {
    try {
      const rpcUrl = await firstUsableRpcUrl(chain, env);
      const fromBlockTag = await sevenDaysAgoBlockTag(chain, rpcUrl, env);
      const toBlockTag = await rpc<string>(rpcUrl, "eth_blockNumber", [], env);
      const uniqueWallets = [...new Set(group.map((item) => item.wallet.toLowerCase()))];
      const deltas = await readUsdtTransferDeltas(chain, rpcUrl, uniqueWallets, fromBlockTag, toBlockTag, env);

      for (const item of group) {
        const delta = deltas.get(item.wallet.toLowerCase()) ?? 0;
        const value = formatSignedAssetChange(delta);
        assetChangeCache.set(`${chain}:${item.wallet.toLowerCase()}:usdt-transfer-7d`, { value, expiresAt: Date.now() + ASSET_CHANGE_CACHE_MS });
        enriched[item.index] = applyAssetChange(item.row, value);
      }
    } catch {
      for (const item of group) {
        assetChangeCache.set(`${chain}:${item.wallet.toLowerCase()}:usdt-transfer-7d`, { expiresAt: Date.now() + 60_000 });
      }
    }
  }

  return enriched;
}

function applyAssetChange(row: SnapshotQueueRow, value?: string): SnapshotQueueRow {
  if (!value) return withoutManageAssetChange(row);
  const balances = isRecord(row.balances)
    ? {
        ...row.balances,
        assetChange7d: value,
        assetChange7Days: value,
      }
    : row.balances;
  return { ...row, assetChange7d: value, assetChange7Days: value, change7d: value, balances };
}

function withoutManageAssetChange(row: SnapshotQueueRow): SnapshotQueueRow {
  const balances = isRecord(row.balances) ? { ...row.balances } : row.balances;
  if (isRecord(balances)) {
    delete balances.assetChange7d;
    delete balances.assetChange7Days;
    delete balances.change7d;
  }
  return { ...row, assetChange7d: undefined, assetChange7Days: undefined, change7d: undefined, balances };
}

async function firstUsableRpcUrl(chain: ChainKey, env: Record<string, string>): Promise<string> {
  const candidates = [
    ...rpcEnvKeys[chain].map((key) => env[key]?.trim()).filter((value): value is string => Boolean(value)),
    ...publicRpcUrls[chain],
  ];
  let lastError: unknown;
  for (const rpcUrl of candidates) {
    try {
      await rpc<string>(rpcUrl, "eth_blockNumber", [], env);
      return rpcUrl;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`No usable ${chain} RPC: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function sevenDaysAgoBlockTag(chain: ChainKey, rpcUrl: string, env: Record<string, string>): Promise<string> {
  const cached = sevenDayBlockCache.get(chain);
  if (cached && cached.expiresAt > Date.now()) return cached.blockTag;

  const targetTimestamp = Math.floor((Date.now() - SEVEN_DAYS_MS) / 1000);
  const latestHex = await rpc<string>(rpcUrl, "eth_blockNumber", [], env);
  const latest = Number(hexToBigInt(latestHex));
  let low = Math.max(1, latest - sevenDayBlockSearchWindow[chain]);
  let high = latest;
  let best = low;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const block = await rpc<Record<string, unknown> | null>(rpcUrl, "eth_getBlockByNumber", [numberToHex(middle), false], env);
    if (!block?.timestamp) {
      low = middle + 1;
      continue;
    }
    const timestamp = Number(hexToBigInt(String(block?.timestamp ?? "0x0")));
    if (timestamp <= targetTimestamp) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const blockTag = numberToHex(best);
  sevenDayBlockCache.set(chain, { blockTag, expiresAt: Date.now() + 30 * 60_000 });
  return blockTag;
}

async function readUsdtTransferDeltas(
  chain: ChainKey,
  rpcUrl: string,
  wallets: string[],
  fromBlockTag: string,
  toBlockTag: string,
  env: Record<string, string>,
): Promise<Map<string, number>> {
  const token = tokenContracts[chain].usdt;
  const fromBlock = Number(hexToBigInt(fromBlockTag));
  const toBlock = Number(hexToBigInt(toBlockTag));
  const walletByTopic = new Map(wallets.map((wallet) => [addressTopic(wallet), wallet]));
  const walletTopics = [...walletByTopic.keys()];
  const rawDeltas = new Map(wallets.map((wallet) => [wallet, 0n]));

  for (let start = fromBlock; start <= toBlock; start += logScanChunkSize[chain]) {
    const end = Math.min(toBlock, start + logScanChunkSize[chain] - 1);
    const common = { address: token.address, fromBlock: numberToHex(start), toBlock: numberToHex(end) };
    const [inLogs, outLogs] = await Promise.all([
      getLogsWithFallback(rpcUrl, { ...common, topics: [TRANSFER_TOPIC, null, walletTopics] }, env, logScanChunkSize[chain]),
      getLogsWithFallback(rpcUrl, { ...common, topics: [TRANSFER_TOPIC, walletTopics, null] }, env, logScanChunkSize[chain]),
    ]);
    for (const log of inLogs) {
      const wallet = walletByTopic.get(String(log.topics?.[2] ?? "").toLowerCase());
      if (wallet) rawDeltas.set(wallet, (rawDeltas.get(wallet) ?? 0n) + hexToBigInt(String(log.data ?? "0x0")));
    }
    for (const log of outLogs) {
      const wallet = walletByTopic.get(String(log.topics?.[1] ?? "").toLowerCase());
      if (wallet) rawDeltas.set(wallet, (rawDeltas.get(wallet) ?? 0n) - hexToBigInt(String(log.data ?? "0x0")));
    }
  }

  return new Map([...rawDeltas.entries()].map(([wallet, delta]) => [wallet, Number(formatUnits(delta, token.decimals, 8))]));
}

async function readContractUsdtAssetChanges(
  chain: ChainKey,
  rpcUrl: string,
  wallets: string[],
  env: Record<string, string>,
): Promise<Map<string, AssetChangePoint[]>> {
  const token = tokenContracts[chain].usdt;
  const ranges = await dailyScanRanges(chain, rpcUrl, env);
  const walletByTopic = new Map(wallets.map((wallet) => [addressTopic(wallet), wallet.toLowerCase()]));
  const walletTopics = [...walletByTopic.keys()];
  const rawDaily = new Map(wallets.map((wallet) => [wallet.toLowerCase(), ranges.previous.map(() => 0n)]));
  const rawToday = new Map(wallets.map((wallet) => [wallet.toLowerCase(), 0n]));
  const txContractCallCache = new Map<string, boolean>();
  const contractAddressCache = new Map<string, boolean>();

  for (let rangeIndex = 0; rangeIndex < ranges.all.length; rangeIndex += 1) {
    const range = ranges.all[rangeIndex];
    if (range.fromBlock > range.toBlock) continue;
    for (let start = range.fromBlock; start <= range.toBlock; start += logScanChunkSize[chain]) {
      const end = Math.min(range.toBlock, start + logScanChunkSize[chain] - 1);
      const common = { address: token.address, fromBlock: numberToHex(start), toBlock: numberToHex(end) };
      const inLogs = await getLogsWithFallback(rpcUrl, { ...common, topics: [TRANSFER_TOPIC, null, walletTopics] }, env, logScanChunkSize[chain]);
      const outLogs = await getLogsWithFallback(rpcUrl, { ...common, topics: [TRANSFER_TOPIC, walletTopics, null] }, env, logScanChunkSize[chain]);
      await applyContractTransferLogs(inLogs, 1n, rangeIndex, chain, rpcUrl, token, walletByTopic, rawDaily, rawToday, txContractCallCache, contractAddressCache, env);
      await applyContractTransferLogs(outLogs, -1n, rangeIndex, chain, rpcUrl, token, walletByTopic, rawDaily, rawToday, txContractCallCache, contractAddressCache, env);
    }
  }

  const result = new Map<string, AssetChangePoint[]>();
  for (const wallet of wallets.map((item) => item.toLowerCase())) {
    result.set(
      wallet,
      ranges.previous.map((range, index) => ({
        date: range.date,
        label: range.label,
        value: Number(formatUnits(rawDaily.get(wallet)?.[index] ?? 0n, token.decimals, 8)),
      })),
    );
    result.set(`${wallet}:today`, [
      {
        date: ranges.today.date,
        label: ranges.today.label,
        value: Number(formatUnits(rawToday.get(wallet) ?? 0n, token.decimals, 8)),
      },
    ]);
  }
  return result;
}

async function applyContractTransferLogs(
  logs: TransferLog[],
  direction: 1n | -1n,
  rangeIndex: number,
  chain: ChainKey,
  rpcUrl: string,
  token: StableToken,
  walletByTopic: Map<string, string>,
  rawDaily: Map<string, bigint[]>,
  rawToday: Map<string, bigint>,
  txContractCallCache: Map<string, boolean>,
  contractAddressCache: Map<string, boolean>,
  env: Record<string, string>,
  eventSink?: Map<string, ContractUsdtEvent[]>,
): Promise<void> {
  const isTodayRange = rangeIndex === 7;
  for (const log of logs) {
    const topicIndex = direction > 0n ? 2 : 1;
    const wallet = walletByTopic.get(String(log.topics?.[topicIndex] ?? "").toLowerCase());
    if (!wallet) continue;
    const txHash = String(log.transactionHash ?? "").toLowerCase();
    if (!txHash) continue;
    const counterpartyTopicIndex = direction > 0n ? 1 : 2;
    const counterparty = addressFromTopic(log.topics?.[counterpartyTopicIndex]);
    if (!counterparty || !(await isContractAddress(rpcUrl, counterparty, env, contractAddressCache))) continue;

    const txWalletCacheKey = `${txHash}:${wallet}`;
    let isContractCall = txContractCallCache.get(txWalletCacheKey);
    if (isContractCall === undefined) {
      isContractCall = await isContractUsdtFlow(rpcUrl, txHash, token.address, wallet, env);
      txContractCallCache.set(txWalletCacheKey, isContractCall);
    }
    if (!isContractCall) continue;

    const amount = hexToBigInt(String(log.data ?? "0x0")) * direction;
    if (eventSink) {
      const value = Number(formatUnits(amount, token.decimals, 8));
      eventSink.get(wallet)?.push({
        txHash,
        blockNumber: Number(hexToBigInt(String(log.blockNumber ?? "0x0"))),
        direction: direction > 0n ? "in" : "out",
        amount: value,
        counterparty,
      });
    }
    if (isTodayRange) {
      rawToday.set(wallet, (rawToday.get(wallet) ?? 0n) + amount);
    } else {
      const values = rawDaily.get(wallet);
      if (values) values[rangeIndex] = (values[rangeIndex] ?? 0n) + amount;
    }
  }
}

async function todayScanRange(chain: ChainKey, rpcUrl: string, env: Record<string, string>) {
  const todayStart = startOfLocalDay(new Date());
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const latestHex = await rpc<string>(rpcUrl, "eth_blockNumber", [], env);
  const latest = Number(hexToBigInt(latestHex));
  const fromBlock = await blockAtOrBeforeTimestamp(chain, rpcUrl, Math.floor(todayStart.getTime() / 1000), latest, env);
  const tomorrowBlock = await blockAtOrBeforeTimestamp(chain, rpcUrl, Math.floor(tomorrowStart.getTime() / 1000), latest, env);
  return {
    date: formatLocalDate(todayStart),
    label: "今日",
    fromBlock,
    toBlock: Math.min(latest, Math.max(fromBlock, tomorrowBlock - 1)),
  };
}

async function isContractAddress(rpcUrl: string, address: string, env: Record<string, string>, cache: Map<string, boolean>): Promise<boolean> {
  const normalized = address.toLowerCase();
  const cached = cache.get(normalized);
  if (cached !== undefined) return cached;
  const code = await rpc<string>(rpcUrl, "eth_getCode", [address, "latest"], env);
  const isContract = Boolean(code && code !== "0x");
  cache.set(normalized, isContract);
  return isContract;
}

async function isContractUsdtFlow(rpcUrl: string, txHash: string, tokenAddress: string, walletAddress: string, env: Record<string, string>): Promise<boolean> {
  const tx = await rpc<{ from?: string | null; to?: string | null; input?: string } | null>(rpcUrl, "eth_getTransactionByHash", [txHash], env);
  if (tx?.from?.toLowerCase() !== walletAddress.toLowerCase()) return false;
  const to = tx?.to?.toLowerCase() ?? "";
  const input = tx?.input ?? "0x";
  if (!to || input === "0x" || input.length <= 10) return false;
  return to !== tokenAddress.toLowerCase();
}

async function dailyScanRanges(chain: ChainKey, rpcUrl: string, env: Record<string, string>) {
  const dayStarts = previousSevenDayStarts();
  const todayStart = startOfLocalDay(new Date());
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const latestHex = await rpc<string>(rpcUrl, "eth_blockNumber", [], env);
  const latest = Number(hexToBigInt(latestHex));
  const starts = [...dayStarts, todayStart, tomorrowStart];
  const startBlocks: number[] = [];
  for (const date of starts) {
    startBlocks.push(await blockAtOrBeforeTimestamp(chain, rpcUrl, Math.floor(date.getTime() / 1000), latest, env));
  }
  const previous = dayStarts.map((date, index) => ({
    date: formatLocalDate(date),
    label: `${7 - index}D`,
    fromBlock: startBlocks[index],
    toBlock: Math.max(startBlocks[index], startBlocks[index + 1] - 1),
  }));
  const today = {
    date: formatLocalDate(todayStart),
    label: "今日",
    fromBlock: startBlocks[7],
    toBlock: Math.min(latest, Math.max(startBlocks[7], startBlocks[8] - 1)),
  };
  return { previous, today, all: [...previous, today] };
}

async function blockAtOrBeforeTimestamp(chain: ChainKey, rpcUrl: string, targetTimestamp: number, latest: number, env: Record<string, string>): Promise<number> {
  const cacheKey = `${chain}:${targetTimestamp}`;
  const cached = blockAtTimestampCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return Number(hexToBigInt(cached.blockTag));

  let low = Math.max(1, latest - sevenDayBlockSearchWindow[chain] - Math.ceil(sevenDayBlockSearchWindow[chain] / 3));
  let high = latest;
  let best = low;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const block = await rpc<Record<string, unknown> | null>(rpcUrl, "eth_getBlockByNumber", [numberToHex(middle), false], env);
    const timestamp = Number(hexToBigInt(String(block?.timestamp ?? "0x0")));
    if (timestamp <= targetTimestamp) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  blockAtTimestampCache.set(cacheKey, { blockTag: numberToHex(best), expiresAt: Date.now() + 30 * 60_000 });
  return best;
}

async function getLogsWithFallback(
  rpcUrl: string,
  filter: { address: string; fromBlock: string; toBlock: string; topics: unknown[] },
  env: Record<string, string>,
  chunkSize: number,
): Promise<TransferLog[]> {
  try {
    return await rpc<TransferLog[]>(rpcUrl, "eth_getLogs", [filter], env);
  } catch (error) {
    const fromBlock = Number(hexToBigInt(filter.fromBlock));
    const toBlock = Number(hexToBigInt(filter.toBlock));
    if (chunkSize <= 5_000 || fromBlock >= toBlock) throw error;
    const middle = Math.floor((fromBlock + toBlock) / 2);
    const left = await getLogsWithFallback(rpcUrl, { ...filter, toBlock: numberToHex(middle) }, env, Math.floor(chunkSize / 2));
    const right = await getLogsWithFallback(rpcUrl, { ...filter, fromBlock: numberToHex(middle + 1) }, env, Math.floor(chunkSize / 2));
    return [...left, ...right];
  }
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[], env: Record<string, string>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(timeoutMs(env)),
      });
      const payload = (await response.json()) as { result?: T; error?: { message?: string } };
      if (!response.ok || payload.error) {
        const message = payload.error?.message || `RPC HTTP ${response.status}`;
        if (response.status === 429 || /429|rate|too many/i.test(message)) {
          lastError = new Error(message);
          await sleep(750 * 2 ** attempt);
          continue;
        }
        throw new Error(message);
      }
      return payload.result as T;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/429|rate|too many/i.test(message) || attempt === 3) break;
      await sleep(750 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function chainFromRpcUrl(rpcUrl: string, env: Record<string, string>): ChainKey | undefined {
  const normalized = normalizeRpcUrl(rpcUrl);
  if (normalized && normalized === normalizeRpcUrl(env.ETHEREUM_RPC_URL?.trim() || env.ETH_RPC_URL?.trim() || "")) return "ethereum";
  if (normalized && normalized === normalizeRpcUrl(env.BNB_RPC_URL?.trim() || env.BSC_RPC_URL?.trim() || "")) return "bnb";
  if (normalized && normalized === normalizeRpcUrl(env.ARBITRUM_RPC_URL?.trim() || env.ARB_RPC_URL?.trim() || "")) return "arbitrum";
  return undefined;
}

function normalizeRpcUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function normalizeWallet(value: string): string {
  const wallet = value.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(wallet) ? wallet : "";
}

function numberToHex(value: number): string {
  return `0x${Math.max(0, Math.floor(value)).toString(16)}`;
}

function addressTopic(value: string): string {
  return `0x${value.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function addressFromTopic(value?: string): string {
  const normalized = String(value ?? "").toLowerCase().replace(/^0x/, "");
  if (normalized.length < 40) return "";
  return `0x${normalized.slice(-40)}`;
}

function formatAssetChangeAmount(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSignedAssetChange(value: number): string {
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  return `${normalized > 0 ? "+" : ""}${formatAssetChangeAmount(normalized)} USDT`;
}

function readAssetChangeDb(): AssetChangeDb {
  try {
    if (!existsSync(ASSET_CHANGE_DB_FILE)) return { version: 1, records: {} };
    const parsed = JSON.parse(readFileSync(ASSET_CHANGE_DB_FILE, "utf8")) as Partial<AssetChangeDb>;
    return { version: 1, records: isRecord(parsed.records) ? (parsed.records as Record<string, AssetChangeDbRecord>) : {} };
  } catch {
    return { version: 1, records: {} };
  }
}

function writeAssetChangeDb(db: AssetChangeDb): void {
  mkdirSync(dirname(ASSET_CHANGE_DB_FILE), { recursive: true });
  const tmpFile = `${ASSET_CHANGE_DB_FILE}.tmp`;
  writeFileSync(tmpFile, JSON.stringify(db, null, 2));
  renameSync(tmpFile, ASSET_CHANGE_DB_FILE);
}

function assetChangeDbKey(chain: ChainKey, wallet: string): string {
  return `${chain}:${wallet.toLowerCase()}:usdt-contract`;
}

function isAssetChangeRecordStale(record: AssetChangeDbRecord): boolean {
  if (record.error && record.refreshStartedAt) {
    const failedAt = toTimestamp(record.refreshStartedAt);
    if (failedAt && Date.now() - failedAt < ASSET_CHANGE_ERROR_RETRY_MS) return false;
  }
  const updatedAt = toTimestamp(record.updatedAt);
  if (!updatedAt) return true;
  return Date.now() - updatedAt > ASSET_CHANGE_REFRESH_MS;
}

function emptyDailyContractDeltas(): AssetChangePoint[] {
  return previousSevenDayStarts().map((date, index) => ({
    date: formatLocalDate(date),
    label: `${7 - index}D`,
    value: 0,
  }));
}

function previousSevenDayStarts(): Date[] {
  const todayStart = startOfLocalDay(new Date());
  return Array.from({ length: 7 }, (_item, index) => new Date(todayStart.getTime() - (7 - index) * 24 * 60 * 60 * 1000));
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUnits(value: bigint, decimals: number, fractionDigits: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const scale = 10n ** BigInt(fractionDigits);
  const rounded = (fraction * scale + base / 2n) / base;
  const carriedWhole = whole + rounded / scale;
  const carriedFraction = rounded % scale;
  return `${negative ? "-" : ""}${carriedWhole.toString()}${fractionDigits > 0 ? `.${carriedFraction.toString().padStart(fractionDigits, "0").replace(/0+$/, "") || "0"}` : ""}`;
}

function hexToBigInt(value: string): bigint {
  return BigInt(value || "0x0");
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

function endpointRowScore(row: SnapshotQueueRow): number {
  if (row.endpointSlug || row.endpointId) return 1;
  return 2;
}

function snapshotRowScore(row: SnapshotQueueRow): number {
  const hf = Number(row.healthFactor);
  return Number.isFinite(hf) ? hf : Number.POSITIVE_INFINITY;
}

function readStrategies(value: unknown, sources: SnapshotSourceRow[], queue: SnapshotQueueRow[], fallbackUpdatedAt: string, env: Record<string, string>): StrategyRow[] {
  const remote = Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item)).map((item) => normalizeStrategy(item, fallbackUpdatedAt))
    : [];
  const remoteById = new Map(remote.filter((item): item is StrategyRow => Boolean(item)).map((item) => [item.id, item]));

  return PHASE1_LIQUIDATION_STRATEGIES.map((strategy) => {
    const remoteRow = remoteById.get(strategy.id);
    if (remoteRow) return remoteRow;

    const chainSources = sources.filter((source) => source.chain === strategy.chain);
    const chainQueue = queue.filter((item) => item.chain === strategy.chain);
    const protocolQueue = chainQueue.filter((item) => sameProtocol(item.protocol, strategy.protocol));
    const queueCount = protocolQueue.length;
    const liquidationCount = chainSources.reduce((total, source) => total + source.liquidationCount, 0);
    const status = strategyStatus(strategy, chainSources, queueCount, env);

    return {
      ...strategy,
      status: status.text,
      statusTone: status.tone,
      queueCount,
      liquidationCount,
      updatedAt: chainSources[0]?.updatedAt ?? fallbackUpdatedAt,
    };
  });
}

function normalizeStrategy(row: Record<string, unknown>, fallbackUpdatedAt: string): StrategyRow | null {
  const id = stringValue(row.id, row.strategyId, row.strategy_id);
  const base = PHASE1_LIQUIDATION_STRATEGIES.find((strategy) => strategy.id === id);
  if (!base) return null;

  const queueCount = numberValue(row.queueCount, row.queue_count, row.candidates, row.candidateCount) ?? 0;
  const liquidationCount = numberValue(row.liquidationCount, row.liquidation_count, row.liquidations) ?? 0;
  const status = normalizeStrategyStatus(stringValue(row.status) ?? (queueCount > 0 ? "候选运行中" : "心跳运行中"));

  return {
    ...base,
    status,
    statusTone: strategyTone(status),
    queueCount,
    liquidationCount,
    updatedAt: stringValue(row.updatedAt, row.updated_at, row.timestamp) ?? fallbackUpdatedAt,
  };
}

function strategyStatus(strategy: Phase1Strategy, sources: SnapshotSourceRow[], queueCount: number, env: Record<string, string>): Pick<StrategyRow, "status" | "statusTone"> & { text: string; tone: StrategyRow["statusTone"] } {
  if (queueCount > 0) return { status: "候选运行中", statusTone: "ready", text: "候选运行中", tone: "ready" };
  if (hasConfiguredRpc(strategy, env)) return { status: "候选运行中", statusTone: "ready", text: "候选运行中", tone: "ready" };
  if (sources.length === 0) return { status: "待部署", statusTone: "locked", text: "待部署", tone: "locked" };
  if (strategy.mode === "monitor") return { status: "监听待接入", statusTone: "standby", text: "监听待接入", tone: "standby" };
  return { status: "候选运行中", statusTone: "ready", text: "候选运行中", tone: "ready" };
}

function normalizeStrategyStatus(status: string): string {
  if (/^RPC已接入$/i.test(status.trim())) return "候选运行中";
  return status;
}

function hasConfiguredRpc(strategy: Phase1Strategy, env: Record<string, string>): boolean {
  return Boolean(env[strategy.rpc]?.trim());
}

function sameProtocol(left: string, right: string): boolean {
  return normalizeProtocolKey(left) === normalizeProtocolKey(right);
}

function normalizeProtocolKey(protocol: string): string {
  const normalized = protocol.trim().toLowerCase();
  if (normalized.includes("aave")) return "aave-v3";
  if (normalized.includes("morpho")) return "morpho-blue";
  if (normalized.includes("spark")) return "spark";
  if (normalized.includes("venus")) return "venus";
  if (normalized.includes("compound")) return normalized.includes("v3") ? "compound-v3" : "compound-v2-fork";
  if (normalized.includes("liquity")) return "liquity-v2";
  return normalized;
}

function strategyTone(status: string): StrategyRow["statusTone"] {
  if (/运行|候选|可执行|ready/i.test(status)) return "ready";
  if (/待|standby|接入|部署|暂停/i.test(status)) return "standby";
  return "locked";
}

function parseOccurrence(row: SnapshotLiquidation): { date: string; time: string } {
  const raw = stringValue(row.occurredAt, row.occurred_at, row.timestamp, row.blockTimestamp, row.block_timestamp);
  const parsed = raw ? new Date(raw) : null;
  if (parsed && Number.isFinite(parsed.getTime())) return splitDateTime(parsed);

  const date = stringValue(row.date) ?? new Date().toISOString().slice(0, 10);
  const time = stringValue(row.time) ?? "00:00:00";
  return { date: date.replace(/\//g, "-").slice(0, 10), time: time.slice(0, 8) };
}

function splitDateTime(date: Date): { date: string; time: string } {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 19) };
}

function emptySnapshot(message: string) {
  return {
    ok: false,
    source: "liquidation-snapshot-service",
    status: "not_configured",
    message,
    rankings: createRankingMap([]),
    ranking: [],
    protocols: [],
    sources: [],
    queue: [],
    queuedWallets: [],
    queues: [],
    candidates: [],
    latest: [],
    liquidations: [],
    rows: [],
    updatedAt: new Date().toISOString(),
  };
}

function createRankingMap(rows: RankingRow[]): Record<RankingKey, RankingRow[]> {
  return {
    profit: rows,
    event: rows,
    liquidator: rows,
    collateral: rows,
    borrower: rows,
  };
}

function normalizeChain(value?: string): ChainKey {
  const chain = value?.trim().toLowerCase();
  if (chain === "bsc" || chain === "binance" || chain === "bnb" || chain === "bnb chain") return "bnb";
  if (chain === "arb" || chain === "arbitrum" || chain === "arbitrum one") return "arbitrum";
  return "ethereum";
}

function chainLabel(chain: ChainKey): string {
  if (chain === "bnb") return "BNB";
  if (chain === "arbitrum") return "ARB";
  return "ETH";
}

function byTimeDesc(left: RankingRow, right: RankingRow) {
  return new Date(`${right.date}T${right.time}`).getTime() - new Date(`${left.date}T${left.time}`).getTime();
}

function byNumberDesc(key: "profit" | "revenue") {
  return (left: RankingRow, right: RankingRow) => parseMoney(right[key]) - parseMoney(left[key]);
}

function byText(key: "asset" | "liquidator") {
  return (left: RankingRow, right: RankingRow) => left[key].localeCompare(right[key]);
}

function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : hash;
}

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function formatMaybeMoney(...values: unknown[]): string {
  const numeric = numberValue(...values);
  if (numeric !== null) return formatUsd(numeric);
  return stringValue(...values) ?? "--";
}

function formatPlainNumber(...values: unknown[]): string {
  const numeric = numberValue(...values);
  if (numeric !== null) return numeric.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return stringValue(...values) ?? "--";
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}

function formatCount(value: unknown): string {
  const numeric = numberValue(value);
  if (numeric !== null) return numeric.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return stringValue(value) ?? "--";
}

function parseMoney(value: string): number {
  const numeric = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value.replace(/[$,\s]/g, ""));
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return null;
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  }
  return undefined;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function arrayValue(...values: unknown[]): unknown[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isExpiredQueueRow(row: SnapshotQueueRow): boolean {
  if (!row.expiresAt) return false;
  const timestamp = new Date(row.expiresAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function isLicensedQueueRow(row: SnapshotQueueRow): boolean {
  const identity = [row.id, row.participantId, row.queueMemberKey, row.dedupeKey].filter(Boolean).join(":").toLowerCase();
  return !identity.includes(":no-license:");
}

function toTimestamp(value?: string): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

function firstUsableToken(...values: Array<string | undefined>): string {
  for (const value of values) {
    const token = value?.trim();
    if (!token) continue;
    const expiry = jwtExpiry(token);
    if (expiry && expiry.getTime() <= Date.now()) continue;
    return token;
  }
  return "";
}

function jwtExpiry(token: string): Date | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const exp = numberValue(payload.exp);
    return exp ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}

function timeoutMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_SNAPSHOT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function readEnv(): Record<string, string> {
  const parsed: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  if (!existsSync(ENV_FILE)) return parsed;
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    parsed[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  if (LEGACY_SNAPSHOT_API_URLS.has(parsed.LIQUIDATION_SNAPSHOT_API_URL?.trim() || "")) {
    parsed.LIQUIDATION_SNAPSHOT_API_URL = DEFAULT_SNAPSHOT_API_URL;
  }
  return parsed;
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
