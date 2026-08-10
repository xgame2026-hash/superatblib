<template>
  <section class="slots-page panel">
    <div class="panel-heading slots-heading">
      <div>
        <p class="eyebrow">WALLET_ADDRESS · RPC point-card billing</p>
      </div>
      <div class="slots-heading-actions">
        <span v-if="walletAddress" class="slots-wallet" :title="walletAddress">{{ shortAddress(walletAddress) }}</span>
        <button class="slots-refresh" type="button" :disabled="loading" @click="loadOrders(false)">
          {{ loading ? t("slots.refreshing") : t("slots.refresh") }}
        </button>
      </div>
    </div>

    <section v-if="configured" class="slot-purchase-panel">
      <div class="slot-purchase-heading">
        <div>
          <p class="eyebrow">RPC PLAN · SLOT POLICY</p>
          <h3>卡槽套餐规则</h3>
        </div>
      </div>

      <div class="slot-plan-grid">
        <article
          v-for="plan in purchasePlans"
          :key="plan.type"
          :class="{ active: purchasePolicy?.planType === plan.type }"
        >
          <strong>{{ plan.name }}</strong>
          <span>新用户最多 {{ plan.maxSlots }} 个卡槽</span>
        </article>
      </div>

      <div v-if="purchasePolicy" class="slot-purchase-controls">
        <div class="slot-purchase-capacity">
          <div class="slot-purchase-copy">
            <span>购买卡槽</span>
            <strong>每个卡槽 {{ purchasePolicy.unitPriceUsdt }} USDT</strong>
            <small>支付 USDT 后将由售卖合约向执行钱包发放 xBCH；链上交易手续费与成交滑点由购买者承担。当前还可购买 {{ purchasePolicy.remainingSlots }} 个。</small>
          </div>
          <div class="slot-purchase-metrics">
            <div>
              <span>已有卡槽</span>
              <strong>{{ purchasePolicy.purchasedSlots }}</strong>
            </div>
            <div>
              <span>{{ purchasePolicy.planName }} 上限</span>
              <strong>{{ purchasePolicy.maxSlots }}</strong>
            </div>
            <div class="is-available">
              <span>可购买</span>
              <strong>{{ purchasePolicy.remainingSlots }}</strong>
            </div>
          </div>
        </div>
        <div class="slot-purchase-form">
          <div>
            <span>本次购买</span>
            <strong>{{ slotPurchaseQuantity }} 个 · {{ slotPurchaseQuantity * purchasePolicy.unitPriceUsdt }} USDT</strong>
            <small>购买会严格受当前 RPC 套餐限制；请先选择最大滑点。本次交易由执行钱包亲自确认，Gas 费与成交滑点由购买者承担。</small>
          </div>
          <div class="slot-purchase-actions">
            <div class="slot-purchase-slippage">
              <span>滑点设置</span>
              <div class="slot-slippage-options">
                <button v-for="option in slippageOptions" :key="option.bps" type="button" :class="{ active: !slotPurchaseCustomSlippage && slotPurchaseSlippageBps === option.bps }" :disabled="purchaseBusy || purchasePolicy.remainingSlots < 1" @click="selectSlotSlippage(option.bps)">{{ option.label }}</button>
                <button type="button" :class="{ active: slotPurchaseCustomSlippage }" :disabled="purchaseBusy || purchasePolicy.remainingSlots < 1" @click="enableCustomSlotSlippage">自定义</button>
              </div>
              <input v-if="slotPurchaseCustomSlippage" v-model.trim="slotPurchaseCustomSlippagePercent" class="slot-custom-slippage" inputmode="decimal" placeholder="0.1–5" aria-label="自定义最大滑点" />
            </div>
            <input
              v-model.number="slotPurchaseQuantity"
              class="slot-purchase-quantity"
              type="number"
              min="1"
              :max="purchasePolicy.remainingSlots"
              step="1"
              :disabled="purchaseBusy || purchasePolicy.remainingSlots < 1"
              aria-label="购买卡槽数量"
            />
            <button
              class="slot-purchase-button"
              type="button"
              :disabled="purchaseBusy || purchasePolicy.remainingSlots < 1 || slotPurchaseQuantity < 1 || slotPurchaseQuantity > purchasePolicy.remainingSlots || !validSlotPurchaseSlippage"
              @click="purchaseSlots"
            >
              {{ purchaseBusy ? purchaseStatus : purchasePolicy.remainingSlots > 0 ? "连接钱包并购买" : "已达到当前套餐上限" }}
            </button>
          </div>
        </div>
        <div v-if="purchaseError" class="slot-purchase-error">{{ purchaseError }}</div>
        <div v-if="purchaseResult" class="slot-purchase-result">
          <strong>购买成功：{{ purchaseResult.slotCount }} 个卡槽</strong>
          <span>已获得 {{ formatDecimal(purchaseResult.xbchAmount, 8) }} xBCH</span>
          <a :href="purchaseResult.explorerUrl" target="_blank" rel="noopener noreferrer">查看交易</a>
        </div>
      </div>
    </section>

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

    <div v-else-if="!errorMessage" class="slots-grid">
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
import { useAppKit, useAppKitProvider } from "@reown/appkit/vue";
import { t } from "../../i18n";
import { isReownEnabled } from "../../reown";

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
  slotCount: number;
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
  purchase?: SlotPurchasePolicy;
  rpcPlan?: { rpcPlanType?: string; rpcPlanName?: string };
};

type SlotPurchasePolicy = {
  appliesTo: "new_users";
  planType: "build" | "accelerate" | "scale" | "business" | "unknown";
  planName: string;
  maxSlots: number;
  purchasedSlots: number;
  remainingSlots: number;
  unitPriceUsdt: number;
};

type Eip1193Provider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type SlotPurchaseQuote = {
  ok?: boolean;
  walletAddress?: string;
  chainId?: string;
  purchase?: {
    quantity: number;
    usdtAmount: string;
    expectedXbch: string;
    minXbch: string;
    saleAddress: string;
    usdtAddress: string;
    approvalData: string;
    buyData: string;
  };
  error?: string;
};

type SlotPurchaseResult = {
  txHash: string;
  slotCount: number;
  xbchAmount: string;
  explorerUrl: string;
};

const props = withDefaults(defineProps<{ configured?: boolean }>(), {
  configured: true,
});

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
const purchasePolicy = ref<SlotPurchasePolicy | null>(null);
const slotPurchaseQuantity = ref(1);
const slotPurchaseSlippageBps = ref(100);
const slotPurchaseCustomSlippage = ref(false);
const slotPurchaseCustomSlippagePercent = ref("");
const purchaseBusy = ref(false);
const purchaseStatus = ref("处理中...");
const purchaseError = ref("");
const purchaseResult = ref<SlotPurchaseResult | null>(null);
const reownModal = isReownEnabled ? useAppKit() : null;
const reownProvider = isReownEnabled ? useAppKitProvider<Eip1193Provider>("eip155") : null;
const statusFilter = ref("all");
const typeFilter = ref("all");
const searchQuery = ref("");
const currentPage = ref(1);
let refreshTimer = 0;
let loadController: AbortController | undefined;
let loadSequence = 0;
let requestInFlight = false;

const purchasePlans = [
  { type: "build", name: "Build", maxSlots: 4 },
  { type: "accelerate", name: "Accelerate", maxSlots: 10 },
  { type: "scale", name: "Scale", maxSlots: 20 },
  { type: "business", name: "Business", maxSlots: 100 },
] as const;

const slippageOptions = [
  { bps: 50, label: "0.5%" },
  { bps: 100, label: "1%" },
  { bps: 300, label: "3%" },
  { bps: 500, label: "5%" },
] as const;
const effectiveSlotPurchaseSlippageBps = computed(() => slotPurchaseCustomSlippage.value ? Math.round(Number(slotPurchaseCustomSlippagePercent.value) * 100) : slotPurchaseSlippageBps.value);
const validSlotPurchaseSlippage = computed(() => Number.isFinite(effectiveSlotPurchaseSlippageBps.value) && effectiveSlotPurchaseSlippageBps.value >= 10 && effectiveSlotPurchaseSlippageBps.value <= 500);

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
      headers: { accept: "application/json" },
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
    purchasePolicy.value = payload.purchase || null;
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

async function purchaseSlots() {
  const quantity = Math.floor(Number(slotPurchaseQuantity.value));
  const policy = purchasePolicy.value;
  if (!policy || quantity < 1 || quantity > policy.remainingSlots) {
    purchaseError.value = "购买数量超过当前 RPC 套餐可用卡槽。";
    return;
  }
  if (!validSlotPurchaseSlippage.value) {
    purchaseError.value = "最大滑点仅支持 0.1% 到 5%。";
    return;
  }
  purchaseBusy.value = true;
  purchaseError.value = "";
  purchaseResult.value = null;
  try {
    purchaseStatus.value = "连接执行钱包...";
    const provider = await selectPurchaseWallet();
    await ensureBscNetwork(provider);
    const accounts = await provider.request({ method: "eth_requestAccounts" }) as unknown;
    const connectedAddress = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0].toLowerCase() : "";
    if (!connectedAddress || connectedAddress !== walletAddress.value.toLowerCase()) {
      throw new Error("连接的钱包必须与通用设置中的执行钱包一致。");
    }

    purchaseStatus.value = "获取链上报价...";
    const quote = await requestPurchaseQuote(quantity, effectiveSlotPurchaseSlippageBps.value);
    if (!quote.purchase || quote.walletAddress?.toLowerCase() !== connectedAddress) throw new Error("购买报价与执行钱包不一致，请刷新后重试。");

    purchaseStatus.value = "检查 USDT 授权...";
    const allowance = await readUsdtAllowance(provider, connectedAddress, quote.purchase.usdtAddress, quote.purchase.saleAddress);
    const required = parseUnits(quote.purchase.usdtAmount);
    if (allowance < required) {
      purchaseStatus.value = "请在钱包中确认 USDT 授权...";
      const approvalHash = await sendWalletTransaction(provider, {
        from: connectedAddress,
        to: quote.purchase.usdtAddress,
        data: quote.purchase.approvalData,
      });
      await waitForConfirmedReceipt(provider, approvalHash);
    }

    purchaseStatus.value = "请在钱包中确认购买...";
    const txHash = await sendWalletTransaction(provider, {
      from: connectedAddress,
      to: quote.purchase.saleAddress,
      data: quote.purchase.buyData,
    });
    purchaseStatus.value = "等待链上确认...";
    await waitForConfirmedReceipt(provider, txHash);

    purchaseStatus.value = "同步订单记录...";
    const confirmation = await fetch("/api/slots/purchase-confirm", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ txHash }),
    });
    const confirmed = await confirmation.json().catch(() => ({})) as { ok?: boolean; error?: string; slotCount?: number; xbchAmount?: string; txHash?: string };
    if (!confirmation.ok || confirmed.ok === false || !confirmed.txHash) throw new Error(confirmed.error || "购买已上链，但订单缓存同步失败；请刷新记录重试。");
    purchaseResult.value = {
      txHash: confirmed.txHash,
      slotCount: Number(confirmed.slotCount || quantity),
      xbchAmount: String(confirmed.xbchAmount || quote.purchase.expectedXbch),
      explorerUrl: `https://bscscan.com/tx/${confirmed.txHash}`,
    };
    await loadOrders(false);
  } catch (error) {
    purchaseError.value = userFacingWalletError(error);
  } finally {
    purchaseBusy.value = false;
    purchaseStatus.value = "处理中...";
  }
}

function selectSlotSlippage(bps: number) {
  slotPurchaseCustomSlippage.value = false;
  slotPurchaseSlippageBps.value = bps;
}

function enableCustomSlotSlippage() {
  slotPurchaseCustomSlippage.value = true;
  slotPurchaseCustomSlippagePercent.value = (slotPurchaseSlippageBps.value / 100).toString();
}

async function selectPurchaseWallet(): Promise<Eip1193Provider> {
  const existingReownProvider = reownProvider?.walletProvider;
  if (isEip1193Provider(existingReownProvider)) return existingReownProvider;
  if (!isReownEnabled || !reownModal) throw new Error("钱包连接服务尚未初始化，请刷新页面后重试。");
  await reownModal.open({ view: "Connect" });
  const connectedReownProvider = reownProvider?.walletProvider;
  if (isEip1193Provider(connectedReownProvider)) return connectedReownProvider;
  throw new Error("请在钱包中选择账户并完成连接。");
}

function isEip1193Provider(value: unknown): value is Eip1193Provider {
  return Boolean(value) && typeof (value as Eip1193Provider).request === "function";
}

async function requestPurchaseQuote(quantity: number, slippageBps: number): Promise<SlotPurchaseQuote> {
  const response = await fetch("/api/slots/purchase-quote", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ quantity, slippageBps }),
  });
  const payload = await response.json().catch(() => ({})) as SlotPurchaseQuote;
  if (!response.ok || payload.ok === false || !payload.purchase) throw new Error(payload.error || "当前无法获取购买报价。");
  return payload;
}

async function ensureBscNetwork(provider: Eip1193Provider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() === "0x38") return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x38", chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
        rpcUrls: ["https://rpc.bscpro.supermtglobal.com"],
        blockExplorerUrls: ["https://bscscan.com"],
      }],
    });
  }
}

async function readUsdtAllowance(provider: Eip1193Provider, owner: string, token: string, spender: string): Promise<bigint> {
  const data = `0xdd62ed3e${encodeAddress(owner)}${encodeAddress(spender)}`;
  const value = await provider.request({ method: "eth_call", params: [{ to: token, data }, "latest"] });
  return /^0x[0-9a-f]+$/i.test(String(value)) ? BigInt(String(value)) : 0n;
}

async function sendWalletTransaction(provider: Eip1193Provider, transaction: { from: string; to: string; data: string }): Promise<string> {
  const result = await provider.request({ method: "eth_sendTransaction", params: [transaction] });
  const hash = String(result || "");
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("钱包未返回有效交易哈希。");
  return hash;
}

async function waitForConfirmedReceipt(provider: Eip1193Provider, txHash: string) {
  const timeoutAt = Date.now() + 180_000;
  while (Date.now() < timeoutAt) {
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] }) as { status?: string } | null;
    if (receipt) {
      if (String(receipt.status).toLowerCase() !== "0x1") throw new Error("链上交易执行失败。");
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
  }
  throw new Error("交易仍在等待链上确认，请稍后刷新卡槽记录。");
}

function encodeAddress(value: string) {
  const normalized = value.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(normalized)) throw new Error("钱包地址无效。");
  return normalized.padStart(64, "0");
}

function parseUnits(value: string) {
  const [whole, fraction = ""] = value.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) throw new Error("购买金额无效。");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.slice(0, 18).padEnd(18, "0"));
}

function userFacingWalletError(error: unknown) {
  const candidate = error as { code?: number; message?: string };
  if (candidate?.code === 4001) return "已在钱包中取消交易。";
  return error instanceof Error ? error.message : "购买卡槽失败，请稍后重试。";
}

function normalizeSummary(value: Partial<SlotsSummary> | undefined, rows: SlotOrder[]): SlotsSummary {
  const tradeRows = rows.filter((order) => isTradeOrderType(order.orderType));
  return {
    total: finiteInteger(value?.total, tradeRows.reduce((total, order) => total + slotQuantity(order), 0)),
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

function slotQuantity(order: SlotOrder) {
  if (Number.isSafeInteger(order.slotCount) && order.slotCount > 0) return order.slotCount;
  const amount = Number(order.usdtAmount || order.effectiveUsdtAmount || 0);
  return order.orderType === "buy_xbch" && Number.isFinite(amount) && amount > 0 ? Math.max(1, Math.floor(amount / 500)) : 0;
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
