<template>
  <section class="settings-page">
    <aside class="settings-nav panel">
      <button
        v-for="section in settingsSections"
        :key="section.key"
        class="settings-nav-button"
        :class="{ active: settingsSection === section.key }"
        type="button"
        @click="emit('update:settingsSection', section.key)"
      >
        <span>{{ section.label }}</span>
        <small>{{ section.hint }}</small>
      </button>
    </aside>

    <article class="panel settings-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">{{ currentSettingsSection?.eyebrow }}</p>
          <h3>{{ currentSettingsSection?.label }}</h3>
        </div>
        <div class="settings-panel-actions">
          <el-button
            class="ghost-action"
            :icon="CircleCheck"
            :loading="settingsSecurityChecking"
            @click="emit('security-check')"
          >
            {{ t("settings.check") }}
          </el-button>
          <el-button
            class="ghost-action"
            :icon="settingsSecretsVisible ? Hide : View"
            @click="emit('update:settingsSecretsVisible', !settingsSecretsVisible)"
          >
            {{ settingsSecretsVisible ? t("settings.hide") : t("settings.show") }}
          </el-button>
          <el-button
            class="save-settings-button"
            type="primary"
            :loading="settingsSaveDialogVisible && settingsSaveState === 'saving'"
            @click="emit('save')"
          >
            <img class="settings-action-icon" :src="saveIconUrl" alt="" aria-hidden="true" />
            {{ t("settings.save") }}
          </el-button>
          <el-button class="logout-settings-button" :icon="SwitchButton" @click="emit('logout')">
            {{ t("settings.logout") }}
          </el-button>
        </div>
      </div>

      <div v-if="settingsSection === 'general'" class="settings-form-grid">
        <label class="settings-field is-full">
          <span>{{ t("settings.privateKey") }}</span>
          <el-input
            v-model="settingsForm.privateKey"
            class="settings-secret-input"
            :class="{ 'is-masked': !settingsSecretsVisible }"
            type="text"
            name="settings-private-key"
            placeholder="0x..."
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          />
        </label>
        <label class="settings-field is-full">
          <span>SUPERMTNODE_APP_TOKEN</span>
          <el-input
            v-model="settingsForm.superMtNodeAppToken"
            class="settings-secret-input"
            :class="{ 'is-masked': !settingsSecretsVisible }"
            type="text"
            name="settings-supermtnode-app-token"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          />
        </label>
        <label class="settings-field is-full">
          <span>{{ t("settings.fundingMode") }}</span>
          <el-select v-model="settingsForm.fundingMode">
            <el-option label="Flash Loan" value="flash_loan" />
            <el-option label="Self funded" value="self_funded" />
          </el-select>
        </label>
        <label class="settings-field">
          <span>{{ t("settings.arbitrageIntensity") }}</span>
          <el-select v-model="settingsForm.arbitrageIntensity">
            <el-option :label="t('settings.conservative')" value="conservative" />
            <el-option :label="t('settings.enhanced')" value="enhanced" />
            <el-option :label="t('settings.aggressive')" value="aggressive" />
          </el-select>
        </label>
        <label class="settings-field">
          <span>{{ t("settings.authAmount") }}</span>
          <el-input
            v-model="settingsForm.singleTradeAuthAmountUsdt"
            autocomplete="off"
            inputmode="decimal"
            name="settings-single-trade-auth-amount-usdt"
            placeholder="100"
          >
            <template #suffix>USDT</template>
          </el-input>
        </label>
        <label class="settings-field">
          <span>{{ t("settings.startupDetection") }}</span>
          <el-select v-model="settingsForm.startupDetectionMode">
            <el-option :label="t('settings.auto')" value="auto" />
            <el-option :label="t('settings.manual')" value="manual" />
          </el-select>
        </label>
        <label class="settings-field">
          <span>{{ t("settings.dashboardPort") }}</span>
          <el-input
            v-model="settingsForm.dashboardPort"
            autocomplete="off"
            inputmode="numeric"
            name="settings-dashboard-port"
            placeholder="4311"
          />
        </label>
        <label class="settings-field">
          <span>{{ t("settings.launchSound") }}</span>
          <el-select v-model="settingsForm.launchSoundMode">
            <el-option :label="t('settings.soundOn')" value="enabled" />
            <el-option :label="t('settings.soundOff')" value="disabled" />
          </el-select>
        </label>
        <label class="settings-field">
          <span>{{ t("settings.language") }}</span>
          <div ref="languageSelectRef" class="settings-language-select" :class="{ open: languageMenuOpen }">
            <button
              class="settings-language-trigger"
              type="button"
              :aria-expanded="languageMenuOpen"
              aria-haspopup="listbox"
              @click="languageMenuOpen = !languageMenuOpen"
            >
              <span>{{ selectedLanguageLabel }}</span>
              <i aria-hidden="true"></i>
            </button>
            <div v-if="languageMenuOpen" class="settings-language-menu" role="listbox">
              <button
                v-for="option in localeOptions"
                :key="option.value"
                class="settings-language-option"
                :class="{ active: settingsForm.language === option.value }"
                type="button"
                role="option"
                :aria-selected="settingsForm.language === option.value"
                @click="selectLanguage(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </label>
      </div>

      <div v-else-if="settingsSection === 'profile'" class="settings-form-grid profile-settings-grid">
        <div class="settings-profile-avatar-card">
          <div class="settings-avatar-preview">
            <img
              v-if="profileAvatarPreview"
              :key="profileAvatarPreview"
              :src="profileAvatarPreview"
              alt=""
              @load="profileAvatarLoadFailed = false"
              @error="profileAvatarLoadFailed = true"
            />
            <span v-else>{{ (settingsForm.profile.nickname || "?").slice(0, 1).toUpperCase() }}</span>
          </div>
          <div class="settings-profile-avatar-actions">
            <input
              ref="profileAvatarInputRef"
              class="settings-avatar-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              @change="handleProfileAvatarSelected"
            />
            <el-button class="ghost-action" type="button" :disabled="profileSaving" @click="profileAvatarInputRef?.click()">
              {{ t("settings.uploadAvatar") }}
            </el-button>
            <el-button class="ghost-action" type="button" :disabled="!profileAvatarFile || profileSaving" @click="cancelProfileAvatarSelection">
              {{ t("settings.clearAvatar") }}
            </el-button>
          </div>
        </div>
        <label class="settings-field is-full">
          <span>{{ t("settings.nickname") }}</span>
          <el-input
            v-model="settingsForm.profile.nickname"
            maxlength="32"
            name="settings-profile-nickname"
            autocomplete="off"
            :placeholder="t('settings.nicknamePlaceholder')"
            show-word-limit
          />
        </label>
        <label class="settings-field is-full">
          <span>{{ t("settings.bio") }}</span>
          <el-input
            v-model="settingsForm.profile.bio"
            type="textarea"
            maxlength="125"
            :rows="4"
            show-word-limit
            name="settings-profile-bio"
            :placeholder="t('settings.bioPlaceholder')"
          />
        </label>
        <div class="settings-profile-actions">
          <el-button class="save-settings-button" type="primary" :loading="profileSaving" :disabled="profileLoading" @click="saveProfileToSupermt3">
            {{ t("settings.saveProfile") }}
          </el-button>
          <el-button class="ghost-action" :loading="profileLoading" :disabled="profileSaving" @click="loadProfileFromSupermt3">
            {{ t("settings.loadProfile") }}
          </el-button>
        </div>
      </div>

      <div v-else-if="settingsSection === 'credentials'" class="settings-form-grid">
        <label class="settings-field is-full">
          <span>{{ t("settings.credentialMode") }}</span>
          <el-select v-model="settingsForm.credentialAuthMode">
            <el-option :label="t('settings.single')" value="single" />
            <el-option :label="t('settings.loop')" value="loop" />
          </el-select>
        </label>
      </div>

      <div v-else-if="settingsSection === 'rpc'" class="settings-form-grid">
        <label v-for="field in rpcFields" :key="field.key" class="settings-field is-full">
          <span class="settings-chain-label">
            <img :src="field.icon" :alt="field.label" />
            {{ field.env }}
          </span>
          <el-input
            v-model="settingsForm.rpc[field.key]"
            class="settings-secret-input"
            :class="{ 'is-masked': !settingsSecretsVisible }"
            type="text"
            :name="`settings-rpc-${field.key}`"
            placeholder="https://..."
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          />
        </label>
      </div>

      <div v-else-if="settingsSection === 'feeds'" class="settings-form-grid">
        <label v-for="field in feedFields" :key="field.key" class="settings-field is-full">
          <span class="settings-field-meta">
            <strong>{{ field.labelKey ? t(field.labelKey) : field.label ?? field.env }}</strong>
            <small>{{ field.env }}</small>
          </span>
          <el-input
            v-model="settingsForm.feeds[field.key]"
            :class="{ 'settings-secret-input': field.secret, 'is-masked': field.secret && !settingsSecretsVisible }"
            type="text"
            :name="`settings-feed-${field.key}`"
            :placeholder="field.placeholder ?? 'https://...'"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          />
        </label>
      </div>

      <div v-else-if="settingsSection === 'alerts'" class="settings-form-grid alert-sound-grid">
        <div v-for="field in alertSoundFields" :key="field.key" class="settings-field is-full alert-sound-field">
          <span class="settings-field-meta">
            <strong>{{ t(field.labelKey) }}</strong>
            <small>{{ field.env }}</small>
          </span>
          <div class="alert-sound-control">
            <el-select
              v-model="settingsForm.alertSounds[field.key]"
              @change="playAlertSoundPreview(field.key)"
            >
              <el-option
                v-for="(option, index) in alertSoundOptions"
                :key="option"
                :label="t('settings.alertSoundOption', { index: index + 1 })"
                :value="option"
              />
            </el-select>
            <el-button
              class="alert-sound-preview-button"
              :icon="isAlertSoundPreviewing(field.key) ? VideoPause : VideoPlay"
              :aria-label="isAlertSoundPreviewing(field.key) ? t('settings.stopPreview') : t('settings.previewSound')"
              :title="isAlertSoundPreviewing(field.key) ? t('settings.stopPreview') : t('settings.previewSound')"
              @click="toggleAlertSoundPreview(field.key)"
            >
              {{ isAlertSoundPreviewing(field.key) ? t("settings.stopPreview") : t("settings.previewSound") }}
            </el-button>
          </div>
        </div>
      </div>

      <div class="settings-footer">
        <span>{{ t("settings.savePath", { path: settingsEnvPath }) }}</span>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { CircleCheck, Hide, SwitchButton, VideoPause, VideoPlay, View } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import * as secp from "@noble/secp256k1";
import { getPublicKey } from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";
import { t } from "../../i18n";
import { normalizeAlertSoundId, resolveAlertSoundUrl, type AlertSoundKey } from "../../audio/alert-sounds";

type LooseRecord = Record<string, any>;

type AvatarProfilePayload = {
  message?: unknown;
  walletAddress?: unknown;
  nickname?: unknown;
  bio?: unknown;
  avatarUrl?: unknown;
  avatar_url?: unknown;
  avatarUpdatedAt?: unknown;
  avatar_updated_at?: unknown;
  url?: unknown;
};

const emit = defineEmits<{
  "update:settingsSection": [value: string];
  "update:settingsSecretsVisible": [value: boolean];
  "security-check": [];
  save: [];
  logout: [];
}>();

const props = defineProps<{
  settingsSections: LooseRecord[];
  settingsSection: string;
  currentSettingsSection?: LooseRecord;
  settingsForm: LooseRecord;
  settingsSecretsVisible: boolean;
  settingsSaveDialogVisible: boolean;
  settingsSaveState: string;
  settingsSecurityChecking: boolean;
  settingsEnvPath: string;
  saveIconUrl: string;
  localeOptions: LooseRecord[];
  rpcFields: LooseRecord[];
  feedFields: LooseRecord[];
  alertSoundFields: LooseRecord[];
  alertSoundOptions: readonly string[];
  soundEnabled: boolean;
}>();

const languageSelectRef = ref<HTMLElement | null>(null);
const languageMenuOpen = ref(false);
const profileAvatarInputRef = ref<HTMLInputElement | null>(null);
const profileAvatarFile = ref<File | null>(null);
const profileAvatarObjectUrl = ref("");
const profileAvatarRemoteVersion = ref("");
const profileAvatarLoadFailed = ref(false);
const profileLoading = ref(false);
const profileSaving = ref(false);
const previewingAlertSound = ref<AlertSoundKey | null>(null);
let alertSoundPreviewAudio: HTMLAudioElement | null = null;
const AVATAR_PROFILE_API = "/api/profile/avatar";
const AVATAR_IMAGE_API = "/api/profile/avatar/image";
const AVATAR_REQUEST_TIMEOUT_MS = 45_000;
const PROFILE_BIO_MAX_LENGTH = 125;

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key: Uint8Array, ...messages: Uint8Array[]) => hmac(sha256, key, concatBytes(...messages));

const selectedLanguageLabel = computed(() => {
  return props.localeOptions.find((option) => option.value === props.settingsForm.language)?.label ?? props.localeOptions[0]?.label ?? "";
});
const profileAvatarPreview = computed(() => {
  if (profileAvatarObjectUrl.value) return profileAvatarObjectUrl.value;
  if (profileAvatarLoadFailed.value) return "";
  return versionedAvatarUrl(props.settingsForm.profile.avatarUrl, profileAvatarRemoteVersion.value);
});

onMounted(() => {
  document.addEventListener("pointerdown", closeLanguageMenuOnOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeLanguageMenuOnOutside);
  stopAlertSoundPreview();
  revokeProfileAvatarObjectUrl();
});

watch(() => props.soundEnabled, (enabled) => {
  if (!enabled) stopAlertSoundPreview();
});

function selectLanguage(value: string) {
  props.settingsForm.language = value;
  languageMenuOpen.value = false;
}

function closeLanguageMenuOnOutside(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (languageSelectRef.value?.contains(target)) return;
  languageMenuOpen.value = false;
}

function isAlertSoundPreviewing(key: string) {
  return previewingAlertSound.value === key;
}

function toggleAlertSoundPreview(key: string) {
  const alertKey = key as AlertSoundKey;
  if (isAlertSoundPreviewing(alertKey)) {
    stopAlertSoundPreview();
    return;
  }
  void playAlertSoundPreview(alertKey);
}

async function playAlertSoundPreview(key: string) {
  if (!props.soundEnabled) return;
  const alertKey = key as AlertSoundKey;
  const soundId = normalizeAlertSoundId(props.settingsForm.alertSounds[alertKey]);
  stopAlertSoundPreview();

  const audio = new Audio(resolveAlertSoundUrl(alertKey, soundId));
  audio.volume = 0.82;
  alertSoundPreviewAudio = audio;
  previewingAlertSound.value = alertKey;
  audio.onended = () => clearFinishedAlertSoundPreview(audio);
  audio.onerror = () => handleAlertSoundPreviewFailure(audio);

  try {
    await audio.play();
  } catch {
    handleAlertSoundPreviewFailure(audio);
  }
}

function stopAlertSoundPreview() {
  const audio = alertSoundPreviewAudio;
  alertSoundPreviewAudio = null;
  previewingAlertSound.value = null;
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  audio.pause();
  audio.currentTime = 0;
}

function clearFinishedAlertSoundPreview(audio: HTMLAudioElement) {
  if (alertSoundPreviewAudio !== audio) return;
  alertSoundPreviewAudio = null;
  previewingAlertSound.value = null;
}

function handleAlertSoundPreviewFailure(audio: HTMLAudioElement) {
  if (alertSoundPreviewAudio !== audio) return;
  stopAlertSoundPreview();
  ElMessage.error(t("settings.previewSoundFailed"));
}

function handleProfileAvatarSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = "";
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    ElMessage.error(t("settings.avatarTypeError"));
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error(t("settings.avatarSizeError"));
    return;
  }
  profileAvatarFile.value = file;
  profileAvatarLoadFailed.value = false;
  revokeProfileAvatarObjectUrl();
  profileAvatarObjectUrl.value = URL.createObjectURL(file);
}

function cancelProfileAvatarSelection() {
  profileAvatarFile.value = null;
  revokeProfileAvatarObjectUrl();
  profileAvatarLoadFailed.value = false;
}

function revokeProfileAvatarObjectUrl() {
  if (!profileAvatarObjectUrl.value) return;
  URL.revokeObjectURL(profileAvatarObjectUrl.value);
  profileAvatarObjectUrl.value = "";
}

async function loadProfileFromSupermt3() {
  const wallet = profileWalletAddress();
  if (!wallet) {
    ElMessage.warning(t("settings.profileWalletMissing"));
    return;
  }
  profileLoading.value = true;
  try {
    const payload = await requestAvatarProfile(AVATAR_PROFILE_API, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "x-wallet-address": wallet,
      },
    });
    if (profileWalletAddress() !== wallet) return;
    applyAvatarProfile(payload);
    ElMessage.success(t("settings.profileLoaded"));
  } catch (error) {
    ElMessage.error(profileRequestError(error, "settings.loadProfileFailed"));
  } finally {
    profileLoading.value = false;
  }
}

async function saveProfileToSupermt3() {
  const wallet = profileWalletAddress();
  if (!wallet) {
    ElMessage.warning(t("settings.profileWalletMissing"));
    return;
  }
  profileSaving.value = true;
  try {
    const nickname = String(props.settingsForm.profile.nickname || "").trim().slice(0, 32);
    const bio = cleanProfileBio(props.settingsForm.profile.bio);
    const selectedAvatar = profileAvatarFile.value;
    let uploaded: AvatarProfilePayload | null = null;

    if (selectedAvatar) {
      const imageForm = new FormData();
      imageForm.set("wallet", wallet);
      imageForm.set("avatar", selectedAvatar);
      uploaded = await requestAvatarProfile(AVATAR_IMAGE_API, {
        method: "POST",
        headers: { "x-wallet-address": wallet },
        body: imageForm,
      });
    }

    const payload = await requestAvatarProfile(AVATAR_PROFILE_API, {
      method: "POST",
      headers: { "x-wallet-address": wallet },
      body: buildProfileForm(wallet, nickname, bio),
    });
    if (profileWalletAddress() !== wallet) return;

    const uploadedAvatarUrl = stringValue(uploaded?.url, uploaded?.avatarUrl, uploaded?.avatar_url);
    const uploadedAt = stringValue(uploaded?.avatarUpdatedAt, uploaded?.avatar_updated_at);
    applyAvatarProfile(
      {
        ...payload,
        avatarUrl: uploadedAvatarUrl || props.settingsForm.profile.avatarUrl || stringValue(payload.avatarUrl, payload.avatar_url),
        avatarUpdatedAt: uploadedAt || stringValue(payload.avatarUpdatedAt, payload.avatar_updated_at),
      },
      { forceVersion: Boolean(selectedAvatar) },
    );
    emit("save");
    ElMessage.success(t("settings.profileSaved"));
  } catch (error) {
    ElMessage.error(profileRequestError(error, "settings.saveProfileFailed"));
  } finally {
    profileSaving.value = false;
  }
}

async function requestAvatarProfile(path: string, init: RequestInit): Promise<AvatarProfilePayload> {
  const response = await fetch(path, {
    ...init,
    signal: AbortSignal.timeout(AVATAR_REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as AvatarProfilePayload;
  if (!response.ok) throw new Error(stringValue(payload.message) || `HTTP ${response.status}`);
  return payload;
}

function applyAvatarProfile(payload: AvatarProfilePayload, options: { forceVersion?: boolean } = {}) {
  const nickname = optionalString(payload.nickname);
  const bio = optionalString(payload.bio);
  const avatarUrl = optionalString(payload.avatarUrl) ?? optionalString(payload.avatar_url);
  const avatarUpdatedAt = optionalString(payload.avatarUpdatedAt) ?? optionalString(payload.avatar_updated_at);

  if (nickname !== undefined) props.settingsForm.profile.nickname = nickname.slice(0, 32);
  if (bio !== undefined) props.settingsForm.profile.bio = cleanProfileBio(bio);
  if (avatarUrl !== undefined) props.settingsForm.profile.avatarUrl = avatarUrl;
  if (avatarUpdatedAt !== undefined || options.forceVersion) {
    profileAvatarRemoteVersion.value = avatarUpdatedAt || Date.now().toString();
  }
  profileAvatarFile.value = null;
  profileAvatarLoadFailed.value = false;
  revokeProfileAvatarObjectUrl();
}

function buildProfileForm(wallet: string, nickname: string, bio: string) {
  const issuedAt = new Date().toISOString();
  const message = buildAvatarSignatureMessage(wallet, issuedAt);
  const form = new FormData();
  form.set("wallet", wallet);
  form.set("nickname", nickname);
  form.set("bio", bio);
  form.set("issuedAt", issuedAt);
  form.set("message", message);
  form.set("signature", signProfileMessage(message));
  return form;
}

function buildAvatarSignatureMessage(wallet: string, issuedAt: string) {
  return [
    "SuperMT Avatar Upload",
    `Wallet: ${wallet.toLowerCase()}`,
    `Issued At: ${issuedAt}`,
    "Purpose: bind avatar to wallet",
  ].join("\n");
}

function signProfileMessage(message: string) {
  const privateKey = hexToBytes(props.settingsForm.privateKey.trim().replace(/^0x/i, ""));
  const messageBytes = new TextEncoder().encode(message);
  const prefixBytes = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  const digest = keccak_256(concatBytes(prefixBytes, messageBytes));
  const recovered = secp.sign(digest, privateKey, { format: "recovered", prehash: false });
  const recovery = recovered[0];
  const compact = recovered.slice(1);
  return `0x${bytesToHex(concatBytes(compact, new Uint8Array([recovery + 27])))}`;
}

function profileWalletAddress() {
  return privateKeyToAddress(props.settingsForm.privateKey);
}

function privateKeyToAddress(value: string) {
  const hex = value.trim().replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) return "";
  try {
    const publicKey = getPublicKey(hexToBytes(hex), false).slice(1);
    const hash = keccak_256(publicKey);
    return `0x${bytesToHex(hash.slice(-20))}`;
  } catch {
    return "";
  }
}

function cleanProfileBio(value: string) {
  const singleLine = String(value || "").replace(/\s*[\r\n]+\s*/g, " ").trim();
  return Array.from(singleLine).slice(0, PROFILE_BIO_MAX_LENGTH).join("");
}

function versionedAvatarUrl(value: unknown, version: string) {
  const url = stringValue(value);
  if (!url || !version || /^(?:blob:|data:)/i.test(url)) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set("v", version);
    return parsed.toString();
  } catch {
    return url;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringValue(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() || "";
}

function profileRequestError(error: unknown, fallbackKey: string) {
  if (error instanceof DOMException && error.name === "TimeoutError") return t("settings.profileRequestTimeout");
  return error instanceof Error && error.message ? error.message : t(fallbackKey);
}
</script>

<style scoped src="./SettingsView.css"></style>
