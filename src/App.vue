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
            <label class="field-label" for="auth-code">{{ t("app.authCode") }}</label>
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
                  :aria-label="showAuthCode ? t('app.hideAuthCode') : t('app.showAuthCode')"
                  @click="showAuthCode = !showAuthCode"
                >
                  <el-icon><component :is="showAuthCode ? Hide : View" /></el-icon>
                </button>
              </template>
            </el-input>
            <div class="form-row">
              <el-checkbox v-model="rememberCode">{{ t("app.rememberAuthCode") }}</el-checkbox>
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
              {{ t("app.enterConsole") }}
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
            :aria-label="launchSoundEnabled ? t('app.turnOffSound') : t('app.turnOnSound')"
            :title="launchSoundEnabled ? t('app.turnOffSound') : t('app.turnOnSound')"
            @click="toggleLaunchSound"
          >
            <img class="sound-toggle-icon" :src="launchSoundEnabled ? musicOpenIconUrl : musicCloseIconUrl" alt="" aria-hidden="true" />
          </button>
          <div ref="githubVersionControl" class="github-version-control">
            <button class="github-version-button" type="button" :aria-label="t('app.githubStatus')" @click="githubMenuOpen = !githubMenuOpen">
              <span class="github-version-main">
                <img :src="githubIconUrl" alt="" aria-hidden="true" />
                <span>GitHub v{{ githubLatestDisplayVersion }}</span>
              </span>
              <span class="github-version-arrow" :class="{ active: githubMenuOpen }" aria-hidden="true">
                <img :src="arrowIconUrl" alt="" />
              </span>
            </button>
            <div v-if="githubMenuOpen" class="github-version-menu" :class="`is-${githubVersionState}`">
              <strong class="github-version-title">
                <img :src="infoNewIconUrl" alt="" aria-hidden="true" />
                {{ githubVersionTitle }}
              </strong>
              <div class="github-version-lines">
                <span>{{ t("app.currentVersion") }}</span>
                <strong>v{{ displayVersion }}</strong>
                <span>{{ t("app.githubLatest") }}</span>
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
            :locale-options="localeOptions"
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
          {{ t("app.footerCopyright") }}
        </span>
        <span>{{ t("app.local") }}: http://127.0.0.1:{{ runningDashboardPort }}</span>
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
              {{ t("security.description") }}
            </p>
          </div>
        </div>
      </template>

      <div class="security-check-summary">
        <div>
          <span>{{ t("security.result") }}</span>
          <strong>{{ settingsSecurityOk ? t("security.allPassed") : t("security.riskCount", { count: settingsSecurityFailedCount }) }}</strong>
        </div>
        <div>
          <span>{{ t("security.visibleItems") }}</span>
          <strong>{{ visibleSecurityItems.length }}</strong>
        </div>
        <div>
          <span>{{ t("security.checkedAt") }}</span>
          <strong>{{ settingsSecurityCheckedAt || t("security.now") }}</strong>
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
            <span class="security-check-status">{{ item.ok ? t("security.pass") : t("security.risk") }}</span>
            <div>
              <strong>{{ formatSecurityScope(item) }}：{{ formatSecurityLabel(item) }}</strong>
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
            {{ settingsSecurityRepairing ? t("security.repairing") : t("security.repair") }}
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
import { getLocale, localeOptions, normalizeLocale, setLocale, t } from "./i18n";
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
  | "wssUrl"
  | "wssToken"
  | "statusUrl"
  | "heartbeatIntervalMs"
  | "txEventsUrl";

const AUTH_STORAGE_KEY = "superarb-auth-session-v1.6.1";
const AUTH_CODE_KEY = "superarb-auth-code-v1.6.1";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.1";
const ACTIVE_VIEW_KEY = "liq2-active-view";
const SETTINGS_SECTION_KEY = "liq2-settings-section";
const LAUNCH_SOUND_KEY = "liq2-launch-sound-enabled";
const AUTH_CODE_PATTERN = /^SMT-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/i;
const appVersion = "1.6.1";
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
const settingsSaveMessage = ref(t("save.savingLong"));
const settingsSecurityChecking = ref(false);
const settingsSecurityRepairing = ref(false);
const settingsSecurityDialogVisible = ref(false);
const settingsSecurityItems = ref<SecurityCheckItem[]>([]);
const settingsSecurityCheckedAt = ref("");
const selectedNewsId = ref("");
const githubLatestVersion = ref(appVersion);
const githubLatestCommit = ref("");
const githubVersionState = ref<GithubVersionState>("checking");
const githubVersionMessage = ref(t("github.checking"));
const githubMenuOpen = ref(false);
const githubVersionControl = ref<HTMLElement | null>(null);
const txGraphInitialQuery = ref<{ chain: "ethereum" | "bnb" | "arbitrum"; hash: string; nonce: number } | null>(null);
const liquidationViewRef = ref<InstanceType<typeof LiquidationView> | null>(null);
const { newsItems, newsLoading, newsError, loadNews } = useNews();

const navItems = computed(() => [
  { key: "overview" as const, label: t("nav.overview"), iconUrl: homeIconUrl },
  { key: "execution" as const, label: t("nav.execution"), iconUrl: newLiqIconUrl },
  { key: "analytics" as const, label: t("nav.analytics"), iconUrl: controlIconUrl },
  { key: "liquidationTopic" as const, label: t("nav.liquidationTopic"), iconUrl: liqItemIconUrl },
  { key: "news" as const, label: t("nav.news"), iconUrl: infoIconUrl },
  { key: "txgraph" as const, label: t("nav.txgraph"), iconUrl: queryIconUrl },
  { key: "settings" as const, label: t("nav.settings"), iconUrl: setupIconUrl },
]);

const settingsSections = computed(() => [
  { key: "general" as const, label: t("settings.general"), hint: t("settings.generalHint"), eyebrow: "General" },
  { key: "credentials" as const, label: t("settings.credentials"), hint: t("settings.credentialsHint"), eyebrow: "Credentials" },
  { key: "rpc" as const, label: t("settings.rpc"), hint: t("settings.rpcHint"), eyebrow: "Network" },
  { key: "feeds" as const, label: t("settings.feeds"), hint: t("settings.feedsHint"), eyebrow: "Feeds" },
]);

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
    labelKey: "settings.snapshotApi",
    env: "LIQUIDATION_SNAPSHOT_API_URL",
    placeholder: "https://bsc.rpc.supermtnode.io/api/public/liquidations/snapshot",
  },
  {
    key: "snapshotToken" as const,
    labelKey: "settings.snapshotToken",
    env: "LIQUIDATION_SNAPSHOT_TOKEN",
    placeholder: "snapshot service token",
    secret: true,
  },
  {
    key: "snapshotTimeoutMs" as const,
    labelKey: "settings.snapshotTimeout",
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
    statusUrl: "https://private.superarb.ai/api/liq2/leaderboard",
    heartbeatIntervalMs: "1000",
    txEventsUrl: "",
  } as Record<QueueKey, string>,
});

const currentNavLabel = computed(() => {
  return navItems.value.find((item) => item.key === activeView.value)?.label ?? t("nav.overview");
});

const pageEyebrow = computed(() => {
  if (activeView.value === "settings") return t("hero.settings");
  if (activeView.value === "news") return t("hero.news");
  if (activeView.value === "txgraph") return t("hero.txgraph");
  if (activeView.value === "execution") return t("hero.execution");
  if (activeView.value === "analytics") return t("hero.analytics");
  if (activeView.value === "liquidationTopic") return t("hero.liquidationTopic");
  return t("hero.overview");
});
const hidePageHero = computed(() => activeView.value === "news" && Boolean(selectedNewsId.value));

const currentSettingsSection = computed(() => {
  return settingsSections.value.find((section) => section.key === settingsSection.value) ?? settingsSections.value[0];
});

const dashboardPort = computed(() => normalizeDashboardPort(settingsForm.dashboardPort));
const runningDashboardPort = computed(() => runtimeDashboardPort(dashboardPort.value));
const launchSoundEnabled = computed(() => settingsForm.launchSoundMode !== "disabled");
const settingsSaveTitle = computed(() => {
  if (settingsSaveState.value === "done") return t("save.doneTitle");
  if (settingsSaveState.value === "error") return t("save.errorTitle");
  return t("save.inProgress");
});

const missingLocalConfigKeys = ["PRIVATE_KEY", "SUPERMTNODE_APP_TOKEN", "BNB_RPC_URL"];
const hiddenPassingSecurityKeys = [
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
  if (settingsSecurityOk.value) return t("security.titlePassed");
  const failed = visibleSecurityItems.value.filter((item) => !item.ok);
  if (failed.some(isAuthorizationFailureItem)) return t("security.authExpired");
  if (failed.some((item) => item.key === "BNB_RPC_URL" && /未绑定到/.test(item.message))) return t("security.rpcUnbound");
  const onlyMissingLocalConfig = failed.length > 0 && failed.every((item) => missingLocalConfigKeys.includes(item.key));
  return onlyMissingLocalConfig ? t("security.localMissing") : t("security.unofficial");
});

const githubVersionTitle = computed(() => {
  if (githubVersionState.value === "update") return t("github.updateFound");
  if (githubVersionState.value === "checking") return t("github.checkingTitle");
  if (githubVersionState.value === "unconfigured") return t("github.unconfigured");
  if (githubVersionState.value === "error") return t("github.error");
  return t("github.latest");
});
const githubLatestDisplayVersion = computed(() => {
  return versionWithCommit(githubLatestVersion.value, githubLatestCommit.value);
});
const githubIsLatestBuild = computed(() => {
  const latestVersion = normalizeVersionLabel(githubLatestVersion.value);
  if (compareVersionLabels(appVersion, latestVersion) !== 0) return compareVersionLabels(appVersion, latestVersion) > 0;
  if (appGitCommit && githubLatestCommit.value) return appGitCommit === githubLatestCommit.value.slice(0, 7);
  return true;
});

const metrics = ref([
  { label: t("metrics.candidateAccounts"), value: "0", trend: 0 },
  { label: t("metrics.executableOpportunities"), value: "0", trend: 0 },
  { label: t("metrics.estimatedProfit"), value: "$0", trend: 0 },
  { label: t("metrics.failureProtection"), value: "0%", trend: 0 },
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

watch(
  () => settingsForm.language,
  (language) => {
    const normalized = normalizeLocale(language);
    if (settingsForm.language !== normalized) {
      settingsForm.language = normalized;
      return;
    }
    setLocale(normalized);
  },
  { immediate: true },
);

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

function compareVersionLabels(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

function versionParts(source: string): number[] {
  return normalizeVersionLabel(source)
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
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
    authMessage.value = t("auth.invalidCode");
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
    ElMessage.success(t("auth.success"));
  } catch (error) {
    authMessage.value = error instanceof Error ? error.message : t("auth.serviceUnavailable");
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
  ElMessage.success(t("auth.loggedOut"));
}

function mapAuthError(error: string) {
  const normalized = error.toLowerCase();
  if (normalized.includes("expired") || normalized.includes("inactive") || normalized.includes("revoked")) {
    return t("auth.expired");
  }
  if (normalized.includes("missing") || normalized.includes("not_found") || normalized.includes("not found")) {
    return t("auth.notFound");
  }
  if (normalized.includes("http 404")) {
    return t("auth.serviceNotFound");
  }
  return t("auth.invalidCode");
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
  throw lastError instanceof Error ? lastError : new Error(t("security.apiConnectFailed"));
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
  githubVersionMessage.value = t("github.checking");
  try {
    const response = await fetch("/api/github-version");
    if (!response.ok) throw new Error(t("github.apiUnavailable"));
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
    githubVersionState.value = payload.configured === false ? "unconfigured" : githubIsLatestBuild.value ? "latest" : "update";
    githubVersionMessage.value = payload.message ?? "";
  } catch (error) {
    githubLatestVersion.value = appVersion;
    githubLatestCommit.value = "";
    githubVersionState.value = "error";
    githubVersionMessage.value = error instanceof Error ? error.message : t("github.checkFailed");
  }
}

async function saveSettings() {
  settingsSaveState.value = "saving";
  settingsSaveMessage.value = t("save.saving");
  settingsSaveDialogVisible.value = true;

  try {
    const response = await fetchSettingsApi("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ env: generateEnvText() }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? t("save.failed"));
    }
    const payload = (await response.json().catch(() => ({}))) as { path?: string };
    settingsEnvPath.value = payload.path ?? settingsEnvPath.value;
    await loadSettings();
    settingsSaveState.value = "done";
    settingsSaveMessage.value = t("save.doneMessage");
    window.setTimeout(() => {
      if (settingsSaveState.value === "done") {
        settingsSaveDialogVisible.value = false;
      }
    }, 1200);
  } catch (error) {
    settingsSaveState.value = "error";
    settingsSaveMessage.value = error instanceof Error ? error.message : t("save.failed");
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
      throw new Error(payload.error ?? t("security.checkFailed"));
    }
    const payload = (await response.json()) as { ok?: boolean; items?: SecurityCheckItem[]; checkedAt?: string };
    settingsSecurityItems.value = payload.items ?? [];
    settingsSecurityCheckedAt.value = formatSecurityCheckedAt(payload.checkedAt);
    settingsSecurityDialogVisible.value = true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t("security.checkFailed"));
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
      throw new Error(payload.error ?? payload.reason ?? t("security.repairFailed"));
    }
    ElMessage.success(t("security.repairDone"));
    await checkOfficialSettings();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t("security.repairFailed"));
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
      existing.scope = t("security.scopeLocal");
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
  const localeMap = {
    zh: "zh-CN",
    en: "en-US",
    ja: "ja-JP",
    ko: "ko-KR",
    ru: "ru-RU",
    th: "th-TH",
  };
  return date.toLocaleString(localeMap[getLocale()], { hour12: false });
}

function formatSecurityLabel(item: SecurityCheckItem) {
  if (item.key === "PRIVATE_KEY") return t("security.walletAddressLabel");
  if (item.key === "SUPERMTNODE_APP_TOKEN") return t("security.serviceTokenLabel");
  if (item.key === "BNB_RPC_URL") return t("security.bnbRpcLabel");
  if (item.key === "LIQUIDATION_SNAPSHOT_API_URL") return t("security.snapshotApiLabel");
  if (item.key === "AUTH_CODE") return t("security.authCode");
  if (item.key === "SECURE_UPLOAD_STATUS") return t("security.secureSync");
  return item.label;
}

function formatSecurityScope(item: SecurityCheckItem) {
  if (/当前页面配置/.test(item.scope)) return t("security.scopeCurrentPage");
  if (/已保存/.test(item.scope)) return t("security.scopeSavedEnv");
  if (/本地配置/.test(item.scope)) return t("security.scopeLocal");
  return item.scope;
}

function formatSecurityKey(item: SecurityCheckItem) {
  if (item.key === "PRIVATE_KEY") return "WALLET_ADDRESS";
  if (item.key === "SUPERMTNODE_APP_TOKEN") return "SERVICE_TOKEN";
  if (item.key === "AUTH_CODE") return "AUTH_CODE";
  if (item.key === "SECURE_UPLOAD_STATUS") return "SECURE_SYNC";
  return item.key;
}

function formatSecurityValue(item: SecurityCheckItem) {
  if (item.key === "PRIVATE_KEY") {
    return item.ok ? item.value : t("security.invalidPrivateKey");
  }
  if (item.key === "SUPERMTNODE_APP_TOKEN") {
    return item.ok ? t("security.configured") : t("security.notConfigured");
  }
  if (item.key === "AUTH_CODE") return item.ok ? t("security.verified") : t("security.verifyFailed");
  if (item.ok && item.message.includes("运行时不使用该备用项")) return t("security.checkPassed");
  if (item.key === "SECURE_UPLOAD_STATUS") return item.value;
  return localizeSecurityText(item.value) || t("security.defaultUsed");
}

function formatSecurityMessage(item: SecurityCheckItem) {
  if (item.key === "PRIVATE_KEY") return item.ok ? t("security.privateKeyOk") : t("security.privateKeyMissing");
  if (item.key === "SUPERMTNODE_APP_TOKEN") return item.ok ? t("security.tokenOk") : t("security.tokenMissing");
  if (item.key === "AUTH_CODE") return localizeSecurityText(item.message);
  if (item.ok && item.message.includes("运行时不使用该备用项")) return t("security.checkPassed");
  if (item.key === "SECURE_UPLOAD_STATUS") return localizeSecurityText(item.message);
  return localizeSecurityText(item.message);
}

function formatSecuritySummary(item: SecurityCheckItem) {
  if (item.key === "PRIVATE_KEY") return item.ok ? t("security.walletAddress", { address: shortAddress(item.value) }) : t("security.localMissing");
  if (item.key === "SUPERMTNODE_APP_TOKEN") return item.ok ? formatTokenSecuritySummary(item) : localizeSecurityText(item.message);
  if (item.key === "AUTH_CODE") return localizeSecurityText(item.message);
  if (item.key === "BNB_RPC_URL") return item.ok || item.value ? formatRpcSecuritySummary(item) : t("security.localMissing");
  if (item.key === "SECURE_UPLOAD_STATUS") return localizeSecurityText(item.message);
  if (item.key === "LIQUIDATION_SNAPSHOT_API_URL") return item.ok ? t("security.checkPassed") : localizeSecurityText(item.message);
  if (item.ok) return t("security.checkPassed");
  return formatSecurityMessage(item);
}

function formatTokenSecuritySummary(item: SecurityCheckItem) {
  const text = `${item.value || ""} ${item.message || ""}`;
  const expiry = text.match(/(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/);
  if (expiry) return t("security.expiresAt", { time: expiry[1] });
  if (/官方校验通过|verified|configured/i.test(text)) return t("security.tokenOk");
  return localizeSecurityText(item.value || item.message);
}

function formatRpcSecuritySummary(item: SecurityCheckItem) {
  const message = item.message || item.value || "";
  const usage = message.match(/用量\s*(\d+)\s*\/\s*(\d+).*剩余\s*(\d+)/);
  if (usage) {
    return t("security.rpcHealthyUsage", { used: usage[1], total: usage[2], remaining: usage[3] });
  }
  if (/RPC 连接正常|RPC.*normal|connected/i.test(message)) return t("security.rpcHealthy");
  return localizeSecurityText(message);
}

function localizeSecurityText(value?: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^检查通过$|^Check passed$/i.test(text)) return t("security.checkPassed");
  if (/^本地未配置$|not configured|missing/i.test(text)) return t("security.localMissing");
  if (/^已配置$|configured/i.test(text)) return t("security.configured");
  if (/官方校验通过/.test(text)) return t("security.checkPassed");
  return text;
}

function shortAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function generateEnvText() {
  const lines = [
    "# SuperARB / LIQ2 environment file",
    "# Generated from SuperARB 1.6.1 internal settings.",
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
  ];
  return `${lines.join("\n")}\n`;
}

function applyEnvSettings(env: Record<string, string>, options: { syncRuntimePort?: boolean } = {}) {
  const envAuthCode = (env.AUTH_CODE || env.SUPERARB_AUTH_CODE || env.LICENSE_CODE || "").trim().toUpperCase();
  if (!authCode.value.trim() && envAuthCode) authCode.value = envAuthCode;
  settingsForm.privateKey = env.PRIVATE_KEY ?? settingsForm.privateKey;
  settingsForm.language = normalizeLocale(env.DASHBOARD_LANGUAGE ?? settingsForm.language);
  settingsForm.fundingMode = env.FUNDING_MODE ?? settingsForm.fundingMode;
  settingsForm.arbitrageIntensity = env.ARBITRAGE_INTENSITY ?? settingsForm.arbitrageIntensity;
  settingsForm.credentialAuthMode = normalizeCredentialAuthMode(env.CREDENTIAL_AUTH_MODE ?? settingsForm.credentialAuthMode);
  settingsForm.singleTradeAuthAmountUsdt = env.SINGLE_TRADE_AUTH_AMOUNT_USDT ?? settingsForm.singleTradeAuthAmountUsdt;
  settingsForm.startupDetectionMode = normalizeStartupDetectionMode(env.STARTUP_DETECTION_MODE ?? settingsForm.startupDetectionMode);
  settingsForm.wssCorrectionMode = normalizeWssCorrectionMode(settingsForm.wssCorrectionMode);
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
