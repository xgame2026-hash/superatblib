import type { IncomingMessage, ServerResponse } from "node:http";

type Level = [number, number];
type Book = { exchange: ExchangeKey; pair: PairKey; bids: Level[]; asks: Level[]; sourceTime: string; receivedAt: string; latencyMs: number };
type ExchangeKey = "Binance" | "OKX" | "Bybit" | "Coinbase";
type PairKey = "BTC/USDT" | "ETH/USDT" | "SOL/USDT";

const PAIRS: PairKey[] = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];
const EXCHANGES: ExchangeKey[] = ["Binance", "OKX", "Bybit", "Coinbase"];
const TIMEOUT_MS = 6_000;
const DEFAULT_NOTIONAL = 5_000;

export function handleCrossExchangeMarketRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const incoming = new URL(req.url || "/", "http://127.0.0.1");
  if (incoming.pathname !== "/api/cross-exchange/opportunities") return false;
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }
  void buildSnapshot(incoming)
    .then((payload) => sendJson(res, 200, payload))
    .catch((error: unknown) => sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : "Exchange market data unavailable." }));
  return true;
}

async function buildSnapshot(incoming: URL) {
  const rawNotional = Number(incoming.searchParams.get("notional"));
  const notional = Number.isFinite(rawNotional) ? Math.min(100_000, Math.max(100, rawNotional)) : DEFAULT_NOTIONAL;
  const settled = await Promise.allSettled(EXCHANGES.flatMap((exchange) => PAIRS.map((pair) => fetchBook(exchange, pair))));
  const books = settled.filter((item): item is PromiseFulfilledResult<Book> => item.status === "fulfilled").map((item) => item.value);
  const errors = settled.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => String(item.reason instanceof Error ? item.reason.message : item.reason));
  const fees = feeConfiguration();
  const opportunities = calculateOpportunities(books, notional, fees);
  const fetchedAt = new Date().toISOString();
  return {
    ok: books.length > 0,
    source: "official-public-order-books",
    fetchedAt,
    notional,
    pairs: PAIRS,
    feeModel: {
      configured: EXCHANGES.every((exchange) => fees[exchange] !== null),
      unit: "bps",
      values: fees,
      note: "Fees are account-tier specific and are never assumed. Configure taker fee bps per exchange to enable net-profit estimates.",
    },
    exchanges: EXCHANGES.map((exchange) => {
      const exchangeBooks = books.filter((book) => book.exchange === exchange);
      return {
        name: exchange,
        status: exchangeBooks.length === PAIRS.length ? "online" : exchangeBooks.length > 0 ? "partial" : "offline",
        pairCount: exchangeBooks.length,
        latencyMs: exchangeBooks.length ? Math.round(exchangeBooks.reduce((sum, book) => sum + book.latencyMs, 0) / exchangeBooks.length) : null,
        latestSourceTime: exchangeBooks.map((book) => book.sourceTime).filter(Boolean).sort().at(-1) || "",
      };
    }),
    booksReceived: books.length,
    expectedBooks: EXCHANGES.length * PAIRS.length,
    errors,
    opportunities,
  };
}

async function fetchBook(exchange: ExchangeKey, pair: PairKey): Promise<Book> {
  const startedAt = Date.now();
  const url = bookUrl(exchange, pair);
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "SuperARB/1.6 market-data" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${exchange} ${pair}: HTTP ${response.status}`);
  const raw = await response.json();
  const parsed = parseBook(exchange, raw);
  if (!parsed.bids.length || !parsed.asks.length) throw new Error(`${exchange} ${pair}: empty order book`);
  return { exchange, pair, ...parsed, receivedAt: new Date().toISOString(), latencyMs: Date.now() - startedAt };
}

function bookUrl(exchange: ExchangeKey, pair: PairKey): URL {
  const compact = pair.replace("/", "");
  if (exchange === "Binance") return new URL(`https://data-api.binance.vision/api/v3/depth?symbol=${compact}&limit=20`);
  if (exchange === "OKX") return new URL(`https://www.okx.com/api/v5/market/books?instId=${pair.replace("/", "-")}&sz=20`);
  if (exchange === "Bybit") return new URL(`https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${compact}&limit=20`);
  return new URL(`https://api.exchange.coinbase.com/products/${pair.replace("/", "-")}/book?level=1`);
}

function parseBook(exchange: ExchangeKey, raw: unknown): { bids: Level[]; asks: Level[]; sourceTime: string } {
  const value = record(raw);
  if (exchange === "OKX") {
    const item = record(Array.isArray(value.data) ? value.data[0] : null);
    return { bids: levels(item.bids), asks: levels(item.asks), sourceTime: isoFromMs(item.ts) };
  }
  if (exchange === "Bybit") {
    const item = record(value.result);
    return { bids: levels(item.b), asks: levels(item.a), sourceTime: isoFromMs(item.ts) };
  }
  return {
    bids: levels(value.bids),
    asks: levels(value.asks),
    sourceTime: exchange === "Coinbase" && typeof value.time === "string" ? value.time : "",
  };
}

function calculateOpportunities(books: Book[], notional: number, fees: Record<ExchangeKey, number | null>) {
  const results: Array<Record<string, unknown>> = [];
  for (const pair of PAIRS) {
    const pairBooks = books.filter((book) => book.pair === pair);
    for (const buy of pairBooks) for (const sell of pairBooks) {
      if (buy.exchange === sell.exchange) continue;
      const purchase = buyWithQuote(buy.asks, notional);
      if (!purchase) continue;
      const sale = sellBase(sell.bids, purchase.baseQuantity);
      if (!sale) continue;
      const grossProfit = sale.quoteAmount - purchase.quoteAmount;
      const grossBps = grossProfit / purchase.quoteAmount * 10_000;
      if (grossBps <= 0) continue;
      const buyFeeBps = fees[buy.exchange];
      const sellFeeBps = fees[sell.exchange];
      const feeConfigured = buyFeeBps !== null && sellFeeBps !== null;
      const feeCost = feeConfigured ? purchase.quoteAmount * buyFeeBps! / 10_000 + sale.quoteAmount * sellFeeBps! / 10_000 : null;
      const netProfit = feeCost === null ? null : grossProfit - feeCost;
      const capacity = executableCapacity(buy.asks, sell.bids);
      results.push({
        id: `${pair}-${buy.exchange}-${sell.exchange}`,
        pair,
        buyExchange: buy.exchange,
        sellExchange: sell.exchange,
        buyAveragePrice: purchase.averagePrice,
        sellAveragePrice: sale.averagePrice,
        grossBps,
        grossProfit,
        feeConfigured,
        feeCost,
        netProfit,
        netBps: netProfit === null ? null : netProfit / purchase.quoteAmount * 10_000,
        notional: purchase.quoteAmount,
        baseQuantity: purchase.baseQuantity,
        executableCapacityQuote: capacity,
        buyReceivedAt: buy.receivedAt,
        sellReceivedAt: sell.receivedAt,
        maxLatencyMs: Math.max(buy.latencyMs, sell.latencyMs),
      });
    }
  }
  return results.sort((a, b) => Number(b.netBps ?? b.grossBps) - Number(a.netBps ?? a.grossBps));
}

function buyWithQuote(asks: Level[], quoteBudget: number) {
  let remaining = quoteBudget;
  let baseQuantity = 0;
  let quoteAmount = 0;
  for (const [price, size] of asks) {
    const quoteAtLevel = price * size;
    const usedQuote = Math.min(remaining, quoteAtLevel);
    baseQuantity += usedQuote / price;
    quoteAmount += usedQuote;
    remaining -= usedQuote;
    if (remaining < 0.000001) break;
  }
  if (remaining > quoteBudget * 0.001 || baseQuantity <= 0) return null;
  return { baseQuantity, quoteAmount, averagePrice: quoteAmount / baseQuantity };
}

function sellBase(bids: Level[], baseAmount: number) {
  let remaining = baseAmount;
  let quoteAmount = 0;
  for (const [price, size] of bids) {
    const usedBase = Math.min(remaining, size);
    quoteAmount += usedBase * price;
    remaining -= usedBase;
    if (remaining < baseAmount * 0.000001) break;
  }
  if (remaining > baseAmount * 0.001) return null;
  return { quoteAmount, averagePrice: quoteAmount / baseAmount };
}

function executableCapacity(asks: Level[], bids: Level[]): number {
  const base = Math.min(asks.reduce((sum, [, size]) => sum + size, 0), bids.reduce((sum, [, size]) => sum + size, 0));
  let remaining = base;
  let quote = 0;
  for (const [price, size] of asks) {
    const used = Math.min(remaining, size);
    quote += used * price;
    remaining -= used;
    if (remaining <= 0) break;
  }
  return quote;
}

function feeConfiguration(): Record<ExchangeKey, number | null> {
  return Object.fromEntries(EXCHANGES.map((exchange) => {
    const raw = process.env[`CROSS_EXCHANGE_TAKER_FEE_BPS_${exchange.toUpperCase()}`];
    const numeric = Number(raw);
    return [exchange, raw?.trim() && Number.isFinite(numeric) && numeric >= 0 ? numeric : null];
  })) as Record<ExchangeKey, number | null>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function levels(value: unknown): Level[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Array.isArray(item) ? [Number(item[0]), Number(item[1])] as Level : [NaN, NaN] as Level)
    .filter(([price, size]) => Number.isFinite(price) && price > 0 && Number.isFinite(size) && size > 0);
}

function isoFromMs(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Date(numeric).toISOString() : "";
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}
