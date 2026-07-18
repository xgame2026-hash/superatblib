<template>
  <section class="slots-page panel">
    <div class="panel-heading slots-heading">
      <div>
        <p class="eyebrow">PRIVATE_KEY · Wallet activity</p>
      </div>
      <div class="slots-heading-actions">
        <span v-if="walletAddress" class="slots-wallet" :title="walletAddress">{{ shortAddress(walletAddress) }}</span>
        <button class="slots-refresh" type="button" :disabled="loading" @click="loadOrders(false)">
          {{ loading ? t("slots.refreshing") : t("slots.refresh") }}
        </button>
      </div>
    </div>

    <div class="slots-summary">
      <article>
        <span>{{ t("slots.slots") }}</span>
        <strong>{{ summary.total }}</strong>
        <small>{{ t("slots.orderCount") }}</small>
      </article>
      <article>
        <span>{{ t("slots.rewardAmount") }}</span>
        <strong>{{ formatDecimal(summary.rewardUsdt, 2) }} USDT</strong>
        <small>{{ t("slots.rewardTotal") }}</small>
      </article>
    </div>

    <!-- 暂不显示记录筛选与数据源信息，保留实现以便后续恢复。
    <div class="slots-toolbar">
      <label>
        <span>{{ t("slots.statusFilter") }}</span>
        <el-select v-model="statusFilter">
          <el-option :label="t('slots.filterAll')" value="all" />
          <el-option :label="t('slots.statusActive')" value="active" />
          <el-option :label="t('slots.statusCompleted')" value="completed" />
          <el-option :label="t('slots.statusFailed')" value="failed" />
          <el-option :label="t('slots.statusCancelled')" value="cancelled" />
          <el-option :label="t('slots.statusUnknown')" value="unknown" />
        </el-select>
      </label>
      <label>
        <span>{{ t("slots.typeFilter") }}</span>
        <el-select v-model="typeFilter">
          <el-option :label="t('slots.filterUserOrders')" value="trade" />
          <el-option :label="t('slots.filterRewards')" value="reward" />
          <el-option :label="t('slots.filterAllRecords')" value="all" />
          <el-option :label="t('slots.typeBuyXbch')" value="buy_xbch" />
          <el-option :label="t('slots.typeSellXbch')" value="sell_xbch" />
          <el-option :label="t('slots.typeApproval')" value="approval" />
          <el-option :label="t('slots.typeDepositPool')" value="deposit_pool" />
          <el-option :label="t('slots.typeLegacyTrade')" value="legacy_trade" />
        </el-select>
      </label>
      <label class="slots-search-field">
        <span>{{ t("slots.search") }}</span>
        <el-input v-model="searchQuery" clearable :placeholder="t('slots.searchPlaceholder')" />
      </label>
      <div class="slots-sync-meta">
        <span>{{ t("slots.source") }}</span>
        <strong>{{ source }}</strong>
        <small>{{ formatDateTime(updatedAt) }}</small>
      </div>
    </div>
    -->

    <div v-if="!configured" class="slots-error slots-setup-notice">
      <strong>{{ t("app.privateDataSetupRequired") }}</strong>
    </div>

    <div v-else-if="errorMessage" class="slots-error">
      <strong>{{ t("slots.loadFailed") }}</strong>
      <span>{{ errorMessage }}</span>
      <button type="button" @click="loadOrders(false)">{{ t("slots.retry") }}</button>
    </div>

    <div v-if="truncated" class="slots-warning">
      {{ t("slots.truncated", { count: summary.recordTotal }) }}
    </div>

    <div v-if="loading && orders.length === 0" class="slots-loading">
      <span class="slots-spinner" aria-hidden="true"></span>
      {{ t("slots.loading") }}
    </div>

    <div v-else-if="!errorMessage && filteredOrders.length === 0" class="slots-empty">
      {{ orders.length === 0 ? t("slots.empty") : t("slots.noMatch") }}
    </div>

    <div v-else class="slots-grid">
      <article
        v-for="order in pagedOrders"
        :key="order.orderNo || order.id"
        class="order-slot"
        :class="[`is-${order.statusGroup}`, { 'has-reward': order.rewardCount > 0 }]"
      >
        <header class="order-slot-head">
          <div>
            <span>{{ displayOrderId(order) }}</span>
            <!-- 暂不显示订单类型与交易对。
            <strong>{{ orderTypeLabel(order.orderType) }} · {{ order.symbol || "--" }}</strong>
            -->
          </div>
          <span
            v-if="order.statusGroup === 'active'"
            class="order-slot-running"
            :title="t('slots.statusActive')"
            :aria-label="t('slots.statusActive')"
            role="status"
          ></span>
          <!-- 暂不显示订单状态标签。
          <em :class="`is-${order.statusGroup}`">{{ orderStatusLabel(order) }}</em>
          -->
        </header>

        <!-- 暂不显示链路、模式、奖励与滑点标签。
        <div class="order-slot-tags">
          <span>{{ chainLabel(order) }}</span>
          <span>{{ modeLabel(order.mode) }}</span>
          <span v-if="isRewardRecord(order)" class="is-reward">{{ t("slots.rewardRecord") }}</span>
          <span v-if="order.slippageBps !== null">{{ t("slots.slippageValue", { value: formatBps(order.slippageBps) }) }}</span>
        </div>
        -->

        <div class="order-slot-amounts">
          <div>
            <!-- 订单金额已直接以美元格式展示。
            <span>{{ isRewardRecord(order) ? t("slots.rewardAmount") : t("slots.orderAmount") }}</span>
            -->
            <strong>{{ orderUsdtAmount(order) }}</strong>
          </div>
          <!-- 暂不显示 xBCH 数量。
          <div>
            <span>{{ t("slots.xbchAmount") }}</span>
            <strong>{{ order.xbchAmount ? `${formatDecimal(order.xbchAmount, 8)} xBCH` : "--" }}</strong>
          </div>
          -->
          <!-- 暂不显示 xBCH 成交价，卡片仅保留 ID、金额、时间与交易跳转。
          <div v-if="order.xbchPriceUsdt">
            <span>{{ t("slots.xbchPrice") }}</span>
            <strong>{{ formatDecimal(order.xbchPriceUsdt, 6) }} USDT</strong>
          </div>
          -->
        </div>

        <div v-if="order.rewardCount > 0" class="order-slot-reward">
          <span>{{ t("slots.relatedReward") }}</span>
          <strong>{{ formatDecimal(order.linkedRewardUsdt, 2) }} USDT</strong>
        </div>

        <div class="order-slot-meta">
          <div>
            <!-- 暂不显示订单时间标题，仅显示时间值。
            <span>{{ t("slots.orderTime") }}</span>
            -->
            <strong>{{ formatDateTime(orderTime(order)) }}</strong>
          </div>
          <!-- 暂不显示区块号，卡片仅保留 ID、金额、时间与交易跳转。
          <div v-if="order.blockNumber">
            <span>{{ t("slots.blockNumber") }}</span>
            <strong>#{{ order.blockNumber }}</strong>
          </div>
          -->
        </div>

        <div v-if="order.error" class="order-slot-error">
          <span>{{ t("slots.errorReason") }}</span>
          <strong>{{ order.error }}</strong>
        </div>

        <footer class="order-slot-actions">
          <a
            v-if="order.explorerUrl"
            class="order-slot-transaction-link"
            :href="order.explorerUrl"
            :title="t('slots.viewTransaction')"
            :aria-label="t('slots.viewTransaction')"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
          <span v-else>{{ t("slots.noTransaction") }}</span>
          <!-- 暂不显示状态维护说明。
          <small>{{ t("slots.readOnlyHint") }}</small>
          -->
        </footer>
      </article>
    </div>

    <div v-if="totalPages > 1" class="slots-pagination">
      <button type="button" :disabled="currentPage <= 1" @click="currentPage -= 1">{{ t("slots.previous") }}</button>
      <span>{{ t("slots.pageOf", { current: currentPage, total: totalPages }) }}</span>
      <button type="button" :disabled="currentPage >= totalPages" @click="currentPage += 1">{{ t("slots.next") }}</button>
    </div>

    <p class="slots-footnote">{{ t("slots.dataNote") }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { t } from "../../i18n";

type OrderStatusGroup = "active" | "completed" | "failed" | "cancelled" | "unknown";
type SlotOrder = {
  id: string;
  orderNo: string;
  legacyTradeId: string;
  chain: string;
  chainId: number | null;
  orderType: string;
  mode: string;
  status: string;
  statusGroup: OrderStatusGroup;
  symbol: string;
  tokenAddress: string;
  usdtAmount: string;
  effectiveUsdtAmount: string;
  rewardUsdt: string;
  parentOrderId: string;
  parentOrderNo: string;
  rewardCount: number;
  linkedRewardUsdt: string;
  xbchAmount: string;
  xbchPriceUsdt: string;
  priceSource: string;
  poolContractId: string;
  paymentTxHash: string;
  executionTxHash: string;
  approveTxHash: string;
  txHash: string;
  router: string;
  slippageBps: number | null;
  blockNumber: string;
  error: string;
  orderedAt: string;
  paidAt: string;
  executedAt: string;
  createdAt: string;
  updatedAt: string;
  explorerUrl: string;
};

type SlotsSummary = {
  total: number;
  recordTotal: number;
  operationTotal: number;
  active: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalUsdt: string;
  rewardTotal: number;
  rewardUsdt: string;
  xbchTotal: string;
};

type SlotsPayload = {
  ok?: boolean;
  walletAddress?: string;
  summary?: Partial<SlotsSummary>;
  orders?: SlotOrder[];
  updatedAt?: string;
  source?: string;
  truncated?: boolean;
  error?: string;
};

const props = withDefaults(defineProps<{ configured?: boolean }>(), {
  configured: true,
});

const AUTH_CODE_KEY = "superarb-auth-code-v1.6.5";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.5";
const PAGE_SIZE = 9;
const REFRESH_INTERVAL_MS = 15_000;

const orders = ref<SlotOrder[]>([]);
const summary = ref<SlotsSummary>(emptySummary());
const walletAddress = ref("");
const updatedAt = ref("");
const source = ref("privateARB");
const truncated = ref(false);
const loading = ref(false);
const errorMessage = ref("");
const statusFilter = ref("all");
const typeFilter = ref("all");
const searchQuery = ref("");
const currentPage = ref(1);
let refreshTimer = 0;
let loadController: AbortController | undefined;
let loadSequence = 0;
let requestInFlight = false;

const filteredOrders = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return orders.value.filter((order) => {
    // 卡槽仅展示买入、卖出及历史交易等订单信号，不展示奖励或利润发放记录。
    if (!isTradeOrderType(order.orderType)) return false;
    const statusMatches = statusFilter.value === "all" || order.statusGroup === statusFilter.value;
    const typeMatches = typeFilter.value === "all"
      || (typeFilter.value === "trade" && isTradeOrderType(order.orderType))
      || (typeFilter.value === "reward" && isRewardOrderType(order.orderType))
      || order.orderType === typeFilter.value;
    const searchMatches = !query || [order.orderNo, order.id, order.symbol, order.status, order.orderType, order.txHash]
      .some((value) => value.toLowerCase().includes(query));
    return statusMatches && typeMatches && searchMatches;
  });
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredOrders.value.length / PAGE_SIZE)));
const pagedOrders = computed(() => {
  const offset = (currentPage.value - 1) * PAGE_SIZE;
  return filteredOrders.value.slice(offset, offset + PAGE_SIZE);
});

watch([statusFilter, typeFilter, searchQuery], () => {
  currentPage.value = 1;
});
watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages;
});

onMounted(() => {
  startOrdersPolling();
});

onBeforeUnmount(() => {
  stopOrdersPolling();
});

watch(
  () => props.configured,
  (configured) => {
    if (configured) {
      startOrdersPolling();
      return;
    }
    stopOrdersPolling();
  },
);

function startOrdersPolling() {
  if (!props.configured) return;
  if (!refreshTimer) refreshTimer = window.setInterval(() => void loadOrders(true), REFRESH_INTERVAL_MS);
  void loadOrders(false);
}

function stopOrdersPolling() {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = 0;
  loadController?.abort();
}

async function loadOrders(silent: boolean) {
  if (!props.configured) return;
  if (requestInFlight && silent) return;
  const sequence = ++loadSequence;
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  requestInFlight = true;
  if (!silent) loading.value = true;
  try {
    const response = await fetch("/api/slots/orders", {
      cache: "no-store",
      headers: slotsHeaders(),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as SlotsPayload;
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`);
    if (sequence !== loadSequence) return;
    const nextOrders = Array.isArray(payload.orders) ? payload.orders : [];
    orders.value = nextOrders;
    summary.value = normalizeSummary(payload.summary, orders.value);
    walletAddress.value = payload.walletAddress || "";
    updatedAt.value = payload.updatedAt || new Date().toISOString();
    source.value = payload.source || "privateARB";
    truncated.value = payload.truncated === true;
    errorMessage.value = "";
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") return;
    if (sequence !== loadSequence) return;
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (sequence === loadSequence) {
      requestInFlight = false;
      loadController = undefined;
      if (!silent) loading.value = false;
    }
  }
}

function slotsHeaders(): Record<string, string> {
  const authCode = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim();
  return {
    accept: "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode } : {}),
  };
}

function normalizeSummary(value: Partial<SlotsSummary> | undefined, rows: SlotOrder[]): SlotsSummary {
  const tradeRows = rows.filter((order) => isTradeOrderType(order.orderType));
  return {
    total: finiteInteger(value?.total, tradeRows.length),
    recordTotal: finiteInteger(value?.recordTotal, rows.length),
    operationTotal: finiteInteger(value?.operationTotal, rows.length - tradeRows.length),
    active: finiteInteger(value?.active, tradeRows.filter((order) => order.statusGroup === "active").length),
    completed: finiteInteger(value?.completed, tradeRows.filter((order) => order.statusGroup === "completed").length),
    failed: finiteInteger(value?.failed, tradeRows.filter((order) => order.statusGroup === "failed").length),
    cancelled: finiteInteger(value?.cancelled, tradeRows.filter((order) => order.statusGroup === "cancelled").length),
    totalUsdt: typeof value?.totalUsdt === "string" ? value.totalUsdt : "0",
    rewardTotal: finiteInteger(value?.rewardTotal, rows.filter((order) => isRewardOrderType(order.orderType)).length),
    rewardUsdt: typeof value?.rewardUsdt === "string"
      ? value.rewardUsdt
      : sumDecimalStrings(rows.filter((order) => isRewardOrderType(order.orderType)).map((order) => order.rewardUsdt)),
    xbchTotal: typeof value?.xbchTotal === "string"
      ? value.xbchTotal
      : sumDecimalStrings(tradeRows.map((order) => order.xbchAmount)),
  };
}

function emptySummary(): SlotsSummary {
  return {
    total: 0,
    recordTotal: 0,
    operationTotal: 0,
    active: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    totalUsdt: "0",
    rewardTotal: 0,
    rewardUsdt: "0",
    xbchTotal: "0",
  };
}

function isTradeOrderType(orderType: string) {
  return ["buy_xbch", "sell_xbch", "legacy_trade"].includes(orderType);
}

function isRewardOrderType(orderType: string) {
  return ["reward", "rewards", "profit", "paid_profit", "payout", "rebate"].includes(orderType);
}

function isRewardRecord(order: SlotOrder) {
  return isRewardOrderType(order.orderType);
}

function displayOrderId(order: SlotOrder) {
  const value = order.orderNo || `#${order.id}`;
  const legacyMatch = /^legacy-trade-(\d+)$/i.exec(value);
  return legacyMatch ? `ID:${legacyMatch[1]}` : value;
}

function finiteInteger(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function orderTypeLabel(type: string) {
  if (type === "buy_xbch") return t("slots.typeBuyXbch");
  if (type === "sell_xbch") return t("slots.typeSellXbch");
  if (type === "approval") return t("slots.typeApproval");
  if (type === "deposit_pool") return t("slots.typeDepositPool");
  if (type === "legacy_trade") return t("slots.typeLegacyTrade");
  if (isRewardOrderType(type)) return t("slots.typeReward");
  return type || t("slots.typeUnknown");
}

function orderStatusLabel(order: SlotOrder) {
  if (order.status === "blocked") return t("slots.statusBlocked");
  if (order.statusGroup === "active") return t("slots.statusActive");
  if (order.statusGroup === "completed") return t("slots.statusCompleted");
  if (order.statusGroup === "failed") return t("slots.statusFailed");
  if (order.statusGroup === "cancelled") return t("slots.statusCancelled");
  return order.status || t("slots.statusUnknown");
}

function modeLabel(mode: string) {
  if (mode === "live") return t("slots.modeLive");
  if (mode === "paper" || mode === "simulation") return t("slots.modeSimulation");
  return mode || "--";
}

function chainLabel(order: SlotOrder) {
  if (order.chainId === 56 || order.chain === "bnb" || order.chain === "bsc") return "BNB Chain";
  if (order.chainId === 42161 || order.chain === "arbitrum") return "Arbitrum";
  if (order.chainId === 1 || order.chain === "ethereum") return "Ethereum";
  return order.chain || "--";
}

function orderUsdtAmount(order: SlotOrder) {
  // 订单金额应为钱包实际提交的原始金额；effectiveUsdtAmount 是扣减后的有效额。
  const amount = isRewardRecord(order) ? order.rewardUsdt : (order.usdtAmount || order.effectiveUsdtAmount);
  return amount ? `$${formatDecimal(amount, 6)}` : "--";
}

function sumDecimalStrings(values: string[]) {
  const scale = 8;
  const base = 10n ** BigInt(scale);
  const total = values.reduce((sum, value) => {
    const normalized = String(value || "").replace(/,/g, "");
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return sum;
    const [whole, fraction = ""] = normalized.split(".");
    return sum + BigInt(whole) * base + BigInt(fraction.slice(0, scale).padEnd(scale, "0"));
  }, 0n);
  const fraction = (total % base).toString().padStart(scale, "0").replace(/0+$/, "");
  return fraction ? `${total / base}.${fraction}` : (total / base).toString();
}

function orderTime(order: SlotOrder) {
  return order.orderedAt || order.executedAt || order.createdAt || order.updatedAt;
}

function formatDecimal(value: string, maximumFractionDigits: number) {
  const normalized = String(value || "").replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return "0";
  const [whole, fraction = ""] = normalized.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmed = fraction.slice(0, maximumFractionDigits).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

function formatBps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function formatDateTime(value: string) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { hour12: false }) : "--";
}

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
</script>

<style src="./SlotsView.css"></style>
