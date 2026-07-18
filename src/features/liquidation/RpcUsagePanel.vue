<template>
  <slot
    :loading="loading"
    :error="error"
    :metrics="rpcUsage"
    :format-rpc-usage="formatRpcUsage"
    :format-rpc-status="formatRpcStatus"
    :refresh="refresh"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { t } from "../../i18n";

const props = withDefaults(defineProps<{ active?: boolean }>(), {
  active: true,
});

type ChainKey = "ethereum" | "bnb" | "arbitrum";

type RpcUsageMetric = {
  chain: ChainKey;
  rpcConfigured: boolean;
  requestCount: number | null;
  requestLimit: number | null;
  remainingRequests: number | null;
  creditBurnPerSecond?: number | null;
  status: "ok" | "missing_rpc" | "missing_credentials" | "unmatched" | "error";
  message?: string;
};

const loading = ref(false);
const error = ref("");
const rpcUsage = ref<Record<ChainKey, RpcUsageMetric>>(createEmptyRpcUsage());
const AUTH_CODE_KEY = "superarb-auth-code-v1.6.5";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.5";
const RUNNING_MARKET_STORAGE_KEY = "liq2-running-market";
const RPC_USAGE_REFRESH_INTERVAL_MS = 60_000;
const RPC_USAGE_TICK_INTERVAL_MS = 1_000;
let refreshTimer = 0;
let tickTimer = 0;

onMounted(() => {
  if (props.active) startRpcUsagePolling();
});

watch(
  () => props.active,
  (active) => {
    if (active) {
      startRpcUsagePolling();
      return;
    }
    stopRpcUsagePolling();
  },
);

onBeforeUnmount(() => {
  stopRpcUsagePolling();
});

function startRpcUsagePolling() {
  void refresh();
  if (!refreshTimer) {
    refreshTimer = window.setInterval(() => {
      void refresh();
    }, RPC_USAGE_REFRESH_INTERVAL_MS);
  }
  if (!tickTimer) tickTimer = window.setInterval(tickRpcUsage, RPC_USAGE_TICK_INTERVAL_MS);
}

function stopRpcUsagePolling() {
  if (refreshTimer) window.clearInterval(refreshTimer);
  if (tickTimer) window.clearInterval(tickTimer);
  refreshTimer = 0;
  tickTimer = 0;
}

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const authCode = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim();
    const response = await fetch("/api/rpc/usage", {
      headers: {
        accept: "application/json",
        ...(authCode ? { "x-supermtnode-auth-code": authCode } : {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as { metrics?: Partial<Record<ChainKey, RpcUsageMetric>>; error?: string };
    if (!response.ok && !payload.metrics) throw new Error(payload.error ?? t("rpc.usageReadFailed"));
    rpcUsage.value = {
      ...createEmptyRpcUsage(),
      ...payload.metrics,
    };
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t("rpc.usageReadFailed");
  } finally {
    loading.value = false;
  }
}

function createEmptyRpcUsage(): Record<ChainKey, RpcUsageMetric> {
  return {
    ethereum: createEmptyRpcUsageMetric("ethereum"),
    bnb: createEmptyRpcUsageMetric("bnb"),
    arbitrum: createEmptyRpcUsageMetric("arbitrum"),
  };
}

function createEmptyRpcUsageMetric(chain: ChainKey): RpcUsageMetric {
  return {
    chain,
    rpcConfigured: false,
    requestCount: null,
    requestLimit: null,
    remainingRequests: null,
    creditBurnPerSecond: null,
    status: "missing_rpc",
  };
}

function tickRpcUsage() {
  const runningMarket = readRunningMarket();
  if (!runningMarket) return;
  const nextUsage = { ...rpcUsage.value };
  let changed = false;
  for (const chain of Object.keys(nextUsage) as ChainKey[]) {
    if (chain !== runningMarket.chain) continue;
    const metric = nextUsage[chain];
    const burn =
      typeof metric.creditBurnPerSecond === "number" && Number.isFinite(metric.creditBurnPerSecond)
        ? metric.creditBurnPerSecond
        : runningMarket.creditBurnPerSecond;
    if (metric.status !== "ok" || burn <= 0 || typeof metric.requestCount !== "number") continue;
    const nextRequestCount = metric.requestCount + burn;
    const nextRemaining =
      typeof metric.remainingRequests === "number" ? Math.max(0, metric.remainingRequests - burn) : metric.remainingRequests;
    nextUsage[chain] = {
      ...metric,
      requestCount: nextRequestCount,
      remainingRequests: nextRemaining,
    };
    changed = true;
  }
  if (changed) rpcUsage.value = nextUsage;
}

function readRunningMarket(): { chain: ChainKey; creditBurnPerSecond: number } | null {
  const raw = localStorage.getItem(RUNNING_MARKET_STORAGE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as {
      queueState?: string;
      chain?: unknown;
      creditBurnPerSecond?: unknown;
      option?: { chain?: unknown; disabled?: boolean };
    };
    if (saved.queueState === "paused" || saved.option?.disabled) return null;
    const value = String(saved.chain || saved.option?.chain || "").toLowerCase();
    const creditBurnPerSecond =
      typeof saved.creditBurnPerSecond === "number" && Number.isFinite(saved.creditBurnPerSecond) ? saved.creditBurnPerSecond : 0;
    if (value.includes("bnb")) return { chain: "bnb", creditBurnPerSecond };
    if (value.includes("arb")) return { chain: "arbitrum", creditBurnPerSecond };
    if (value.includes("eth")) return { chain: "ethereum", creditBurnPerSecond };
    return null;
  } catch {
    return null;
  }
}

function formatRpcUsage(metric: RpcUsageMetric): string {
  if (typeof metric.requestCount === "number") return new Intl.NumberFormat("en-US").format(metric.requestCount);
  if (typeof metric.remainingRequests === "number" && typeof metric.requestLimit === "number" && metric.requestLimit > 0) {
    return new Intl.NumberFormat("en-US").format(Math.max(0, metric.requestLimit - metric.remainingRequests));
  }
  return "--";
}

function formatRpcStatus(metric: RpcUsageMetric): string {
  if (/expired/i.test(metric.message ?? "")) return t("rpc.expired");
  const statusText: Record<RpcUsageMetric["status"], string> = {
    ok: t("rpc.ok"),
    missing_rpc: t("rpc.missingRpc"),
    missing_credentials: t("rpc.missingCredentials"),
    unmatched: t("rpc.unmatched"),
    error: /invalid token|missing token|401/i.test(metric.message ?? "") ? t("rpc.tokenInvalid") : t("dashboard.readFailed"),
  };
  return statusText[metric.status] ?? "--";
}
</script>
