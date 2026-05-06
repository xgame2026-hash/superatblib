import type {
  MorphoBlueLiveMarketSnapshot,
  MorphoBlueReadOnlyOpportunity,
} from "./morpho-blue-api.js";
import {
  resolveMorphoOperationalConfig,
} from "./morpho-operational-config.js";
import { parseProfitRecipients } from "./profit-distribution.js";
import { evaluateMorphoExecutionGate } from "./morpho-execution-gate.js";
import {
  buildMorphoBlueBasePrivateExecutionSkeleton,
  buildMorphoBlueEthereumPrivateExecutionSkeleton,
} from "./morpho-private-execution-skeleton.js";
import type { ProtocolDescriptor } from "./protocols.js";
import {
  planMorphoBlueBaseRoute,
  planMorphoBlueEthereumRoute,
} from "./morpho-route-planner.js";
import {
  buildMorphoBlueBaseRouteSkeleton,
  buildMorphoBlueEthereumRouteSkeleton,
} from "./morpho-route-skeleton.js";

export type MorphoExecutorCheckStatus = "ok" | "warn" | "missing";

export type MorphoExecutorCheckItem = {
  key: string;
  status: MorphoExecutorCheckStatus;
  label: string;
  detail: string;
};

export type MorphoExecutorCheckInput = {
  marketId?: string;
  signal?: string;
  hfMax?: string;
  ethereumRpcUrl?: string;
  executionRpcUrl?: string;
  controlRpcUrl?: string;
  flashbotsRelayUrl?: string;
  morphoEthereumRpcUrl?: string;
  morphoBaseRpcUrl?: string;
  morphoPrivateRelayUrl?: string;
  opportunities?: MorphoBlueReadOnlyOpportunity[];
  markets?: MorphoBlueLiveMarketSnapshot[];
  snapshot:
    | {
        ok: boolean;
        registryCount?: number;
        liveCount?: number;
        riskyPositions?: number;
        liquidatablePositions?: number;
        executionCandidatePositions?: number;
      }
    | null;
  snapshotError?: string;
};

export const MORPHO_BLUE_ETHEREUM_EXECUTOR_SKELETON = {
  marketKey: "morpho-blue-ethereum",
  marketLabel: "Morpho Blue / Ethereum",
  stage: "adapter-skeleton-wired",
  executable: false,
  nextStep:
    "Turn the encoded liquidate draft into live repay/unwind calldata and relay submission before exposing Morpho as a real execution market.",
} as const;

export const MORPHO_BLUE_BASE_EXECUTOR_SKELETON = {
  marketKey: "morpho-blue-base",
  marketLabel: "Morpho Blue / Base",
  stage: "base-execution-draft",
  executable: false,
  nextStep:
    "Use Base execution drafts for route/private-path validation, then run a small canary through the Base public mempool path before promoting Base to a real execution venue.",
} as const;

function morphoSettleNeedsDistribution(): boolean {
  try {
    return parseProfitRecipients(
      process.env.PROFIT_RECIPIENTS,
      process.env.PROFIT_SPLIT_BPS,
    ).length > 0;
  } catch {
    return true;
  }
}

export function buildMorphoBlueEthereumExecutorChecks(
  input: MorphoExecutorCheckInput,
): MorphoExecutorCheckItem[] {
  const configuredMarketId = input.marketId?.trim() ?? "";
  const configuredSignal = input.signal?.trim() ?? "";
  const configuredHfMax = input.hfMax?.trim() ?? "";
  const routeSkeleton = buildMorphoBlueEthereumRouteSkeleton({
    marketId: configuredMarketId,
    signal: configuredSignal,
    hfMax: configuredHfMax,
  });
  const routePlanner = planMorphoBlueEthereumRoute({
    marketId: configuredMarketId,
    signal: configuredSignal,
    hfMax: configuredHfMax,
    opportunities: input.opportunities,
    markets: input.markets,
  });
  const privateExecutionSkeleton =
    buildMorphoBlueEthereumPrivateExecutionSkeleton(routePlanner);
  const executionGate = evaluateMorphoExecutionGate(routePlanner);
  const config = resolveMorphoOperationalConfig({
    ethereumRpcUrl: input.ethereumRpcUrl ?? "",
    executionRpcUrl: input.executionRpcUrl ?? "",
    controlRpcUrl: input.controlRpcUrl ?? "",
    flashbotsRelayUrl: input.flashbotsRelayUrl ?? "",
    morpho: {
      marketId: configuredMarketId,
      signal: configuredSignal,
      hfMax: configuredHfMax,
      ethereumRpcUrl: input.morphoEthereumRpcUrl ?? "",
      baseRpcUrl: input.morphoBaseRpcUrl ?? "",
      privateRelayUrl: input.morphoPrivateRelayUrl ?? "",
    },
  });

  return [
    {
      key: "read-only-index",
      status: input.snapshot && input.snapshot.ok ? "ok" : "warn",
      label: "Read-only index",
      detail:
        input.snapshot && input.snapshot.ok
          ? `Official blue-api snapshot reachable. ${input.snapshot.registryCount ?? 0} starter markets / ${input.snapshot.liveCount ?? 0} live markets.`
          : `Official blue-api snapshot check failed${input.snapshotError ? `: ${input.snapshotError}` : "."}`,
    },
    {
      key: "morpho-ethereum-rpc",
      status: config.ethereumRpcUrl ? "ok" : "warn",
      label: "Morpho Ethereum RPC",
      detail: config.ethereumRpcUrl
        ? `Effective Morpho Ethereum RPC is configured via ${config.ethereumRpcSource}.`
        : "Morpho Ethereum RPC is not configured yet.",
    },
    {
      key: "morpho-private-relay",
      status: config.privateRelayUrl ? "ok" : "warn",
      label: "Morpho private relay",
      detail: config.privateRelayUrl
        ? `Effective Morpho private relay is configured via ${config.privateRelaySource}.`
        : "Morpho private relay is not configured yet.",
    },
    {
      key: "morpho-base-rpc",
      status: config.baseRpcUrl ? "ok" : "warn",
      label: "Morpho Base RPC",
      detail: config.baseRpcUrl
        ? `Morpho Base RPC is configured via ${config.baseRpcSource}.`
        : "Morpho Base RPC is not configured yet.",
    },
    {
      key: "default-filters",
      status:
        configuredMarketId || configuredSignal || configuredHfMax ? "ok" : "warn",
      label: "Default filters",
      detail:
        configuredMarketId || configuredSignal || configuredHfMax
          ? `marketId=${configuredMarketId || "--"} / signal=${configuredSignal || "all"} / hfMax=${configuredHfMax || "--"}`
          : "No Morpho-specific default filter is configured yet.",
    },
    {
      key: "execution-adapter",
      status: "ok",
      label: "Execution adapter skeleton",
      detail:
        "Morpho has a dedicated execution boundary module now, and future execution calls will hard-stop here instead of falling through the Aave path.",
    },
    {
      key: "funding-route",
      status: "ok",
      label: "Funding and unwind route skeleton",
      detail: routeSkeleton.summary,
    },
    {
      key: "route-implementation",
      status: routePlanner.quoteAvailable ? "ok" : "warn",
      label: routePlanner.quoteAvailable ? "Live route stub" : "Route planner boundary",
      detail: routePlanner.summary,
    },
    {
      key: "execution-gate",
      status: executionGate.eligible ? "ok" : "warn",
      label: executionGate.eligible
        ? "Execution candidacy gate"
        : "Execution candidacy blocked",
      detail: executionGate.summary,
    },
    {
      key: "private-execution",
      status: privateExecutionSkeleton.selectedTargetUser ? "ok" : "warn",
      label: privateExecutionSkeleton.selectedTargetUser
        ? "Private execution stub"
        : "Private execution skeleton",
      detail: privateExecutionSkeleton.summary,
    },
  ];
}

export function buildMorphoBlueBaseExecutorChecks(
  input: MorphoExecutorCheckInput,
): MorphoExecutorCheckItem[] {
  const configuredMarketId = input.marketId?.trim() ?? "";
  const configuredSignal = input.signal?.trim() ?? "";
  const configuredHfMax = input.hfMax?.trim() ?? "";
  const config = resolveMorphoOperationalConfig({
    ethereumRpcUrl: input.ethereumRpcUrl ?? "",
    executionRpcUrl: input.executionRpcUrl ?? "",
    controlRpcUrl: input.controlRpcUrl ?? "",
    flashbotsRelayUrl: input.flashbotsRelayUrl ?? "",
    morpho: {
      marketId: configuredMarketId,
      signal: configuredSignal,
      hfMax: configuredHfMax,
      ethereumRpcUrl: input.morphoEthereumRpcUrl ?? "",
      baseRpcUrl: input.morphoBaseRpcUrl ?? "",
      privateRelayUrl: input.morphoPrivateRelayUrl ?? "",
    },
  });
  const executionCandidates = Array.isArray(input.opportunities)
    ? input.opportunities.filter((item) => item.executionCandidate)
    : [];
  const executionCandidateCount =
    typeof input.snapshot?.executionCandidatePositions === "number"
      ? input.snapshot.executionCandidatePositions
      : executionCandidates.length;
  const routeSkeleton = buildMorphoBlueBaseRouteSkeleton({
    marketId: configuredMarketId,
    signal: configuredSignal,
    hfMax: configuredHfMax,
  });
  const routePlanner = planMorphoBlueBaseRoute({
    marketId: configuredMarketId,
    signal: configuredSignal,
    hfMax: configuredHfMax,
    opportunities: executionCandidates.length > 0 ? executionCandidates : input.opportunities,
    markets: input.markets,
  });
  const privateExecutionSkeleton =
    buildMorphoBlueBasePrivateExecutionSkeleton(routePlanner);
  const settleNeedsDistribution = morphoSettleNeedsDistribution();

  return [
    {
      key: "read-only-index",
      status: input.snapshot && input.snapshot.ok ? "ok" : "warn",
      label: "Read-only index",
      detail:
        input.snapshot && input.snapshot.ok
          ? `Official blue-api Base snapshot reachable. ${input.snapshot.registryCount ?? 0} active-risk markets / ${input.snapshot.liveCount ?? 0} live markets.`
          : `Official blue-api Base snapshot check failed${input.snapshotError ? `: ${input.snapshotError}` : "."}`,
    },
    {
      key: "morpho-base-rpc",
      status: config.baseRpcUrl ? "ok" : "warn",
      label: "Morpho Base RPC",
      detail: config.baseRpcUrl
        ? `Morpho Base RPC is configured via ${config.baseRpcSource}.`
        : "Morpho Base RPC is not configured yet.",
    },
    {
      key: "morpho-private-relay",
      status: config.privateRelayUrl ? "ok" : "warn",
      label: "Morpho private relay",
      detail: config.privateRelayUrl
        ? `Effective Morpho private relay is configured via ${config.privateRelaySource}.`
        : "Morpho private relay is not configured yet.",
    },
    {
      key: "base-filters",
      status: configuredMarketId || configuredSignal || configuredHfMax ? "ok" : "warn",
      label: "Base filters",
      detail:
        configuredMarketId || configuredSignal || configuredHfMax
          ? `marketId=${configuredMarketId || "--"} / signal=${configuredSignal || "all"} / hfMax=${configuredHfMax || "--"}`
          : "No Base-specific Morpho filter is configured yet.",
    },
    {
      key: "execution-candidates",
      status: executionCandidateCount > 0 ? "ok" : "warn",
      label: executionCandidateCount > 0 ? "Execution candidates" : "No execution candidates",
      detail:
        executionCandidateCount > 0
          ? `Base read-only snapshot currently exposes ${executionCandidateCount} execution-candidate positions after filtering.`
          : "Base read-only snapshot currently exposes no execution-candidate positions after filtering.",
    },
    {
      key: "funding-route",
      status: executionCandidateCount > 0 ? "ok" : "warn",
      label: "Base route skeleton",
      detail:
        executionCandidateCount > 0
          ? routeSkeleton.summary
          : "Base route skeleton is wired, but there is no execution-candidate position to attach it to yet.",
    },
    {
      key: "route-implementation",
      status: routePlanner.quoteAvailable ? "ok" : "warn",
      label: routePlanner.quoteAvailable ? "Base live route stub" : "Base route planner boundary",
      detail: routePlanner.summary,
    },
    {
      key: "private-execution",
      status: privateExecutionSkeleton.selectedTargetUser ? "ok" : "warn",
      label: privateExecutionSkeleton.selectedTargetUser
        ? "Base private execution stub"
        : "Base private execution skeleton",
      detail: privateExecutionSkeleton.summary,
    },
    {
      key: "base-execution-path",
      status: "warn",
      label: "Base execution path",
      detail:
        settleNeedsDistribution
          ? "Base draft wiring now reaches live unwind quote and unwind calldata drafts, but it still lacks final settlement wiring and live relay submission."
          : "Base draft wiring now reaches live unwind quote, unwind calldata drafts, submission candidates, and signed broadcast candidates. Under the current config, settlement is already a no-op, so the remaining step is a real canary broadcast through Base public mempool.",
    },
  ];
}

export function summarizeMorphoExecutorChecks(
  checks: MorphoExecutorCheckItem[],
): {
  okCount: number;
  warnCount: number;
  missingCount: number;
} {
  return {
    okCount: checks.filter((item) => item.status === "ok").length,
    warnCount: checks.filter((item) => item.status === "warn").length,
    missingCount: checks.filter((item) => item.status === "missing").length,
  };
}

export function unsupportedExecutionReasonForProtocol(
  protocol: ProtocolDescriptor | undefined,
  marketLabel: string | undefined,
): string | undefined {
  if (!protocol) {
    return undefined;
  }

  if (protocol.key === "morpho-blue") {
    return `${marketLabel ?? MORPHO_BLUE_ETHEREUM_EXECUTOR_SKELETON.marketLabel} executor, route, planner, private execution, bundle draft, and call draft layers are wired, and liquidate calldata can now be drafted from official ABI/market params. Real execution is still disabled until repay/unwind calldata and live relay submission are implemented.`;
  }

  if (protocol.adapterFamily !== "pool-address-provider") {
    return `${marketLabel ?? protocol.label} uses ${protocol.adapterFamily} mechanics and is not supported by the current pool-based liquidator runner.`;
  }

  return undefined;
}
