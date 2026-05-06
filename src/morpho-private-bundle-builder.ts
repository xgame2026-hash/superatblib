import type { MorphoPrivateExecutionSkeleton } from "./morpho-private-execution-skeleton.js";
import type { MorphoRoutePlannerResult } from "./morpho-route-planner.js";
import { morphoBlueAddressForChain } from "./morpho-blue-contract.js";
import {
  evaluateMorphoExecutionGate,
  type MorphoExecutionGateResult,
} from "./morpho-execution-gate.js";
import {
  buildMorphoBlueBaseUnwindQuoteDraft,
  buildMorphoBlueEthereumUnwindQuoteDraft,
  type MorphoUnwindQuoteDraft,
} from "./morpho-unwind-quote-draft.js";

export type MorphoPrivateBundleDraft = {
  stage: "bundle-draft-built";
  executable: false;
  submitReady: false;
  chain: "ethereum" | "base";
  chainId: 1 | 8453;
  relayFamily: "flashbots-bundle-candidate";
  targetUser: string;
  targetMarketLabel: string;
  executionGate: MorphoExecutionGateResult;
  liquidationTarget: {
    protocolAddress: `0x${string}`;
    marketId: string;
    borrower: `0x${string}`;
    marketParams: {
      loanToken: `0x${string}`;
      collateralToken: `0x${string}`;
      oracle: `0x${string}`;
      irm: `0x${string}`;
      lltv: string;
    };
    seizedAssets: string;
    repaidShares: string;
    callbackData: `0x${string}`;
  } | null;
  repayApproval: {
    token: `0x${string}`;
    spender: `0x${string}`;
    amountMode: "max";
  } | null;
  unwindQuoteDraft: MorphoUnwindQuoteDraft | null;
  bundle: {
    version: "morpho-private-draft-v1";
    operations: Array<{
      key: "repay" | "liquidate" | "unwind" | "settle";
      label: string;
      detail: string;
    }>;
    guards: Array<{
      key: "hf" | "borrow-usd" | "profitability";
      detail: string;
    }>;
  } | null;
  summary: string;
};

function buildMorphoBluePrivateBundleDraft(
  chain: "ethereum" | "base",
  routePlanner: MorphoRoutePlannerResult,
  privateExecutionSkeleton: MorphoPrivateExecutionSkeleton,
): MorphoPrivateBundleDraft {
  const selected = routePlanner.selectedOpportunity;
  const executionGate = evaluateMorphoExecutionGate(routePlanner);
  const protocolAddress = morphoBlueAddressForChain(chain);
  const chainId = chain === "base" ? 8453 : 1;
  const unwindQuoteDraft =
    chain === "base"
      ? buildMorphoBlueBaseUnwindQuoteDraft(routePlanner)
      : buildMorphoBlueEthereumUnwindQuoteDraft(routePlanner);
  if (
    !routePlanner.quoteAvailable ||
    !selected ||
    !privateExecutionSkeleton.selectedTargetUser ||
    !executionGate.eligible
  ) {
    return {
      stage: "bundle-draft-built",
      executable: false,
      submitReady: false,
      chain,
      chainId,
      relayFamily: "flashbots-bundle-candidate",
      targetUser: "",
      targetMarketLabel: "",
      executionGate,
      liquidationTarget: null,
      repayApproval: null,
      unwindQuoteDraft: null,
      bundle: null,
      summary:
        executionGate.eligible
          ? "Morpho private bundle builder is wired, but there is no live route/private stub pair to turn into a bundle draft yet."
          : `Morpho private bundle builder skipped bundle construction because the execution gate blocked the selected target. ${executionGate.summary}`,
    };
  }

  const hfDisplay =
    typeof selected.healthFactor === "number"
      ? selected.healthFactor.toFixed(3)
      : "--";
  const borrowDisplay =
    typeof selected.borrowAssetsUsd === "number"
      ? `$${selected.borrowAssetsUsd.toFixed(2)}`
      : "--";
  const liveSeizedAssets =
    typeof selected.collateralRaw === "string" &&
    selected.collateralRaw !== "0" &&
    selected.collateralRaw.length > 0
      ? selected.collateralRaw
      : typeof selected.collateral === "number" &&
          Number.isFinite(selected.collateral) &&
          selected.collateral > 0
        ? Math.trunc(selected.collateral).toString()
        : "0";
  const hasLiveSizing = liveSeizedAssets !== "0";

  return {
    stage: "bundle-draft-built",
    executable: false,
    submitReady: false,
    chain,
    chainId,
    relayFamily: "flashbots-bundle-candidate",
    targetUser: selected.user,
    targetMarketLabel: selected.marketLabel,
    executionGate,
    liquidationTarget: {
      protocolAddress,
      marketId: selected.marketId,
      borrower: selected.user as `0x${string}`,
      marketParams: selected.marketParams,
      seizedAssets: liveSeizedAssets,
      repaidShares: "0",
      callbackData: "0x",
    },
    repayApproval: {
      token: selected.marketParams.loanToken,
      spender: protocolAddress,
      amountMode: "max",
    },
    unwindQuoteDraft,
    bundle: {
      version: "morpho-private-draft-v1",
      operations: [
        {
          key: "repay",
          label: "Repay funding leg",
          detail: `Draft now includes an ERC20 approval draft for ${selected.loanSymbol} into Morpho core, while the actual funding source for roughly ${borrowDisplay} is still unresolved.`,
        },
        {
          key: "liquidate",
          label: "Liquidation call leg",
          detail: hasLiveSizing
            ? `Draft now sizes the liquidation leg from live position state, using seizedAssets=${liveSeizedAssets} and repaidShares=0 for user ${selected.user} on ${selected.marketLabel}.`
            : `Draft reserves a Morpho isolated-market liquidation call for user ${selected.user} and resolves official market params from ${selected.marketLabel}, but still lacks live seizedAssets sizing.`,
        },
        {
          key: "unwind",
          label: "Collateral unwind leg",
          detail: `Draft now includes a live quote request boundary for ${selected.collateralSymbol} -> ${selected.loanSymbol}, but actual swap calldata still depends on resolved seizedAssets/collateral amount.`,
        },
        {
          key: "settle",
          label: "Settlement leg",
          detail: "Draft reserves post-liquidation settlement and leftover accounting before private submission.",
        },
      ],
      guards: [
        {
          key: "hf",
          detail: `Require target health factor to remain inside the draft window. Current stub HF ${hfDisplay}.`,
        },
        {
          key: "borrow-usd",
          detail: `Require borrow notional to remain near the selected stub. Current borrow ${borrowDisplay}.`,
        },
        {
          key: "profitability",
          detail: "Require route-aware profitability to be computed before any real relay submission is enabled.",
        },
      ],
    },
    summary:
      hasLiveSizing
        ? `Morpho private bundle builder produced a build-only draft for ${selected.marketLabel}, including live liquidation sizing from position state, but it still does not submit to a live relay.`
        : `Morpho private bundle builder is wired and produced a build-only draft for ${selected.marketLabel}, including a resolvable liquidation target, but it still does not submit to a live relay.`,
  };
}

export function buildMorphoBlueEthereumPrivateBundleDraft(
  routePlanner: MorphoRoutePlannerResult,
  privateExecutionSkeleton: MorphoPrivateExecutionSkeleton,
): MorphoPrivateBundleDraft {
  return buildMorphoBluePrivateBundleDraft(
    "ethereum",
    routePlanner,
    privateExecutionSkeleton,
  );
}

export function buildMorphoBlueBasePrivateBundleDraft(
  routePlanner: MorphoRoutePlannerResult,
  privateExecutionSkeleton: MorphoPrivateExecutionSkeleton,
): MorphoPrivateBundleDraft {
  return buildMorphoBluePrivateBundleDraft("base", routePlanner, privateExecutionSkeleton);
}
