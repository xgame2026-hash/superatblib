<template>
  <section class="swap-page panel">
    <header class="swap-heading">
      <div>
        <p class="eyebrow">BNB SMART CHAIN · INSTANT EXCHANGE</p>
        <h2>{{ fromSymbol }} 兑换 {{ toSymbol }}</h2>
        <p>通过执行钱包完成链上兑换，收到的代币将直接发放到该钱包。</p>
      </div>
      <span class="swap-network">BNB Smart Chain</span>
    </header>

    <div v-if="!configured" class="swap-notice">请先在“设置 &gt; 通用”中保存执行钱包与服务 Token。</div>
    <div v-else class="swap-layout">
      <form class="swap-form" @submit.prevent="executeSwap">
        <label class="swap-token-card">
          <span>从（{{ fromSymbol }}）</span>
          <small>余额：{{ balanceFor(fromSymbol) }}</small>
          <div class="swap-input-wrap">
            <input v-model.trim="amount" inputmode="decimal" autocomplete="off" :placeholder="`输入 ${fromSymbol} 数量`" :aria-label="`${fromSymbol} 兑换金额`" />
            <strong>{{ fromSymbol }}</strong>
          </div>
        </label>

        <div class="swap-flip-row">
          <button class="swap-flip" type="button" :disabled="swapping" aria-label="反转兑换方向" @click="toggleDirection">⇅</button>
        </div>

        <div class="swap-token-card swap-output-card">
          <span>至（{{ toSymbol }}）</span>
          <small>余额：{{ balanceFor(toSymbol) }}</small>
          <div class="swap-input-wrap">
            <input :value="quote ? formatAmount(quote.expectedReceive) : ''" readonly :placeholder="quoteLoading ? '报价中...' : '--'" :aria-label="`${toSymbol} 预计获得数量`" />
            <strong>{{ toSymbol }}</strong>
          </div>
        </div>

        <div class="swap-slippage-setting">
          <span>滑点设置</span>
          <div class="swap-slippage-options">
            <button v-for="option in presetSlippageOptions" :key="option.bps" type="button" :class="{ active: !customSlippage && slippageBps === option.bps }" :disabled="swapping" @click="selectPresetSlippage(option.bps)">{{ option.label }}</button>
            <button type="button" :class="{ active: customSlippage }" :disabled="swapping" @click="enableCustomSlippage">自定义</button>
          </div>
          <input v-if="customSlippage" v-model.trim="customSlippagePercent" class="swap-custom-slippage" inputmode="decimal" placeholder="输入 0.1–5 的百分比" aria-label="自定义最大滑点" />
        </div>

        <p class="swap-disclaimer">网络 Gas 费与实际成交滑点由购买者承担。实际获得少于所选滑点保护的最低数量时，交易会自动失败。</p>
        <button class="swap-submit" type="submit" :disabled="swapping || !isAmountValid || !isSlippageValid">
          {{ swapping ? swapStatus : "连接钱包并兑换" }}
        </button>
      </form>

      <aside class="swap-quote" aria-live="polite">
        <span>兑换报价</span>
        <template v-if="quote">
          <strong>约 {{ formatAmount(quote.expectedReceive) }} {{ quote.toSymbol }}</strong>
          <dl>
            <div><dt>支付</dt><dd>{{ quote.amountIn }} {{ quote.fromSymbol }}</dd></div>
            <div><dt>最低获得</dt><dd>{{ formatAmount(quote.minReceive) }} {{ quote.toSymbol }}</dd></div>
            <div><dt>最大滑点</dt><dd>{{ formatBps(quote.slippageBps) }}</dd></div>
          </dl>
        </template>
        <p v-else-if="quoteLoading">正在读取链上的实时兑换报价…</p>
        <p v-else-if="quoteError">{{ quoteError }}</p>
        <p v-else>输入金额后将自动读取链上的实时兑换报价。</p>
        <small>xBCH 合约：0xf447…70fd</small>
      </aside>
    </div>

    <div v-if="swapError" class="swap-error">{{ swapError }}</div>
    <div v-if="swapResult" class="swap-result">
      <strong>兑换成功</strong>
      <span>支付 {{ swapResult.amountIn }} {{ swapResult.fromSymbol }}，获得 {{ formatAmount(swapResult.amountOut) }} {{ swapResult.toSymbol }}</span>
      <a :href="`https://bscscan.com/tx/${swapResult.txHash}`" target="_blank" rel="noopener noreferrer">查看交易</a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useAppKit, useAppKitProvider } from "@reown/appkit/vue";
import { isReownEnabled } from "../../reown";

type Eip1193Provider = { request: (request: { method: string; params?: unknown[] }) => Promise<unknown> };
type SwapQuote = {
  direction: "usdt_to_xbch" | "xbch_to_usdt";
  fromSymbol: "USDT" | "xBCH";
  toSymbol: "USDT" | "xBCH";
  amountIn: string;
  expectedReceive: string;
  minReceive: string;
  slippageBps: number;
  router: string;
  inputTokenAddress: string;
  outputTokenAddress: string;
  approvalData: string;
  executionData: string;
};
type SwapQuotePayload = { ok?: boolean; walletAddress?: string; swap?: SwapQuote; error?: string };
type SwapResult = { txHash: string; amountIn: string; amountOut: string; fromSymbol: "USDT" | "xBCH"; toSymbol: "USDT" | "xBCH" };
type SwapBalances = { usdt: string; xbch: string };

const props = withDefaults(defineProps<{ configured?: boolean }>(), { configured: true });
const amount = ref("");
const direction = ref<"usdt_to_xbch" | "xbch_to_usdt">("usdt_to_xbch");
const slippageBps = ref(100);
const customSlippage = ref(false);
const customSlippagePercent = ref("");
const swapping = ref(false);
const swapStatus = ref("处理中...");
const swapError = ref("");
const quote = ref<SwapQuote | null>(null);
const quoteLoading = ref(false);
const quoteError = ref("");
const swapResult = ref<SwapResult | null>(null);
const balances = ref<SwapBalances>({ usdt: "--", xbch: "--" });
const reownModal = isReownEnabled ? useAppKit() : null;
const reownProvider = isReownEnabled ? useAppKitProvider<Eip1193Provider>("eip155") : null;

const presetSlippageOptions = [
  { bps: 50, label: "0.5%" }, { bps: 100, label: "1%" }, { bps: 300, label: "3%" }, { bps: 500, label: "5%" },
] as const;
const fromSymbol = computed(() => direction.value === "usdt_to_xbch" ? "USDT" : "xBCH");
const toSymbol = computed(() => direction.value === "usdt_to_xbch" ? "xBCH" : "USDT");
const effectiveSlippageBps = computed(() => {
  if (!customSlippage.value) return slippageBps.value;
  const percent = Number(customSlippagePercent.value);
  return Number.isFinite(percent) ? Math.round(percent * 100) : 0;
});
const isAmountValid = computed(() => /^\d+(?:\.\d{1,18})?$/.test(amount.value) && Number(amount.value) >= 1);
const isSlippageValid = computed(() => effectiveSlippageBps.value >= 10 && effectiveSlippageBps.value <= 500);
let quoteTimer = 0;

onMounted(() => void loadBalances());

watch([amount, direction, effectiveSlippageBps], () => {
  if (quoteTimer) window.clearTimeout(quoteTimer);
  quote.value = null;
  quoteError.value = "";
  if (!isAmountValid.value || !isSlippageValid.value) return;
  quoteTimer = window.setTimeout(() => void refreshLiveQuote(), 350);
});

function toggleDirection() {
  direction.value = direction.value === "usdt_to_xbch" ? "xbch_to_usdt" : "usdt_to_xbch";
  swapResult.value = null;
  swapError.value = "";
}

function selectPresetSlippage(bps: number) {
  customSlippage.value = false;
  slippageBps.value = bps;
}

function enableCustomSlippage() {
  customSlippage.value = true;
  customSlippagePercent.value = (slippageBps.value / 100).toString();
}

function balanceFor(symbol: "USDT" | "xBCH") {
  const balance = symbol === "USDT" ? balances.value.usdt : balances.value.xbch;
  return balance === "--" ? "--" : `${formatAmount(balance)} ${symbol}`;
}

async function loadBalances() {
  try {
    const response = await fetch("/api/swap/balances", { cache: "no-store", headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; usdt?: string; xbch?: string };
    if (!response.ok || payload.ok === false || !payload.usdt || !payload.xbch) return;
    balances.value = { usdt: payload.usdt, xbch: payload.xbch };
  } catch {
    // Balance is contextual information only; a quote and wallet transaction can still proceed.
  }
}

async function refreshLiveQuote() {
  quoteLoading.value = true;
  try {
    const payload = await requestQuote();
    quote.value = payload.swap || null;
    quoteError.value = "";
  } catch (error) {
    quote.value = null;
    quoteError.value = error instanceof Error ? error.message : "暂时无法获取链上报价。";
  } finally {
    quoteLoading.value = false;
  }
}

async function executeSwap() {
  if (!isAmountValid.value) {
    swapError.value = `请输入至少 1 ${fromSymbol.value} 的兑换金额。`;
    return;
  }
  if (!isSlippageValid.value) {
    swapError.value = "最大滑点仅支持 0.1% 到 5%。";
    return;
  }
  swapping.value = true;
  swapError.value = "";
  swapResult.value = null;
  try {
    swapStatus.value = "连接执行钱包...";
    const provider = await selectWallet();
    await ensureBscNetwork(provider);
    const accounts = await provider.request({ method: "eth_requestAccounts" }) as unknown;
    const connectedAddress = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0].toLowerCase() : "";
    if (!connectedAddress) throw new Error("未读取到钱包地址。请重新连接执行钱包。");

    swapStatus.value = "获取链上报价...";
    const quoted = await requestQuote();
    if (!quoted.swap || quoted.walletAddress?.toLowerCase() !== connectedAddress) throw new Error("连接的钱包必须与通用设置中的执行钱包一致。");
    quote.value = quoted.swap;

    swapStatus.value = `检查 ${quote.value.fromSymbol} 授权...`;
    const allowance = await readTokenAllowance(provider, connectedAddress, quote.value.inputTokenAddress, quote.value.router);
    if (allowance < parseUnits(quote.value.amountIn)) {
      swapStatus.value = `请在钱包中确认 ${quote.value.fromSymbol} 授权...`;
      const approvalHash = await sendTransaction(provider, { from: connectedAddress, to: quote.value.inputTokenAddress, data: quote.value.approvalData });
      await waitForReceipt(provider, approvalHash);
    }

    swapStatus.value = "请在钱包中确认兑换...";
    const txHash = await sendTransaction(provider, { from: connectedAddress, to: quote.value.router, data: quote.value.executionData });
    swapStatus.value = "等待链上确认...";
    await waitForReceipt(provider, txHash);
    swapStatus.value = "核验链上兑换...";
    const response = await fetch("/api/swap/confirm", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ txHash, direction: direction.value }),
    });
    const confirmed = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; amountIn?: string; amountOut?: string } & Partial<SwapResult>;
    if (!response.ok || confirmed.ok === false || !confirmed.txHash || !confirmed.amountIn || !confirmed.amountOut) {
      throw new Error(confirmed.error || "交易已上链，但核验失败；请稍后重试。");
    }
    swapResult.value = { txHash: confirmed.txHash, amountIn: confirmed.amountIn, amountOut: confirmed.amountOut, fromSymbol: fromSymbol.value, toSymbol: toSymbol.value };
    await loadBalances();
  } catch (error) {
    const candidate = error as { code?: number; message?: string };
    swapError.value = candidate?.code === 4001 ? "已在钱包中取消交易。" : (error instanceof Error ? error.message : "兑换失败，请稍后重试。");
  } finally {
    swapping.value = false;
    swapStatus.value = "处理中...";
  }
}

async function requestQuote(): Promise<SwapQuotePayload> {
  const response = await fetch("/api/swap/quote", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ amount: amount.value, direction: direction.value, slippageBps: effectiveSlippageBps.value }),
  });
  const payload = await response.json().catch(() => ({})) as SwapQuotePayload;
  if (!response.ok || payload.ok === false || !payload.swap) throw new Error(payload.error || "暂时无法获取链上报价。");
  return payload;
}

async function selectWallet(): Promise<Eip1193Provider> {
  if (isEip1193Provider(reownProvider?.walletProvider)) return reownProvider.walletProvider;
  if (!isReownEnabled || !reownModal) throw new Error("钱包连接服务尚未初始化，请刷新页面后重试。");
  await reownModal.open({ view: "Connect" });
  if (isEip1193Provider(reownProvider?.walletProvider)) return reownProvider.walletProvider;
  throw new Error("请在钱包中选择账户并完成连接。");
}

function isEip1193Provider(value: unknown): value is Eip1193Provider {
  return Boolean(value) && typeof (value as Eip1193Provider).request === "function";
}

async function ensureBscNetwork(provider: Eip1193Provider) {
  if (String(await provider.request({ method: "eth_chainId" })).toLowerCase() === "0x38") return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x38", chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: ["https://rpc.bscpro.supermtglobal.com"], blockExplorerUrls: ["https://bscscan.com"] }] });
  }
}

async function readTokenAllowance(provider: Eip1193Provider, owner: string, token: string, spender: string): Promise<bigint> {
  const value = await provider.request({ method: "eth_call", params: [{ to: token, data: `0xdd62ed3e${encodeAddress(owner)}${encodeAddress(spender)}` }, "latest"] });
  return /^0x[0-9a-f]+$/i.test(String(value)) ? BigInt(String(value)) : 0n;
}

async function sendTransaction(provider: Eip1193Provider, transaction: { from: string; to: string; data: string }): Promise<string> {
  const hash = String(await provider.request({ method: "eth_sendTransaction", params: [transaction] }) || "");
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("钱包未返回有效交易哈希。");
  return hash;
}

async function waitForReceipt(provider: Eip1193Provider, txHash: string) {
  const timeoutAt = Date.now() + 180_000;
  while (Date.now() < timeoutAt) {
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] }) as { status?: string } | null;
    if (receipt) {
      if (String(receipt.status).toLowerCase() !== "0x1") throw new Error("链上交易执行失败。");
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
  }
  throw new Error("交易仍在等待链上确认，请稍后在 BscScan 查询。");
}

function parseUnits(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.slice(0, 18).padEnd(18, "0"));
}

function encodeAddress(value: string) {
  const normalized = value.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(normalized)) throw new Error("钱包地址无效。");
  return normalized.padStart(64, "0");
}

function formatAmount(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return fraction ? `${whole}.${fraction.slice(0, 8)}` : whole;
}

function formatBps(value: number) {
  return `${(value / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}
</script>

<style scoped src="./SwapView.css"></style>
