import type { CexBestBidAsk, CexExchangeConnector } from "../cex-types.js";

type GateOrderBookResponse = {
  asks?: [string, string][];
  bids?: [string, string][];
};

function normalizeSymbol(symbol: string): string {
  return symbol.replace("/", "_").replace(/-/g, "_").toUpperCase();
}

function asFiniteNumber(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid Gate ${label}: ${String(value ?? "")}`);
  }
  return numeric;
}

export const gateConnector: CexExchangeConnector = {
  key: "gate",
  label: "Gate",
  async fetchBestBidAsk(symbol: string): Promise<CexBestBidAsk> {
    const response = await fetch(
      `https://api.gateio.ws/api/v4/spot/order_book?currency_pair=${encodeURIComponent(normalizeSymbol(symbol))}&limit=1`,
      {
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Gate quote failed: ${response.status}`);
    }

    const payload = (await response.json()) as GateOrderBookResponse;
    const bestAsk = Array.isArray(payload.asks) ? payload.asks[0] : undefined;
    const bestBid = Array.isArray(payload.bids) ? payload.bids[0] : undefined;
    if (!bestAsk || !bestBid) {
      throw new Error(`Gate returned no order book for ${symbol}`);
    }

    return {
      exchange: "gate",
      symbol,
      bidPrice: asFiniteNumber(bestBid[0], "bidPrice"),
      askPrice: asFiniteNumber(bestAsk[0], "askPrice"),
      bidSize: asFiniteNumber(bestBid[1], "bidSize"),
      askSize: asFiniteNumber(bestAsk[1], "askSize"),
      fetchedAt: new Date().toISOString(),
    };
  },
};
