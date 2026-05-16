<template>
  <div class="app-shell" :class="{ 'is-authenticated': isAuthenticated }">
    <section v-if="!isAuthenticated" class="login-screen">
      <canvas ref="loginCanvas" class="login-canvas" aria-hidden="true"></canvas>
      <main class="login-panel">
        <div class="login-brand-row">
          <img class="login-wordmark" :src="miniLogoUrl" alt="SuperARB" />
          <span class="login-version">1.2</span>
        </div>

        <el-form class="auth-form" @submit.prevent="submitLogin">
          <label class="field-label" for="auth-code">授权码</label>
          <el-input
            id="auth-code"
            v-model="authCode"
            :type="showAuthCode ? 'text' : 'password'"
            size="large"
            placeholder="SMT-XXXX-XXXX-XXXX-XXXX"
            autocomplete="one-time-code"
            spellcheck="false"
            :prefix-icon="Key"
            @input="formatCode"
          >
            <template #suffix>
              <button
                class="visibility-toggle"
                type="button"
                :aria-label="showAuthCode ? '隐藏授权码' : '显示授权码'"
                @click="showAuthCode = !showAuthCode"
              >
                <el-icon><component :is="showAuthCode ? Hide : View" /></el-icon>
              </button>
            </template>
          </el-input>
          <div class="form-row">
            <el-checkbox v-model="rememberCode">保存授权码</el-checkbox>
          </div>
          <el-alert
            v-if="authMessage"
            class="auth-alert"
            :title="authMessage"
            :type="authMessageType"
            :closable="false"
            show-icon
          />
          <el-button
            class="primary-action"
            size="large"
            type="primary"
            native-type="submit"
            :loading="loginLoading"
          >
            进入控制台
          </el-button>
        </el-form>
      </main>
    </section>

    <section v-else class="workspace">
      <header class="topbar">
        <div class="topbar-left">
          <img class="system-wordmark" :src="miniLogoUrl" alt="SuperARB" />
          <span class="topbar-version">1.2</span>
        </div>
        <div class="topbar-right">
          <div ref="githubVersionControl" class="github-version-control">
            <button class="github-version-button" type="button" aria-label="GitHub 版本状态" @click="githubMenuOpen = !githubMenuOpen">
              <span class="github-version-main">
                <img :src="githubIconUrl" alt="" aria-hidden="true" />
                <span>GitHub v{{ githubLatestVersion }}</span>
              </span>
              <span class="github-version-arrow" :class="{ active: githubMenuOpen }" aria-hidden="true">
                <img :src="arrowIconUrl" alt="" />
              </span>
            </button>
            <div v-if="githubMenuOpen" class="github-version-menu" :class="{ 'has-update': githubVersionState === 'update' }">
              <strong class="github-version-title">
                <img :src="infoNewIconUrl" alt="" aria-hidden="true" />
                {{ githubVersionTitle }}
              </strong>
              <div class="github-version-lines">
                <span>当前版本</span>
                <strong>v{{ appVersion }}</strong>
                <span>GitHub 最新</span>
                <strong>v{{ githubLatestVersion }}</strong>
              </div>
              <p v-if="githubVersionMessage">{{ githubVersionMessage }}</p>
            </div>
          </div>
        </div>
      </header>

      <SidebarNav :items="navItems" :active-key="activeView" @select="activeView = $event as ViewKey" />

      <main class="content-area" :class="`view-${activeView}`">
        <section class="hero-strip">
          <div>
            <p class="eyebrow">{{ pageEyebrow }}</p>
            <h1>{{ currentNavLabel }}</h1>
          </div>
        </section>

        <template v-if="activeView === 'news'">
          <NewsPanel
            :items="newsItems"
            :loading="newsLoading"
            :error="newsError"
            :selected-id="selectedNewsId"
            @refresh="loadNews"
            @select="selectedNewsId = $event"
          />
        </template>

        <template v-else-if="activeView === 'txgraph'">
          <TxGraphPanel :rpc-map="settingsForm.rpc" :initial-query="txGraphInitialQuery" />
        </template>

        <template v-else-if="activeView === 'analytics'">
          <LiquidationView ref="liquidationViewRef" @refresh="refreshData" />
        </template>

        <template v-else-if="activeView === 'liquidationTopic'">
          <LiquidationTopicView />
        </template>

        <template v-else-if="activeView === 'execution'">
          <LatestLiquidationsView @open-tx-graph="openTxGraphFromLiquidation" />
        </template>

        <template v-else-if="activeView === 'settings'">
          <SettingsView
            :settings-sections="settingsSections"
            v-model:settings-section="settingsSection"
            :current-settings-section="currentSettingsSection"
            :settings-form="settingsForm"
            v-model:settings-secrets-visible="settingsSecretsVisible"
            :secret-input-type="secretInputType"
            :settings-save-dialog-visible="settingsSaveDialogVisible"
            :settings-save-state="settingsSaveState"
            :settings-env-path="settingsEnvPath"
            :save-icon-url="saveIconUrl"
            :rpc-fields="rpcFields"
            :feed-fields="feedFields"
            :queue-fields="queueFields"
            :cache-fields="cacheFields"
            :exchange-fields="exchangeFields"
            @save="saveSettings"
            @logout="logout"
          />
        </template>

        <template v-else>
          <DashboardView
            :metrics="metrics"
            :news-items="newsItems"
            :news-loading="newsLoading"
            :news-error="newsError"
            :market-icon="marketIcon"
            @open-news="activeView = 'news'"
          />
        </template>
      </main>

      <footer class="fixed-footer">
        <span class="footer-copyright">
          <img :src="footerLogoUrl" alt="SuperARB" />
          Copyright © 2026 SuperMT Node. Internal testing only.
        </span>
        <span>Local: http://127.0.0.1:4310</span>
      </footer>
    </section>

    <el-dialog
      v-model="settingsSaveDialogVisible"
      class="system-dialog settings-save-dialog"
      width="380px"
      :close-on-click-modal="settingsSaveState !== 'saving'"
      :close-on-press-escape="settingsSaveState !== 'saving'"
      :show-close="settingsSaveState !== 'saving'"
      align-center
    >
      <template #header>
        <div class="settings-save-title">{{ settingsSaveTitle }}</div>
      </template>
      <div class="settings-save-body" :class="`is-${settingsSaveState}`">
        <span class="settings-save-indicator" aria-hidden="true"></span>
        <p>{{ settingsSaveMessage }}</p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { Hide, Key, View } from "@element-plus/icons-vue";
import { useNews } from "./composables/useNews";
import DashboardView from "./features/dashboard/DashboardView.vue";
import LatestLiquidationsView from "./features/latest-liquidations/LatestLiquidationsView.vue";
import LiquidationView from "./features/liquidation/LiquidationView.vue";
import LiquidationTopicView from "./features/liquidation/LiquidationTopicView.vue";
import NewsPanel from "./features/news/NewsPanel.vue";
import SettingsView from "./features/settings/SettingsView.vue";
import SidebarNav from "./features/sidebar/SidebarNav.vue";
import miniLogoUrl from "./img/SuperARBmini.png";
import aaveIcon from "./img/aave-token-round.svg";
import arbIcon from "./img/arb.svg";
import baseIcon from "./img/base.svg";
import bnbIcon from "./img/bnb.svg";
import controlIconUrl from "./img/control.svg";
import ethIcon from "./img/eth.svg";
import infoIconUrl from "./img/info2.svg";
import infoNewIconUrl from "./img/infonew.svg";
import liqItemIconUrl from "./img/liqitem.svg";
import newLiqIconUrl from "./img/newliq.svg";
import polygonIcon from "./img/Polygon.svg";
import queryIconUrl from "./img/sarchhash.svg";
import saveIconUrl from "./img/save.svg";
import arrowIconUrl from "./img/arrow.svg";
import footerLogoUrl from "./img/SuperARB_logo.png";
import githubIconUrl from "./img/github.svg";
import homeIconUrl from "./img/home.svg";
import setupIconUrl from "./img/setup.svg";

type AuthMessageType = "success" | "warning" | "info" | "error";
type SettingsSaveState = "saving" | "done" | "error";
type GithubVersionState = "checking" | "latest" | "update" | "unconfigured" | "error";
type ViewKey = "overview" | "execution" | "analytics" | "liquidationTopic" | "news" | "txgraph" | "settings";
type SettingsSectionKey = "general" | "rpc" | "feeds" | "queue" | "cache" | "exchanges";
type RpcKey = "ethereum" | "bnb" | "arbitrum" | "base" | "polygon";
type FeedKey =
  | "default"
  | "ethereum"
  | "bnb"
  | "arbitrum"
  | "polygon"
  | "snapshotApiUrl"
  | "snapshotToken"
  | "snapshotTimeoutMs";
type QueueKey =
  | "apiBaseUrl"
  | "statusUrl"
  | "eventUrl"
  | "arbitrumApiBaseUrl"
  | "bnbApiBaseUrl"
  | "enabled"
  | "host"
  | "port"
  | "stateFile"
  | "memberTtlSeconds"
  | "leaseSeconds"
  | "allowedChains"
  | "adminToken";
type CacheKey = "redisUrl" | "snapshotTtlMs" | "staleMs" | "sourceTimeoutMs";
type ExchangeKey = "binance" | "okx" | "bitget" | "mexc" | "gate";

const AUTH_STORAGE_KEY = "liq2-auth-session";
const AUTH_CODE_KEY = "liq2-auth-code";
const ACTIVE_VIEW_KEY = "liq2-active-view";
const SETTINGS_SECTION_KEY = "liq2-settings-section";
const AUTH_CODE_PATTERN = /^SMT-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/i;
const appVersion = "1.2";

const TxGraphPanel = defineAsyncComponent(() => import("./features/txgraph/TxGraphPanel.vue"));
const viewKeys = ["overview", "execution", "analytics", "liquidationTopic", "news", "txgraph", "settings"] satisfies ViewKey[];
const settingsSectionKeys = ["general", "rpc", "feeds", "queue", "cache", "exchanges"] satisfies SettingsSectionKey[];

const authCode = ref("");
const showAuthCode = ref(false);
const rememberCode = ref(true);
const loginLoading = ref(false);
const authMessage = ref("");
const authMessageType = ref<AuthMessageType>("info");
const isAuthenticated = ref(false);
const loginCanvas = ref<HTMLCanvasElement | null>(null);
const activeView = ref<ViewKey>(readStoredValue(ACTIVE_VIEW_KEY, viewKeys, "overview"));
const settingsSection = ref<SettingsSectionKey>(readStoredValue(SETTINGS_SECTION_KEY, settingsSectionKeys, "general"));
const settingsSecretsVisible = ref(false);
const settingsEnvPath = ref(".env");
const settingsSaveDialogVisible = ref(false);
const settingsSaveState = ref<SettingsSaveState>("saving");
const settingsSaveMessage = ref("正在保存 .env 并刷新联动设置...");
const selectedNewsId = ref("");
const githubLatestVersion = ref(appVersion);
const githubVersionState = ref<GithubVersionState>("checking");
const githubVersionMessage = ref("正在检查 GitHub 最新版本...");
const githubMenuOpen = ref(false);
const githubVersionControl = ref<HTMLElement | null>(null);
const txGraphInitialQuery = ref<{ chain: "ethereum" | "bnb" | "arbitrum"; hash: string; nonce: number } | null>(null);
const liquidationViewRef = ref<InstanceType<typeof LiquidationView> | null>(null);
const { newsItems, newsLoading, newsError, loadNews } = useNews();

const navItems = [
  { key: "overview" as const, label: "总览", iconUrl: homeIconUrl },
  { key: "execution" as const, label: "最新清算", iconUrl: newLiqIconUrl },
  { key: "analytics" as const, label: "清算控制面板", iconUrl: controlIconUrl },
  { key: "liquidationTopic" as const, label: "清算专题", iconUrl: liqItemIconUrl },
  { key: "news" as const, label: "资讯", iconUrl: infoIconUrl },
  { key: "txgraph" as const, label: "查询", iconUrl: queryIconUrl },
  { key: "settings" as const, label: "设置", iconUrl: setupIconUrl },
];

const settingsSections = [
  { key: "general" as const, label: "通用", hint: "私钥、Token、语言", eyebrow: "General" },
  { key: "rpc" as const, label: "RPC", hint: "各链端点", eyebrow: "Network" },
  { key: "exchanges" as const, label: "交易所", hint: "套利 API keys", eyebrow: "Exchanges" },
  { key: "feeds" as const, label: "公共 Feed", hint: "清算候选数据源", eyebrow: "Feeds" },
  { key: "queue" as const, label: "执行队列", hint: "队列桥与本地服务", eyebrow: "Queue" },
  { key: "cache" as const, label: "缓存", hint: "Redis 与快照", eyebrow: "Cache" },
];

const rpcFields = [
  { key: "ethereum" as const, label: "Ethereum", env: "ETHEREUM_RPC_URL", icon: ethIcon },
  { key: "bnb" as const, label: "BNB", env: "BNB_RPC_URL", icon: bnbIcon },
  { key: "arbitrum" as const, label: "Arbitrum", env: "ARBITRUM_RPC_URL", icon: arbIcon },
  { key: "base" as const, label: "Base", env: "BASE_RPC_URL", icon: baseIcon },
  { key: "polygon" as const, label: "Polygon", env: "POLYGON_RPC_URL", icon: polygonIcon },
];

const feedFields = [
  { key: "snapshotApiUrl" as const, env: "LIQUIDATION_SNAPSHOT_API_URL", placeholder: "https://.../api/liquidation-snapshots" },
  { key: "snapshotToken" as const, env: "LIQUIDATION_SNAPSHOT_TOKEN", placeholder: "snapshot service token", secret: true },
  { key: "snapshotTimeoutMs" as const, env: "LIQUIDATION_SNAPSHOT_TIMEOUT_MS", placeholder: "8000" },
  { key: "default" as const, env: "PUBLIC_LIQUIDATION_FEED_URL", placeholder: "https://..." },
  { key: "ethereum" as const, env: "PUBLIC_LIQUIDATION_FEED_ETHEREUM_URL", placeholder: "https://..." },
  { key: "bnb" as const, env: "PUBLIC_LIQUIDATION_FEED_BNB_URL", placeholder: "https://..." },
  { key: "arbitrum" as const, env: "PUBLIC_LIQUIDATION_FEED_ARBITRUM_URL", placeholder: "https://..." },
  { key: "polygon" as const, env: "PUBLIC_LIQUIDATION_FEED_POLYGON_URL", placeholder: "https://..." },
];

const queueFields = [
  { key: "apiBaseUrl" as const, env: "LIQUIDATION_QUEUE_API_BASE_URL", placeholder: "https://...", full: true },
  { key: "statusUrl" as const, env: "LIQUIDATION_QUEUE_STATUS_URL", placeholder: "https://...", full: true },
  { key: "eventUrl" as const, env: "LIQUIDATION_QUEUE_EVENT_URL", placeholder: "https://...", full: true },
  { key: "arbitrumApiBaseUrl" as const, env: "LIQUIDATION_QUEUE_ARBITRUM_API_BASE_URL", placeholder: "https://arb.rpc.supermtnode.io/api/admin/liquidation-queue", full: true },
  { key: "bnbApiBaseUrl" as const, env: "LIQUIDATION_QUEUE_BNB_API_BASE_URL", placeholder: "https://bsc.rpc.supermtnode.io/api/admin/liquidation-queue", full: true },
  { key: "enabled" as const, env: "SUPERMTNODE_LIQUIDATION_QUEUE_ENABLED", placeholder: "true / false" },
  { key: "host" as const, env: "LIQUIDATION_QUEUE_HOST", placeholder: "0.0.0.0" },
  { key: "port" as const, env: "LIQUIDATION_QUEUE_PORT", placeholder: "4311" },
  { key: "stateFile" as const, env: "LIQUIDATION_QUEUE_STATE_FILE", placeholder: ".superarb/liquidation-queue.json" },
  { key: "memberTtlSeconds" as const, env: "LIQUIDATION_QUEUE_MEMBER_TTL_SECONDS", placeholder: "120" },
  { key: "leaseSeconds" as const, env: "LIQUIDATION_QUEUE_LEASE_SECONDS", placeholder: "45" },
  { key: "allowedChains" as const, env: "LIQUIDATION_QUEUE_ALLOWED_CHAINS", placeholder: "ethereum,bnb,arbitrum" },
  { key: "adminToken" as const, env: "LIQUIDATION_QUEUE_ADMIN_TOKEN", placeholder: "admin token", secret: true, full: true },
];

const cacheFields = [
  { key: "redisUrl" as const, env: "DASHBOARD_OVERVIEW_REDIS_URL", placeholder: "redis://127.0.0.1:6379" },
  { key: "snapshotTtlMs" as const, env: "DASHBOARD_OVERVIEW_SNAPSHOT_TTL_MS", placeholder: "300000" },
  { key: "staleMs" as const, env: "DASHBOARD_OVERVIEW_STALE_MS", placeholder: "1800000" },
  { key: "sourceTimeoutMs" as const, env: "DASHBOARD_OVERVIEW_SOURCE_TIMEOUT_MS", placeholder: "8000" },
];

const exchangeFields = [
  { key: "binance" as const, label: "Binance", apiEnv: "BINANCE_API_KEY", secretEnv: "BINANCE_SECRET_KEY" },
  { key: "okx" as const, label: "OKX", apiEnv: "OKX_API_KEY", secretEnv: "OKX_SECRET_KEY" },
  { key: "bitget" as const, label: "Bitget", apiEnv: "BITGET_API_KEY", secretEnv: "BITGET_SECRET_KEY" },
  { key: "mexc" as const, label: "MEXC", apiEnv: "MEXC_API_KEY", secretEnv: "MEXC_SECRET_KEY" },
  { key: "gate" as const, label: "Gate", apiEnv: "GATE_API_KEY", secretEnv: "GATE_SECRET_KEY" },
];

const settingsForm = reactive({
  privateKey: "",
  superMtNodeAppToken: "",
  fundingMode: "flash_loan",
  language: "zh",
  rpc: {
    ethereum: "",
    bnb: "",
    arbitrum: "",
    base: "",
    polygon: "",
  } as Record<RpcKey, string>,
  feeds: {
    default: "",
    ethereum: "",
    bnb: "",
    arbitrum: "",
    polygon: "",
    snapshotApiUrl: "",
    snapshotToken: "",
    snapshotTimeoutMs: "8000",
  } as Record<FeedKey, string>,
  queue: {
    apiBaseUrl: "",
    statusUrl: "",
    eventUrl: "",
    arbitrumApiBaseUrl: "https://arb.rpc.supermtnode.io/api/admin/liquidation-queue",
    bnbApiBaseUrl: "https://bsc.rpc.supermtnode.io/api/admin/liquidation-queue",
    enabled: "",
    host: "0.0.0.0",
    port: "4311",
    stateFile: ".superarb/liquidation-queue.json",
    memberTtlSeconds: "120",
    leaseSeconds: "45",
    allowedChains: "",
    adminToken: "",
  } as Record<QueueKey, string>,
  cache: {
    redisUrl: "redis://127.0.0.1:6379",
    snapshotTtlMs: "300000",
    staleMs: "1800000",
    sourceTimeoutMs: "8000",
  } as Record<CacheKey, string>,
  arbitrageVenues: "binance,okx,bitget,mexc,gate",
  exchanges: {
    binance: { apiKey: "", secretKey: "" },
    okx: { apiKey: "", secretKey: "" },
    bitget: { apiKey: "", secretKey: "" },
    mexc: { apiKey: "", secretKey: "" },
    gate: { apiKey: "", secretKey: "" },
  } as Record<ExchangeKey, { apiKey: string; secretKey: string }>,
});

const currentNavLabel = computed(() => {
  return navItems.find((item) => item.key === activeView.value)?.label ?? "总览";
});

const pageEyebrow = computed(() => {
  if (activeView.value === "settings") return "System Setup";
  if (activeView.value === "news") return "News";
  if (activeView.value === "txgraph") return "Query";
  if (activeView.value === "execution") return "Latest Liquidations";
  if (activeView.value === "analytics") return "Liquidation Control Panel";
  if (activeView.value === "liquidationTopic") return "Liquidation Strategy Atlas";
  return "Operations Overview";
});

const currentSettingsSection = computed(() => {
  return settingsSections.find((section) => section.key === settingsSection.value) ?? settingsSections[0];
});

const secretInputType = computed(() => (settingsSecretsVisible.value ? "text" : "password"));
const settingsSaveTitle = computed(() => {
  if (settingsSaveState.value === "done") return "保存完成";
  if (settingsSaveState.value === "error") return "保存失败";
  return "保存中";
});

const githubVersionTitle = computed(() => {
  if (githubVersionState.value === "update") return "发现 GitHub 新版本";
  if (githubVersionState.value === "checking") return "正在检查版本";
  if (githubVersionState.value === "unconfigured") return "未配置版本检测";
  if (githubVersionState.value === "error") return "版本检测失败";
  return "已经是最新版";
});

const metrics = ref([
  { label: "候选账户", value: "0", trend: 0 },
  { label: "可执行机会", value: "0", trend: 0 },
  { label: "预计收益", value: "$0", trend: 0 },
  { label: "失败保护", value: "0%", trend: 0 },
]);

let animationFrame = 0;
let resizeHandler: (() => void) | null = null;

onMounted(() => {
  authCode.value = localStorage.getItem(AUTH_CODE_KEY) ?? "";
  isAuthenticated.value = localStorage.getItem(AUTH_STORAGE_KEY) === "authorized";
  loadSettings();
  void loadGithubVersion();
  document.addEventListener("pointerdown", closeGithubMenuOnOutside);
  if (isAuthenticated.value) {
    void loadNews();
  }
  if (!isAuthenticated.value) {
    void nextTick(startLoginCanvas);
  }
});

onBeforeUnmount(() => {
  stopLoginCanvas();
  document.removeEventListener("pointerdown", closeGithubMenuOnOutside);
});

watch(isAuthenticated, async (authorized) => {
  if (authorized) {
    stopLoginCanvas();
    void loadNews();
    return;
  }
  await nextTick();
  startLoginCanvas();
});

watch(activeView, (view) => {
  localStorage.setItem(ACTIVE_VIEW_KEY, view);
});

watch(settingsSection, (section) => {
  localStorage.setItem(SETTINGS_SECTION_KEY, section);
});

function readStoredValue<T extends string>(key: string, allowedValues: readonly T[], fallback: T): T {
  const value = localStorage.getItem(key);
  return allowedValues.includes(value as T) ? (value as T) : fallback;
}

function formatCode() {
  authCode.value = authCode.value.trim().toUpperCase();
}

async function submitLogin() {
  const code = authCode.value.trim().toUpperCase();
  authMessage.value = "";

  if (!AUTH_CODE_PATTERN.test(code)) {
    authMessage.value = "请输入正确的授权码";
    authMessageType.value = "error";
    return;
  }

  loginLoading.value = true;
  try {
    const response = await fetch("/api/license/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      valid?: boolean;
      status?: string;
      error?: string;
    };

    if (!response.ok || payload.ok !== true || payload.valid !== true || payload.status !== "active") {
      throw new Error(mapAuthError(payload.error ?? payload.status ?? `HTTP ${response.status}`));
    }

    if (rememberCode.value) {
      localStorage.setItem(AUTH_CODE_KEY, code);
    } else {
      localStorage.removeItem(AUTH_CODE_KEY);
    }
    localStorage.setItem(AUTH_STORAGE_KEY, "authorized");
    isAuthenticated.value = true;
    ElMessage.success("授权验证成功");
  } catch (error) {
    authMessage.value = error instanceof Error ? error.message : "授权服务暂时不可用";
    authMessageType.value = "error";
  } finally {
    loginLoading.value = false;
  }
}

function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  isAuthenticated.value = false;
  githubMenuOpen.value = false;
  ElMessage.success("已退出登录");
}

function mapAuthError(error: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("expired") || normalized.includes("inactive") || normalized.includes("revoked")) {
    return "授权码已失效";
  }
  if (normalized.includes("missing") || normalized.includes("not_found") || normalized.includes("not found")) {
    return "授权码不存在";
  }
  if (normalized.includes("http 404")) {
    return "授权服务地址不可用";
  }
  return "请输入正确的授权码";
}

function marketIcon(chain: string) {
  if (chain === "ethereum") return ethIcon;
  if (chain === "bnb") return bnbIcon;
  if (chain === "base") return baseIcon;
  if (chain === "arbitrum") return arbIcon;
  if (chain === "polygon") return polygonIcon;
  return aaveIcon;
}

function refreshData() {}

function openTxGraphFromLiquidation(payload: { chain: "ethereum" | "bnb" | "arbitrum"; hash: string }) {
  txGraphInitialQuery.value = { ...payload, nonce: Date.now() };
  activeView.value = "txgraph";
}

function closeGithubMenuOnOutside(event: PointerEvent) {
  if (!githubMenuOpen.value) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (githubVersionControl.value?.contains(target)) return;
  githubMenuOpen.value = false;
}

async function loadSettings() {
  try {
    const response = await fetch("/api/settings");
    if (!response.ok) return;
    const payload = (await response.json()) as {
      path?: string;
      env?: Record<string, string>;
      example?: Record<string, string>;
    };
    settingsEnvPath.value = payload.path ?? settingsEnvPath.value;
    applyEnvSettings({ ...payload.example, ...payload.env });
  } catch {
    // Settings API is available in the local dashboard dev server.
  }
}

async function loadGithubVersion() {
  githubVersionState.value = "checking";
  githubVersionMessage.value = "正在检查 GitHub 最新版本...";
  try {
    const response = await fetch("/api/github-version");
    if (!response.ok) throw new Error("GitHub 版本接口暂不可用");
    const payload = (await response.json()) as {
      configured?: boolean;
      currentVersion?: string;
      latestVersion?: string;
      isLatest?: boolean;
      message?: string;
    };
    githubLatestVersion.value = payload.latestVersion || appVersion;
    githubVersionState.value = payload.configured === false ? "unconfigured" : payload.isLatest ? "latest" : "update";
    githubVersionMessage.value = payload.message ?? "";
  } catch (error) {
    githubLatestVersion.value = appVersion;
    githubVersionState.value = "error";
    githubVersionMessage.value = error instanceof Error ? error.message : "GitHub 版本检测失败";
  }
}

async function saveSettings() {
  settingsSaveState.value = "saving";
  settingsSaveMessage.value = "正在保存 .env 并刷新联动设置...";
  settingsSaveDialogVisible.value = true;

  try {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ env: generateEnvText() }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "保存失败");
    }
    const payload = (await response.json().catch(() => ({}))) as { path?: string };
    settingsEnvPath.value = payload.path ?? settingsEnvPath.value;
    await loadSettings();
    settingsSaveState.value = "done";
    settingsSaveMessage.value = "设置已保存到 .env，联动配置已刷新。";
    window.setTimeout(() => {
      if (settingsSaveState.value === "done") {
        settingsSaveDialogVisible.value = false;
      }
    }, 1200);
  } catch (error) {
    settingsSaveState.value = "error";
    settingsSaveMessage.value = error instanceof Error ? error.message : "保存失败";
  }
}

function generateEnvText() {
  const lines = [
    "# Generated from SuperARB 1.2 internal settings",
    `PRIVATE_KEY=${settingsForm.privateKey}`,
    `DASHBOARD_LANGUAGE=${settingsForm.language}`,
    `FUNDING_MODE=${settingsForm.fundingMode}`,
    `ETHEREUM_RPC_URL=${settingsForm.rpc.ethereum}`,
    `BNB_RPC_URL=${settingsForm.rpc.bnb}`,
    `ARBITRUM_RPC_URL=${settingsForm.rpc.arbitrum}`,
    `BASE_RPC_URL=${settingsForm.rpc.base}`,
    `POLYGON_RPC_URL=${settingsForm.rpc.polygon}`,
    "",
    `PUBLIC_LIQUIDATION_FEED_URL=${settingsForm.feeds.default}`,
    `PUBLIC_LIQUIDATION_FEED_ETHEREUM_URL=${settingsForm.feeds.ethereum}`,
    `PUBLIC_LIQUIDATION_FEED_BNB_URL=${settingsForm.feeds.bnb}`,
    `PUBLIC_LIQUIDATION_FEED_ARBITRUM_URL=${settingsForm.feeds.arbitrum}`,
    `PUBLIC_LIQUIDATION_FEED_POLYGON_URL=${settingsForm.feeds.polygon}`,
    "",
    `LIQUIDATION_SNAPSHOT_API_URL=${settingsForm.feeds.snapshotApiUrl}`,
    `LIQUIDATION_SNAPSHOT_TOKEN=${settingsForm.feeds.snapshotToken}`,
    `LIQUIDATION_SNAPSHOT_TIMEOUT_MS=${settingsForm.feeds.snapshotTimeoutMs}`,
    "",
    `LIQUIDATION_QUEUE_API_BASE_URL=${settingsForm.queue.apiBaseUrl}`,
    `LIQUIDATION_QUEUE_STATUS_URL=${settingsForm.queue.statusUrl}`,
    `LIQUIDATION_QUEUE_EVENT_URL=${settingsForm.queue.eventUrl}`,
    `LIQUIDATION_QUEUE_ARBITRUM_API_BASE_URL=${settingsForm.queue.arbitrumApiBaseUrl}`,
    `LIQUIDATION_QUEUE_BNB_API_BASE_URL=${settingsForm.queue.bnbApiBaseUrl}`,
    `SUPERMTNODE_LIQUIDATION_QUEUE_ENABLED=${settingsForm.queue.enabled}`,
    `LIQUIDATION_QUEUE_HOST=${settingsForm.queue.host}`,
    `LIQUIDATION_QUEUE_PORT=${settingsForm.queue.port}`,
    `LIQUIDATION_QUEUE_STATE_FILE=${settingsForm.queue.stateFile}`,
    `LIQUIDATION_QUEUE_MEMBER_TTL_SECONDS=${settingsForm.queue.memberTtlSeconds}`,
    `LIQUIDATION_QUEUE_LEASE_SECONDS=${settingsForm.queue.leaseSeconds}`,
    `LIQUIDATION_QUEUE_ALLOWED_CHAINS=${settingsForm.queue.allowedChains}`,
    `LIQUIDATION_QUEUE_ADMIN_TOKEN=${settingsForm.queue.adminToken}`,
    "",
    "SUPERMTNODE_API_BASE_URL=https://api.supermtnode.io",
    `SUPERMTNODE_APP_TOKEN=${settingsForm.superMtNodeAppToken}`,
    "",
    "GITHUB_REPOSITORY=xgame2026-hash/superatblib",
    "",
    `DASHBOARD_OVERVIEW_REDIS_URL=${settingsForm.cache.redisUrl}`,
    `DASHBOARD_OVERVIEW_SNAPSHOT_TTL_MS=${settingsForm.cache.snapshotTtlMs}`,
    `DASHBOARD_OVERVIEW_STALE_MS=${settingsForm.cache.staleMs}`,
    `DASHBOARD_OVERVIEW_SOURCE_TIMEOUT_MS=${settingsForm.cache.sourceTimeoutMs}`,
    "",
    `ARBITRAGE_VENUES=${settingsForm.arbitrageVenues}`,
    `BINANCE_API_KEY=${settingsForm.exchanges.binance.apiKey}`,
    `BINANCE_SECRET_KEY=${settingsForm.exchanges.binance.secretKey}`,
    `OKX_API_KEY=${settingsForm.exchanges.okx.apiKey}`,
    `OKX_SECRET_KEY=${settingsForm.exchanges.okx.secretKey}`,
    `BITGET_API_KEY=${settingsForm.exchanges.bitget.apiKey}`,
    `BITGET_SECRET_KEY=${settingsForm.exchanges.bitget.secretKey}`,
    `MEXC_API_KEY=${settingsForm.exchanges.mexc.apiKey}`,
    `MEXC_SECRET_KEY=${settingsForm.exchanges.mexc.secretKey}`,
    `GATE_API_KEY=${settingsForm.exchanges.gate.apiKey}`,
    `GATE_SECRET_KEY=${settingsForm.exchanges.gate.secretKey}`,
  ];
  return `${lines.join("\n")}\n`;
}

function applyEnvSettings(env: Record<string, string>) {
  settingsForm.privateKey = env.PRIVATE_KEY ?? settingsForm.privateKey;
  settingsForm.language = env.DASHBOARD_LANGUAGE ?? settingsForm.language;
  settingsForm.fundingMode = env.FUNDING_MODE ?? settingsForm.fundingMode;
  settingsForm.rpc.ethereum = env.ETHEREUM_RPC_URL ?? settingsForm.rpc.ethereum;
  settingsForm.rpc.bnb = env.BNB_RPC_URL ?? settingsForm.rpc.bnb;
  settingsForm.rpc.arbitrum = env.ARBITRUM_RPC_URL ?? settingsForm.rpc.arbitrum;
  settingsForm.rpc.base = env.BASE_RPC_URL ?? settingsForm.rpc.base;
  settingsForm.rpc.polygon = env.POLYGON_RPC_URL ?? settingsForm.rpc.polygon;
  settingsForm.feeds.default = env.PUBLIC_LIQUIDATION_FEED_URL ?? settingsForm.feeds.default;
  settingsForm.feeds.ethereum = env.PUBLIC_LIQUIDATION_FEED_ETHEREUM_URL ?? settingsForm.feeds.ethereum;
  settingsForm.feeds.bnb = env.PUBLIC_LIQUIDATION_FEED_BNB_URL ?? settingsForm.feeds.bnb;
  settingsForm.feeds.arbitrum = env.PUBLIC_LIQUIDATION_FEED_ARBITRUM_URL ?? settingsForm.feeds.arbitrum;
  settingsForm.feeds.polygon = env.PUBLIC_LIQUIDATION_FEED_POLYGON_URL ?? settingsForm.feeds.polygon;
  settingsForm.feeds.snapshotApiUrl = env.LIQUIDATION_SNAPSHOT_API_URL ?? settingsForm.feeds.snapshotApiUrl;
  settingsForm.feeds.snapshotToken = env.LIQUIDATION_SNAPSHOT_TOKEN ?? settingsForm.feeds.snapshotToken;
  settingsForm.feeds.snapshotTimeoutMs = env.LIQUIDATION_SNAPSHOT_TIMEOUT_MS ?? settingsForm.feeds.snapshotTimeoutMs;
  settingsForm.queue.apiBaseUrl = env.LIQUIDATION_QUEUE_API_BASE_URL ?? settingsForm.queue.apiBaseUrl;
  settingsForm.queue.statusUrl = env.LIQUIDATION_QUEUE_STATUS_URL ?? settingsForm.queue.statusUrl;
  settingsForm.queue.eventUrl = env.LIQUIDATION_QUEUE_EVENT_URL ?? settingsForm.queue.eventUrl;
  settingsForm.queue.arbitrumApiBaseUrl = env.LIQUIDATION_QUEUE_ARBITRUM_API_BASE_URL ?? settingsForm.queue.arbitrumApiBaseUrl;
  settingsForm.queue.bnbApiBaseUrl = env.LIQUIDATION_QUEUE_BNB_API_BASE_URL ?? settingsForm.queue.bnbApiBaseUrl;
  settingsForm.queue.enabled = env.SUPERMTNODE_LIQUIDATION_QUEUE_ENABLED ?? settingsForm.queue.enabled;
  settingsForm.queue.host = env.LIQUIDATION_QUEUE_HOST ?? settingsForm.queue.host;
  settingsForm.queue.port = env.LIQUIDATION_QUEUE_PORT ?? settingsForm.queue.port;
  settingsForm.queue.stateFile = env.LIQUIDATION_QUEUE_STATE_FILE ?? settingsForm.queue.stateFile;
  settingsForm.queue.memberTtlSeconds = env.LIQUIDATION_QUEUE_MEMBER_TTL_SECONDS ?? settingsForm.queue.memberTtlSeconds;
  settingsForm.queue.leaseSeconds = env.LIQUIDATION_QUEUE_LEASE_SECONDS ?? settingsForm.queue.leaseSeconds;
  settingsForm.queue.allowedChains = env.LIQUIDATION_QUEUE_ALLOWED_CHAINS ?? settingsForm.queue.allowedChains;
  settingsForm.queue.adminToken = env.LIQUIDATION_QUEUE_ADMIN_TOKEN ?? settingsForm.queue.adminToken;
  settingsForm.superMtNodeAppToken = env.SUPERMTNODE_APP_TOKEN ?? settingsForm.superMtNodeAppToken;
  settingsForm.cache.redisUrl = env.DASHBOARD_OVERVIEW_REDIS_URL ?? settingsForm.cache.redisUrl;
  settingsForm.cache.snapshotTtlMs = env.DASHBOARD_OVERVIEW_SNAPSHOT_TTL_MS ?? settingsForm.cache.snapshotTtlMs;
  settingsForm.cache.staleMs = env.DASHBOARD_OVERVIEW_STALE_MS ?? settingsForm.cache.staleMs;
  settingsForm.cache.sourceTimeoutMs = env.DASHBOARD_OVERVIEW_SOURCE_TIMEOUT_MS ?? settingsForm.cache.sourceTimeoutMs;
  settingsForm.arbitrageVenues = env.ARBITRAGE_VENUES ?? settingsForm.arbitrageVenues;
  settingsForm.exchanges.binance.apiKey = env.BINANCE_API_KEY ?? settingsForm.exchanges.binance.apiKey;
  settingsForm.exchanges.binance.secretKey = env.BINANCE_SECRET_KEY ?? settingsForm.exchanges.binance.secretKey;
  settingsForm.exchanges.okx.apiKey = env.OKX_API_KEY ?? settingsForm.exchanges.okx.apiKey;
  settingsForm.exchanges.okx.secretKey = env.OKX_SECRET_KEY ?? settingsForm.exchanges.okx.secretKey;
  settingsForm.exchanges.bitget.apiKey = env.BITGET_API_KEY ?? settingsForm.exchanges.bitget.apiKey;
  settingsForm.exchanges.bitget.secretKey = env.BITGET_SECRET_KEY ?? settingsForm.exchanges.bitget.secretKey;
  settingsForm.exchanges.mexc.apiKey = env.MEXC_API_KEY ?? settingsForm.exchanges.mexc.apiKey;
  settingsForm.exchanges.mexc.secretKey = env.MEXC_SECRET_KEY ?? settingsForm.exchanges.mexc.secretKey;
  settingsForm.exchanges.gate.apiKey = env.GATE_API_KEY ?? settingsForm.exchanges.gate.apiKey;
  settingsForm.exchanges.gate.secretKey = env.GATE_SECRET_KEY ?? settingsForm.exchanges.gate.secretKey;
}

function stopLoginCanvas() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }
}

function startLoginCanvas() {
  stopLoginCanvas();

  const canvas = loginCanvas.value;
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const movers = Array.from({ length: prefersReducedMotion ? 12 : 30 }, (_, index) => ({
    offset: index / 30,
    speed: 0.000045 + (index % 8) * 0.000006,
    size: 1.4 + (index % 6) * 0.62,
    lane: (index % 5) - 2,
    hue: index % 4,
  }));

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resizeHandler = resize;
  window.addEventListener("resize", resize);
  resize();

  const draw = (time: number) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width * 0.5;
    const centerY = height * 0.47;
    context.clearRect(0, 0, width, height);

    const glow = context.createRadialGradient(centerX, centerY, 40, centerX, centerY, width * 0.58);
    glow.addColorStop(0, "rgba(139, 92, 246, 0.11)");
    glow.addColorStop(0.34, "rgba(37, 18, 64, 0.1)");
    glow.addColorStop(1, "rgba(5, 4, 10, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    const scaleX = Math.min(width * 0.5, 620);
    const scaleY = Math.min(height * 0.38, 260);
    const pointAt = (rawT: number, lane = 0) => {
      const t = rawT % (Math.PI * 2);
      const sin = Math.sin(t);
      const cos = Math.cos(t);
      return {
        x: centerX + scaleX * sin + lane * Math.cos(t) * 5,
        y: centerY + scaleY * sin * cos + lane * Math.sin(t * 2) * 3,
      };
    };

    for (let layer = 0; layer < 3; layer += 1) {
      context.beginPath();
      for (let step = 0; step <= 240; step += 1) {
        const point = pointAt((step / 240) * Math.PI * 2, (layer - 1) * 3);
        if (step === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      }
      const gradient = context.createLinearGradient(centerX - scaleX, centerY, centerX + scaleX, centerY);
      gradient.addColorStop(0, `rgba(39, 215, 255, ${0.08 + layer * 0.018})`);
      gradient.addColorStop(0.5, `rgba(168, 85, 247, ${0.14 + layer * 0.022})`);
      gradient.addColorStop(1, `rgba(65, 240, 170, ${0.07 + layer * 0.016})`);
      context.strokeStyle = gradient;
      context.lineWidth = layer === 1 ? 1.4 : 0.8;
      context.stroke();
    }

    for (const mover of movers) {
      const t = (mover.offset + (prefersReducedMotion ? 0 : time * mover.speed)) * Math.PI * 2;
      const current = pointAt(t, mover.lane);
      const alpha = 0.52 + Math.sin(t * 1.7) * 0.2;
      const color =
        mover.hue === 0
          ? `rgba(168, 85, 247, ${alpha})`
          : mover.hue === 1
            ? `rgba(39, 215, 255, ${alpha})`
            : mover.hue === 2
              ? `rgba(65, 240, 170, ${alpha * 0.72})`
              : `rgba(217, 208, 255, ${alpha * 0.86})`;

      context.beginPath();
      context.arc(current.x, current.y, mover.size + 5, 0, Math.PI * 2);
      context.fillStyle = `rgba(139, 92, 246, ${alpha * 0.08})`;
      context.fill();

      context.beginPath();
      context.arc(current.x, current.y, mover.size, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    }

    if (!prefersReducedMotion) {
      animationFrame = requestAnimationFrame(draw);
    }
  };

  animationFrame = requestAnimationFrame(draw);
}
</script>
