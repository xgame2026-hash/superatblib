<template>
  <section class="overview-strip">
    <article v-for="metric in metrics" :key="metric.label" class="overview-stat">
      <span>{{ metric.label }}</span>
      <div>
        <strong>{{ metric.value }}</strong>
        <em :class="metric.trend > 0 ? 'trend-up' : 'trend-flat'">
          {{ metric.trend > 0 ? "+" : "" }}{{ metric.trend }}% / 24h
        </em>
      </div>
    </article>
  </section>

  <section class="dashboard-grid">
    <article class="panel dashboard-news-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Latest News</p>
          <h3>最新资讯</h3>
        </div>
        <button class="panel-link-button" type="button" @click="emit('openNews')">全部资讯</button>
      </div>

      <div v-if="newsLoading" class="dashboard-news-skeleton" aria-label="正在加载资讯">
        <span v-for="index in 5" :key="index"></span>
      </div>
      <div v-else-if="newsError && !latestNews.length" class="dashboard-news-state is-error">
        {{ newsError }}
      </div>
      <div v-else-if="!latestNews.length" class="dashboard-news-state">
        暂无资讯
      </div>
      <div v-else class="dashboard-news-list">
        <button
          v-for="item in latestNews"
          :key="item.id"
          class="dashboard-news-item"
          type="button"
          @click="emit('openNews')"
        >
          <span class="news-copy">
            <span class="news-title">
              <em>{{ item.category }}</em>
              {{ item.title }}
            </span>
            <small>{{ item.summary }}</small>
          </span>
          <time>{{ formatNewsTime(item.time) }}</time>
        </button>
      </div>
    </article>

    <article class="panel market-status-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Market Classification</p>
          <h3>可接入市场状态</h3>
        </div>
        <span class="market-status-time" :class="{ 'is-loading': marketStatusLoading }">
          {{ marketStatusLoading ? "读取中" : marketStatusUpdatedAt }}
        </span>
      </div>

      <div v-if="marketStatusLoading" class="market-status-skeleton">
        <span v-for="index in 3" :key="index"></span>
      </div>
      <div v-else-if="marketStatusRows.length > 0" class="market-source-grid">
        <article v-for="source in marketStatusRows" :key="source.id" class="market-source-card">
          <header class="market-source-head">
            <img :src="marketIcon(source.chain)" alt="" aria-hidden="true" />
            <div>
              <strong>{{ source.chainLabel }}</strong>
              <span>{{ source.source }}</span>
            </div>
            <em :class="statusClass(source.status)">{{ source.status }}</em>
          </header>
          <dl class="market-source-metrics">
            <div>
              <dt>RPC</dt>
              <dd>{{ source.rpc }}</dd>
            </div>
            <div>
              <dt>候选队列</dt>
              <dd>{{ source.queueCount }}</dd>
            </div>
            <div>
              <dt>清算快照</dt>
              <dd>{{ source.liquidationCount }}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{{ formatDateTime(source.updatedAt) }}</dd>
            </div>
          </dl>
        </article>
      </div>
      <div v-else class="market-status-empty" :class="{ 'is-error': marketStatusError }">
        {{ marketStatusError || "等待策略快照服务返回市场状态。" }}
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { NewsItem } from "../../types/news";

type Metric = {
  label: string;
  value: string;
  trend: number;
};

type ChainKey = "ethereum" | "bnb" | "arbitrum";

type MarketSourceRow = {
  id: string;
  chain: ChainKey | string;
  chainLabel: string;
  source: string;
  rpc: string;
  queueCount: number;
  liquidationCount: number;
  protocolCount: number;
  status: string;
  updatedAt: string;
};

const props = defineProps<{
  metrics: Metric[];
  marketIcon: (chain: string) => string;
  newsItems: NewsItem[];
  newsLoading: boolean;
  newsError: string;
}>();

const emit = defineEmits<{
  openNews: [];
}>();

const marketStatusLoading = ref(false);
const marketStatusError = ref("");
const marketStatusUpdatedAt = ref("--");
const marketSources = ref<MarketSourceRow[]>([]);

const latestNews = computed(() => props.newsItems.slice(0, 6));
const marketStatusRows = computed(() => [...marketSources.value].sort(byChainOrder));

onMounted(() => {
  void loadMarketStatus();
});

async function loadMarketStatus() {
  marketStatusLoading.value = true;
  marketStatusError.value = "";
  try {
    const response = await fetch(`/api/latest-liquidations?t=${Date.now()}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const payload = (await response.json().catch(() => ({}))) as { sources?: MarketSourceRow[]; updatedAt?: string; message?: string };
    if (!response.ok) throw new Error(payload.message ?? "策略快照读取失败");
    marketSources.value = Array.isArray(payload.sources) ? payload.sources : [];
    marketStatusUpdatedAt.value = payload.updatedAt ? `更新 ${formatDateTime(payload.updatedAt)}` : "--";
    if (marketSources.value.length === 0 && payload.message) marketStatusError.value = payload.message;
  } catch (error) {
    marketStatusError.value = error instanceof Error ? error.message : "策略快照读取失败";
    marketSources.value = [];
    marketStatusUpdatedAt.value = "--";
  } finally {
    marketStatusLoading.value = false;
  }
}

function formatNewsTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "--";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  const second = `${date.getSeconds()}`.padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
}

function statusClass(status: string) {
  if (/可执行|就绪|候选|ready/i.test(status)) return "is-ready";
  if (/待|standby|部署|排队|接入/i.test(status)) return "is-standby";
  return "is-locked";
}

function byChainOrder(left: MarketSourceRow, right: MarketSourceRow) {
  const order: Record<string, number> = { ethereum: 0, eth: 0, arbitrum: 1, arb: 1, bnb: 2 };
  return (order[String(left.chain).toLowerCase()] ?? 9) - (order[String(right.chain).toLowerCase()] ?? 9);
}
</script>

<style scoped src="./DashboardView.css"></style>
