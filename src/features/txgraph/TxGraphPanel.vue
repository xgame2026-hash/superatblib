<template>
  <section class="txgraph-page">
    <article class="panel txgraph-controls-panel">
      <div class="txgraph-query-row">
        <div class="txgraph-chain-icons" aria-label="链">
          <button
            v-for="item in chains"
            :key="item.value"
            class="txgraph-chain-icon"
            :class="{ active: chain === item.value }"
            type="button"
            :title="item.label"
            @click="chain = item.value"
          >
            <img :src="item.icon" :alt="item.label" />
          </button>
        </div>
        <el-input
          v-model="txHash"
          class="txgraph-hash-input"
          placeholder="输入交易哈希 0x..."
          spellcheck="false"
          @keyup.enter="submit"
        >
          <template #suffix>
            <button
              class="txgraph-search-icon"
              type="button"
              :disabled="!canQuery"
              aria-label="查询"
              @click="submit"
            >
              <img :src="searchIconUrl" alt="" aria-hidden="true" />
            </button>
          </template>
        </el-input>
        <div class="txgraph-filter-row" aria-label="图谱类型">
          <button
            v-for="filter in filters"
            :key="filter.key"
            class="txgraph-filter-button"
            :class="{ active: visibleKinds[filter.key] }"
            type="button"
            :aria-pressed="visibleKinds[filter.key]"
            @click="visibleKinds[filter.key] = !visibleKinds[filter.key]"
          >
            <img
              class="txgraph-filter-state"
              :src="visibleKinds[filter.key] ? selectYesIconUrl : selectNoIconUrl"
              alt=""
              aria-hidden="true"
            />
            {{ filter.label }}
          </button>
        </div>
      </div>

      <el-alert
        v-if="rpcMissing"
        class="txgraph-alert"
        title="当前链没有配置 RPC。请先到设置里填写对应链的 RPC_URL。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-alert
        v-else-if="error"
        class="txgraph-alert"
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
    </article>

    <section class="txgraph-grid">
      <aside class="panel txgraph-summary-panel">
        <h3>图谱摘要</h3>
        <div class="txgraph-summary-item">
          <span>交易哈希</span>
          <a
            v-if="data?.txHash"
            class="txgraph-summary-link"
            :href="explorerTxUrl"
            target="_blank"
            rel="noreferrer noopener"
          >
            {{ shortHash(data.txHash) }}
          </a>
          <strong v-else>--</strong>
        </div>
        <div class="txgraph-summary-item">
          <span>链</span>
          <strong>{{ currentChainLabel }}</strong>
        </div>
        <div class="txgraph-summary-item">
          <span>转账</span>
          <strong>{{ data?.summary.transferCount ?? 0 }}</strong>
        </div>
        <div class="txgraph-summary-item">
          <span>合约调用</span>
          <strong>{{ data?.summary.callCount ?? 0 }}</strong>
        </div>
        <div class="txgraph-summary-item">
          <span>引用</span>
          <strong>{{ data?.summary.referenceCount ?? 0 }}</strong>
        </div>
        <div class="txgraph-summary-item">
          <span>Trace</span>
          <strong>{{ data ? (data.traceAvailable ? "可用" : "不可用") : "--" }}</strong>
        </div>
      </aside>

      <article ref="graphPanel" class="panel txgraph-canvas-panel">
        <div class="txgraph-canvas-actions" aria-label="图谱工具">
          <button class="txgraph-tool-button txgraph-tool-zoom" type="button" title="放大" @click="zoomGraph(1.18)">
            <img :src="plusIconUrl" alt="" />
          </button>
          <button class="txgraph-tool-button txgraph-tool-zoom" type="button" title="缩小" @click="zoomGraph(0.84)">
            <img :src="zoomIconUrl" alt="" />
          </button>
          <button class="txgraph-tool-button" type="button" title="适应屏幕" @click="fitGraph">
            <img :src="zoomBigIconUrl" alt="" />
          </button>
        </div>
        <div ref="graphContainer" class="txgraph-canvas"></div>
        <img class="txgraph-watermark" :src="miniLogoUrl" alt="" aria-hidden="true" />
        <div v-if="!data || loading || !data.nodes.length" class="txgraph-empty">
          {{ loading ? "图谱加载中..." : "输入 tx hash 后加载交易图。" }}
        </div>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import type cytoscape from "cytoscape";
import type { Core, ElementDefinition } from "cytoscape";
import { useTxGraph } from "../../composables/useTxGraph";
import setupIconUrl from "../../img/setupyellow.svg";
import walletIconUrl from "../../img/pers.svg";
import tokenIconUrl from "../../img/around.svg";
import exchangeIconUrl from "../../img/Refresh.svg";
import systemIconUrl from "../../img/mapgreen.svg";
import arbIcon from "../../img/arb.svg";
import bnbIcon from "../../img/bnb.svg";
import ethIcon from "../../img/eth.svg";
import miniLogoUrl from "../../img/SuperARBmini.png";
import plusIconUrl from "../../img/plus.svg";
import searchIconUrl from "../../img/searchicon.svg";
import selectNoIconUrl from "../../img/select_no.svg";
import selectYesIconUrl from "../../img/select_yes.svg";
import zoomIconUrl from "../../img/zoom.svg";
import zoomBigIconUrl from "../../img/zoombig.svg";
import type { TxGraphChainKey, TxGraphEdge, TxGraphEdgeKind, TxGraphNode } from "../../types/txGraph";

const props = defineProps<{
  rpcMap: Record<TxGraphChainKey, string>;
  initialQuery?: { chain: TxGraphChainKey; hash: string; nonce: number } | null;
}>();

const chains: { value: TxGraphChainKey; label: string; icon: string }[] = [
  { value: "ethereum", label: "Ethereum", icon: ethIcon },
  { value: "bnb", label: "BNB", icon: bnbIcon },
  { value: "arbitrum", label: "Arbitrum", icon: arbIcon },
];

const filters: { key: TxGraphEdgeKind; label: string }[] = [
  { key: "transfer", label: "转账" },
  { key: "call", label: "合约调用" },
  { key: "reference", label: "引用" },
];

const txHash = ref("");
const chain = ref<TxGraphChainKey>("ethereum");
const graphPanel = ref<HTMLElement | null>(null);
const graphContainer = ref<HTMLElement | null>(null);
const cy = ref<Core | null>(null);
const dashOffset = ref(0);
let dashTimer = 0;
const visibleKinds = reactive<Record<TxGraphEdgeKind, boolean>>({
  transfer: true,
  call: true,
  reference: true,
});
const lastAppliedQuery = ref(0);

const { data, loading, error, loadGraph } = useTxGraph();

const rpcMissing = computed(() => !props.rpcMap[chain.value]?.trim());
const canQuery = computed(() => /^0x[a-fA-F0-9]{64}$/.test(txHash.value.trim()) && !rpcMissing.value && !loading.value);
const currentChainLabel = computed(() => chains.find((item) => item.value === chain.value)?.label ?? "Ethereum");
const explorerTxUrl = computed(() => {
  if (!data.value?.txHash) return "";
  const base =
    data.value.chain === "bnb"
      ? "https://bscscan.com/tx/"
      : data.value.chain === "arbitrum"
        ? "https://arbiscan.io/tx/"
        : "https://etherscan.io/tx/";
  return `${base}${data.value.txHash}`;
});

watch(chain, () => {
  error.value = "";
});

watch(
  () => props.initialQuery,
  (query) => {
    if (!query || query.nonce === lastAppliedQuery.value) return;
    lastAppliedQuery.value = query.nonce;
    chain.value = query.chain;
    txHash.value = query.hash;
    void nextTick(() => {
      void submit();
    });
  },
  { immediate: true },
);

watch(
  [data, () => visibleKinds.transfer, () => visibleKinds.call, () => visibleKinds.reference],
  () => {
    void nextTick(() => {
      void renderGraph();
    });
  },
);

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  stopEdgeMotion();
  cy.value?.destroy();
  cy.value = null;
});

document.addEventListener("fullscreenchange", handleFullscreenChange);

async function submit() {
  const value = txHash.value.trim();
  if (rpcMissing.value) {
    ElMessage.warning("请先配置当前链 RPC。");
    return;
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    ElMessage.warning("请输入正确的交易哈希。");
    return;
  }
  await loadGraph(chain.value, value);
}

async function renderGraph() {
  const container = graphContainer.value;
  const payload = data.value;
  if (!container || !payload || !payload.ok) {
    cy.value?.destroy();
    cy.value = null;
    return;
  }

  const elements = createGraphElements(payload.nodes, payload.edges);
  if (cy.value) {
    cy.value.destroy();
    cy.value = null;
  }

  const cytoscapeFactory = await loadCytoscape();
  cy.value = cytoscapeFactory({
    container,
    elements,
    style: graphStyles as never,
    layout: {
      name: "cola",
      animate: true,
      refresh: 2,
      maxSimulationTime: 4200,
      ungrabifyWhileSimulating: false,
      fit: true,
      padding: 72,
      randomize: false,
      avoidOverlap: true,
      handleDisconnected: true,
      convergenceThreshold: 0.008,
      centerGraph: true,
      nodeSpacing: 28,
      edgeLength: (edge: { data: (key: string) => unknown }) => {
        const kind = edge.data("kind");
        if (kind === "call") return 112 + Number(edge.data("weight") || 1) * 8;
        if (kind === "reference") return 170;
        return 128 + Number(edge.data("weight") || 1) * 6;
      },
    } as never,
    wheelSensitivity: 0.18,
  });
  bindGraphInteractions();
  startEdgeMotion();
  void nextTick(fitGraph);
}

let cytoscapeFactoryPromise: Promise<typeof cytoscape> | null = null;

async function loadCytoscape() {
  cytoscapeFactoryPromise ??= Promise.all([import("cytoscape"), import("cytoscape-cola")]).then(([cyModule, colaModule]) => {
    cyModule.default.use(colaModule.default);
    return cyModule.default;
  });
  return cytoscapeFactoryPromise;
}

function bindGraphInteractions() {
  const graph = cy.value;
  if (!graph) return;
  graph.on("grab", "node", () => {
    graph.elements().removeClass("is-dimmed is-active is-active-node is-active-neighbor");
  });
  graph.on("dragfree", "node", () => {
    graph.layout({
      name: "cola",
      animate: true,
      refresh: 2,
      maxSimulationTime: 1600,
      fit: false,
      padding: 72,
      randomize: false,
      avoidOverlap: true,
      handleDisconnected: true,
      nodeSpacing: 28,
      edgeLength: 140,
    } as never).run();
  });
}

function startEdgeMotion() {
  stopEdgeMotion();
  dashTimer = window.setInterval(() => {
    const graph = cy.value;
    if (!graph) return;
    dashOffset.value = (dashOffset.value + 1) % 16;
    graph.style()
      .selector(".edge-reference")
      .style("line-dash-offset", dashOffset.value)
      .update();
  }, 90);
}

function stopEdgeMotion() {
  if (dashTimer) {
    window.clearInterval(dashTimer);
    dashTimer = 0;
  }
}

function zoomGraph(factor: number) {
  const graph = cy.value;
  if (!graph) return;
  graph.zoom({
    level: graph.zoom() * factor,
    renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 },
  });
}

function fitGraph() {
  const graph = cy.value;
  if (!graph) return;
  window.requestAnimationFrame(() => {
    graph.resize();
    graph.fit(graph.elements(":visible"), 72);
    graph.center(graph.elements(":visible"));
  });
}

function handleFullscreenChange() {
  fitGraph();
}

function createGraphElements(nodes: TxGraphNode[], edges: TxGraphEdge[]): ElementDefinition[] {
  const activeNodeIds = new Set<string>();
  for (const edge of edges) {
    activeNodeIds.add(edge.source);
    activeNodeIds.add(edge.target);
  }
  const stats = createNodeStats(edges);
  const nodeElements: ElementDefinition[] = nodes
    .filter((node) => activeNodeIds.has(node.id))
    .map((node) => {
      const role = nodeRole(node);
      return {
        data: {
          id: node.id,
          label: node.label,
          kind: node.kind,
          role,
          icon: nodeIcon(role),
          size: nodeSize(role, stats[node.id]?.degree ?? 0),
          raw: node,
        },
        classes: `node-${node.kind} role-${role}`,
      };
    });
  const edgeElements: ElementDefinition[] = edges.map((edge) => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      kind: edge.kind,
      raw: edge,
      weight: edgeWeight(edge.kind, stats[edge.source]?.degree ?? 1, stats[edge.target]?.degree ?? 1),
    },
    classes: `edge-${edge.kind}${visibleKinds[edge.kind] ? "" : " edge-hidden"}`,
  }));
  return nodeElements.concat(edgeElements);
}

function createNodeStats(edges: TxGraphEdge[]) {
  const stats: Record<string, { degree: number }> = {};
  for (const edge of edges) {
    stats[edge.source] = stats[edge.source] ?? { degree: 0 };
    stats[edge.target] = stats[edge.target] ?? { degree: 0 };
    stats[edge.source].degree += 1;
    stats[edge.target].degree += 1;
  }
  return stats;
}

function nodeRole(node: TxGraphNode) {
  if (node.kind === "token") return "token";
  if (node.kind === "wallet") return "wallet";
  if (node.kind === "system") return "system";
  return "contract";
}

function nodeIcon(role: string) {
  if (role === "wallet") return walletIconUrl;
  if (role === "token") return tokenIconUrl;
  if (role === "exchange") return exchangeIconUrl;
  if (role === "system") return systemIconUrl;
  return setupIconUrl;
}

function nodeSize(role: string, degree: number) {
  if (role === "wallet" || role === "token") return Math.min(38, 30 + Math.max(0, degree - 2) * 0.34);
  if (role === "system") return Math.min(35, 28 + Math.max(0, degree - 1) * 0.24);
  return Math.min(34, 26 + Math.max(0, degree - 1) * 0.24);
}

function edgeWeight(kind: TxGraphEdgeKind, sourceDegree: number, targetDegree: number) {
  if (kind === "reference") return 0.9;
  if (kind === "call") return Math.max(0.9, Math.min(4.2, 0.95 + Math.max(sourceDegree, targetDegree) * 0.11));
  return Math.max(0.85, Math.min(3.4, 0.7 + Math.max(sourceDegree, targetDegree) * 0.04));
}

function shortHash(value: string | undefined) {
  if (!value) return "--";
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

const graphStyles = [
  {
    selector: "node",
    style: {
      shape: "rectangle",
      "background-opacity": 0,
      "background-image": "data(icon)",
      "background-fit": "contain",
      "background-width": "88%",
      "background-height": "88%",
      "background-repeat": "no-repeat",
      "border-width": 0,
      label: "data(label)",
      "font-size": 5.2,
      "font-weight": 500,
      color: "#4b5057",
      "text-wrap": "wrap",
      "text-max-width": 160,
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 10,
      "text-outline-width": 0.62,
      "text-outline-color": "#ffffff",
      "text-outline-opacity": 0.82,
      width: "data(size)",
      height: "data(size)",
    },
  },
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "line-cap": "round",
      "target-arrow-shape": "vee",
      "arrow-scale": 0.82,
      width: "mapData(weight, 0.85, 4.2, 0.85, 2.9)",
      "line-color": "#bcc3cd",
      "target-arrow-color": "#bcc3cd",
      opacity: 0.72,
      label: "data(label)",
      "font-size": 4.25,
      "font-weight": 450,
      color: "#646a73",
      "text-rotation": "autorotate",
      "text-margin-y": -1,
      "text-outline-width": 0.52,
      "text-outline-color": "#ffffff",
      "text-outline-opacity": 0.78,
    },
  },
  {
    selector: ".edge-transfer",
    style: {
      "line-color": "#6f7885",
      "target-arrow-color": "#6f7885",
      opacity: 0.82,
      color: "#d3dae3",
    },
  },
  {
    selector: ".edge-call",
    style: {
      "line-color": "#74df57",
      "target-arrow-color": "#74df57",
      opacity: 0.8,
      color: "#57a844",
    },
  },
  {
    selector: ".edge-reference",
    style: {
      "line-color": "#5eaef4",
      "target-arrow-color": "#5eaef4",
      "line-style": "dashed",
      "line-dash-pattern": [4, 4],
      opacity: 0.6,
      color: "#5b93cb",
    },
  },
  {
    selector: ".edge-hidden",
    style: {
      opacity: 0,
      "text-opacity": 0,
      "overlay-opacity": 0,
      "underlay-opacity": 0,
    },
  },
];
</script>

<style scoped src="./TxGraphPanel.css"></style>
