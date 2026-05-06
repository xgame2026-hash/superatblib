export type MorphoRouteSkeletonInput = {
  marketId?: string;
  signal?: string;
  hfMax?: string;
};

export type MorphoRouteSkeletonStep = {
  key: string;
  label: string;
  detail: string;
};

export type MorphoRouteSkeletonPlan = {
  stage: "route-skeleton-wired";
  executable: false;
  chain: "ethereum" | "base";
  chainId: 1 | 8453;
  routeFamily: "morpho-blue-isolated-market";
  marketId: string;
  signal: string;
  hfMax: string;
  steps: MorphoRouteSkeletonStep[];
  summary: string;
};

function buildMorphoBlueRouteSkeleton(
  chain: "ethereum" | "base",
  input: MorphoRouteSkeletonInput,
): MorphoRouteSkeletonPlan {
  const marketId = input.marketId?.trim() ?? "";
  const signal = input.signal?.trim() || "all";
  const hfMax = input.hfMax?.trim() || "1.05";
  const chainLabel = chain === "base" ? "Base" : "Ethereum";

  const steps: MorphoRouteSkeletonStep[] = [
    {
      key: "select-market",
      label: "Select isolated market",
      detail: `Use ${chainLabel} marketId=${marketId || "--"} with signal=${signal} and hfMax=${hfMax} as the route-planning scope.`,
    },
    {
      key: "repay-source",
      label: "Repay source boundary",
      detail:
        "Reserve a dedicated step for choosing repay capital source before liquidation execution instead of assuming Aave-style pool liquidity.",
    },
    {
      key: "collateral-unwind",
      label: "Collateral unwind boundary",
      detail:
        "Reserve a dedicated unwind step for isolated-market collateral exit and output token normalization after liquidation.",
    },
    {
      key: "profit-gate",
      label: "Route profitability gate",
      detail:
        "Reserve a market-aware profitability gate after repay and unwind planning, before any private execution path is considered.",
    },
  ];

  return {
    stage: "route-skeleton-wired",
    executable: false,
    chain,
    chainId: chain === "base" ? 8453 : 1,
    routeFamily: "morpho-blue-isolated-market",
    marketId,
    signal,
    hfMax,
    steps,
    summary:
      `Morpho ${chainLabel} route skeleton is wired as a dedicated isolated-market planning surface, but it does not produce executable repay/unwind quotes yet.`,
  };
}

export function buildMorphoBlueEthereumRouteSkeleton(
  input: MorphoRouteSkeletonInput,
): MorphoRouteSkeletonPlan {
  return buildMorphoBlueRouteSkeleton("ethereum", input);
}

export function buildMorphoBlueBaseRouteSkeleton(
  input: MorphoRouteSkeletonInput,
): MorphoRouteSkeletonPlan {
  return buildMorphoBlueRouteSkeleton("base", input);
}
