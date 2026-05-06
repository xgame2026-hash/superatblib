import {
  EXECUTION_MARKET_PRESETS,
  type ChainPreset,
  type ExecutionMarketPreset,
} from "../config.js";
export { defaultExecutionLookbackBlocks } from "./tuning.js";

export type ExecutionMarketSelectionKey =
  | ExecutionMarketPreset["key"]
  | "auto-ethereum";

function supportedExecutionMarkets(): ExecutionMarketPreset[] {
  return Object.values(EXECUTION_MARKET_PRESETS).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

export function normalizeExecutionMarketKey(
  value: unknown,
): ExecutionMarketPreset["key"] {
  if (typeof value !== "string") {
    return "aave-v3-ethereum";
  }

  const normalized = value.trim().toLowerCase();
  const preset = supportedExecutionMarkets().find((item) => item.key === normalized);
  if (!preset) {
    throw new Error(`Unsupported market: ${value}`);
  }

  return preset.key;
}

export function normalizeExecutionMarketSelectionKey(
  value: unknown,
): ExecutionMarketSelectionKey {
  if (typeof value !== "string") {
    return "aave-v3-ethereum";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto-ethereum" || normalized === "auto") {
    return "auto-ethereum";
  }
  return normalizeExecutionMarketKey(normalized);
}

export function executionMarketPresetForKey(
  key: ExecutionMarketPreset["key"],
): ExecutionMarketPreset {
  return EXECUTION_MARKET_PRESETS[key];
}

export function executionMarketPresetsForSelection(
  key: ExecutionMarketSelectionKey,
): ExecutionMarketPreset[] {
  if (key === "auto-ethereum") {
    return supportedExecutionMarkets().filter((item) => item.chain === "ethereum");
  }
  return [executionMarketPresetForKey(key)];
}

export function inferExecutionChainForSelection(
  key: ExecutionMarketSelectionKey,
): ChainPreset["key"] {
  const [preset] = executionMarketPresetsForSelection(key);
  if (!preset) {
    throw new Error(`No execution markets configured for selection ${key}.`);
  }
  return preset.chain;
}

export function validateExecutionMarketSelectionChain(
  key: ExecutionMarketSelectionKey,
  chain: ChainPreset["key"],
): void {
  const mismatched = executionMarketPresetsForSelection(key).find(
    (preset) => preset.chain !== chain,
  );
  if (mismatched) {
    throw new Error(
      `Market selection ${mismatched.key} runs on ${mismatched.chain}, but chain is ${chain}.`,
    );
  }
}

export function executionMarketSelectionLabel(
  key: ExecutionMarketSelectionKey,
): string {
  if (key === "auto-ethereum") {
    return "Auto Rotation / Ethereum";
  }
  return executionMarketPresetForKey(key).label;
}
