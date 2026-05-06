import { loadDashboardSettings } from "./dashboard-settings.js";
import { assessMorphoBroadcastGate } from "./morpho-broadcast-gate.js";
import {
  buildMorphoBlueBaseExecutorChecks,
  buildMorphoBlueEthereumExecutorChecks,
  MORPHO_BLUE_BASE_EXECUTOR_SKELETON,
  MORPHO_BLUE_ETHEREUM_EXECUTOR_SKELETON,
  summarizeMorphoExecutorChecks,
} from "./morpho-execution-skeleton.js";
import {
  buildMorphoBlueBasePrivateBundleDraft,
  buildMorphoBlueEthereumPrivateBundleDraft,
} from "./morpho-private-bundle-builder.js";
import {
  buildMorphoBlueBasePrivateCallDraft,
  buildMorphoBlueEthereumPrivateCallDraft,
} from "./morpho-private-call-draft.js";
import { buildMorphoPrivateSubmissionDraft } from "./morpho-private-submission-draft.js";
import { buildMorphoPrivateRelayDraft } from "./morpho-private-relay-draft.js";
import { assessMorphoLiveSubmissionReadiness } from "./morpho-live-submission.js";
import {
  type MorphoBlueBaseDashboardSnapshot,
  type MorphoBlueEthereumDashboardSnapshot,
  fetchMorphoBlueBaseDashboardSnapshot,
  fetchMorphoBlueEthereumDashboardSnapshot,
} from "./morpho-blue-api.js";
import { hydrateMorphoOpportunitiesWithOnchainPositions } from "./morpho-onchain-position.js";
import {
  buildMorphoBlueBasePrivateExecutionSkeleton,
  buildMorphoBlueEthereumPrivateExecutionSkeleton,
} from "./morpho-private-execution-skeleton.js";
import { resolveMorphoOperationalConfig } from "./morpho-operational-config.js";
import {
  buildMorphoBlueBaseLiveUnwindQuote,
  buildMorphoBlueEthereumLiveUnwindQuote,
} from "./morpho-live-unwind-quote.js";
import {
  planMorphoBlueBaseRoute,
  planMorphoBlueEthereumRoute,
} from "./morpho-route-planner.js";
import {
  buildMorphoBlueBaseRouteSkeleton,
  buildMorphoBlueEthereumRouteSkeleton,
} from "./morpho-route-skeleton.js";

function readArg(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    return inline.slice(name.length + 3);
  }

  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0) {
    return process.argv[index + 1];
  }

  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const chain = readArg("chain") === "base" ? "base" : "ethereum";
  const settings = loadDashboardSettings();
  const configuredMarketId = readArg("marketId") ?? settings.morpho.marketId ?? "";
  const configuredSignal = readArg("kind") ?? settings.morpho.signal ?? "";
  const configuredHfMax = readArg("hfMax") ?? settings.morpho.hfMax ?? "";
  const force = hasFlag("refresh");
  const operationalConfig = resolveMorphoOperationalConfig(settings);

  let snapshot:
    | MorphoBlueEthereumDashboardSnapshot
    | MorphoBlueBaseDashboardSnapshot
    | null = null;
  let snapshotError = "";

  try {
    snapshot = chain === "base"
      ? await fetchMorphoBlueBaseDashboardSnapshot({ force })
      : await fetchMorphoBlueEthereumDashboardSnapshot({ force });
  } catch (error) {
    snapshotError = error instanceof Error ? error.message : String(error);
  }

  const preferredOpportunities =
    snapshot?.analysis?.topExecutionCandidates?.length
      ? snapshot.analysis.topExecutionCandidates
      : snapshot?.analysis?.topOpportunities ?? [];
  const executorOpportunities = await hydrateMorphoOpportunitiesWithOnchainPositions({
    chain,
    rpcUrl: chain === "base" ? operationalConfig.baseRpcUrl : operationalConfig.ethereumRpcUrl,
    opportunities: preferredOpportunities,
  });

  const baseInput = {
    marketId: configuredMarketId,
    signal: configuredSignal,
    hfMax: configuredHfMax,
    opportunities: preferredOpportunities,
    markets: snapshot?.markets ?? [],
    snapshot: snapshot
      ? {
          ok: snapshot.ok,
          registryCount: snapshot.registryCount,
          liveCount: snapshot.liveCount,
          riskyPositions:
            snapshot.analysis && typeof snapshot.analysis.riskyPositions === "number"
              ? snapshot.analysis.riskyPositions
              : 0,
          liquidatablePositions:
            snapshot.analysis &&
            typeof snapshot.analysis.liquidatablePositions === "number"
              ? snapshot.analysis.liquidatablePositions
              : 0,
          executionCandidatePositions:
            snapshot.analysis &&
            typeof snapshot.analysis.executionCandidatePositions === "number"
              ? snapshot.analysis.executionCandidatePositions
              : 0,
        }
      : null,
    ethereumRpcUrl: settings.ethereumRpcUrl,
    executionRpcUrl: settings.executionRpcUrl,
    controlRpcUrl: settings.controlRpcUrl,
    flashbotsRelayUrl: settings.flashbotsRelayUrl,
    morphoEthereumRpcUrl: settings.morpho.ethereumRpcUrl,
    morphoBaseRpcUrl: settings.morpho.baseRpcUrl,
    morphoPrivateRelayUrl: settings.morpho.privateRelayUrl,
    snapshotError,
  };
  const checks = chain === "base"
    ? buildMorphoBlueBaseExecutorChecks(baseInput)
    : buildMorphoBlueEthereumExecutorChecks(baseInput);
  const summary = summarizeMorphoExecutorChecks(checks);
  if (chain === "base") {
    const routeSkeleton = buildMorphoBlueBaseRouteSkeleton({
      marketId: configuredMarketId,
      signal: configuredSignal,
      hfMax: configuredHfMax,
    });
    const routePlanner = planMorphoBlueBaseRoute({
      marketId: configuredMarketId,
      signal: configuredSignal,
      hfMax: configuredHfMax,
      opportunities: executorOpportunities,
      markets: snapshot?.markets ?? [],
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
    const privateCallDraft =
      buildMorphoBlueBasePrivateCallDraft(privateBundleDraft, liveUnwindQuote);
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
    const result = {
      ok: true,
      action: "check-morpho-executor",
      stage: MORPHO_BLUE_BASE_EXECUTOR_SKELETON.stage,
      executable: MORPHO_BLUE_BASE_EXECUTOR_SKELETON.executable,
      market: MORPHO_BLUE_BASE_EXECUTOR_SKELETON.marketKey,
      generatedAt: new Date().toISOString(),
      chain,
      settings: {
        marketId: configuredMarketId,
        signal: configuredSignal,
        hfMax: configuredHfMax,
        ethereumRpc: operationalConfig.ethereumRpcUrl ? "configured" : "missing",
        baseRpc: operationalConfig.baseRpcUrl ? "configured" : "missing",
        privateRelay: operationalConfig.privateRelayUrl ? "configured" : "missing",
      },
      operationalConfig,
      snapshot: snapshot
        ? {
            ok: snapshot.ok,
            registryCount: snapshot.registryCount,
            liveCount: snapshot.liveCount,
            riskyPositions:
              snapshot.analysis && typeof snapshot.analysis.riskyPositions === "number"
                ? snapshot.analysis.riskyPositions
                : 0,
            liquidatablePositions:
              snapshot.analysis &&
              typeof snapshot.analysis.liquidatablePositions === "number"
                ? snapshot.analysis.liquidatablePositions
                : 0,
            executionCandidatePositions:
              snapshot.analysis &&
              typeof snapshot.analysis.executionCandidatePositions === "number"
                ? snapshot.analysis.executionCandidatePositions
                : 0,
          }
        : null,
      routeSkeleton,
      routePlanner,
      privateExecutionSkeleton,
      privateBundleDraft,
      liveUnwindQuote,
      privateCallDraft,
      privateSubmissionDraft,
      privateRelayDraft,
      liveSubmissionReadiness,
      broadcastGate,
      checks,
      summary,
      nextStep: MORPHO_BLUE_BASE_EXECUTOR_SKELETON.nextStep,
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const routeSkeleton = buildMorphoBlueEthereumRouteSkeleton({
    marketId: configuredMarketId,
    signal: configuredSignal,
    hfMax: configuredHfMax,
  });
  const routePlanner = planMorphoBlueEthereumRoute({
    marketId: configuredMarketId,
    signal: configuredSignal,
    hfMax: configuredHfMax,
    opportunities: executorOpportunities,
    markets: snapshot?.markets ?? [],
  });
  const privateExecutionSkeleton =
    buildMorphoBlueEthereumPrivateExecutionSkeleton(routePlanner);
  const privateBundleDraft = buildMorphoBlueEthereumPrivateBundleDraft(
    routePlanner,
    privateExecutionSkeleton,
  );
  const liveUnwindQuote = await buildMorphoBlueEthereumLiveUnwindQuote({
    draft: privateBundleDraft.unwindQuoteDraft,
    rpcUrl: operationalConfig.ethereumRpcUrl,
    privateKey: settings.privateKey,
  });
  const privateCallDraft =
    buildMorphoBlueEthereumPrivateCallDraft(privateBundleDraft, liveUnwindQuote);
  const privateSubmissionDraft = buildMorphoPrivateSubmissionDraft({
    bundleDraft: privateBundleDraft,
    callDraft: privateCallDraft,
    liveUnwindQuote,
    relayUrl: operationalConfig.privateRelayUrl,
  });
  const privateRelayDraft = await buildMorphoPrivateRelayDraft({
    submissionDraft: privateSubmissionDraft,
    rpcUrl: operationalConfig.ethereumRpcUrl,
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

  const result = {
    ok: true,
    action: "check-morpho-executor",
    stage: MORPHO_BLUE_ETHEREUM_EXECUTOR_SKELETON.stage,
    executable: MORPHO_BLUE_ETHEREUM_EXECUTOR_SKELETON.executable,
    market: MORPHO_BLUE_ETHEREUM_EXECUTOR_SKELETON.marketKey,
    generatedAt: new Date().toISOString(),
    chain,
    settings: {
      marketId: configuredMarketId,
      signal: configuredSignal,
      hfMax: configuredHfMax,
      ethereumRpc: operationalConfig.ethereumRpcUrl ? "configured" : "missing",
      baseRpc: operationalConfig.baseRpcUrl ? "configured" : "missing",
      privateRelay: operationalConfig.privateRelayUrl ? "configured" : "missing",
    },
    operationalConfig,
    snapshot: snapshot
      ? {
          ok: snapshot.ok,
          registryCount: snapshot.registryCount,
          liveCount: snapshot.liveCount,
          riskyPositions:
            snapshot.analysis && typeof snapshot.analysis.riskyPositions === "number"
              ? snapshot.analysis.riskyPositions
              : 0,
          liquidatablePositions:
            snapshot.analysis &&
            typeof snapshot.analysis.liquidatablePositions === "number"
              ? snapshot.analysis.liquidatablePositions
              : 0,
        }
      : null,
    routeSkeleton,
    routePlanner,
    privateExecutionSkeleton,
    privateBundleDraft,
    liveUnwindQuote,
    privateCallDraft,
    privateSubmissionDraft,
    privateRelayDraft,
    liveSubmissionReadiness,
    broadcastGate,
    checks,
    summary,
    nextStep: MORPHO_BLUE_ETHEREUM_EXECUTOR_SKELETON.nextStep,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
