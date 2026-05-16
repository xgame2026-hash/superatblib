import { ref } from "vue";
import type { NewsItem } from "../types/news";

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
      const response = await fetch("/api/news?limit=50", { headers: { accept: "application/json" } });
      const payload = (await response.json().catch(() => ({}))) as NewsResponse;
      if (!response.ok || payload.success === false || !Array.isArray(payload.data)) {
        throw new Error("资讯接口暂时不可用");
      }
      newsItems.value = payload.data.map(normalizeNews).filter(Boolean) as NewsItem[];
    } catch (error) {
      newsError.value = error instanceof Error ? error.message : "资讯接口暂时不可用";
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
    category: String(raw.category ?? raw.tag ?? "资讯"),
    title,
    summary: String(raw.summary ?? content.slice(0, 120)),
    content,
    time: String(raw.time ?? raw.publishedAt ?? new Date().toISOString()),
  };
}
