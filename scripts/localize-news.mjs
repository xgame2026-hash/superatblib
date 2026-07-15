import { readFile, rename, writeFile } from "node:fs/promises";

const storeFile = process.argv[2] || "/opt/news-api/news.json";
const targetLocales = (process.env.NEWS_LOCALES || "en,ja,ko,ru,th")
  .split(",")
  .map((locale) => locale.trim())
  .filter(Boolean);
const fields = ["category", "tag", "title", "summary", "content"];
const separator = ["", "", "[[[SUPERARB_NEWS_FIELD_SEPARATOR]]]", "", ""].join("\n");

const raw = JSON.parse(await readFile(storeFile, "utf8"));
const items = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : null;
if (!items) throw new Error("The news store must be an array or an object with a data array.");

for (const item of items) {
  if (!item || typeof item !== "object") continue;
  item.translations = isRecord(item.translations) ? item.translations : {};
  for (const locale of targetLocales) {
    if (locale === "zh") continue;
    console.log(`[news-localize] ${locale}: ${item.id || item.title || "untitled"}`);
    item.translations[locale] = await translateItem(item, locale);
  }
}

const temporaryFile = `${storeFile}.tmp-${process.pid}`;
await writeFile(temporaryFile, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
await rename(temporaryFile, storeFile);
console.log(`[news-localize] Updated ${items.length} news items for ${targetLocales.join(", ")}.`);

async function translateItem(item, locale) {
  const source = fields.map((field) => String(item[field] || "")).join(separator);
  const translated = await translateText(source, locale);
  const values = translated.split(separator);
  if (values.length !== fields.length) {
    throw new Error(`The ${locale} translation did not preserve field separators for ${item.id || item.title}.`);
  }
  return Object.fromEntries(fields.map((field, index) => [field, values[index].trim()]));
}

async function translateText(text, targetLocale) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "zh-CN");
  url.searchParams.set("tl", targetLocale);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Translation request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  const segments = Array.isArray(payload?.[0]) ? payload[0] : [];
  const translated = segments.map((segment) => (Array.isArray(segment) ? segment[0] : "")).join("");
  if (!translated.trim()) throw new Error(`Translation response for ${targetLocale} was empty.`);
  return translated;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
