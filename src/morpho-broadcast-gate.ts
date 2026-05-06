import type { MorphoLiveSubmissionReadiness } from "./morpho-live-submission.js";
import type { MorphoLiveUnwindQuote } from "./morpho-live-unwind-quote.js";
import type { MorphoPrivateBundleDraft } from "./morpho-private-bundle-builder.js";
import type { MorphoPrivateRelayDraft } from "./morpho-private-relay-draft.js";
import type { MorphoPrivateSubmissionDraft } from "./morpho-private-submission-draft.js";
import type { MorphoRoutePlannerResult } from "./morpho-route-planner.js";

const MORPHO_BASE_CANARY_MIN_BORROW_USD = 100;
const MORPHO_BASE_CANARY_MIN_COLLATERAL_USD = 100;
const MORPHO_BASE_CANARY_MIN_SIGNED_TXS = 4;

export type MorphoBroadcastGate = {
  stage: "broadcast-gate-assessed";
  eligible: boolean;
  chain: "ethereum" | "base";
  reasons: string[];
  thresholds: {
    minBorrowUsd: number;
    minCollateralUsd: number;
    minSignedTransactions: number;
  };
  summary: string;
};

export function assessMorphoBroadcastGate(input: {
  routePlanner: MorphoRoutePlannerResult;
  bundleDraft: MorphoPrivateBundleDraft;
  liveUnwindQuote: MorphoLiveUnwindQuote | null | undefined;
  submissionDraft: MorphoPrivateSubmissionDraft;
  relayDraft: MorphoPrivateRelayDraft;
  liveSubmissionReadiness: MorphoLiveSubmissionReadiness;
}): MorphoBroadcastGate {
  const { routePlanner, bundleDraft, liveUnwindQuote, submissionDraft, relayDraft, liveSubmissionReadiness } =
    input;
  const selected = routePlanner.selectedOpportunity;
  const chain = routePlanner.chain;
  const reasons: string[] = [];

  if (!selected) {
    reasons.push("no-selected-opportunity");
  }
  if (!bundleDraft.executionGate.eligible) {
    reasons.push("execution-gate-blocked");
  }
  if (!liveSubmissionReadiness.ready) {
    reasons.push("submission-not-ready");
  }
  if (!liveUnwindQuote?.available) {
    reasons.push("missing-live-unwind-quote");
  }
  if (submissionDraft.encodedTransactions < MORPHO_BASE_CANARY_MIN_SIGNED_TXS) {
    reasons.push("incomplete-submission-sequence");
  }
  if (relayDraft.signedTransactions < MORPHO_BASE_CANARY_MIN_SIGNED_TXS) {
    reasons.push("insufficient-signed-transactions");
  }
  if (chain === "base") {
    const borrowUsd = selected?.borrowAssetsUsd ?? 0;
    const collateralUsd = selected?.collateralUsd ?? 0;
    if (borrowUsd < MORPHO_BASE_CANARY_MIN_BORROW_USD) {
      reasons.push("borrow-below-canary-floor");
    }
    if (collateralUsd < MORPHO_BASE_CANARY_MIN_COLLATERAL_USD) {
      reasons.push("collateral-below-canary-floor");
    }
    if (liveSubmissionReadiness.transport !== "public_mempool") {
      reasons.push("unexpected-base-transport");
    }
  } else if (liveSubmissionReadiness.transport !== "flashbots_bundle") {
    reasons.push("unexpected-ethereum-transport");
  }

  if (!reasons.length) {
    return {
      stage: "broadcast-gate-assessed",
      eligible: true,
      chain,
      reasons: [],
      thresholds: {
        minBorrowUsd: MORPHO_BASE_CANARY_MIN_BORROW_USD,
        minCollateralUsd: MORPHO_BASE_CANARY_MIN_COLLATERAL_USD,
        minSignedTransactions: MORPHO_BASE_CANARY_MIN_SIGNED_TXS,
      },
      summary:
        chain === "base"
          ? "Morpho Base canary broadcast gate passed: live quote exists, submission path is ready, and the selected position clears the minimum Base notional floor."
          : "Morpho Ethereum broadcast gate passed: live quote exists, Flashbots submission path is ready, and the selected position clears the minimum execution floor.",
    };
  }

  const borrowDisplay =
    typeof selected?.borrowAssetsUsd === "number" ? `$${selected.borrowAssetsUsd.toFixed(2)}` : "--";
  const collateralDisplay =
    typeof selected?.collateralUsd === "number" ? `$${selected.collateralUsd.toFixed(2)}` : "--";

  return {
    stage: "broadcast-gate-assessed",
    eligible: false,
    chain,
    reasons,
    thresholds: {
      minBorrowUsd: MORPHO_BASE_CANARY_MIN_BORROW_USD,
      minCollateralUsd: MORPHO_BASE_CANARY_MIN_COLLATERAL_USD,
      minSignedTransactions: MORPHO_BASE_CANARY_MIN_SIGNED_TXS,
    },
    summary:
      chain === "base"
        ? `Morpho Base canary broadcast gate blocked the current target because borrow=${borrowDisplay}, collateral=${collateralDisplay}, signedTxs=${relayDraft.signedTransactions}, and live submission transport=${liveSubmissionReadiness.transport ?? "unknown"} do not satisfy the minimum broadcast rules.`
        : `Morpho Ethereum broadcast gate blocked the current target because borrow=${borrowDisplay}, collateral=${collateralDisplay}, signedTxs=${relayDraft.signedTransactions}, and live submission transport=${liveSubmissionReadiness.transport ?? "unknown"} do not satisfy the minimum broadcast rules.`,
  };
}
