<template>
  <article ref="opportunitiesPanel" class="panel opportunities-panel" :style="{ height: opportunitiesPanelHeight }">
    <div class="opportunity-snapshot">
      <div>
        <strong>{{ t("snapshot.allMarkets") }}</strong>
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
            <th>{{ t("snapshot.market") }}</th>
            <th>{{ t("snapshot.user") }}</th>
            <th>HF</th>
            <th>{{ t("snapshot.status") }}</th>
            <th>{{ t("snapshot.action") }}</th>
            <th>{{ t("snapshot.debt") }}</th>
            <th>{{ t("snapshot.collateral") }}</th>
            <th>{{ t("snapshot.gross") }}</th>
            <th>{{ t("snapshot.net") }}</th>
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
                  :title="t('snapshot.copyAddress')"
                  :aria-label="t('snapshot.copyAddress')"
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
                <strong>{{ t("snapshot.allMarkets") }}</strong>
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
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { CopyDocument } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { t } from "../../i18n";

type MarketValue = string;

type CandidateRow = {
  market: MarketValue;
  marketLabel: string;
  sourceKey: string;
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

const emit = defineEmits<{
  "strategies-updated": [rows: SnapshotStrategyRow[]];
}>();

const AUTH_CODE_KEY = "superarb-auth-code-v1.6.5";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.5";
const SNAPSHOT_REFRESH_INTERVAL_MS = 10_000;
const SNAPSHOT_SOURCE_ALL = "all";
const SNAPSHOT_SOURCE_SCANNER = "scanner";
const SNAPSHOT_SOURCE_NODE = "node";
const FORCED_SNAPSHOT_MARKET_COUNT = 17;

const source = ref(SNAPSHOT_SOURCE_ALL);
const candidateQueueRows = ref<SnapshotQueueRow[]>([]);
const queuedWalletRows = ref<SnapshotQueueRow[]>([]);
const snapshotSourceRows = ref<SnapshotSourceRow[]>([]);
const snapshotStrategyRows = ref<SnapshotStrategyRow[]>([]);
const opportunitiesPanel = ref<HTMLElement | null>(null);
const opportunitiesPanelHeight = ref("calc(100vh - 206px)");
const snapshotRefreshing = ref(false);
const snapshotRefreshProgress = ref(0);

let snapshotProgressTimer = 0;
let snapshotProgressStartedAt = 0;

const snapshotMarketCount = computed(() => FORCED_SNAPSHOT_MARKET_COUNT);
const allMarketSnapshotSummary = computed(() =>
  t("snapshot.summary", {
    candidates: candidateQueueRows.value.length,
    nodes: queuedWalletRows.value.length,
    markets: snapshotMarketCount.value,
  }),
);
const candidateRows = computed<CandidateRow[]>(() => candidateQueueRows.value.map(queueToCandidateRow));
const filteredCandidates = computed(() => {
  return candidateRows.value.filter((item) => {
    if (source.value !== SNAPSHOT_SOURCE_ALL && item.sourceKey !== source.value) return false;
    return true;
  });
});
const currentMarketSnapshotStats = computed<MarketSnapshotStat[]>(() => {
  const queueCount = snapshotStrategyRows.value.reduce((total, row) => total + (row.queueCount ?? 0), 0);
  const liquidationCount = snapshotStrategyRows.value.reduce((total, row) => total + (row.liquidationCount ?? 0), 0);
  const latestUpdatedAt = snapshotStrategyRows.value.map((row) => row.updatedAt).filter(Boolean).sort().at(-1);
  return [
    { label: t("snapshot.statMarket"), value: `${snapshotMarketCount.value}` },
    { label: t("snapshot.statCandidate"), value: `${queueCount}` },
    { label: t("snapshot.statLiquidation"), value: `${liquidationCount}` },
    { label: t("snapshot.statUpdated"), value: latestUpdatedAt ? formatSnapshotTime(latestUpdatedAt) : "--" },
    { label: t("snapshot.statSource"), value: sourceLabel(snapshotSourceRows.value.map((row) => row.source).filter(Boolean)[0]) },
  ];
});
const emptyCandidateText = computed(() => {
  const hasSnapshot = snapshotStrategyRows.value.length > 0 || snapshotSourceRows.value.length > 0;
  if (hasSnapshot) return t("snapshot.noCandidates");
  return t("snapshot.waitingSnapshot");
});

onMounted(() => {
  void loadMarketSnapshot();
  void nextTick(updateOpportunitiesPanelHeight);
  window.addEventListener("resize", updateOpportunitiesPanelHeight);
  startSnapshotProgressTimer();
});

onBeforeUnmount(() => {
  if (snapshotProgressTimer) window.clearInterval(snapshotProgressTimer);
  snapshotProgressTimer = 0;
  window.removeEventListener("resize", updateOpportunitiesPanelHeight);
});

async function loadMarketSnapshot(): Promise<void> {
  try {
    const response = await fetch(`/api/market-snapshot?t=${Date.now()}`, {
      cache: "no-store",
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { queue?: SnapshotQueueRow[]; queuedWallets?: SnapshotQueueRow[]; sources?: SnapshotSourceRow[]; strategies?: SnapshotStrategyRow[] };
    candidateQueueRows.value = Array.isArray(payload.queue) ? payload.queue.filter(isCandidateAccountRow) : [];
    queuedWalletRows.value = Array.isArray(payload.queuedWallets) ? payload.queuedWallets.filter(isQueuedWalletRow) : [];
    snapshotSourceRows.value = Array.isArray(payload.sources) ? payload.sources : [];
    snapshotStrategyRows.value = Array.isArray(payload.strategies) ? payload.strategies.map(normalizeStrategyRow) : [];
    emit("strategies-updated", snapshotStrategyRows.value);
  } catch {
    candidateQueueRows.value = [];
    queuedWalletRows.value = [];
    snapshotSourceRows.value = [];
    snapshotStrategyRows.value = [];
    emit("strategies-updated", []);
  } finally {
    void nextTick(updateOpportunitiesPanelHeight);
  }
}

async function refreshMarketSnapshot(): Promise<void> {
  snapshotRefreshing.value = true;
  try {
    await loadMarketSnapshot();
  } finally {
    snapshotRefreshing.value = false;
    resetSnapshotProgress();
  }
}

defineExpose({
  refreshMarketSnapshot,
});

function startSnapshotProgressTimer() {
  resetSnapshotProgress();
  snapshotProgressTimer = window.setInterval(() => {
    const elapsed = Date.now() - snapshotProgressStartedAt;
    const nextProgress = Math.min(100, (elapsed / SNAPSHOT_REFRESH_INTERVAL_MS) * 100);
    snapshotRefreshProgress.value = nextProgress;
    if (nextProgress >= 100 && !snapshotRefreshing.value) void refreshMarketSnapshot();
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

function isCandidateStrategy(strategy: SnapshotStrategyRow) {
  const status = strategy.status || "";
  if ((strategy.queueCount ?? 0) > 0 || /候选|可执行|运行|ready/i.test(status)) return true;
  return strategy.mode === "execute" && !/待部署|未连接|offline/i.test(status);
}

function isDisplayedMarketStrategy(strategy: SnapshotStrategyRow) {
  if (isCandidateStrategy(strategy)) return true;
  return /aave|morpho|spark|venus|compound|liquity/i.test(strategy.protocol);
}

function queueToCandidateRow(row: SnapshotQueueRow): CandidateRow {
  const hf = detailValue(row.healthFactor, t("snapshot.scanning"));
  const riskTone = hfRiskTone(hf);
  const status = statusLabel(row.status, riskTone);
  const accountFull = row.wallet || row.walletShort || "--";
  const marketId = strategyIdForQueue(row);
  return {
    market: marketId,
    marketLabel: marketLabelForQueue(row, marketId),
    sourceKey: sourceKey(row.source),
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
    gross: formatUsdValue(row.grossProfit, t("snapshot.estimatePending")),
    net: formatUsdValue(row.netProfit, t("snapshot.estimatePending")),
  };
}

function isCandidateAccountRow(row: SnapshotQueueRow) {
  const rowSource = (row.source || "").toLowerCase();
  const queueType = (row.queueType || "").toLowerCase();
  const id = (row.id || "").toLowerCase();
  if (rowSource.includes("rpc-queue") || rowSource.includes("client-queue") || rowSource.includes("endpoint-queue")) return false;
  if (queueType.includes("client") || queueType.includes("endpoint")) return false;
  if (id.startsWith("endpoint-start:")) return false;
  if (row.endpointSlug || row.endpointId) return false;
  return Boolean(row.healthFactor && row.healthFactor !== "--") || /scanner|strategy|scan|策略/i.test(row.source || "");
}

function isQueuedWalletRow(row: SnapshotQueueRow) {
  const rowSource = (row.source || "").toLowerCase();
  const queueType = (row.queueType || "").toLowerCase();
  const id = (row.id || "").toLowerCase();
  return rowSource.includes("rpc-queue") || rowSource.includes("client-queue") || rowSource.includes("endpoint-queue") || queueType.includes("endpoint") || id.startsWith("endpoint-start:");
}

async function copyAccountAddress(address: string) {
  if (!address || address === "--") return;
  try {
    await navigator.clipboard.writeText(address);
    ElMessage.success(t("snapshot.copySuccess"));
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
    if (copied) ElMessage.success(t("snapshot.copySuccess"));
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
  if (tone === "danger") return t("snapshot.danger");
  if (tone === "warn") return t("snapshot.highRisk");
  if (tone === "safe") return t("snapshot.safe");
  return status || t("snapshot.candidate");
}

function statusTone(status: string, tone: CandidateRow["hfTone"]): CandidateRow["statusTone"] {
  if (tone === "danger" || /危险|可清算/i.test(status)) return "danger";
  if (tone === "warn" || /高风险|预警/i.test(status)) return "warn";
  if (tone === "safe" || /安全/i.test(status)) return "safe";
  if (/可执行|排队|候选/i.test(status)) return "review";
  return "watch";
}

function actionLabel(status: string, tone: CandidateRow["hfTone"]) {
  if (tone === "danger" || /可清算|危险/i.test(status)) return t("snapshot.executable");
  if (tone === "warn" || /高风险|预警/i.test(status)) return t("snapshot.warning");
  if (tone === "safe") return t("liquidation.monitor");
  return t("snapshot.waiting");
}

function sourceLabel(value?: string) {
  if (sourceKey(value) === SNAPSHOT_SOURCE_SCANNER) return t("snapshot.sourceScanner");
  return t("snapshot.nodeApi");
}

function sourceKey(value?: string) {
  return /scanner|strategy|scan|snapshot|public|aave|策略/i.test(value || "") ? SNAPSHOT_SOURCE_SCANNER : SNAPSHOT_SOURCE_NODE;
}

function detailValue(value: string | number | undefined, fallback: string) {
  if (!value || value === "--") return fallback;
  return String(value);
}

function formatDebtValue(value: string | number | undefined, symbol?: string) {
  const detail = detailValue(value, t("snapshot.scanning"));
  if (detail === t("snapshot.scanning") || !symbol) return detail;
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
  const strategy = snapshotStrategyRows.value.find((item) => item.id === marketId);
  if (strategy) return `${strategy.chainLabel || normalizeChainLabel(strategy.chain)} / ${strategy.protocol}`;
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

function normalizeChainKey(chain: string) {
  const normalized = (chain || "").toLowerCase();
  if (normalized.includes("bnb") || normalized.includes("bsc")) return "bnb";
  if (normalized.includes("arb")) return "arbitrum";
  return "ethereum";
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

<style scoped>
.opportunities-panel {
  display: grid;
  height: calc(100vh - 206px);
  min-height: 0;
  grid-template-rows: auto 2px minmax(0, 1fr);
  padding: 0;
  overflow: hidden;
  background: #05040a;
}

.snapshot-refresh-progress {
  height: 2px;
  overflow: hidden;
  background: rgba(174, 126, 255, 0.12);
}

.snapshot-refresh-progress span {
  display: block;
  width: 0;
  height: 100%;
  background: linear-gradient(90deg, #57ffa1, #8b5cf6);
  box-shadow: 0 0 12px rgba(87, 255, 161, 0.42);
  transition: width 0.12s linear;
}

.opportunity-snapshot {
  display: flex;
  align-items: center;
  background: var(--surface);
  padding: 12px 18px;
}

.opportunity-snapshot div {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.opportunity-snapshot strong {
  font-size: 11px;
}

.opportunity-snapshot span {
  font-size: 10px;
}

.opportunity-table-shell {
  min-height: 0;
  overflow: auto;
  background: #05040a;
}

.opportunity-table {
  width: 100%;
  border-collapse: collapse;
  margin: 0;
  border-radius: 0;
  background: #05040a;
  color: #dcd3f5;
  font-size: 12px;
}

.opportunity-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.opportunity-table th {
  background: #231b40;
  color: #a99fc0;
  font-weight: 800;
  padding: 10px 12px;
  text-align: left;
}

.opportunity-table td {
  border-bottom: 1px solid rgba(174, 126, 255, 0.1);
  padding: 11px 12px;
  transition: background 0.16s ease, color 0.16s ease;
}

.opportunity-table tbody,
.opportunity-table tbody tr,
.opportunity-table tbody td {
  background: #05040a;
}

.opportunity-table tbody tr:hover td {
  background: rgba(139, 92, 246, 0.13);
}

.opportunity-table td[colspan] {
  height: 42px;
  color: white;
}

.account-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.account-short {
  min-width: 0;
}

.copy-account-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #bfb4dc;
  cursor: pointer;
  opacity: 0.74;
  transition: color 0.16s ease, opacity 0.16s ease, transform 0.16s ease;
}

.copy-account-button:hover {
  color: #57ffa1;
  opacity: 1;
  transform: translateY(-1px);
}

.copy-account-button .el-icon {
  font-size: 15px;
}

.hf-cell {
  font-weight: 900;
}

.hf-cell.is-safe {
  color: #63f090;
}

.hf-cell.is-warn {
  color: #f2c16c;
}

.hf-cell.is-danger {
  color: #ff5b5b;
}

.hf-cell.is-neutral {
  color: #dcd3f5;
}

.status-pill {
  display: inline-flex;
  min-width: 54px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(174, 126, 255, 0.18);
  border-radius: 999px;
  color: #dcd3f5;
  font-size: 11px;
  font-weight: 900;
}

.status-pill.is-review {
  border-color: rgba(245, 181, 83, 0.28);
  color: #f2c16c;
}

.status-pill.is-safe {
  border-color: rgba(99, 240, 144, 0.34);
  color: #63f090;
}

.status-pill.is-warn {
  border-color: rgba(245, 181, 83, 0.42);
  color: #f2c16c;
}

.status-pill.is-danger {
  border-color: rgba(255, 91, 91, 0.46);
  color: #ff6b6b;
}

.status-pill.is-watch {
  color: #bfb5d8;
}

.empty-cell {
  color: #a99fc0 !important;
}

.market-snapshot-empty {
  display: grid;
  gap: 10px;
  padding: 18px 4px;
  color: #dcd3f5;
}

.market-snapshot-empty strong {
  color: #f3edff;
  font-size: 14px;
  font-weight: 900;
}

.market-snapshot-empty > span {
  color: #a99fc0;
  font-size: 12px;
  font-weight: 800;
}

.market-snapshot-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.market-snapshot-stats span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  border: 1px solid rgba(124, 91, 255, 0.28);
  border-radius: 6px;
  background: rgba(31, 25, 45, 0.72);
  padding: 5px 9px;
  color: #dcd3f5;
  font-size: 11px;
  font-weight: 900;
}

.market-snapshot-stats b {
  color: #8bf0aa;
  font-size: 10px;
  font-weight: 900;
}
</style>
