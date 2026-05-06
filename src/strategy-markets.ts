import { loadDashboardSettings } from "./dashboard-settings.js";
import { loadHistory } from "./history.js";
import {
  resolveMorphoBaseStrategyState,
  resolveMorphoEthereumStrategyState,
  resolveMorphoOperationalConfig,
} from "./morpho-operational-config.js";

export type StrategySegment = "lending" | "perps";
export type StrategyReadiness = "live" | "next" | "research" | "advanced";
export type StrategyStatusTone =
  | "status-good"
  | "status-blue"
  | "status-warn"
  | "status-bad";

export type StrategyMarket = {
  key: string;
  label: string;
  protocol: string;
  chain: string;
  segment: StrategySegment;
  readiness: StrategyReadiness;
  currentEngine: boolean;
  executionAdapter: "aave-v3-like" | "skeleton" | "planned" | "external-api";
  priority: number;
  competition: "high" | "medium" | "medium-low" | "low";
  whyNow: string;
  nextStep: string;
  statusLabel?: string;
  statusLabelZh?: string;
  nextStepZh?: string;
  statusTone?: StrategyStatusTone;
  insightBadges?: Array<{
    label: string;
    labelZh?: string;
    tone?: StrategyStatusTone;
  }>;
  docsUrl: string;
  tags: string[];
};

type MorphoSimulationSnapshot = {
  selectedMarketLabel: string;
  selectedUser: string;
  selectedKind: string;
  borrowAssetsUsd: number | null;
  collateralUsd: number | null;
  executionGateEligible: boolean | null;
  executionGateSummary: string;
  broadcastGateEligible: boolean | null;
  broadcastGateSummary: string;
  liveSubmissionReady: boolean | null;
};

const STRATEGY_MARKETS: StrategyMarket[] = [
  {
    key: "aave-v3-ethereum",
    label: "Aave V3 / Ethereum",
    protocol: "Aave V3",
    chain: "Ethereum",
    segment: "lending",
    readiness: "live",
    currentEngine: true,
    executionAdapter: "aave-v3-like",
    priority: 1,
    competition: "high",
    whyNow:
      "Current production execution path. Flashbots + flash-loan stack is already wired here.",
    nextStep:
      "Keep as the main execution battlefield, but do not let it monopolize market discovery.",
    docsUrl: "https://aave.com/docs/developers/aave-v3/overview",
    tags: ["flashbots", "mainnet", "production"],
  },
  {
    key: "spark-ethereum",
    label: "SparkLend / Ethereum",
    protocol: "Spark",
    chain: "Ethereum",
    segment: "lending",
    readiness: "live",
    currentEngine: false,
    executionAdapter: "aave-v3-like",
    priority: 2,
    competition: "medium-low",
    whyNow:
      "Ethereum-native lending market with Aave-like mechanics that is already wired into the live V3-compatible execution path.",
    nextStep:
      "Keep Spark as the second executable Ethereum venue and tune thresholds independently from Aave mainnet.",
    docsUrl: "https://docs.spark.fi/dev/sparklend/overview",
    tags: ["aave-compatible", "ethereum", "live"],
  },
  {
    key: "aave-v3-arbitrum",
    label: "Aave V3 / Arbitrum",
    protocol: "Aave V3",
    chain: "Arbitrum",
    segment: "lending",
    readiness: "live",
    currentEngine: false,
    executionAdapter: "aave-v3-like",
    priority: 3,
    competition: "medium",
    whyNow:
      "Same liquidation semantics as Ethereum Aave, but with cheaper gas and a different orderflow landscape.",
    nextStep:
      "Treat as the first non-mainnet venue and tune gas/profit gates per-chain instead of copying Ethereum blindly.",
    docsUrl: "https://aave.com/docs/developers/aave-v3/overview",
    tags: ["live", "arbitrum", "aave-compatible"],
  },
  {
    key: "aave-v3-polygon",
    label: "Aave V3 / Polygon",
    protocol: "Aave V3",
    chain: "Polygon",
    segment: "lending",
    readiness: "live",
    currentEngine: false,
    executionAdapter: "aave-v3-like",
    priority: 4,
    competition: "medium-low",
    whyNow:
      "Cheaper blockspace expands the viable liquidation set beyond mainnet-sized opportunities.",
    nextStep:
      "Keep per-chain RPC and profitability thresholds explicit so Polygon is not forced through Ethereum defaults.",
    docsUrl: "https://aave.com/docs/developers/aave-v3/overview",
    tags: ["live", "polygon", "aave-compatible"],
  },
  {
    key: "aave-v3-bnb",
    label: "Aave V3 / BNB Chain",
    protocol: "Aave V3",
    chain: "BNB Chain",
    segment: "lending",
    readiness: "live",
    currentEngine: false,
    executionAdapter: "aave-v3-like",
    priority: 5,
    competition: "medium-low",
    whyNow:
      "A separate chain and bot landscape gives the engine another executable venue without a brand-new adapter.",
    nextStep:
      "Harden RPC quality checks and venue-specific routing before promoting it to always-on rotation.",
    docsUrl: "https://aave.com/docs/developers/aave-v3/overview",
    tags: ["live", "bnb", "aave-compatible"],
  },
  {
    key: "morpho-blue-ethereum",
    label: "Morpho Blue / Ethereum",
    protocol: "Morpho Blue",
    chain: "Ethereum",
    segment: "lending",
    readiness: "next",
    currentEngine: false,
    executionAdapter: "skeleton",
    priority: 6,
    competition: "medium",
    whyNow:
      "Modular isolated markets and lower liquidation bot crowding make it a prime expansion target.",
    nextStep:
      "Adapter, route, planner, private execution, and liquidate calldata draft are wired, but Morpho still needs live repay/unwind calldata and relay submission before it becomes a real execution venue.",
    statusLabel: "Execution draft",
    statusLabelZh: "执行草案",
    docsUrl: "https://docs.morpho.org/",
    tags: ["isolated-markets", "expansion", "blue-chip"],
  },
  {
    key: "morpho-blue-base",
    label: "Morpho Blue / Base",
    protocol: "Morpho Blue",
    chain: "Base",
    segment: "lending",
    readiness: "next",
    currentEngine: false,
    executionAdapter: "skeleton",
    priority: 7,
    competition: "medium",
    whyNow:
      "Same Morpho design with a cheaper chain profile, and Base has already advanced past read-only into unwind quote and relay-candidate drafts.",
    nextStep:
      "Finish Base settlement wiring and live relay submission so the draft pipeline can graduate into real execution.",
    docsUrl: "https://docs.morpho.org/",
    tags: ["base", "cheap-gas", "morpho"],
  },
  {
    key: "compound-v3-arbitrum",
    label: "Compound V3 / Arbitrum",
    protocol: "Compound V3",
    chain: "Arbitrum",
    segment: "lending",
    readiness: "research",
    currentEngine: false,
    executionAdapter: "planned",
    priority: 8,
    competition: "medium",
    whyNow:
      "A strong entry market for a second lending adapter: clear liquidate path and cheaper chain costs.",
    nextStep:
      "Implement a Comet liquidation adapter and separate routing assumptions from Aave reserve logic.",
    docsUrl: "https://docs.compound.finance/liquidation/",
    tags: ["entry-market", "arbitrum", "comet"],
  },
  {
    key: "euler-v2-ethereum",
    label: "Euler V2 / Ethereum",
    protocol: "Euler V2",
    chain: "Ethereum",
    segment: "lending",
    readiness: "research",
    currentEngine: false,
    executionAdapter: "planned",
    priority: 9,
    competition: "low",
    whyNow:
      "Lower competition and modular vault design make it strategically interesting once the lending adapter framework is stable.",
    nextStep:
      "Study EVK liquidation semantics and add a dedicated health/liquidation model.",
    docsUrl: "https://docs.euler.finance/",
    tags: ["low-competition", "evk", "specialized"],
  },
  {
    key: "curve-ethereum",
    label: "Curve / Ethereum",
    protocol: "Curve",
    chain: "Ethereum",
    segment: "lending",
    readiness: "research",
    currentEngine: false,
    executionAdapter: "planned",
    priority: 10,
    competition: "medium-low",
    whyNow:
      "Curve 的 crvUSD/LLAMMA 体系提供了不同于 Aave 的清算语义，适合作为下一条借贷研究线。",
    nextStep:
      "Add a Curve-specific liquidation model instead of forcing LLAMMA behavior through the Aave close-factor path.",
    nextStepZh:
      "为 Curve 单独建 LLAMMA/软清算模型，不要把它强行塞进 Aave 的 close-factor 执行路径。",
    docsUrl: "https://resources.curve.finance/",
    tags: ["curve", "llamma", "soft-liquidation"],
  },
  {
    key: "balancer-ethereum",
    label: "Balancer / Ethereum",
    protocol: "Balancer",
    chain: "Ethereum",
    segment: "lending",
    readiness: "research",
    currentEngine: false,
    executionAdapter: "planned",
    priority: 11,
    competition: "medium-low",
    whyNow:
      "Balancer 更适合被当作 flashloan/unwind 基础设施位，而不是借贷执行位本身，但值得单独跟踪。",
    nextStep:
      "Track Balancer as flash-loan and unwind infrastructure, then wire it into route selection instead of treating it like a standalone lending venue.",
    nextStepZh:
      "把 Balancer 当作 flashloan 与 unwind 基础设施位来接，不要把它误当成独立借贷执行市场。",
    docsUrl: "https://docs.balancer.fi/",
    tags: ["flashloan", "unwind", "infrastructure"],
  },
  {
    key: "gmx-v2-arbitrum",
    label: "GMX V2 / Arbitrum",
    protocol: "GMX V2",
    chain: "Arbitrum",
    segment: "perps",
    readiness: "advanced",
    currentEngine: false,
    executionAdapter: "external-api",
    priority: 12,
    competition: "medium",
    whyNow:
      "Perps liquidations open a second profit surface that is not tied to lending market health factors.",
    nextStep:
      "Treat as a separate strategy family with oracle/orderbook aware execution, not as a lending add-on.",
    docsUrl: "https://docs.gmx.io/",
    tags: ["perps", "advanced", "oracle-driven"],
  },
  {
    key: "dydx-chain",
    label: "dYdX / dYdX Chain",
    protocol: "dYdX",
    chain: "dYdX Chain",
    segment: "perps",
    readiness: "advanced",
    currentEngine: false,
    executionAdapter: "external-api",
    priority: 13,
    competition: "medium",
    whyNow:
      "dYdX 的永续清算面足够独立，值得作为第二条永续执行线跟踪，而不是挂在借贷引擎下面。",
    nextStep:
      "Build venue-native monitoring and execution around dYdX Chain risk and orderflow instead of trying to reuse onchain lending assumptions.",
    nextStepZh:
      "围绕 dYdX Chain 的风险和订单流做原生监控与执行，不要复用链上借贷那套假设。",
    docsUrl: "https://docs.dydx.exchange/",
    tags: ["perps", "orderbook", "independent-stack"],
  },
  {
    key: "hyperliquid",
    label: "Hyperliquid",
    protocol: "Hyperliquid",
    chain: "Hyperliquid",
    segment: "perps",
    readiness: "advanced",
    currentEngine: false,
    executionAdapter: "external-api",
    priority: 14,
    competition: "high",
    whyNow:
      "Large perpetuals liquidation surface, but it needs a separate infra stack from onchain lending bots.",
    nextStep:
      "Build as an independent execution system with venue-native APIs and risk controls.",
    docsUrl: "https://hyperliquid.gitbook.io/hyperliquid-docs",
    tags: ["perps", "api-native", "separate-stack"],
  },
];

function morphoMarketHasSuccessfulBroadcast(marketKey: string): boolean {
  try {
    return loadHistory().some(
      (entry) =>
        entry.mode === "broadcast" &&
        entry.executionMarketKey === marketKey &&
        entry.broadcastResult?.status === "success",
    );
  } catch {
    return false;
  }
}

function latestMorphoSimulationSnapshot(
  marketKey: string,
): MorphoSimulationSnapshot | null {
  try {
    const entries = loadHistory()
      .filter((entry) => entry.executionMarketKey === marketKey)
      .slice()
      .reverse();
    const simulation = entries.find((entry) => entry.mode === "simulation");
    if (!simulation || !simulation.raw || typeof simulation.raw !== "object") {
      return null;
    }
    const raw = simulation.raw as Record<string, unknown>;
    const routePlanner =
      raw.routePlanner && typeof raw.routePlanner === "object"
        ? (raw.routePlanner as Record<string, unknown>)
        : null;
    const selectedOpportunity =
      routePlanner?.selectedOpportunity &&
      typeof routePlanner.selectedOpportunity === "object"
        ? (routePlanner.selectedOpportunity as Record<string, unknown>)
        : null;
    const privateBundleDraft =
      raw.privateBundleDraft && typeof raw.privateBundleDraft === "object"
        ? (raw.privateBundleDraft as Record<string, unknown>)
        : null;
    const executionGate =
      privateBundleDraft?.executionGate &&
      typeof privateBundleDraft.executionGate === "object"
        ? (privateBundleDraft.executionGate as Record<string, unknown>)
        : null;
    const broadcastGate =
      raw.broadcastGate && typeof raw.broadcastGate === "object"
        ? (raw.broadcastGate as Record<string, unknown>)
        : null;
    const liveSubmissionReadiness =
      raw.liveSubmissionReadiness &&
      typeof raw.liveSubmissionReadiness === "object"
        ? (raw.liveSubmissionReadiness as Record<string, unknown>)
        : null;

    return {
      selectedMarketLabel:
        typeof selectedOpportunity?.marketLabel === "string"
          ? selectedOpportunity.marketLabel
          : typeof raw.executionMarketLabel === "string"
            ? raw.executionMarketLabel
            : "",
      selectedUser:
        typeof selectedOpportunity?.user === "string"
          ? selectedOpportunity.user
          : typeof raw.selectedUser === "string"
            ? raw.selectedUser
            : "",
      selectedKind:
        typeof selectedOpportunity?.kind === "string"
          ? selectedOpportunity.kind
          : "",
      borrowAssetsUsd:
        typeof selectedOpportunity?.borrowAssetsUsd === "number"
          ? selectedOpportunity.borrowAssetsUsd
          : null,
      collateralUsd:
        typeof selectedOpportunity?.collateralUsd === "number"
          ? selectedOpportunity.collateralUsd
          : null,
      executionGateEligible:
        typeof executionGate?.eligible === "boolean"
          ? executionGate.eligible
          : null,
      executionGateSummary:
        typeof executionGate?.summary === "string" ? executionGate.summary : "",
      broadcastGateEligible:
        typeof broadcastGate?.eligible === "boolean"
          ? broadcastGate.eligible
          : null,
      broadcastGateSummary:
        typeof broadcastGate?.summary === "string" ? broadcastGate.summary : "",
      liveSubmissionReady:
        typeof liveSubmissionReadiness?.ready === "boolean"
          ? liveSubmissionReadiness.ready
          : null,
    };
  } catch {
    return null;
  }
}

function formatUsdCompact(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value <= 0) {
    return "$0.00";
  }
  return `$${value.toExponential(1)}`;
}

function insightBadge(
  label: string,
  labelZh: string,
  tone: StrategyStatusTone,
): { label: string; labelZh: string; tone: StrategyStatusTone } {
  return { label, labelZh, tone };
}

export function strategyMarkets(): StrategyMarket[] {
  const settings = loadDashboardSettings();
  const morphoConfig = resolveMorphoOperationalConfig(settings);
  const morphoEthereumState = resolveMorphoEthereumStrategyState(morphoConfig);
  const morphoBaseState = resolveMorphoBaseStrategyState(morphoConfig);
  const morphoEthereumLive = morphoMarketHasSuccessfulBroadcast("morpho-blue-ethereum");
  const morphoBaseLive = morphoMarketHasSuccessfulBroadcast("morpho-blue-base");
  const morphoEthereumSimulation = latestMorphoSimulationSnapshot("morpho-blue-ethereum");
  const morphoBaseSimulation = latestMorphoSimulationSnapshot("morpho-blue-base");

  return STRATEGY_MARKETS.slice()
    .map((market) => {
      if (market.key === "morpho-blue-ethereum") {
        const ethereumBlocked =
          !morphoEthereumLive &&
          morphoEthereumSimulation?.executionGateEligible === false;
        const ethereumBlockedReason =
          ethereumBlocked && morphoEthereumSimulation
            ? `当前 Morpho Ethereum 候选${morphoEthereumSimulation.selectedMarketLabel ? `（${morphoEthereumSimulation.selectedMarketLabel}）` : ""}已被执行门拦下；借款 ${formatUsdCompact(morphoEthereumSimulation.borrowAssetsUsd)} / 抵押 ${formatUsdCompact(morphoEthereumSimulation.collateralUsd)}。${morphoEthereumSimulation.executionGateSummary}`
            : morphoEthereumState.nextStepZh;
        return {
          ...market,
          readiness: morphoEthereumLive ? "live" : market.readiness,
          statusLabel: morphoEthereumLive
            ? "Live"
            : ethereumBlocked
              ? "Target blocked"
              : morphoEthereumState.statusLabel,
          statusLabelZh: morphoEthereumLive
            ? "已执行"
            : ethereumBlocked
              ? "候选受阻"
              : morphoEthereumState.statusLabelZh,
          nextStep: morphoEthereumLive
            ? "Morpho Ethereum has at least one recorded broadcast receipt; keep monitoring profitability, inclusion quality, and failure retries before scaling."
            : ethereumBlocked && morphoEthereumSimulation
              ? `Current Morpho Ethereum simulation is blocked at the execution gate${morphoEthereumSimulation.selectedMarketLabel ? ` on ${morphoEthereumSimulation.selectedMarketLabel}` : ""}. ${morphoEthereumSimulation.executionGateSummary}`
            : morphoEthereumState.nextStep,
          nextStepZh: morphoEthereumLive
            ? "Morpho Ethereum 已有至少一笔真实广播回执；后续重点转向盈利、上链质量与失败重试监控，再考虑扩大规模。"
            : ethereumBlocked && morphoEthereumSimulation
              ? ethereumBlockedReason
            : morphoEthereumState.nextStepZh,
          statusTone: morphoEthereumLive
            ? ("status-good" as const)
            : ethereumBlocked
              ? ("status-warn" as const)
            : morphoEthereumState.statusTone,
          insightBadges: ethereumBlocked && morphoEthereumSimulation
            ? [
                insightBadge("Blocked target", "坏候选", "status-warn"),
                insightBadge(
                  `Borrow ${formatUsdCompact(morphoEthereumSimulation.borrowAssetsUsd)}`,
                  `借款 ${formatUsdCompact(morphoEthereumSimulation.borrowAssetsUsd)}`,
                  "status-blue",
                ),
                insightBadge(
                  `Collateral ${formatUsdCompact(morphoEthereumSimulation.collateralUsd)}`,
                  `抵押 ${formatUsdCompact(morphoEthereumSimulation.collateralUsd)}`,
                  "status-bad",
                ),
              ]
            : undefined,
        };
      }
      if (market.key === "morpho-blue-base") {
        const morphoBaseCanaryReady =
          !morphoBaseLive &&
          morphoBaseSimulation?.broadcastGateEligible === true &&
          morphoBaseSimulation.liveSubmissionReady === true;
        const baseCanaryReadyStepZh =
          morphoBaseCanaryReady && morphoBaseSimulation
            ? `Morpho Base 当前已有可试播候选${morphoBaseSimulation.selectedMarketLabel ? `（${morphoBaseSimulation.selectedMarketLabel}）` : ""}；借款 ${formatUsdCompact(morphoBaseSimulation.borrowAssetsUsd)} / 抵押 ${formatUsdCompact(morphoBaseSimulation.collateralUsd)}。${morphoBaseSimulation.broadcastGateSummary}`
            : morphoBaseState.nextStepZh;
        return {
          ...market,
          readiness: morphoBaseLive ? "live" : market.readiness,
          statusLabel: morphoBaseLive
            ? "Live"
            : morphoBaseCanaryReady
              ? "Canary ready"
              : morphoBaseState.statusLabel,
          statusLabelZh: morphoBaseLive
            ? "已执行"
            : morphoBaseCanaryReady
              ? "可试播"
              : morphoBaseState.statusLabelZh,
          nextStep: morphoBaseLive
            ? "Morpho Base has at least one recorded broadcast receipt; keep validating canary outcomes before promoting it to always-on rotation."
            : morphoBaseCanaryReady && morphoBaseSimulation
              ? `Morpho Base already has a broadcast-eligible canary candidate${morphoBaseSimulation.selectedMarketLabel ? ` on ${morphoBaseSimulation.selectedMarketLabel}` : ""}. ${morphoBaseSimulation.broadcastGateSummary}`
            : morphoBaseState.nextStep,
          nextStepZh: morphoBaseLive
            ? "Morpho Base 已有至少一笔真实广播回执；先持续验证 canary 结果，再考虑升为常驻轮转市场。"
            : morphoBaseCanaryReady && morphoBaseSimulation
              ? baseCanaryReadyStepZh
            : morphoBaseState.nextStepZh,
          statusTone: morphoBaseLive
            ? ("status-good" as const)
            : morphoBaseCanaryReady
              ? ("status-blue" as const)
            : morphoBaseState.statusTone,
          insightBadges: morphoBaseCanaryReady && morphoBaseSimulation
            ? [
                insightBadge("Canary ready", "可试播", "status-blue"),
                insightBadge(
                  `Borrow ${formatUsdCompact(morphoBaseSimulation.borrowAssetsUsd)}`,
                  `借款 ${formatUsdCompact(morphoBaseSimulation.borrowAssetsUsd)}`,
                  "status-blue",
                ),
                insightBadge(
                  `Collateral ${formatUsdCompact(morphoBaseSimulation.collateralUsd)}`,
                  `抵押 ${formatUsdCompact(morphoBaseSimulation.collateralUsd)}`,
                  "status-good",
                ),
              ]
            : undefined,
        };
      }
      return market;
    })
    .sort((left, right) => left.priority - right.priority);
}

export function strategyMarketsSummary(): {
  currentExecutionLabel: string;
  nextBuildLabel: string;
  advancedTrackLabel: string;
  markets: StrategyMarket[];
} {
  const markets = strategyMarkets();
  return {
    currentExecutionLabel:
      markets.find((market) => market.currentEngine)?.label ?? markets[0]?.label ?? "--",
    nextBuildLabel:
      markets.find((market) => market.readiness === "next")?.label ?? "--",
    advancedTrackLabel:
      markets.find((market) => market.segment === "perps")?.label ?? "--",
    markets,
  };
}
