import { ref } from "vue";
import type { NewsItem } from "../types/news";
import { getLocale, t } from "../i18n";

type NewsResponse = {
  success?: boolean;
  data?: unknown;
};

export function useNews() {
  const newsItems = ref<NewsItem[]>([]);
  const newsLoading = ref(false);
  const newsError = ref("");

  async function loadNews() {
    newsLoading.value = true;
    newsError.value = "";
    try {
      const query = new URLSearchParams({ limit: "50", locale: getLocale() });
      const response = await fetch(`/api/news?${query}`, { headers: { accept: "application/json" } });
      const payload = (await response.json().catch(() => ({}))) as NewsResponse;
      if (!response.ok || payload.success === false || !Array.isArray(payload.data)) {
        throw new Error(t("news.apiUnavailable"));
      }
      newsItems.value = payload.data.map(normalizeNews).filter(Boolean) as NewsItem[];
    } catch (error) {
      newsError.value = error instanceof Error ? error.message : t("news.apiUnavailable");
      newsItems.value = [];
    } finally {
      newsLoading.value = false;
    }
  }

  return {
    newsItems,
    newsLoading,
    newsError,
    loadNews,
  };
}

function normalizeNews(input: unknown): NewsItem | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const title = String(raw.title ?? "").trim();
  const content = String(raw.content ?? "").trim();
  if (!title || !content) return null;
  return {
    id: String(raw.id ?? title),
    category: String(raw.category ?? raw.tag ?? t("news.category")),
    title,
    summary: String(raw.summary ?? content.slice(0, 120)),
    content,
    time: String(raw.time ?? raw.publishedAt ?? new Date().toISOString()),
  };
}
