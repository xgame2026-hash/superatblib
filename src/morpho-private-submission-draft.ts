import {
  encodeErc20ApproveDraft,
} from "./morpho-blue-contract.js";
import type { MorphoPrivateBundleDraft } from "./morpho-private-bundle-builder.js";
import type { MorphoPrivateCallDraft } from "./morpho-private-call-draft.js";
import type { MorphoLiveUnwindQuote } from "./morpho-live-unwind-quote.js";
import { parseProfitRecipients } from "./profit-distribution.js";

export type MorphoPrivateSubmissionDraft = {
  stage: "submission-draft-built";
  executable: false;
  submitReady: false;
  chain: "ethereum" | "base";
  chainId: 1 | 8453;
  relayUrl: string;
  relayTransport: "flashbots_bundle_candidate" | "custom_private_relay_candidate";
  targetUser: string;
  targetMarketLabel: string;
  encodedTransactions: number;
  unresolved: string[];
  steps: Array<{
    key:
      | "repay-approve"
      | "unwind-approve"
      | "liquidate"
      | "unwind"
      | "settle";
    to: string;
    calldataStatus: "encoded-draft" | "placeholder" | "not-required";
    data?: `0x${string}`;
    detail: string;
  }>;
  summary: string;
};

function resolveSettleStep(): MorphoPrivateSubmissionDraft["steps"][number] {
  try {
    const recipients = parseProfitRecipients(
      process.env.PROFIT_RECIPIENTS,
      process.env.PROFIT_SPLIT_BPS,
    );
    if (recipients.length === 0) {
      return {
        key: "settle",
        to: "morpho-settlement",
        calldataStatus: "not-required",
        detail:
          "No onchain profit distribution is configured, so settlement is treated as a no-op for this build-only draft. Any leftover output remains with the executor account until live submission is implemented.",
      };
    }
  } catch (error) {
    return {
      key: "settle",
      to: "morpho-settlement",
      calldataStatus: "placeholder",
      detail:
        `Settlement is blocked because PROFIT_RECIPIENTS / PROFIT_SPLIT_BPS are misconfigured: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    key: "settle",
    to: "morpho-settlement",
    calldataStatus: "placeholder",
    detail:
      "Settlement still needs explicit profit-distribution wiring before this submission sequence becomes submit-ready.",
  };
}

export function buildMorphoPrivateSubmissionDraft(input: {
  bundleDraft: MorphoPrivateBundleDraft;
  callDraft: MorphoPrivateCallDraft;
  liveUnwindQuote: MorphoLiveUnwindQuote | null | undefined;
  relayUrl: string;
}): MorphoPrivateSubmissionDraft {
  const { bundleDraft, callDraft, liveUnwindQuote } = input;
  const relayTransport =
    bundleDraft.chain === "ethereum"
      ? "flashbots_bundle_candidate"
      : "custom_private_relay_candidate";

  if (!bundleDraft.bundle || !callDraft.calls.length) {
    return {
      stage: "submission-draft-built",
      executable: false,
      submitReady: false,
      chain: bundleDraft.chain,
      chainId: bundleDraft.chainId,
      relayUrl: input.relayUrl.trim(),
      relayTransport,
      targetUser: bundleDraft.targetUser,
      targetMarketLabel: bundleDraft.targetMarketLabel,
      encodedTransactions: 0,
      unresolved: ["no-call-draft"],
      steps: [],
      summary:
        "Morpho private submission draft could not be built because there is no executable call draft sequence yet.",
    };
  }

  const steps: MorphoPrivateSubmissionDraft["steps"] = [];

  const repayCall = callDraft.calls.find((call) => call.key === "repay");
  if (repayCall?.calldataStatus === "encoded-draft" && repayCall.data) {
    steps.push({
      key: "repay-approve",
      to: repayCall.to,
      calldataStatus: "encoded-draft",
      data: repayCall.data,
      detail: repayCall.detail,
    });
  }

  const unwindApprovalRequired =
    Boolean(liveUnwindQuote?.available) &&
    Boolean(liveUnwindQuote?.allowanceTarget) &&
    Boolean(bundleDraft.unwindQuoteDraft?.available);
  if (
    unwindApprovalRequired &&
    bundleDraft.unwindQuoteDraft &&
    liveUnwindQuote &&
    liveUnwindQuote.allowanceTarget
  ) {
    steps.push({
      key: "unwind-approve",
      to: bundleDraft.unwindQuoteDraft.inToken.address,
      calldataStatus: "encoded-draft",
      data: encodeErc20ApproveDraft({
        spender: liveUnwindQuote.allowanceTarget as `0x${string}`,
      }),
      detail:
        `Unwind path requires a collateral-token approval into ${liveUnwindQuote.allowanceTarget} before swap submission.`,
    });
  }

  const liquidateCall = callDraft.calls.find((call) => call.key === "liquidate");
  if (liquidateCall?.calldataStatus === "encoded-draft" && liquidateCall.data) {
    steps.push({
      key: "liquidate",
      to: liquidateCall.to,
      calldataStatus: "encoded-draft",
      data: liquidateCall.data,
      detail: liquidateCall.detail,
    });
  }

  const unwindCall = callDraft.calls.find((call) => call.key === "unwind");
  if (unwindCall?.calldataStatus === "encoded-draft" && unwindCall.data) {
    steps.push({
      key: "unwind",
      to: unwindCall.to,
      calldataStatus: "encoded-draft",
      data: unwindCall.data,
      detail: unwindCall.detail,
    });
  } else {
    steps.push({
      key: "unwind",
      to: unwindCall?.to ?? "morpho-unwind-route",
      calldataStatus: "placeholder",
      detail:
        unwindCall?.detail ??
        "Unwind execution is not ready, so no private submission sequence can be finalized.",
    });
  }

  steps.push(resolveSettleStep());

  const unresolved = [
    ...(input.relayUrl.trim() ? [] : ["missing-relay-url"]),
    ...(steps.some((step) => step.key === "settle" && step.calldataStatus === "placeholder")
      ? ["missing-settle-call"]
      : []),
    ...(bundleDraft.chain !== "ethereum" ? ["live-relay-submission-unimplemented"] : []),
  ];
  const encodedTransactions = steps.filter((step) => step.calldataStatus === "encoded-draft").length;

  return {
    stage: "submission-draft-built",
    executable: false,
    submitReady: false,
    chain: bundleDraft.chain,
    chainId: bundleDraft.chainId,
    relayUrl: input.relayUrl.trim(),
    relayTransport,
    targetUser: bundleDraft.targetUser,
    targetMarketLabel: bundleDraft.targetMarketLabel,
    encodedTransactions,
    unresolved,
    steps,
    summary:
      encodedTransactions > 0
        ? unresolved.includes("missing-settle-call")
          ? `Morpho private submission draft now assembles ${encodedTransactions} encoded transactions for ${bundleDraft.targetMarketLabel}, but it is not submit-ready until settlement and live relay submission are implemented.`
          : `Morpho private submission draft now assembles ${encodedTransactions} encoded transactions for ${bundleDraft.targetMarketLabel}. Settlement is already resolved as a no-op in the current config, so the only remaining blocker is live relay submission.`
        : `Morpho private submission draft exists for ${bundleDraft.targetMarketLabel}, but it still has no encoded transaction sequence.`,
  };
}
