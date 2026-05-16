<template>
  <section v-if="!selectedItem" class="news-layout">
    <article class="panel news-category-panel">
      <el-alert
        v-if="error"
        class="news-alert"
        :title="error"
        type="warning"
        :closable="false"
        show-icon
      />

      <div class="news-category-grid">
        <article v-for="group in categoryGroups" :key="group.key" class="news-category-card">
          <header>
            <span>{{ group.label }}</span>
            <strong>{{ group.items.length }}</strong>
          </header>
          <button
            v-for="item in group.items.slice(0, 3)"
            :key="item.id"
            class="news-card-item"
            type="button"
            @click="$emit('select', item.id)"
          >
            <strong>{{ item.title }}</strong>
            <small>{{ item.summary }}</small>
            <time>{{ formatDate(item.time) }}</time>
          </button>
          <p v-if="group.items.length === 0" class="news-empty-card">暂无{{ group.label }}资讯</p>
        </article>
      </div>
    </article>

    <aside class="panel news-hot-panel">
      <div class="news-hot-heading">
        <span>Hot News</span>
        <h3>热门资讯</h3>
      </div>
      <div class="news-hot-list">
        <button v-for="(item, index) in hotItems" :key="item.id" class="news-hot-item" type="button" @click="$emit('select', item.id)">
          <em>{{ String(index + 1).padStart(2, "0") }}</em>
          <span>
            <strong>{{ item.title }}</strong>
            <time>{{ formatDate(item.time) }}</time>
          </span>
        </button>
      </div>
      <p v-if="hotItems.length === 0" class="news-empty-card">暂无热门资讯</p>
    </aside>
  </section>

  <article v-else class="panel news-detail-panel">
    <button class="news-back-button" type="button" @click="$emit('select', '')">返回</button>
    <div class="news-detail-header">
      <h2>{{ selectedItem.title }}</h2>
      <div class="news-detail-meta">
        <span>{{ selectedItem.category }}</span>
        <time>{{ formatDate(selectedItem.time) }}</time>
      </div>
    </div>
    <div class="news-content">{{ selectedItem.content }}</div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { NewsItem } from "../../types/news";

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

const categories = [
  { key: "strategy", label: "策略", keywords: ["策略", "清算", "执行", "套利", "候选"] },
  { key: "architecture", label: "架构", keywords: ["架构", "首页", "服务", "接口", "快照", "rpc"] },
  { key: "maintenance", label: "维护", keywords: ["维护", "节点", "部署", "修复", "升级"] },
  { key: "industry", label: "行业", keywords: ["行业", "市场", "协议", "生态", "新闻", "资讯"] },
];

const categoryGroups = computed(() =>
  categories.map((category) => ({
    ...category,
    items: props.items.filter((item) => categoryFor(item) === category.key),
  })),
);

const hotItems = computed(() => [...props.items].sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime()).slice(0, 8));

const selectedItem = computed(() => {
  if (!props.selectedId) return null;
  return props.items.find((item) => item.id === props.selectedId) ?? null;
});

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function categoryFor(item: NewsItem) {
  const source = `${item.category} ${item.title} ${item.summary}`.toLowerCase();
  return categories.find((category) => category.keywords.some((keyword) => source.includes(keyword.toLowerCase())))?.key ?? "industry";
}
</script>

<style scoped src="./NewsPanel.css"></style>
