import {
  MORPHO_BLUE_ETHEREUM_STARTER_MARKETS,
  type MorphoBlueRegistryEntry,
} from "./morpho-blue-registry.js";
import { evaluateMorphoExecutionCandidate } from "./morpho-execution-candidate.js";

const MORPHO_BLUE_GRAPHQL_URL = "https://blue-api.morpho.org/graphql" as const;
const MORPHO_BLUE_CACHE_TTL_MS = 30_000;
const MORPHO_BLUE_RISKY_HEALTH_FACTOR = 1.1;
const MORPHO_BLUE_NEAR_LIQUIDATION_HEALTH_FACTOR = 1.02;
const MORPHO_BLUE_LIQUIDATABLE_HEALTH_FACTOR = 1;
const MORPHO_BLUE_RISK_POSITION_PAGE_SIZE = 200;
const MORPHO_BLUE_TOP_OPPORTUNITIES_PER_MARKET = 5;
const MORPHO_BLUE_TOP_OPPORTUNITIES_GLOBAL = 8;
const MORPHO_BLUE_BASE_STARTER_MARKETS = 7;

export type MorphoBlueChain = "ethereum" | "base";

type MorphoBlueMarketApiRow = {
  marketId?: string;
  uniqueKey?: string;
  lltv?: string;
  oracleAddress?: string;
  irmAddress?: string;
  loanAsset?: {
    address?: string;
    symbol?: string;
    decimals?: number;
  };
  collateralAsset?: {
    address?: string;
    symbol?: string;
    decimals?: number;
  };
  state?: {
    supplyAssetsUsd?: number;
    borrowAssetsUsd?: number;
    utilization?: number;
  };
};

type MorphoBlueMarketPositionApiRow = {
  id?: string;
  healthFactor?: number | null;
  priceVariationToLiquidationPrice?: number | null;
  user?: {
    address?: string;
  };
  market?: {
    marketId?: string;
    uniqueKey?: string;
  };
  state?: {
    collateral?: number | null;
    borrowAssets?: number | null;
    borrowShares?: number | null;
    supplyAssets?: number | null;
    supplyShares?: number | null;
    collateralUsd?: number | null;
    supplyAssetsUsd?: number | null;
    borrowAssetsUsd?: number | null;
    marginUsd?: number | null;
  };
};

export type MorphoBlueOpportunityBand =
  | "liquidatable"
  | "near-liquidation"
  | "risky";

export type MorphoBlueOpportunitySignal =
  | "critical"
  | "warning"
  | "watch"
  | "quiet";

export type MorphoBlueReadOnlyOpportunity = {
  marketId: string;
  marketLabel: string;
  loanSymbol: string;
  collateralSymbol: string;
  user: string;
  shortUser: string;
  kind: MorphoBlueOpportunityBand;
  healthFactor: number | null;
  priceVariationToLiquidationPrice: number | null;
  collateral: number | null;
  collateralRaw: string | null;
  borrowAssets: number | null;
  borrowShares: number | null;
  borrowSharesRaw: string | null;
  supplyAssets: number | null;
  supplyShares: number | null;
  collateralUsd: number | null;
  borrowAssetsUsd: number | null;
  marginUsd: number | null;
  executionCandidate: boolean;
  executionGateReasons: string[];
};

export type MorphoBlueMarketRiskSnapshot = {
  mode: "read-only-position-risk";
  source: typeof MORPHO_BLUE_GRAPHQL_URL;
  thresholdHealthFactor: number;
  nearLiquidationHealthFactor: number;
  liquidatableHealthFactor: number;
  positionsFetched: number;
  riskyPositions: number;
  nearLiquidationPositions: number;
  liquidatablePositions: number;
  executionCandidatePositions: number;
  riskyBorrowAssetsUsd: number;
  liquidatableBorrowAssetsUsd: number;
  executionCandidateBorrowAssetsUsd: number;
  worstHealthFactor: number | null;
  topOpportunities: MorphoBlueReadOnlyOpportunity[];
  topExecutionCandidates: MorphoBlueReadOnlyOpportunity[];
  signal: MorphoBlueOpportunitySignal;
  disclaimer: string;
};

export type MorphoBlueLiveMarketSnapshot = MorphoBlueRegistryEntry & {
  lltv: string | null;
  live: {
    available: boolean;
    fetchedAt: string;
    source: typeof MORPHO_BLUE_GRAPHQL_URL;
    supplyAssetsUsd: number | null;
    borrowAssetsUsd: number | null;
    utilization: number | null;
  };
  delta: {
    supplyAssetsUsd: number | null;
    borrowAssetsUsd: number | null;
    utilization: number | null;
  };
  risk: MorphoBlueMarketRiskSnapshot;
};

export type MorphoBlueDashboardSnapshot = {
  ok: true;
  protocol: "morpho-blue";
  chain: MorphoBlueChain;
  chainId: 1 | 8453;
  fetchedAt: string;
  stale: boolean;
  registryCount: number;
  liveCount: number;
  analysis: {
    mode: "read-only-position-risk";
    source: typeof MORPHO_BLUE_GRAPHQL_URL;
    thresholdHealthFactor: number;
    nearLiquidationHealthFactor: number;
    liquidatableHealthFactor: number;
    positionsFetched: number;
    riskyPositions: number;
    nearLiquidationPositions: number;
    liquidatablePositions: number;
    executionCandidatePositions: number;
    riskyBorrowAssetsUsd: number;
    liquidatableBorrowAssetsUsd: number;
    executionCandidateBorrowAssetsUsd: number;
    topOpportunities: MorphoBlueReadOnlyOpportunity[];
    topExecutionCandidates: MorphoBlueReadOnlyOpportunity[];
    disclaimer: string;
  };
  markets: MorphoBlueLiveMarketSnapshot[];
};

export type MorphoBlueEthereumDashboardSnapshot = MorphoBlueDashboardSnapshot & {
  chain: "ethereum";
  chainId: 1;
};

export type MorphoBlueBaseDashboardSnapshot = MorphoBlueDashboardSnapshot & {
  chain: "base";
  chainId: 8453;
};

type MorphoBlueCacheEntry<TPayload extends MorphoBlueDashboardSnapshot> = {
  payload: TPayload;
  fetchedAtMs: number;
};

let morphoBlueEthereumCache: MorphoBlueCacheEntry<MorphoBlueEthereumDashboardSnapshot> | null =
  null;
let morphoBlueBaseCache: MorphoBlueCacheEntry<MorphoBlueBaseDashboardSnapshot> | null = null;

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerStringOrNull(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.trunc(value).toString();
}

function differenceOrNull(current: number | null, baseline: number): number | null {
  if (current === null) {
    return null;
  }
  return current - baseline;
}

function shortAddress(value: string): string {
  return value.length >= 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function marketOpportunityBand(healthFactor: number | null): MorphoBlueOpportunityBand {
  if (healthFactor !== null && healthFactor < MORPHO_BLUE_LIQUIDATABLE_HEALTH_FACTOR) {
    return "liquidatable";
  }
  if (healthFactor !== null && healthFactor <= MORPHO_BLUE_NEAR_LIQUIDATION_HEALTH_FACTOR) {
    return "near-liquidation";
  }
  return "risky";
}

function compareOpportunities(
  left: MorphoBlueReadOnlyOpportunity,
  right: MorphoBlueReadOnlyOpportunity,
): number {
  const leftHealth = left.healthFactor ?? Number.POSITIVE_INFINITY;
  const rightHealth = right.healthFactor ?? Number.POSITIVE_INFINITY;
  if (leftHealth !== rightHealth) {
    return leftHealth - rightHealth;
  }

  const leftBorrow = left.borrowAssetsUsd ?? 0;
  const rightBorrow = right.borrowAssetsUsd ?? 0;
  return rightBorrow - leftBorrow;
}

function sumFinite(values: Array<number | null>): number {
  return values.reduce<number>(
    (sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0),
    0,
  );
}

function signalForRiskCounts(
  liquidatablePositions: number,
  nearLiquidationPositions: number,
  riskyPositions: number,
): MorphoBlueOpportunitySignal {
  if (liquidatablePositions > 0) {
    return "critical";
  }
  if (nearLiquidationPositions > 0) {
    return "warning";
  }
  if (riskyPositions > 0) {
    return "watch";
  }
  return "quiet";
}

async function queryMorphoBlueMarkets(
  chainId: 1 | 8453,
  ids?: string[],
): Promise<MorphoBlueMarketApiRow[]> {
  const response = await fetch(MORPHO_BLUE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      query: `
        query MorphoBlueStarterMarkets($chainIds: [Int!], $ids: [String!]) {
          markets(first: 50, where: { chainId_in: $chainIds, uniqueKey_in: $ids }) {
            items {
              marketId
              uniqueKey
              lltv
              oracleAddress
              irmAddress
              loanAsset { address symbol decimals }
              collateralAsset { address symbol decimals }
              state { supplyAssetsUsd borrowAssetsUsd utilization }
            }
          }
        }
      `,
      variables: {
        chainIds: [chainId],
        ids: Array.isArray(ids) && ids.length ? ids : undefined,
      },
    }),
  });

  const payload = (await response.json()) as {
    data?: {
      markets?: {
        items?: MorphoBlueMarketApiRow[];
      };
    };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || payload.errors?.length) {
    const details = payload.errors?.map((item) => item.message).filter(Boolean).join("; ");
    throw new Error(
      `Morpho Blue API request failed (${response.status} ${response.statusText})${details ? `: ${details}` : "."}`,
    );
  }

  return Array.isArray(payload.data?.markets?.items) ? payload.data?.markets?.items ?? [] : [];
}

async function queryMorphoBlueRiskPositions(input: {
  chainId: 1 | 8453;
  ids?: string[];
}): Promise<MorphoBlueMarketPositionApiRow[]> {
  const items: MorphoBlueMarketPositionApiRow[] = [];
  let skip = 0;

  while (true) {
    const response = await fetch(MORPHO_BLUE_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        query: `
          query MorphoBlueStarterRiskPositions(
            $first: Int!
            $skip: Int!
            $chainIds: [Int!]
            $ids: [String!]
            $healthFactorLte: Float!
          ) {
            marketPositions(
              first: $first
              skip: $skip
              orderBy: HealthFactor
              orderDirection: Asc
              where: {
                chainId_in: $chainIds
                marketUniqueKey_in: $ids
                healthFactor_lte: $healthFactorLte
              }
            ) {
              items {
                id
                healthFactor
                priceVariationToLiquidationPrice
                user { address }
                market { marketId uniqueKey }
                state {
                  collateral
                  borrowAssets
                  borrowShares
                  supplyAssets
                  supplyShares
                  collateralUsd
                  supplyAssetsUsd
                  borrowAssetsUsd
                  marginUsd
                }
              }
              pageInfo {
                count
                countTotal
              }
            }
          }
        `,
        variables: {
          first: MORPHO_BLUE_RISK_POSITION_PAGE_SIZE,
          skip,
          chainIds: [input.chainId],
          ids: Array.isArray(input.ids) && input.ids.length ? input.ids : undefined,
          healthFactorLte: MORPHO_BLUE_RISKY_HEALTH_FACTOR,
        },
      }),
    });

    const payload = (await response.json()) as {
      data?: {
        marketPositions?: {
          items?: MorphoBlueMarketPositionApiRow[];
          pageInfo?: {
            count?: number;
            countTotal?: number;
          };
        };
      };
      errors?: Array<{ message?: string }>;
    };

    if (!response.ok || payload.errors?.length) {
      const details = payload.errors?.map((item) => item.message).filter(Boolean).join("; ");
      throw new Error(
        `Morpho Blue risk positions request failed (${response.status} ${response.statusText})${details ? `: ${details}` : "."}`,
      );
    }

    const pageItems = Array.isArray(payload.data?.marketPositions?.items)
      ? payload.data?.marketPositions?.items ?? []
      : [];
    const countTotal = payload.data?.marketPositions?.pageInfo?.countTotal;
    items.push(...pageItems);
    skip += pageItems.length;

    if (pageItems.length === 0 || (typeof countTotal === "number" && skip >= countTotal)) {
      break;
    }
  }

  return items;
}

async function queryMorphoBlueChainWideRiskPositions(
  chainId: 1 | 8453,
): Promise<MorphoBlueMarketPositionApiRow[]> {
  const items: MorphoBlueMarketPositionApiRow[] = [];
  let skip = 0;

  while (true) {
    const response = await fetch(MORPHO_BLUE_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        query: `
          query MorphoBlueChainWideRiskPositions(
            $first: Int!
            $skip: Int!
            $chainIds: [Int!]
            $healthFactorLte: Float!
          ) {
            marketPositions(
              first: $first
              skip: $skip
              orderBy: HealthFactor
              orderDirection: Asc
              where: {
                chainId_in: $chainIds
                healthFactor_lte: $healthFactorLte
              }
            ) {
              items {
                id
                healthFactor
                priceVariationToLiquidationPrice
                user { address }
                market { marketId uniqueKey }
                state {
                  collateral
                  borrowAssets
                  borrowShares
                  supplyAssets
                  supplyShares
                  collateralUsd
                  supplyAssetsUsd
                  borrowAssetsUsd
                  marginUsd
                }
              }
              pageInfo { count countTotal }
            }
          }
        `,
        variables: {
          first: MORPHO_BLUE_RISK_POSITION_PAGE_SIZE,
          skip,
          chainIds: [chainId],
          healthFactorLte: MORPHO_BLUE_RISKY_HEALTH_FACTOR,
        },
      }),
    });

    const payload = (await response.json()) as {
      data?: {
        marketPositions?: {
          items?: MorphoBlueMarketPositionApiRow[];
          pageInfo?: { count?: number; countTotal?: number };
        };
      };
      errors?: Array<{ message?: string }>;
    };

    if (!response.ok || payload.errors?.length) {
      const details = payload.errors?.map((item) => item.message).filter(Boolean).join("; ");
      throw new Error(
        `Morpho Blue risk positions request failed (${response.status} ${response.statusText})${details ? `: ${details}` : "."}`,
      );
    }

    const pageItems = Array.isArray(payload.data?.marketPositions?.items)
      ? payload.data?.marketPositions?.items ?? []
      : [];
    const countTotal = payload.data?.marketPositions?.pageInfo?.countTotal;
    items.push(...pageItems);
    skip += pageItems.length;
    if (pageItems.length === 0 || (typeof countTotal === "number" && skip >= countTotal)) {
      break;
    }
  }

  return items;
}

function buildRiskSnapshot(
  opportunities: MorphoBlueReadOnlyOpportunity[],
): MorphoBlueMarketRiskSnapshot {
  const sorted = opportunities.slice().sort(compareOpportunities);
  const executionCandidates = sorted.filter((item) => item.executionCandidate);
  const liquidatablePositions = sorted.filter(
    (item) =>
      item.healthFactor !== null && item.healthFactor < MORPHO_BLUE_LIQUIDATABLE_HEALTH_FACTOR,
  );
  const nearLiquidationPositions = sorted.filter(
    (item) =>
      item.healthFactor !== null &&
      item.healthFactor >= MORPHO_BLUE_LIQUIDATABLE_HEALTH_FACTOR &&
      item.healthFactor <= MORPHO_BLUE_NEAR_LIQUIDATION_HEALTH_FACTOR,
  );

  return {
    mode: "read-only-position-risk",
    source: MORPHO_BLUE_GRAPHQL_URL,
    thresholdHealthFactor: MORPHO_BLUE_RISKY_HEALTH_FACTOR,
    nearLiquidationHealthFactor: MORPHO_BLUE_NEAR_LIQUIDATION_HEALTH_FACTOR,
    liquidatableHealthFactor: MORPHO_BLUE_LIQUIDATABLE_HEALTH_FACTOR,
    positionsFetched: sorted.length,
    riskyPositions: sorted.length,
    nearLiquidationPositions: nearLiquidationPositions.length,
    liquidatablePositions: liquidatablePositions.length,
    executionCandidatePositions: executionCandidates.length,
    riskyBorrowAssetsUsd: sumFinite(sorted.map((item) => item.borrowAssetsUsd)),
    liquidatableBorrowAssetsUsd: sumFinite(
      liquidatablePositions.map((item) => item.borrowAssetsUsd),
    ),
    executionCandidateBorrowAssetsUsd: sumFinite(
      executionCandidates.map((item) => item.borrowAssetsUsd),
    ),
    worstHealthFactor: sorted[0]?.healthFactor ?? null,
    topOpportunities: sorted.slice(0, MORPHO_BLUE_TOP_OPPORTUNITIES_PER_MARKET),
    topExecutionCandidates: executionCandidates.slice(
      0,
      MORPHO_BLUE_TOP_OPPORTUNITIES_PER_MARKET,
    ),
    signal: signalForRiskCounts(
      liquidatablePositions.length,
      nearLiquidationPositions.length,
      sorted.length,
    ),
    disclaimer:
      "Official Morpho Blue API positions only. Read-only risk/opportunity watchlist, not an execution or profitability quote.",
  };
}

function buildMorphoBlueDashboardSnapshot(
  chain: "ethereum",
  chainId: 1,
  registryEntries: MorphoBlueRegistryEntry[],
  rows: MorphoBlueMarketApiRow[],
  positionRows: MorphoBlueMarketPositionApiRow[],
  fetchedAt: string,
): MorphoBlueEthereumDashboardSnapshot;
function buildMorphoBlueDashboardSnapshot(
  chain: "base",
  chainId: 8453,
  registryEntries: MorphoBlueRegistryEntry[],
  rows: MorphoBlueMarketApiRow[],
  positionRows: MorphoBlueMarketPositionApiRow[],
  fetchedAt: string,
): MorphoBlueBaseDashboardSnapshot;
function buildMorphoBlueDashboardSnapshot(
  chain: MorphoBlueChain,
  chainId: 1 | 8453,
  registryEntries: MorphoBlueRegistryEntry[],
  rows: MorphoBlueMarketApiRow[],
  positionRows: MorphoBlueMarketPositionApiRow[],
  fetchedAt: string,
): MorphoBlueDashboardSnapshot {
  const liveById = new Map<string, MorphoBlueMarketApiRow>();
  for (const row of rows) {
    const key = typeof row.marketId === "string" ? row.marketId : row.uniqueKey;
    if (key) {
      liveById.set(key.toLowerCase(), row);
    }
  }

  const opportunitiesByMarket = new Map<string, MorphoBlueReadOnlyOpportunity[]>();
  const registryById = new Map(registryEntries.map((entry) => [entry.marketId.toLowerCase(), entry]));
  for (const row of positionRows) {
    const marketKey =
      typeof row.market?.marketId === "string"
        ? row.market.marketId
        : row.market?.uniqueKey;
    const user = row.user?.address;
    if (!marketKey || typeof user !== "string") {
      continue;
    }

    const key = marketKey.toLowerCase();
    const registryEntry = registryById.get(key);
    const opportunity: MorphoBlueReadOnlyOpportunity = {
      marketId: marketKey,
      marketLabel: registryEntry?.label ?? marketKey,
      loanSymbol: registryEntry?.loanAsset.symbol ?? "--",
      collateralSymbol: registryEntry?.collateralAsset.symbol ?? "--",
      user,
      shortUser: shortAddress(user),
      kind: marketOpportunityBand(finiteOrNull(row.healthFactor)),
      healthFactor: finiteOrNull(row.healthFactor),
      priceVariationToLiquidationPrice: finiteOrNull(
        row.priceVariationToLiquidationPrice,
      ),
      collateral: finiteOrNull(row.state?.collateral),
      collateralRaw: integerStringOrNull(row.state?.collateral),
      borrowAssets: finiteOrNull(row.state?.borrowAssets),
      borrowShares: finiteOrNull(row.state?.borrowShares),
      borrowSharesRaw: integerStringOrNull(row.state?.borrowShares),
      supplyAssets: finiteOrNull(row.state?.supplyAssets),
      supplyShares: finiteOrNull(row.state?.supplyShares),
      collateralUsd: finiteOrNull(row.state?.collateralUsd),
      borrowAssetsUsd: finiteOrNull(row.state?.borrowAssetsUsd),
      marginUsd: finiteOrNull(row.state?.marginUsd),
      executionCandidate: false,
      executionGateReasons: [],
    };
    const executionCandidate = evaluateMorphoExecutionCandidate(opportunity);
    opportunity.executionCandidate = executionCandidate.eligible;
    opportunity.executionGateReasons = executionCandidate.reasons;

    const bucket = opportunitiesByMarket.get(key);
    if (bucket) {
      bucket.push(opportunity);
    } else {
      opportunitiesByMarket.set(key, [opportunity]);
    }
  }

  const markets = registryEntries.map((entry) => {
    const liveRow = liveById.get(entry.marketId.toLowerCase());
    const liveSupply = finiteOrNull(liveRow?.state?.supplyAssetsUsd);
    const liveBorrow = finiteOrNull(liveRow?.state?.borrowAssetsUsd);
    const liveUtilization = finiteOrNull(liveRow?.state?.utilization);
    const marketOpportunities = opportunitiesByMarket.get(entry.marketId.toLowerCase()) ?? [];

    return {
      ...entry,
      lltv: typeof liveRow?.lltv === "string" ? liveRow.lltv : null,
      live: {
        available: Boolean(liveRow),
        fetchedAt,
        source: MORPHO_BLUE_GRAPHQL_URL,
        supplyAssetsUsd: liveSupply,
        borrowAssetsUsd: liveBorrow,
        utilization: liveUtilization,
      },
      delta: {
        supplyAssetsUsd: differenceOrNull(liveSupply, entry.snapshot.supplyAssetsUsd),
        borrowAssetsUsd: differenceOrNull(liveBorrow, entry.snapshot.borrowAssetsUsd),
        utilization: differenceOrNull(liveUtilization, entry.snapshot.utilization),
      },
      risk: buildRiskSnapshot(marketOpportunities),
    };
  });

  const allOpportunities = [...opportunitiesByMarket.values()]
    .flat()
    .slice()
    .sort(compareOpportunities);
  const executionCandidates = allOpportunities.filter((item) => item.executionCandidate);
  const liquidatablePositions = markets.reduce(
    (sum, market) => sum + market.risk.liquidatablePositions,
    0,
  );
  const nearLiquidationPositions = markets.reduce(
    (sum, market) => sum + market.risk.nearLiquidationPositions,
    0,
  );
  const riskyPositions = markets.reduce((sum, market) => sum + market.risk.riskyPositions, 0);

  return {
    ok: true,
    protocol: "morpho-blue",
    chain,
    chainId,
    fetchedAt,
    stale: false,
    registryCount: registryEntries.length,
    liveCount: markets.filter((market) => market.live.available).length,
    analysis: {
      mode: "read-only-position-risk",
      source: MORPHO_BLUE_GRAPHQL_URL,
      thresholdHealthFactor: MORPHO_BLUE_RISKY_HEALTH_FACTOR,
      nearLiquidationHealthFactor: MORPHO_BLUE_NEAR_LIQUIDATION_HEALTH_FACTOR,
      liquidatableHealthFactor: MORPHO_BLUE_LIQUIDATABLE_HEALTH_FACTOR,
      positionsFetched: riskyPositions,
      riskyPositions,
      nearLiquidationPositions,
      liquidatablePositions,
      executionCandidatePositions: executionCandidates.length,
      riskyBorrowAssetsUsd: sumFinite(
        markets.map((market) => market.risk.riskyBorrowAssetsUsd),
      ),
      liquidatableBorrowAssetsUsd: sumFinite(
        markets.map((market) => market.risk.liquidatableBorrowAssetsUsd),
      ),
      executionCandidateBorrowAssetsUsd: sumFinite(
        markets.map((market) => market.risk.executionCandidateBorrowAssetsUsd),
      ),
      topOpportunities: allOpportunities.slice(0, MORPHO_BLUE_TOP_OPPORTUNITIES_GLOBAL),
      topExecutionCandidates: executionCandidates.slice(
        0,
        MORPHO_BLUE_TOP_OPPORTUNITIES_GLOBAL,
      ),
      disclaimer:
        "Official Morpho Blue API positions only. Read-only risk/opportunity watchlist, not an execution or profitability quote.",
    },
    markets,
  };
}

function selectMorphoBlueBaseMarketIds(
  positionRows: MorphoBlueMarketPositionApiRow[],
): string[] {
  const grouped = new Map<string, { liquidatable: number; risky: number; borrowUsd: number; worstHf: number }>();
  positionRows.forEach((row) => {
    const marketId =
      typeof row.market?.marketId === "string" ? row.market.marketId : row.market?.uniqueKey;
    if (!marketId) return;
    const key = marketId.toLowerCase();
    const bucket = grouped.get(key) ?? {
      liquidatable: 0,
      risky: 0,
      borrowUsd: 0,
      worstHf: Number.POSITIVE_INFINITY,
    };
    const hf = finiteOrNull(row.healthFactor);
    if (typeof hf === "number" && hf < MORPHO_BLUE_LIQUIDATABLE_HEALTH_FACTOR) {
      bucket.liquidatable += 1;
    }
    bucket.risky += 1;
    bucket.borrowUsd += finiteOrNull(row.state?.borrowAssetsUsd) ?? 0;
    bucket.worstHf = Math.min(bucket.worstHf, hf ?? Number.POSITIVE_INFINITY);
    grouped.set(key, bucket);
  });

  return Array.from(grouped.entries())
    .sort((left, right) => {
      if (left[1].liquidatable !== right[1].liquidatable) {
        return right[1].liquidatable - left[1].liquidatable;
      }
      if (left[1].borrowUsd !== right[1].borrowUsd) {
        return right[1].borrowUsd - left[1].borrowUsd;
      }
      if (left[1].risky !== right[1].risky) {
        return right[1].risky - left[1].risky;
      }
      return left[1].worstHf - right[1].worstHf;
    })
    .slice(0, MORPHO_BLUE_BASE_STARTER_MARKETS)
    .map(([marketId]) => marketId);
}

function buildMorphoBlueDynamicRegistryEntries(
  chain: MorphoBlueChain,
  chainId: 1 | 8453,
  rows: MorphoBlueMarketApiRow[],
  fetchedAt: string,
): MorphoBlueRegistryEntry[] {
  return rows.map((row, index) => ({
    priority: index + 1,
    chain,
    chainId,
    protocol: "morpho-blue",
    marketId: String(row.marketId || row.uniqueKey || "") as `0x${string}`,
    label: `Morpho Blue / ${chain === "ethereum" ? "Ethereum" : "Base"} / ${String(row.loanAsset?.symbol || "--")} -> ${String(row.collateralAsset?.symbol || "--")}`,
    loanAsset: {
      address: String(row.loanAsset?.address || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      symbol: String(row.loanAsset?.symbol || "--"),
      decimals: typeof row.loanAsset?.decimals === "number" ? row.loanAsset.decimals : 18,
    },
    collateralAsset: {
      address: String(row.collateralAsset?.address || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      symbol: String(row.collateralAsset?.symbol || "--"),
      decimals: typeof row.collateralAsset?.decimals === "number" ? row.collateralAsset.decimals : 18,
    },
    lltvBps:
      typeof row.lltv === "string" && row.lltv
        ? Math.round(Number(row.lltv) / 1e14)
        : 0,
    oracleAddress: String(row.oracleAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    irmAddress: String(row.irmAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    snapshot: {
      asOf: fetchedAt.slice(0, 10),
      supplyAssetsUsd: finiteOrNull(row.state?.supplyAssetsUsd) ?? 0,
      borrowAssetsUsd: finiteOrNull(row.state?.borrowAssetsUsd) ?? 0,
      utilization: finiteOrNull(row.state?.utilization) ?? 0,
      source: MORPHO_BLUE_GRAPHQL_URL,
    },
    notes: [
      chain === "base"
        ? "Auto-selected from official Base blue-api active-risk markets."
        : "Auto-selected from official Morpho blue-api market data.",
    ],
  }));
}

export async function fetchMorphoBlueEthereumDashboardSnapshot(
  options?: { force?: boolean },
): Promise<MorphoBlueEthereumDashboardSnapshot> {
  const now = Date.now();
  if (
    !options?.force &&
    morphoBlueEthereumCache &&
    now - morphoBlueEthereumCache.fetchedAtMs < MORPHO_BLUE_CACHE_TTL_MS
  ) {
    return morphoBlueEthereumCache.payload;
  }

  try {
    const fetchedAt = new Date().toISOString();
    const payload = buildMorphoBlueDashboardSnapshot(
      "ethereum",
      1,
      MORPHO_BLUE_ETHEREUM_STARTER_MARKETS,
      ...(await Promise.all([
        queryMorphoBlueMarkets(1, MORPHO_BLUE_ETHEREUM_STARTER_MARKETS.map((entry) => entry.marketId)),
        queryMorphoBlueRiskPositions({
          chainId: 1,
          ids: MORPHO_BLUE_ETHEREUM_STARTER_MARKETS.map((entry) => entry.marketId),
        }),
      ])),
      fetchedAt,
    );
    morphoBlueEthereumCache = {
      payload,
      fetchedAtMs: now,
    };
    return payload;
  } catch (error) {
    if (morphoBlueEthereumCache) {
      return {
        ...morphoBlueEthereumCache.payload,
        stale: true,
      };
    }
    throw error;
  }
}

export async function fetchMorphoBlueBaseDashboardSnapshot(
  options?: { force?: boolean },
): Promise<MorphoBlueBaseDashboardSnapshot> {
  const now = Date.now();
  if (
    !options?.force &&
    morphoBlueBaseCache &&
    now - morphoBlueBaseCache.fetchedAtMs < MORPHO_BLUE_CACHE_TTL_MS
  ) {
    return morphoBlueBaseCache.payload;
  }

  try {
    const fetchedAt = new Date().toISOString();
    const riskPositions = await queryMorphoBlueChainWideRiskPositions(8453);
    const marketIds = selectMorphoBlueBaseMarketIds(riskPositions);
    const rows = marketIds.length ? await queryMorphoBlueMarkets(8453, marketIds) : [];
    const registryEntries = buildMorphoBlueDynamicRegistryEntries("base", 8453, rows, fetchedAt);
    const filteredPositions = riskPositions.filter((row) => {
      const marketId =
        typeof row.market?.marketId === "string" ? row.market.marketId : row.market?.uniqueKey;
      return !!marketId && marketIds.includes(marketId.toLowerCase());
    });
    const payload = buildMorphoBlueDashboardSnapshot(
      "base",
      8453,
      registryEntries,
      rows,
      filteredPositions,
      fetchedAt,
    );
    morphoBlueBaseCache = {
      payload,
      fetchedAtMs: now,
    };
    return payload;
  } catch (error) {
    if (morphoBlueBaseCache) {
      return {
        ...morphoBlueBaseCache.payload,
        stale: true,
      };
    }
    throw error;
  }
}
