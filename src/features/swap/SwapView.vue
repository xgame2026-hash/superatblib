<template>
  <section class="swap-page">
    <div class="swap-shell panel">
      <div class="panel-heading swap-heading">
        <div>
          <p class="eyebrow">BSC · PancakeSwap V2</p>
          <h3>{{ t("swap.title") }}</h3>
        </div>
      </div>

      <div class="swap-tabs" role="tablist" aria-label="Swap sections">
        <button
          class="swap-tab"
          :class="{ 'is-active': activeTab === 'swap' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'swap'"
          @click="activeTab = 'swap'"
        >兑换</button>
        <button
          class="swap-tab"
          :class="{ 'is-active': activeTab === 'history' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'history'"
          @click="activeTab = 'history'"
        >兑换记录 <span v-if="history.length" class="swap-tab-count">{{ history.length }}</span></button>
      </div>

      <div v-show="activeTab === 'swap'" class="swap-tab-panel" role="tabpanel">
        <div v-if="statusError" class="swap-alert swap-alert-error">
          <strong>{{ t("swap.statusUnavailable") }}</strong>
          <span>{{ statusError }}</span>
        </div>
        <div v-else-if="status && !status.wallet.configured" class="swap-alert swap-alert-warning">
          <strong>{{ t("swap.walletMissing") }}</strong>
          <span>{{ t("swap.walletMissingHint") }}</span>
        </div>

        <div class="swap-workspace">
          <div class="swap-card">
            <div class="swap-token-panel">
              <div class="swap-token-head">
                <span>{{ t("swap.from") }}</span>
                <span>{{ t("swap.balance") }}: {{ fromBalanceDisplay }} {{ fromToken }}</span>
              </div>
              <el-input
                v-model="fromAmount"
                class="swap-amount-input"
                inputmode="decimal"
                autocomplete="off"
                placeholder="0.0"
                @input="normalizeFromAmount"
              >
                <template #suffix><span class="swap-token-symbol">{{ fromToken }}</span></template>
              </el-input>
            </div>

            <button
              class="swap-flip-button"
              :class="{ 'is-animating': flipAnimating }"
              type="button"
              :aria-label="t('swap.flip')"
              @click="toggleDirection"
            >
              <span aria-hidden="true">⇅</span>
            </button>

            <div class="swap-token-panel">
              <div class="swap-token-head">
                <span>{{ t("swap.to") }}</span>
                <span>{{ t("swap.balance") }}: {{ toBalanceDisplay }} {{ toToken }}</span>
              </div>
              <el-input
                :model-value="quote?.amountOut || ''"
                class="swap-amount-input"
                readonly
                :placeholder="quoteLoading ? t('swap.quoting') : '0.0'"
              >
                <template #suffix><span class="swap-token-symbol">{{ toToken }}</span></template>
              </el-input>
            </div>

            <div class="swap-settings-row">
              <span>{{ t("swap.slippage") }}</span>
              <el-select v-model="slippageBps" class="swap-slippage-select" :disabled="submitting">
                <el-option label="0.5%" :value="50" />
                <el-option label="1.0%" :value="100" />
                <el-option label="3.0%" :value="300" />
              </el-select>
            </div>

            <div v-if="quoteError" class="swap-alert swap-alert-error swap-quote-error">
              <span>{{ quoteError }}</span>
            </div>

            <section class="swap-quote-card" :class="{ 'is-loading': quoteLoading }">
              <header class="swap-quote-heading">
                <strong>报价详情</strong>
                <span>实时链上报价</span>
              </header>
              <div class="swap-summary">
                <div>
                  <span>{{ t("swap.rate") }}</span>
                  <strong>{{ rateDisplay }}</strong>
                </div>
                <div>
                  <span>{{ t("swap.minimumReceived") }}</span>
                  <strong>{{ quote ? `${formatDisplayAmount(quote.minimumReceived, 8)} ${toToken}` : "--" }}</strong>
                </div>
                <div>
                  <span>{{ t("swap.priceImpact") }}</span>
                  <strong :class="priceImpactClass">{{ priceImpactDisplay }}</strong>
                </div>
                <div>
                  <span>{{ t("swap.xbchTax") }}</span>
                  <strong>{{ taxDisplay }}</strong>
                </div>
                <div>
                  <span>{{ t("swap.route") }}</span>
                  <strong>{{ fromToken }} → {{ toToken }} · V2 Direct</strong>
                </div>
              </div>
              <p class="swap-tax-note">{{ t("swap.taxNote") }}</p>
            </section>

            <el-button
              class="swap-submit-button"
              type="primary"
              :loading="submitting"
              :disabled="primaryDisabled"
              @click="performPrimaryAction"
            >{{ primaryLabel }}</el-button>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'history'" class="swap-history swap-tab-panel" role="tabpanel">
        <div class="swap-history-heading">
          <div>
            <p class="eyebrow">ON-CHAIN ACTIVITY</p>
            <h4>{{ t("swap.history") }}</h4>
          </div>
          <span>{{ history.length }} 笔</span>
        </div>
        <div v-if="history.length === 0" class="swap-empty">{{ t("swap.noHistory") }}</div>
        <article v-for="item in history" :key="item.txHash" class="swap-history-row">
          <div class="swap-history-direction">
            <strong>{{ item.fromAmount }} {{ item.fromToken }} <i>→</i> {{ item.toAmount }} {{ item.toToken }}</strong>
            <span>{{ formatDateTime(item.createdAt) }}</span>
          </div>
          <a :href="`https://bscscan.com/tx/${item.txHash}`" target="_blank" rel="noopener noreferrer">
            {{ shortHash(item.txHash) }} ↗
          </a>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { t } from "../../i18n";

type SwapToken = "xBCH" | "USDT";

type SwapStatus = {
  chainId: number;
  wallet: { configured: boolean; address: string; bnbBalance: string; feeExempt: boolean };
  tokens: Record<SwapToken, { address: string; balance: string; allowance: string }>;
  pool: {
    address: string;
    routerAddress: string;
    factoryAddress: string;
    reserveXBCH: string;
    reserveUSDT: string;
    spotPrice: string;
  };
  fees: { buyBurnBps: number; sellBurnBps: number; profitBurnBps: number; ammFeeBps: number };
  updatedAt: string;
  blockNumber?: number;
};

type SwapQuote = {
  fromToken: SwapToken;
  toToken: SwapToken;
  amountIn: string;
  amountOut: string;
  minimumReceived: string;
  rate: string;
  slippageBps: number;
  priceImpactBps: number;
  balance: string;
  allowance: string;
  needsApproval: boolean;
  feeExempt: boolean;
  tax: {
    buyBurnAmount: string;
    baseSellBurnAmount: string;
    profitSellBurnAmount: string;
    totalBurnAmount: string;
  };
  blockNumber?: number;
  expiresAt?: string;
};

type SwapHistoryItem = {
  txHash: string;
  fromToken: SwapToken;
  toToken: SwapToken;
  fromAmount: string;
  toAmount: string;
  createdAt: string;
};

const AUTH_CODE_KEY = "superarb-auth-code-v1.6.5";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.5";
const HISTORY_KEY = "superarb-xbch-swap-history-v1.6.5";

const fromToken = ref<SwapToken>("xBCH");
const fromAmount = ref("");
const slippageBps = ref(100);
const status = ref<SwapStatus | null>(null);
const quote = ref<SwapQuote | null>(null);
const statusLoading = ref(false);
const quoteLoading = ref(false);
const submitting = ref(false);
const statusError = ref("");
const quoteError = ref("");
const history = ref<SwapHistoryItem[]>(readHistory());
const activeTab = ref<"swap" | "history">("swap");
const flipAnimating = ref(false);
let quoteTimer: ReturnType<typeof setTimeout> | undefined;
let quoteController: AbortController | undefined;
let quoteSequence = 0;
let flipAnimationTimer: ReturnType<typeof setTimeout> | undefined;

const toToken = computed<SwapToken>(() => (fromToken.value === "xBCH" ? "USDT" : "xBCH"));
const currentBalance = computed(() => status.value?.tokens[fromToken.value].balance || "0");
const fromBalanceDisplay = computed(() => formatDisplayAmount(currentBalance.value, 6));
const toBalanceDisplay = computed(() => formatDisplayAmount(status.value?.tokens[toToken.value].balance || "0", 6));
const hasAmount = computed(() => isPositiveDecimal(fromAmount.value));
const hasEnoughBalance = computed(() => !hasAmount.value || compareDecimal(fromAmount.value, currentBalance.value) <= 0);
const hasGas = computed(() => !status.value || compareDecimal(status.value.wallet.bnbBalance, "0") > 0);
const primaryDisabled = computed(() => {
  if (submitting.value || statusLoading.value || quoteLoading.value) return true;
  if (!status.value?.wallet.configured || !hasAmount.value || !quote.value || quoteError.value) return true;
  return !hasEnoughBalance.value || !hasGas.value;
});
const primaryLabel = computed(() => {
  if (submitting.value) return quote.value?.needsApproval ? t("swap.approving") : t("swap.swapping");
  if (!status.value?.wallet.configured) return t("swap.configureWallet");
  if (!hasAmount.value) return t("swap.enterAmount");
  if (!hasEnoughBalance.value) return t("swap.insufficientBalance");
  if (!hasGas.value) return t("swap.insufficientGas");
  if (quoteLoading.value) return t("swap.quoting");
  if (quote.value?.needsApproval) return t("swap.approveToken", { token: fromToken.value });
  return t("swap.submit");
});
const rateDisplay = computed(() => {
  if (!quote.value) return "--";
  return `1 ${fromToken.value} ≈ ${formatDisplayAmount(quote.value.rate, 8)} ${toToken.value}`;
});
const priceImpactDisplay = computed(() => {
  if (!quote.value || !Number.isFinite(quote.value.priceImpactBps)) return "--";
  return `${(quote.value.priceImpactBps / 100).toFixed(2)}%`;
});
const priceImpactClass = computed(() => {
  const value = quote.value?.priceImpactBps || 0;
  return value >= 500 ? "swap-risk-high" : value >= 200 ? "swap-risk-medium" : "";
});
const taxDisplay = computed(() => {
  if (!quote.value) {
    const bps = fromToken.value === "USDT" ? status.value?.fees.buyBurnBps : status.value?.fees.sellBurnBps;
    return bps === undefined ? "--" : `${(bps / 100).toFixed(2)}%`;
  }
  if (quote.value.feeExempt) return t("swap.feeExempt");
  if (fromToken.value === "USDT") {
    return `${formatDisplayAmount(quote.value.tax.buyBurnAmount, 8)} xBCH (${formatBps(status.value?.fees.buyBurnBps)})`;
  }
  const profit = compareDecimal(quote.value.tax.profitSellBurnAmount, "0") > 0
    ? ` + ${formatDisplayAmount(quote.value.tax.profitSellBurnAmount, 8)} xBCH ${t("swap.profitBurn")}`
    : "";
  return `${formatDisplayAmount(quote.value.tax.baseSellBurnAmount, 8)} xBCH${profit}`;
});

watch([fromAmount, fromToken, slippageBps], scheduleQuote);

onMounted(() => {
  void refreshStatus();
});

onBeforeUnmount(() => {
  if (quoteTimer) clearTimeout(quoteTimer);
  quoteController?.abort();
  if (flipAnimationTimer) clearTimeout(flipAnimationTimer);
});

async function refreshStatus() {
  statusLoading.value = true;
  statusError.value = "";
  try {
    const payload = await requestJson<Record<string, unknown>>("/api/swap/status");
    status.value = normalizeStatus(payload);
    if (hasAmount.value) scheduleQuote();
  } catch (error) {
    status.value = null;
    quoteController?.abort();
    quote.value = null;
    statusError.value = errorMessage(error);
  } finally {
    statusLoading.value = false;
  }
}

function scheduleQuote() {
  if (quoteTimer) clearTimeout(quoteTimer);
  quoteController?.abort();
  quote.value = null;
  quoteError.value = "";
  if (!status.value?.wallet.configured || !isPositiveDecimal(fromAmount.value)) {
    quoteLoading.value = false;
    return;
  }
  quoteLoading.value = true;
  quoteTimer = setTimeout(() => void fetchQuote(), 320);
}

async function fetchQuote() {
  if (quoteTimer) {
    clearTimeout(quoteTimer);
    quoteTimer = undefined;
  }
  const sequence = ++quoteSequence;
  quoteController?.abort();
  quoteController = new AbortController();
  try {
    const payload = await requestJson<Record<string, unknown>>(
      "/api/swap/quote",
      {
        method: "POST",
        body: JSON.stringify({ fromToken: fromToken.value, amount: requestAmount(fromAmount.value), slippageBps: slippageBps.value }),
        signal: quoteController.signal,
      },
    );
    if (sequence !== quoteSequence) return;
    quote.value = normalizeQuote(payload);
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError" || sequence !== quoteSequence) return;
    quote.value = null;
    quoteError.value = errorMessage(error);
  } finally {
    if (sequence === quoteSequence) quoteLoading.value = false;
  }
}

function toggleDirection() {
  flipAnimating.value = false;
  requestAnimationFrame(() => {
    flipAnimating.value = true;
    if (flipAnimationTimer) clearTimeout(flipAnimationTimer);
    flipAnimationTimer = setTimeout(() => {
      flipAnimating.value = false;
    }, 560);
  });
  const previousOutput = quote.value?.amountOut || "";
  fromToken.value = toToken.value;
  fromAmount.value = normalizeDecimalText(previousOutput);
}

function normalizeFromAmount() {
  fromAmount.value = normalizeDecimalText(fromAmount.value);
}

async function performPrimaryAction() {
  const activeQuote = quote.value;
  if (!activeQuote || primaryDisabled.value) return;

  if (activeQuote.needsApproval) {
    await approveInputToken(activeQuote);
    return;
  }
  await executeSwap(activeQuote);
}

async function approveInputToken(activeQuote: SwapQuote) {
  try {
    await ElMessageBox.confirm(
      t("swap.approveConfirmMessage", { amount: activeQuote.amountIn, token: activeQuote.fromToken }),
      t("swap.approveConfirmTitle"),
      { type: "warning", confirmButtonText: t("swap.confirmApprove"), cancelButtonText: t("swap.cancel") },
    );
  } catch {
    return;
  }

  submitting.value = true;
  try {
    const payload = await requestJson<{ txHash?: string }>("/api/swap/approve", {
      method: "POST",
      body: JSON.stringify({ fromToken: activeQuote.fromToken, amount: activeQuote.amountIn }),
    });
    ElMessage.success(t("swap.approvalConfirmed", { hash: shortHash(payload.txHash || "") }));
    await refreshStatus();
    await fetchQuote();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    submitting.value = false;
  }
}

async function executeSwap(activeQuote: SwapQuote) {
  const tax = taxDisplay.value;
  try {
    await ElMessageBox.confirm(
      t("swap.swapConfirmMessage", {
        amountIn: activeQuote.amountIn,
        fromToken: activeQuote.fromToken,
        amountOut: activeQuote.amountOut,
        toToken: activeQuote.toToken,
        minimum: activeQuote.minimumReceived,
        tax,
      }),
      t("swap.swapConfirmTitle"),
      { type: "warning", confirmButtonText: t("swap.confirmSwap"), cancelButtonText: t("swap.cancel") },
    );
  } catch {
    return;
  }

  submitting.value = true;
  try {
    const payload = await requestJson<Record<string, unknown>>("/api/swap/execute", {
      method: "POST",
      body: JSON.stringify({
        fromToken: activeQuote.fromToken,
        amount: activeQuote.amountIn,
        slippageBps: slippageBps.value,
        minimumReceived: activeQuote.minimumReceived,
      }),
    });
    const txHash = String(payload.txHash || "");
    const confirmedQuote = normalizeQuote(payload.quote && typeof payload.quote === "object" ? payload.quote as Record<string, unknown> : activeQuote as unknown as Record<string, unknown>);
    if (txHash) addHistory(txHash, confirmedQuote);
    ElMessage.success(t("swap.swapConfirmed", { hash: shortHash(txHash) }));
    fromAmount.value = "";
    quote.value = null;
    activeTab.value = "history";
    await refreshStatus();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    submitting.value = false;
  }
}

function normalizeStatus(payload: Record<string, unknown>): SwapStatus {
  const wallet = asRecord(payload.wallet);
  const balances = asRecord(payload.balances);
  const allowances = asRecord(payload.allowances);
  const tokens = asRecord(payload.tokens);
  const xbch = asRecord(tokens.xBCH);
  const usdt = asRecord(tokens.USDT);
  const contracts = asRecord(payload.contracts);
  const pool = asRecord(payload.pool);
  const fees = asRecord(payload.fees);
  const walletAddress = stringValue(wallet.address || payload.walletAddress);
  return {
    chainId: numberValue(payload.chainId, 56),
    wallet: {
      configured: booleanValue(wallet.configured, Boolean(walletAddress)),
      address: walletAddress,
      bnbBalance: stringValue(wallet.bnbBalance || balances.BNB || "0"),
      feeExempt: booleanValue(wallet.feeExempt || payload.feeExempt, false),
    },
    tokens: {
      xBCH: {
        address: stringValue(xbch.address || contracts.xBCH),
        balance: stringValue(xbch.balance || balances.xBCH || "0"),
        allowance: stringValue(xbch.allowance || allowances.xBCH || "0"),
      },
      USDT: {
        address: stringValue(usdt.address || contracts.USDT),
        balance: stringValue(usdt.balance || balances.USDT || "0"),
        allowance: stringValue(usdt.allowance || allowances.USDT || "0"),
      },
    },
    pool: {
      address: stringValue(pool.address || contracts.pair),
      routerAddress: stringValue(pool.routerAddress || contracts.router),
      factoryAddress: stringValue(pool.factoryAddress || contracts.factory),
      reserveXBCH: stringValue(pool.reserveXBCH || pool.xBCH || "0"),
      reserveUSDT: stringValue(pool.reserveUSDT || pool.USDT || "0"),
      spotPrice: stringValue(pool.spotPrice || pool.spotUsdtPerXbch || "0"),
    },
    fees: {
      buyBurnBps: numberValue(fees.buyBurnBps || fees.buyBurn, 300),
      sellBurnBps: numberValue(fees.sellBurnBps || fees.sellBaseBurn, 300),
      profitBurnBps: numberValue(fees.profitBurnBps || fees.profitBurn, 1000),
      ammFeeBps: numberValue(fees.ammFeeBps || fees.amm, 25),
    },
    updatedAt: stringValue(payload.updatedAt || new Date().toISOString()),
    blockNumber: numberValue(payload.blockNumber, 0) || undefined,
  };
}

function normalizeQuote(payload: Record<string, unknown>): SwapQuote {
  const root = payload.quote && typeof payload.quote === "object" ? asRecord(payload.quote) : payload;
  const tax = asRecord(root.tax);
  const impact = root.priceImpactBps !== undefined
    ? numberValue(root.priceImpactBps, 0)
    : Math.round(numberValue(root.priceImpactPct, 0) * 100);
  return {
    fromToken: root.fromToken === "USDT" ? "USDT" : "xBCH",
    toToken: root.toToken === "xBCH" ? "xBCH" : "USDT",
    amountIn: stringValue(root.amountIn),
    amountOut: stringValue(root.actualAmountOut || root.amountOut),
    minimumReceived: stringValue(root.minimumReceived),
    rate: stringValue(root.rate),
    slippageBps: numberValue(root.slippageBps, slippageBps.value),
    priceImpactBps: impact,
    balance: stringValue(root.balance),
    allowance: stringValue(root.allowance),
    needsApproval: booleanValue(root.needsApproval, false),
    feeExempt: booleanValue(root.feeExempt || tax.feeExempt, false),
    tax: {
      buyBurnAmount: stringValue(tax.buyBurnAmount || tax.buyBurn || "0"),
      baseSellBurnAmount: stringValue(tax.baseSellBurnAmount || tax.baseSellBurn || "0"),
      profitSellBurnAmount: stringValue(tax.profitSellBurnAmount || tax.profitSellBurn || "0"),
      totalBurnAmount: stringValue(tax.totalBurnAmount || tax.totalBurn || "0"),
    },
    blockNumber: numberValue(root.blockNumber, 0) || undefined,
    expiresAt: stringValue(root.expiresAt) || undefined,
  };
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const authCode = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim();
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (authCode) headers.set("x-supermtnode-auth-code", authCode);
  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) throw new Error(stringValue(payload.error || payload.message || `HTTP ${response.status}`));
  return payload as T;
}

function addHistory(txHash: string, completed: SwapQuote) {
  history.value = [
    {
      txHash,
      fromToken: completed.fromToken,
      toToken: completed.toToken,
      fromAmount: completed.amountIn,
      toAmount: completed.amountOut,
      createdAt: new Date().toISOString(),
    },
    ...history.value.filter((item) => item.txHash !== txHash),
  ].slice(0, 10);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value));
}

function readHistory(): SwapHistoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as SwapHistoryItem[];
    return Array.isArray(parsed) ? parsed.filter((item) => /^0x[\da-f]{64}$/i.test(item.txHash)).slice(0, 10) : [];
  } catch {
    return [];
  }
}

function normalizeDecimalText(value: string) {
  const normalized = String(value || "").replace(/,/g, "").replace(/[^\d.]/g, "");
  const [integer = "", ...fractionParts] = normalized.split(".");
  const fraction = fractionParts.join("").slice(0, 18);
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  return fractionParts.length > 0 ? `${normalizedInteger || "0"}.${fraction}` : normalizedInteger;
}

function requestAmount(value: string) {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

function isPositiveDecimal(value: string) {
  return /^\d+(?:\.\d{0,18})?$/.test(value) && compareDecimal(value, "0") > 0;
}

function compareDecimal(left: string, right: string) {
  const toUnits = (value: string) => {
    const normalized = String(value || "0").replace(/,/g, "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return 0n;
    const [whole, fraction = ""] = normalized.split(".");
    return BigInt(whole || "0") * 10n ** 18n + BigInt(fraction.slice(0, 18).padEnd(18, "0"));
  };
  const a = toUnits(left);
  const b = toUnits(right);
  return a === b ? 0 : a > b ? 1 : -1;
}

function formatDisplayAmount(value: string | number | undefined, maxFraction = 6) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) return "--";
  const [whole, fraction = ""] = raw.split(".");
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

function formatBps(value?: number) {
  return value === undefined ? "--" : `${(value / 100).toFixed(2)}%`;
}

function formatDateTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { hour12: false });
}

function shortAddress(value: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "--";
}

function shortHash(value: string) {
  return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "--";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
</script>

<style src="./SwapView.css"></style>
