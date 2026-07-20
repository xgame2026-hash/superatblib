import type { IncomingMessage, ServerResponse } from "node:http";

const POLYMARKET_MARKET_DATA_URL = "https://privateapi.superarb.ai/polymarket/markets";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_LIMIT = 100;

type GammaMarket = Record<string, unknown>;

export function handlePolymarketMarketRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const incoming = new URL(req.url || "/", "http://127.0.0.1");
  if (incoming.pathname !== "/api/polymarket/markets") return false;
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }

  void fetchMarkets(incoming)
    .then((payload) => sendJson(res, 200, payload))
    .catch((error: unknown) => sendJson(res, 502, {
      ok: false,
      source: POLYMARKET_MARKET_DATA_URL,
      error: error instanceof Error ? error.message : "Polymarket data source unavailable.",
    }));
  return true;
}

async function fetchMarkets(incoming: URL) {
  const requestedLimit = Number(incoming.searchParams.get("limit"));
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(MAX_LIMIT, Math.max(1, requestedLimit)) : 50;
  const upstream = new URL(POLYMARKET_MARKET_DATA_URL);
  upstream.searchParams.set("active", "true");
  upstream.searchParams.set("closed", "false");
  upstream.searchParams.set("order", "volume24hr");
  upstream.searchParams.set("ascending", "false");
  upstream.searchParams.set("limit", String(limit));

  const startedAt = Date.now();
  const response = await fetch(upstream, {
    headers: { accept: "application/json", "user-agent": "SuperARB/1.6 market-data" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Polymarket market-data proxy returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  const raw = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.markets)
      ? payload.markets
      : null;
  if (!raw) throw new Error("Polymarket market-data proxy returned an invalid payload.");

  const now = Date.now();
  const markets = raw.map(normalizeMarket).filter((market) => {
    const endTime = Date.parse(market.endDate);
    return market.acceptingOrders
      && market.yesPrice !== null
      && Number.isFinite(endTime)
      && endTime > now;
  });
  const fetchedAt = isRecord(payload) && isoValue(payload.fetchedAt)
    ? isoValue(payload.fetchedAt)
    : new Date().toISOString();
  return {
    ok: true,
    source: POLYMARKET_MARKET_DATA_URL,
    sourceLabel: "SuperARB Polymarket Proxy · Gamma API",
    fetchedAt,
    latencyMs: Date.now() - startedAt,
    count: markets.length,
    totals: {
      liquidity: sum(markets.map((item) => item.liquidity)),
      volume24hr: sum(markets.map((item) => item.volume24hr)),
    },
    markets,
  };
}

function normalizeMarket(value: unknown) {
  const market = isRecord(value) ? value : {};
  const events = Array.isArray(market.events) ? market.events.filter(isRecord) : [];
  const event = events[0] || {};
  const prices = parseStringArray(market.outcomePrices).map(numberValue);
  const outcomes = parseStringArray(market.outcomes);
  const yesIndex = outcomes.findIndex((item) => item.toLowerCase() === "yes");
  const noIndex = outcomes.findIndex((item) => item.toLowerCase() === "no");
  return {
    id: stringValue(market.id),
    question: stringValue(market.question),
    slug: stringValue(market.slug),
    eventSlug: stringValue(event.slug),
    category: stringValue(market.category) || "其他",
    image: safeHttpsUrl(market.icon) || safeHttpsUrl(market.image),
    endDate: isoValue(market.endDate),
    updatedAt: isoValue(market.updatedAt),
    liquidity: numberValue(market.liquidityNum, market.liquidity) || 0,
    volume: numberValue(market.volumeNum, market.volume) || 0,
    volume24hr: numberValue(market.volume24hr) || 0,
    yesPrice: yesIndex >= 0 ? prices[yesIndex] ?? null : prices[0] ?? null,
    noPrice: noIndex >= 0 ? prices[noIndex] ?? null : prices[1] ?? null,
    bestBid: nullableNumber(market.bestBid),
    bestAsk: nullableNumber(market.bestAsk),
    spread: nullableNumber(market.spread),
    oneDayPriceChange: nullableNumber(market.oneDayPriceChange),
    acceptingOrders: market.acceptingOrders === true,
    minOrderSize: nullableNumber(market.orderMinSize),
    minTickSize: nullableNumber(market.orderPriceMinTickSize),
  };
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function nullableNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function isoValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function safeHttpsUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}
