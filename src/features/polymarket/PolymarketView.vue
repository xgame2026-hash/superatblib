<template>
  <section class="market-page">
    <header class="market-toolbar">
      <div class="market-title-group">
        <span class="product-mark" aria-hidden="true">P</span>
        <div>
          <div class="title-line"><h2>Polymarket</h2><span class="mode-badge live">OFFICIAL API</span></div>
          <p>官方市场数据 · 仅显示仍在接受订单且尚未到期的市场</p>
        </div>
      </div>
      <div class="toolbar-actions">
        <span v-if="snapshot" class="sync-state"><i></i>{{ formatDateTime(snapshot.fetchedAt) }} · {{ snapshot.latencyMs }}ms</span>
        <button class="outline-button" type="button" :disabled="loading" @click="loadMarkets()">{{ loading ? "加载中…" : "↻ 刷新官方数据" }}</button>
      </div>
    </header>

    <div v-if="error" class="source-error"><strong>Polymarket 数据暂不可用</strong><span>{{ error }}</span><button type="button" @click="loadMarkets()">重试</button></div>

    <div class="stat-grid">
      <article class="stat-card"><span>已载入市场</span><strong>{{ snapshot ? snapshot.count : "--" }}</strong><small class="neutral">通过有效期与接单状态校验</small></article>
      <article class="stat-card"><span>样本 24h 成交量</span><strong>{{ snapshot ? formatUsd(snapshot.totals.volume24hr) : "--" }}</strong><small class="neutral">当前已载入市场合计</small></article>
      <article class="stat-card"><span>样本可用流动性</span><strong>{{ snapshot ? formatUsd(snapshot.totals.liquidity) : "--" }}</strong><small class="neutral">官方 Gamma 字段</small></article>
      <article class="stat-card"><span>数据源</span><strong class="source-name">Gamma</strong><small :class="error ? 'negative' : 'positive'">{{ error ? "连接异常" : snapshot ? "官方接口已连接" : "等待连接" }}</small></article>
    </div>

    <div class="workspace-grid">
      <section class="market-panel opportunity-panel">
        <div class="panel-header">
          <div><span class="section-kicker">LIVE MARKET DISCOVERY</span><h3>当前市场</h3></div>
          <span class="result-count">{{ filteredMarkets.length }} 个市场</span>
        </div>
        <div class="filter-bar">
          <label class="search-box"><span>⌕</span><input v-model.trim="search" type="search" placeholder="搜索真实市场" /></label>
          <div class="category-tabs" role="tablist" aria-label="市场分类">
            <button v-for="category in categories" :key="category" type="button" :class="{ active: activeCategory === category }" @click="activeCategory = category">{{ category }}</button>
          </div>
          <label class="edge-filter"><span>最大价差</span><select v-model.number="maximumSpread"><option :value="1">全部</option><option :value="0.05">≤ 5%</option><option :value="0.02">≤ 2%</option><option :value="0.01">≤ 1%</option></select></label>
        </div>

        <div v-if="loading && !snapshot" class="empty-state">正在从 Polymarket 官方接口读取市场…</div>
        <div v-else class="market-list">
          <button v-for="market in filteredMarkets" :key="market.id" class="market-row" :class="{ selected: selectedMarket?.id === market.id }" type="button" @click="selectedMarketId = market.id">
            <span class="event-icon" :class="{ 'has-photo': market.image }"><img v-if="market.image" :src="market.image" alt="" /><span v-else>P</span></span>
            <span class="market-copy"><small>{{ market.category }} · 截止 {{ formatEndDate(market.endDate) }}</small><strong>{{ market.question }}</strong><span>流动性 {{ formatUsd(market.liquidity) }} · 24h {{ formatUsd(market.volume24hr) }} · 更新 {{ relativeTime(market.updatedAt) }}</span></span>
            <span class="probability-cell"><small>YES 概率</small><strong>{{ formatCents(market.yesPrice) }}</strong><span v-if="market.oneDayPriceChange !== null" :class="market.oneDayPriceChange >= 0 ? 'positive' : 'negative'">{{ formatChange(market.oneDayPriceChange) }}</span><span v-else>--</span></span>
            <span class="price-pair"><span class="yes-price"><small>YES</small><strong>{{ formatCents(market.yesPrice) }}</strong></span><span class="no-price"><small>NO</small><strong>{{ formatCents(market.noPrice) }}</strong></span></span>
            <span class="edge-cell"><small>盘口价差</small><strong :class="market.spread !== null && market.spread <= .02 ? 'positive' : ''">{{ market.spread === null ? "--" : formatPercent(market.spread) }}</strong></span>
          </button>
          <div v-if="!filteredMarkets.length" class="empty-state">{{ snapshot ? "没有符合当前筛选条件的有效市场" : "等待官方数据" }}</div>
        </div>
      </section>

      <aside class="market-panel detail-panel">
        <div class="panel-header detail-heading"><div><span class="section-kicker">OFFICIAL MARKET DATA</span><h3>市场详情</h3></div><span class="risk-badge">只读</span></div>
        <template v-if="selectedMarket">
          <div class="selected-event"><span class="event-icon large" :class="{ 'has-photo': selectedMarket.image }"><img v-if="selectedMarket.image" :src="selectedMarket.image" alt="" /><span v-else>P</span></span><div><small>{{ selectedMarket.category }}</small><strong>{{ selectedMarket.question }}</strong></div></div>
          <div class="probability-chart"><div class="chart-caption"><span>官方隐含概率</span><strong>{{ formatCents(selectedMarket.yesPrice) }}</strong></div><div class="probability-track"><span class="yes-segment" :style="{ width: `${(selectedMarket.yesPrice || 0) * 100}%` }"></span></div><div class="chart-legend"><span><i class="yes-dot"></i> YES {{ formatCents(selectedMarket.yesPrice) }}</span><span><i class="no-dot"></i> NO {{ formatCents(selectedMarket.noPrice) }}</span></div></div>
          <dl class="ticket-summary market-facts">
            <div><dt>最佳买价 / 卖价</dt><dd>{{ formatCents(selectedMarket.bestBid) }} / {{ formatCents(selectedMarket.bestAsk) }}</dd></div>
            <div><dt>盘口价差</dt><dd>{{ selectedMarket.spread === null ? "--" : formatPercent(selectedMarket.spread) }}</dd></div>
            <div><dt>24h 成交量</dt><dd>{{ formatUsd(selectedMarket.volume24hr) }}</dd></div>
            <div><dt>可用流动性</dt><dd>{{ formatUsd(selectedMarket.liquidity) }}</dd></div>
            <div><dt>最小订单</dt><dd>{{ selectedMarket.minOrderSize ?? "--" }} USDC</dd></div>
            <div><dt>官方更新时间</dt><dd>{{ formatDateTime(selectedMarket.updatedAt) }}</dd></div>
          </dl>
          <div class="risk-note"><span>i</span><p>本页数据直接来自 Polymarket Gamma API。概率与盘口可能快速变化；当前页面不连接钱包，也不提交订单。</p></div>
          <a class="primary-button market-link" :href="marketUrl(selectedMarket)" target="_blank" rel="noopener noreferrer">在 Polymarket 查看 ↗</a>
        </template>
        <div v-else class="empty-state">选择一个有效市场查看官方数据</div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type Market = { id:string; question:string; slug:string; eventSlug:string; category:string; image:string; endDate:string; updatedAt:string; liquidity:number; volume:number; volume24hr:number; yesPrice:number|null; noPrice:number|null; bestBid:number|null; bestAsk:number|null; spread:number|null; oneDayPriceChange:number|null; acceptingOrders:boolean; minOrderSize:number|null; minTickSize:number|null };
type Snapshot = { ok:boolean; source:string; sourceLabel:string; fetchedAt:string; latencyMs:number; count:number; totals:{liquidity:number;volume24hr:number}; markets:Market[] };

const snapshot = ref<Snapshot | null>(null);
const loading = ref(false);
const error = ref("");
const search = ref("");
const activeCategory = ref("全部");
const maximumSpread = ref(1);
const selectedMarketId = ref("");
let refreshTimer = 0;

const categories = computed(() => ["全部", ...Array.from(new Set((snapshot.value?.markets || []).map((market) => market.category))).slice(0, 5)]);
const filteredMarkets = computed(() => {
  const keyword = search.value.toLowerCase();
  return (snapshot.value?.markets || []).filter((market) => {
    const categoryMatch = activeCategory.value === "全部" || market.category === activeCategory.value;
    const textMatch = !keyword || `${market.question} ${market.category}`.toLowerCase().includes(keyword);
    const spreadMatch = market.spread === null || market.spread <= maximumSpread.value;
    return categoryMatch && textMatch && spreadMatch;
  });
});
const selectedMarket = computed(() => (snapshot.value?.markets || []).find((market) => market.id === selectedMarketId.value) || filteredMarkets.value[0] || null);

onMounted(() => { void loadMarkets(); refreshTimer = window.setInterval(() => void loadMarkets(true), 30_000); });
onBeforeUnmount(() => { if (refreshTimer) window.clearInterval(refreshTimer); });

async function loadMarkets(silent = false): Promise<void> {
  if (!silent) loading.value = true;
  try {
    const response = await fetch("/api/polymarket/markets?limit=100", { cache: "no-store", headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null) as Snapshot | { error?: string } | null;
    if (!response.ok || !payload || !("markets" in payload)) throw new Error(payload && "error" in payload ? payload.error : `HTTP ${response.status}`);
    snapshot.value = payload;
    error.value = "";
    if (!selectedMarketId.value || !payload.markets.some((item) => item.id === selectedMarketId.value)) selectedMarketId.value = payload.markets[0]?.id || "";
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "无法读取 Polymarket 官方数据";
    snapshot.value = null;
  } finally { loading.value = false; }
}

function formatUsd(value:number):string { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:2}).format(value || 0); }
function formatCents(value:number|null):string { return value === null || !Number.isFinite(value) ? "--" : `${(value*100).toFixed(value < .01 ? 1 : 0)}¢`; }
function formatPercent(value:number):string { return `${(value*100).toFixed(2)}%`; }
function formatChange(value:number):string { return `${value >= 0 ? "+" : ""}${(value*100).toFixed(1)}%`; }
function formatEndDate(value:string):string { const date=new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(date) : "--"; }
function formatDateTime(value:string):string { const date=new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(date) : "--"; }
function relativeTime(value:string):string { const diff=Date.now()-Date.parse(value); if(!Number.isFinite(diff)) return "--"; if(diff<60_000)return "刚刚"; if(diff<3_600_000)return `${Math.floor(diff/60_000)} 分钟前`; if(diff<86_400_000)return `${Math.floor(diff/3_600_000)} 小时前`; return `${Math.floor(diff/86_400_000)} 天前`; }
function marketUrl(market:Market):string { const slug=market.eventSlug || market.slug; return `https://polymarket.com/event/${encodeURIComponent(slug)}`; }
</script>

<style scoped src="./PolymarketView.css"></style>
