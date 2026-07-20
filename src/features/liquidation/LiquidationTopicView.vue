<template>
  <section class="liquidation-topic">
    <section class="topic-main-grid">
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
import { onMounted, ref, watch } from "vue";
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
const AUTH_CODE_KEY = "superarb-auth-code-v1.6.5";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.5";
const TOPIC_SNAPSHOT_CACHE_KEY = "liq2-liquidation-topic-snapshot-cache";
let snapshotRequested = false;

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

function modeLabel(mode: StrategyRow["mode"]) {
  if (mode === "execute") return t("liquidation.execute");
  if (mode === "monitor") return t("liquidation.monitor");
  if (mode === "stability_pool") return "SP";
  return mode || "--";
}

</script>

<style scoped src="./LiquidationTopicView.css"></style>
