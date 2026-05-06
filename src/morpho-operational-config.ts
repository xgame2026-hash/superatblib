import type { DashboardSettings } from "./dashboard-settings.js";
import { parseProfitRecipients } from "./profit-distribution.js";

type RpcSource = "morpho" | "chain" | "execution" | "control" | "missing";
type RelaySource = "morpho" | "flashbots" | "missing";

export type MorphoOperationalConfigSummary = {
  ethereumRpcUrl: string;
  ethereumRpcSource: RpcSource;
  baseRpcUrl: string;
  baseRpcSource: RpcSource;
  privateRelayUrl: string;
  privateRelaySource: RelaySource;
};

type MorphoStrategyState = {
  statusLabel: string;
  statusLabelZh: string;
  nextStep: string;
  nextStepZh: string;
  statusTone: "status-blue" | "status-warn";
};

function hasText(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function morphoSettleRequiresOnchainDistribution(): boolean {
  try {
    return parseProfitRecipients(
      process.env.PROFIT_RECIPIENTS,
      process.env.PROFIT_SPLIT_BPS,
    ).length > 0;
  } catch {
    return true;
  }
}

export function resolveMorphoOperationalConfig(
  settings: Pick<
    DashboardSettings,
    | "controlRpcUrl"
    | "executionRpcUrl"
    | "ethereumRpcUrl"
    | "baseRpcUrl"
    | "flashbotsRelayUrl"
    | "morpho"
  >,
): MorphoOperationalConfigSummary {
  const morphoSettings = settings.morpho ?? {
    marketId: "",
    signal: "",
    hfMax: "",
    ethereumRpcUrl: "",
    baseRpcUrl: "",
    privateRelayUrl: "",
  };

  const ethereumRpcUrl = hasText(morphoSettings.ethereumRpcUrl)
    ? morphoSettings.ethereumRpcUrl.trim()
    : hasText(settings.ethereumRpcUrl)
      ? settings.ethereumRpcUrl.trim()
      : hasText(settings.executionRpcUrl)
        ? settings.executionRpcUrl.trim()
        : hasText(settings.controlRpcUrl)
          ? settings.controlRpcUrl.trim()
          : "";
  const ethereumRpcSource: RpcSource = hasText(morphoSettings.ethereumRpcUrl)
    ? "morpho"
    : hasText(settings.ethereumRpcUrl)
      ? "chain"
      : hasText(settings.executionRpcUrl)
        ? "execution"
        : hasText(settings.controlRpcUrl)
          ? "control"
          : "missing";

  const baseRpcUrl = hasText(morphoSettings.baseRpcUrl)
    ? morphoSettings.baseRpcUrl.trim()
    : hasText(settings.baseRpcUrl)
      ? settings.baseRpcUrl.trim()
    : "";
  const baseRpcSource: RpcSource = hasText(morphoSettings.baseRpcUrl)
    ? "morpho"
    : hasText(settings.baseRpcUrl)
      ? "chain"
      : "missing";

  const privateRelayUrl = hasText(morphoSettings.privateRelayUrl)
    ? morphoSettings.privateRelayUrl.trim()
    : hasText(settings.flashbotsRelayUrl)
      ? settings.flashbotsRelayUrl.trim()
      : "";
  const privateRelaySource: RelaySource = hasText(morphoSettings.privateRelayUrl)
    ? "morpho"
    : hasText(settings.flashbotsRelayUrl)
      ? "flashbots"
      : "missing";

  return {
    ethereumRpcUrl,
    ethereumRpcSource,
    baseRpcUrl,
    baseRpcSource,
    privateRelayUrl,
    privateRelaySource,
  };
}

function rpcSourceLabel(source: RpcSource): string {
  if (source === "morpho") return "Morpho settings";
  if (source === "chain") return "Ethereum chain RPC";
  if (source === "execution") return "Execution RPC";
  if (source === "control") return "Control RPC";
  return "missing";
}

function relaySourceLabel(source: RelaySource): string {
  if (source === "morpho") return "Morpho settings";
  if (source === "flashbots") return "Flashbots relay";
  return "missing";
}

function rpcSourceLabelZh(source: RpcSource): string {
  if (source === "morpho") return "Morpho 设置";
  if (source === "chain") return "Ethereum 链 RPC";
  if (source === "execution") return "执行 RPC";
  if (source === "control") return "控制 RPC";
  return "未配置";
}

function relaySourceLabelZh(source: RelaySource): string {
  if (source === "morpho") return "Morpho 设置";
  if (source === "flashbots") return "Flashbots Relay";
  return "未配置";
}

export function resolveMorphoEthereumStrategyState(
  config: MorphoOperationalConfigSummary,
): MorphoStrategyState {
  const hasEthereumRpc = hasText(config.ethereumRpcUrl);
  const hasRelay = hasText(config.privateRelayUrl);

  if (!hasEthereumRpc || !hasRelay) {
    const missing = [];
    if (!hasEthereumRpc) missing.push("Morpho Ethereum RPC");
    if (!hasRelay) missing.push("Morpho private relay");
    return {
      statusLabel: "Needs config",
      statusLabelZh: "待配置",
      nextStep: `Fill ${missing.join(" + ")}, then finish live repay/unwind calldata and relay submission before promoting Morpho Ethereum to production execution.`,
      nextStepZh: `先补齐 ${missing.join(" + ")}，再完成 live repay/unwind calldata 与 relay submission，Morpho Ethereum 才能进入真实执行。`,
      statusTone: "status-warn",
    };
  }

  return {
      statusLabel: "Execution draft",
      statusLabelZh: "执行草案",
      nextStep: `Infra is configured (${rpcSourceLabel(config.ethereumRpcSource)} / ${relaySourceLabel(config.privateRelaySource)}). Remaining blockers are live repay/unwind calldata and live relay submission.`,
      nextStepZh: `基础设施已配置（RPC 来自 ${rpcSourceLabelZh(config.ethereumRpcSource)} / Relay 来自 ${relaySourceLabelZh(config.privateRelaySource)}），但仍缺 live repay/unwind calldata 与 live relay submission。`,
      statusTone: "status-blue",
    };
  }

export function resolveMorphoBaseStrategyState(
  config: MorphoOperationalConfigSummary,
): MorphoStrategyState {
  const hasBaseRpc = hasText(config.baseRpcUrl);
  const hasRelay = hasText(config.privateRelayUrl);
  const requiresOnchainSettle = morphoSettleRequiresOnchainDistribution();

  if (!hasRelay) {
    const missing = [];
    if (!hasRelay) missing.push("Morpho private relay");
    return {
      statusLabel: "Needs config",
      statusLabelZh: "待配置",
      nextStep: `Fill ${missing.join(" + ")}, then keep validating Base route/private drafts before promoting Base to a real execution venue.`,
      nextStepZh: `先补齐 ${missing.join(" + ")}，再继续验证 Base 的 route/private draft，之后才能考虑升为真实执行。`,
      statusTone: "status-warn",
    };
  }

  return {
    statusLabel: hasBaseRpc && !requiresOnchainSettle ? "Ready to broadcast" : "Submission draft",
    statusLabelZh: hasBaseRpc && !requiresOnchainSettle ? "待广播" : "提交流水",
    nextStep: hasBaseRpc
      ? requiresOnchainSettle
        ? "Base RPC and private relay are configured. Base can now build route/private execution drafts, live unwind quotes, and relay candidates, but it still needs final settlement wiring and live submission before promotion to production execution."
        : "Base RPC is configured. Base can already build route/private execution drafts, live unwind quotes, submission candidates, and signed broadcast candidates. Settlement is a no-op under the current config, so the next step is a real canary broadcast through the Base public mempool path."
      : "Private relay is configured and Base can already run route/private execution drafts, but Base RPC is still missing, so live unwind quote and live submission remain blocked.",
    nextStepZh: hasBaseRpc
      ? requiresOnchainSettle
        ? "Base RPC 与私有 relay 已配置，当前已能构建 route/private execution draft、live unwind quote 和 relay candidate，但仍缺最终 settle wiring 与 live submission，不能直接升为真实执行。"
        : "Base RPC 已配置，当前已能构建 route/private execution draft、live unwind quote、submission candidate 与已签名广播 candidate。现配置下 settle 视为 no-op，下一步是真正通过 Base public mempool 做 canary 广播。"
      : "私有 relay 已配置，Base 当前已能跑 route/private execution draft，但 Base RPC 仍未配置，所以 live unwind quote 和 live submission 还被卡住。",
    statusTone: "status-blue",
  };
}
