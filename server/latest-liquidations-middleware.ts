import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { PHASE1_LIQUIDATION_STRATEGIES, type Phase1Strategy } from "./phase1-liquidation-strategies";

const ENV_FILE = resolve(process.cwd(), ".env");
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_SNAPSHOT_API_URL = "https://api.supermtnode.io/api/public/liquidations/snapshot?limit=20";

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
  protocol: string;
  rpc: string;
  healthFactor: string;
  debt: string;
  debtSymbol: string;
  collateralSymbol: string;
  grossProfit: string;
  netProfit: string;
  status: string;
  source: string;
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
  candidates?: unknown;
  strategies?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
};

export function handleLatestLiquidationsRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/api/latest-liquidations")) return false;

  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }

  fetchLiquidationSnapshot()
    .then((payload) => json(res, 200, payload))
    .catch((error: unknown) => {
      json(res, 200, emptySnapshot(error instanceof Error ? error.message : String(error)));
    });

  return true;
}

async function fetchLiquidationSnapshot() {
  const env = readEnv();
  const snapshotUrl = env.LIQUIDATION_SNAPSHOT_API_URL?.trim() || DEFAULT_SNAPSHOT_API_URL;

  const payload = await fetchSnapshotPayload(snapshotUrl, env);
  return buildSnapshotResponse(payload, env);
}

async function fetchSnapshotPayload(snapshotUrl: string, env: Record<string, string>): Promise<SnapshotPayload> {
  const headers: Record<string, string> = { accept: "application/json" };
  const token = env.LIQUIDATION_SNAPSHOT_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(snapshotUrl, {
    headers,
    signal: AbortSignal.timeout(timeoutMs(env)),
  });
  if (!response.ok) throw new Error(`清算快照服务请求失败 (${response.status})`);
  return (await response.json()) as SnapshotPayload;
}

function buildSnapshotResponse(payload: SnapshotPayload, env: Record<string, string>) {
  const sourcePayload = unwrapPayload(payload);
  const sourceRows = readRows(sourcePayload);
  const rankingRows = readRankingRows(sourcePayload);
  const rankings = normalizeRankingGroups(sourcePayload.rankings, rankingRows.length > 0 ? rankingRows : sourceRows);
  const protocols = readProtocols(sourcePayload.protocols);
  const sources = readSources(sourcePayload.sources);
  const queue = readQueue(sourcePayload.queue ?? sourcePayload.queues ?? sourcePayload.candidates);
  const updatedAt = stringValue(sourcePayload.updatedAt, sourcePayload.updated_at) ?? new Date().toISOString();

  return {
    ok: true,
    source: "liquidation-snapshot-service",
    status: "connected",
    rankings,
    ranking: rankings.profit,
    protocols: protocols.length > 0 ? protocols : aggregateProtocols(sourceRows),
    sources,
    queue,
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
  const wallet = stringValue(row.wallet, row.account, row.user, row.borrower);
  if (!wallet) return null;

  const chain = normalizeChain(stringValue(row.chain, row.network, row.chainKey, row.chain_key));

  return {
    id: stringValue(row.id) ?? `${chain}-${wallet}-${index}`,
    chain,
    chainLabel: stringValue(row.chainLabel, row.chain_label) ?? chainLabel(chain),
    wallet,
    walletShort: shortAddress(wallet),
    asset: stringValue(row.asset, row.collateralAsset, row.collateral_asset) ?? "--",
    protocol: stringValue(row.protocol, row.market) ?? "--",
    rpc: stringValue(row.rpc, row.rpcKey, row.rpc_key) ?? "--",
    healthFactor: formatPlainNumber(row.healthFactor, row.health_factor, row.hf),
    debt: formatMaybeMoney(row.debt, row.debtUsd, row.debt_usd, row.debtAmount, row.debt_amount),
    debtSymbol: stringValue(row.debtSymbol, row.debt_symbol, row.debtAsset, row.debt_asset) ?? "--",
    collateralSymbol: stringValue(row.collateralSymbol, row.collateral_symbol, row.collateralAsset, row.collateral_asset, row.asset) ?? "--",
    grossProfit: formatMaybeMoney(row.grossProfit, row.grossProfitUsd, row.gross_profit, row.gross_profit_usd),
    netProfit: formatMaybeMoney(row.netProfit, row.netProfitUsd, row.net_profit, row.net_profit_usd, row.roughNetProfit, row.rough_net_profit),
    status: stringValue(row.status) ?? "候选",
    source: stringValue(row.source) ?? "--",
    updatedAt: stringValue(row.updatedAt, row.updated_at, row.timestamp) ?? new Date().toISOString(),
  };
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
  const status = stringValue(row.status) ?? (queueCount > 0 ? "候选运行中" : "心跳运行中");

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
  if (hasConfiguredRpc(strategy, env)) return { status: "RPC已接入", statusTone: "standby", text: "RPC已接入", tone: "standby" };
  if (sources.length === 0) return { status: "待部署", statusTone: "locked", text: "待部署", tone: "locked" };
  if (strategy.mode === "monitor") return { status: "监听待接入", statusTone: "standby", text: "监听待接入", tone: "standby" };
  return { status: "RPC已接入", statusTone: "standby", text: "RPC已接入", tone: "standby" };
}

function hasConfiguredRpc(strategy: Phase1Strategy, env: Record<string, string>): boolean {
  return Boolean(env[strategy.rpc]?.trim());
}

function sameProtocol(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function timeoutMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_SNAPSHOT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
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
