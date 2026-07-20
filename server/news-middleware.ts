import type { IncomingMessage, ServerResponse } from "node:http";

const DEFAULT_NEWS_API_URL = "https://news.superarb.ai/api/public/news";
const NEWS_REQUEST_TIMEOUT_MS = 10_000;
const MAX_NEWS_LIMIT = 100;
const newsCache = new Map<string, { body: string; contentType: string; cachedAt: string }>();

export function handleNewsRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const incoming = new URL(req.url || "/", "http://127.0.0.1");
  if (incoming.pathname !== "/api/news") return false;

  if (req.method !== "GET") {
    json(res, 405, { success: false, error: "Method not allowed." });
    return true;
  }

  let upstream: URL;
  try {
    upstream = buildUpstreamUrl(incoming);
  } catch (error) {
    json(res, 500, { success: false, error: error instanceof Error ? error.message : "News API URL is invalid." });
    return true;
  }
  const cacheKey = upstream.searchParams.get("locale") || "default";

  fetch(upstream, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(NEWS_REQUEST_TIMEOUT_MS),
  })
    .then(async (response) => {
      const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
      const text = await response.text();
      if (response.ok && contentType.toLowerCase().includes("application/json")) {
        newsCache.set(cacheKey, { body: text, contentType, cachedAt: new Date().toISOString() });
      }
      res.statusCode = response.status;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store");
      res.end(text);
    })
    .catch((error: unknown) => {
      const cached = newsCache.get(cacheKey);
      if (cached) {
        res.statusCode = 200;
        res.setHeader("Content-Type", cached.contentType);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Liq2-News-Cache", "stale");
        res.setHeader("X-Liq2-News-Cached-At", cached.cachedAt);
        res.end(cached.body);
        return;
      }
      json(res, 502, {
        success: false,
        error: error instanceof Error ? error.message : "News service unavailable.",
      });
    });

  return true;
}

function buildUpstreamUrl(incoming: URL): URL {
  const upstream = new URL(process.env.MANAGE_NEWS_API_URL || DEFAULT_NEWS_API_URL);
  if (!["http:", "https:"].includes(upstream.protocol)) throw new Error("News API only supports HTTP(S).");
  const locale = incoming.searchParams.get("locale")?.trim().slice(0, 16);
  const requestedLimit = Number(incoming.searchParams.get("limit"));
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(MAX_NEWS_LIMIT, Math.max(1, requestedLimit))
    : 50;
  upstream.search = "";
  upstream.searchParams.set("limit", String(limit));
  if (locale) upstream.searchParams.set("locale", locale);
  return upstream;
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}
