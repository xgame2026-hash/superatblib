<template>
  <section class="latest-liquidations">
    <article class="latest-card">
      <div class="latest-title-row">
        <h2>{{ t("latest.rank") }}</h2>
        <label class="latest-wallet-search">
          <span>{{ t("latest.walletSearch") }}</span>
          <input
            v-model="walletSearchQuery"
            type="search"
            :placeholder="t('latest.walletPlaceholder')"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          />
        </label>
        <div class="latest-title-side">
          <div class="latest-wss-stat" :class="wssConnected ? 'is-connected' : 'is-empty'" :title="wssStatusTitle">
            <span class="latest-wss-dot" aria-hidden="true"></span>
            <strong>{{ wssConnectionText }}</strong>
          </div>
          <div class="latest-total-stat latest-paid-profit-stat" :class="paidProfitPulseClass" :title="paidProfitTitle">
            <span>{{ t("latest.paidProfit") }}</span>
            <strong>{{ formattedPaidProfit }}</strong>
          </div>
        </div>
      </div>

      <div v-if="errorMessage" class="latest-service-error">{{ errorMessage }}</div>

      <div class="latest-table-shell">
        <table class="latest-table">
          <thead>
            <tr>
              <th>{{ t("latest.chain") }}</th>
              <th>{{ t("latest.queueId") }}</th>
              <th>{{ t("latest.wallet") }}</th>
              <th>USDT</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in pagedQueuedWalletRows" :key="row.id" :class="{ 'is-queue-active': rowGlobalIndex(index) === activeQueueGlobalIndex }">
              <td>{{ formatChainLabel(row) }}</td>
              <td class="latest-queue-id" :title="row.id">{{ formatQueueId(row) }}</td>
              <td>
                <span class="latest-address-cell latest-wallet-full" :title="rowWallet(row)">
                  <img
                    class="latest-identicon"
                    :class="{ 'is-generated': !walletAvatarUrl(row) }"
                    :src="walletAvatarSrc(row)"
                    alt=""
                    aria-hidden="true"
                  />
                  {{ formatFullWallet(row) }}
                  <span v-if="rowGlobalIndex(index) === activeQueueGlobalIndex" class="latest-queue-spinner" aria-hidden="true"></span>
                </span>
              </td>
              <td class="latest-asset-summary">{{ formatUsdtAsset(row) }}</td>
            </tr>
            <tr v-if="loading && queuedWalletRows.length === 0">
              <td class="latest-skeleton-row" colspan="4">
                <span></span>
                <span></span>
              </td>
            </tr>
            <tr v-else-if="filteredQueuedWalletRows.length === 0">
              <td class="latest-empty-row" colspan="4">{{ walletSearchQuery.trim() ? t("latest.noMatched") : t("latest.noQueued") }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="latest-pagination" v-if="filteredQueuedWalletRows.length > pageSize">
        <button type="button" :disabled="currentPage === 1" @click="currentPage = 1">{{ t("latest.first") }}</button>
        <button type="button" :disabled="currentPage === 1" @click="currentPage -= 1">{{ t("latest.prev") }}</button>
        <button
          v-for="page in visiblePages"
          :key="page"
          type="button"
          :class="{ active: page === currentPage }"
          @click="currentPage = page"
        >
          {{ page }}
        </button>
        <button type="button" :disabled="currentPage === totalPages" @click="currentPage += 1">{{ t("latest.next") }}</button>
        <button type="button" :disabled="currentPage === totalPages" @click="currentPage = totalPages">{{ t("latest.last") }}</button>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from "vue";
import { t } from "../../i18n";

const props = withDefaults(defineProps<{ active?: boolean }>(), {
  active: true,
});

type QueueRow = {
  id: string;
  chain: string;
  chainLabel?: string;
  wallet?: string;
  walletAddress?: string;
  wallet_address?: string;
  walletShort?: string;
  asset?: string;
  usdt?: string | number;
  usdtBalance?: string | number;
  usdt_balance?: string | number;
  usdtAmount?: string | number;
  usdt_amount?: string | number;
  todayAssetChange?: string | number;
  todayContractChange?: string | number;
  balances?: QueueBalances;
  protocol?: string;
  rpc?: string;
  status?: string;
  source?: string;
  endpointId?: string;
  endpointSlug?: string;
  participantId?: string;
  participant_id?: string;
  queueMemberKey?: string;
  queue_member_key?: string;
  dedupeKey?: string;
  dedupe_key?: string;
  queueType?: string;
  registeredAt?: string;
  updatedAt?: string;
};

type QueueBalanceValue = {
  symbol?: string;
  formatted?: string;
  value?: string | number;
};

type QueueBalances = {
  gas?: QueueBalanceValue;
  bnb?: QueueBalanceValue;
  usdt?: QueueBalanceValue | string | number;
  USDT?: QueueBalanceValue | string | number;
  usdtBalance?: string | number;
  usdt_balance?: string | number;
  usdtAmount?: string | number;
  usdt_amount?: string | number;
  todayContractChange?: string | number;
};

type WalletAvatarProfile = {
  walletAddress?: string;
  wallet_address?: string;
  avatarUrl?: string;
  avatar_url?: string;
};

const loading = ref(false);
const queueRows = ref<QueueRow[]>([]);
const queuedWalletSourceRows = ref<QueueRow[]>([]);
const walletAvatarUrls = ref<Record<string, string>>({});
const errorMessage = ref("");
const walletSearchQuery = ref("");
const currentPage = ref(1);
const pageSize = 15;
const AUTH_CODE_KEY = "superarb-auth-code-v1.6.3";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.3";
let latestRefreshTimer = 0;
let activeQueueTimer = 0;
let latestLoadedAt = 0;
const LATEST_REFRESH_INTERVAL_MS = 10_000;
const ACTIVE_QUEUE_INTERVAL_MS = 5_000;
const WSS_STALE_MS = 45_000;
const PAID_PROFIT_REFRESH_INTERVAL_MS = 10_000;
const WALLET_AVATAR_API = "https://api.supermtglobal.com/avatar";
const WALLET_AVATARS_API = "https://api.supermtglobal.com/avatars";
const loadingAvatarWallets = new Set<string>();
const missingAvatarWallets = new Set<string>();
const queuedWalletRows = computed(() => {
  const sourceRows = queuedWalletSourceRows.value;
  const productionRows = sourceRows.filter(isProductionQueueWallet);
  return dedupeQueueRows(productionRows).sort(sortQueueRowsByUsdtDesc);
});
const filteredQueuedWalletRows = computed(() => {
  const keyword = walletSearchQuery.value.trim().toLowerCase();
  if (!keyword) return queuedWalletRows.value;
  return queuedWalletRows.value.filter((row) => walletSearchText(row).includes(keyword));
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredQueuedWalletRows.value.length / pageSize)));
const pagedQueuedWalletRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredQueuedWalletRows.value.slice(start, start + pageSize);
});
const visiblePages = computed(() => {
  const maxButtons = 5;
  const half = Math.floor(maxButtons / 2);
  const start = Math.max(1, Math.min(currentPage.value - half, totalPages.value - maxButtons + 1));
  const end = Math.min(totalPages.value, start + maxButtons - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
});
const paidProfitUsdt = ref(0);
const paidProfitPayoutCount = ref(0);
const paidProfitLoaded = ref(false);
const formattedPaidProfit = computed(() => (paidProfitLoaded.value ? `${formatDecimal2(paidProfitUsdt.value)} USDT` : "--"));
const paidProfitTitle = computed(() =>
  paidProfitLoaded.value
    ? t("latest.profitTitle", { amount: formatDecimal2(paidProfitUsdt.value), count: paidProfitPayoutCount.value.toLocaleString("en-US") })
    : t("latest.profitLoading"),
);
const paidProfitPulse = ref(false);
const paidProfitPulseTone = ref<"up" | "down">("up");
const paidProfitPulseClass = computed(() => ({
  "is-pulsing": paidProfitPulse.value,
  "is-down": paidProfitPulseTone.value === "down",
}));
const queueTransport = ref("");
const activeQueueGlobalIndex = ref(0);
const queueParticipantCount = ref(0);
const queueSubscribers = ref(0);
const queueUpdatedAt = ref("");
const wssConnected = ref(false);
let lastWssConnectedAt = 0;
const stableQueueParticipantCount = computed(() => queuedWalletRows.value.length || queueParticipantCount.value);
const wssConnectionText = computed(() => {
  if (!wssConnected.value) return t("latest.disconnected");
  return t("latest.walletCount", { count: stableQueueParticipantCount.value });
});
const wssStatusTitle = computed(() => {
  if (!wssConnected.value) return t("latest.queueDisconnected");
  const updatedAt = queueUpdatedAt.value ? new Date(queueUpdatedAt.value).toLocaleString() : "--";
  return t("latest.queueTitle", {
    wallets: stableQueueParticipantCount.value,
    subscribers: queueSubscribers.value,
    source: queueTransport.value || "--",
    updatedAt,
  });
});
let paidProfitPulseTimer = 0;
let paidProfitRefreshTimer = 0;

watch(paidProfitUsdt, (value, oldValue) => {
  if (value === oldValue) return;
  paidProfitPulseTone.value = value < oldValue ? "down" : "up";
  paidProfitPulseTimer = triggerNumberPulse(paidProfitPulse, paidProfitPulseTimer);
});

watch([filteredQueuedWalletRows, totalPages], ([rows]) => {
  const activeKey = rows[activeQueueGlobalIndex.value] ? queueDedupKey(rows[activeQueueGlobalIndex.value]) : "";
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value;
  if (currentPage.value < 1) currentPage.value = 1;
  const nextIndex = activeKey ? rows.findIndex((row) => queueDedupKey(row) === activeKey) : -1;
  activeQueueGlobalIndex.value = nextIndex >= 0 ? nextIndex : Math.min(activeQueueGlobalIndex.value, Math.max(0, rows.length - 1));
});

watch(walletSearchQuery, () => {
  currentPage.value = 1;
  activeQueueGlobalIndex.value = 0;
});

watch(
  pagedQueuedWalletRows,
  (rows) => {
    void loadWalletAvatars(rows);
  },
  { immediate: true },
);

onMounted(() => {
  if (props.active) startLatestLiquidationsView();
});

onActivated(() => {
  if (props.active) startLatestLiquidationsView();
});

onDeactivated(() => stopLatestLiquidationsView());

watch(
  () => props.active,
  (active) => {
    if (active) {
      startLatestLiquidationsView();
      return;
    }
    stopLatestLiquidationsView();
  },
);

onBeforeUnmount(() => {
  stopLatestLiquidationsView();
  if (paidProfitPulseTimer) window.clearTimeout(paidProfitPulseTimer);
});

function startLatestLiquidationsView(): void {
  if (!latestRefreshTimer) latestRefreshTimer = window.setInterval(loadLatestLiquidations, LATEST_REFRESH_INTERVAL_MS);
  if (!activeQueueTimer) activeQueueTimer = window.setInterval(advanceActiveQueueRow, ACTIVE_QUEUE_INTERVAL_MS);
  if (!paidProfitRefreshTimer) paidProfitRefreshTimer = window.setInterval(loadPaidProfitSummary, PAID_PROFIT_REFRESH_INTERVAL_MS);
  if (!latestLoadedAt) {
    void loadLatestLiquidations();
  }
  void loadPaidProfitSummary();
}

function stopLatestLiquidationsView(): void {
  if (latestRefreshTimer) window.clearInterval(latestRefreshTimer);
  if (activeQueueTimer) window.clearInterval(activeQueueTimer);
  if (paidProfitRefreshTimer) window.clearInterval(paidProfitRefreshTimer);
  latestRefreshTimer = 0;
  activeQueueTimer = 0;
  paidProfitRefreshTimer = 0;
}

async function loadLatestLiquidations(): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch(`/api/liq2/online-wallets?t=${Date.now()}`, {
      cache: "no-store",
      headers: latestHeaders(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      queue?: QueueRow[];
      queuedWallets?: QueueRow[];
      queueTransport?: string;
      queueParticipantCount?: number;
      queueSubscribers?: number;
      queueUpdatedAt?: string;
    };

    updateWssStatus(payload.queueTransport || "");
    const queueIsLive = isLiveQueueTransport(payload.queueTransport || "");
    queueRows.value = queueIsLive && Array.isArray(payload.queue) ? payload.queue.filter(isProductionQueueWallet) : [];
    queuedWalletSourceRows.value = queueIsLive && Array.isArray(payload.queuedWallets) ? payload.queuedWallets.filter(isProductionQueueWallet) : [];
    const reportedParticipants = Number.isFinite(payload.queueParticipantCount) ? Number(payload.queueParticipantCount) : 0;
    queueParticipantCount.value = Math.max(reportedParticipants, queuedWalletRows.value.length);
    queueSubscribers.value = Number.isFinite(payload.queueSubscribers) ? Number(payload.queueSubscribers) : 0;
    queueUpdatedAt.value = payload.queueUpdatedAt || "";
    latestLoadedAt = Date.now();
  } catch (error) {
    if (queuedWalletRows.value.length === 0) {
      queueRows.value = [];
      queuedWalletSourceRows.value = [];
      queueTransport.value = "";
      wssConnected.value = false;
      queueParticipantCount.value = 0;
      queueSubscribers.value = 0;
      queueUpdatedAt.value = "";
    }
    markWssStaleIfNeeded();
    errorMessage.value = error instanceof Error ? `${t("latest.queueReadFailed")}：${error.message}` : t("latest.queueReadFailed");
  } finally {
    loading.value = false;
  }
}

async function loadPaidProfitSummary(): Promise<void> {
  try {
    const response = await fetch(`/api/liq2/paid-profit?t=${Date.now()}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      totalPaidUsdt?: string | number;
      total_paid_usdt?: string | number;
      payoutCount?: number;
      payout_count?: number;
    };
    paidProfitUsdt.value = parseNumericValue(payload.totalPaidUsdt ?? payload.total_paid_usdt ?? "0");
    paidProfitPayoutCount.value = Number(payload.payoutCount ?? payload.payout_count ?? 0) || 0;
    paidProfitLoaded.value = true;
  } catch {
    paidProfitLoaded.value = false;
  }
}

function updateWssStatus(transport: string): void {
  queueTransport.value = transport;
  if (isLiveQueueTransport(transport)) {
    lastWssConnectedAt = Date.now();
    wssConnected.value = true;
    return;
  }
  markWssStaleIfNeeded();
}

function isLiveQueueTransport(transport: string): boolean {
  return ["wss", "state", "http", "private", "private-global", "private-local-mirror"].includes(transport.toLowerCase());
}

function markWssStaleIfNeeded(): void {
  if (!lastWssConnectedAt || Date.now() - lastWssConnectedAt > WSS_STALE_MS) {
    wssConnected.value = false;
  }
}

function latestHeaders(): Record<string, string> {
  const authCode = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim();
  return {
    accept: "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode } : {}),
  };
}

function isQueuedWalletRow(row: QueueRow) {
  const id = row.id || "";
  const source = row.source || "";
  const queueType = row.queueType || "";
  if (!rowWallet(row)) return false;
  if (id.startsWith("endpoint-start:")) return true;
  if (row.endpointId || row.endpointSlug) return true;
  if (/rpc-queue|client-queue|endpoint-queue/i.test(source)) return true;
  if (/rpc-queue|client-queue|endpoint-queue/i.test(queueType)) return true;
  return false;
}

function isProductionQueueWallet(row: QueueRow) {
  const wallet = rowWallet(row).toLowerCase();
  const endpointSlug = (row.endpointSlug || "").toLowerCase();
  const endpointId = (row.endpointId || "").toLowerCase();
  const identity = [
    row.id,
    row.participantId,
    row.participant_id,
    row.queueMemberKey,
    row.queue_member_key,
    row.dedupeKey,
    row.dedupe_key,
  ].filter(Boolean).join(":").toLowerCase();
  return wallet !== "0x0000000000000000000000000000000000000001" && endpointSlug !== "public-test" && endpointId !== "public-test" && !identity.includes(":no-license:");
}

function dedupeQueueRows(rows: QueueRow[]) {
  const byKey = new Map<string, QueueRow>();
  for (const row of rows) {
    const key = queueDedupKey(row);
    const existing = byKey.get(key);
    if (!existing || queueRowFreshness(row) > queueRowFreshness(existing)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

function queueDedupKey(row: QueueRow) {
  const chain = (row.chain || row.chainLabel || "").toLowerCase();
  const wallet = rowWallet(row).toLowerCase();
  const endpoint = (row.endpointSlug || row.endpointId || queueEndpointFromId(row.id) || "").toLowerCase();
  const protocol = (row.protocol || "").toLowerCase();
  return `${chain}:${wallet}:${endpoint}:${protocol}`;
}

function queueEndpointFromId(id?: string) {
  const parts = id?.split(":") ?? [];
  return parts[0] === "endpoint-start" ? parts[4] : "";
}

function queueRowFreshness(row: QueueRow) {
  return Math.max(toOptionalTimestamp(row.updatedAt), toOptionalTimestamp(row.registeredAt));
}

function sortQueueRowsByUsdtDesc(left: QueueRow, right: QueueRow) {
  const usdtDelta = usdtValue(right) - usdtValue(left);
  if (usdtDelta !== 0) return usdtDelta;
  return queueRowFreshness(right) - queueRowFreshness(left);
}

function walletSearchText(row: QueueRow) {
  return [rowWallet(row), row.walletShort].filter(Boolean).join(" ").toLowerCase();
}

function rowGlobalIndex(pageIndex: number) {
  return (currentPage.value - 1) * pageSize + pageIndex;
}

function advanceActiveQueueRow() {
  const rowCount = filteredQueuedWalletRows.value.length;
  if (rowCount <= 1) {
    activeQueueGlobalIndex.value = 0;
    currentPage.value = 1;
    return;
  }
  activeQueueGlobalIndex.value = (activeQueueGlobalIndex.value + 1) % rowCount;
  currentPage.value = Math.floor(activeQueueGlobalIndex.value / pageSize) + 1;
}

function toOptionalTimestamp(value?: string) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatChainLabel(row: QueueRow) {
  return row.chainLabel || row.chain?.toUpperCase() || "--";
}

function formatQueueId(row: QueueRow) {
  const wallet = rowWallet(row);
  if (wallet) return `${(row.chain || row.chainLabel || "BNB").toLowerCase()}:${walletTail8(wallet)}`;
  const queueId = row.participantId || row.queueMemberKey || row.endpointId || row.id || row.endpointSlug;
  if (!queueId) return "--";
  const normalized = formatLegacyQueueId(queueId);
  if (normalized) return normalized;
  return queueId.length > 28 ? `${queueId.slice(0, 12)}...${queueId.slice(-8)}` : queueId;
}

function formatLegacyQueueId(queueId: string): string {
  const parts = queueId.split(":");
  if (parts[0] === "license-token-wallet" && parts.length >= 5) {
    const [, chain, , , wallet] = parts;
    return `${chain}:${walletTail8(wallet)}`;
  }
  if (parts[0] !== "license-token-wallet" || parts.length < 4) return "";
  const [, chain, , wallet] = parts;
  return `${chain}:${walletTail8(wallet)}`;
}

function walletTail8(value: string): string {
  return value.replace(/^0x/i, "").slice(-8);
}

function formatFullWallet(row: QueueRow) {
  return shortWallet(rowWallet(row) || row.walletShort);
}

function rowWallet(row: QueueRow) {
  return row.wallet || row.walletAddress || row.wallet_address || row.walletShort || "";
}

function walletAvatarUrl(row: QueueRow) {
  const wallet = normalizeWalletAddress(rowWallet(row));
  return wallet ? walletAvatarUrls.value[wallet] || "" : "";
}

function walletAvatarSrc(row: QueueRow) {
  return walletAvatarUrl(row) || ethPixelIcon(rowWallet(row) || row.id);
}

async function loadWalletAvatars(rows: QueueRow[]) {
  const wallets = [
    ...new Set(
      rows
        .map((row) => normalizeWalletAddress(rowWallet(row)))
        .filter((wallet): wallet is string => Boolean(wallet)),
    ),
  ].filter((wallet) => !walletAvatarUrls.value[wallet] && !missingAvatarWallets.has(wallet) && !loadingAvatarWallets.has(wallet));
  if (wallets.length === 0) return;

  wallets.forEach((wallet) => loadingAvatarWallets.add(wallet));
  try {
    const profiles = await fetchWalletAvatarProfiles(wallets);
    const nextAvatarUrls = { ...walletAvatarUrls.value };
    const loadedWallets = new Set<string>();

    for (const profile of profiles) {
      const wallet = normalizeWalletAddress(profile.walletAddress || profile.wallet_address || "");
      const avatarUrl = profile.avatarUrl || profile.avatar_url || "";
      if (!wallet || !avatarUrl) continue;
      nextAvatarUrls[wallet] = avatarUrl;
      loadedWallets.add(wallet);
    }

    walletAvatarUrls.value = nextAvatarUrls;
    wallets.forEach((wallet) => {
      if (!loadedWallets.has(wallet)) missingAvatarWallets.add(wallet);
    });
  } catch {
    wallets.forEach((wallet) => missingAvatarWallets.add(wallet));
  } finally {
    wallets.forEach((wallet) => loadingAvatarWallets.delete(wallet));
  }
}

async function fetchWalletAvatarProfiles(wallets: string[]): Promise<WalletAvatarProfile[]> {
  try {
    const response = await fetch(`${WALLET_AVATARS_API}?wallets=${encodeURIComponent(wallets.join(","))}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { items?: WalletAvatarProfile[] };
      if (Array.isArray(payload.items)) return payload.items;
    }
  } catch {
    // Fall back to the single-wallet avatar plugin below.
  }

  return Promise.all(wallets.map(fetchSingleWalletAvatarProfile));
}

async function fetchSingleWalletAvatarProfile(wallet: string): Promise<WalletAvatarProfile> {
  const response = await fetch(WALLET_AVATAR_API, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-wallet-address": wallet,
    },
  });
  if (!response.ok) return { walletAddress: wallet };
  const payload = (await response.json().catch(() => ({}))) as WalletAvatarProfile;
  return { ...payload, walletAddress: payload.walletAddress || payload.wallet_address || wallet };
}

function normalizeWalletAddress(value?: string) {
  const wallet = value?.trim();
  return wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet) ? wallet.toLowerCase() : "";
}

function shortWallet(value?: string) {
  if (!value) return "";
  if (value.length <= 13) return value;
  return `${value.slice(0, 4)}...${value.slice(-6)}`;
}

function formatUsdtAsset(row: QueueRow) {
  const rawValue = rawUsdtValue(row);
  const assetValue = rawUsdtAssetValue(row);
  const value = rawValue === undefined || rawValue === null ? assetValue : parseNumericValue(rawValue);
  if (value !== undefined) return `${formatDecimal2(value)} USDT`;
  return "--";
}

function usdtValue(row: QueueRow) {
  const value = rawUsdtValue(row);
  if (value === undefined || value === null) {
    return rawUsdtAssetValue(row) ?? 0;
  }
  return parseNumericValue(value);
}

function rawUsdtValue(row: QueueRow) {
  return (
    row.usdtBalance ??
    row.usdt_balance ??
    row.usdtAmount ??
    row.usdt_amount ??
    row.usdt ??
    nestedBalanceValue(row.balances?.usdt) ??
    nestedBalanceValue(row.balances?.USDT) ??
    row.balances?.usdtBalance ??
    row.balances?.usdt_balance ??
    row.balances?.usdtAmount ??
    row.balances?.usdt_amount
  );
}

function nestedBalanceValue(value?: QueueBalanceValue | string | number) {
  if (value === undefined || value === null || typeof value === "string" || typeof value === "number") return value;
  return value.formatted ?? value.value;
}

function rawUsdtAssetValue(row: QueueRow) {
  const parsed = row.asset?.match(/USDT\s+([0-9][0-9.,]*)/i);
  return parsed ? parseNumericValue(parsed[1]) : undefined;
}

function parseNumericValue(value: string | number) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const match = value.replace(/,/g, "").match(/[+-]?\d+(?:\.\d+)?/);
  const numeric = match ? Number(match[0]) : 0;
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDecimal2(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function triggerNumberPulse(target: typeof paidProfitPulse, timer: number) {
  if (timer) window.clearTimeout(timer);
  target.value = false;
  window.requestAnimationFrame(() => {
    target.value = true;
  });
  return window.setTimeout(() => {
    target.value = false;
  }, 720);
}

function ethPixelIcon(value: string) {
  const seed = hashString(value);
  const colors = ["#8b5cf6", "#60a5fa", "#6ee7b7", "#f5d56c", "#f472b6"];
  const primary = colors[seed % colors.length];
  const secondary = colors[(seed >> 4) % colors.length];
  const cells: string[] = [];

  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      const bitIndex = y * 3 + x;
      if (((seed >> bitIndex) & 1) === 0) continue;
      const mirroredX = 4 - x;
      const fill = (bitIndex + seed) % 3 === 0 ? secondary : primary;
      cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`);
      if (mirroredX !== x) cells.push(`<rect x="${mirroredX}" y="${y}" width="1" height="1" fill="${fill}"/>`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges"><rect width="5" height="5" rx="1" fill="#171224"/><g>${cells.join("")}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

</script>

<style scoped src="./LatestLiquidationsView.css"></style>
