import type { CexBestBidAsk, CexExchangeConnector } from "../cex-types.js";

type MexcBookTickerResponse = {
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
    throw new Error(`Invalid MEXC ${label}: ${String(value ?? "")}`);
  }
  return numeric;
}

export const mexcConnector: CexExchangeConnector = {
  key: "mexc",
  label: "MEXC",
  async fetchBestBidAsk(symbol: string): Promise<CexBestBidAsk> {
    const response = await fetch(
      `https://api.mexc.com/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(normalizeSymbol(symbol))}`,
      {
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!response.ok) {
      throw new Error(`MEXC quote failed: ${response.status}`);
    }

    const payload = (await response.json()) as MexcBookTickerResponse;
    return {
      exchange: "mexc",
      symbol,
      bidPrice: asFiniteNumber(payload.bidPrice, "bidPrice"),
      askPrice: asFiniteNumber(payload.askPrice, "askPrice"),
      bidSize: asFiniteNumber(payload.bidQty, "bidQty"),
      askSize: asFiniteNumber(payload.askQty, "askQty"),
      fetchedAt: new Date().toISOString(),
    };
  },
};
