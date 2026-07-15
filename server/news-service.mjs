import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const HOST = process.env.NEWS_HOST || "127.0.0.1";
const PORT = Number(process.env.NEWS_PORT || 8850);
const STORE_FILE = process.env.NEWS_STORE_FILE || "/opt/news-api/news.json";
const MAX_LIMIT = 100;
const SUPPORTED_LOCALES = new Set(["zh", "en", "ja", "ko", "ru", "th"]);

const server = createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    const items = await readNews();
    sendJson(res, 200, {
      success: true,
      service: "news.superarb.ai",
      itemCount: items.length,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/public/news" || url.pathname === "/api/news")) {
    const requestedLimit = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(requestedLimit))) : 20;
    const locale = requestedLocale(url);
    const items = (await readNews()).slice(0, limit).map((item) => localizeNewsItem(item, locale));
    sendJson(res, 200, { success: true, locale, data: items });
    return;
  }

  sendJson(res, 404, { success: false, error: "not_found" });
});

server.listen(PORT, HOST, () => {
  console.log(`[news-api] listening on http://${HOST}:${PORT}`);
});

async function readNews() {
  try {
    const raw = JSON.parse(await readFile(STORE_FILE, "utf8"));
    const items = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    return items
      .filter((item) => item && typeof item === "object" && String(item.status || "published") === "published")
      .sort((left, right) => dateValue(right) - dateValue(left));
  } catch (error) {
    console.error(`[news-api] cannot read ${STORE_FILE}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function dateValue(item) {
  const value = Date.parse(String(item.time || item.publishedAt || item.updatedAt || ""));
  return Number.isFinite(value) ? value : 0;
}

function requestedLocale(url) {
  const locale = String(url.searchParams.get("locale") || url.searchParams.get("lang") || "zh")
    .trim()
    .toLowerCase()
    .split("-")[0];
  return SUPPORTED_LOCALES.has(locale) ? locale : "zh";
}

function localizeNewsItem(item, locale) {
  const translations = isRecord(item.translations) ? item.translations : {};
  const localized = isRecord(translations[locale])
    ? translations[locale]
    : locale !== "zh" && isRecord(translations.en)
      ? translations.en
      : {};
  const { translations: _translations, ...news } = item;

  return {
    ...news,
    category: localizedText(localized, "category", item.category),
    tag: localizedText(localized, "tag", item.tag),
    title: localizedText(localized, "title", item.title),
    summary: localizedText(localized, "summary", item.summary),
    content: localizedText(localized, "content", item.content),
  };
}

function localizedText(translation, field, fallback) {
  const value = translation[field];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
