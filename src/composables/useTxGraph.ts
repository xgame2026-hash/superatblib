import { ref } from "vue";
import type { TxGraphChainKey, TxGraphPayload } from "../types/txGraph";

export function useTxGraph() {
  const data = ref<TxGraphPayload | null>(null);
  const loading = ref(false);
  const error = ref("");

  async function loadGraph(chain: TxGraphChainKey, txHash: string) {
    loading.value = true;
    error.value = "";
    try {
      const query = new URLSearchParams({ chain, txHash });
      const response = await fetch(`/api/tx-graph?${query.toString()}`);
      const payload = (await response.json().catch(() => ({}))) as TxGraphPayload | { error?: string };
      if (!response.ok || !("ok" in payload)) {
        throw new Error("error" in payload ? payload.error ?? "查询失败" : "查询失败");
      }
      data.value = payload;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "查询失败";
    } finally {
      loading.value = false;
    }
  }

  return {
    data,
    loading,
    error,
    loadGraph,
  };
}
