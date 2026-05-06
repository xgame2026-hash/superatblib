import {
  arbitrageExchangeLabel,
  arbitrageModeLabel,
  arbitrageModeSummary,
  arbitrageStrategyForMode,
  normalizeArbitrageModeKey,
  normalizeArbitrageTokenFilter,
  type CexExchangeKey,
  type ArbitrageModeKey,
} from "./strategies.js";
import {
  type CexInventorySnapshot,
  type CexOpportunityRecord,
  type CexOrderPair,
  type CexRebalanceSuggestion,
} from "./cex-domain.js";
import {
  crossExchangePairLabel,
  scanCrossExchangeSnapshot,
} from "./cex-scanner.js";

export type ArbitrageTargetRow = {
  rank?: number;
  marketKey?: string;
  marketLabel?: string;
  user: string;
  pathLabel?: string;
  signalLabel?: string;
  healthFactor: string;
  liquidatable: boolean;
  state: string;
  debtSymbol: string;
  collateralSymbol: string;
  grossProfitDisplay: string;
  roughNetProfitDisplay?: string;
  selectionScoreDisplay?: string;
  selectionMethod?: string;
  source: "scan" | "analyze";
  buyExchange?: string;
  sellExchange?: string;
  buyPriceDisplay?: string;
  sellPriceDisplay?: string;
  feeEstimateDisplay?: string;
  availableNotionalDisplay?: string;
};

export type ArbitrageSelection = {
  cycle: number;
  candidateCount: number;
  marketKey?: string;
  marketLabel?: string;
  rank?: number;
  user: string;
  pathLabel?: string;
  signalLabel?: string;
  debtSymbol: string;
  collateralSymbol: string;
  grossProfitDisplay?: string;
  roughNetProfitDisplay?: string;
  selectionScoreDisplay?: string;
  selectionMethod?: string;
  healthFactor?: string;
  liquidatable?: boolean;
  buyExchange?: string;
  sellExchange?: string;
  buyPriceDisplay?: string;
  sellPriceDisplay?: string;
  feeEstimateDisplay?: string;
  availableNotionalDisplay?: string;
};

export type RouteProviderSummaryEntry = {
  provider: string;
  attempts: number;
  executableCount: number;
  symbols: string[];
};

export type ArbitrageLoopHandlers = {
  onStdout?: (chunk: string) => void;
  onTargets?: (rows: ArbitrageTargetRow[]) => void;
  onSelection?: (selection: ArbitrageSelection) => void;
  onResult?: (result: {
    ok: boolean;
    action: "arbitrage-scan";
    parsed: {
      routeProviderSummary: RouteProviderSummaryEntry[];
      opportunities: CexOpportunityRecord[];
      inventorySnapshots: CexInventorySnapshot[];
      orderPair: CexOrderPair | null;
      rebalanceSuggestions: CexRebalanceSuggestion[];
      executionGate: {
        reason: string;
      };
    };
  }) => void;
  onMeta?: (meta: {
    action: "arbitrage";
    chain: "cex";
    market: ArbitrageModeKey;
    marketLabel: string;
    token?: string;
    rpcUrl: string;
  }) => void;
};

export {
  arbitrageModeLabel,
  normalizeArbitrageModeKey,
  normalizeArbitrageTokenFilter,
  type ArbitrageModeKey,
} from "./strategies.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function summarizeRouteProviders(
  rows: ArbitrageTargetRow[],
): RouteProviderSummaryEntry[] {
  return Array.from(
    rows.reduce((accumulator, row) => {
      const providers = String(row.debtSymbol || "")
        .split("->")
        .map((item) => item.trim())
        .filter(Boolean);
      const symbol = row.pathLabel || row.collateralSymbol || undefined;

      for (const provider of providers) {
        const current =
          accumulator.get(provider) ??
          ({
            provider,
            attempts: 0,
            executableCount: 0,
            symbols: [],
          } satisfies RouteProviderSummaryEntry);
        current.attempts += 1;
        if (row.liquidatable) {
          current.executableCount += 1;
        }
        if (symbol && !current.symbols.includes(symbol)) {
          current.symbols.push(symbol);
        }
        accumulator.set(provider, current);
      }
      return accumulator;
    }, new Map<string, RouteProviderSummaryEntry>()).values(),
  ).sort((left, right) => {
    if (left.executableCount !== right.executableCount) {
      return right.executableCount - left.executableCount;
    }
    if (left.attempts !== right.attempts) {
      return right.attempts - left.attempts;
    }
    return left.provider.localeCompare(right.provider);
  });
}

function toDashboardRow(
  mode: ArbitrageModeKey,
  rank: number,
  opportunity: Awaited<ReturnType<typeof scanCrossExchangeSnapshot>>["opportunities"][number],
): ArbitrageTargetRow {
  const pairLabel = crossExchangePairLabel(
    opportunity.buyExchange,
    opportunity.sellExchange,
  );
  return {
    rank,
    marketKey: mode,
    marketLabel: opportunity.symbol,
    user: `${opportunity.symbol}:${pairLabel}`,
    pathLabel: opportunity.symbol,
    signalLabel:
      opportunity.signal === "net-open"
        ? "net-spread"
        : opportunity.signal === "spread-forming"
          ? "spread-forming"
          : "watch",
    healthFactor: "--",
    liquidatable: opportunity.executable,
    state:
      opportunity.state === "paper-ready"
        ? "paper-ready"
        : opportunity.state === "needs-depth"
          ? "needs-depth"
          : "watch",
    debtSymbol: pairLabel,
    collateralSymbol: opportunity.symbol,
    grossProfitDisplay: opportunity.buyPriceDisplay,
    roughNetProfitDisplay: opportunity.sellPriceDisplay,
    selectionScoreDisplay: opportunity.netSpreadDisplay,
    selectionMethod: "cex_cross_exchange",
    source: "scan",
    buyExchange: opportunity.buyExchange,
    sellExchange: opportunity.sellExchange,
    buyPriceDisplay: opportunity.buyPriceDisplay,
    sellPriceDisplay: opportunity.sellPriceDisplay,
    feeEstimateDisplay: opportunity.feeEstimateDisplay,
    availableNotionalDisplay: opportunity.availableNotionalDisplay,
  };
}

export async function streamArbitrageMonitor(params: {
  rpcUrl?: string;
  privateKey?: `0x${string}`;
  mode: ArbitrageModeKey;
  tokenFilter?: string[];
  exchanges?: CexExchangeKey[];
  loopDelayMs?: number;
  isClosed?: () => boolean;
  handlers?: ArbitrageLoopHandlers;
}): Promise<void> {
  const {
    handlers,
    loopDelayMs = 8_000,
    mode,
    tokenFilter,
    exchanges,
  } = params;
  const isClosed = params.isClosed ?? (() => false);
  const strategy = arbitrageStrategyForMode(mode);
  const watchSymbols =
    tokenFilter && tokenFilter.length > 0
      ? tokenFilter
      : [...strategy.defaultSymbols];
  const venueLabels = (exchanges && exchanges.length > 0 ? exchanges : [...strategy.defaultExchanges])
    .map((exchange) => arbitrageExchangeLabel(exchange))
    .join(", ");

  handlers?.onStdout?.("$ 初始化跨交易所套利台...\n");
  handlers?.onMeta?.({
    action: "arbitrage",
    chain: "cex",
    market: mode,
    marketLabel: arbitrageModeLabel(mode),
    token: watchSymbols.join(", "),
    rpcUrl: "public-market-data",
  });

  let cycle = 0;
  let lastSelectionFingerprint: string | undefined;

  while (!isClosed()) {
    cycle += 1;
    handlers?.onStdout?.(`\n$ cycle ${cycle}\n`);
    handlers?.onStdout?.(
      `$ 扫描 ${arbitrageModeLabel(mode)} / ${venueLabels} / ${watchSymbols.join(", ")}...\n`,
    );

    const snapshot = await scanCrossExchangeSnapshot({
      mode,
      symbols: watchSymbols,
      exchanges,
    });
    const rows = snapshot.opportunities.map((opportunity, index) =>
      toDashboardRow(mode, index + 1, opportunity),
    );
    const routeProviderSummary = summarizeRouteProviders(rows);
    handlers?.onTargets?.(rows);

    const preferred = rows[0];
    if (preferred) {
      const fingerprint = `${preferred.user}:${preferred.selectionScoreDisplay ?? "--"}`;
      if (lastSelectionFingerprint !== fingerprint) {
        lastSelectionFingerprint = fingerprint;
        handlers?.onSelection?.({
          cycle,
          candidateCount: rows.length,
          rank: preferred.rank,
          marketKey: preferred.marketKey,
          marketLabel: preferred.marketLabel,
          user: preferred.user,
          pathLabel: preferred.pathLabel,
          signalLabel: preferred.signalLabel,
          debtSymbol: preferred.debtSymbol,
          collateralSymbol: preferred.collateralSymbol,
          grossProfitDisplay: preferred.grossProfitDisplay,
          roughNetProfitDisplay: preferred.roughNetProfitDisplay,
          selectionScoreDisplay: preferred.selectionScoreDisplay,
          selectionMethod: preferred.selectionMethod,
          liquidatable: preferred.liquidatable,
          buyExchange: preferred.buyExchange,
          sellExchange: preferred.sellExchange,
          buyPriceDisplay: preferred.buyPriceDisplay,
          sellPriceDisplay: preferred.sellPriceDisplay,
          feeEstimateDisplay: preferred.feeEstimateDisplay,
          availableNotionalDisplay: preferred.availableNotionalDisplay,
        });
      }
      handlers?.onStdout?.(
        `$ 首选 #${preferred.rank} ${preferred.pathLabel ?? preferred.user} / ${preferred.debtSymbol} / net spread ${preferred.selectionScoreDisplay ?? "--"}\n`,
      );
    } else {
      handlers?.onStdout?.("$ 当前未发现可观察的跨交易所价差机会\n");
    }
    const totalQuoteInventoryDisplay = snapshot.inventorySnapshots
      .map((item) => `${item.exchange} ${item.quoteBalanceDisplay}`)
      .join(" / ");
    handlers?.onStdout?.(`$ paper inventory ${totalQuoteInventoryDisplay || "--"}\n`);
    if (snapshot.rebalanceSuggestions[0]) {
      handlers?.onStdout?.(
        `$ rebalance ${snapshot.rebalanceSuggestions[0].exchange} ${snapshot.rebalanceSuggestions[0].symbol} / ${snapshot.rebalanceSuggestions[0].shortfallDisplay}\n`,
      );
    }

    handlers?.onResult?.({
      ok: true,
      action: "arbitrage-scan",
      parsed: {
        routeProviderSummary,
        opportunities: snapshot.opportunities.map((item) => ({
          id: `${item.symbol}:${item.buyExchange}:${item.sellExchange}`,
          symbol: item.symbol,
          buyExchange: item.buyExchange,
          sellExchange: item.sellExchange,
          buyPriceDisplay: item.buyPriceDisplay,
          sellPriceDisplay: item.sellPriceDisplay,
          grossSpreadDisplay: item.grossSpreadDisplay,
          netSpreadDisplay: item.netSpreadDisplay,
          feeEstimateDisplay: item.feeEstimateDisplay,
          availableNotionalDisplay: item.availableNotionalDisplay,
          executable: item.executable,
          state: item.state,
          action: item.action,
        })),
        inventorySnapshots: snapshot.inventorySnapshots,
        orderPair: snapshot.orderPair,
        rebalanceSuggestions: snapshot.rebalanceSuggestions,
        executionGate: {
          reason: preferred
            ? `Top spread ${preferred.pathLabel ?? preferred.user} / ${preferred.debtSymbol} / ${preferred.selectionScoreDisplay ?? "--"}`
            : `${arbitrageModeSummary(mode)} / Awaiting cross-exchange arbitrage opportunity.`,
        },
      },
    });

    handlers?.onStdout?.(`$ cycle ${cycle} completed. Waiting for next scan...\n`);
    if (isClosed()) {
      break;
    }
    await sleep(loopDelayMs);
  }
}
