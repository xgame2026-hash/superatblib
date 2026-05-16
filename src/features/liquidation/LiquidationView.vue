<template>
  <section class="liquidation-page">
    <div class="liquidation-left">
      <RpcUsagePanel v-slot="{ metrics, formatRpcUsage }">
        <WalletAssetsPanel @refresh="emit('refresh')">
          <template #rpc-usage="{ chain }">
            {{ formatRpcUsage(metrics[chain]) }}
          </template>
        </WalletAssetsPanel>
      </RpcUsagePanel>

      <article class="panel market-control-panel">
        <div class="market-control">
          <label>
            <span>执行市场</span>
            <el-select v-model="market">
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
          <span>当前市场</span>
          <strong>{{ currentMarketLabel }}</strong>
        </div>
      </div>
      <div class="snapshot-refresh-progress" aria-hidden="true">
        <span :style="{ width: `${snapshotRefreshProgress}%` }"></span>
      </div>
      <div class="opportunity-table-shell">
        <table class="opportunity-table">
          <thead>
            <tr>
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
              <td colspan="8" class="empty-cell">等待服务器策略快照返回候选账户</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { CopyDocument, VideoPause, VideoPlay } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import runIcon from "../../img/run.svg";
import tigsIcon from "../../img/tigs.svg";
import MarketMonitor from "./MarketMonitor.vue";
import RpcUsagePanel from "./RpcUsagePanel.vue";
import WalletAssetsPanel from "./WalletAssetsPanel.vue";

const emit = defineEmits<{
  refresh: [];
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
  disabled?: boolean;
};
type CandidateRow = {
  market: MarketValue;
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
};

type SnapshotSourceRow = {
  chain: string;
  chainLabel?: string;
  source?: string;
  queueCount?: number;
  liquidationCount?: number;
  status?: string;
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

const AUTH_CODE_KEY = "liq2-auth-code";
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

const marketOptions = computed<MarketOption[]>(() => {
  const options = snapshotStrategyRows.value.map((strategy) => strategyToMarketOption(strategy));
  return options.length > 0 ? options : [unconfiguredMarket];
});
const currentMarket = computed(() => marketOptions.value.find((item) => item.value === market.value) ?? marketOptions.value[0] ?? unconfiguredMarket);
const currentMarketLabel = computed(() => currentMarket.value.label);
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
  const roundRobinMessages = queueMonitorRows.value.map((row) => {
    const position = row.position === null ? "--" : `#${row.position}`;
    const participantCount = row.participantCount || queueMonitorParticipantCount.value || 0;
    const joined = row.inQueue ? "已入队" : "未入队";
    const turn = row.active || row.eligible ? "本轮可参与" : row.status;
    return `轮循队列 ${row.chainLabel}: ${joined} / 位置 ${position} / ${participantCount}人 / ${turn}`;
  });
  const candidateMessages = candidateQueueRows.value.slice(0, 8).map((row) => {
    const wallet = row.walletShort || shortAddress(row.wallet) || "--";
    const chain = row.chainLabel || normalizeChainLabel(row.chain);
    return `候选队列 ${chain}: ${wallet} / ${row.asset || "--"} / ${row.protocol || "--"} / ${row.status || "候选"}`;
  });
  const sourceMessages = snapshotSourceRows.value.map((row) => {
    const chain = row.chainLabel || normalizeChainLabel(row.chain);
    return `RPC来源 ${chain}: ${row.source || "--"} / 候选 ${row.queueCount ?? 0} / 快照 ${row.liquidationCount ?? 0} / ${row.status || "--"}`;
  });
  return [...candidateMessages, ...sourceMessages, ...roundRobinMessages];
});
const candidateQueueStatusText = computed(() => (candidateQueueRows.value.length > 0 ? `${candidateQueueRows.value.length} 个候选` : queueStateText.value));
const candidateRows = computed<CandidateRow[]>(() => candidateQueueRows.value.map(queueToCandidateRow));
const filteredCandidates = computed(() => {
  return candidateRows.value.filter((item) => {
    if (item.market !== market.value) return false;
    if (source.value !== "全部" && item.source !== source.value) return false;
    return true;
  });
});

const terminalText = computed(() => terminalLines.value.join("\n") || "等待执行输出");

let queueMonitorRefreshTimer = 0;
let candidateQueueRefreshTimer = 0;
let snapshotProgressTimer = 0;
let snapshotProgressStartedAt = 0;
let marketHeartbeatTimer = 0;
const SNAPSHOT_REFRESH_INTERVAL_MS = 10_000;
const MARKET_HEARTBEAT_INTERVAL_MS = 30_000;

onMounted(() => {
  void loadQueueMonitorStatus();
  void loadCandidateQueueSnapshot();
  void nextTick(updateOpportunitiesPanelHeight);
  window.addEventListener("resize", updateOpportunitiesPanelHeight);
  queueMonitorRefreshTimer = window.setInterval(loadQueueMonitorStatus, 30_000);
  candidateQueueRefreshTimer = window.setInterval(loadCandidateQueueSnapshot, 30_000);
  startSnapshotProgressTimer();
});

onBeforeUnmount(() => {
  if (queueMonitorRefreshTimer) window.clearInterval(queueMonitorRefreshTimer);
  if (candidateQueueRefreshTimer) window.clearInterval(candidateQueueRefreshTimer);
  if (snapshotProgressTimer) window.clearInterval(snapshotProgressTimer);
  stopMarketHeartbeat();
  if (marketRunning.value && !currentMarket.value.disabled) void unregisterMarketQueue(currentMarket.value);
  window.removeEventListener("resize", updateOpportunitiesPanelHeight);
});

async function startMarketExecution() {
  queueState.value = "waiting";
  marketRunning.value = true;
  appendTerminal(`market selected: ${currentMarketLabel.value}`);
  if (currentMarket.value.disabled) {
    queueState.value = "idle";
    marketRunning.value = false;
    appendTerminal(`market unavailable: ${currentMarket.value.apiStatus}`);
    return;
  }
  appendTerminal(`snapshot source: ${currentMarket.value.endpoint}`);
  appendTerminal(`strategy status: ${currentMarket.value.apiStatus}`);
  try {
    const payload = await registerMarketQueueStart(currentMarket.value);
    queueState.value = payload.eligible === false ? "waiting" : "queued";
    appendTerminal(`queue registered: ${payload.chainLabel || normalizeChainLabel(payload.chain)} ${shortAddress(payload.walletAddress)}`);
    startMarketHeartbeat();
    await loadQueueMonitorStatus();
    await loadCandidateQueueSnapshot();
  } catch (error) {
    queueState.value = "idle";
    marketRunning.value = false;
    const message = error instanceof Error ? error.message : "启动队列上报失败";
    appendTerminal(`queue register failed: ${message}`);
    ElMessage.error(message);
  }
}

async function pauseMarketExecution() {
  const runningMarket = currentMarket.value;
  queueState.value = "paused";
  marketRunning.value = false;
  stopMarketHeartbeat();
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

function startMarketHeartbeat() {
  stopMarketHeartbeat();
  marketHeartbeatTimer = window.setInterval(() => {
    if (!marketRunning.value || currentMarket.value.disabled) return;
    void registerMarketQueueStart(currentMarket.value, "heartbeat")
      .then((payload) => appendTerminal(`queue heartbeat: ${payload.chainLabel || normalizeChainLabel(payload.chain)} ${shortAddress(payload.walletAddress)}`))
      .catch((error) => appendTerminal(`queue heartbeat failed: ${error instanceof Error ? error.message : "unknown error"}`));
  }, MARKET_HEARTBEAT_INTERVAL_MS);
}

function stopMarketHeartbeat() {
  if (!marketHeartbeatTimer) return;
  window.clearInterval(marketHeartbeatTimer);
  marketHeartbeatTimer = 0;
}

async function unregisterMarketQueue(item: MarketOption): Promise<Record<string, any>> {
  return registerMarketQueueStart(item, "stop");
}

async function registerMarketQueueStart(item: MarketOption, action = "start"): Promise<Record<string, any>> {
  const chain = normalizeChainKey(item.chain);
  const protocol = item.label.split("/").pop()?.trim() || "";
  const response = await fetch("/api/liquidation-queue/status", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      chain,
      protocol,
      strategyId: item.value,
      action,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok || payload.ok === false) {
    throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
  }
  return payload;
}

async function loadQueueMonitorStatus(): Promise<void> {
  try {
    const authCode = localStorage.getItem(AUTH_CODE_KEY)?.trim() ?? "";
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

async function loadCandidateQueueSnapshot(): Promise<void> {
  try {
    const response = await fetch(`/api/latest-liquidations?t=${Date.now()}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { queue?: SnapshotQueueRow[]; sources?: SnapshotSourceRow[]; strategies?: SnapshotStrategyRow[] };
    candidateQueueRows.value = Array.isArray(payload.queue) ? payload.queue : [];
    snapshotSourceRows.value = Array.isArray(payload.sources) ? payload.sources : [];
    snapshotStrategyRows.value = Array.isArray(payload.strategies) ? payload.strategies : [];
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
  if (options.some((item) => item.value === market.value)) return;
  market.value = pickPreferredMarket(options)?.value ?? "unconfigured";
}

function pickPreferredMarket(options: MarketOption[]) {
  return (
    options.find((item) => /候选|可参与|运行|ready/i.test(item.apiStatus)) ??
    options.find((item) => item.apiTone === "ready") ??
    options.find((item) => item.apiTone === "neutral") ??
    options[0]
  );
}

function strategyToMarketOption(strategy: SnapshotStrategyRow): MarketOption {
  const chain = strategy.chainLabel || normalizeChainLabel(strategy.chain);
  const queueCount = strategy.queueCount ?? 0;
  const status = strategy.status || (queueCount > 0 ? "候选运行中" : "RPC已接入");
  const runnable = /候选|可执行|运行|ready/i.test(status);
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
    disabled: !runnable,
  };
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
  return {
    market: strategyIdForQueue(row),
    source: sourceLabel(row.source),
    account: row.walletShort || shortAddress(row.wallet) || "--",
    accountFull,
    hf,
    hfTone: riskTone,
    status,
    statusTone: statusTone(status, riskTone),
    action: actionLabel(status, riskTone),
    debt: formatDebtValue(row.debt, row.debtSymbol),
    collateral: row.collateralSymbol || row.asset || "--",
    gross: formatUsdValue(row.grossProfit, "待估算"),
    net: formatUsdValue(row.netProfit, "待估算"),
  };
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
  if (/scanner|strategy|scan|策略/i.test(value || "")) return "策略扫描器";
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

function formatUsdValue(value: string | number | undefined, fallback: string) {
  const detail = detailValue(value, fallback);
  if (detail === fallback || detail.startsWith("$")) return detail;
  return `$${detail}`;
}

function strategyIdForQueue(row: SnapshotQueueRow) {
  const chain = normalizeChainKey(row.chain);
  const protocol = (row.protocol || "").toLowerCase();
  const match = snapshotStrategyRows.value.find((strategy) => normalizeChainKey(strategy.chain) === chain && strategy.protocol.toLowerCase() === protocol);
  return match?.id || `${chain}-${protocol.replace(/[^a-z0-9]+/g, "-")}`;
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
