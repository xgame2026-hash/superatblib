<template>
  <article class="panel wallet-panel">
    <div class="wallet-panel-header">
      <h3>{{ t("wallet.assets") }}</h3>
      <button class="wallet-refresh-button" type="button" :disabled="loading" @click="refresh">
        {{ loading ? t("wallet.refreshing") : t("wallet.refresh") }}
      </button>
    </div>

    <table class="wallet-table">
      <thead>
        <tr>
          <th>{{ t("wallet.chain") }}</th>
          <th>{{ t("wallet.gasBalance") }}</th>
          <th>USDC</th>
          <th>USDT</th>
          <th>{{ t("wallet.rpcUsage") }}</th>
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
            <td class="wallet-numeric">{{ item.asset.gas }}</td>
            <td class="wallet-numeric">{{ item.asset.usdc }}</td>
            <td class="wallet-numeric">{{ item.asset.usdt }}</td>
            <td class="wallet-numeric is-rpc"><slot name="rpc-usage" :chain="item.key">--</slot></td>
          </tr>
        </template>
      </tbody>
    </table>
  </article>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { t } from "../../i18n";
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

const props = withDefaults(defineProps<{ active?: boolean }>(), {
  active: true,
});

const chains: ChainMeta[] = [
  { key: "ethereum", label: "Ethereum", icon: ethIcon },
  { key: "bnb", label: "BNB", icon: bnbIcon },
  { key: "arbitrum", label: "Arbitrum", icon: arbIcon },
];

const loading = ref(false);
let loadedOnce = false;
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
  if (props.active) void refreshOnce();
});

watch(
  () => props.active,
  (active) => {
    if (active) void refreshOnce();
  },
);

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
    loadedOnce = true;
  } catch {
    loadedOnce = false;
  } finally {
    loading.value = false;
  }
}

async function refreshOnce() {
  if (loadedOnce) return;
  await refresh();
}
</script>

<style scoped src="./WalletAssetsPanel.css"></style>
