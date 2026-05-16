<template>
  <section class="liquidation-topic">
    <div class="topic-summary-grid">
      <article v-for="item in summaryCards" :key="item.label" class="topic-summary-card" :class="`is-${item.tone}`">
        <div class="topic-summary-head">
          <span>{{ item.label }}</span>
          <i aria-hidden="true"></i>
        </div>
        <div class="topic-summary-body">
          <strong>{{ item.value }}</strong>
          <small>{{ item.note }}</small>
        </div>
      </article>
    </div>

    <section class="topic-main-grid">
      <article class="panel topic-classification-panel">
        <div class="topic-panel-heading">
          <div>
            <p class="topic-kicker">Market Classification</p>
            <h2>可接入市场状态</h2>
          </div>
          <span>{{ snapshotMeta }}</span>
        </div>

        <p v-if="loading" class="topic-empty-state">正在读取策略快照服务。</p>
        <div v-else-if="sources.length > 0" class="topic-source-grid">
          <article v-for="source in sources" :key="source.id" class="topic-source-card">
            <header class="topic-source-head">
              <img :src="chainIcon(source.chain)" alt="" aria-hidden="true" />
              <div>
                <strong>{{ source.chainLabel }}</strong>
                <span>{{ source.source }}</span>
              </div>
              <em :class="statusClass(source.status)">{{ source.status }}</em>
            </header>
            <dl class="topic-source-metrics">
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
        <p v-else class="topic-empty-state">{{ error || "等待策略快照服务返回市场分类。" }}</p>
      </article>

      <aside class="panel topic-score-panel">
        <div class="topic-panel-heading">
          <div>
            <p class="topic-kicker">Strategy Matrix</p>
            <h2>策略优先级矩阵</h2>
          </div>
        </div>
        <div v-if="sources.length > 0" class="topic-matrix-list">
          <div v-for="source in sources" :key="`${source.id}-matrix`" class="topic-matrix-row">
            <span>{{ source.chainLabel }}</span>
            <i><b :style="{ width: `${sourceWeight(source)}%` }"></b></i>
            <strong>{{ sourceWeight(source) }}%</strong>
          </div>
        </div>
        <p v-else class="topic-empty-state">暂无策略矩阵数据。</p>
      </aside>

      <article class="panel topic-strategy-panel">
        <div class="topic-panel-heading">
          <div>
            <p class="topic-kicker">Phase 1 Strategy</p>
            <h2>第一期策略部署</h2>
          </div>
        </div>
        <div v-if="strategies.length > 0" class="topic-strategy-table">
          <div class="topic-strategy-head">
            <span>链</span>
            <span>协议</span>
            <span>策略</span>
            <span>模式</span>
            <span>候选</span>
            <span>状态</span>
          </div>
          <div v-for="strategy in strategies" :key="strategy.id" class="topic-strategy-row">
            <span class="topic-chain-cell">
              <img :src="chainIcon(strategy.chain)" alt="" aria-hidden="true" />
              {{ strategy.chainLabel }}
            </span>
            <strong>{{ strategy.protocol }}</strong>
            <span>{{ strategy.strategy }}</span>
            <span>{{ modeLabel(strategy.mode) }}</span>
            <span>{{ strategy.queueCount }}</span>
            <em :class="statusClass(strategy.status)">{{ strategy.status }}</em>
          </div>
        </div>
        <p v-else class="topic-empty-state">等待第一期策略注册表。</p>
      </article>

    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import arbIcon from "../../img/arb.svg";
import bnbIcon from "../../img/bnb.svg";
import ethIcon from "../../img/eth.svg";

type ChainKey = "ethereum" | "eth" | "bnb" | "arbitrum" | "arb" | string;

type SourceRow = {
  id: string;
  chain: ChainKey;
  chainLabel: string;
  source: string;
  rpc: string;
  queueCount: number;
  liquidationCount: number;
  protocolCount: number;
  status: string;
  updatedAt: string;
};

type QueueRow = {
  id: string;
  chain: ChainKey;
  chainLabel: string;
  wallet: string;
  walletShort: string;
  asset: string;
  protocol: string;
  rpc: string;
  healthFactor: string;
  debt: string;
  status: string;
  source: string;
  updatedAt: string;
};

type StrategyRow = {
  id: string;
  chain: ChainKey;
  chainLabel: string;
  protocol: string;
  strategy: string;
  mode: "monitor" | "execute" | "stability_pool" | string;
  queueCount: number;
  liquidationCount: number;
  status: string;
  updatedAt: string;
};

const loading = ref(true);
const error = ref("");
const sources = ref<SourceRow[]>([]);
const queue = ref<QueueRow[]>([]);
const strategies = ref<StrategyRow[]>([]);
const updatedAt = ref("");

const summaryCards = computed(() => {
  const total = sources.value.length;
  const rpcReady = sources.value.filter((source) => source.rpc && source.rpc !== "--").length;
  const ready = strategies.value.filter((strategy) => isReadyStatus(strategy.status)).length;
  const executable = queue.value.filter((item) => /可执行|ready/i.test(item.status)).length;

  return [
    { label: "覆盖市场", value: String(total), note: total > 0 ? "策略快照服务" : "等待快照", tone: "market" },
    { label: "RPC 市场", value: String(rpcReady), note: rpcReady > 0 ? "已接入 RPC 队列" : "等待 RPC", tone: "rpc" },
    { label: "策略部署", value: `${ready} / ${strategies.value.length}`, note: strategies.value.length > 0 ? "运行 / 总策略" : "等待策略", tone: "node" },
    { label: "候选队列", value: `${executable} / ${queue.value.length}`, note: queue.value.length > 0 ? "可执行 / 候选" : "等待候选", tone: "queue" },
  ];
});

const snapshotMeta = computed(() => (updatedAt.value ? `更新 ${formatDateTime(updatedAt.value)}` : "RPC / Queue / Keeper"));

onMounted(() => {
  void loadSnapshot();
});

async function loadSnapshot() {
  loading.value = true;
  error.value = "";

  try {
    const response = await fetch("/api/latest-liquidations", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = (await response.json()) as {
      message?: string;
      sources?: SourceRow[];
      queue?: QueueRow[];
      strategies?: StrategyRow[];
      updatedAt?: string;
    };

    sources.value = Array.isArray(payload.sources) ? payload.sources : [];
    queue.value = Array.isArray(payload.queue) ? payload.queue : [];
    strategies.value = Array.isArray(payload.strategies) ? payload.strategies : [];
    updatedAt.value = payload.updatedAt ?? "";

    if (sources.value.length === 0 && payload.message) error.value = payload.message;
  } catch (cause) {
    sources.value = [];
    queue.value = [];
    strategies.value = [];
    updatedAt.value = "";
    error.value = cause instanceof Error ? cause.message : "快照服务不可用";
  } finally {
    loading.value = false;
  }
}

function chainIcon(chain: ChainKey) {
  const value = String(chain).toLowerCase();
  if (value.includes("bnb")) return bnbIcon;
  if (value.includes("arb")) return arbIcon;
  return ethIcon;
}

function statusClass(status: string) {
  if (/可执行|就绪|候选|ready/i.test(status)) return "is-ready";
  if (/待|standby|部署|排队|接入/i.test(status)) return "is-standby";
  return "is-locked";
}

function isReadyStatus(status: string) {
  return /运行|RPC 就绪|有候选|可执行|ready/i.test(status);
}

function modeLabel(mode: StrategyRow["mode"]) {
  if (mode === "execute") return "执行";
  if (mode === "monitor") return "监听";
  if (mode === "stability_pool") return "SP";
  return mode || "--";
}

function sourceWeight(source: SourceRow) {
  const rpcWeight = source.rpc && source.rpc !== "--" ? 30 : 0;
  const queueWeight = Math.min(source.queueCount * 25, 60);
  const liquidationWeight = Math.min(source.liquidationCount * 12, 30);
  return Math.min(100, rpcWeight + queueWeight + liquidationWeight);
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value || "--";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString();
  return `${local.slice(0, 10).replaceAll("-", "/")} ${local.slice(11, 19)}`;
}
</script>

<style scoped src="./LiquidationTopicView.css"></style>
