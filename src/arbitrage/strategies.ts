export type CexExchangeKey = "binance" | "okx" | "bitget" | "mexc" | "gate";

export type ArbitrageModeKey =
  | "route-arb-ethereum"
  | "stable-arb-ethereum"
  | "tri-arb-ethereum";

export type ArbitrageStrategyDefinition = {
  key: ArbitrageModeKey;
  label: string;
  summary: string;
  defaultExchanges: readonly CexExchangeKey[];
  defaultSymbols: readonly string[];
  targetNotionalUsd: number;
  minExecutableNotionalUsd: number;
  minNetSpreadUsd: number;
  feeBufferBps: number;
  slippageBufferBps: number;
};

const DEFAULT_SCAN_EXCHANGES = [
  "binance",
  "okx",
  "bitget",
  "mexc",
  "gate",
] as const satisfies readonly CexExchangeKey[];

const DEFAULT_WATCH_SYMBOLS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
] as const;

const ARBITRAGE_STRATEGIES = {
  "route-arb-ethereum": {
    key: "route-arb-ethereum",
    label: "Spot Cross-Exchange",
    summary: "Auto-scan every selected spot venue and rank the best cross-exchange spread.",
    defaultExchanges: DEFAULT_SCAN_EXCHANGES,
    defaultSymbols: DEFAULT_WATCH_SYMBOLS,
    targetNotionalUsd: 1_000,
    minExecutableNotionalUsd: 300,
    minNetSpreadUsd: 5,
    feeBufferBps: 22,
    slippageBufferBps: 8,
  },
  "stable-arb-ethereum": {
    key: "stable-arb-ethereum",
    label: "Spread Alerts",
    summary: "Lower the net-spread threshold and surface more watchlist opportunities before execution.",
    defaultExchanges: DEFAULT_SCAN_EXCHANGES,
    defaultSymbols: DEFAULT_WATCH_SYMBOLS,
    targetNotionalUsd: 1_000,
    minExecutableNotionalUsd: 300,
    minNetSpreadUsd: 2,
    feeBufferBps: 24,
    slippageBufferBps: 10,
  },
  "tri-arb-ethereum": {
    key: "tri-arb-ethereum",
    label: "Inventory Rebalance",
    summary: "Keep scanning spreads, but prioritize inventory pressure and rebalance reminders.",
    defaultExchanges: DEFAULT_SCAN_EXCHANGES,
    defaultSymbols: DEFAULT_WATCH_SYMBOLS,
    targetNotionalUsd: 1_000,
    minExecutableNotionalUsd: 300,
    minNetSpreadUsd: 5,
    feeBufferBps: 24,
    slippageBufferBps: 10,
  },
} as const satisfies Record<ArbitrageModeKey, ArbitrageStrategyDefinition>;

export function arbitrageStrategyForMode(
  mode: ArbitrageModeKey,
): ArbitrageStrategyDefinition {
  return ARBITRAGE_STRATEGIES[mode];
}

export function normalizeArbitrageModeKey(value: unknown): ArbitrageModeKey {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : undefined;
  if (normalized === "stable-arb-ethereum") return "stable-arb-ethereum";
  if (normalized === "tri-arb-ethereum") return "tri-arb-ethereum";
  return "route-arb-ethereum";
}

export function arbitrageModeLabel(mode: ArbitrageModeKey): string {
  return arbitrageStrategyForMode(mode).label;
}

export function arbitrageModeSummary(mode: ArbitrageModeKey): string {
  return arbitrageStrategyForMode(mode).summary;
}

export function defaultArbitrageVenueFilterForMode(
  mode: ArbitrageModeKey,
): readonly CexExchangeKey[] {
  return arbitrageStrategyForMode(mode).defaultExchanges;
}

export function arbitrageExchangeLabel(exchange: CexExchangeKey): string {
  switch (exchange) {
    case "binance":
      return "Binance";
    case "okx":
      return "OKX";
    case "bitget":
      return "Bitget";
    case "mexc":
      return "MEXC";
    case "gate":
      return "Gate";
  }
}

export function normalizeArbitrageTokenFilter(value: unknown): string[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value
    .split(/[\n,]/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .map((item) =>
      item.includes("/")
        ? item
        : item.endsWith("USDT")
          ? `${item.slice(0, -4)}/USDT`
          : `${item}/USDT`,
    );

  return normalized.length > 0
    ? Array.from(new Set(normalized))
    : undefined;
}

export function normalizeArbitrageVenueFilter(
  value: unknown,
): CexExchangeKey[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const allowed = new Set<CexExchangeKey>(DEFAULT_SCAN_EXCHANGES);
  const normalized = value
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is CexExchangeKey => allowed.has(item as CexExchangeKey));

  return normalized.length > 0
    ? Array.from(new Set(normalized))
    : undefined;
}
