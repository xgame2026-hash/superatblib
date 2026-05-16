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
import { onMounted, ref } from "vue";

type ChainKey = "ethereum" | "bnb" | "arbitrum";

type RpcUsageMetric = {
  chain: ChainKey;
  rpcConfigured: boolean;
  requestCount: number | null;
  requestLimit: number | null;
  remainingRequests: number | null;
  status: "ok" | "missing_rpc" | "missing_credentials" | "unmatched" | "error";
  message?: string;
};

const loading = ref(false);
const error = ref("");
const rpcUsage = ref<Record<ChainKey, RpcUsageMetric>>(createEmptyRpcUsage());

onMounted(() => {
  void refresh();
});

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const response = await fetch("/api/rpc/usage", { headers: { accept: "application/json" } });
    const payload = (await response.json().catch(() => ({}))) as { metrics?: Partial<Record<ChainKey, RpcUsageMetric>>; error?: string };
    if (!response.ok && !payload.metrics) throw new Error(payload.error ?? "RPC 使用量读取失败");
    rpcUsage.value = {
      ...createEmptyRpcUsage(),
      ...payload.metrics,
    };
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "RPC 使用量读取失败";
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
    status: "missing_rpc",
  };
}

function formatRpcUsage(metric: RpcUsageMetric): string {
  if (typeof metric.requestCount === "number") return new Intl.NumberFormat("en-US").format(metric.requestCount);
  if (typeof metric.remainingRequests === "number" && typeof metric.requestLimit === "number" && metric.requestLimit > 0) {
    return new Intl.NumberFormat("en-US").format(Math.max(0, metric.requestLimit - metric.remainingRequests));
  }
  return "--";
}

function formatRpcStatus(metric: RpcUsageMetric): string {
  const statusText: Record<RpcUsageMetric["status"], string> = {
    ok: "正常",
    missing_rpc: "未配置 RPC",
    missing_credentials: "缺少 Token",
    unmatched: "未匹配端点",
    error: /invalid token|missing token|401/i.test(metric.message ?? "") ? "Token 失效" : "读取失败",
  };
  return statusText[metric.status] ?? "--";
}
</script>
