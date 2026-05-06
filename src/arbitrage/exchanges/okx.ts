import type { CexBestBidAsk, CexExchangeConnector } from "../cex-types.js";

type OkxTickerResponse = {
  code?: string;
  data?: Array<{
    askPx?: string;
    askSz?: string;
    bidPx?: string;
    bidSz?: string;
  }>;
};

function normalizeSymbol(symbol: string): string {
  return symbol.replace("/", "-").replace(/_/g, "-").toUpperCase();
}

function asFiniteNumber(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid OKX ${label}: ${String(value ?? "")}`);
  }
  return numeric;
}

export const okxConnector: CexExchangeConnector = {
  key: "okx",
  label: "OKX",
  async fetchBestBidAsk(symbol: string): Promise<CexBestBidAsk> {
    const response = await fetch(
      `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(normalizeSymbol(symbol))}`,
      {
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!response.ok) {
      throw new Error(`OKX quote failed: ${response.status}`);
    }

    const payload = (await response.json()) as OkxTickerResponse;
    const ticker = Array.isArray(payload.data) ? payload.data[0] : undefined;
    if (!ticker) {
      throw new Error(`OKX returned no ticker for ${symbol}`);
    }

    return {
      exchange: "okx",
      symbol,
      bidPrice: asFiniteNumber(ticker.bidPx, "bidPx"),
      askPrice: asFiniteNumber(ticker.askPx, "askPx"),
      bidSize: asFiniteNumber(ticker.bidSz, "bidSz"),
      askSize: asFiniteNumber(ticker.askSz, "askSz"),
      fetchedAt: new Date().toISOString(),
    };
  },
};
