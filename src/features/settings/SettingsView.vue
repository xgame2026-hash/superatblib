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
        <label class="settings-field">
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

      <div class="settings-footer">
        <span>{{ t("settings.savePath", { path: settingsEnvPath }) }}</span>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { CircleCheck, Hide, SwitchButton, View } from "@element-plus/icons-vue";
import { t } from "../../i18n";

type LooseRecord = Record<string, any>;

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
}>();

const languageSelectRef = ref<HTMLElement | null>(null);
const languageMenuOpen = ref(false);

const selectedLanguageLabel = computed(() => {
  return props.localeOptions.find((option) => option.value === props.settingsForm.language)?.label ?? props.localeOptions[0]?.label ?? "";
});

onMounted(() => {
  document.addEventListener("pointerdown", closeLanguageMenuOnOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeLanguageMenuOnOutside);
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
</script>

<style scoped src="./SettingsView.css"></style>
