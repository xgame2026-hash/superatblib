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
  let requestSequence = 0;
  let requestController: AbortController | undefined;

  async function loadNews() {
    const sequence = ++requestSequence;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    newsLoading.value = true;
    newsError.value = "";
    try {
      const query = new URLSearchParams({ limit: "50", locale: getLocale() });
      const response = await fetch(`/api/news?${query}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as NewsResponse;
      if (sequence !== requestSequence) return;
      if (!response.ok || payload.success === false || !Array.isArray(payload.data)) {
        throw new Error(t("news.apiUnavailable"));
      }
      newsItems.value = payload.data.map(normalizeNews).filter(Boolean) as NewsItem[];
    } catch (error) {
      if (sequence !== requestSequence || (error as { name?: string }).name === "AbortError") return;
      newsError.value = error instanceof Error ? error.message : t("news.apiUnavailable");
    } finally {
      if (sequence === requestSequence) {
        newsLoading.value = false;
        if (requestController === controller) requestController = undefined;
      }
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
