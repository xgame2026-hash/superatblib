import type { CexBestBidAsk, CexExchangeConnector } from "../cex-types.js";

type BinanceBookTickerResponse = {
  symbol?: string;
  bidPrice?: string;
  bidQty?: string;
  askPrice?: string;
  askQty?: string;
};

function normalizeSymbol(symbol: string): string {
  return symbol.replace("/", "").replace("-", "").toUpperCase();
}

function asFiniteNumber(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid Binance ${label}: ${String(value ?? "")}`);
  }
  return numeric;
}

export const binanceConnector: CexExchangeConnector = {
  key: "binance",
  label: "Binance",
  async fetchBestBidAsk(symbol: string): Promise<CexBestBidAsk> {
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(normalizeSymbol(symbol))}`,
      {
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Binance quote failed: ${response.status}`);
    }

    const payload = (await response.json()) as BinanceBookTickerResponse;
    return {
      exchange: "binance",
      symbol,
      bidPrice: asFiniteNumber(payload.bidPrice, "bidPrice"),
      askPrice: asFiniteNumber(payload.askPrice, "askPrice"),
      bidSize: asFiniteNumber(payload.bidQty, "bidQty"),
      askSize: asFiniteNumber(payload.askQty, "askQty"),
      fetchedAt: new Date().toISOString(),
    };
  },
};
