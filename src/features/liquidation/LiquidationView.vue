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
            <button :class="['run-button', { 'is-running': marketRunning }]" type="button" :disabled="marketRunning" @click="startMarketExecution">
              <img v-if="marketRunning" class="run-state-icon" :src="runIcon" alt="" />
              <el-icon v-else><VideoPlay /></el-icon>
              {{ marketRunning ? "运行中" : "启动" }}
            </button>
            <button class="pause-button" type="button" :disabled="!marketRunning" @click="pauseMarketExecution">
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

    <AllMarketSnapshot ref="marketSnapshotRef" @strategies-updated="handleSnapshotStrategiesUpdated" />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { VideoPause, VideoPlay } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import runIcon from "../../img/run.svg";
import tigsIcon from "../../img/tigs.svg";
import AllMarketSnapshot from "./AllMarketSnapshot.vue";
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

const AUTH_CODE_KEY = "superarb-auth-code-v1.5.3";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.5.3";
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
const terminalLines = ref<string[]>([]);
const queueState = ref<QueueState>("idle");
const marketRunning = ref(false);
const queueMonitorRows = ref<ClientQueueStatusRow[]>(createEmptyClientQueueRows());
const snapshotStrategyRows = ref<SnapshotStrategyRow[]>([]);
const queueMonitorParticipantCount = ref(0);
const marketSnapshotRef = ref<{ refreshMarketSnapshot: () => Promise<void> } | null>(null);
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
const queueStateText = computed(() => {
  if (queueState.value === "queued") return "已入队";
  if (queueState.value === "waiting") return "等待清算";
  if (queueState.value === "paused") return "已暂停";
  return currentMarket.value.queue;
});
const monitorMessages = computed(() => {
  return [`${currentMarketLabel.value}: ${queueStateText.value}`];
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
let marketHeartbeatTimer = 0;
let marketHeartbeatInFlight = false;
let marketHeartbeatFailureCount = 0;
let marketStartIntentId = "";
const MARKET_HEARTBEAT_INTERVAL_MS = 30_000;
const MARKET_HEARTBEAT_MAX_FAILURES = 6;
let marketHeartbeatIntervalMs = MARKET_HEARTBEAT_INTERVAL_MS;
const RUNNING_MARKET_STORAGE_KEY = "liq2-running-market";
const RUNNING_MARKET_RESTORE_WINDOW_MS = 5 * 60_000;
const QUEUE_REQUEST_TIMEOUT_MS = 20_000;
const OVERVIEW_REFRESH_EVENT = "liq2-overview-refresh";

onMounted(() => {
  restoreRecentRunningMarketState();
  if (props.active) startVisiblePolling();
  window.addEventListener("offline", handleClientOffline);
  window.addEventListener("online", handleClientOnline);
  window.addEventListener("visibilitychange", handleVisibilityHeartbeat);
  window.addEventListener("pageshow", handleClientOnline);
  window.addEventListener("pagehide", handleClientUnload);
  window.addEventListener("beforeunload", handleClientUnload);
});

watch(
  () => props.active,
  (active) => {
    if (active) {
      startVisiblePolling();
      return;
    }
    stopVisiblePolling();
  },
);

onBeforeUnmount(() => {
  stopVisiblePolling();
  stopMarketHeartbeat();
  window.removeEventListener("offline", handleClientOffline);
  window.removeEventListener("online", handleClientOnline);
  window.removeEventListener("visibilitychange", handleVisibilityHeartbeat);
  window.removeEventListener("pageshow", handleClientOnline);
  window.removeEventListener("pagehide", handleClientUnload);
  window.removeEventListener("beforeunload", handleClientUnload);
});

function startVisiblePolling() {
  void loadQueueMonitorStatus();
  if (!queueMonitorRefreshTimer) queueMonitorRefreshTimer = window.setInterval(loadQueueMonitorStatus, 30_000);
}

function stopVisiblePolling() {
  if (queueMonitorRefreshTimer) window.clearInterval(queueMonitorRefreshTimer);
  queueMonitorRefreshTimer = 0;
}

async function startMarketExecution() {
  marketStartIntentId = createQueueStartIntentId();
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
  appendTerminal("正在进入队列");
  try {
    const payload = await registerMarketQueueStart(currentMarket.value);
    queueState.value = payload.eligible === false ? "waiting" : "queued";
    appendTerminal(`排队成功: ${displayQueueId(payload)}`);
    appendTerminal(`queue registered: ${payload.chainLabel || normalizeChainLabel(payload.chain)} ${shortAddress(payload.walletAddress)}`);
    if (payload.transport === "http" && typeof payload.transportWarning === "string") {
      appendTerminal(`private sync: ${payload.transportWarning}`);
    }
    if (typeof payload.remoteQueueWarning === "string") appendTerminal(payload.remoteQueueWarning);
    if (payload.remoteAvailable === false && typeof payload.warning === "string") appendTerminal(payload.warning);
    persistRunningMarketState(typeof payload.walletAddress === "string" ? payload.walletAddress : undefined, payload);
    startMarketHeartbeat(payload.heartbeatIntervalMs);
    emit("launch-sound", "launched");
    await loadQueueMonitorStatus();
    await refreshMarketSnapshotDisplay();
  } catch (error) {
    marketStartIntentId = "";
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
      appendTerminal(`队列已暂停: ${runningMarket.label}`);
      await loadQueueMonitorStatus();
      await refreshMarketSnapshotDisplay();
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
  marketHeartbeatFailureCount = 0;
  marketHeartbeatTimer = window.setInterval(() => {
    void sendMarketHeartbeat();
  }, marketHeartbeatIntervalMs);
}

function resumeMarketHeartbeat() {
  if (!marketHeartbeatTimer) startMarketHeartbeat(marketHeartbeatIntervalMs);
}

async function sendMarketHeartbeat() {
  if (!marketRunning.value || currentMarket.value.disabled || marketHeartbeatInFlight) return;
  marketHeartbeatInFlight = true;
  try {
    const payload = await registerMarketQueueStart(currentMarket.value, "heartbeat");
    marketHeartbeatFailureCount = 0;
    queueState.value = payload.eligible === false ? "waiting" : "queued";
    persistRunningMarketState(typeof payload.walletAddress === "string" ? payload.walletAddress : undefined, payload);
    const nextInterval = normalizeHeartbeatIntervalMs(payload.heartbeatIntervalMs);
    if (nextInterval !== marketHeartbeatIntervalMs) startMarketHeartbeat(nextInterval);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    marketHeartbeatFailureCount += 1;
    appendTerminal(`queue heartbeat failed (${marketHeartbeatFailureCount}/${MARKET_HEARTBEAT_MAX_FAILURES}): ${message}`);
    if (isRecoverableHeartbeatError(message) && marketHeartbeatFailureCount < MARKET_HEARTBEAT_MAX_FAILURES) return;
    if (isFatalQueueRuntimeError(message)) {
      sendQueueStopBeacon(currentMarket.value);
      marketRunning.value = false;
      queueState.value = "idle";
      stopMarketHeartbeat();
      clearRunningMarketState();
      notifyQueueError(message);
      emit("launch-sound", "not-launched");
    }
  } finally {
    marketHeartbeatInFlight = false;
  }
}

function normalizeHeartbeatIntervalMs(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 10_000 ? Math.min(parsed, 60_000) : MARKET_HEARTBEAT_INTERVAL_MS;
}

function stopMarketHeartbeat() {
  if (!marketHeartbeatTimer) return;
  window.clearInterval(marketHeartbeatTimer);
  marketHeartbeatTimer = 0;
  marketHeartbeatInFlight = false;
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

function displayQueueId(payload: Record<string, any>) {
  const queueId = String(payload.queueId || payload.participantId || payload.remoteQueueParticipantId || payload.queue?.queueId || payload.queue?.participantId || "");
  const walletAddress = String(payload.walletAddress || payload.wallet_address || payload.queue?.walletAddress || payload.queue?.wallet_address || "");
  if (walletAddress) return `${String(payload.chain || payload.queue?.chain || "bnb").toLowerCase()}:${queueWalletTail8(walletAddress)}`;
  if (!queueId) return "--";
  const parts = queueId.split(":");
  if (parts[0] === "license-token-wallet" && parts.length >= 5) {
    const [, chain, , , wallet] = parts;
    return `${chain}:${queueWalletTail8(wallet)}`;
  }
  if (parts[0] === "license-token-wallet" && parts.length >= 4) {
    const [, chain, , wallet] = parts;
    return `${chain}:${queueWalletTail8(wallet)}`;
  }
  return queueId.length > 36 ? `${queueId.slice(0, 16)}...${queueId.slice(-10)}` : queueId;
}

function queueWalletTail8(value: string): string {
  return value.replace(/^0x/i, "").slice(-8);
}

function restoreRunningMarketState() {
  const saved = readRunningMarketState();
  if (!saved) return;
  market.value = saved.market;
  queueState.value = "waiting";
  marketRunning.value = false;
  marketStartIntentId = createQueueStartIntentId();
  setTerminalLines([`queue reconnecting: ${saved.market}`, "startup detection: full queue sync required"]);
  void registerMarketQueueStart(saved.option, "start")
    .then((payload) => {
      queueState.value = payload.eligible === false ? "waiting" : "queued";
      marketRunning.value = true;
      appendTerminal(`queue registered: ${payload.chainLabel || normalizeChainLabel(payload.chain)} ${shortAddress(payload.walletAddress)}`);
      persistRunningMarketState(typeof payload.walletAddress === "string" ? payload.walletAddress : undefined, payload);
      startMarketHeartbeat(payload.heartbeatIntervalMs);
      void loadQueueMonitorStatus();
      void refreshMarketSnapshotDisplay();
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
  marketStartIntentId = "";
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
      endpointSlug: typeof saved.endpointSlug === "string" ? saved.endpointSlug : "",
      creditBurnPerSecond: typeof saved.creditBurnPerSecond === "number" ? saved.creditBurnPerSecond : null,
      updatedAt: saved.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function restoreRecentRunningMarketState() {
  const saved = readRunningMarketState();
  if (!saved) {
    clearRunningMarketState();
    return;
  }
  if (!isRecentRunningMarketState(saved)) {
    clearRunningMarketState();
    return;
  }
  restoreRunningMarketState();
}

function isRecentRunningMarketState(saved: RunningMarketSnapshot) {
  const updatedAt = Date.parse(saved.updatedAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= RUNNING_MARKET_RESTORE_WINDOW_MS;
}

function handleClientOffline() {
  if (!marketRunning.value) return;
  queueState.value = "paused";
  stopMarketHeartbeat();
  appendTerminal("network offline: queue heartbeat paused");
}

function handleClientOnline() {
  if (!marketRunning.value || currentMarket.value.disabled) return;
  void sendMarketHeartbeat().then(() => {
    if (marketRunning.value) resumeMarketHeartbeat();
  });
}

function handleVisibilityHeartbeat() {
  if (document.visibilityState === "visible") handleClientOnline();
}

function handleClientUnload() {
  stopMarketHeartbeat();
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
  let response: Response;
  try {
    response = await fetch("/api/liquidation-queue/status", {
      method: "POST",
      headers: authHeaders(authCode),
      body: JSON.stringify(queueRequestBody(item, action)),
      signal: AbortSignal.timeout(QUEUE_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("队列服务请求超时，请检查授权、网络端点和服务可用性。");
    }
    throw error;
  }
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
    startIntentId: action === "start" ? marketStartIntentId : undefined,
  };
}

function createQueueStartIntentId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `liq2-start-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  return sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim() || "";
}

function authHeaders(authCode = readAuthCode()): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode } : {}),
  };
}

function isFatalQueueRuntimeError(message: string): boolean {
  return /SUPERMTNODE_APP_TOKEN|PRIVATE_KEY|授权码|license|credits|RPC 未绑定|未配置|格式不正确|不能启动|不能重复启动|另一台电脑|请求超时|远端队列未确认|当前钱包|队列状态请求失败|已用完|exhausted|expired|过期|失效|HTTP 401|HTTP 403|unauthorized|forbidden|not configured|invalid|timeout|token/i.test(message);
}

function isRecoverableHeartbeatError(message: string): boolean {
  return /队列服务请求超时|请求超时|WSS 队列服务连接超时|WSS 队列服务暂时不可用|在确认上报前断开|WebSocket is not open|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|network|timeout/i.test(message);
}

function notifyQueueError(message: string) {
  if (isCredentialQueueRuntimeError(message)) return;
  ElMessage.error(message);
}

function isCredentialQueueRuntimeError(message: string): boolean {
  return /SUPERMTNODE_APP_TOKEN|授权码|license|token has been rotated|expired|过期|失效|HTTP 401|HTTP 403|unauthorized|forbidden|token/i.test(message);
}

async function refreshCandidateSnapshot(): Promise<void> {
  await refreshMarketSnapshotDisplay();
  await loadQueueMonitorStatus();
}

defineExpose({
  refreshCandidateSnapshot,
});

async function refreshMarketSnapshotDisplay(): Promise<void> {
  await marketSnapshotRef.value?.refreshMarketSnapshot();
}

function handleSnapshotStrategiesUpdated(rows: SnapshotStrategyRow[]) {
  snapshotStrategyRows.value = rows;
  syncSelectedMarket();
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
