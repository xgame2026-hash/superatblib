<template>
  <section class="overview-strip">
    <article v-for="metric in overviewMetrics" :key="metric.label" class="overview-stat" :class="metricClass(metric)">
      <span>{{ metric.label }}</span>
      <div>
        <span class="overview-stat-copy">
          <strong :class="metric.tone === 'danger' ? 'is-danger' : ''">{{ displayOverviewValue(metric) }}</strong>
          <em :class="metric.tone === 'ready' ? 'trend-up' : 'trend-flat'">{{ metric.note }}</em>
        </span>
        <span
          v-if="metric.label === '清算启动'"
          class="liquidation-state-icon"
          :class="metric.tone === 'ready' ? 'is-running' : 'is-paused'"
          aria-hidden="true"
        >
          <img :src="metric.tone === 'ready' ? runIconUrl : stopIconUrl" alt="" />
        </span>
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
          @click="emit('openNews', item.id)"
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
        <div class="market-status-actions">
          <span class="market-status-time" :class="{ 'is-loading': marketStatusLoading && marketStatusRows.length === 0 }">
            {{ marketStatusLoading && marketStatusRows.length === 0 ? "读取中" : marketStatusUpdatedAt }}
          </span>
          <button class="market-status-refresh" type="button" :disabled="marketStatusLoading" @click="refreshMarketStatus">
            {{ marketStatusLoading ? "刷新中" : "刷新" }}
          </button>
        </div>
      </div>

      <div v-if="marketStatusLoading && marketStatusRows.length === 0" class="market-status-skeleton">
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
        {{ marketStatusError || "暂无候选运行中的市场。" }}
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { NewsItem } from "../../types/news";
import runIconUrl from "../../img/run.svg";
import stopIconUrl from "../../img/stop.svg";

type Metric = {
  label: string;
  value: string;
  trend: number;
};

type OverviewMetric = {
  label: string;
  value: string;
  note: string;
  tone?: "ready" | "flat" | "danger";
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

type MarketStrategyRow = {
  id: string;
  chain: ChainKey | string;
  chainLabel?: string;
  protocol: string;
  strategy: string;
  rpc: string;
  queueCount?: number;
  liquidationCount?: number;
  status: string;
  updatedAt?: string;
};

const props = defineProps<{
  active?: boolean;
  metrics: Metric[];
  marketIcon: (chain: string) => string;
  newsItems: NewsItem[];
  newsLoading: boolean;
  newsError: string;
}>();

const emit = defineEmits<{
  openNews: [id?: string];
}>();

const marketStatusLoading = ref(false);
const marketStatusError = ref("");
const marketStatusUpdatedAt = ref("--");
const marketSources = ref<MarketSourceRow[]>([]);
const overviewMetrics = ref<OverviewMetric[]>(createOverviewMetrics());
const animatedOverviewValues = ref<Record<string, number>>({});
const overviewValueTargets = new Map<string, number>();
const overviewValueAnimationTimers = new Map<string, number>();
const AUTH_CODE_KEY = "superarb-auth-code-v1.6.0";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.0";
const RUNNING_MARKET_STORAGE_KEY = "liq2-running-market";
const OVERVIEW_METRICS_CACHE_KEY = "liq2-overview-metrics-cache";
const MARKET_STATUS_CACHE_KEY = "liq2-market-status-cache";
const OVERVIEW_REFRESH_EVENT = "liq2-overview-refresh";
const SAFETY_OPERATION_START_DATE = "2026-02-16";
const SAFETY_OPERATION_START_LABEL = "2026年2月16日";
let overviewRefreshTimer = 0;
let overviewRuntimeTicker = 0;
let marketStatusRequested = false;
let overviewMetricsRequested = false;

const latestNews = computed(() => props.newsItems.slice(0, 6));
const marketStatusRows = computed(() => {
  return [...marketSources.value].filter((source) => source.status === "候选运行中").sort(byChainOrder);
});

onMounted(() => {
  restoreOverviewMetricsCache();
  restoreMarketStatusCache();
  if (props.active ?? true) startDashboardView();
  window.addEventListener(OVERVIEW_REFRESH_EVENT, handleOverviewRuntimeEvent);
});

watch(
  () => props.active,
  (active) => {
    if (active ?? true) {
      startDashboardView();
      return;
    }
    stopDashboardView();
  },
);

onBeforeUnmount(() => {
  stopDashboardView();
  window.removeEventListener(OVERVIEW_REFRESH_EVENT, handleOverviewRuntimeEvent);
  overviewValueAnimationTimers.forEach((timer) => window.clearInterval(timer));
  overviewValueAnimationTimers.clear();
});

function startDashboardView() {
  if (!marketStatusRequested) {
    marketStatusRequested = true;
    if (marketSources.value.length === 0) void loadMarketStatus();
  }
  if (!overviewMetricsRequested) {
    overviewMetricsRequested = true;
    void loadOverviewMetrics();
  }
  if (!overviewRefreshTimer) overviewRefreshTimer = window.setInterval(loadOverviewMetrics, 30_000);
  if (!overviewRuntimeTicker) {
    overviewRuntimeTicker = window.setInterval(() => {
      updateOverviewMetric(readSafetyOperationMetric());
      tickRunningRpcMetric();
    }, 1_000);
  }
}

function stopDashboardView() {
  if (overviewRefreshTimer) window.clearInterval(overviewRefreshTimer);
  if (overviewRuntimeTicker) window.clearInterval(overviewRuntimeTicker);
  overviewRefreshTimer = 0;
  overviewRuntimeTicker = 0;
}

function createOverviewMetrics(): OverviewMetric[] {
  return [
    { label: "BNB", value: "--", note: "钱包资产", tone: "flat" },
    { label: "BNB RPC", value: "--", note: "到期 --", tone: "flat" },
    readSafetyOperationMetric(),
    { label: "清算启动", value: "--", note: "本地状态", tone: "flat" },
  ];
}

async function loadOverviewMetrics() {
  updateOverviewMetric(readLiquidationStartedMetric());
  updateOverviewMetric(readSafetyOperationMetric());
  void readBnbUsdtMetric().then(updateOverviewMetric);
  void readBnbRpcMetric().then(updateOverviewMetric);
}

function handleOverviewRuntimeEvent() {
  updateOverviewMetric(readLiquidationStartedMetric());
  updateOverviewMetric(readSafetyOperationMetric());
  tickRunningRpcMetric();
  void readBnbRpcMetric().then(updateOverviewMetric);
}

function updateOverviewMetric(nextMetric: OverviewMetric) {
  overviewMetrics.value = overviewMetrics.value.map((metric) => (metric.label === nextMetric.label ? nextMetric : metric));
  saveOverviewMetricsCache();
  animateOverviewValues([nextMetric]);
}

function restoreOverviewMetricsCache() {
  const raw = localStorage.getItem(scopedStorageKey(OVERVIEW_METRICS_CACHE_KEY));
  if (!raw) return;
  try {
    const cached = JSON.parse(raw) as { metrics?: OverviewMetric[] };
    const expectedLabels = overviewMetrics.value.map((metric) => metric.label).join("|");
    const cachedLabels = Array.isArray(cached.metrics) ? cached.metrics.map((metric) => metric.label).join("|") : "";
    if (Array.isArray(cached.metrics) && cached.metrics.length === overviewMetrics.value.length && cachedLabels === expectedLabels) {
      overviewMetrics.value = cached.metrics;
      animateOverviewValues(cached.metrics);
    }
  } catch {
    localStorage.removeItem(scopedStorageKey(OVERVIEW_METRICS_CACHE_KEY));
  }
}

function readSafetyOperationMetric(): OverviewMetric {
  return {
    label: "安全运营",
    value: safetyOperationDuration(),
    note: `零事故 · 始于 ${SAFETY_OPERATION_START_LABEL}`,
    tone: "ready",
  };
}

function safetyOperationDuration(): string {
  const start = new Date(`${SAFETY_OPERATION_START_DATE}T00:00:00+07:00`).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || now < start) return "0天 0小时 0分钟 0秒";
  const elapsedSeconds = Math.floor((now - start) / 1000);
  const days = Math.floor(elapsedSeconds / 86_400) + 1;
  const secondsInCurrentDay = elapsedSeconds % 86_400;
  const hours = Math.floor(secondsInCurrentDay / 3_600);
  const minutes = Math.floor((secondsInCurrentDay % 3_600) / 60);
  const seconds = secondsInCurrentDay % 60;
  return `${days}天 ${padTimeUnit(hours)}小时 ${padTimeUnit(minutes)}分钟 ${padTimeUnit(seconds)}秒`;
}

function padTimeUnit(value: number): string {
  return String(value).padStart(2, "0");
}

function saveOverviewMetricsCache() {
  localStorage.setItem(scopedStorageKey(OVERVIEW_METRICS_CACHE_KEY), JSON.stringify({ metrics: overviewMetrics.value, savedAt: Date.now() }));
}

function scopedStorageKey(baseKey: string): string {
  const authCode = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim();
  return authCode ? `${baseKey}:${hashStorageScope(authCode)}` : baseKey;
}

function hashStorageScope(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function readBnbUsdtMetric(): Promise<OverviewMetric> {
  try {
    const response = await fetch("/api/wallet-assets", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { rows?: Array<{ key?: string; usdt?: string }> };
    const bnb = payload.rows?.find((row) => row.key === "bnb");
    const value = formatAssetAmount(bnb?.usdt);
    return { label: "BNB", value: value === "--" ? "--" : `${value} USDT`, note: "钱包资产", tone: value === "--" ? "flat" : "ready" };
  } catch {
    return { label: "BNB", value: "--", note: "读取失败", tone: "flat" };
  }
}

async function readBnbRpcMetric(): Promise<OverviewMetric> {
  try {
    const response = await fetch("/api/rpc/usage", {
      cache: "no-store",
      headers: latestHeaders(),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      metrics?: { bnb?: { requestCount?: number | null; requestLimit?: number | null; remainingRequests?: number | null; tokenExpiresAt?: string; status?: string; message?: string } };
    };
    const metric = payload.metrics?.bnb;
    const used = formatRpcUsed(metric);
    const expiry = formatRpcExpiry(metric?.tokenExpiresAt, metric?.message);
    const configured = metric?.status && metric.status !== "missing_rpc";
    return { label: "BNB RPC", value: used, note: `到期 ${expiry}`, tone: configured ? "ready" : "flat" };
  } catch {
    return { label: "BNB RPC", value: "--", note: "到期 --", tone: "flat" };
  }
}

function restoreMarketStatusCache() {
  const raw = localStorage.getItem(MARKET_STATUS_CACHE_KEY);
  if (!raw) return;
  try {
    const cached = JSON.parse(raw) as { sources?: MarketSourceRow[]; updatedAt?: string };
    if (!Array.isArray(cached.sources) || cached.sources.length === 0) return;
    marketSources.value = cached.sources;
    marketStatusUpdatedAt.value = cached.updatedAt || "--";
    marketStatusRequested = true;
    marketStatusLoading.value = false;
    marketStatusError.value = "";
  } catch {
    localStorage.removeItem(MARKET_STATUS_CACHE_KEY);
  }
}

function saveMarketStatusCache() {
  localStorage.setItem(
    MARKET_STATUS_CACHE_KEY,
    JSON.stringify({ sources: marketSources.value, updatedAt: marketStatusUpdatedAt.value, savedAt: Date.now() }),
  );
}

function refreshMarketStatus() {
  void loadMarketStatus();
}

function readLiquidationStartedMetric(): OverviewMetric {
  const started = Boolean(readRunningMarketState());
  return { label: "清算启动", value: started ? "已启动" : "未启动", note: "本地状态", tone: started ? "ready" : "danger" };
}

function tickRunningRpcMetric() {
  const runningMarket = readRunningMarketState();
  if (!runningMarket || runningMarketChain(runningMarket) !== "bnb") return;
  const burn = typeof runningMarket.creditBurnPerSecond === "number" && runningMarket.creditBurnPerSecond > 0 ? runningMarket.creditBurnPerSecond : 0;
  if (!burn) return;
  const current = overviewMetrics.value.find((metric) => metric.label === "BNB RPC");
  const currentValue = current ? parseOverviewNumericValue(current.value) : null;
  if (currentValue === null) return;
  updateOverviewMetric({
    label: "BNB RPC",
    value: Math.round(currentValue + burn).toLocaleString("en-US"),
    note: current?.note || "运行中",
    tone: "ready",
  });
}

function metricClass(metric: OverviewMetric) {
  return {
    "is-liquidation-started": metric.label === "清算启动",
    "is-safety-operation": metric.label === "安全运营",
  };
}

async function loadMarketStatus() {
  marketStatusLoading.value = true;
  marketStatusError.value = "";
  try {
    const response = await fetch(`/api/latest-liquidations?marketStatus=1&t=${Date.now()}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      sources?: MarketSourceRow[];
      strategies?: MarketStrategyRow[];
      updatedAt?: string;
      message?: string;
    };
    if (!response.ok) throw new Error(payload.message ?? "策略快照读取失败");
    const strategies = Array.isArray(payload.strategies) ? payload.strategies.map(strategyToMarketSource) : [];
    marketSources.value = strategies.length > 0 ? strategies : Array.isArray(payload.sources) ? payload.sources : [];
    marketStatusUpdatedAt.value = payload.updatedAt ? `更新 ${formatDateTime(payload.updatedAt)}` : "--";
    saveMarketStatusCache();
    if (marketSources.value.length === 0 && payload.message) marketStatusError.value = payload.message;
  } catch (error) {
    marketStatusError.value = error instanceof Error ? error.message : "策略快照读取失败";
    if (marketSources.value.length === 0) marketStatusUpdatedAt.value = "--";
  } finally {
    marketStatusLoading.value = false;
  }
}

function latestHeaders(): Record<string, string> {
  const authCode = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim();
  return {
    accept: "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode } : {}),
  };
}

function formatAssetAmount(value?: string): string {
  if (!value || value === "--") return "--";
  const numeric = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function displayOverviewValue(metric: OverviewMetric): string {
  if (metric.label === "安全运营") return metric.value;
  const target = parseOverviewNumericValue(metric.value);
  if (target === null) return metric.value;
  const animated = animatedOverviewValues.value[metric.label] ?? target;
  const formatted = animated.toLocaleString("en-US", { maximumFractionDigits: metric.value.includes(".") ? 2 : 0 });
  return metric.value.includes("USDT") ? `${formatted} USDT` : formatted;
}

function animateOverviewValues(metrics: OverviewMetric[]) {
  for (const metric of metrics) {
    if (metric.label === "安全运营") continue;
    const target = parseOverviewNumericValue(metric.value);
    if (target === null) continue;
    const previousTarget = overviewValueTargets.get(metric.label);
    overviewValueTargets.set(metric.label, target);
    if (previousTarget === undefined) {
      animatedOverviewValues.value = { ...animatedOverviewValues.value, [metric.label]: 0 };
      animateOverviewValue(metric.label, 0, target);
      continue;
    }
    if (previousTarget === target) continue;
    animateOverviewValue(metric.label, animatedOverviewValues.value[metric.label] ?? previousTarget, target);
  }
}

function animateOverviewValue(label: string, from: number, to: number) {
  const existingTimer = overviewValueAnimationTimers.get(label);
  if (existingTimer) window.clearInterval(existingTimer);
  const startedAt = performance.now();
  const duration = 800;
  const timer = window.setInterval(() => {
    const progress = Math.min(1, (performance.now() - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    animatedOverviewValues.value = { ...animatedOverviewValues.value, [label]: from + (to - from) * eased };
    if (progress >= 1) {
      window.clearInterval(timer);
      overviewValueAnimationTimers.delete(label);
      animatedOverviewValues.value = { ...animatedOverviewValues.value, [label]: to };
    }
  }, 16);
  overviewValueAnimationTimers.set(label, timer);
}

function parseOverviewNumericValue(value: string): number | null {
  const match = value.replace(/,/g, "").match(/^-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatRpcUsed(metric?: { requestCount?: number | null; requestLimit?: number | null; remainingRequests?: number | null }): string {
  if (!metric) return "--";
  if (typeof metric.requestCount === "number") return metric.requestCount.toLocaleString("en-US");
  if (typeof metric.remainingRequests === "number" && typeof metric.requestLimit === "number" && metric.requestLimit > 0) {
    return Math.max(0, metric.requestLimit - metric.remainingRequests).toLocaleString("en-US");
  }
  return "--";
}

function formatRpcExpiry(tokenExpiresAt?: string, message?: string): string {
  if (tokenExpiresAt) return formatDateTime(tokenExpiresAt);
  if (!message) return "--";
  const match = message.match(/expired at ([^.;]+)/i);
  return match ? formatDateTime(match[1]) : "--";
}

type RunningMarketState = {
  market?: unknown;
  option?: { disabled?: boolean; chain?: string };
  chain?: string;
  walletAddress?: string;
  endpointSlug?: string;
  endpointId?: string;
  id?: string;
  creditBurnPerSecond?: number | null;
};

function readRunningMarketState(): RunningMarketState | null {
  const raw = localStorage.getItem(RUNNING_MARKET_STORAGE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as RunningMarketState;
    return saved.market && saved.option && !saved.option.disabled ? saved : null;
  } catch {
    return null;
  }
}

function runningMarketChain(state: RunningMarketState): string {
  return normalizeChainKey(typeof state.chain === "string" ? state.chain : state.option?.chain ?? "");
}

function normalizeChainKey(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes("bnb")) return "bnb";
  if (normalized.includes("arb")) return "arbitrum";
  return "ethereum";
}

function strategyToMarketSource(strategy: MarketStrategyRow): MarketSourceRow {
  return {
    id: strategy.id,
    chain: strategy.chain,
    chainLabel: strategy.chainLabel || chainLabel(strategy.chain),
    source: strategy.protocol,
    rpc: strategy.rpc || "--",
    queueCount: strategy.queueCount ?? 0,
    liquidationCount: strategy.liquidationCount ?? 0,
    protocolCount: 1,
    status: normalizeStrategyStatus(strategy.status || "--"),
    updatedAt: strategy.updatedAt || new Date().toISOString(),
  };
}

function normalizeStrategyStatus(status: string) {
  return status.trim() === "RPC已接入" ? "候选运行中" : status;
}

function chainLabel(chain: string) {
  const value = String(chain).toLowerCase();
  if (value === "bnb") return "BNB";
  if (value === "arbitrum" || value === "arb") return "ARB";
  return "ETH";
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
