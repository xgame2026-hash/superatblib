<template>
  <section class="liquidation-page">
    <div class="liquidation-left">
      <RpcUsagePanel :active="props.active" v-slot="{ metrics, formatRpcUsage, formatRpcStatus, refresh: refreshRpcUsage }">
        <WalletAssetsPanel :active="props.active" @refresh="handleWalletAssetsRefresh(refreshRpcUsage)">
          <template #rpc-usage="{ chain }">
            {{ formatRpcUsageDisplay(metrics[chain], formatRpcUsage, formatRpcStatus) }}
          </template>
        </WalletAssetsPanel>
      </RpcUsagePanel>

      <article class="panel market-control-panel">
        <div class="market-control">
          <label>
            <span>执行市场</span>
            <el-select v-model="market" :teleported="false" placement="bottom-start" :offset="6" popper-class="market-select-popper">
              <el-option
                v-for="item in marketOptions"
                :key="item.value"
                :disabled="item.disabled"
                :label="item.label"
                :value="item.value"
              >
                <span class="market-option">
                  <strong>{{ item.label }}</strong>
                  <em :class="`is-${item.apiTone}`">{{ item.apiStatus }}</em>
                </span>
              </el-option>
            </el-select>
          </label>
          <div class="market-buttons">
            <button :class="['run-button', { 'is-running': marketRunning }]" type="button" @click="startMarketExecution">
              <img v-if="marketRunning" class="run-state-icon" :src="runIcon" alt="" />
              <el-icon v-else><VideoPlay /></el-icon>
              {{ marketRunning ? "运行中" : "启动" }}
            </button>
            <button class="pause-button" type="button" @click="pauseMarketExecution">
              <el-icon><VideoPause /></el-icon>
              暂停
            </button>
          </div>
          <MarketMonitor class="market-monitor-field" :messages="monitorMessages" />
        </div>
      </article>

      <article class="panel terminal-panel">
        <div class="terminal-title">
          <span class="terminal-title-label">
            <img :src="tigsIcon" alt="" />
            执行终端
          </span>
        </div>
        <pre>{{ terminalText }}</pre>
      </article>
    </div>

    <article ref="opportunitiesPanel" class="panel opportunities-panel" :style="{ height: opportunitiesPanelHeight }">
      <div class="opportunity-snapshot">
        <div>
          <strong>全部市场快照</strong>
          <span>{{ allMarketSnapshotSummary }}</span>
        </div>
      </div>
      <div class="snapshot-refresh-progress" aria-hidden="true">
        <span :style="{ width: `${snapshotRefreshProgress}%` }"></span>
      </div>
      <div class="opportunity-table-shell">
        <table class="opportunity-table">
          <thead>
            <tr>
              <th>市场</th>
              <th>用户</th>
              <th>HF</th>
              <th>状态</th>
              <th>执行</th>
              <th>债务</th>
              <th>抵押</th>
              <th>毛利</th>
              <th>粗净利</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredCandidates" :key="item.accountFull">
              <td>{{ item.marketLabel }}</td>
              <td>
                <span class="account-cell">
                  <span class="account-short" :title="item.accountFull">{{ item.account }}</span>
                  <button
                    class="copy-account-button"
                    type="button"
                    title="复制完整地址"
                    aria-label="复制完整地址"
                    @click.stop="copyAccountAddress(item.accountFull)"
                  >
                    <el-icon><CopyDocument /></el-icon>
                  </button>
                </span>
              </td>
              <td :class="`hf-cell is-${item.hfTone}`">{{ item.hf }}</td>
              <td><span class="status-pill" :class="`is-${item.statusTone}`">{{ item.status }}</span></td>
              <td>{{ item.action }}</td>
              <td>{{ item.debt }}</td>
              <td>{{ item.collateral }}</td>
              <td>{{ item.gross }}</td>
              <td>{{ item.net }}</td>
            </tr>
            <tr v-if="filteredCandidates.length === 0">
              <td colspan="9" class="empty-cell">
                <div class="market-snapshot-empty">
                  <strong>全部市场快照</strong>
                  <span>{{ emptyCandidateText }}</span>
                  <div class="market-snapshot-stats">
                    <span v-for="item in currentMarketSnapshotStats" :key="item.label">
                      <b>{{ item.label }}</b>
                      {{ item.value }}
                    </span>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { CopyDocument, VideoPause, VideoPlay } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import runIcon from "../../img/run.svg";
import tigsIcon from "../../img/tigs.svg";
import MarketMonitor from "./MarketMonitor.vue";
import RpcUsagePanel from "./RpcUsagePanel.vue";
import WalletAssetsPanel from "./WalletAssetsPanel.vue";

const props = withDefaults(defineProps<{
  active?: boolean;
  startupDetectionMode?: string;
}>(), {
  active: true,
  startupDetectionMode: "manual",
});

const emit = defineEmits<{
  refresh: [];
  "launch-sound": [state: "launched" | "not-launched"];
}>();

type MarketValue = string;
type QueueState = "idle" | "queued" | "waiting" | "paused";
type MarketOption = {
  value: MarketValue;
  label: string;
  chain: string;
  apiStatus: string;
  apiTone: "ready" | "warn" | "neutral" | "locked";
  snapshotAge: string;
  queue: string;
  keeper: string;
  endpoint: string;
  executable: boolean;
  disabled?: boolean;
};
type RunningMarketSnapshot = {
  market: string;
  queueState: QueueState;
  option: MarketOption;
  updatedAt: string;
  walletAddress?: string;
  endpointSlug?: string;
  creditBurnPerSecond?: number | null;
};
type CandidateRow = {
  market: MarketValue;
  marketLabel: string;
  source: string;
  account: string;
  accountFull: string;
  hf: string;
  hfTone: "safe" | "warn" | "danger" | "neutral";
  status: string;
  statusTone: "safe" | "warn" | "danger" | "neutral" | "review" | "watch";
  action: string;
  debt: string;
  collateral: string;
  gross: string;
  net: string;
};

type ClientQueueStatusRow = {
  chain: string;
  chainLabel: string;
  inQueue: boolean;
  eligible: boolean;
  position: number | null;
  participantCount: number;
  active: boolean;
  status: string;
};

type ClientQueueStatusPayload = {
  ok?: boolean;
  participantCount?: number;
  rows?: ClientQueueStatusRow[];
};

type SnapshotQueueRow = {
  id?: string;
  chain: string;
  chainLabel?: string;
  wallet?: string;
  walletShort?: string;
  asset?: string;
  protocol?: string;
  source?: string;
  healthFactor?: string | number;
  debt?: string | number;
  debtSymbol?: string;
  collateralSymbol?: string;
  grossProfit?: string | number;
  netProfit?: string | number;
  status?: string;
  queueType?: string;
  endpointSlug?: string;
  endpointId?: string;
};

type SnapshotSourceRow = {
  chain: string;
  chainLabel?: string;
  source?: string;
  queueCount?: number;
  liquidationCount?: number;
  status?: string;
};

type RpcChainKey = "ethereum" | "bnb" | "arbitrum";

type RpcUsageMetric = {
  chain: RpcChainKey;
  rpcConfigured: boolean;
  requestCount: number | null;
  remainingRequests: number | null;
  requestLimit: number | null;
  status: "ok" | "missing_rpc" | "missing_credentials" | "unmatched" | "error";
  message?: string;
};

type SnapshotStrategyRow = {
  id: string;
  chain: string;
  chainLabel?: string;
  protocol: string;
  strategy: string;
  mode: "monitor" | "execute" | "stability_pool";
  rpc: string;
  status: string;
  statusTone?: "ready" | "standby" | "locked";
  queueCount?: number;
  liquidationCount?: number;
  updatedAt?: string;
};

type MarketSnapshotStat = {
  label: string;
  value: string;
};

const AUTH_CODE_KEY = "liq2-auth-code";
const AUTH_CODE_SESSION_KEY = "liq2-auth-code-session";
const unconfiguredMarket: MarketOption = {
  value: "unconfigured",
  label: "未配置执行市场",
  chain: "--",
  apiStatus: "未连接",
  apiTone: "neutral",
  snapshotAge: "--",
  queue: "Idle",
  keeper: "--",
  endpoint: "LIQUIDATION_SNAPSHOT_API_URL",
  executable: false,
  disabled: true,
};

const market = ref<MarketValue>("unconfigured");
const source = ref("策略扫描器");
const terminalLines = ref<string[]>([]);
const queueState = ref<QueueState>("idle");
const marketRunning = ref(false);
const queueMonitorRows = ref<ClientQueueStatusRow[]>(createEmptyClientQueueRows());
const candidateQueueRows = ref<SnapshotQueueRow[]>([]);
const snapshotSourceRows = ref<SnapshotSourceRow[]>([]);
const snapshotStrategyRows = ref<SnapshotStrategyRow[]>([]);
const queueMonitorParticipantCount = ref(0);
const opportunitiesPanel = ref<HTMLElement | null>(null);
const opportunitiesPanelHeight = ref("calc(100vh - 206px)");
const snapshotRefreshing = ref(false);
const snapshotRefreshProgress = ref(0);
const fallbackExecuteStrategies: SnapshotStrategyRow[] = [
  createFallbackExecuteStrategy("bnb-aave-v3-liquidation", "bnb", "BNB", "Aave V3", "BNB_RPC_URL"),
  createFallbackExecuteStrategy("bnb-venus-liquidation", "bnb", "BNB", "Venus", "BNB_RPC_URL"),
];

const marketOptions = computed<MarketOption[]>(() => {
  const options = snapshotStrategyRows.value.filter(isDisplayedMarketStrategy).filter(isBnbQueueStrategy).map((strategy) => strategyToMarketOption(strategy));
  return options.length > 0 ? options : fallbackExecuteStrategies.map((strategy) => strategyToMarketOption(strategy));
});
const currentMarket = computed(() => marketOptions.value.find((item) => item.value === market.value) ?? marketOptions.value[0] ?? unconfiguredMarket);
const currentMarketLabel = computed(() => currentMarket.value.label);
const snapshotMarketCount = computed(() => snapshotStrategyRows.value.filter(isDisplayedMarketStrategy).length || fallbackExecuteStrategies.length);
const allMarketSnapshotSummary = computed(() => `${candidateRows.value.length} 个候选 / ${snapshotMarketCount.value} 个市场`);
const queueStateText = computed(() => {
  if (queueState.value === "queued") return "已入队";
  if (queueState.value === "waiting") return "等待清算";
  if (queueState.value === "paused") return "已暂停";
  return currentMarket.value.queue;
});
const queueTone = computed(() => {
  if (queueState.value === "queued" || queueState.value === "waiting") return "ready";
  if (queueState.value === "paused") return "warn";
  return "neutral";
});
const monitorMessages = computed(() => {
  const candidateMessages = candidateQueueRows.value.slice(0, 8).map((row) => {
    const wallet = row.walletShort || shortAddress(row.wallet) || "--";
    const chain = row.chainLabel || normalizeChainLabel(row.chain);
    return `策略快照 ${chain}: ${wallet} / ${row.asset || "--"} / ${row.protocol || "--"} / ${row.status || "候选"}`;
  });
  const sourceMessages = snapshotSourceRows.value.map((row) => {
    const chain = row.chainLabel || normalizeChainLabel(row.chain);
    return `策略快照 ${chain}: ${row.source || "--"} / 候选 ${row.queueCount ?? 0} / 清算 ${row.liquidationCount ?? 0} / ${row.status || "--"}`;
  });
  const messages = [...candidateMessages, ...sourceMessages];
  return messages.length > 0 ? messages : [`${currentMarketLabel.value} 策略快照: 等待后端返回候选账户`];
});
const candidateQueueStatusText = computed(() => (candidateQueueRows.value.length > 0 ? `${candidateQueueRows.value.length} 个候选` : queueStateText.value));
const candidateRows = computed<CandidateRow[]>(() => candidateQueueRows.value.map(queueToCandidateRow));
const filteredCandidates = computed(() => {
  return candidateRows.value.filter((item) => {
    if (source.value !== "全部" && item.source !== source.value) return false;
    return true;
  });
});
const currentMarketSnapshotStats = computed<MarketSnapshotStat[]>(() => {
  const queueCount = snapshotStrategyRows.value.reduce((total, row) => total + (row.queueCount ?? 0), 0);
  const liquidationCount = snapshotStrategyRows.value.reduce((total, row) => total + (row.liquidationCount ?? 0), 0);
  const latestUpdatedAt = snapshotStrategyRows.value.map((row) => row.updatedAt).filter(Boolean).sort().at(-1);
  return [
    { label: "市场", value: `${snapshotMarketCount.value}` },
    { label: "候选", value: `${queueCount}` },
    { label: "清算", value: `${liquidationCount}` },
    { label: "更新", value: latestUpdatedAt ? formatSnapshotTime(latestUpdatedAt) : "--" },
    { label: "来源", value: snapshotSourceRows.value.map((row) => row.source).filter(Boolean)[0] || "策略扫描器" },
  ];
});
const emptyCandidateText = computed(() => {
  const hasSnapshot = snapshotStrategyRows.value.length > 0 || snapshotSourceRows.value.length > 0;
  if (hasSnapshot) return "当前快照没有返回可清算候选账户";
  return "等待后端返回清算市场快照";
});

const terminalText = computed(() => terminalLines.value.join("\n") || "等待执行输出");

function handleWalletAssetsRefresh(refreshRpcUsage: () => Promise<void> | void) {
  emit("refresh");
  void Promise.resolve(refreshRpcUsage());
}

function formatRpcUsageDisplay(
  metric: RpcUsageMetric | undefined,
  formatRpcUsage: (metric: RpcUsageMetric) => string,
  formatRpcStatus: (metric: RpcUsageMetric) => string,
) {
  if (!metric) return "--";
  const usage = formatRpcUsage(metric);
  return usage === "--" ? formatRpcStatus(metric) : usage;
}

let queueMonitorRefreshTimer = 0;
let candidateQueueRefreshTimer = 0;
let snapshotProgressTimer = 0;
let snapshotProgressStartedAt = 0;
let marketHeartbeatTimer = 0;
const SNAPSHOT_REFRESH_INTERVAL_MS = 10_000;
const MARKET_HEARTBEAT_INTERVAL_MS = 10_000;
let marketHeartbeatIntervalMs = MARKET_HEARTBEAT_INTERVAL_MS;
const RUNNING_MARKET_STORAGE_KEY = "liq2-running-market";
const OVERVIEW_REFRESH_EVENT = "liq2-overview-refresh";

onMounted(() => {
  flushStaleRunningMarketState();
  if (props.active) startVisiblePolling();
  void nextTick(updateOpportunitiesPanelHeight);
  window.addEventListener("resize", updateOpportunitiesPanelHeight);
  window.addEventListener("pagehide", handleClientStop);
  window.addEventListener("pageshow", handleClientResume);
  window.addEventListener("beforeunload", handleClientStop);
  window.addEventListener("offline", handleClientOffline);
});

watch(
  () => props.active,
  (active) => {
    if (active) {
      startVisiblePolling();
      void nextTick(updateOpportunitiesPanelHeight);
      return;
    }
    stopVisiblePolling();
  },
);

onBeforeUnmount(() => {
  stopVisiblePolling();
  handleClientStop();
  stopMarketHeartbeat();
  window.removeEventListener("resize", updateOpportunitiesPanelHeight);
  window.removeEventListener("pagehide", handleClientStop);
  window.removeEventListener("pageshow", handleClientResume);
  window.removeEventListener("beforeunload", handleClientStop);
  window.removeEventListener("offline", handleClientOffline);
});

function startVisiblePolling() {
  void loadQueueMonitorStatus();
  void loadCandidateQueueSnapshot();
  if (!queueMonitorRefreshTimer) queueMonitorRefreshTimer = window.setInterval(loadQueueMonitorStatus, 30_000);
  if (!candidateQueueRefreshTimer) candidateQueueRefreshTimer = window.setInterval(loadCandidateQueueSnapshot, 30_000);
  if (!snapshotProgressTimer) startSnapshotProgressTimer();
}

function stopVisiblePolling() {
  if (queueMonitorRefreshTimer) window.clearInterval(queueMonitorRefreshTimer);
  if (candidateQueueRefreshTimer) window.clearInterval(candidateQueueRefreshTimer);
  if (snapshotProgressTimer) window.clearInterval(snapshotProgressTimer);
  queueMonitorRefreshTimer = 0;
  candidateQueueRefreshTimer = 0;
  snapshotProgressTimer = 0;
}

async function startMarketExecution() {
  queueState.value = "waiting";
  marketRunning.value = true;
  setTerminalLines([`market selected: ${currentMarketLabel.value}`]);
  if (currentMarket.value.disabled || !currentMarket.value.executable) {
    queueState.value = "idle";
    marketRunning.value = false;
    appendTerminal(`market unavailable: ${currentMarket.value.apiStatus}`);
    emit("launch-sound", "not-launched");
    return;
  }
  appendTerminal(`snapshot source: ${currentMarket.value.endpoint}`);
  appendTerminal(`strategy status: ${currentMarket.value.apiStatus}`);
  try {
    const payload = await registerMarketQueueStart(currentMarket.value);
    queueState.value = payload.eligible === false ? "waiting" : "queued";
    appendTerminal(`queue registered: ${payload.chainLabel || normalizeChainLabel(payload.chain)} ${shortAddress(payload.walletAddress)}`);
    if (payload.transport === "http" && typeof payload.transportWarning === "string") {
      appendTerminal(`wss fallback: ${payload.transportWarning}`);
    }
    if (payload.remoteAvailable === false && typeof payload.warning === "string") appendTerminal(payload.warning);
    persistRunningMarketState(typeof payload.walletAddress === "string" ? payload.walletAddress : undefined, payload);
    startMarketHeartbeat(payload.heartbeatIntervalMs);
    emit("launch-sound", "launched");
    await loadQueueMonitorStatus();
    await loadCandidateQueueSnapshot();
  } catch (error) {
    queueState.value = "idle";
    marketRunning.value = false;
    clearRunningMarketState();
    const message = error instanceof Error ? error.message : "启动队列上报失败";
    appendTerminal(`queue register failed: ${message}`);
    notifyQueueError(message);
    emit("launch-sound", "not-launched");
  }
}

async function pauseMarketExecution() {
  const runningMarket = currentMarket.value;
  queueState.value = "paused";
  marketRunning.value = false;
  stopMarketHeartbeat();
  clearRunningMarketState();
  emit("launch-sound", "not-launched");
  if (!runningMarket.disabled) {
    try {
      await unregisterMarketQueue(runningMarket);
      appendTerminal(`queue unregistered: ${runningMarket.label}`);
      await loadQueueMonitorStatus();
      await loadCandidateQueueSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : "停止队列上报失败";
      appendTerminal(`queue unregister failed: ${message}`);
      ElMessage.error(message);
    }
  } else {
    appendTerminal(`no running market to pause: ${runningMarket.label}`);
  }
}

function appendTerminal(line: string) {
  terminalLines.value = [...terminalLines.value, `$ ${line}`].slice(-12);
}

function setTerminalLines(lines: string[]) {
  terminalLines.value = lines.map((line) => `$ ${line}`);
}

function startMarketHeartbeat(intervalMs: unknown = marketHeartbeatIntervalMs) {
  stopMarketHeartbeat();
  marketHeartbeatIntervalMs = normalizeHeartbeatIntervalMs(intervalMs);
  marketHeartbeatTimer = window.setInterval(() => {
    if (!marketRunning.value || currentMarket.value.disabled) return;
    void registerMarketQueueStart(currentMarket.value, "heartbeat")
      .then((payload) => {
        persistRunningMarketState(typeof payload.walletAddress === "string" ? payload.walletAddress : undefined);
        const nextInterval = normalizeHeartbeatIntervalMs(payload.heartbeatIntervalMs);
        if (nextInterval !== marketHeartbeatIntervalMs) startMarketHeartbeat(nextInterval);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "unknown error";
        appendTerminal(`queue heartbeat failed: ${message}`);
        if (isFatalQueueRuntimeError(message)) {
          marketRunning.value = false;
          queueState.value = "idle";
          stopMarketHeartbeat();
          clearRunningMarketState();
          notifyQueueError(message);
          emit("launch-sound", "not-launched");
        }
      });
  }, marketHeartbeatIntervalMs);
}

function normalizeHeartbeatIntervalMs(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 5_000 ? Math.min(parsed, 60_000) : MARKET_HEARTBEAT_INTERVAL_MS;
}

function stopMarketHeartbeat() {
  if (!marketHeartbeatTimer) return;
  window.clearInterval(marketHeartbeatTimer);
  marketHeartbeatTimer = 0;
}

async function unregisterMarketQueue(item: MarketOption): Promise<Record<string, any>> {
  return registerMarketQueueStart(item, "stop");
}

function persistRunningMarketState(walletAddress?: string, runtime?: Record<string, any>) {
  const option = currentMarket.value;
  if (option.disabled) return;
  const previous = readRunningMarketState();
  const nextState = {
    market: market.value,
    queueState: queueState.value,
    option,
    walletAddress: walletAddress || previous?.walletAddress || "",
    endpointSlug: typeof runtime?.endpointSlug === "string" ? runtime.endpointSlug : previous?.endpointSlug || "",
    creditBurnPerSecond: runtimeCreditBurn(runtime) ?? previous?.creditBurnPerSecond ?? null,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(
    RUNNING_MARKET_STORAGE_KEY,
    JSON.stringify(nextState),
  );
  window.dispatchEvent(new CustomEvent(OVERVIEW_REFRESH_EVENT, { detail: nextState }));
}

function runtimeCreditBurn(runtime?: Record<string, any>): number | null {
  if (typeof runtime?.creditBurnPerSecond === "number" && runtime.creditBurnPerSecond > 0) return runtime.creditBurnPerSecond;
  const plan = String(runtime?.rpcPlanType || "").toLowerCase();
  if (plan === "build") return 25;
  if (plan === "accelerate") return 50;
  if (plan === "scale") return 75;
  if (plan === "business") return 500;
  return null;
}

function restoreRunningMarketState() {
  const saved = readRunningMarketState();
  if (!saved) return;
  market.value = saved.market;
  queueState.value = saved.queueState === "waiting" ? "waiting" : "queued";
  marketRunning.value = true;
  setTerminalLines([`queue restored: ${saved.market}`, "startup detection: auto reconnect enabled"]);
  startMarketHeartbeat();
  void registerMarketQueueStart(saved.option, "heartbeat")
    .then((payload) => {
      persistRunningMarketState(typeof payload.walletAddress === "string" ? payload.walletAddress : undefined);
      void loadQueueMonitorStatus();
      void loadCandidateQueueSnapshot();
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "unknown error";
      appendTerminal(`auto reconnect failed: ${message}`);
      if (isFatalQueueRuntimeError(message)) {
        marketRunning.value = false;
        queueState.value = "idle";
        stopMarketHeartbeat();
        clearRunningMarketState();
        emit("launch-sound", "not-launched");
      }
    });
}

function clearRunningMarketState() {
  localStorage.removeItem(RUNNING_MARKET_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(OVERVIEW_REFRESH_EVENT, { detail: { stopped: true } }));
}

function readRunningMarketState(): RunningMarketSnapshot | null {
  const raw = localStorage.getItem(RUNNING_MARKET_STORAGE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as Partial<RunningMarketSnapshot>;
    if (!saved.market || !saved.option || saved.option.disabled) return null;
    return {
      market: saved.market,
      queueState: saved.queueState === "waiting" ? "waiting" : "queued",
      option: saved.option,
      walletAddress: typeof saved.walletAddress === "string" ? saved.walletAddress : "",
      updatedAt: saved.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function flushStaleRunningMarketState() {
  const saved = readRunningMarketState();
  if (saved) sendQueueStopBeacon(saved.option);
  clearRunningMarketState();
}

function handleClientOffline() {
  if (marketRunning.value && !currentMarket.value.disabled) sendQueueStopBeacon(currentMarket.value);
  queueState.value = "paused";
  marketRunning.value = false;
  stopMarketHeartbeat();
  clearRunningMarketState();
  appendTerminal("network offline: queue exit requested");
  emit("launch-sound", "not-launched");
}

function handleClientStop() {
  if (!marketRunning.value || currentMarket.value.disabled) return;
  sendQueueStopBeacon(currentMarket.value);
  marketRunning.value = false;
  queueState.value = "paused";
  stopMarketHeartbeat();
  clearRunningMarketState();
}

function handleClientResume() {
  clearRunningMarketState();
}

function sendQueueStopBeacon(item: MarketOption) {
  const body = JSON.stringify(queueRequestBody(item, "stop"));
  const authCode = readAuthCode();
  if (authCode) {
    void fetch("/api/liquidation-queue/status", {
      method: "POST",
      headers: authHeaders(authCode),
      body,
      keepalive: true,
    }).catch(() => {});
    return;
  }
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/liquidation-queue/status", blob)) return;
  }
  void fetch("/api/liquidation-queue/status", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

async function registerMarketQueueStart(item: MarketOption, action = "start"): Promise<Record<string, any>> {
  const authCode = readAuthCode();
  const response = await fetch("/api/liquidation-queue/status", {
    method: "POST",
    headers: authHeaders(authCode),
    body: JSON.stringify(queueRequestBody(item, action)),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok || payload.ok === false) {
    throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
  }
  return payload;
}

function queueRequestBody(item: MarketOption, action: string) {
  return {
    chain: normalizeChainKey(item.chain),
    protocol: item.label.split("/").pop()?.trim() || "",
    strategyId: item.value,
    action,
  };
}

async function loadQueueMonitorStatus(): Promise<void> {
  try {
    const authCode = readAuthCode();
    const response = await fetch(`/api/liquidation-queue/status?t=${Date.now()}`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(authCode ? { "x-supermtnode-auth-code": authCode } : {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as ClientQueueStatusPayload;
    queueMonitorRows.value = normalizeClientQueueRows(payload.rows);
    queueMonitorParticipantCount.value = payload.participantCount ?? maxClientQueueParticipants(queueMonitorRows.value);
  } catch {
    queueMonitorRows.value = createEmptyClientQueueRows("队列状态不可用");
    queueMonitorParticipantCount.value = 0;
  }
}

function readAuthCode(): string {
  return localStorage.getItem(AUTH_CODE_KEY)?.trim() || sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || "";
}

function authHeaders(authCode = readAuthCode()): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode } : {}),
  };
}

function isFatalQueueRuntimeError(message: string): boolean {
  return /SUPERMTNODE_APP_TOKEN|授权码|license|credits|RPC 未绑定|不能启动|已用完|exhausted|expired|过期|失效|HTTP 401|HTTP 403|unauthorized|forbidden|token/i.test(message);
}

function notifyQueueError(message: string) {
  if (isCredentialQueueRuntimeError(message)) return;
  ElMessage.error(message);
}

function isCredentialQueueRuntimeError(message: string): boolean {
  return /SUPERMTNODE_APP_TOKEN|授权码|license|token has been rotated|expired|过期|失效|HTTP 401|HTTP 403|unauthorized|forbidden|token/i.test(message);
}

async function loadCandidateQueueSnapshot(): Promise<void> {
  try {
    const response = await fetch(`/api/latest-liquidations?t=${Date.now()}`, {
      cache: "no-store",
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { queue?: SnapshotQueueRow[]; sources?: SnapshotSourceRow[]; strategies?: SnapshotStrategyRow[] };
    candidateQueueRows.value = Array.isArray(payload.queue) ? payload.queue.filter(isCandidateAccountRow) : [];
    snapshotSourceRows.value = Array.isArray(payload.sources) ? payload.sources : [];
    snapshotStrategyRows.value = Array.isArray(payload.strategies) ? payload.strategies.map(normalizeStrategyRow) : [];
    syncSelectedMarket();
  } catch {
    candidateQueueRows.value = [];
    snapshotSourceRows.value = [];
    snapshotStrategyRows.value = [];
    syncSelectedMarket();
  } finally {
    void nextTick(updateOpportunitiesPanelHeight);
  }
}

async function refreshCandidateSnapshot(): Promise<void> {
  snapshotRefreshing.value = true;
  try {
    await loadCandidateQueueSnapshot();
    await loadQueueMonitorStatus();
  } finally {
    snapshotRefreshing.value = false;
    resetSnapshotProgress();
  }
}

defineExpose({
  refreshCandidateSnapshot,
});

function startSnapshotProgressTimer() {
  resetSnapshotProgress();
  snapshotProgressTimer = window.setInterval(() => {
    const elapsed = Date.now() - snapshotProgressStartedAt;
    const nextProgress = Math.min(100, (elapsed / SNAPSHOT_REFRESH_INTERVAL_MS) * 100);
    snapshotRefreshProgress.value = nextProgress;
    if (nextProgress >= 100 && !snapshotRefreshing.value) void refreshCandidateSnapshot();
  }, 120);
}

function resetSnapshotProgress() {
  snapshotProgressStartedAt = Date.now();
  snapshotRefreshProgress.value = 0;
}

function updateOpportunitiesPanelHeight() {
  const panel = opportunitiesPanel.value;
  if (!panel) return;
  const footerHeight = 44;
  const bottomGap = 18;
  const minHeight = 420;
  const top = panel.getBoundingClientRect().top;
  const available = window.innerHeight - top - footerHeight - bottomGap;
  opportunitiesPanelHeight.value = `${Math.max(minHeight, Math.floor(available))}px`;
}

function syncSelectedMarket() {
  const options = marketOptions.value.filter((item) => !item.disabled);
  if (!options.some((item) => item.value === market.value)) {
    market.value = pickPreferredMarket(options)?.value ?? "unconfigured";
  }
}

function pickPreferredMarket(options: MarketOption[]) {
  return (
    options.find((item) => item.executable && /候选|可参与|运行|ready/i.test(item.apiStatus)) ??
    options.find((item) => item.executable && item.apiTone === "ready") ??
    options.find((item) => /候选|可参与|运行|ready/i.test(item.apiStatus)) ??
    options.find((item) => item.apiTone === "neutral") ??
    options[0]
  );
}

function createFallbackExecuteStrategy(id: string, chain: string, chainLabel: string, protocol: string, rpc: string): SnapshotStrategyRow {
  return {
    id,
    chain,
    chainLabel,
    protocol,
    strategy: "本地执行市场",
    mode: "execute",
    rpc,
    status: "候选运行中",
    statusTone: "ready",
    queueCount: 0,
    liquidationCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

function isCandidateStrategy(strategy: SnapshotStrategyRow) {
  const status = strategy.status || "";
  if ((strategy.queueCount ?? 0) > 0 || /候选|可执行|运行|ready/i.test(status)) return true;
  return strategy.mode === "execute" && !/待部署|未连接|offline/i.test(status);
}

function isDisplayedMarketStrategy(strategy: SnapshotStrategyRow) {
  if (isCandidateStrategy(strategy)) return true;
  return /aave|morpho|spark|venus|compound|liquity/i.test(strategy.protocol);
}

function isBnbQueueStrategy(strategy: SnapshotStrategyRow) {
  return normalizeChainKey(strategy.chain) === "bnb" && strategy.mode === "execute";
}

function strategyToMarketOption(strategy: SnapshotStrategyRow): MarketOption {
  const chain = strategy.chainLabel || normalizeChainLabel(strategy.chain);
  const queueCount = strategy.queueCount ?? 0;
  const status = strategy.status || "候选运行中";
  const runnable = strategy.mode === "execute" && !/待部署|未连接|offline/i.test(status);
  const selectable = !/未连接|offline/i.test(status);
  return {
    value: strategy.id,
    label: `${chain} / ${strategy.protocol}`,
    chain,
    apiStatus: status,
    apiTone: strategyTone(status, strategy.statusTone),
    snapshotAge: strategy.updatedAt ? formatSnapshotTime(strategy.updatedAt) : "--",
    queue: queueCount > 0 ? `${queueCount} 个候选` : status,
    keeper: modeLabel(strategy.mode),
    endpoint: strategy.rpc || "--",
    executable: runnable,
    disabled: !selectable,
  };
}

function normalizeStrategyRow(strategy: SnapshotStrategyRow): SnapshotStrategyRow {
  return {
    ...strategy,
    status: normalizeStrategyStatus(strategy.status || ""),
    statusTone: normalizeStrategyStatus(strategy.status || "") === "候选运行中" ? "ready" : strategy.statusTone,
  };
}

function normalizeStrategyStatus(status: string) {
  return status.trim() === "RPC已接入" ? "候选运行中" : status;
}

function strategyTone(status: string, tone?: SnapshotStrategyRow["statusTone"]): MarketOption["apiTone"] {
  if (tone === "ready") return "ready";
  if (tone === "locked") return "locked";
  if (/候选|可执行|运行|ready/i.test(status)) return "ready";
  if (/待部署|未连接|offline/i.test(status)) return "locked";
  if (/待|暂停|warn/i.test(status)) return "warn";
  return "neutral";
}

function modeLabel(mode: SnapshotStrategyRow["mode"]) {
  if (mode === "monitor") return "监听";
  if (mode === "stability_pool") return "SP";
  return "执行";
}

function queueToCandidateRow(row: SnapshotQueueRow): CandidateRow {
  const hf = detailValue(row.healthFactor, "待扫描");
  const riskTone = hfRiskTone(hf);
  const status = statusLabel(row.status, riskTone);
  const accountFull = row.wallet || row.walletShort || "--";
  const marketId = strategyIdForQueue(row);
  return {
    market: marketId,
    marketLabel: marketLabelForQueue(row, marketId),
    source: sourceLabel(row.source),
    account: row.walletShort || shortAddress(row.wallet) || "--",
    accountFull,
    hf,
    hfTone: riskTone,
    status,
    statusTone: statusTone(status, riskTone),
    action: actionLabel(status, riskTone),
    debt: formatDebtValue(row.debt, row.debtSymbol),
    collateral: formatCollateralValue(row.collateralSymbol, row.asset),
    gross: formatUsdValue(row.grossProfit, "待估算"),
    net: formatUsdValue(row.netProfit, "待估算"),
  };
}

function isCandidateAccountRow(row: SnapshotQueueRow) {
  const source = (row.source || "").toLowerCase();
  const queueType = (row.queueType || "").toLowerCase();
  const id = (row.id || "").toLowerCase();
  if (source.includes("rpc-queue") || source.includes("client-queue") || source.includes("endpoint-queue")) return false;
  if (queueType.includes("client") || queueType.includes("endpoint")) return false;
  if (id.startsWith("endpoint-start:")) return false;
  if (row.endpointSlug || row.endpointId) return false;
  return Boolean(row.healthFactor && row.healthFactor !== "--") || /scanner|strategy|scan|策略/i.test(row.source || "");
}

async function copyAccountAddress(address: string) {
  if (!address || address === "--") return;
  try {
    await navigator.clipboard.writeText(address);
    ElMessage.success("复制成功");
  } catch {
    const input = document.createElement("textarea");
    input.value = address;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(input);
    if (copied) ElMessage.success("复制成功");
  }
}

function hfRiskTone(value: string): CandidateRow["hfTone"] {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "neutral";
  if (numeric < 1) return "danger";
  if (numeric <= 1.05) return "warn";
  return "safe";
}

function statusLabel(status: string | undefined, tone: CandidateRow["hfTone"]) {
  if (tone === "danger") return "危险";
  if (tone === "warn") return "高风险";
  if (tone === "safe") return "安全";
  return status || "候选";
}

function statusTone(status: string, tone: CandidateRow["hfTone"]): CandidateRow["statusTone"] {
  if (tone === "danger" || /危险|可清算/i.test(status)) return "danger";
  if (tone === "warn" || /高风险|预警/i.test(status)) return "warn";
  if (tone === "safe" || /安全/i.test(status)) return "safe";
  if (/可执行|排队|候选/i.test(status)) return "review";
  return "watch";
}

function actionLabel(status: string, tone: CandidateRow["hfTone"]) {
  if (tone === "danger" || /可清算|危险/i.test(status)) return "可执行";
  if (tone === "warn" || /高风险|预警/i.test(status)) return "预警";
  if (tone === "safe") return "监听";
  return "等待";
}

function sourceLabel(value?: string) {
  if (/scanner|strategy|scan|snapshot|public|aave|策略/i.test(value || "")) return "策略扫描器";
  return "节点接口";
}

function detailValue(value: string | number | undefined, fallback: string) {
  if (!value || value === "--") return fallback;
  return String(value);
}

function formatDebtValue(value: string | number | undefined, symbol?: string) {
  const detail = detailValue(value, "待扫描");
  if (detail === "待扫描" || !symbol) return detail;
  return `${detail} ${symbol}`;
}

function formatCollateralValue(value: string | number | undefined, fallback?: string) {
  const detail = detailValue(value, fallback || "--");
  if (detail === "--") return detail;
  const numeric = Number(detail.replace(/,/g, ""));
  return Number.isFinite(numeric) ? formatUsdValue(detail, "--") : detail;
}

function formatUsdValue(value: string | number | undefined, fallback: string) {
  const detail = detailValue(value, fallback);
  if (detail === fallback || detail.startsWith("$")) return detail;
  return `$${detail}`;
}

function strategyIdForQueue(row: SnapshotQueueRow) {
  const chain = normalizeChainKey(row.chain);
  const protocol = normalizeProtocolKey(row.protocol || "");
  const match = snapshotStrategyRows.value.find((strategy) => normalizeChainKey(strategy.chain) === chain && normalizeProtocolKey(strategy.protocol) === protocol);
  return match?.id || `${chain}-${protocol.replace(/[^a-z0-9]+/g, "-")}`;
}

function marketLabelForQueue(row: SnapshotQueueRow, marketId: string) {
  const option = marketOptions.value.find((item) => item.value === marketId);
  if (option) return option.label;
  const chain = row.chainLabel || normalizeChainLabel(row.chain);
  const protocol = row.protocol || "--";
  return `${chain} / ${protocol}`;
}

function normalizeProtocolKey(protocol: string) {
  const normalized = protocol.trim().toLowerCase();
  if (normalized.includes("aave")) return "aave-v3";
  if (normalized.includes("morpho")) return "morpho-blue";
  if (normalized.includes("spark")) return "spark";
  if (normalized.includes("venus")) return "venus";
  if (normalized.includes("compound")) return normalized.includes("v3") ? "compound-v3" : "compound-v2-fork";
  if (normalized.includes("liquity")) return "liquity-v2";
  return normalized;
}

function normalizeClientQueueRows(rows: ClientQueueStatusRow[] | undefined) {
  const defaults = createEmptyClientQueueRows();
  if (!Array.isArray(rows) || rows.length === 0) return defaults;
  const byChain = new Map(rows.map((row) => [normalizeChainKey(row.chain), row]));
  return defaults.map((fallback) => ({
    ...fallback,
    ...byChain.get(normalizeChainKey(fallback.chain)),
  }));
}

function createEmptyClientQueueRows(status = "等待队列状态"): ClientQueueStatusRow[] {
  return [
    createEmptyClientQueueRow("ethereum", "ETH", status),
    createEmptyClientQueueRow("bnb", "BNB", status),
    createEmptyClientQueueRow("arbitrum", "ARB", status),
  ];
}

function createEmptyClientQueueRow(chain: string, chainLabel: string, status: string): ClientQueueStatusRow {
  return {
    chain,
    chainLabel,
    inQueue: false,
    eligible: false,
    position: null,
    participantCount: 0,
    active: false,
    status,
  };
}

function normalizeChainKey(chain: string) {
  const normalized = (chain || "").toLowerCase();
  if (normalized.includes("bnb") || normalized.includes("bsc")) return "bnb";
  if (normalized.includes("arb")) return "arbitrum";
  return "ethereum";
}

function maxClientQueueParticipants(rows: ClientQueueStatusRow[]) {
  return rows.reduce((max, row) => Math.max(max, row.participantCount), 0);
}

function normalizeChainLabel(chain?: string) {
  const normalized = (chain || "").toLowerCase();
  if (normalized.includes("bnb") || normalized.includes("bsc")) return "BNB";
  if (normalized.includes("arb")) return "ARB";
  return "ETH";
}

function shortAddress(value?: string) {
  if (!value) return "";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function formatSnapshotTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
</script>

<style scoped src="./LiquidationView.css"></style>
