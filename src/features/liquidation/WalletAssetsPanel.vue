<template>
  <article class="panel wallet-panel">
    <div class="wallet-panel-header">
      <h3>钱包资产</h3>
      <button class="wallet-refresh-button" type="button" :disabled="loading" @click="refresh">
        {{ loading ? "查询中" : "刷新" }}
      </button>
    </div>

    <table class="wallet-table">
      <thead>
        <tr>
          <th>链</th>
          <th>GAS 余额</th>
          <th>USDC</th>
          <th>USDT</th>
          <th>RPC 用量</th>
        </tr>
      </thead>
      <tbody>
        <template v-if="loading">
          <tr v-for="index in skeletonRows" :key="`skeleton-${index}`" class="wallet-skeleton-row">
            <td><span class="wallet-skeleton wallet-skeleton-icon"></span></td>
            <td><span class="wallet-skeleton wallet-skeleton-value"></span></td>
            <td><span class="wallet-skeleton wallet-skeleton-value short"></span></td>
            <td><span class="wallet-skeleton wallet-skeleton-value"></span></td>
            <td><span class="wallet-skeleton wallet-skeleton-value"></span></td>
          </tr>
        </template>
        <template v-else>
          <tr v-for="item in chainRows" :key="item.key">
            <td><img :src="item.icon" :alt="item.label" /></td>
            <td>{{ item.asset.gas }}</td>
            <td>{{ item.asset.usdc }}</td>
            <td>{{ item.asset.usdt }}</td>
            <td><slot name="rpc-usage" :chain="item.key">--</slot></td>
          </tr>
        </template>
      </tbody>
    </table>
  </article>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import arbIcon from "../../img/arb.svg";
import bnbIcon from "../../img/bnb.svg";
import ethIcon from "../../img/eth.svg";

type ChainKey = "ethereum" | "bnb" | "arbitrum";

type ChainMeta = {
  key: ChainKey;
  label: string;
  icon: string;
};

type WalletAssetRow = {
  key: ChainKey;
  gas: string;
  usdc: string;
  usdt: string;
};

const emit = defineEmits<{
  refresh: [];
}>();

const chains: ChainMeta[] = [
  { key: "ethereum", label: "Ethereum", icon: ethIcon },
  { key: "bnb", label: "BNB", icon: bnbIcon },
  { key: "arbitrum", label: "Arbitrum", icon: arbIcon },
];

const loading = ref(false);
const skeletonRows = [1, 2, 3];
const walletAssets = ref<WalletAssetRow[]>(
  chains.map((chain) => ({
    key: chain.key,
    gas: "--",
    usdc: "--",
    usdt: "--",
  })),
);

const chainRows = computed(() =>
  chains.map((chain) => ({
    ...chain,
    asset: walletAssets.value.find((item) => item.key === chain.key) ?? { key: chain.key, gas: "--", usdc: "--", usdt: "--" },
  })),
);

onMounted(() => {
  void refresh();
});

async function fetchWalletAssets() {
  const response = await fetch("/api/wallet-assets");
  const payload = (await response.json().catch(() => ({}))) as { rows?: WalletAssetRow[] };
  if (response.ok && Array.isArray(payload.rows)) {
    walletAssets.value = payload.rows;
  }
}

async function refresh() {
  emit("refresh");
  loading.value = true;
  try {
    await fetchWalletAssets();
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped src="./WalletAssetsPanel.css"></style>
