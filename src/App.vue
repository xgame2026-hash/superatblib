<template>
  <div class="app-shell" :class="{ 'is-authenticated': isAuthenticated }">
    <section v-if="!isAuthenticated" class="login-screen">
      <div class="login-liquid-shell">
        <LiquidEther
          class-name="login-liquid-ether"
          :colors="['#6D28D9', '#8B5CF6', '#A78BFA']"
          :mouse-force="20"
          :cursor-size="100"
          :is-viscous="false"
          :viscous="30"
          :iterations-viscous="32"
          :iterations-poisson="32"
          :dt="0.014"
          :resolution="0.5"
          :BFECC="true"
          :is-bounce="false"
          :auto-demo="true"
          :auto-speed="0.5"
          :auto-intensity="2.2"
          :takeover-duration="0.25"
          :auto-resume-delay="3000"
          :auto-ramp-duration="0.6"
        />
      </div>
      <div class="login-card-stack">
        <main class="login-panel">
          <div class="login-brand-row">
            <img class="login-wordmark" :src="miniLogoUrl" alt="SuperARB" />
            <span class="login-version">{{ displayVersion }}</span>
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
        <p class="login-copyright">© 2026 SuperARB. All rights reserved.</p>
      </div>
    </section>

    <section v-else class="workspace">
      <header class="topbar">
        <div class="topbar-left">
          <img class="system-wordmark" :src="miniLogoUrl" alt="SuperARB" />
          <span class="topbar-version">{{ displayVersion }}</span>
        </div>
        <div class="topbar-right">
          <button
            class="sound-toggle-button"
            type="button"
            :class="{ muted: !launchSoundEnabled }"
            :aria-label="launchSoundEnabled ? '关闭启动音效' : '打开启动音效'"
            :title="launchSoundEnabled ? '关闭启动音效' : '打开启动音效'"
            @click="toggleLaunchSound"
          >
            <img class="sound-toggle-icon" :src="launchSoundEnabled ? musicOpenIconUrl : musicCloseIconUrl" alt="" aria-hidden="true" />
          </button>
          <div ref="githubVersionControl" class="github-version-control">
            <button class="github-version-button" type="button" aria-label="GitHub 版本状态" @click="githubMenuOpen = !githubMenuOpen">
              <span class="github-version-main">
                <img :src="githubIconUrl" alt="" aria-hidden="true" />
                <span>GitHub v{{ githubLatestDisplayVersion }}</span>
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
                <strong>v{{ displayVersion }}</strong>
                <span>GitHub 最新</span>
                <strong>v{{ githubLatestDisplayVersion }}</strong>
              </div>
              <p v-if="githubVersionMessage">{{ githubVersionMessage }}</p>
            </div>
          </div>
        </div>
      </header>

      <SidebarNav :items="navItems" :active-key="activeView" @select="activeView = $event as ViewKey" />

      <main class="content-area" :class="`view-${activeView}`">
        <section v-if="!hidePageHero" class="hero-strip">
          <div>
            <p class="eyebrow">{{ pageEyebrow }}</p>
            <h1>{{ currentNavLabel }}</h1>
          </div>
        </section>

        <div v-show="activeView === 'analytics'" :hidden="activeView !== 'analytics'">
          <LiquidationView
            ref="liquidationViewRef"
            :active="activeView === 'analytics'"
            :startup-detection-mode="settingsForm.startupDetectionMode"
            @launch-sound="handleLaunchSound"
            @refresh="refreshData"
          />
        </div>

        <div v-show="activeView === 'execution'" :hidden="activeView !== 'execution'">
          <LatestLiquidationsView
            :active="activeView === 'execution'"
            @open-tx-graph="openTxGraphFromLiquidation"
          />
        </div>

        <div v-show="activeView === 'liquidationTopic'" :hidden="activeView !== 'liquidationTopic'">
          <LiquidationTopicView
            :active="activeView === 'liquidationTopic'"
          />
        </div>

        <div v-show="activeView === 'overview'" :hidden="activeView !== 'overview'">
          <DashboardView
            :active="activeView === 'overview'"
            :metrics="metrics"
            :news-items="newsItems"
            :news-loading="newsLoading"
            :news-error="newsError"
            :market-icon="marketIcon"
            @open-news="openNewsFromDashboard"
          />
        </div>

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

        <template v-else-if="activeView === 'settings'">
          <SettingsView
            :settings-sections="settingsSections"
            v-model:settings-section="settingsSection"
            :current-settings-section="currentSettingsSection"
            :settings-form="settingsForm"
            v-model:settings-secrets-visible="settingsSecretsVisible"
            :settings-save-dialog-visible="settingsSaveDialogVisible"
            :settings-save-state="settingsSaveState"
            :settings-security-checking="settingsSecurityChecking"
            :settings-env-path="settingsEnvPath"
            :save-icon-url="saveIconUrl"
            :rpc-fields="rpcFields"
            :feed-fields="feedFields"
            @security-check="checkOfficialSettings"
            @save="saveSettings"
            @logout="logout"
          />
        </template>

        <template v-else-if="activeView === 'overview'"></template>
      </main>

      <footer class="fixed-footer">
        <span class="footer-copyright">
          <img :src="footerLogoUrl" alt="SuperARB" />
          Copyright © 2026 SuperMT Node. Internal testing only.
        </span>
        <span>Local: http://127.0.0.1:{{ runningDashboardPort }}</span>
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

    <el-dialog
      v-model="settingsSecurityDialogVisible"
      class="system-dialog security-check-dialog"
      width="760px"
      align-center
    >
      <template #header>
        <div class="security-check-heading">
          <span class="security-check-badge" :class="{ danger: !settingsSecurityOk }" aria-hidden="true">
            {{ settingsSecurityOk ? "✓" : "!" }}
          </span>
          <div>
            <div class="security-check-title">
              {{ settingsSecurityTitle }}
            </div>
            <p>
              已检查当前页面配置与已保存 .env，包含运行必填项、安全通道和官方服务地址。
            </p>
          </div>
        </div>
      </template>

      <div class="security-check-summary">
        <div>
          <span>检测结果</span>
          <strong>{{ settingsSecurityOk ? "全部通过" : `${settingsSecurityFailedCount} 项风险` }}</strong>
        </div>
        <div>
          <span>显示项目</span>
          <strong>{{ visibleSecurityItems.length }}</strong>
        </div>
        <div>
          <span>检测时间</span>
          <strong>{{ settingsSecurityCheckedAt || "刚刚" }}</strong>
        </div>
      </div>

      <div class="security-check-list">
        <div
          v-for="item in visibleSecurityItems"
          :key="`${item.scope}-${item.key}`"
          class="security-check-item"
          :class="{ danger: !item.ok }"
        >
          <div class="security-check-item-main">
            <span class="security-check-status">{{ item.ok ? "通过" : "风险" }}</span>
            <div>
              <strong>{{ item.scope }}：{{ formatSecurityLabel(item) }}</strong>
              <small>{{ formatSecurityKey(item) }}</small>
            </div>
            <p>{{ formatSecuritySummary(item) }}</p>
          </div>
          <button
            v-if="item.action === 'repair_secure_upload'"
            class="security-check-repair"
            type="button"
            :disabled="settingsSecurityRepairing"
            @click="repairSecurityItem(item)"
          >
            {{ settingsSecurityRepairing ? "修复中" : "修复" }}
          </button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { Hide, Key, View } from "@element-plus/icons-vue";
import { useNews } from "./composables/useNews";
import DashboardView from "./features/dashboard/DashboardView.vue";
import LatestLiquidationsView from "./features/latest-liquidations/LatestLiquidationsView.vue";
import LiquidationView from "./features/liquidation/LiquidationView.vue";
import LiquidationTopicView from "./features/liquidation/LiquidationTopicView.vue";
import LiquidEther from "./components/LiquidEther.vue";
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
import musicCloseIconUrl from "./img/music_close.svg";
import musicOpenIconUrl from "./img/music_open.svg";
import newLiqIconUrl from "./img/newliq.svg";
import polygonIcon from "./img/Polygon.svg";
import queryIconUrl from "./img/sarchhash.svg";
import saveIconUrl from "./img/save.svg";
import arrowIconUrl from "./img/arrow.svg";
import footerLogoUrl from "./img/SuperARB_logo.png";
import githubIconUrl from "./img/github.svg";
import homeIconUrl from "./img/home.svg";
import setupIconUrl from "./img/setup.svg";
import launchedAudioUrl from "./music/Launched.mp3";
import notLaunchedAudioUrl from "./music/Notlaunched.mp3";

type AuthMessageType = "success" | "warning" | "info" | "error";
type SettingsSaveState = "saving" | "done" | "error";
type GithubVersionState = "checking" | "latest" | "update" | "unconfigured" | "error";
type ViewKey = "overview" | "execution" | "analytics" | "liquidationTopic" | "news" | "txgraph" | "settings";
type SettingsSectionKey = "general" | "credentials" | "rpc" | "feeds";
type RpcKey = "ethereum" | "bnb" | "arbitrum" | "base" | "polygon";
type FeedKey =
  | "snapshotApiUrl"
  | "snapshotToken"
  | "snapshotTimeoutMs";
type QueueKey =
  | "manageIngestUrl"
  | "manageIngestToken"
  | "wssUrl"
  | "wssToken"
  | "statusUrl"
  | "heartbeatIntervalMs"
  | "txEventsUrl";

const AUTH_STORAGE_KEY = "superarb-auth-session-v1.5.3";
const AUTH_CODE_KEY = "superarb-auth-code-v1.5.3";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.5.3";
const ACTIVE_VIEW_KEY = "liq2-active-view";
const SETTINGS_SECTION_KEY = "liq2-settings-section";
const LAUNCH_SOUND_KEY = "liq2-launch-sound-enabled";
const AUTH_CODE_PATTERN = /^SMT-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/i;
const appVersion = "1.5.4";
const appGitCommit = __APP_GIT_COMMIT__;
const displayVersion = appGitCommit ? `${appVersion}+${appGitCommit}` : appVersion;

const TxGraphPanel = defineAsyncComponent(() => import("./features/txgraph/TxGraphPanel.vue"));
const viewKeys = ["overview", "execution", "analytics", "liquidationTopic", "news", "txgraph", "settings"] satisfies ViewKey[];
const settingsSectionKeys = ["general", "credentials", "rpc", "feeds"] satisfies SettingsSectionKey[];
const authCode = ref("");
const showAuthCode = ref(false);
const rememberCode = ref(true);
const loginLoading = ref(false);
const authMessage = ref("");
const authMessageType = ref<AuthMessageType>("info");
const isAuthenticated = ref(false);
const activeView = ref<ViewKey>(readInitialView());
const settingsSection = ref<SettingsSectionKey>(readStoredValue(SETTINGS_SECTION_KEY, settingsSectionKeys, "general"));
const settingsSecretsVisible = ref(false);
const settingsEnvPath = ref(".env");
const settingsSaveDialogVisible = ref(false);
const settingsSaveState = ref<SettingsSaveState>("saving");
const settingsSaveMessage = ref("正在保存 .env 并刷新联动设置...");
const settingsSecurityChecking = ref(false);
const settingsSecurityRepairing = ref(false);
const settingsSecurityDialogVisible = ref(false);
const settingsSecurityItems = ref<SecurityCheckItem[]>([]);
const settingsSecurityCheckedAt = ref("");
const selectedNewsId = ref("");
const githubLatestVersion = ref(appVersion);
const githubLatestCommit = ref("");
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
  { key: "credentials" as const, label: "凭证管理", hint: "单次、多次循环", eyebrow: "Credentials" },
  { key: "rpc" as const, label: "RPC", hint: "各链端点", eyebrow: "Network" },
  { key: "feeds" as const, label: "公共 Feed", hint: "清算候选数据源", eyebrow: "Feeds" },
];

const rpcFields = [
  { key: "ethereum" as const, label: "Ethereum", env: "ETHEREUM_RPC_URL", icon: ethIcon },
  { key: "bnb" as const, label: "BNB", env: "BNB_RPC_URL", icon: bnbIcon },
  { key: "arbitrum" as const, label: "Arbitrum", env: "ARBITRUM_RPC_URL", icon: arbIcon },
  { key: "base" as const, label: "Base", env: "BASE_RPC_URL", icon: baseIcon },
  { key: "polygon" as const, label: "Polygon", env: "POLYGON_RPC_URL", icon: polygonIcon },
];

const feedFields = [
  {
    key: "snapshotApiUrl" as const,
    label: "清算快照接口",
    env: "LIQUIDATION_SNAPSHOT_API_URL",
    placeholder: "https://bsc.rpc.supermtnode.io/api/public/liquidations/snapshot",
  },
  {
    key: "snapshotToken" as const,
    label: "清算快照 Token",
    env: "LIQUIDATION_SNAPSHOT_TOKEN",
    placeholder: "snapshot service token",
    secret: true,
  },
  {
    key: "snapshotTimeoutMs" as const,
    label: "快照请求超时",
    env: "LIQUIDATION_SNAPSHOT_TIMEOUT_MS",
    placeholder: "8000",
  },
];

const settingsForm = reactive({
  privateKey: "",
  superMtNodeAppToken: "",
  fundingMode: "flash_loan",
  arbitrageIntensity: "conservative",
  credentialAuthMode: "single",
  singleTradeAuthAmountUsdt: "100",
  startupDetectionMode: "manual",
  wssCorrectionMode: "enabled",
  dashboardPort: "4311",
  launchSoundMode: readStoredValue(LAUNCH_SOUND_KEY, ["enabled", "disabled"], "enabled"),
  language: "zh",
  rpc: {
    ethereum: "",
    bnb: "",
    arbitrum: "",
    base: "",
    polygon: "",
  } as Record<RpcKey, string>,
  feeds: {
    snapshotApiUrl: "https://bsc.rpc.supermtnode.io/api/public/liquidations/snapshot",
    snapshotToken: "",
    snapshotTimeoutMs: "8000",
  } as Record<FeedKey, string>,
  queue: {
    wssUrl: "wss://private.superarb.ai/ws/liquidation-queue-v2",
    wssToken: "",
    manageIngestUrl: "https://manage.supermtnode.io/api/ingest/liquidation-queue",
    manageIngestToken: "",
    statusUrl: "https://api.supermtnode.io/api/public/liquidations/queue-status",
    heartbeatIntervalMs: "1000",
    txEventsUrl: "",
  } as Record<QueueKey, string>,
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
const hidePageHero = computed(() => activeView.value === "news" && Boolean(selectedNewsId.value));

const currentSettingsSection = computed(() => {
  return settingsSections.find((section) => section.key === settingsSection.value) ?? settingsSections[0];
});

const dashboardPort = computed(() => normalizeDashboardPort(settingsForm.dashboardPort));
const runningDashboardPort = computed(() => runtimeDashboardPort(dashboardPort.value));
const launchSoundEnabled = computed(() => settingsForm.launchSoundMode !== "disabled");
const settingsSaveTitle = computed(() => {
  if (settingsSaveState.value === "done") return "保存完成";
  if (settingsSaveState.value === "error") return "保存失败";
  return "保存中";
});

const missingLocalConfigKeys = ["PRIVATE_KEY", "SUPERMTNODE_APP_TOKEN", "BNB_RPC_URL"];
const hiddenPassingSecurityKeys = [
  "LIQUIDATION_QUEUE_INGEST_URL",
  "MANAGE_LIQUIDATION_QUEUE_WSS_URL",
  "LIQUIDATION_QUEUE_PUBLIC_STATUS_URL",
  "LIQUIDATION_QUEUE_WSS_STATUS_URL",
  "PRIVATE_MEMBER_LIQUIDATION_QUEUE_STATUS_URL",
  "LIQUIDATION_QUEUE_WSS_TOKEN",
  "LIQ2_PRIVATE_MEMBER_API_URL",
  "PRIVATE_MEMBER_ADMIN_API_URL",
  "LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PATH",
  "TX_WALLET_PUBLIC_KEY_PATH",
  "SECURE_UPLOAD_STATUS",
];
const visibleSecurityItems = computed(() =>
  dedupeSecurityItems(settingsSecurityItems.value).filter((item) => {
    if (item.key === "SECURE_UPLOAD_STATUS" && !item.action) return false;
    return !item.ok || !hiddenPassingSecurityKeys.includes(item.key);
  }),
);
const settingsSecurityFailedCount = computed(() => visibleSecurityItems.value.filter((item) => !item.ok).length);
const settingsSecurityOk = computed(() => visibleSecurityItems.value.length > 0 && settingsSecurityFailedCount.value === 0);
const settingsSecurityTitle = computed(() => {
  if (settingsSecurityOk.value) return "官方配置检测通过";
  const failed = visibleSecurityItems.value.filter((item) => !item.ok);
  if (failed.some(isAuthorizationFailureItem)) return "授权失效";
  if (failed.some((item) => item.key === "BNB_RPC_URL" && /未绑定到/.test(item.message))) return "RPC 未绑定";
  const onlyMissingLocalConfig = failed.length > 0 && failed.every((item) => missingLocalConfigKeys.includes(item.key));
  return onlyMissingLocalConfig ? "本地未配置" : "检测到非官方配置";
});

const githubVersionTitle = computed(() => {
  if (githubVersionState.value === "update") return "发现 GitHub 新版本";
  if (githubVersionState.value === "checking") return "正在检查版本";
  if (githubVersionState.value === "unconfigured") return "未配置版本检测";
  if (githubVersionState.value === "error") return "版本检测失败";
  return "已经是最新版";
});
const githubLatestDisplayVersion = computed(() => {
  return versionWithCommit(githubLatestVersion.value, githubLatestCommit.value);
});

const metrics = ref([
  { label: "候选账户", value: "0", trend: 0 },
  { label: "可执行机会", value: "0", trend: 0 },
  { label: "预计收益", value: "$0", trend: 0 },
  { label: "失败保护", value: "0%", trend: 0 },
]);

let notLaunchedReminderTimer = 0;

onMounted(() => {
  clearLegacyAuthCache();
  authCode.value = sessionStorage.getItem(AUTH_CODE_SESSION_KEY) ?? localStorage.getItem(AUTH_CODE_KEY) ?? "";
  isAuthenticated.value = sessionStorage.getItem(AUTH_STORAGE_KEY) === "authorized";
  applyViewFromUrl();
  syncViewHash(activeView.value);
  loadSettings({ syncRuntimePort: true });
  void loadGithubVersion();
  document.addEventListener("pointerdown", closeGithubMenuOnOutside);
  window.addEventListener("hashchange", applyViewFromUrl);
  if (isAuthenticated.value) {
    void loadNews();
  }
});

onBeforeUnmount(() => {
  stopNotLaunchedReminder();
  document.removeEventListener("pointerdown", closeGithubMenuOnOutside);
  window.removeEventListener("hashchange", applyViewFromUrl);
});

watch(launchSoundEnabled, (enabled) => {
  localStorage.setItem(LAUNCH_SOUND_KEY, enabled ? "enabled" : "disabled");
  if (!enabled) stopNotLaunchedReminder();
});

watch(isAuthenticated, async (authorized) => {
  if (authorized) {
    void loadNews();
  }
});

watch(activeView, (view) => {
  localStorage.setItem(ACTIVE_VIEW_KEY, view);
  syncViewHash(view);
});

watch(settingsSection, (section) => {
  localStorage.setItem(SETTINGS_SECTION_KEY, section);
});

function readStoredValue<T extends string>(key: string, allowedValues: readonly T[], fallback: T): T {
  const value = localStorage.getItem(key);
  return allowedValues.includes(value as T) ? (value as T) : fallback;
}

function readInitialView(): ViewKey {
  return readViewFromUrl() ?? readStoredValue(ACTIVE_VIEW_KEY, viewKeys, "overview");
}

function readViewFromUrl(): ViewKey | null {
  const raw = new URLSearchParams(window.location.search).get("view") || window.location.hash.replace(/^#\/?/, "");
  const value = normalizeViewAlias(raw);
  return viewKeys.includes(value as ViewKey) ? (value as ViewKey) : null;
}

function normalizeViewAlias(value: string | null): string {
  const normalized = (value || "").trim().toLowerCase();
  if (["leaderboard", "ranking", "rank", "latest", "liquidations", "latest-liquidations"].includes(normalized)) return "execution";
  if (["control", "dashboard", "analytics"].includes(normalized)) return "analytics";
  return normalized;
}

function normalizeVersionLabel(source: string): string {
  return source.trim().replace(/^v/i, "").split("+")[0] || source;
}

function versionWithCommit(version: string, commit: string): string {
  const normalizedVersion = normalizeVersionLabel(version);
  const normalizedCommit = commit.trim().slice(0, 7);
  return normalizedCommit ? `${normalizedVersion}+${normalizedCommit}` : normalizedVersion;
}

function syncViewHash(view: ViewKey): void {
  const targetHash = `#${view}`;
  if (window.location.hash === targetHash) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${targetHash}`);
}

function clearLegacyAuthCache(): void {
  ["liq2-auth-session", "liq2-auth-code"].forEach((key) => localStorage.removeItem(key));
  ["liq2-auth-session", "liq2-auth-code-session"].forEach((key) => sessionStorage.removeItem(key));
}

function applyViewFromUrl(): void {
  const view = readViewFromUrl();
  if (view) activeView.value = view;
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
    sessionStorage.setItem(AUTH_CODE_SESSION_KEY, code);
    sessionStorage.setItem(AUTH_STORAGE_KEY, "authorized");
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
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_CODE_SESSION_KEY);
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

function openNewsFromDashboard(id?: string) {
  selectedNewsId.value = id ?? "";
  activeView.value = "news";
}

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

async function fetchSettingsApi(path: string, init?: RequestInit): Promise<Response> {
  const urls = settingsApiUrls(path);
  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetch(url, init);
      if (response.status === 404 && url !== urls[urls.length - 1]) continue;
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("设置接口连接失败");
}

function settingsApiUrls(path: string): string[] {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const candidates = [normalizedPath];
  const currentProtocol = window.location.protocol;
  const currentPort = window.location.port;
  const configuredPort = dashboardPort.value;
  if (currentProtocol === "http:" || currentProtocol === "https:") {
    candidates.push(`${window.location.origin}${normalizedPath}`);
  }
  for (const port of [currentPort, configuredPort]) {
    if (port) candidates.push(`http://127.0.0.1:${port}${normalizedPath}`);
  }
  return [...new Set(candidates)];
}

async function loadSettings(options: { syncRuntimePort?: boolean } = {}) {
  try {
    const response = await fetchSettingsApi("/api/settings");
    if (!response.ok) return;
    const payload = (await response.json()) as {
      path?: string;
      env?: Record<string, string>;
      example?: Record<string, string>;
    };
    settingsEnvPath.value = payload.path ?? settingsEnvPath.value;
    applyEnvSettings({ ...payload.example, ...payload.env }, options);
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
      currentCommit?: string;
      latestCommit?: string;
      isLatest?: boolean;
      message?: string;
    };
    githubLatestVersion.value = payload.latestVersion || appVersion;
    githubLatestCommit.value = payload.latestCommit || "";
    githubVersionState.value = payload.configured === false ? "unconfigured" : payload.isLatest ? "latest" : "update";
    githubVersionMessage.value = payload.message ?? "";
  } catch (error) {
    githubLatestVersion.value = appVersion;
    githubLatestCommit.value = "";
    githubVersionState.value = "error";
    githubVersionMessage.value = error instanceof Error ? error.message : "GitHub 版本检测失败";
  }
}

async function saveSettings() {
  settingsSaveState.value = "saving";
  settingsSaveMessage.value = "正在保存 .env...";
  settingsSaveDialogVisible.value = true;

  try {
    const response = await fetchSettingsApi("/api/settings", {
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
    settingsSaveMessage.value = "设置已保存到 .env；端口设置重启客户端后生效。";
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

type SecurityCheckItem = {
  scope: string;
  key: string;
  label: string;
  value: string;
  ok: boolean;
  message: string;
  action?: "repair_secure_upload";
};

async function checkOfficialSettings() {
  settingsSecurityChecking.value = true;
  try {
    const response = await fetchSettingsApi("/api/settings/security-check", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeadersForSettings() },
      body: JSON.stringify({ env: generateEnvText() }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "检测失败");
    }
    const payload = (await response.json()) as { ok?: boolean; items?: SecurityCheckItem[]; checkedAt?: string };
    settingsSecurityItems.value = payload.items ?? [];
    settingsSecurityCheckedAt.value = formatSecurityCheckedAt(payload.checkedAt);
    settingsSecurityDialogVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "检测失败");
  } finally {
    settingsSecurityChecking.value = false;
  }
}

async function repairSecurityItem(item: SecurityCheckItem) {
  if (item.action !== "repair_secure_upload") return;
  settingsSecurityRepairing.value = true;
  try {
    const response = await fetchSettingsApi("/api/settings/security-repair", {
      method: "POST",
      headers: authHeadersForSettings(),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string; reason?: string };
      throw new Error(payload.error ?? payload.reason ?? "修复失败");
    }
    ElMessage.success("修复已执行");
    await checkOfficialSettings();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "修复失败");
  } finally {
    settingsSecurityRepairing.value = false;
  }
}

function authHeadersForSettings(): Record<string, string> {
  const code = authCode.value.trim();
  return code ? { "x-supermtnode-auth-code": code } : {};
}

function dedupeSecurityItems(items: SecurityCheckItem[]) {
  const result: SecurityCheckItem[] = [];
  const byComparableKey = new Map<string, SecurityCheckItem>();
  for (const item of items) {
    const comparableKey = item.ok ? `${item.key}:ok` : `${item.key}:${item.value}:${item.ok}:${item.message}:${item.action ?? ""}`;
    const existing = byComparableKey.get(comparableKey);
    if (existing) {
      existing.scope = "本地配置";
      if (item.key === "BNB_RPC_URL") existing.message = item.message;
      continue;
    }
    const copy = { ...item };
    byComparableKey.set(comparableKey, copy);
    result.push(copy);
  }
  return result;
}

function isAuthorizationFailureItem(item: SecurityCheckItem) {
  if (!["SUPERMTNODE_APP_TOKEN", "BNB_RPC_URL", "AUTH_CODE"].includes(item.key)) return false;
  return /token has been rotated|HTTP 401|HTTP 403|unauthorized|forbidden|blocked|invalid token|授权码校验失败/i.test(item.message);
}

function formatSecurityCheckedAt(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatSecurityLabel(item: SecurityCheckItem) {
  if (item.key === "LIQUIDATION_QUEUE_TX_EVENTS_URL") return "执行流水接口";
  if (item.key === "AUTH_CODE") return "登录授权码";
  if (item.key === "PRIVATE_MEMBER_TX2_CONTRACT_EVENTS_URL") return "备用执行流水接口";
  if (item.key === "LIQ2_PRIVATE_MEMBER_API_URL" || item.key === "PRIVATE_MEMBER_ADMIN_API_URL") return "安全通道主机";
  if (item.key === "LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PATH") return "安全通道路径";
  if (item.key === "TX_WALLET_PUBLIC_KEY_PATH") return "安全校验文件";
  if (item.key === "TX_WALLET_PUBLIC_KEY") return "自定义安全校验材料";
  if (item.key === "SECURE_UPLOAD_STATUS") return "安全同步";
  return item.label;
}

function formatSecurityKey(item: SecurityCheckItem) {
  if (item.key === "PRIVATE_KEY") return "WALLET_ADDRESS";
  if (item.key === "SUPERMTNODE_APP_TOKEN") return "SERVICE_TOKEN";
  if (item.key === "LIQUIDATION_QUEUE_WSS_TOKEN") return "QUEUE_TOKEN";
  if (item.key === "AUTH_CODE") return "AUTH_CODE";
  if (item.key === "LIQ2_PRIVATE_MEMBER_API_URL" || item.key === "PRIVATE_MEMBER_ADMIN_API_URL") return "SECURE_CHANNEL_HOST";
  if (item.key === "LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PATH") return "SECURE_CHANNEL_PATH";
  if (item.key === "TX_WALLET_PUBLIC_KEY_PATH") return "SECURE_VERIFY_FILE";
  if (item.key === "TX_WALLET_PUBLIC_KEY") return "CUSTOM_VERIFY_MATERIAL";
  if (item.key === "SECURE_UPLOAD_STATUS") return "SECURE_SYNC";
  return item.key;
}

function formatSecurityValue(item: SecurityCheckItem) {
  if (item.key === "PRIVATE_KEY") {
    return item.ok ? item.value : "未配置或格式无效";
  }
  if (item.key === "SUPERMTNODE_APP_TOKEN") {
    return item.ok ? "已配置" : "未配置";
  }
  if (item.key === "AUTH_CODE") return item.ok ? "已验证" : "校验失败";
  if (item.key === "LIQUIDATION_QUEUE_WSS_TOKEN") return item.ok ? "官方内置" : "官方队列不可用";
  if (item.ok && item.message.includes("运行时不使用该备用项")) return "检查通过";
  if (item.key === "LIQ2_PRIVATE_MEMBER_API_URL" || item.key === "PRIVATE_MEMBER_ADMIN_API_URL") {
    return item.ok ? "官方安全通道" : "非官方安全通道";
  }
  if (item.key === "LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PATH") {
    return item.ok ? "官方安全路径" : "非官方安全路径";
  }
  if (item.key === "TX_WALLET_PUBLIC_KEY_PATH") {
    return item.ok ? "官方校验文件" : "非官方校验文件";
  }
  if (item.key === "TX_WALLET_PUBLIC_KEY") {
    return "已配置自定义校验材料";
  }
  if (item.key === "SECURE_UPLOAD_STATUS") return item.value;
  return item.value || "未配置，使用默认值";
}

function formatSecurityMessage(item: SecurityCheckItem) {
  if (item.key === "PRIVATE_KEY") return item.ok ? "已从钱包授权解析出地址" : "请先配置有效的钱包授权，否则无法提交执行任务";
  if (item.key === "SUPERMTNODE_APP_TOKEN") return item.ok ? "服务授权已配置" : "请先配置服务授权 Token，否则部分官方服务无法完成授权";
  if (item.key === "AUTH_CODE") return item.message;
  if (item.key === "LIQUIDATION_QUEUE_WSS_TOKEN") return item.ok ? "官方内置队列 Token 可用" : "官方内置队列 Token 不可用";
  if (item.ok && item.message.includes("运行时不使用该备用项")) return "检查通过";
  if (item.key === "LIQ2_PRIVATE_MEMBER_API_URL" || item.key === "PRIVATE_MEMBER_ADMIN_API_URL") {
    return item.ok ? "官方安全通道" : "请恢复为官方安全通道";
  }
  if (item.key === "LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PATH") {
    return item.ok ? "官方安全路径" : "请恢复为官方安全路径";
  }
  if (item.key === "TX_WALLET_PUBLIC_KEY_PATH") {
    return item.ok ? "官方校验文件" : "请恢复为官方校验文件";
  }
  if (item.key === "TX_WALLET_PUBLIC_KEY") {
    return "请使用官方校验文件，避免安全通道被替换";
  }
  if (item.key === "SECURE_UPLOAD_STATUS") return item.message;
  return item.message;
}

function formatSecuritySummary(item: SecurityCheckItem) {
  if (item.key === "PRIVATE_KEY") return item.ok ? `钱包地址 ${shortAddress(item.value)}` : "本地未配置";
  if (item.key === "SUPERMTNODE_APP_TOKEN") return item.ok ? item.value : item.message;
  if (item.key === "AUTH_CODE") return item.message;
  if (item.key === "LIQUIDATION_QUEUE_WSS_TOKEN") return item.ok ? "官方内置队列 Token" : "官方队列不可用";
  if (item.key === "BNB_RPC_URL") return item.ok || item.value ? item.message : "本地未配置";
  if (item.key === "SECURE_UPLOAD_STATUS") return item.message;
  if (item.ok) return "检查通过";
  return formatSecurityMessage(item);
}

function shortAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function generateEnvText() {
  const lines = [
    "# SuperARB / LIQ2 environment file",
    "# Generated from SuperARB 1.5.4 internal settings.",
    "# Keep secrets out of screenshots, Git commits, issue reports, and chat logs.",
    "",
    "# -----------------------------------------------------------------------------",
    "# 1. Wallet & License",
    "# -----------------------------------------------------------------------------",
    `PRIVATE_KEY=${settingsForm.privateKey}`,
    `SUPERMTNODE_APP_TOKEN=${settingsForm.superMtNodeAppToken}`,
    `AUTH_CODE=${authCode.value.trim().toUpperCase()}`,
    "",
    "# -----------------------------------------------------------------------------",
    "# 2. Execution Policy",
    "# -----------------------------------------------------------------------------",
    `FUNDING_MODE=${settingsForm.fundingMode}`,
    `ARBITRAGE_INTENSITY=${settingsForm.arbitrageIntensity}`,
    `SINGLE_TRADE_AUTH_AMOUNT_USDT=${settingsForm.singleTradeAuthAmountUsdt}`,
    `CREDENTIAL_AUTH_MODE=${settingsForm.credentialAuthMode}`,
    `STARTUP_DETECTION_MODE=${settingsForm.startupDetectionMode}`,
    "",
    "# -----------------------------------------------------------------------------",
    "# 3. Dashboard",
    "# -----------------------------------------------------------------------------",
    `DASHBOARD_PORT=${normalizeDashboardPort(settingsForm.dashboardPort)}`,
    `LAUNCH_SOUND_ENABLED=${settingsForm.launchSoundMode}`,
    `DASHBOARD_LANGUAGE=${settingsForm.language}`,
    "",
    "# -----------------------------------------------------------------------------",
    "# 4. RPC Endpoints",
    "# -----------------------------------------------------------------------------",
    `ETHEREUM_RPC_URL=${settingsForm.rpc.ethereum}`,
    `BNB_RPC_URL=${settingsForm.rpc.bnb}`,
    `ARBITRUM_RPC_URL=${settingsForm.rpc.arbitrum}`,
    `BASE_RPC_URL=${settingsForm.rpc.base}`,
    `POLYGON_RPC_URL=${settingsForm.rpc.polygon}`,
    "",
    "# -----------------------------------------------------------------------------",
    "# 5. Public Feed",
    "# -----------------------------------------------------------------------------",
    `LIQUIDATION_SNAPSHOT_API_URL=${settingsForm.feeds.snapshotApiUrl}`,
    `LIQUIDATION_SNAPSHOT_TOKEN=${settingsForm.feeds.snapshotToken}`,
    `LIQUIDATION_SNAPSHOT_TIMEOUT_MS=${settingsForm.feeds.snapshotTimeoutMs}`,
    "",
    "# -----------------------------------------------------------------------------",
    "# 6. Execution Queue",
    "# -----------------------------------------------------------------------------",
    `LIQUIDATION_QUEUE_WSS_CORRECTION=${settingsForm.wssCorrectionMode}`,
    `QUEUE_TOKEN=${settingsForm.queue.wssToken}`,
    `LIQUIDATION_QUEUE_WSS_URL=${settingsForm.queue.wssUrl}`,
    `LIQUIDATION_QUEUE_STATUS_URL=${settingsForm.queue.statusUrl}`,
    `LIQUIDATION_QUEUE_HEARTBEAT_INTERVAL_MS=${settingsForm.queue.heartbeatIntervalMs}`,
    `LIQUIDATION_QUEUE_TX_EVENTS_URL=${settingsForm.queue.txEventsUrl}`,
    `MANAGE_LIQUIDATION_QUEUE_INGEST_URL=${settingsForm.queue.manageIngestUrl}`,
    `MANAGE_INGEST_TOKEN=${settingsForm.queue.manageIngestToken}`,
    "",
    "# -----------------------------------------------------------------------------",
    "# 7. Official Services",
    "# -----------------------------------------------------------------------------",
    "SUPERMTNODE_API_BASE_URL=https://api.supermtnode.io",
    "LIQ2_PRIVATE_MEMBER_BOOTSTRAP_ENABLED=true",
    "LIQ2_PRIVATE_MEMBER_API_URL=https://private.superarb.ai",
    "LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PATH=/api/internal/liq2-wallet/bootstrap",
    "TX_WALLET_PUBLIC_KEY_PATH=server/tx-wallet-public.pem",
    "GITHUB_REPOSITORY=xgame2026-hash/superatblib",
  ];
  return `${lines.join("\n")}\n`;
}

function applyEnvSettings(env: Record<string, string>, options: { syncRuntimePort?: boolean } = {}) {
  const envAuthCode = (env.AUTH_CODE || env.SUPERARB_AUTH_CODE || env.LICENSE_CODE || "").trim().toUpperCase();
  if (!authCode.value.trim() && envAuthCode) authCode.value = envAuthCode;
  settingsForm.privateKey = env.PRIVATE_KEY ?? settingsForm.privateKey;
  settingsForm.language = env.DASHBOARD_LANGUAGE ?? settingsForm.language;
  settingsForm.fundingMode = env.FUNDING_MODE ?? settingsForm.fundingMode;
  settingsForm.arbitrageIntensity = env.ARBITRAGE_INTENSITY ?? settingsForm.arbitrageIntensity;
  settingsForm.credentialAuthMode = normalizeCredentialAuthMode(env.CREDENTIAL_AUTH_MODE ?? settingsForm.credentialAuthMode);
  settingsForm.singleTradeAuthAmountUsdt = env.SINGLE_TRADE_AUTH_AMOUNT_USDT ?? settingsForm.singleTradeAuthAmountUsdt;
  settingsForm.startupDetectionMode = normalizeStartupDetectionMode(env.STARTUP_DETECTION_MODE ?? settingsForm.startupDetectionMode);
  settingsForm.wssCorrectionMode = normalizeWssCorrectionMode(env.LIQUIDATION_QUEUE_WSS_CORRECTION ?? settingsForm.wssCorrectionMode);
  const envDashboardPort = normalizeDashboardPort(env.DASHBOARD_PORT ?? settingsForm.dashboardPort);
  settingsForm.dashboardPort = options.syncRuntimePort ? runtimeDashboardPort(envDashboardPort) : envDashboardPort;
  settingsForm.launchSoundMode = normalizeLaunchSoundMode(localStorage.getItem(LAUNCH_SOUND_KEY) ?? env.LAUNCH_SOUND_ENABLED ?? settingsForm.launchSoundMode);
  settingsForm.rpc.ethereum = env.ETHEREUM_RPC_URL ?? settingsForm.rpc.ethereum;
  settingsForm.rpc.bnb = env.BNB_RPC_URL ?? settingsForm.rpc.bnb;
  settingsForm.rpc.arbitrum = env.ARBITRUM_RPC_URL ?? settingsForm.rpc.arbitrum;
  settingsForm.rpc.base = env.BASE_RPC_URL ?? settingsForm.rpc.base;
  settingsForm.rpc.polygon = env.POLYGON_RPC_URL ?? settingsForm.rpc.polygon;
  settingsForm.feeds.snapshotApiUrl = env.LIQUIDATION_SNAPSHOT_API_URL ?? settingsForm.feeds.snapshotApiUrl;
  settingsForm.feeds.snapshotToken = env.LIQUIDATION_SNAPSHOT_TOKEN ?? settingsForm.feeds.snapshotToken;
  settingsForm.feeds.snapshotTimeoutMs = env.LIQUIDATION_SNAPSHOT_TIMEOUT_MS ?? settingsForm.feeds.snapshotTimeoutMs;
  settingsForm.queue.manageIngestUrl = env.MANAGE_LIQUIDATION_QUEUE_INGEST_URL ?? settingsForm.queue.manageIngestUrl;
  settingsForm.queue.manageIngestToken = env.MANAGE_INGEST_TOKEN ?? settingsForm.queue.manageIngestToken;
  settingsForm.queue.wssUrl = env.LIQUIDATION_QUEUE_WSS_URL ?? settingsForm.queue.wssUrl;
  settingsForm.queue.wssToken = env.QUEUE_TOKEN ?? env.LIQUIDATION_QUEUE_WSS_TOKEN ?? settingsForm.queue.wssToken;
  settingsForm.queue.statusUrl = env.LIQUIDATION_QUEUE_STATUS_URL ?? settingsForm.queue.statusUrl;
  settingsForm.queue.heartbeatIntervalMs = env.LIQUIDATION_QUEUE_HEARTBEAT_INTERVAL_MS ?? settingsForm.queue.heartbeatIntervalMs;
  settingsForm.queue.txEventsUrl = env.LIQUIDATION_QUEUE_TX_EVENTS_URL ?? settingsForm.queue.txEventsUrl;
  settingsForm.superMtNodeAppToken = env.SUPERMTNODE_APP_TOKEN ?? settingsForm.superMtNodeAppToken;
}

function normalizeStartupDetectionMode(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["manual", "手动"].includes(normalized) ? "manual" : "auto";
}

function normalizeWssCorrectionMode(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["0", "false", "off", "disabled", "close", "关闭"].includes(normalized) ? "disabled" : "enabled";
}

function normalizeCredentialAuthMode(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["loop", "multi", "multiple", "repeat", "cycle", "多次", "多次循环"].includes(normalized) ? "loop" : "single";
}

function normalizeDashboardPort(value: string) {
  const port = Number(value.trim());
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return "4311";
  return port.toString();
}

function runtimeDashboardPort(fallback: string) {
  const host = window.location.hostname;
  const port = window.location.port;
  const isLocalHost = host === "127.0.0.1" || host === "localhost" || host === "127.0.01";
  if (!isLocalHost || !port) return fallback;
  return normalizeDashboardPort(port);
}

function normalizeLaunchSoundMode(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["0", "false", "off", "disabled", "close", "关闭", "关闭音效"].includes(normalized) ? "disabled" : "enabled";
}

function toggleLaunchSound() {
  settingsForm.launchSoundMode = launchSoundEnabled.value ? "disabled" : "enabled";
}

function handleLaunchSound(state: "launched" | "not-launched") {
  if (state === "launched") {
    stopNotLaunchedReminder();
    playLaunchAudio(launchedAudioUrl);
    return;
  }
  playLaunchAudio(notLaunchedAudioUrl);
  startNotLaunchedReminder();
}

function playLaunchAudio(url: string) {
  if (!launchSoundEnabled.value) return;
  const audio = new Audio(url);
  audio.volume = 0.82;
  void audio.play().catch(() => {});
}

function startNotLaunchedReminder() {
  if (!launchSoundEnabled.value || notLaunchedReminderTimer) return;
  notLaunchedReminderTimer = window.setInterval(() => playLaunchAudio(notLaunchedAudioUrl), 10 * 60 * 1000);
}

function stopNotLaunchedReminder() {
  if (!notLaunchedReminderTimer) return;
  window.clearInterval(notLaunchedReminderTimer);
  notLaunchedReminderTimer = 0;
}

</script>
