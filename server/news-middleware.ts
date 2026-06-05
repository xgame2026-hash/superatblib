import type { IncomingMessage, ServerResponse } from "node:http";

const DEFAULT_NEWS_API_URL = "https://api.supermtnode.io/api/public/news";

export function handleNewsRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/api/news")) return false;

  if (req.method !== "GET") {
    json(res, 405, { success: false, error: "Method not allowed." });
    return true;
  }

  const upstream = new URL(process.env.MANAGE_NEWS_API_URL || DEFAULT_NEWS_API_URL);
  const incoming = new URL(req.url, "http://127.0.0.1");
  upstream.search = incoming.search;

  fetch(upstream, { headers: { accept: "application/json" } })
    .then(async (response) => {
      const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
      const text = await response.text();
      res.statusCode = response.status;
      res.setHeader("Content-Type", contentType);
      res.end(text);
    })
    .catch((error: unknown) => {
      json(res, 502, {
        success: false,
        error: error instanceof Error ? error.message : "News service unavailable.",
      });
    });

  return true;
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
