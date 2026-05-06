import type { MorphoPrivateBundleDraft } from "./morpho-private-bundle-builder.js";
import {
  encodeErc20ApproveDraft,
  encodeMorphoBlueLiquidateDraft,
} from "./morpho-blue-contract.js";
import type { MorphoLiveUnwindQuote } from "./morpho-live-unwind-quote.js";
import { parseProfitRecipients } from "./profit-distribution.js";

export type MorphoPrivateCallDraft = {
  stage: "call-draft-built";
  executable: false;
  chain: "ethereum" | "base";
  chainId: 1 | 8453;
  encoded: boolean;
  encodedCalls: number;
  targetUser: string;
  targetMarketLabel: string;
  calls: Array<{
    key: "repay" | "liquidate" | "unwind" | "settle";
    to: string;
    calldataStatus: "placeholder" | "encoded-draft" | "quote-draft" | "not-required";
    functionName?: string;
    data?: `0x${string}`;
    detail: string;
  }>;
  summary: string;
};

function morphoSettleCallStatus(): {
  calldataStatus: "placeholder" | "not-required";
  detail: string;
} {
  try {
    const recipients = parseProfitRecipients(
      process.env.PROFIT_RECIPIENTS,
      process.env.PROFIT_SPLIT_BPS,
    );
    if (recipients.length === 0) {
      return {
        calldataStatus: "not-required",
        detail:
          "No onchain profit distribution is configured, so the settle leg is treated as a no-op in the current call draft.",
      };
    }
  } catch (error) {
    return {
      calldataStatus: "placeholder",
      detail:
        `Settlement call remains blocked because PROFIT_RECIPIENTS / PROFIT_SPLIT_BPS are misconfigured: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    calldataStatus: "placeholder",
    detail: "Settlement call is reserved as a placeholder; no final accounting calldata is encoded yet.",
  };
}

function buildMorphoBluePrivateCallDraft(
  bundleDraft: MorphoPrivateBundleDraft,
  liveUnwindQuote?: MorphoLiveUnwindQuote | null,
): MorphoPrivateCallDraft {
  if (!bundleDraft.bundle || !bundleDraft.targetUser || !bundleDraft.targetMarketLabel) {
    return {
      stage: "call-draft-built",
      executable: false,
      chain: bundleDraft.chain,
      chainId: bundleDraft.chainId,
      encoded: false,
      encodedCalls: 0,
      targetUser: "",
      targetMarketLabel: "",
      calls: [],
      summary:
        bundleDraft.executionGate && !bundleDraft.executionGate.eligible
          ? `Morpho private call draft builder did not emit calls because the execution gate blocked the selected target. ${bundleDraft.executionGate.summary}`
          : "Morpho private call draft builder is wired, but there is no bundle draft available to turn into a call list yet.",
    };
  }

  const liquidationCall =
    bundleDraft.liquidationTarget
      ? {
          key: "liquidate" as const,
          to: bundleDraft.liquidationTarget.protocolAddress,
          calldataStatus: "encoded-draft" as const,
          functionName: "liquidate",
          data: encodeMorphoBlueLiquidateDraft({
            marketParams: bundleDraft.liquidationTarget.marketParams,
            borrower: bundleDraft.liquidationTarget.borrower,
            seizedAssets: bundleDraft.liquidationTarget.seizedAssets,
            repaidShares: bundleDraft.liquidationTarget.repaidShares,
            data: bundleDraft.liquidationTarget.callbackData,
          }),
          detail:
            bundleDraft.liquidationTarget.seizedAssets !== "0"
              ? "Morpho liquidation call now uses the official liquidate ABI, resolved market params, and live seizedAssets sizing from position state, but the calldata is still not submission-ready."
              : "Morpho liquidation call now uses the official liquidate ABI and resolved market params, but seizedAssets/repaidShares are still zero placeholders and the calldata is not submission-ready.",
        }
      : {
          key: "liquidate" as const,
          to: "morpho-market",
          calldataStatus: "placeholder" as const,
          detail: "Morpho liquidation call is reserved as a placeholder; no live calldata is encoded yet.",
        };

  const repayCall =
    bundleDraft.repayApproval
      ? {
          key: "repay" as const,
          to: bundleDraft.repayApproval.token,
          calldataStatus: "encoded-draft" as const,
          functionName: "approve",
          data: encodeErc20ApproveDraft({
            spender: bundleDraft.repayApproval.spender,
          }),
          detail:
            "Repay leg now includes an ERC20 approve draft that grants Morpho core max allowance on the loan token, but the actual funding transfer and repay sizing are still unresolved.",
        }
      : {
          key: "repay" as const,
          to: "morpho-repay-source",
          calldataStatus: "placeholder" as const,
          detail: "Repay source call is reserved as a placeholder; no live calldata is encoded yet.",
        };

  const settleCall = morphoSettleCallStatus();
  const calls = [
    repayCall,
    liquidationCall,
    liveUnwindQuote && liveUnwindQuote.available && liveUnwindQuote.swapTarget && liveUnwindQuote.swapCalldata
      ? {
          key: "unwind" as const,
          to: liveUnwindQuote.swapTarget,
          calldataStatus: "encoded-draft" as const,
          functionName: "swap",
          data: liveUnwindQuote.swapCalldata,
          detail:
            liveUnwindQuote.allowanceTarget
              ? `Collateral unwind now includes live ${liveUnwindQuote.provider} swap calldata for ${bundleDraft.targetMarketLabel}. Quote is usable, but token approval into ${liveUnwindQuote.allowanceTarget} and settlement ordering still need final execution wiring.`
              : `Collateral unwind now includes live ${liveUnwindQuote.provider} swap calldata for ${bundleDraft.targetMarketLabel}, but settlement ordering still needs final execution wiring.`,
        }
      : {
          key: "unwind" as const,
          to: bundleDraft.unwindQuoteDraft && bundleDraft.unwindQuoteDraft.available
            ? ("quote-provider:" + (bundleDraft.unwindQuoteDraft.preferredProviders[0] || "morpho-unwind-route"))
            : "morpho-unwind-route",
          calldataStatus: bundleDraft.unwindQuoteDraft && bundleDraft.unwindQuoteDraft.available
            ? "quote-draft" as const
            : "placeholder" as const,
          detail: bundleDraft.unwindQuoteDraft && bundleDraft.unwindQuoteDraft.available
            ? bundleDraft.unwindQuoteDraft.summary
            : "Collateral unwind call is reserved as a placeholder; no live swap/unwind calldata is encoded yet.",
        },
    {
      key: "settle" as const,
      to: "morpho-settlement",
      calldataStatus: settleCall.calldataStatus,
      detail: settleCall.detail,
    },
  ];
  const encodedCalls = calls.filter((call) => call.calldataStatus === "encoded-draft").length;

  return {
    stage: "call-draft-built",
    executable: false,
    chain: bundleDraft.chain,
    chainId: bundleDraft.chainId,
    encoded: encodedCalls > 0,
    encodedCalls,
    targetUser: bundleDraft.targetUser,
    targetMarketLabel: bundleDraft.targetMarketLabel,
    calls,
    summary:
      encodedCalls > 0
        ? settleCall.calldataStatus === "not-required"
          ? `Morpho private call draft builder produced ${encodedCalls} encoded call drafts for ${bundleDraft.targetMarketLabel}. Under the current config, settle is a no-op, so the remaining blockers are live relay-ready submission boundaries.`
          : `Morpho private call draft builder produced ${encodedCalls} encoded call drafts for ${bundleDraft.targetMarketLabel}, but settle is still a placeholder and nothing is relay-ready yet.`
        : `Morpho private call draft builder is wired and produced a call list for ${bundleDraft.targetMarketLabel}, but every call is still a placeholder and nothing is relay-ready yet.`,
  };
}

export function buildMorphoBlueEthereumPrivateCallDraft(
  bundleDraft: MorphoPrivateBundleDraft,
  liveUnwindQuote?: MorphoLiveUnwindQuote | null,
): MorphoPrivateCallDraft {
  return buildMorphoBluePrivateCallDraft(bundleDraft, liveUnwindQuote);
}

export function buildMorphoBlueBasePrivateCallDraft(
  bundleDraft: MorphoPrivateBundleDraft,
  liveUnwindQuote?: MorphoLiveUnwindQuote | null,
): MorphoPrivateCallDraft {
  return buildMorphoBluePrivateCallDraft(bundleDraft, liveUnwindQuote);
}
