import type { MorphoRoutePlannerResult } from "./morpho-route-planner.js";

export type MorphoPrivateExecutionSkeleton = {
  stage: "private-skeleton-wired";
  executable: false;
  chain: "ethereum" | "base";
  chainId: 1 | 8453;
  relayFamily: "flashbots-bundle-candidate";
  selectedTargetUser: string;
  selectedMarketLabel: string;
  relay: {
    key: "bundle-relay";
    label: "Private relay skeleton";
    status: "planned" | "stubbed";
    detail: string;
  };
  submission: {
    key: "bundle-submission";
    label: "Bundle submission skeleton";
    status: "planned" | "stubbed";
    detail: string;
  };
  summary: string;
};

function buildMorphoBluePrivateExecutionSkeleton(
  chain: "ethereum" | "base",
  routePlanner: MorphoRoutePlannerResult,
): MorphoPrivateExecutionSkeleton {
  const selectedTargetUser = routePlanner.selectedOpportunity?.user ?? "";
  const selectedMarketLabel = routePlanner.selectedOpportunity?.marketLabel ?? "";
  const chainLabel = chain === "base" ? "Base" : "Ethereum";

  if (!routePlanner.quoteAvailable || !routePlanner.selectedOpportunity) {
    return {
      stage: "private-skeleton-wired",
      executable: false,
      chain,
      chainId: chain === "base" ? 8453 : 1,
      relayFamily: "flashbots-bundle-candidate",
      selectedTargetUser,
      selectedMarketLabel,
      relay: {
        key: "bundle-relay",
        label: "Private relay skeleton",
        status: "planned",
        detail:
          "Private execution boundary exists, but there is no live route stub to attach to a relay candidate yet.",
      },
      submission: {
        key: "bundle-submission",
        label: "Bundle submission skeleton",
        status: "planned",
        detail:
          "Bundle submission boundary exists, but there is no live route stub to attach to a bundle candidate yet.",
      },
      summary:
        `Morpho ${chainLabel} private execution skeleton is wired, but it could not derive a live bundle target from the current planner output.`,
    };
  }

  return {
    stage: "private-skeleton-wired",
    executable: false,
    chain,
    chainId: chain === "base" ? 8453 : 1,
    relayFamily: "flashbots-bundle-candidate",
    selectedTargetUser,
    selectedMarketLabel,
    relay: {
      key: "bundle-relay",
      label: "Private relay skeleton",
      status: "stubbed",
      detail: `Live private stub is attached to ${routePlanner.selectedOpportunity.marketLabel} for user ${routePlanner.selectedOpportunity.user}, but no real relay API call is made yet.`,
    },
    submission: {
      key: "bundle-submission",
      label: "Bundle submission skeleton",
      status: "stubbed",
      detail: `Live private stub reserves a bundle submission step after route planning for ${routePlanner.selectedOpportunity.loanSymbol}/${routePlanner.selectedOpportunity.collateralSymbol}, but no bundle is built or submitted yet.`,
    },
    summary:
      `Morpho ${chainLabel} private execution skeleton is wired and attached to the live route stub from ${routePlanner.selectedOpportunity.marketLabel}, but it still does not submit to a real relay or builder.`,
  };
}

export function buildMorphoBlueEthereumPrivateExecutionSkeleton(
  routePlanner: MorphoRoutePlannerResult,
): MorphoPrivateExecutionSkeleton {
  return buildMorphoBluePrivateExecutionSkeleton("ethereum", routePlanner);
}

export function buildMorphoBlueBasePrivateExecutionSkeleton(
  routePlanner: MorphoRoutePlannerResult,
): MorphoPrivateExecutionSkeleton {
  return buildMorphoBluePrivateExecutionSkeleton("base", routePlanner);
}
