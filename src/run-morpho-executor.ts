import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

import { loadDashboardSettings } from "./dashboard-settings.js";
import {
  type MorphoBlueBaseDashboardSnapshot,
  fetchMorphoBlueBaseDashboardSnapshot,
} from "./morpho-blue-api.js";
import { assessMorphoBroadcastGate } from "./morpho-broadcast-gate.js";
import { appendExecutionHistory } from "./history.js";
import { assessMorphoLiveSubmissionReadiness } from "./morpho-live-submission.js";
import { hydrateMorphoOpportunitiesWithOnchainPositions } from "./morpho-onchain-position.js";
import { resolveMorphoOperationalConfig } from "./morpho-operational-config.js";
import { buildMorphoBlueBasePrivateBundleDraft } from "./morpho-private-bundle-builder.js";
import { buildMorphoBlueBasePrivateCallDraft } from "./morpho-private-call-draft.js";
import { buildMorphoBlueBasePrivateExecutionSkeleton } from "./morpho-private-execution-skeleton.js";
import { buildMorphoPrivateRelayDraft } from "./morpho-private-relay-draft.js";
import { buildMorphoPrivateSubmissionDraft } from "./morpho-private-submission-draft.js";
import { buildMorphoBlueBaseLiveUnwindQuote } from "./morpho-live-unwind-quote.js";
import { planMorphoBlueBaseRoute } from "./morpho-route-planner.js";

function readArg(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function buildBaseExecutionPipeline(params: {
  force: boolean;
  marketId: string;
  signal: string;
  hfMax: string;
}) {
  const settings = loadDashboardSettings();
  const operationalConfig = resolveMorphoOperationalConfig(settings);
  const snapshot: MorphoBlueBaseDashboardSnapshot = await fetchMorphoBlueBaseDashboardSnapshot({
    force: params.force,
  });
  const preferredOpportunities =
    snapshot.analysis?.topExecutionCandidates?.length
      ? snapshot.analysis.topExecutionCandidates
      : snapshot.analysis?.topOpportunities ?? [];
  const executorOpportunities = await hydrateMorphoOpportunitiesWithOnchainPositions({
    chain: "base",
    rpcUrl: operationalConfig.baseRpcUrl,
    opportunities: preferredOpportunities,
  });
  const routePlanner = planMorphoBlueBaseRoute({
    marketId: params.marketId,
    signal: params.signal,
    hfMax: params.hfMax,
    opportunities: executorOpportunities,
    markets: snapshot.markets ?? [],
  });
  const privateExecutionSkeleton =
    buildMorphoBlueBasePrivateExecutionSkeleton(routePlanner);
  const privateBundleDraft = buildMorphoBlueBasePrivateBundleDraft(
    routePlanner,
    privateExecutionSkeleton,
  );
  const liveUnwindQuote = await buildMorphoBlueBaseLiveUnwindQuote({
    draft: privateBundleDraft.unwindQuoteDraft,
    rpcUrl: operationalConfig.baseRpcUrl,
    privateKey: settings.privateKey,
  });
  const privateCallDraft = buildMorphoBlueBasePrivateCallDraft(
    privateBundleDraft,
    liveUnwindQuote,
  );
  const privateSubmissionDraft = buildMorphoPrivateSubmissionDraft({
    bundleDraft: privateBundleDraft,
    callDraft: privateCallDraft,
    liveUnwindQuote,
    relayUrl: operationalConfig.privateRelayUrl,
  });
  const privateRelayDraft = await buildMorphoPrivateRelayDraft({
    submissionDraft: privateSubmissionDraft,
    rpcUrl: operationalConfig.baseRpcUrl,
    privateKey: settings.privateKey,
    authPrivateKey: settings.flashbotsAuthPrivateKey,
  });
  const liveSubmissionReadiness = assessMorphoLiveSubmissionReadiness({
    draft: privateRelayDraft,
    authPrivateKey: settings.flashbotsAuthPrivateKey,
  });
  const broadcastGate = assessMorphoBroadcastGate({
    routePlanner,
    bundleDraft: privateBundleDraft,
    liveUnwindQuote,
    submissionDraft: privateSubmissionDraft,
    relayDraft: privateRelayDraft,
    liveSubmissionReadiness,
  });

  return {
    settings,
    operationalConfig,
    snapshot,
    routePlanner,
    privateExecutionSkeleton,
    privateBundleDraft,
    liveUnwindQuote,
    privateCallDraft,
    privateSubmissionDraft,
    privateRelayDraft,
    liveSubmissionReadiness,
    broadcastGate,
  };
}

async function main(): Promise<void> {
  const force = hasFlag("refresh");
  const broadcast = hasFlag("broadcast");
  const marketId = readArg("marketId") ?? "";
  const signal = readArg("kind") ?? "";
  const hfMax = readArg("hfMax") ?? loadDashboardSettings().morpho.hfMax ?? "1.05";

  const pipeline = await buildBaseExecutionPipeline({
    force,
    marketId,
    signal,
    hfMax,
  });

  const report: Record<string, unknown> = {
    ok: true,
    action: "run-morpho-executor",
    chainId: 8453,
    chainName: "Base",
    executionMarketKey: "morpho-blue-base",
    executionMarketLabel: "Morpho Blue / Base",
    marketId: pipeline.routePlanner.marketId,
    selectedUser: pipeline.routePlanner.selectedOpportunity?.user,
    liquidatable:
      pipeline.routePlanner.selectedOpportunity?.kind === "liquidatable",
    routePlanner: pipeline.routePlanner,
    privateExecutionSkeleton: pipeline.privateExecutionSkeleton,
    privateBundleDraft: pipeline.privateBundleDraft,
    liveUnwindQuote: pipeline.liveUnwindQuote,
    privateCallDraft: pipeline.privateCallDraft,
    privateSubmissionDraft: pipeline.privateSubmissionDraft,
    privateRelayDraft: pipeline.privateRelayDraft,
    liveSubmissionReadiness: pipeline.liveSubmissionReadiness,
    broadcastGate: pipeline.broadcastGate,
    broadcast,
  };

  if (!broadcast) {
    appendExecutionHistory("run:morpho-executor", report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!pipeline.liveSubmissionReadiness.ready) {
    throw new Error(
      `Refusing to broadcast Morpho Base canary. ${pipeline.liveSubmissionReadiness.summary}`,
    );
  }

  if (!pipeline.broadcastGate.eligible) {
    throw new Error(
      `Refusing to broadcast Morpho Base canary. ${pipeline.broadcastGate.summary}`,
    );
  }

  if (pipeline.liveSubmissionReadiness.transport !== "public_mempool") {
    throw new Error(
      `Unsupported Morpho Base live submission transport: ${pipeline.liveSubmissionReadiness.transport ?? "unknown"}.`,
    );
  }

  const publicClient = createPublicClient({
    chain: base,
    transport: http(pipeline.operationalConfig.baseRpcUrl),
  });

  const submitted: Array<{
    key: string;
    txHash: `0x${string}`;
    status?: string;
  }> = [];

  for (const tx of pipeline.privateRelayDraft.transactions) {
    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: tx.signedTx,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    submitted.push({
      key: tx.key,
      txHash,
      status: receipt.status,
    });
  }

  const finalTx = submitted[submitted.length - 1];
  const finalReport: Record<string, unknown> = {
    ...report,
    submittedTransactions: submitted,
    broadcastResult: {
      executeTxHash: finalTx?.txHash,
      status: finalTx?.status ?? "unknown",
    },
  };

  appendExecutionHistory("run:morpho-executor", finalReport);
  console.log(JSON.stringify(finalReport, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
