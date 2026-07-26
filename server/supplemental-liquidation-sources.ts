const MORPHO_GRAPHQL_URL = "https://api.morpho.org/graphql";
const DEFAULT_CACHE_MS = 30_000;
const DEFAULT_MAX_HEALTH_FACTOR = 1.2;
const DEFAULT_MIN_DEBT_USD = 50;
const DEFAULT_MAX_POSITIONS = 1_500;
const PAGE_SIZE = 500;

type ChainKey = "ethereum" | "bnb" | "arbitrum";

export type SupplementalSnapshotSource = {
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

export type SupplementalSnapshotQueueRow = {
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

export type SupplementalSnapshot = {
  queue: SupplementalSnapshotQueueRow[];
  sources: SupplementalSnapshotSource[];
};

type MorphoPosition = {
  id?: unknown;
  healthFactor?: unknown;
  market?: {
    marketId?: unknown;
    chain?: { id?: unknown; network?: unknown };
    loanAsset?: { symbol?: unknown };
    collateralAsset?: { symbol?: unknown };
  };
  user?: { address?: unknown };
  state?: { collateralUsd?: unknown; borrowAssetsUsd?: unknown };
};

type MorphoResponse = {
  data?: {
    marketPositions?: {
      items?: MorphoPosition[];
      pageInfo?: { count?: unknown; countTotal?: unknown; limit?: unknown; skip?: unknown };
    };
  };
  errors?: Array<{ message?: unknown }>;
};

let cachedSnapshot: { value: SupplementalSnapshot; expiresAt: number } | undefined;
let refreshInFlight: Promise<SupplementalSnapshot> | undefined;

export async function fetchSupplementalLiquidationSnapshot(env: Record<string, string>): Promise<SupplementalSnapshot> {
  if (env.MORPHO_SNAPSHOT_ENABLED?.trim().toLowerCase() === "false") return emptySnapshot();

  const now = Date.now();
  if (cachedSnapshot && cachedSnapshot.expiresAt > now) return cachedSnapshot.value;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = fetchMorphoSnapshot(env)
    .then((value) => {
      cachedSnapshot = { value, expiresAt: Date.now() + boundedInteger(env.MORPHO_SNAPSHOT_CACHE_MS, DEFAULT_CACHE_MS, 5_000, 300_000) };
      return value;
    })
    .catch((error) => {
      if (cachedSnapshot) return cachedSnapshot.value;
      throw error;
    })
    .finally(() => {
      refreshInFlight = undefined;
    });

  return refreshInFlight;
}

async function fetchMorphoSnapshot(env: Record<string, string>): Promise<SupplementalSnapshot> {
  const maximumHealthFactor = boundedNumber(env.LIQUIDATION_CANDIDATE_MAX_HEALTH_FACTOR, DEFAULT_MAX_HEALTH_FACTOR, 1, 2);
  const minimumDebtUsd = boundedNumber(env.LIQUIDATION_CANDIDATE_MIN_DEBT_USD, DEFAULT_MIN_DEBT_USD, 0, 1_000_000_000);
  const maximumPositions = boundedInteger(env.MORPHO_SNAPSHOT_MAX_POSITIONS, DEFAULT_MAX_POSITIONS, 100, 5_000);
  const updatedAt = new Date().toISOString();
  const positions: MorphoPosition[] = [];

  for (let skip = 0; skip < maximumPositions; skip += PAGE_SIZE) {
    const pageSize = Math.min(PAGE_SIZE, maximumPositions - skip);
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
              pageInfo { count countTotal limit skip }
            }
          }
        `,
        variables: { first: pageSize, skip, maximumHealthFactor },
      }),
      signal: AbortSignal.timeout(snapshotTimeoutMs(env)),
    });

    if (!response.ok) throw new Error(`Morpho API request failed (${response.status})`);
    const payload = (await response.json()) as MorphoResponse;
    if (payload.errors?.length) {
      throw new Error(`Morpho API query failed: ${String(payload.errors[0]?.message ?? "unknown error")}`);
    }

    const page = payload.data?.marketPositions?.items ?? [];
    positions.push(...page);
    if (page.length < pageSize) break;
  }

  const queue = positions
    .map((position) => normalizeMorphoPosition(position, updatedAt))
    .filter((row): row is SupplementalSnapshotQueueRow => Boolean(row))
    .filter((row) => Number(row.debt) >= minimumDebtUsd);

  const sources = (["ethereum", "arbitrum"] as const).map((chain) => {
    const queueCount = queue.filter((row) => row.chain === chain).length;
    return {
      id: `${chain}-morpho-blue-api`,
      chain,
      chainLabel: chain === "ethereum" ? "ETH" : "ARB",
      source: "morpho-api-scanner",
      rpc: chain === "ethereum" ? "ETHEREUM_RPC_URL" : "ARBITRUM_RPC_URL",
      queueCount,
      liquidationCount: 0,
      protocolCount: 1,
      status: queueCount > 0 ? "有候选" : "API 就绪",
      updatedAt,
    };
  });

  return { queue, sources };
}

function normalizeMorphoPosition(position: MorphoPosition, updatedAt: string): SupplementalSnapshotQueueRow | null {
  const chainId = finiteNumber(position.market?.chain?.id);
  const chain = chainId === 1 ? "ethereum" : chainId === 42161 ? "arbitrum" : null;
  const wallet = stringValue(position.user?.address);
  const marketId = stringValue(position.market?.marketId, position.id);
  const healthFactor = finiteNumber(position.healthFactor);
  const debt = finiteNumber(position.state?.borrowAssetsUsd);
  const collateral = finiteNumber(position.state?.collateralUsd);
  if (!chain || !wallet || !marketId || healthFactor === null || healthFactor <= 0 || debt === null || debt <= 0) return null;

  const collateralAsset = stringValue(position.market?.collateralAsset?.symbol) ?? "--";
  const loanAsset = stringValue(position.market?.loanAsset?.symbol) ?? "USD";

  return {
    id: `morpho:${chain}:${marketId}:${wallet.toLowerCase()}`,
    chain,
    chainLabel: chain === "ethereum" ? "ETH" : "ARB",
    wallet,
    walletShort: shortAddress(wallet),
    asset: collateralAsset,
    protocol: "Morpho Blue",
    rpc: chain === "ethereum" ? "ETHEREUM_RPC_URL" : "ARBITRUM_RPC_URL",
    healthFactor: formatDecimal(healthFactor, 4),
    debt: formatDecimal(debt, 2),
    debtSymbol: `${loanAsset} / USD`,
    collateralSymbol: collateral === null ? "--" : formatDecimal(collateral, 2),
    grossProfit: "--",
    netProfit: "--",
    status: healthFactor < 1 ? "可清算" : healthFactor <= 1.05 ? "高风险" : "候选",
    source: "morpho-api-scanner",
    updatedAt,
  };
}

function emptySnapshot(): SupplementalSnapshot {
  return { queue: [], sources: [] };
}

function snapshotTimeoutMs(env: Record<string, string>): number {
  return boundedInteger(env.LIQUIDATION_SNAPSHOT_TIMEOUT_MS, 8_000, 1_000, 30_000);
}

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  return Math.trunc(boundedNumber(value, fallback, minimum, maximum));
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function formatDecimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}
