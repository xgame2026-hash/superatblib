import type { CexBestBidAsk, CexExchangeConnector, CexSpreadOpportunity } from "./cex-types.js";
import type {
  CexInventoryAssetSnapshot,
  CexInventorySnapshot,
  CexOpportunityRecord,
  CexOrderPair,
  CexRebalanceSuggestion,
} from "./cex-domain.js";
import {
  arbitrageStrategyForMode,
  arbitrageExchangeLabel,
  defaultArbitrageVenueFilterForMode,
  type ArbitrageModeKey,
  type CexExchangeKey,
} from "./strategies.js";
import { binanceConnector } from "./exchanges/binance.js";
import { okxConnector } from "./exchanges/okx.js";
import { bitgetConnector } from "./exchanges/bitget.js";
import { mexcConnector } from "./exchanges/mexc.js";
import { gateConnector } from "./exchanges/gate.js";

const CONNECTORS: Record<CexExchangeKey, CexExchangeConnector> = {
  binance: binanceConnector,
  okx: okxConnector,
  bitget: bitgetConnector,
  mexc: mexcConnector,
  gate: gateConnector,
};

function exchangeLabel(exchange: CexExchangeKey): string {
  return arbitrageExchangeLabel(exchange);
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (Math.abs(value) >= 1_000) {
    return `${value.toFixed(2)} USD`;
  }
  if (Math.abs(value) >= 1) {
    return `${value.toFixed(4)} USD`;
  }
  return `${value.toFixed(6)} USD`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (value >= 1_000) {
    return value.toFixed(2);
  }
  if (value >= 1) {
    return value.toFixed(4);
  }
  return value.toFixed(6);
}

function formatBaseUnits(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (value >= 100) {
    return value.toFixed(4);
  }
  if (value >= 1) {
    return value.toFixed(6);
  }
  return value.toFixed(8);
}

function baseSymbolFromPair(symbol: string): string {
  return symbol.split("/")[0] || symbol;
}

type PaperInventoryState = {
  exchange: CexExchangeKey;
  quoteBalanceUsd: number;
  quoteTargetUsd: number;
  quoteShortfallUsd: number;
  assetBalances: Record<string, number>;
  assetTargetUsd: number;
  assetShortfallsUsd: Record<string, number>;
};

export function connectorForExchange(exchange: CexExchangeKey): CexExchangeConnector {
  return CONNECTORS[exchange];
}

function resolveScanExchanges(
  mode: ArbitrageModeKey,
  requestedExchanges?: readonly CexExchangeKey[],
): CexExchangeKey[] {
  const resolved = Array.from(
    new Set(
      (requestedExchanges && requestedExchanges.length > 0
        ? requestedExchanges
        : defaultArbitrageVenueFilterForMode(mode)
      ).filter((exchange) => !!CONNECTORS[exchange]),
    ),
  );

  if (resolved.length >= 2) {
    return resolved;
  }

  return [...defaultArbitrageVenueFilterForMode(mode)];
}

export async function fetchQuotesForSymbol(
  mode: ArbitrageModeKey,
  symbol: string,
  exchanges?: readonly CexExchangeKey[],
): Promise<CexBestBidAsk[]> {
  const scanExchanges = resolveScanExchanges(mode, exchanges);
  return Promise.all(
    scanExchanges.map((exchange) =>
      connectorForExchange(exchange).fetchBestBidAsk(symbol),
    ),
  );
}

export function buildCrossExchangeOpportunity(params: {
  mode: ArbitrageModeKey;
  symbol: string;
  quotes: CexBestBidAsk[];
  inventory: Record<CexExchangeKey, PaperInventoryState>;
}): CexSpreadOpportunity | null {
  const strategy = arbitrageStrategyForMode(params.mode);
  if (params.quotes.length < 2) {
    return null;
  }

  let best: CexSpreadOpportunity | null = null;

  for (const buyQuote of params.quotes) {
    for (const sellQuote of params.quotes) {
      if (buyQuote.exchange === sellQuote.exchange) {
        continue;
      }

      const maxBaseQtyFromBuy = Math.max(0, buyQuote.askSize);
      const maxBaseQtyFromSell = Math.max(0, sellQuote.bidSize);
      const targetBaseQty = strategy.targetNotionalUsd / buyQuote.askPrice;
      const buyInventory = params.inventory[buyQuote.exchange];
      const sellInventory = params.inventory[sellQuote.exchange];
      const assetSymbol = baseSymbolFromPair(params.symbol);
      const maxBaseQtyFromQuoteInventory = buyInventory
        ? Math.max(0, buyInventory.quoteBalanceUsd / buyQuote.askPrice)
        : 0;
      const maxBaseQtyFromAssetInventory = sellInventory
        ? Math.max(0, sellInventory.assetBalances[assetSymbol] ?? 0)
        : 0;
      const executableBaseQty = Math.min(
        targetBaseQty,
        maxBaseQtyFromBuy,
        maxBaseQtyFromSell,
        maxBaseQtyFromQuoteInventory,
        maxBaseQtyFromAssetInventory,
      );
      const executableNotionalUsd = executableBaseQty * buyQuote.askPrice;
      const grossSpreadUsd = executableBaseQty * (sellQuote.bidPrice - buyQuote.askPrice);
      const feeEstimateUsd =
        executableNotionalUsd * ((strategy.feeBufferBps + strategy.slippageBufferBps) / 10_000);
      const netSpreadUsd = grossSpreadUsd - feeEstimateUsd;
      const hasDepth = executableNotionalUsd >= strategy.minExecutableNotionalUsd;
      const hasQuoteInventory =
        !!buyInventory && buyInventory.quoteBalanceUsd >= strategy.minExecutableNotionalUsd;
      const hasAssetInventory =
        !!sellInventory &&
        ((sellInventory.assetBalances[assetSymbol] ?? 0) * sellQuote.bidPrice) >=
          strategy.minExecutableNotionalUsd;
      const inventoryReady = hasQuoteInventory && hasAssetInventory;
      const executable = hasDepth && inventoryReady && netSpreadUsd >= strategy.minNetSpreadUsd;

      const candidate: CexSpreadOpportunity = {
        symbol: params.symbol,
        buyExchange: buyQuote.exchange,
        sellExchange: sellQuote.exchange,
        buyPrice: buyQuote.askPrice,
        sellPrice: sellQuote.bidPrice,
        buyPriceDisplay: formatPrice(buyQuote.askPrice),
        sellPriceDisplay: formatPrice(sellQuote.bidPrice),
        grossSpreadUsd,
        netSpreadUsd,
        grossSpreadDisplay: formatUsd(grossSpreadUsd),
        netSpreadDisplay: formatUsd(netSpreadUsd),
        feeEstimateUsd,
        feeEstimateDisplay: formatUsd(feeEstimateUsd),
        availableNotionalUsd: executableNotionalUsd,
        availableNotionalDisplay: formatUsd(executableNotionalUsd),
        executable,
        signal:
          netSpreadUsd > 0
            ? "net-open"
            : grossSpreadUsd > 0
              ? "spread-forming"
              : "watch",
        state: executable
          ? "paper-ready"
          : !inventoryReady
            ? "inventory-blocked"
            : hasDepth
              ? "watch"
              : "needs-depth",
        action: executable
          ? "paper-buy-sell"
          : !inventoryReady
            ? "top-up-inventory"
            : hasDepth
              ? "watch"
              : "wait-depth",
      };

      if (!best || candidate.netSpreadUsd > best.netSpreadUsd) {
        best = candidate;
      }
    }
  }

  return best;
}

function buildPaperInventoryState(params: {
  mode: ArbitrageModeKey;
  symbols: string[];
  quoteMap: Map<string, CexBestBidAsk[]>;
  exchanges: readonly CexExchangeKey[];
}): Record<CexExchangeKey, PaperInventoryState> {
  const strategy = arbitrageStrategyForMode(params.mode);
  const quoteBalanceUsd = Number(process.env.ARBITRAGE_PAPER_USDT_BALANCE_USD ?? "5000");
  const assetTargetUsd = Number(process.env.ARBITRAGE_PAPER_ASSET_BALANCE_USD ?? "2500");
  const quoteTargetUsd = Math.max(strategy.targetNotionalUsd * 2, strategy.minExecutableNotionalUsd * 2);

  return Object.fromEntries(
    params.exchanges.map((exchange) => {
      const assetBalances: Record<string, number> = {};
      const assetShortfallsUsd: Record<string, number> = {};

      for (const symbol of params.symbols) {
        const assetSymbol = baseSymbolFromPair(symbol);
        const quotes = params.quoteMap.get(symbol) ?? [];
        const quote = quotes.find((item) => item.exchange === exchange) ?? quotes[0];
        const midPrice = quote ? (quote.bidPrice + quote.askPrice) / 2 : 0;
        const assetUnits = midPrice > 0 ? assetTargetUsd / midPrice : 0;
        assetBalances[assetSymbol] = assetUnits;
        assetShortfallsUsd[assetSymbol] = Math.max(0, strategy.targetNotionalUsd - assetTargetUsd);
      }

      return [
        exchange,
        {
          exchange,
          quoteBalanceUsd,
          quoteTargetUsd,
          quoteShortfallUsd: Math.max(0, quoteTargetUsd - quoteBalanceUsd),
          assetBalances,
          assetTargetUsd,
          assetShortfallsUsd,
        } satisfies PaperInventoryState,
      ];
    }),
  ) as Record<CexExchangeKey, PaperInventoryState>;
}

function snapshotInventory(params: {
  mode: ArbitrageModeKey;
  symbols: string[];
  quoteMap: Map<string, CexBestBidAsk[]>;
  inventory: Record<CexExchangeKey, PaperInventoryState>;
  exchanges: readonly CexExchangeKey[];
}): CexInventorySnapshot[] {
  return params.exchanges.map((exchange) => {
    const inventory = params.inventory[exchange];
    const assets = params.symbols.map((symbol) => {
      const assetSymbol = baseSymbolFromPair(symbol);
      const quotes = params.quoteMap.get(symbol) ?? [];
      const quote = quotes.find((item) => item.exchange === exchange) ?? quotes[0];
      const midPrice = quote ? (quote.bidPrice + quote.askPrice) / 2 : 0;
      const units = inventory.assetBalances[assetSymbol] ?? 0;
      const usdValue = units * midPrice;
      return {
        symbol: assetSymbol,
        unitsDisplay: formatBaseUnits(units),
        usdValueDisplay: formatUsd(usdValue),
        targetUsdDisplay: formatUsd(inventory.assetTargetUsd),
        shortfallUsdDisplay: formatUsd(Math.max(0, inventory.assetTargetUsd - usdValue)),
      } satisfies CexInventoryAssetSnapshot;
    });

    return {
      exchange,
      quoteSymbol: "USDT",
      quoteBalanceDisplay: formatUsd(inventory.quoteBalanceUsd),
      quoteTargetDisplay: formatUsd(inventory.quoteTargetUsd),
      quoteShortfallDisplay: formatUsd(inventory.quoteShortfallUsd),
      assets,
    } satisfies CexInventorySnapshot;
  });
}

function buildRebalanceSuggestions(params: {
  mode: ArbitrageModeKey;
  symbols: string[];
  inventorySnapshots: CexInventorySnapshot[];
}): CexRebalanceSuggestion[] {
  const suggestions: CexRebalanceSuggestion[] = [];
  const strategy = arbitrageStrategyForMode(params.mode);

  for (const snapshot of params.inventorySnapshots) {
    const quoteShortfall = Number(snapshot.quoteShortfallDisplay.replace(/[^\d.+-]/g, ""));
    if (Number.isFinite(quoteShortfall) && quoteShortfall > 0) {
      suggestions.push({
        exchange: snapshot.exchange,
        symbol: snapshot.quoteSymbol,
        side: "top-up-usdt",
        reason: `USDT inventory is below the target ticket buffer for ${strategy.label}.`,
        shortfallDisplay: snapshot.quoteShortfallDisplay,
      });
    }

    for (const asset of snapshot.assets) {
      const shortfall = Number(asset.shortfallUsdDisplay.replace(/[^\d.+-]/g, ""));
      if (Number.isFinite(shortfall) && shortfall > 0) {
        suggestions.push({
          exchange: snapshot.exchange,
          symbol: asset.symbol,
          side: "top-up-asset",
          reason: `${asset.symbol} inventory is below the target sell-side buffer.`,
          shortfallDisplay: asset.shortfallUsdDisplay,
        });
      }
    }
  }

  return suggestions;
}

function buildPaperOrderPair(opportunity: CexSpreadOpportunity | null): CexOrderPair | null {
  if (!opportunity) {
    return null;
  }

  return {
    id: `${opportunity.symbol}:${opportunity.buyExchange}:${opportunity.sellExchange}`,
    mode: "paper",
    status:
      opportunity.state === "paper-ready"
        ? "paper-ready"
        : opportunity.state === "inventory-blocked"
          ? "inventory-blocked"
          : opportunity.state === "needs-depth"
            ? "depth-blocked"
            : "watch",
    reason:
      opportunity.state === "paper-ready"
        ? "Spread, depth, and paper inventory are all ready."
        : opportunity.state === "inventory-blocked"
          ? "Paper inventory is insufficient on the buy or sell venue."
          : opportunity.state === "needs-depth"
            ? "Top-of-book depth is too thin for the configured ticket."
            : "Spread is still below the paper execution threshold.",
    buyLeg: {
      exchange: opportunity.buyExchange,
      symbol: opportunity.symbol,
      side: "buy",
      priceDisplay: opportunity.buyPriceDisplay,
    },
    sellLeg: {
      exchange: opportunity.sellExchange,
      symbol: opportunity.symbol,
      side: "sell",
      priceDisplay: opportunity.sellPriceDisplay,
    },
  };
}

export async function scanCrossExchangeOpportunities(params: {
  mode: ArbitrageModeKey;
  symbols?: string[];
  exchanges?: readonly CexExchangeKey[];
}): Promise<CexSpreadOpportunity[]> {
  const snapshot = await scanCrossExchangeSnapshot(params);
  return snapshot.opportunities;
}

export async function scanCrossExchangeSnapshot(params: {
  mode: ArbitrageModeKey;
  symbols?: string[];
  exchanges?: readonly CexExchangeKey[];
}): Promise<{
  opportunities: CexSpreadOpportunity[];
  inventorySnapshots: CexInventorySnapshot[];
  rebalanceSuggestions: CexRebalanceSuggestion[];
  orderPair: CexOrderPair | null;
}> {
  const strategy = arbitrageStrategyForMode(params.mode);
  const exchanges = resolveScanExchanges(params.mode, params.exchanges);
  const symbols =
    params.symbols && params.symbols.length > 0
      ? params.symbols
      : [...strategy.defaultSymbols];

  const quoteEntries: Array<[string, CexBestBidAsk[]]> = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const quotes = await fetchQuotesForSymbol(params.mode, symbol, exchanges);
        return [symbol, quotes];
      } catch {
        return [symbol, []];
      }
    }),
  );

  const quoteMap = new Map<string, CexBestBidAsk[]>(quoteEntries);
  const inventory = buildPaperInventoryState({
    mode: params.mode,
    symbols,
    quoteMap,
    exchanges,
  });
  const opportunities = quoteEntries
    .map(([symbol, quotes]) =>
      quotes.length > 0
        ? buildCrossExchangeOpportunity({
            mode: params.mode,
            symbol,
            quotes,
            inventory,
          })
        : null,
    )
    .filter((item): item is CexSpreadOpportunity => !!item)
    .sort((left, right) => right.netSpreadUsd - left.netSpreadUsd);
  const inventorySnapshots = snapshotInventory({
    mode: params.mode,
    symbols,
    quoteMap,
    inventory,
    exchanges,
  });
  const rebalanceSuggestions = buildRebalanceSuggestions({
    mode: params.mode,
    symbols,
    inventorySnapshots,
  });

  return {
    opportunities,
    inventorySnapshots,
    rebalanceSuggestions,
    orderPair: buildPaperOrderPair(opportunities[0] ?? null),
  };
}

export function crossExchangePairLabel(
  buyExchange: CexExchangeKey,
  sellExchange: CexExchangeKey,
): string {
  return `${exchangeLabel(buyExchange)} -> ${exchangeLabel(sellExchange)}`;
}
