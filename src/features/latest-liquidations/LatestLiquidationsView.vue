<template>
  <section class="latest-liquidations">
    <article class="latest-card">
      <div class="latest-title-row">
        <div class="latest-heading-main">
          <h2>清算排行榜</h2>
          <span class="latest-info-dot" aria-label="清算排行榜说明">i</span>
        </div>
        <div v-if="!loading" class="latest-service-status">
          <span>数据源：{{ dataSourceLabel }}</span>
          <span>排行 {{ totalRankingRows }}</span>
          <span>候选 {{ queueRows.length }}</span>
          <span>来源 {{ sourceRows.length }}</span>
          <span v-if="updatedAt">更新 {{ formatSnapshotTime(updatedAt) }}</span>
        </div>
      </div>

      <div v-if="errorMessage" class="latest-service-error">{{ errorMessage }}</div>

      <div class="latest-ranking-tabs" aria-label="排行榜分类">
        <button
          v-for="tab in rankingTabs"
          :key="tab.key"
          type="button"
          :class="{ active: rankingTab === tab.key }"
          @click="rankingTab = tab.key"
        >
          {{ tab.label }}
          <span class="latest-info-dot" aria-hidden="true">i</span>
        </button>
      </div>

      <div class="latest-table-shell">
        <table class="latest-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>交易哈希</th>
              <th>清算人</th>
              <th>资产</th>
              <th>利润</th>
              <th>成本</th>
              <th>收入</th>
              <th>协议</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in activeRankingRows" :key="`${rankingTab}-${row.fullHash}`">
              <td>{{ formatDateTime(row) }}</td>
              <td class="latest-hash-cell">
                <button class="latest-hash-link" type="button" @click="openTx(row.chain, row.fullHash)">
                  <img class="latest-identicon" :src="ethPixelIcon(row.fullHash)" alt="" aria-hidden="true" />
                  {{ row.hash }}
                </button>
                <button class="latest-copy-button" type="button" aria-label="复制完整交易哈希" @click="copyHash(row.fullHash)">
                  <img :src="copyIcon" alt="" aria-hidden="true" />
                </button>
              </td>
              <td>
                <span class="latest-address-cell">
                  <img class="latest-identicon" :src="ethPixelIcon(row.liquidator)" alt="" aria-hidden="true" />
                  {{ row.liquidator }}
                </span>
              </td>
              <td>
                <span class="latest-asset-cell">
                  <img v-if="assetIcon(row.asset)" :src="assetIcon(row.asset)" alt="" aria-hidden="true" />
                  {{ row.asset }}
                </span>
              </td>
              <td>{{ row.profit }}</td>
              <td>{{ row.cost }}</td>
              <td>{{ row.revenue }}</td>
              <td>
                <span class="latest-protocol-cell">
                  <img :src="protocolIcon(row.protocol)" alt="" aria-hidden="true" />
                  {{ row.protocol }}
                </span>
              </td>
            </tr>
            <tr v-if="loading">
              <td class="latest-skeleton-row" colspan="8">
                <span></span>
                <span></span>
              </td>
            </tr>
            <tr v-else-if="activeRankingRows.length === 0">
              <td class="latest-empty-row" colspan="8">
                {{ queueRows.length > 0 ? `后端暂无成交排行，已收到 ${queueRows.length} 条 RPC 候选。` : "暂无排行数据。" }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </article>

    <article class="latest-card">
      <div class="latest-title-row">
        <h2>协议面板</h2>
        <span class="latest-info-dot" aria-label="协议面板说明">i</span>
      </div>

      <div class="latest-table-shell">
        <table class="latest-table">
          <thead>
            <tr>
              <th>协议</th>
              <th>清算金额</th>
              <th>清算笔数</th>
              <th>清算人数量</th>
              <th>被清算借款人</th>
              <th>被清算资产</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in protocolRows" :key="row.protocol">
              <td>
                <span class="latest-protocol-cell">
                  <img :src="protocolIcon(row.protocol)" alt="" aria-hidden="true" />
                  {{ row.protocol }}
                </span>
              </td>
              <td>{{ row.volume }}</td>
              <td>{{ row.count }}</td>
              <td>{{ row.liquidators }}</td>
              <td>{{ row.borrowers }}</td>
              <td>{{ row.assets }}</td>
            </tr>
            <tr v-if="loading">
              <td class="latest-skeleton-row" colspan="6">
                <span></span>
                <span></span>
              </td>
            </tr>
            <tr v-else-if="protocolRows.length === 0">
              <td class="latest-empty-row" colspan="6">{{ protocolEmptyText }}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import aaveIcon from "../../img/aave-token-round.svg";
import bnbIcon from "../../img/bnb.svg";
import copyIcon from "../../img/copy.svg";
import morphoIcon from "../../img/morpho.svg";
import arbAssetIcon from "../../img/cryptoimg/arb.svg";
import btcIcon from "../../img/cryptoimg/btc.svg";
import crvUsdIcon from "../../img/cryptoimg/crvUSD_s.svg";
import daiIcon from "../../img/cryptoimg/dai.svg";
import ethAssetIcon from "../../img/cryptoimg/eth.svg";
import linkIcon from "../../img/cryptoimg/link.svg";
import usdcIcon from "../../img/cryptoimg/usdc.svg";
import usdtIcon from "../../img/cryptoimg/usdt.svg";
import wethIcon from "../../img/cryptoimg/weth.svg";
import wstEthIcon from "../../img/cryptoimg/wsteth.svg";

type TxGraphChainKey = "ethereum" | "bnb" | "arbitrum";
type RankingKey = "profit" | "event" | "liquidator" | "collateral" | "borrower";

type RankingRow = {
  date: string;
  time: string;
  hash: string;
  fullHash: string;
  chain: TxGraphChainKey;
  liquidator: string;
  asset: string;
  profit: string;
  cost: string;
  revenue: string;
  protocol: string;
};

type ProtocolRow = {
  protocol: string;
  volume: string;
  count: string;
  liquidators: string;
  borrowers: string;
  assets: string;
};

type SourceRow = {
  id: string;
  chain: string;
  chainLabel?: string;
  source?: string;
  rpc?: string;
  queueCount?: number;
  liquidationCount?: number;
  protocolCount?: number;
  status?: string;
  updatedAt?: string;
};

type QueueRow = {
  id: string;
  chain: string;
  chainLabel?: string;
  wallet?: string;
  walletShort?: string;
  asset?: string;
  protocol?: string;
  rpc?: string;
  status?: string;
  source?: string;
  updatedAt?: string;
};

const emit = defineEmits<{
  openTxGraph: [payload: { chain: TxGraphChainKey; hash: string }];
}>();

const rankingTab = ref<RankingKey>("profit");
const rankingTabs = [
  { key: "profit", label: "交易利润" },
  { key: "event", label: "清算事件" },
  { key: "liquidator", label: "清算人" },
  { key: "collateral", label: "被清算资产" },
  { key: "borrower", label: "被清算借款人" },
] satisfies { key: RankingKey; label: string }[];

const loading = ref(false);
const rankings = ref<Record<RankingKey, RankingRow[]>>(createRankingMap([]));
const protocolRows = ref<ProtocolRow[]>([]);
const sourceRows = ref<SourceRow[]>([]);
const queueRows = ref<QueueRow[]>([]);
const updatedAt = ref("");
const dataSource = ref("");
const errorMessage = ref("");
const activeRankingRows = computed(() => sortByOccurredAt(rankings.value[rankingTab.value] ?? []));
const totalRankingRows = computed(() => Object.values(rankings.value).reduce((total, rows) => total + rows.length, 0));
const dataSourceLabel = computed(() => dataSource.value || "liquidation-snapshot-service");
const protocolEmptyText = computed(() => {
  if (sourceRows.value.length > 0) return `暂无协议成交统计，已接入 ${sourceRows.value.length} 个 RPC 队列。`;
  return "--";
});
const assetIcons: Record<string, string> = {
  ARB: arbAssetIcon,
  CRVUSD: crvUsdIcon,
  DAI: daiIcon,
  ETH: ethAssetIcon,
  LINK: linkIcon,
  USDC: usdcIcon,
  USDT: usdtIcon,
  WBNB: bnbIcon,
  WBTC: btcIcon,
  WETH: wethIcon,
  WSTETH: wstEthIcon,
};

onMounted(() => {
  void loadLatestLiquidations();
});

async function loadLatestLiquidations(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch(`/api/latest-liquidations?t=${Date.now()}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      source?: string;
      ranking?: RankingRow[];
      rankings?: Partial<Record<RankingKey, RankingRow[]>>;
      protocols?: ProtocolRow[];
      sources?: SourceRow[];
      queue?: QueueRow[];
      updatedAt?: string;
    };

    rankings.value = normalizeRankings(payload.rankings, payload.ranking);
    protocolRows.value = Array.isArray(payload.protocols) ? payload.protocols : [];
    sourceRows.value = Array.isArray(payload.sources) ? payload.sources : [];
    queueRows.value = Array.isArray(payload.queue) ? payload.queue : [];
    updatedAt.value = payload.updatedAt ?? "";
    dataSource.value = payload.source ?? "";
  } catch (error) {
    rankings.value = createRankingMap([]);
    protocolRows.value = [];
    sourceRows.value = [];
    queueRows.value = [];
    updatedAt.value = "";
    dataSource.value = "";
    errorMessage.value = error instanceof Error ? `清算快照接口读取失败：${error.message}` : "清算快照接口读取失败";
  } finally {
    loading.value = false;
  }
}

function openTx(chain: TxGraphChainKey, hash: string) {
  emit("openTxGraph", { chain, hash });
}

async function copyHash(hash: string) {
  try {
    await navigator.clipboard.writeText(hash);
    ElMessage.success("已复制完整交易哈希");
  } catch {
    ElMessage.error("复制失败");
  }
}

function protocolIcon(protocol?: string) {
  const normalized = (protocol || "").toLowerCase();
  if (normalized.includes("morpho")) return morphoIcon;
  if (normalized.includes("bsc") || normalized.includes("bnb")) return bnbIcon;
  return aaveIcon;
}

function assetIcon(symbol?: string) {
  return assetIcons[normalizeAssetSymbol(symbol)] ?? "";
}

function normalizeAssetSymbol(symbol?: string) {
  return (symbol || "").replace(/\s+/g, "").toUpperCase();
}

function formatDateTime(row: { date: string; time: string }) {
  return `${row.date.replaceAll("-", "/")} ${row.time}`;
}

function formatSnapshotTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

function sortByOccurredAt<T extends { date: string; time: string }>(rows: T[]) {
  return [...rows].sort((left, right) => toOccurrenceTimestamp(right) - toOccurrenceTimestamp(left));
}

function toOccurrenceTimestamp(row: { date: string; time: string }) {
  return new Date(`${row.date}T${row.time}`).getTime();
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

function normalizeRankings(source?: Partial<Record<RankingKey, RankingRow[]>>, legacy?: RankingRow[]) {
  return {
    profit: sliceRankingRows(source?.profit ?? legacy),
    event: sliceRankingRows(source?.event),
    liquidator: sliceRankingRows(source?.liquidator),
    collateral: sliceRankingRows(source?.collateral),
    borrower: sliceRankingRows(source?.borrower),
  };
}

function sliceRankingRows(rows: RankingRow[] | undefined) {
  return Array.isArray(rows) ? rows.slice(0, 10) : [];
}

function createRankingMap(rows: RankingRow[]): Record<RankingKey, RankingRow[]> {
  return {
    profit: rows,
    event: [],
    liquidator: [],
    collateral: [],
    borrower: [],
  };
}

</script>

<style scoped src="./LatestLiquidationsView.css"></style>
