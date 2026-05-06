import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseAbi,
  parseAbiItem,
  type Address,
  type PublicClient,
} from "viem";

import { CHAIN_ALIASES, type ChainPreset } from "./config.js";
import {
  loadReserveMetadata,
  type ReserveMetadata,
} from "./liquidation-analysis.js";

type DashboardPeriod = "1" | "7" | "30";

export type DashboardProviderContext = {
  key:
    | "flashloan-overview"
    | "latest-liquidation"
    | "liquidation-leaderboard"
    | "liquidation-overview";
  chain: string;
  period?: DashboardPeriod;
  date?: string;
  page?: number;
  pageSize?: number;
  sourcePage: string;
};

type AssetMeta = {
  asset: Address;
  symbol: string;
  decimals: bigint;
  price: bigint;
};

export type FlashloanRow = {
  time: number;
  txHash: string;
  purpose: string;
  blockNumber: number;
  tokenCount: number;
  lpCount: number;
  borrower: string;
  asset: string;
  protocol: string;
  amount: number;
  fee: number;
  legs: Array<Record<string, unknown>>;
};

export type LiquidationRow = {
  time: number;
  txHash: string;
  blockNumber: number;
  borrower: string;
  liquidator: string;
  debtAsset: string;
  debtToCover: number;
  debtQuantity: number;
  liquidationAsset: string;
  liquidationAmount: number;
  liquidationQuantity: number;
  protocol: string;
  profit: number;
};

export type OnchainSnapshot = {
  chain: ChainPreset;
  period: DashboardPeriod;
  fetchedAt: string;
  updateTimestamp: number | null;
  fromBlock: number;
  toBlock: number;
  requestedBlocks: number;
  scannedBlocks: number;
  windowTruncated: boolean;
  protocolName: string;
  flashloans: FlashloanRow[];
  liquidations: LiquidationRow[];
};

type SnapshotCacheEntry = {
  expiresAt: number;
  payload: OnchainSnapshot;
};

type ReserveMetadataBundle = Awaited<ReturnType<typeof loadReserveMetadata>>;

type OnchainEventStore = {
  version: string;
  chain: ChainPreset["key"];
  pool: Address;
  savedAt: string;
  fromBlock: number;
  toBlock: number;
  flashloans: FlashloanRow[];
  liquidations: LiquidationRow[];
};

type EventSourceKind = "aave" | "balancer" | "uniswap-v3" | "erc3156";

type EventSource = {
  kind: EventSourceKind;
  label: string;
  address?: Address;
  events: readonly unknown[];
};

const aavePoolEvents = [
  parseAbiItem(
    "event FlashLoan(address indexed target, address initiator, address indexed asset, uint256 amount, uint8 interestRateMode, uint256 premium, uint16 indexed referralCode)",
  ),
  parseAbiItem(
    "event FlashLoanSimple(address indexed target, address initiator, address indexed asset, uint256 amount, uint256 premium, uint16 indexed referralCode)",
  ),
  parseAbiItem(
    "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
  ),
] as const;

const balancerFlashloanEvents = [
  parseAbiItem(
    "event FlashLoan(address indexed recipient, address indexed token, uint256 amount, uint256 feeAmount)",
  ),
] as const;

const uniswapV3FlashEvents = [
  parseAbiItem(
    "event Flash(address indexed sender, address indexed recipient, uint256 amount0, uint256 amount1, uint256 paid0, uint256 paid1)",
  ),
] as const;

const erc3156FlashloanEvents = [
  parseAbiItem(
    "event FlashLoan(address indexed receiver, address indexed token, uint256 amount, uint256 fee)",
  ),
] as const;

const uniswapV3PoolAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const erc20MetadataAbi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const DEFAULT_SNAPSHOT_TTL_MS = 60_000;
const DEFAULT_MAX_BLOCKS = 9_500;
const EVENT_STORE_VERSION = "market-events-v3";
const BALANCER_V2_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8" as const;

const snapshotCache = new Map<string, SnapshotCacheEntry>();
const snapshotInflight = new Map<string, Promise<OnchainSnapshot>>();
const tokenMetaCache = new Map<string, AssetMeta>();
const uniswapPoolTokenCache = new Map<string, [Address, Address]>();

function hasRealValue(value: string | undefined): boolean {
  return Boolean(value && value.trim() && !value.includes("YOUR_"));
}

function snapshotTtlMs(): number {
  const configured = Number(process.env.DASHBOARD_ONCHAIN_SNAPSHOT_TTL_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_SNAPSHOT_TTL_MS;
}

function maxBlocks(): number {
  const configured = Number(process.env.DASHBOARD_ONCHAIN_MAX_BLOCKS);
  return Number.isFinite(configured) && configured > 0
    ? Math.trunc(configured)
    : DEFAULT_MAX_BLOCKS;
}

function eventStoreDir(): string {
  return (
    process.env.DASHBOARD_ONCHAIN_EVENT_STORE_DIR ??
    path.resolve(process.cwd(), ".data", "onchain-events")
  );
}

function eventStorePath(chain: ChainPreset): string {
  return path.join(eventStoreDir(), `${chain.key}-${chain.pool.toLowerCase()}.json`);
}

function readEventStore(chain: ChainPreset): OnchainEventStore | null {
  const filePath = eventStorePath(chain);
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as OnchainEventStore;
    if (
      parsed?.version !== EVENT_STORE_VERSION ||
      parsed.chain !== chain.key ||
      parsed.pool?.toLowerCase() !== chain.pool.toLowerCase() ||
      !Array.isArray(parsed.flashloans) ||
      !Array.isArray(parsed.liquidations)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeEventStore(chain: ChainPreset, store: OnchainEventStore): void {
  try {
    mkdirSync(eventStoreDir(), { recursive: true });
    writeFileSync(eventStorePath(chain), JSON.stringify(store, null, 2), "utf8");
  } catch {
    // The dashboard can always fall back to live RPC reads if persistence fails.
  }
}

function configuredAddresses(envName: string): Address[] {
  return (process.env[envName] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is Address => isAddress(item))
    .map((item) => getAddress(item));
}

function eventSourcesForChain(chain: ChainPreset): EventSource[] {
  const sources: EventSource[] = [
    {
      kind: "aave",
      label: chain.protocol.label,
      address: chain.pool,
      events: aavePoolEvents,
    },
  ];

  if (chain.key === "ethereum" || chain.key === "polygon" || chain.key === "arbitrum") {
    sources.push({
      kind: "balancer",
      label: "Balancer",
      address: BALANCER_V2_VAULT,
      events: balancerFlashloanEvents,
    });
  }

  if (chain.key === "ethereum") {
    sources.push({
      kind: "uniswap-v3",
      label: "Uniswap V3",
      events: uniswapV3FlashEvents,
    });
  }

  for (const address of configuredAddresses("DASHBOARD_ERC3156_LENDERS")) {
    sources.push({
      kind: "erc3156",
      label: "ERC-3156",
      address,
      events: erc3156FlashloanEvents,
    });
  }

  return sources;
}

function chainFromKey(value: string): ChainPreset | null {
  return CHAIN_ALIASES[value as keyof typeof CHAIN_ALIASES] ?? null;
}

function rpcUrlForChain(chain: ChainPreset): string | null {
  return process.env[chain.defaultRpcEnv]?.trim() || null;
}

function daysForPeriod(period: DashboardPeriod): number {
  return period === "1" ? 1 : period === "30" ? 30 : 7;
}

function approximateBlocksPerDay(chain: ChainPreset): number {
  if (chain.key === "ethereum") return 7_200;
  if (chain.key === "bnb") return 28_800;
  if (chain.key === "polygon") return 43_200;
  return 345_600;
}

function blockWindow(chain: ChainPreset, period: DashboardPeriod, latestBlock: bigint): {
  fromBlock: bigint;
  requestedBlocks: number;
  scannedBlocks: number;
  windowTruncated: boolean;
} {
  const requestedBlocks = daysForPeriod(period) * approximateBlocksPerDay(chain);
  const scannedBlocks = Math.min(requestedBlocks, maxBlocks());
  const fromBlock = latestBlock > BigInt(scannedBlocks)
    ? latestBlock - BigInt(scannedBlocks) + 1n
    : 0n;
  return {
    fromBlock,
    requestedBlocks,
    scannedBlocks,
    windowTruncated: scannedBlocks < requestedBlocks,
  };
}

function isRetryableLogRangeError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("request too large") ||
    message.includes("response size exceeded") ||
    message.includes("query returned more than") ||
    message.includes("block range") ||
    message.includes("limited to a") ||
    message.includes("10,000 range") ||
    message.includes("10000 range") ||
    message.includes("limit exceeded") ||
    message.includes("too many results")
  );
}

async function getLogsAdaptive(
  client: PublicClient,
  params: {
    address?: Address;
    events: readonly unknown[];
    fromBlock: bigint;
    toBlock: bigint;
  },
): Promise<any[]> {
  try {
    return await client.getLogs({
      ...(params.address ? { address: params.address } : {}),
      events: params.events as any,
      fromBlock: params.fromBlock,
      toBlock: params.toBlock,
      strict: false,
    });
  } catch (error) {
    const span = params.toBlock - params.fromBlock;
    if (!isRetryableLogRangeError(error) || span <= 0n) {
      throw error;
    }
    const midpoint = params.fromBlock + span / 2n;
    const [left, right] = await Promise.all([
      getLogsAdaptive(client, {
        address: params.address,
        events: params.events,
        fromBlock: params.fromBlock,
        toBlock: midpoint,
      }),
      getLogsAdaptive(client, {
        address: params.address,
        events: params.events,
        fromBlock: midpoint + 1n,
        toBlock: params.toBlock,
      }),
    ]);
    return [...left, ...right];
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const output: R[] = [];
  let next = 0;
  async function run(): Promise<void> {
    while (next < values.length) {
      const index = next;
      next += 1;
      output[index] = await worker(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => run()),
  );
  return output;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}

function asAddress(value: unknown): Address | null {
  return typeof value === "string" && isAddress(value) ? getAddress(value) : null;
}

function baseCurrencyDecimals(baseCurrencyUnit: bigint): number {
  return Math.max(0, baseCurrencyUnit.toString().length - 1);
}

function tokenQuantity(amount: bigint, decimals: bigint): number {
  const value = Number(formatUnits(amount, Number(decimals)));
  return Number.isFinite(value) ? value : 0;
}

function priceUsd(price: bigint, baseCurrencyUnit: bigint): number {
  const value = Number(formatUnits(price, baseCurrencyDecimals(baseCurrencyUnit)));
  return Number.isFinite(value) ? value : 0;
}

function amountUsd(amount: bigint, meta: AssetMeta, baseCurrencyUnit: bigint): number {
  return tokenQuantity(amount, meta.decimals) * priceUsd(meta.price, baseCurrencyUnit);
}

function shortAddress(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function reserveMap(reserves: ReserveMetadata[]): Map<string, AssetMeta> {
  return new Map(
    reserves.map((reserve) => [
      reserve.asset.toLowerCase(),
      {
        asset: reserve.asset,
        symbol: reserve.symbol,
        decimals: reserve.decimals,
        price: reserve.price,
      },
    ]),
  );
}

function assetMeta(asset: Address | null, reserves: Map<string, AssetMeta>): AssetMeta {
  if (asset) {
    const matched = reserves.get(asset.toLowerCase());
    if (matched) return matched;
  }
  return {
    asset: asset ?? "0x0000000000000000000000000000000000000000",
    symbol: asset ? shortAddress(asset) : "--",
    decimals: 18n,
    price: 0n,
  };
}

async function readTokenMeta(
  client: PublicClient,
  asset: Address | null,
  reserves: Map<string, AssetMeta>,
): Promise<AssetMeta> {
  if (!asset) return assetMeta(asset, reserves);
  const reserve = reserves.get(asset.toLowerCase());
  if (reserve) return reserve;
  const cached = tokenMetaCache.get(asset.toLowerCase());
  if (cached) return cached;

  const [symbol, decimals] = await Promise.all([
    client
      .readContract({
        address: asset,
        abi: erc20MetadataAbi,
        functionName: "symbol",
      })
      .catch(() => shortAddress(asset)),
    client
      .readContract({
        address: asset,
        abi: erc20MetadataAbi,
        functionName: "decimals",
      })
      .catch(() => 18),
  ]);
  const meta = {
    asset,
    symbol: String(symbol || shortAddress(asset)),
    decimals: BigInt(Number(decimals) || 18),
    price: 0n,
  };
  tokenMetaCache.set(asset.toLowerCase(), meta);
  return meta;
}

async function uniswapPoolTokens(
  client: PublicClient,
  pool: Address,
): Promise<[Address, Address] | null> {
  const cacheKey = pool.toLowerCase();
  const cached = uniswapPoolTokenCache.get(cacheKey);
  if (cached) return cached;
  try {
    const [token0, token1] = await Promise.all([
      client.readContract({
        address: pool,
        abi: uniswapV3PoolAbi,
        functionName: "token0",
      }),
      client.readContract({
        address: pool,
        abi: uniswapV3PoolAbi,
        functionName: "token1",
      }),
    ]);
    const tokens: [Address, Address] = [getAddress(token0), getAddress(token1)];
    uniswapPoolTokenCache.set(cacheKey, tokens);
    return tokens;
  } catch {
    return null;
  }
}

async function blockTimestampMap(
  client: PublicClient,
  logs: Array<{ blockNumber?: bigint | null }>,
): Promise<Map<string, number>> {
  const blockNumbers = Array.from(
    new Set(
      logs
        .map((log) => log.blockNumber)
        .filter((blockNumber): blockNumber is bigint => typeof blockNumber === "bigint")
        .map((blockNumber) => blockNumber.toString()),
    ),
  );
  const pairs = await mapWithConcurrency(blockNumbers, 8, async (blockNumberText) => {
    const block = await client.getBlock({ blockNumber: BigInt(blockNumberText) });
    return [blockNumberText, Number(block.timestamp)] as const;
  });
  return new Map(pairs);
}

function eventTimestamp(
  timestamps: Map<string, number>,
  blockNumber: bigint | null | undefined,
): number {
  if (typeof blockNumber !== "bigint") return 0;
  return timestamps.get(blockNumber.toString()) ?? 0;
}

function protocolInfo(protocolName: string): Record<string, unknown> {
  return {
    showName: protocolName,
    name: protocolName,
  };
}

function bucketTimestamp(timestamp: number, period: DashboardPeriod): number {
  if (period === "1") {
    return Math.floor(timestamp / 3_600) * 3_600;
  }
  const date = new Date(timestamp * 1_000);
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1_000,
  );
}

function sortByTimeDesc<T extends { time: number }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => right.time - left.time);
}

function flashloanKey(row: FlashloanRow): string {
  return [
    row.txHash,
    row.blockNumber,
    row.borrower,
    row.asset,
    row.amount,
    row.fee,
  ].join("|");
}

function liquidationKey(row: LiquidationRow): string {
  return [
    row.txHash,
    row.blockNumber,
    row.borrower,
    row.liquidator,
    row.debtAsset,
    row.liquidationAsset,
  ].join("|");
}

function dedupeRows<T>(rows: T[], keyForRow: (row: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const row of rows) {
    const key = keyForRow(row);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

function numericBlock(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function filterBlockRange<T extends { blockNumber: number }>(
  rows: T[],
  fromBlock: bigint,
  toBlock: bigint,
): T[] {
  return rows.filter((row) => {
    const blockNumber = numericBlock(row.blockNumber);
    return blockNumber >= Number(fromBlock) && blockNumber <= Number(toBlock);
  });
}

function retentionFromBlock(latestBlock: bigint): bigint {
  const retentionBlocks = BigInt(maxBlocks());
  return latestBlock > retentionBlocks ? latestBlock - retentionBlocks + 1n : 0n;
}

function buildFlashloanTrend(rows: FlashloanRow[], period: DashboardPeriod): Record<string, unknown>[] {
  const buckets = new Map<number, { timestamp: number; amount: number; txCount: number }>();
  for (const row of rows) {
    const key = bucketTimestamp(row.time, period);
    const bucket = buckets.get(key) ?? { timestamp: key, amount: 0, txCount: 0 };
    bucket.amount += row.amount;
    bucket.txCount += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function buildLiquidationTrend(rows: LiquidationRow[], period: DashboardPeriod): Record<string, unknown>[] {
  const buckets = new Map<number, {
    timestamp: number;
    liquidationAmount: number;
    liquidationTxCount: number;
  }>();
  for (const row of rows) {
    const key = bucketTimestamp(row.time, period);
    const bucket = buckets.get(key) ?? {
      timestamp: key,
      liquidationAmount: 0,
      liquidationTxCount: 0,
    };
    bucket.liquidationAmount += row.liquidationAmount;
    bucket.liquidationTxCount += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function buildProfitDistribution(rows: LiquidationRow[]): Record<string, unknown>[] {
  const ranges = [0, 10, 100, 1_000, 10_000, 100_000, 1_000_000];
  const counts = new Map<number, number>(ranges.map((range) => [range, 0]));
  for (const row of rows) {
    const profit = Math.max(0, row.profit);
    const range = ranges.find((candidate) => profit <= candidate) ?? ranges[ranges.length - 1];
    counts.set(range, (counts.get(range) ?? 0) + 1);
  }
  return ranges
    .map((range) => ({ range, count: counts.get(range) ?? 0 }))
    .filter((row) => row.count > 0);
}

function latestDateMatches(row: { time: number }, dateText?: string): boolean {
  if (!dateText) return true;
  const date = new Date(row.time * 1_000);
  const value = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return value === dateText;
}

function aggregateByKey<T extends Record<string, unknown>>(
  rows: T[],
  keyName: keyof T,
  seed: (row: T) => Record<string, unknown>,
): Record<string, unknown>[] {
  const buckets = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = String(row[keyName] ?? "--");
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, seed(row));
      continue;
    }
    for (const field of ["amount", "txCount", "liquidatedAssetCount"]) {
      existing[field] = Number(existing[field] ?? 0) + Number(row[field] ?? 0);
    }
  }
  return [...buckets.values()];
}

async function parseOnchainLogs(
  client: PublicClient,
  chain: ChainPreset,
  metadata: ReserveMetadataBundle,
  source: EventSource,
  logs: any[],
): Promise<{
  flashloans: FlashloanRow[];
  liquidations: LiquidationRow[];
}> {
  const timestamps = await blockTimestampMap(client, logs);
  const reserves = reserveMap(metadata.reserves);
  const protocolName = source.label;
  const flashloans: FlashloanRow[] = [];
  const liquidations: LiquidationRow[] = [];

  for (const rawLog of logs) {
    const log = rawLog as {
      eventName?: string;
      args?: Record<string, unknown>;
      transactionHash?: string;
      blockNumber?: bigint;
    };
    const args = asRecord(log.args);
    const time = eventTimestamp(timestamps, log.blockNumber);
    const txHash = typeof log.transactionHash === "string" ? log.transactionHash : "--";
    const blockNumber = typeof log.blockNumber === "bigint" ? Number(log.blockNumber) : 0;

    if (
      source.kind === "aave" &&
      (log.eventName === "FlashLoan" || log.eventName === "FlashLoanSimple")
    ) {
      const asset = asAddress(args.asset);
      const meta = assetMeta(asset, reserves);
      const amount = asBigInt(args.amount);
      const premium = asBigInt(args.premium);
      const borrower = asAddress(args.initiator) ?? asAddress(args.target);
      const amountValue = amountUsd(amount, meta, metadata.baseCurrencyUnit);
      const feeValue = amountUsd(premium, meta, metadata.baseCurrencyUnit);
      flashloans.push({
        time,
        txHash,
        purpose: log.eventName === "FlashLoanSimple" ? "FlashLoanSimple" : "FlashLoan",
        blockNumber,
        tokenCount: 1,
        lpCount: 1,
        borrower: borrower ?? "--",
        asset: meta.symbol,
        protocol: protocolName,
        amount: amountValue,
        fee: feeValue,
        legs: [
          {
            borrower: borrower ?? "--",
            amount: amountValue,
            fee: feeValue,
            asset: meta.symbol,
            protocol: protocolName,
            protocolInfo: protocolInfo(protocolName),
            assetInfo: {
              symbol: meta.symbol,
              tokenSymbol: meta.symbol,
              address: meta.asset,
            },
          },
        ],
      });
    }

    if (source.kind === "balancer" && log.eventName === "FlashLoan") {
      const asset = asAddress(args.token);
      const meta = await readTokenMeta(client, asset, reserves);
      const amount = asBigInt(args.amount);
      const fee = asBigInt(args.feeAmount);
      const borrower = asAddress(args.recipient);
      const amountValue = amountUsd(amount, meta, metadata.baseCurrencyUnit);
      const feeValue = amountUsd(fee, meta, metadata.baseCurrencyUnit);
      flashloans.push({
        time,
        txHash,
        purpose: "BalancerFlashLoan",
        blockNumber,
        tokenCount: 1,
        lpCount: 1,
        borrower: borrower ?? "--",
        asset: meta.symbol,
        protocol: protocolName,
        amount: amountValue,
        fee: feeValue,
        legs: [
          {
            borrower: borrower ?? "--",
            amount: amountValue,
            fee: feeValue,
            asset: meta.symbol,
            protocol: protocolName,
            protocolInfo: protocolInfo(protocolName),
            assetInfo: {
              symbol: meta.symbol,
              tokenSymbol: meta.symbol,
              address: meta.asset,
            },
          },
        ],
      });
    }

    if (source.kind === "uniswap-v3" && log.eventName === "Flash") {
      const pool = asAddress((rawLog as { address?: unknown }).address);
      const tokens = pool ? await uniswapPoolTokens(client, pool) : null;
      if (!tokens) continue;
      const [token0, token1] = tokens;
      const [meta0, meta1] = await Promise.all([
        readTokenMeta(client, token0, reserves),
        readTokenMeta(client, token1, reserves),
      ]);
      const amount0 = asBigInt(args.amount0);
      const amount1 = asBigInt(args.amount1);
      const paid0 = asBigInt(args.paid0);
      const paid1 = asBigInt(args.paid1);
      const amount0Value = amountUsd(amount0, meta0, metadata.baseCurrencyUnit);
      const amount1Value = amountUsd(amount1, meta1, metadata.baseCurrencyUnit);
      const fee0Value = amountUsd(paid0 > amount0 ? paid0 - amount0 : 0n, meta0, metadata.baseCurrencyUnit);
      const fee1Value = amountUsd(paid1 > amount1 ? paid1 - amount1 : 0n, meta1, metadata.baseCurrencyUnit);
      const borrower = asAddress(args.recipient) ?? asAddress(args.sender);
      const legs: Record<string, unknown>[] = [];
      if (amount0 > 0n) {
        legs.push({
          borrower: borrower ?? "--",
          amount: amount0Value,
          fee: fee0Value,
          asset: meta0.symbol,
          protocol: protocolName,
          protocolInfo: protocolInfo(protocolName),
          assetInfo: {
            symbol: meta0.symbol,
            tokenSymbol: meta0.symbol,
            address: meta0.asset,
          },
        });
      }
      if (amount1 > 0n) {
        legs.push({
          borrower: borrower ?? "--",
          amount: amount1Value,
          fee: fee1Value,
          asset: meta1.symbol,
          protocol: protocolName,
          protocolInfo: protocolInfo(protocolName),
          assetInfo: {
            symbol: meta1.symbol,
            tokenSymbol: meta1.symbol,
            address: meta1.asset,
          },
        });
      }
      flashloans.push({
        time,
        txHash,
        purpose: "UniswapV3Flash",
        blockNumber,
        tokenCount: legs.length,
        lpCount: 1,
        borrower: borrower ?? "--",
        asset: legs.map((leg) => String(leg.asset)).join(" ") || "--",
        protocol: protocolName,
        amount: amount0Value + amount1Value,
        fee: fee0Value + fee1Value,
        legs,
      });
    }

    if (source.kind === "erc3156" && log.eventName === "FlashLoan") {
      const asset = asAddress(args.token);
      const meta = await readTokenMeta(client, asset, reserves);
      const amount = asBigInt(args.amount);
      const fee = asBigInt(args.fee);
      const borrower = asAddress(args.receiver);
      const amountValue = amountUsd(amount, meta, metadata.baseCurrencyUnit);
      const feeValue = amountUsd(fee, meta, metadata.baseCurrencyUnit);
      flashloans.push({
        time,
        txHash,
        purpose: "ERC3156FlashLoan",
        blockNumber,
        tokenCount: 1,
        lpCount: 1,
        borrower: borrower ?? "--",
        asset: meta.symbol,
        protocol: protocolName,
        amount: amountValue,
        fee: feeValue,
        legs: [
          {
            borrower: borrower ?? "--",
            amount: amountValue,
            fee: feeValue,
            asset: meta.symbol,
            protocol: protocolName,
            protocolInfo: protocolInfo(protocolName),
            assetInfo: {
              symbol: meta.symbol,
              tokenSymbol: meta.symbol,
              address: meta.asset,
            },
          },
        ],
      });
    }

    if (source.kind === "aave" && log.eventName === "LiquidationCall") {
      const collateralAsset = asAddress(args.collateralAsset);
      const debtAsset = asAddress(args.debtAsset);
      const collateralMeta = assetMeta(collateralAsset, reserves);
      const debtMeta = assetMeta(debtAsset, reserves);
      const debtToCover = asBigInt(args.debtToCover);
      const liquidatedCollateralAmount = asBigInt(args.liquidatedCollateralAmount);
      const debtUsd = amountUsd(debtToCover, debtMeta, metadata.baseCurrencyUnit);
      const collateralUsd = amountUsd(
        liquidatedCollateralAmount,
        collateralMeta,
        metadata.baseCurrencyUnit,
      );
      liquidations.push({
        time,
        txHash,
        blockNumber,
        borrower: asAddress(args.user) ?? "--",
        liquidator: asAddress(args.liquidator) ?? "--",
        debtAsset: debtMeta.symbol,
        debtToCover: debtUsd,
        debtQuantity: tokenQuantity(debtToCover, debtMeta.decimals),
        liquidationAsset: collateralMeta.symbol,
        liquidationAmount: collateralUsd,
        liquidationQuantity: tokenQuantity(liquidatedCollateralAmount, collateralMeta.decimals),
        protocol: protocolName,
        profit: collateralUsd - debtUsd,
      });
    }
  }

  return { flashloans, liquidations };
}

async function scanOnchainRange(
  client: PublicClient,
  chain: ChainPreset,
  metadata: ReserveMetadataBundle,
  source: EventSource,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{
  flashloans: FlashloanRow[];
  liquidations: LiquidationRow[];
}> {
  if (fromBlock > toBlock) {
    return { flashloans: [], liquidations: [] };
  }
  const logs = await getLogsAdaptive(client, {
    address: source.address,
    events: source.events,
    fromBlock,
    toBlock,
  });
  return parseOnchainLogs(client, chain, metadata, source, logs);
}

async function loadOnchainSnapshot(
  chain: ChainPreset,
  period: DashboardPeriod,
): Promise<OnchainSnapshot> {
  const cacheKey = `${chain.key}:${period}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }
  const inflight = snapshotInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const rpcUrl = rpcUrlForChain(chain);
    if (!rpcUrl) {
      throw new Error(`${chain.defaultRpcEnv} is not configured.`);
    }

    const client = createPublicClient({ transport: http(rpcUrl) });
    const latestBlock = await client.getBlockNumber();
    const window = blockWindow(chain, period, latestBlock);
    const metadata = await loadReserveMetadata(client, chain.poolAddressesProvider);
    const protocolName = chain.protocol.label;
    const sources = eventSourcesForChain(chain);
    const existingStore = readEventStore(chain);
    let flashloans: FlashloanRow[] = [];
    let liquidations: LiquidationRow[] = [];
    let storeFromBlock = window.fromBlock;
    let storeToBlock = latestBlock;

    if (existingStore) {
      flashloans = existingStore.flashloans;
      liquidations = existingStore.liquidations;
      storeFromBlock = BigInt(existingStore.fromBlock);
      storeToBlock = BigInt(existingStore.toBlock);

      const scans: Array<Promise<{
        flashloans: FlashloanRow[];
        liquidations: LiquidationRow[];
      }>> = [];
      if (storeFromBlock > window.fromBlock) {
        for (const source of sources) {
          scans.push(
            scanOnchainRange(
              client,
              chain,
              metadata,
              source,
              window.fromBlock,
              storeFromBlock - 1n,
            ),
          );
        }
      }
      if (storeToBlock < latestBlock) {
        for (const source of sources) {
          scans.push(
            scanOnchainRange(
              client,
              chain,
              metadata,
              source,
              storeToBlock + 1n,
              latestBlock,
            ),
          );
        }
      }
      for (const result of await Promise.all(scans)) {
        flashloans.push(...result.flashloans);
        liquidations.push(...result.liquidations);
      }
      storeFromBlock = storeFromBlock > window.fromBlock ? window.fromBlock : storeFromBlock;
      storeToBlock = storeToBlock < latestBlock ? latestBlock : storeToBlock;
    } else {
      const scanned = await Promise.all(
        sources.map((source) =>
          scanOnchainRange(
            client,
            chain,
            metadata,
            source,
            window.fromBlock,
            latestBlock,
          ),
        ),
      );
      for (const result of scanned) {
        flashloans.push(...result.flashloans);
        liquidations.push(...result.liquidations);
      }
    }

    const retentionFrom = retentionFromBlock(latestBlock);
    flashloans = sortByTimeDesc(
      dedupeRows(
        filterBlockRange(flashloans, retentionFrom, latestBlock),
        flashloanKey,
      ),
    );
    liquidations = sortByTimeDesc(
      dedupeRows(
        filterBlockRange(liquidations, retentionFrom, latestBlock),
        liquidationKey,
      ),
    );
    writeEventStore(chain, {
      version: EVENT_STORE_VERSION,
      chain: chain.key,
      pool: chain.pool,
      savedAt: new Date().toISOString(),
      fromBlock: Number(retentionFrom),
      toBlock: Number(latestBlock),
      flashloans,
      liquidations,
    });

    const windowFlashloans = filterBlockRange(flashloans, window.fromBlock, latestBlock);
    const windowLiquidations = filterBlockRange(liquidations, window.fromBlock, latestBlock);

    const snapshot: OnchainSnapshot = {
      chain,
      period,
      fetchedAt: new Date().toISOString(),
      updateTimestamp: Math.max(
        0,
        ...windowFlashloans.map((row) => row.time),
        ...windowLiquidations.map((row) => row.time),
      ) || null,
      fromBlock: Number(window.fromBlock),
      toBlock: Number(latestBlock),
      requestedBlocks: window.requestedBlocks,
      scannedBlocks: window.scannedBlocks,
      windowTruncated: window.windowTruncated,
      protocolName,
      flashloans: sortByTimeDesc(windowFlashloans),
      liquidations: sortByTimeDesc(windowLiquidations),
    };
    snapshotCache.set(cacheKey, {
      expiresAt: Date.now() + snapshotTtlMs(),
      payload: snapshot,
    });
    return snapshot;
  })().finally(() => {
    snapshotInflight.delete(cacheKey);
  });

  snapshotInflight.set(cacheKey, promise);
  return promise;
}

export async function latestOnchainMarketBlock(chainKey: string): Promise<number> {
  const chain = chainFromKey(chainKey);
  if (!chain) {
    throw new Error(`Unsupported market-data chain: ${chainKey}`);
  }
  const rpcUrl = rpcUrlForChain(chain);
  if (!rpcUrl) {
    throw new Error(`${chain.defaultRpcEnv} is not configured.`);
  }
  const client = createPublicClient({ transport: http(rpcUrl) });
  return Number(await client.getBlockNumber());
}

export async function scanOnchainMarketBlockRange(params: {
  chainKey: string;
  fromBlock: number;
  toBlock: number;
  period?: DashboardPeriod;
}): Promise<OnchainSnapshot> {
  const chain = chainFromKey(params.chainKey);
  if (!chain) {
    throw new Error(`Unsupported market-data chain: ${params.chainKey}`);
  }
  if (!Number.isFinite(params.fromBlock) || !Number.isFinite(params.toBlock)) {
    throw new Error("Invalid market-data block range.");
  }
  const fromBlock = BigInt(Math.max(0, Math.trunc(params.fromBlock)));
  const toBlock = BigInt(Math.max(0, Math.trunc(params.toBlock)));
  if (fromBlock > toBlock) {
    return {
      chain,
      period: params.period ?? "1",
      fetchedAt: new Date().toISOString(),
      updateTimestamp: null,
      fromBlock: Number(fromBlock),
      toBlock: Number(toBlock),
      requestedBlocks: 0,
      scannedBlocks: 0,
      windowTruncated: false,
      protocolName: "Market Events",
      flashloans: [],
      liquidations: [],
    };
  }
  const rpcUrl = rpcUrlForChain(chain);
  if (!rpcUrl) {
    throw new Error(`${chain.defaultRpcEnv} is not configured.`);
  }
  const client = createPublicClient({ transport: http(rpcUrl) });
  const metadata = await loadReserveMetadata(client, chain.poolAddressesProvider);
  const scanned = await Promise.all(
    eventSourcesForChain(chain).map((source) =>
      scanOnchainRange(client, chain, metadata, source, fromBlock, toBlock),
    ),
  );
  const flashloans = sortByTimeDesc(
    dedupeRows(scanned.flatMap((result) => result.flashloans), flashloanKey),
  );
  const liquidations = sortByTimeDesc(
    dedupeRows(scanned.flatMap((result) => result.liquidations), liquidationKey),
  );
  return {
    chain,
    period: params.period ?? "1",
    fetchedAt: new Date().toISOString(),
    updateTimestamp: Math.max(
      0,
      ...flashloans.map((row) => row.time),
      ...liquidations.map((row) => row.time),
    ) || null,
    fromBlock: Number(fromBlock),
    toBlock: Number(toBlock),
    requestedBlocks: Number(toBlock - fromBlock + 1n),
    scannedBlocks: Number(toBlock - fromBlock + 1n),
    windowTruncated: false,
    protocolName: "Market Events",
    flashloans,
    liquidations,
  };
}

export function buildFlashloanOverview(snapshot: OnchainSnapshot): Record<string, unknown> {
  const rows = snapshot.flashloans;
  const borrowers = new Set(rows.map((row) => row.borrower));
  const assets = new Set(rows.map((row) => row.asset));
  const protocols = new Map<string, {
    amount: number;
    fee: number;
    txCount: number;
    borrowers: Set<string>;
    assets: Set<string>;
  }>();
  for (const row of rows) {
    const bucket = protocols.get(row.protocol) ?? {
      amount: 0,
      fee: 0,
      txCount: 0,
      borrowers: new Set<string>(),
      assets: new Set<string>(),
    };
    bucket.amount += row.amount;
    bucket.fee += row.fee;
    bucket.txCount += 1;
    bucket.borrowers.add(row.borrower);
    bucket.assets.add(row.asset);
    protocols.set(row.protocol, bucket);
  }
  const updateTimestamp = snapshot.updateTimestamp;
  return {
    ok: true,
    sourcePage: "onchain:market-events",
    sourceProject: "local-rpc-indexer",
    chain: snapshot.chain.key,
    period: snapshot.period,
    fetchedAt: snapshot.fetchedAt,
    fromBlock: snapshot.fromBlock,
    toBlock: snapshot.toBlock,
    requestedBlocks: snapshot.requestedBlocks,
    scannedBlocks: snapshot.scannedBlocks,
    windowTruncated: snapshot.windowTruncated,
    summary: {
      data: {
        txCount: rows.length,
        amount: rows.reduce((sum, row) => sum + row.amount, 0),
        fee: rows.reduce((sum, row) => sum + row.fee, 0),
        flashloanCount: rows.length,
        flashloanBorrowerCount: borrowers.size,
        flashloanAssetCount: assets.size,
      },
      updateTimestamp,
    },
    trend: {
      data: buildFlashloanTrend(rows, snapshot.period),
      updateTimestamp,
    },
    protocols: {
      data: [...protocols.entries()]
        .map(([name, bucket]) => ({
          protocolInfo: protocolInfo(name),
          amount: bucket.amount,
          fee: bucket.fee,
          txCount: bucket.txCount,
          borrowerCount: bucket.borrowers.size,
          flashloanCount: bucket.txCount,
          flashloanAssetCount: bucket.assets.size,
          assets: [...bucket.assets].map((symbol) => ({ symbol, tokenSymbol: symbol })),
        }))
        .sort((left, right) => right.amount - left.amount),
      updateTimestamp,
    },
    top: {
      rows: [...rows].sort((left, right) => right.amount - left.amount).slice(0, 50),
      updateTimestamp,
    },
    latest: {
      rows: rows.slice(0, 50),
      updateTimestamp,
    },
  };
}

export function buildLiquidationOverview(snapshot: OnchainSnapshot): Record<string, unknown> {
  const rows = snapshot.liquidations;
  const liquidators = new Set(rows.map((row) => row.liquidator));
  const borrowers = new Set(rows.map((row) => row.borrower));
  const assets = new Set(rows.map((row) => row.liquidationAsset));
  const updateTimestamp = snapshot.updateTimestamp;
  return {
    ok: true,
    sourcePage: "onchain:market-events",
    sourceProject: "local-rpc-indexer",
    chain: snapshot.chain.key,
    period: snapshot.period,
    fetchedAt: snapshot.fetchedAt,
    fromBlock: snapshot.fromBlock,
    toBlock: snapshot.toBlock,
    requestedBlocks: snapshot.requestedBlocks,
    scannedBlocks: snapshot.scannedBlocks,
    windowTruncated: snapshot.windowTruncated,
    summary: {
      data: {
        txCount: rows.length,
        liquidationAmount: rows.reduce((sum, row) => sum + row.liquidationAmount, 0),
        profit: rows.reduce((sum, row) => sum + row.profit, 0),
        cost: rows.reduce((sum, row) => sum + row.debtToCover, 0),
        revenue: rows.reduce((sum, row) => sum + row.liquidationAmount, 0),
        liquidatedBorrowerCount: borrowers.size,
        liquidatedAssetCount: assets.size,
        liquidatorCount: liquidators.size,
      },
      updateTimestamp,
    },
    trend: {
      data: buildLiquidationTrend(rows, snapshot.period),
      updateTimestamp,
    },
    distribution: {
      data: buildProfitDistribution(rows),
      updateTimestamp,
    },
    protocols: {
      data: [
        {
          protocolInfo: protocolInfo(snapshot.protocolName),
          liquidationAmount: rows.reduce((sum, row) => sum + row.liquidationAmount, 0),
          liquidationTxCount: rows.length,
          liquidatorCount: liquidators.size,
          liquidatedBorrowerCount: borrowers.size,
          liquidatedAssetCount: assets.size,
        },
      ].filter((row) => row.liquidationTxCount > 0),
      updateTimestamp,
    },
  };
}

export function buildLiquidationLeaderboard(snapshot: OnchainSnapshot): Record<string, unknown> {
  const rows = snapshot.liquidations;
  const liquidationRows = rows.map((row) => ({
    time: row.time,
    liquidator: row.liquidator,
    borrower: row.borrower,
    asset: row.liquidationAsset,
    amount: row.liquidationAmount,
    protocol: row.protocol,
    txHash: row.txHash,
    txCount: 1,
  }));
  const updateTimestamp = snapshot.updateTimestamp;
  return {
    ok: true,
    sourcePage: "onchain:market-events",
    sourceProject: "local-rpc-indexer",
    chain: snapshot.chain.key,
    period: snapshot.period,
    fetchedAt: snapshot.fetchedAt,
    fromBlock: snapshot.fromBlock,
    toBlock: snapshot.toBlock,
    requestedBlocks: snapshot.requestedBlocks,
    scannedBlocks: snapshot.scannedBlocks,
    windowTruncated: snapshot.windowTruncated,
    latest: {
      rows: liquidationRows.slice(0, 10),
      updateTimestamp,
    },
    tabs: {
      txProfit: {
        rows: rows
          .map((row) => ({
            time: row.time,
            liquidator: row.liquidator,
            asset: row.liquidationAsset,
            profit: row.profit,
            cost: row.debtToCover,
            revenue: row.liquidationAmount,
            protocol: row.protocol,
            txHash: row.txHash,
            count: 1,
            txCount: 1,
          }))
          .sort((left, right) => right.profit - left.profit),
      },
      liquidations: {
        rows: [...liquidationRows].sort((left, right) => right.amount - left.amount),
      },
      liquidators: {
        rows: aggregateByKey(liquidationRows, "liquidator", (row) => ({
          liquidator: row.liquidator,
          amount: row.amount,
          txCount: 1,
          liquidatedAssetCount: 1,
        })).sort((left, right) => Number(right.amount ?? 0) - Number(left.amount ?? 0)),
      },
      liquidatedAssets: {
        rows: aggregateByKey(liquidationRows, "asset", (row) => ({
          asset: row.asset,
          amount: row.amount,
          txCount: 1,
        })).sort((left, right) => Number(right.amount ?? 0) - Number(left.amount ?? 0)),
      },
      liquidatedBorrowers: {
        rows: aggregateByKey(liquidationRows, "borrower", (row) => ({
          borrower: row.borrower,
          amount: row.amount,
          txCount: 1,
          liquidatedAssetCount: 1,
        })).sort((left, right) => Number(right.amount ?? 0) - Number(left.amount ?? 0)),
      },
    },
  };
}

export function buildLatestLiquidation(
  snapshot: OnchainSnapshot,
  context: DashboardProviderContext,
): Record<string, unknown> {
  const page = Math.max(0, Math.trunc(context.page ?? 0));
  const pageSize = Math.max(5, Math.min(100, Math.trunc(context.pageSize ?? 10)));
  const offset = page * pageSize;
  const matchedRows = snapshot.liquidations.filter((row) =>
    latestDateMatches(row, context.date),
  );
  const rows = matchedRows.slice(offset, offset + pageSize);
  return {
    ok: true,
    sourcePage: "onchain:market-events",
    sourceProject: "local-rpc-indexer",
    chain: snapshot.chain.key,
    date: context.date ?? null,
    page,
    pageSize,
    hasPrev: page > 0,
    hasNext: matchedRows.length > offset + pageSize,
    rangeStart: offset,
    rangeEnd: offset + rows.length,
    fromBlock: snapshot.fromBlock,
    toBlock: snapshot.toBlock,
    requestedBlocks: snapshot.requestedBlocks,
    scannedBlocks: snapshot.scannedBlocks,
    windowTruncated: snapshot.windowTruncated,
    updateTimestamp: snapshot.updateTimestamp,
    rows,
  };
}

export async function fetchOnchainDashboardPayload(
  context: DashboardProviderContext,
): Promise<Record<string, unknown> | null> {
  const chain = chainFromKey(context.chain);
  if (!chain) return null;
  const period = context.period ?? "30";
  const snapshot = await loadOnchainSnapshot(chain, period);
  if (context.key === "flashloan-overview") return buildFlashloanOverview(snapshot);
  if (context.key === "liquidation-overview") return buildLiquidationOverview(snapshot);
  if (context.key === "liquidation-leaderboard") return buildLiquidationLeaderboard(snapshot);
  return buildLatestLiquidation(snapshot, context);
}

export async function loadOnchainMarketSnapshot(
  chainKey: string,
  period: DashboardPeriod = "1",
): Promise<OnchainSnapshot> {
  const chain = chainFromKey(chainKey);
  if (!chain) {
    throw new Error(`Unsupported market-data chain: ${chainKey}`);
  }
  return loadOnchainSnapshot(chain, period);
}

export function onchainDashboardProviderSummary(): Record<string, unknown> {
  const chains = Object.values(CHAIN_ALIASES).reduce<Record<string, boolean>>((acc, chain) => {
    acc[chain.key] = hasRealValue(process.env[chain.defaultRpcEnv]);
    return acc;
  }, {});
  return {
    provider: "onchain-market-events",
    cacheTtlMs: snapshotTtlMs(),
    maxBlocks: maxBlocks(),
    eventStoreDir: eventStoreDir(),
    rpcConfigured: chains,
  };
}

export function onchainDashboardIndexStatus(): Record<string, unknown> {
  const uniqueChains = Array.from(
    new Map(Object.values(CHAIN_ALIASES).map((chain) => [chain.key, chain])).values(),
  );
  const files = existsSync(eventStoreDir()) ? readdirSync(eventStoreDir()) : [];
  const indexes = uniqueChains.map((chain) => {
    const filePath = eventStorePath(chain);
    const store = readEventStore(chain);
    const stats = existsSync(filePath) ? statSync(filePath) : null;
    return {
      chain: chain.key,
      chainName: chain.name,
      pool: chain.pool,
      rpcConfigured: hasRealValue(process.env[chain.defaultRpcEnv]),
      indexing: snapshotInflight.has(`${chain.key}:1`) ||
        snapshotInflight.has(`${chain.key}:7`) ||
        snapshotInflight.has(`${chain.key}:30`),
      file: filePath,
      exists: Boolean(store && stats),
      fileSizeBytes: stats?.size ?? 0,
      savedAt: store?.savedAt ?? null,
      fromBlock: store?.fromBlock ?? null,
      toBlock: store?.toBlock ?? null,
      flashloanRows: store?.flashloans.length ?? 0,
      liquidationRows: store?.liquidations.length ?? 0,
      sources: eventSourcesForChain(chain).map((source) => ({
        kind: source.kind,
        label: source.label,
        address: source.address ?? null,
      })),
    };
  });
  return {
    ok: true,
    provider: "onchain-market-events",
    eventStoreDir: eventStoreDir(),
    eventStoreVersion: EVENT_STORE_VERSION,
    fileCount: files.length,
    indexing: indexes.some((item) => item.indexing),
    indexes,
  };
}
