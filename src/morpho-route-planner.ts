import type {
  MorphoBlueLiveMarketSnapshot,
  MorphoBlueOpportunityBand,
  MorphoBlueReadOnlyOpportunity,
} from "./morpho-blue-api.js";
import { evaluateMorphoExecutionCandidate } from "./morpho-execution-candidate.js";
import {
  findMorphoBlueEthereumRegistryEntry,
  morphoBlueLltvWadFromBps,
} from "./morpho-blue-registry.js";

export type MorphoRoutePlannerInput = {
  marketId?: string;
  signal?: string;
  hfMax?: string;
  opportunities?: MorphoBlueReadOnlyOpportunity[];
  markets?: MorphoBlueLiveMarketSnapshot[];
};

export type MorphoRoutePlannerLeg = {
  key: string;
  label: string;
  status: "planned" | "stubbed";
  detail: string;
};

export type MorphoRoutePlannerResult = {
  stage: "planner-wired";
  executable: false;
  chain: "ethereum" | "base";
  chainId: 1 | 8453;
  quoteAvailable: boolean;
  marketId: string;
  signal: string;
  hfMax: string;
  selectedOpportunity: {
    marketId: string;
    marketLabel: string;
    user: string;
    kind: MorphoBlueOpportunityBand;
    loanSymbol: string;
    collateralSymbol: string;
    loanDecimals: number;
    collateralDecimals: number;
      healthFactor: number | null;
      collateral: number | null;
      collateralRaw: string | null;
      collateralUsd: number | null;
      borrowAssets: number | null;
      borrowShares: number | null;
      borrowSharesRaw: string | null;
      borrowAssetsUsd: number | null;
      marketParams: {
      loanToken: `0x${string}`;
      collateralToken: `0x${string}`;
      oracle: `0x${string}`;
      irm: `0x${string}`;
      lltv: string;
    };
  } | null;
  repaySource: MorphoRoutePlannerLeg;
  collateralUnwind: MorphoRoutePlannerLeg;
  profitabilityGate: MorphoRoutePlannerLeg;
  summary: string;
};

function parseFiniteNumber(value: string | undefined): number | null {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function matchesSignal(
  opportunity: MorphoBlueReadOnlyOpportunity,
  signal: string,
): boolean {
  if (!signal || signal === "all") return true;
  return opportunity.kind === signal;
}

function matchesMarketId(
  opportunity: MorphoBlueReadOnlyOpportunity,
  marketId: string,
): boolean {
  if (!marketId) return true;
  return opportunity.marketId.toLowerCase() === marketId.toLowerCase();
}

function matchesHf(
  opportunity: MorphoBlueReadOnlyOpportunity,
  hfMax: number | null,
): boolean {
  if (hfMax === null) return true;
  if (typeof opportunity.healthFactor !== "number") return false;
  return opportunity.healthFactor <= hfMax;
}

function executionPriority(
  opportunity: MorphoBlueReadOnlyOpportunity,
): number {
  const candidate = evaluateMorphoExecutionCandidate(opportunity);
  return candidate.eligible ? 1 : 0;
}

function comparePlannerOpportunities(
  left: MorphoBlueReadOnlyOpportunity,
  right: MorphoBlueReadOnlyOpportunity,
): number {
  const leftEligible = executionPriority(left);
  const rightEligible = executionPriority(right);
  if (leftEligible !== rightEligible) {
    return rightEligible - leftEligible;
  }

  const leftKindPriority =
    left.kind === "liquidatable" ? 3 : left.kind === "near-liquidation" ? 2 : 1;
  const rightKindPriority =
    right.kind === "liquidatable" ? 3 : right.kind === "near-liquidation" ? 2 : 1;
  if (leftKindPriority !== rightKindPriority) {
    return rightKindPriority - leftKindPriority;
  }

  const leftBorrow = left.borrowAssetsUsd ?? 0;
  const rightBorrow = right.borrowAssetsUsd ?? 0;
  if (leftBorrow !== rightBorrow) {
    return rightBorrow - leftBorrow;
  }

  const leftHealth = left.healthFactor ?? Number.POSITIVE_INFINITY;
  const rightHealth = right.healthFactor ?? Number.POSITIVE_INFINITY;
  if (leftHealth !== rightHealth) {
    return leftHealth - rightHealth;
  }

  const leftCollateral = left.collateralUsd ?? 0;
  const rightCollateral = right.collateralUsd ?? 0;
  return rightCollateral - leftCollateral;
}

function planMorphoBlueRoute(
  chain: "ethereum" | "base",
  input: MorphoRoutePlannerInput,
): MorphoRoutePlannerResult {
  const marketId = input.marketId?.trim() ?? "";
  const signal = input.signal?.trim() || "all";
  const hfMax = input.hfMax?.trim() || "1.05";
  const hfMaxNumeric = parseFiniteNumber(hfMax);
  const opportunities = Array.isArray(input.opportunities) ? input.opportunities : [];
  const markets = Array.isArray(input.markets) ? input.markets : [];
  const chainLabel = chain === "base" ? "Base" : "Ethereum";
  const marketsById = new Map(
    markets.map((market) => [market.marketId.toLowerCase(), market]),
  );

  const selectedOpportunity =
    opportunities
      .filter((opportunity) =>
        matchesMarketId(opportunity, marketId) &&
        matchesSignal(opportunity, signal) &&
        matchesHf(opportunity, hfMaxNumeric),
      )
      .sort(comparePlannerOpportunities)[0] ?? null;

  if (!selectedOpportunity) {
    return {
      stage: "planner-wired",
      executable: false,
      chain,
      chainId: chain === "base" ? 8453 : 1,
      quoteAvailable: false,
      marketId,
      signal,
      hfMax,
      selectedOpportunity: null,
      repaySource: {
        key: "repay-source",
        label: "Repay source planner",
        status: "planned",
        detail:
          "Planner boundary exists, but no live Morpho opportunity matched the current market/signal/HF filters.",
      },
      collateralUnwind: {
        key: "collateral-unwind",
        label: "Collateral unwind planner",
        status: "planned",
        detail:
          "Planner boundary exists, but no live Morpho opportunity matched the current market/signal/HF filters.",
      },
      profitabilityGate: {
        key: "profitability-gate",
        label: "Route profitability planner",
        status: "planned",
        detail:
          "Planner boundary exists, but no live Morpho opportunity matched the current market/signal/HF filters.",
      },
      summary:
        `Morpho ${chainLabel} route planner is wired, but it could not derive a live stub from the current filtered opportunity set.`,
    };
  }

  const borrowUsd =
    typeof selectedOpportunity.borrowAssetsUsd === "number"
      ? selectedOpportunity.borrowAssetsUsd
      : null;
  const selectedMarket = marketsById.get(selectedOpportunity.marketId.toLowerCase()) ?? null;
  const registryEntry =
    selectedMarket ??
    (chain === "ethereum"
      ? findMorphoBlueEthereumRegistryEntry(selectedOpportunity.marketId)
      : null);
  if (!registryEntry) {
    return {
      stage: "planner-wired",
      executable: false,
      chain,
      chainId: chain === "base" ? 8453 : 1,
      quoteAvailable: false,
      marketId: selectedOpportunity.marketId,
      signal,
      hfMax,
      selectedOpportunity: null,
      repaySource: {
        key: "repay-source",
        label: "Repay source planner",
        status: "planned",
        detail:
          "Planner found a live opportunity, but the selected market is missing curated Morpho market params.",
      },
      collateralUnwind: {
        key: "collateral-unwind",
        label: "Collateral unwind planner",
        status: "planned",
        detail:
          "Planner found a live opportunity, but the selected market is missing curated Morpho market params.",
      },
      profitabilityGate: {
        key: "profitability-gate",
        label: "Route profitability planner",
        status: "planned",
        detail:
          "Planner found a live opportunity, but the selected market is missing curated Morpho market params.",
      },
      summary:
        `Morpho ${chainLabel} route planner matched a live opportunity, but it could not resolve market params for route drafting.`,
    };
  }
  const borrowDisplay = borrowUsd !== null ? `$${borrowUsd.toFixed(2)}` : "--";
  const hfDisplay =
    typeof selectedOpportunity.healthFactor === "number"
      ? selectedOpportunity.healthFactor.toFixed(3)
      : "--";
  const resolvedLltv =
    "lltv" in registryEntry && typeof registryEntry.lltv === "string" && registryEntry.lltv
      ? registryEntry.lltv
      : morphoBlueLltvWadFromBps(registryEntry.lltvBps);

  return {
    stage: "planner-wired",
    executable: false,
    chain,
    chainId: chain === "base" ? 8453 : 1,
    quoteAvailable: true,
    marketId: selectedOpportunity.marketId,
    signal,
    hfMax,
    selectedOpportunity: {
      marketId: selectedOpportunity.marketId,
      marketLabel: selectedOpportunity.marketLabel,
      user: selectedOpportunity.user,
      kind: selectedOpportunity.kind,
      loanSymbol: selectedOpportunity.loanSymbol,
      collateralSymbol: selectedOpportunity.collateralSymbol,
      loanDecimals: registryEntry.loanAsset.decimals,
      collateralDecimals: registryEntry.collateralAsset.decimals,
      healthFactor: selectedOpportunity.healthFactor,
      collateral: selectedOpportunity.collateral,
      collateralRaw: selectedOpportunity.collateralRaw,
      collateralUsd: selectedOpportunity.collateralUsd,
      borrowAssets: selectedOpportunity.borrowAssets,
      borrowShares: selectedOpportunity.borrowShares,
      borrowSharesRaw: selectedOpportunity.borrowSharesRaw,
      borrowAssetsUsd: selectedOpportunity.borrowAssetsUsd,
      marketParams: {
        loanToken: registryEntry.loanAsset.address,
        collateralToken: registryEntry.collateralAsset.address,
        oracle: registryEntry.oracleAddress,
        irm: registryEntry.irmAddress,
        lltv: resolvedLltv,
      },
    },
    repaySource: {
      key: "repay-source",
      label: "Repay source planner",
      status: "stubbed",
      detail: `Live stub picked ${selectedOpportunity.loanSymbol} repay demand around ${borrowDisplay} from ${selectedOpportunity.marketLabel} / HF ${hfDisplay}.`,
    },
    collateralUnwind: {
      key: "collateral-unwind",
      label: "Collateral unwind planner",
      status: "stubbed",
      detail: `Live stub picked ${selectedOpportunity.collateralSymbol} as unwind asset after liquidation for user ${selectedOpportunity.user}.`,
    },
    profitabilityGate: {
      key: "profitability-gate",
      label: "Route profitability planner",
      status: "stubbed",
      detail: `Live stub will eventually gate ${selectedOpportunity.loanSymbol}/${selectedOpportunity.collateralSymbol} routing on the selected opportunity before execution.`,
    },
    summary:
      `Morpho ${chainLabel} route planner is wired and derived a live non-executable stub from ${selectedOpportunity.marketLabel}, but it still does not produce broadcastable repay/unwind quotes.`,
  };
}

export function planMorphoBlueEthereumRoute(
  input: MorphoRoutePlannerInput,
): MorphoRoutePlannerResult {
  return planMorphoBlueRoute("ethereum", input);
}

export function planMorphoBlueBaseRoute(
  input: MorphoRoutePlannerInput,
): MorphoRoutePlannerResult {
  return planMorphoBlueRoute("base", input);
}
