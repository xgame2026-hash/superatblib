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
            <h2>{{ t("topic.marketStatus") }}</h2>
          </div>
          <div class="topic-heading-actions">
            <span>{{ loading && sources.length === 0 ? t("dashboard.loading") : snapshotMeta }}</span>
            <button type="button" :disabled="loading" @click="refreshSnapshot">
              {{ loading ? t("dashboard.refreshing") : t("dashboard.refresh") }}
            </button>
          </div>
        </div>

        <p v-if="loading && sources.length === 0" class="topic-empty-state">{{ t("topic.readingSnapshot") }}</p>
        <div v-else-if="sources.length > 0" class="topic-source-grid">
          <article v-for="source in sources" :key="source.id" class="topic-source-card">
            <header class="topic-source-head">
              <img :src="chainIcon(source.chain)" alt="" aria-hidden="true" />
              <div>
                <strong>{{ source.chainLabel }}</strong>
                <span>{{ source.source }}</span>
              </div>
              <em :class="statusClass(source.status)">{{ displayStatus(source.status) }}</em>
            </header>
            <dl class="topic-source-metrics">
              <div>
                <dt>RPC</dt>
                <dd>{{ source.rpc }}</dd>
              </div>
              <div>
                <dt>{{ t("dashboard.candidateQueue") }}</dt>
                <dd>{{ source.queueCount }}</dd>
              </div>
              <div>
                <dt>{{ t("dashboard.snapshot") }}</dt>
                <dd>{{ source.liquidationCount }}</dd>
              </div>
              <div>
                <dt>{{ t("dashboard.updatedAt") }}</dt>
                <dd>{{ formatDateTime(source.updatedAt) }}</dd>
              </div>
            </dl>
          </article>
        </div>
        <p v-else class="topic-empty-state">{{ error || t("topic.waitingClassification") }}</p>
      </article>

      <aside class="panel topic-score-panel">
        <div class="topic-panel-heading">
          <div>
            <p class="topic-kicker">Strategy Matrix</p>
            <h2>{{ t("topic.strategyMatrix") }}</h2>
          </div>
        </div>
        <div v-if="sources.length > 0" class="topic-matrix-list">
          <div v-for="source in sources" :key="`${source.id}-matrix`" class="topic-matrix-row">
            <span>{{ source.chainLabel }}</span>
            <i><b :style="{ width: `${sourceWeight(source)}%` }"></b></i>
            <strong>{{ sourceWeight(source) }}%</strong>
          </div>
        </div>
        <p v-else class="topic-empty-state">{{ t("topic.noMatrix") }}</p>
      </aside>

      <article class="panel topic-strategy-panel">
        <div class="topic-panel-heading">
          <div>
            <p class="topic-kicker">Phase 1 Strategy</p>
            <h2>{{ t("topic.phaseStrategy") }}</h2>
          </div>
        </div>
        <div v-if="strategies.length > 0" class="topic-strategy-table">
          <div class="topic-strategy-head">
            <span>{{ t("wallet.chain") }}</span>
            <span>{{ t("topic.protocol") }}</span>
            <span>{{ t("topic.strategy") }}</span>
            <span>{{ t("topic.mode") }}</span>
            <span>{{ t("topic.candidate") }}</span>
            <span>{{ t("topic.status") }}</span>
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
            <em :class="statusClass(strategy.status)">{{ displayStatus(strategy.status) }}</em>
          </div>
        </div>
        <p v-else class="topic-empty-state">{{ t("topic.waitingRegistry") }}</p>
      </article>

    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import arbIcon from "../../img/arb.svg";
import bnbIcon from "../../img/bnb.svg";
import ethIcon from "../../img/eth.svg";
import { displayStatus, t } from "../../i18n";

const props = withDefaults(defineProps<{ active?: boolean }>(), {
  active: true,
});

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
const AUTH_CODE_KEY = "superarb-auth-code-v1.6.1";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.1";
const TOPIC_SNAPSHOT_CACHE_KEY = "liq2-liquidation-topic-snapshot-cache";
let snapshotRequested = false;

const summaryCards = computed(() => {
  const total = sources.value.length;
  const rpcReady = sources.value.filter((source) => source.rpc && source.rpc !== "--").length;
  const ready = strategies.value.filter((strategy) => isReadyStatus(strategy.status)).length;
  const executable = queue.value.filter((item) => /可执行|ready/i.test(item.status)).length;

  return [
    { label: t("topic.coveredMarkets"), value: String(total), note: total > 0 ? t("topic.snapshotService") : t("topic.waitingSnapshot"), tone: "market" },
    { label: t("topic.rpcMarket"), value: String(rpcReady), note: rpcReady > 0 ? t("topic.rpcReady") : t("topic.waitingRpc"), tone: "rpc" },
    { label: t("topic.strategyDeployment"), value: `${ready} / ${strategies.value.length}`, note: strategies.value.length > 0 ? t("topic.runningTotal") : t("topic.waitingStrategy"), tone: "node" },
    { label: t("dashboard.candidateQueue"), value: `${executable} / ${queue.value.length}`, note: queue.value.length > 0 ? t("topic.executableCandidate") : t("topic.waitingCandidate"), tone: "queue" },
  ];
});

const snapshotMeta = computed(() => (updatedAt.value ? t("dashboard.updated", { time: formatDateTime(updatedAt.value) }) : "RPC / Queue / Keeper"));

onMounted(() => {
  restoreSnapshotCache();
  if (props.active) void loadSnapshotOnce();
});

watch(
  () => props.active,
  (active) => {
    if (active) void loadSnapshotOnce();
  },
);

async function loadSnapshotOnce() {
  if (snapshotRequested) return;
  snapshotRequested = true;
  if (sources.value.length === 0) await loadSnapshot();
}

function refreshSnapshot() {
  snapshotRequested = true;
  void loadSnapshot();
}

async function loadSnapshot() {
  loading.value = true;
  error.value = "";

  try {
    const response = await fetch("/api/latest-liquidations", { headers: snapshotHeaders() });
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
    strategies.value = Array.isArray(payload.strategies) ? payload.strategies.map(normalizeStrategyRow) : [];
    updatedAt.value = payload.updatedAt ?? "";
    saveSnapshotCache();

    if (sources.value.length === 0 && payload.message) error.value = payload.message;
  } catch (cause) {
    if (sources.value.length === 0 && queue.value.length === 0 && strategies.value.length === 0) {
      sources.value = [];
      queue.value = [];
      strategies.value = [];
      updatedAt.value = "";
    }
    error.value = cause instanceof Error ? cause.message : t("topic.snapshotUnavailable");
  } finally {
    loading.value = false;
  }
}

function restoreSnapshotCache() {
  const raw = localStorage.getItem(scopedStorageKey(TOPIC_SNAPSHOT_CACHE_KEY));
  if (!raw) return;
  try {
    const cached = JSON.parse(raw) as { sources?: SourceRow[]; queue?: QueueRow[]; strategies?: StrategyRow[]; updatedAt?: string };
    if (!Array.isArray(cached.sources) || cached.sources.length === 0) return;
    sources.value = cached.sources;
    queue.value = Array.isArray(cached.queue) ? cached.queue : [];
    strategies.value = Array.isArray(cached.strategies) ? cached.strategies.map(normalizeStrategyRow) : [];
    updatedAt.value = cached.updatedAt ?? "";
    snapshotRequested = true;
    loading.value = false;
    error.value = "";
  } catch {
    localStorage.removeItem(scopedStorageKey(TOPIC_SNAPSHOT_CACHE_KEY));
  }
}

function saveSnapshotCache() {
  localStorage.setItem(
    scopedStorageKey(TOPIC_SNAPSHOT_CACHE_KEY),
    JSON.stringify({ sources: sources.value, queue: queue.value, strategies: strategies.value, updatedAt: updatedAt.value, savedAt: Date.now() }),
  );
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

function normalizeStrategyRow(strategy: StrategyRow): StrategyRow {
  return {
    ...strategy,
    status: normalizeStrategyStatus(strategy.status),
  };
}

function normalizeStrategyStatus(status: string) {
  return status.trim() === "RPC已接入" ? "候选运行中" : status;
}

function snapshotHeaders(): Record<string, string> {
  const authCode = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim();
  return {
    accept: "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode } : {}),
  };
}

function isReadyStatus(status: string) {
  return /运行|RPC 就绪|有候选|可执行|ready/i.test(status);
}

function modeLabel(mode: StrategyRow["mode"]) {
  if (mode === "execute") return t("liquidation.execute");
  if (mode === "monitor") return t("liquidation.monitor");
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
