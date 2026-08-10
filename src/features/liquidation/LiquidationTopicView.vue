<template>
  <section class="liquidation-topic">
    <header class="topic-header panel">
      <div>
        <p class="topic-kicker">LIQUIDATION INTELLIGENCE · LIVE MODEL</p>
        <h2>清算机会专题</h2>
        <p>展示实时清算候选、健康因子、债务规模与协议分布；不展示未经链上验证的收益预测。</p>
      </div>
      <div class="topic-header-actions">
        <span><i></i>{{ updatedLabel }}</span>
        <button type="button" :disabled="loading" @click="loadSnapshot">{{ loading ? "更新中…" : "刷新模型" }}</button>
      </div>
    </header>

    <div class="topic-kpi-grid">
      <article class="topic-kpi panel"><span>可执行候选</span><strong>{{ opportunities.length }}</strong><small>健康因子低于 1.03 的地址</small></article>
      <article class="topic-kpi panel accent"><span>候选债务规模</span><strong>{{ usd(totalDebtAtRisk) }}</strong><small>健康因子低于 1.03 的实时债务</small></article>
      <article class="topic-kpi panel warning"><span>高风险候选</span><strong>{{ criticalCount }}</strong><small>健康因子低于 1.00</small></article>
      <article class="topic-kpi panel cyan"><span>覆盖协议</span><strong>{{ protocolForecasts.length }}</strong><small>{{ activeStrategies }} 个策略持续运行</small></article>
    </div>

    <div v-if="error" class="topic-error"><strong>实时数据暂不可用</strong><span>{{ error }}</span><button type="button" @click="loadSnapshot">重试</button></div>

    <div class="topic-chart-grid">
      <article class="topic-panel panel">
        <div class="topic-panel-title"><div><p>DEBT DISTRIBUTION</p><h3>候选债务规模</h3></div><span>实时债务</span></div>
        <div v-if="opportunities.length" class="profit-bars">
          <div v-for="item in topOpportunities" :key="item.id" class="profit-bar-row">
            <span>{{ item.protocol }}</span>
            <div><i :style="{ width: `${barWidth(item.debt)}%` }"></i></div>
            <strong>{{ usd(item.debt) }}</strong>
          </div>
        </div>
        <div v-else class="topic-empty">等待符合执行条件的候选地址。</div>
        <p class="topic-model-note">债务规模来自实时清算候选。是否可执行仍需在提交交易前复核抵押品、奖励、Gas 与链上流动性。</p>
      </article>

      <article class="topic-panel panel">
        <div class="topic-panel-title"><div><p>RISK · COLLATERAL MAP</p><h3>风险与规模分布</h3></div><span>HF × 债务</span></div>
        <svg class="risk-chart" viewBox="0 0 540 220" role="img" aria-label="候选健康因子与债务规模分布图">
          <title>候选健康因子与债务规模分布图</title>
          <line x1="50" y1="20" x2="50" y2="180" /><line x1="50" y1="180" x2="520" y2="180" />
          <line x1="50" y1="80" x2="520" y2="80" class="risk-grid" /><line x1="50" y1="130" x2="520" y2="130" class="risk-grid" />
          <text x="8" y="28">HF 1.03</text><text x="8" y="88">HF 1.00</text><text x="8" y="180">HF 0.95</text>
          <text x="50" y="207">较低债务</text><text x="442" y="207">较高债务</text>
          <circle v-for="item in plottedOpportunities" :key="item.id" :cx="riskX(item)" :cy="riskY(item)" :r="riskRadius(item)" :class="item.healthFactor < 1 ? 'critical' : 'watch'">
            <title>{{ item.walletShort }} · {{ item.protocol }} · HF {{ item.healthFactor.toFixed(4) }} · {{ usd(item.debt) }}</title>
          </circle>
        </svg>
        <div class="risk-legend"><span><i class="critical"></i>HF &lt; 1.00</span><span><i class="watch"></i>HF 1.00–1.03</span><span>圆点大小：债务规模</span></div>
      </article>
    </div>

    <div class="topic-chart-grid lower">
      <article class="topic-panel panel protocol-panel">
        <div class="topic-panel-title"><div><p>PROTOCOL EXPOSURE</p><h3>协议风险敞口</h3></div><span>{{ usd(totalDebtAtRisk) }} 合计</span></div>
        <div v-if="protocolForecasts.length" class="protocol-forecast-list">
          <div v-for="item in protocolForecasts" :key="item.protocol">
            <span>{{ item.protocol }} <small>{{ item.count }} 个候选</small></span>
            <div><i :style="{ width: `${barWidth(item.debt)}%` }"></i></div>
            <strong>{{ usd(item.debt) }}</strong>
          </div>
        </div>
        <div v-else class="topic-empty">暂无可计算的协议候选。</div>
      </article>

      <article class="topic-panel panel funnel-panel">
        <div class="topic-panel-title"><div><p>EXECUTION FUNNEL</p><h3>执行漏斗</h3></div><span>实时候选筛选</span></div>
        <div class="execution-funnel">
          <div><span>候选池</span><strong>{{ queue.length }}</strong></div>
          <i></i><div><span>风险触发</span><strong>{{ monitoredCount }}</strong></div>
          <i></i><div><span>可执行</span><strong>{{ opportunities.length }}</strong></div>
          <i></i><div><span>高优先级</span><strong>{{ criticalCount }}</strong></div>
        </div>
        <p class="topic-model-note">策略不会仅依据收益排序；链上可用性、抵押品流动性与交易成本仍需在实际提交前复核。</p>
      </article>
    </div>

    <article class="topic-opportunity-table panel">
      <div class="topic-panel-title"><div><p>PRIORITY EXECUTION QUEUE</p><h3>高优先级清算候选</h3></div><span>{{ opportunities.length }} 个实时候选</span></div>
      <div class="topic-table-wrap">
        <div class="topic-table-head"><span>协议 / 链</span><span>地址</span><span>健康因子</span><span>债务规模</span><span>候选状态</span><span>风险级别</span></div>
        <div v-for="item in topOpportunities" :key="item.id" class="topic-table-row">
          <span><strong>{{ item.protocol }}</strong><small>{{ item.chainLabel }}</small></span><span class="wallet">{{ item.walletShort }}</span><span :class="item.healthFactor < 1 ? 'danger' : 'amber'">{{ item.healthFactor.toFixed(4) }}</span><span>{{ usd(item.debt) }}</span><span>{{ item.status || "候选监控" }}</span><span><em :class="item.healthFactor < 1 ? 'critical-tag' : 'watch-tag'">{{ item.healthFactor < 1 ? "可执行" : "预警" }}</em></span>
        </div>
        <div v-if="!topOpportunities.length" class="topic-empty table-empty">暂无高优先级候选。</div>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
type QueueRow = { id: string; chain: string; chainLabel: string; wallet: string; walletShort: string; asset: string; protocol: string; healthFactor: string; debt: string; status: string };
type StrategyRow = { id: string; status: string };
type Opportunity = Omit<QueueRow, "healthFactor" | "debt"> & { healthFactor: number; debt: number };
const queue = ref<QueueRow[]>([]); const strategies = ref<StrategyRow[]>([]); const loading = ref(false); const error = ref(""); const updatedAt = ref("");
const AUTH_CODE_KEY = "superarb-auth-code-v1.6.5"; const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.5";

const opportunities = computed<Opportunity[]>(() => queue.value.map((row) => {
  const healthFactor = Number(row.healthFactor); const debt = money(row.debt);
  return { ...row, healthFactor: Number.isFinite(healthFactor) ? healthFactor : 9, debt };
}).filter((row) => row.debt > 0 && row.healthFactor < 1.03).sort((a, b) => b.debt - a.debt));
const topOpportunities = computed(() => opportunities.value.slice(0, 8));
const totalDebtAtRisk = computed(() => opportunities.value.reduce((total, item) => total + item.debt, 0));
const criticalCount = computed(() => opportunities.value.filter((item) => item.healthFactor < 1).length);
const monitoredCount = computed(() => queue.value.filter((item) => Number(item.healthFactor) < 1.03).length);
const activeStrategies = computed(() => strategies.value.filter((item) => /候选运行中|运行|可执行/i.test(item.status)).length);
const protocolForecasts = computed(() => Object.values(opportunities.value.reduce<Record<string, { protocol: string; count: number; debt: number }>>((groups, item) => { const key = item.protocol || "未知协议"; const current = groups[key] || { protocol: key, count: 0, debt: 0 }; current.count += 1; current.debt += item.debt; groups[key] = current; return groups; }, {})).sort((a, b) => b.debt - a.debt).slice(0, 6));
const plottedOpportunities = computed(() => topOpportunities.value.slice(0, 16));
const updatedLabel = computed(() => updatedAt.value ? `更新 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(updatedAt.value))}` : "等待实时数据");

onMounted(() => { if (props.active) void loadSnapshot(); }); watch(() => props.active, (active) => { if (active && !queue.value.length) void loadSnapshot(); });
async function loadSnapshot() { loading.value = true; error.value = ""; try { const response = await fetch("/api/latest-liquidations", { headers: snapshotHeaders(), cache: "no-store" }); const payload = await response.json() as { queue?: QueueRow[]; strategies?: StrategyRow[]; updatedAt?: string; message?: string }; if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`); queue.value = Array.isArray(payload.queue) ? payload.queue : []; strategies.value = Array.isArray(payload.strategies) ? payload.strategies : []; updatedAt.value = payload.updatedAt || new Date().toISOString(); } catch (caught) { error.value = caught instanceof Error ? caught.message : "无法读取清算候选数据。"; } finally { loading.value = false; } }
function snapshotHeaders() { const code = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim(); return { accept: "application/json", ...(code ? { "x-supermtnode-auth-code": code } : {}) }; }
function money(value: string) { const numeric = Number(String(value || "").replace(/[^\d.-]/g, "").replace(/,/g, "")); return Number.isFinite(numeric) ? Math.abs(numeric) : 0; }
function usd(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value); }
function barWidth(value: number) { const max = Math.max(...topOpportunities.value.map((item) => item.debt), ...protocolForecasts.value.map((item) => item.debt), 1); return Math.max(4, Math.round(value / max * 100)); }
function riskX(item: Opportunity) { const max = Math.max(...plottedOpportunities.value.map((value) => value.debt), 1); return 70 + item.debt / max * 420; }
function riskY(item: Opportunity) { return Math.max(28, Math.min(176, 80 + (item.healthFactor - 1) * 1100)); }
function riskRadius(item: Opportunity) { return Math.max(5, Math.min(16, 5 + Math.sqrt(item.debt) / 55)); }
</script>

<style scoped src="./LiquidationTopicView.css"></style>
