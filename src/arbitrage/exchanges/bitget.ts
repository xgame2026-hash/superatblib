import type { CexBestBidAsk, CexExchangeConnector } from "../cex-types.js";

type BitgetTickerResponse = {
  code?: string;
  data?: Array<{
    bidPr?: string;
    bidSz?: string;
    askPr?: string;
    askSz?: string;
  }>;
};

function normalizeSymbol(symbol: string): string {
  return symbol.replace("/", "").replace("-", "").toUpperCase();
}

function asFiniteNumber(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid Bitget ${label}: ${String(value ?? "")}`);
  }
  return numeric;
}

export const bitgetConnector: CexExchangeConnector = {
  key: "bitget",
  label: "Bitget",
  async fetchBestBidAsk(symbol: string): Promise<CexBestBidAsk> {
    const response = await fetch(
      `https://api.bitget.com/api/v2/spot/market/tickers?symbol=${encodeURIComponent(normalizeSymbol(symbol))}`,
      {
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Bitget quote failed: ${response.status}`);
    }

    const payload = (await response.json()) as BitgetTickerResponse;
    const ticker = Array.isArray(payload.data) ? payload.data[0] : undefined;
    if (!ticker) {
      throw new Error(`Bitget returned no ticker for ${symbol}`);
    }

    return {
      exchange: "bitget",
      symbol,
      bidPrice: asFiniteNumber(ticker.bidPr, "bidPr"),
      askPrice: asFiniteNumber(ticker.askPr, "askPr"),
      bidSize: asFiniteNumber(ticker.bidSz, "bidSz"),
      askSize: asFiniteNumber(ticker.askSz, "askSz"),
      fetchedAt: new Date().toISOString(),
    };
  },
};
