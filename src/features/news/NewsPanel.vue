<template>
  <section v-if="!selectedItem" class="news-layout">
    <article class="panel news-list-panel">
      <el-alert
        v-if="error"
        class="news-alert"
        :title="error"
        type="warning"
        :closable="false"
        show-icon
      />

      <div v-if="loading" class="news-list-skeleton" :aria-label="t('news.loading')">
        <span v-for="index in 8" :key="index"></span>
      </div>
      <div v-else-if="pagedItems.length > 0" class="news-full-list">
        <button
          v-for="item in pagedItems"
          :key="item.id"
          class="news-full-item"
          type="button"
          @click="$emit('select', item.id)"
        >
          <span class="news-full-copy">
            <strong>{{ item.title }}</strong>
            <small>{{ item.summary }}</small>
          </span>
          <span class="news-full-meta">
            <em>{{ item.category }}</em>
            <time>{{ formatDate(item.time) }}</time>
          </span>
        </button>
      </div>
      <p v-else class="news-empty-card">{{ t("news.empty") }}</p>

      <nav v-if="sortedItems.length > 0" class="news-pagination" :aria-label="t('news.pagination')">
        <button type="button" :disabled="currentPage === 1" @click="setPage(1)">{{ t("latest.first") }}</button>
        <button type="button" :disabled="currentPage === 1" @click="setPage(currentPage - 1)">{{ t("latest.prev") }}</button>
        <button
          v-for="page in visiblePages"
          :key="page"
          type="button"
          :class="{ active: page === currentPage }"
          @click="setPage(page)"
        >
          {{ page }}
        </button>
        <button type="button" :disabled="currentPage === totalPages" @click="setPage(currentPage + 1)">{{ t("latest.next") }}</button>
        <button type="button" :disabled="currentPage === totalPages" @click="setPage(totalPages)">{{ t("latest.last") }}</button>
      </nav>
    </article>
  </section>

  <section v-else class="news-detail-layout">
    <article class="panel news-detail-panel">
      <button class="news-back-button" type="button" @click="$emit('select', '')">{{ t("news.back") }}</button>
      <div class="news-detail-header">
        <h2>{{ selectedItem.title }}</h2>
        <div class="news-detail-meta">
          <span>{{ selectedItem.category }}</span>
          <time>{{ formatDate(selectedItem.time) }}</time>
        </div>
      </div>
      <div class="news-content" v-html="selectedContentHtml"></div>
    </article>

    <aside class="panel news-hot-panel">
      <div class="news-hot-heading">
        <span>Hot News</span>
        <h3>{{ t("news.hotTitle") }}</h3>
      </div>
      <div class="news-hot-list">
        <button
          v-for="(item, index) in hotItems"
          :key="item.id"
          class="news-hot-item"
          :class="{ active: item.id === selectedItem.id }"
          type="button"
          @click="$emit('select', item.id)"
        >
          <em>{{ String(index + 1).padStart(2, "0") }}</em>
          <span>
            <strong>{{ item.title }}</strong>
            <time>{{ formatDate(item.time) }}</time>
          </span>
        </button>
      </div>
      <p v-if="hotItems.length === 0" class="news-empty-card">{{ t("news.hotEmpty") }}</p>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import DOMPurify from "dompurify";
import type { NewsItem } from "../../types/news";
import { getLocale, t } from "../../i18n";

const props = defineProps<{
  items: NewsItem[];
  loading: boolean;
  error: string;
  selectedId: string;
}>();

defineEmits<{
  refresh: [];
  select: [id: string];
}>();

const PAGE_SIZE = 15;
const currentPage = ref(1);

const sortedItems = computed(() => [...props.items].sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime()));
const hotItems = computed(() => sortedItems.value.slice(0, 8));
const totalPages = computed(() => Math.max(1, Math.ceil(sortedItems.value.length / PAGE_SIZE)));
const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return sortedItems.value.slice(start, start + PAGE_SIZE);
});
const visiblePages = computed(() => {
  const total = totalPages.value;
  const start = Math.max(1, Math.min(currentPage.value - 2, total - 4));
  const end = Math.min(total, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
});

const selectedItem = computed(() => {
  if (!props.selectedId) return null;
  return props.items.find((item) => item.id === props.selectedId) ?? null;
});
const selectedContentHtml = computed(() => renderNewsContent(selectedItem.value?.content ?? ""));

watch(
  () => props.items.length,
  () => {
    if (currentPage.value > totalPages.value) currentPage.value = totalPages.value;
  },
);

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value);
}

function renderNewsContent(content: string): string {
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(content);
  if (isHtml) {
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ["p", "br", "h2", "h3", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "pre", "code", "hr", "a"],
      ALLOWED_ATTR: ["href", "target", "rel"],
    });
  }

  const safeText = DOMPurify.sanitize(content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return safeText
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(localeForDate(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function localeForDate(): string {
  const locale = getLocale();
  if (locale === "zh") return "zh-CN";
  if (locale === "ja") return "ja-JP";
  if (locale === "ko") return "ko-KR";
  if (locale === "ru") return "ru-RU";
  if (locale === "th") return "th-TH";
  return "en-US";
}
</script>

<style scoped src="./NewsPanel.css"></style>
