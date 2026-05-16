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
            :icon="settingsSecretsVisible ? Hide : View"
            @click="emit('update:settingsSecretsVisible', !settingsSecretsVisible)"
          >
            {{ settingsSecretsVisible ? "隐藏" : "显示" }}
          </el-button>
          <el-button
            class="save-settings-button"
            type="primary"
            :loading="settingsSaveDialogVisible && settingsSaveState === 'saving'"
            @click="emit('save')"
          >
            <img class="settings-action-icon" :src="saveIconUrl" alt="" aria-hidden="true" />
            保存
          </el-button>
          <el-button class="logout-settings-button" :icon="SwitchButton" @click="emit('logout')">
            退出
          </el-button>
        </div>
      </div>

      <div v-if="settingsSection === 'general'" class="settings-form-grid">
        <label class="settings-field is-full">
          <span>钱包私钥</span>
          <el-input v-model="settingsForm.privateKey" :type="secretInputType" placeholder="0x..." />
        </label>
        <label class="settings-field is-full">
          <span>SUPERMTNODE_APP_TOKEN</span>
          <el-input v-model="settingsForm.superMtNodeAppToken" :type="secretInputType" />
        </label>
        <label class="settings-field">
          <span>资金模式</span>
          <el-select v-model="settingsForm.fundingMode">
            <el-option label="Flash Loan" value="flash_loan" />
            <el-option label="Self funded" value="self_funded" />
          </el-select>
        </label>
        <label class="settings-field">
          <span>界面语言</span>
          <el-select v-model="settingsForm.language">
            <el-option label="简体中文" value="zh" />
          </el-select>
        </label>
      </div>

      <div v-else-if="settingsSection === 'rpc'" class="settings-form-grid">
        <label v-for="field in rpcFields" :key="field.key" class="settings-field is-full">
          <span class="settings-chain-label">
            <img :src="field.icon" :alt="field.label" />
            {{ field.env }}
          </span>
          <el-input v-model="settingsForm.rpc[field.key]" :type="secretInputType" placeholder="https://..." />
        </label>
      </div>

      <div v-else-if="settingsSection === 'feeds'" class="settings-form-grid">
        <label v-for="field in feedFields" :key="field.key" class="settings-field is-full">
          <span>{{ field.env }}</span>
          <el-input
            v-model="settingsForm.feeds[field.key]"
            :type="field.secret ? secretInputType : 'text'"
            :placeholder="field.placeholder ?? 'https://...'"
          />
        </label>
      </div>

      <div v-else-if="settingsSection === 'queue'" class="settings-form-grid">
        <label v-for="field in queueFields" :key="field.key" class="settings-field" :class="{ 'is-full': field.full }">
          <span>{{ field.env }}</span>
          <el-input
            v-model="settingsForm.queue[field.key]"
            :type="field.secret ? secretInputType : 'text'"
            :placeholder="field.placeholder"
          />
        </label>
      </div>

      <div v-else-if="settingsSection === 'cache'" class="settings-form-grid">
        <label v-for="field in cacheFields" :key="field.key" class="settings-field">
          <span>{{ field.env }}</span>
          <el-input v-model="settingsForm.cache[field.key]" :placeholder="field.placeholder" />
        </label>
      </div>

      <div v-else class="exchange-settings">
        <div v-for="exchange in exchangeFields" :key="exchange.key" class="exchange-block">
          <div class="exchange-title">{{ exchange.label }}</div>
          <div class="settings-form-grid">
            <label class="settings-field">
              <span>{{ exchange.apiEnv }}</span>
              <el-input v-model="settingsForm.exchanges[exchange.key].apiKey" :type="secretInputType" placeholder="public key" />
            </label>
            <label class="settings-field">
              <span>{{ exchange.secretEnv }}</span>
              <el-input v-model="settingsForm.exchanges[exchange.key].secretKey" :type="secretInputType" placeholder="secret key" />
            </label>
          </div>
        </div>
      </div>

      <div class="settings-footer">
        <span>保存位置：{{ settingsEnvPath }}</span>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { Hide, SwitchButton, View } from "@element-plus/icons-vue";

type LooseRecord = Record<string, any>;

defineProps<{
  settingsSections: LooseRecord[];
  settingsSection: string;
  currentSettingsSection?: LooseRecord;
  settingsForm: LooseRecord;
  settingsSecretsVisible: boolean;
  secretInputType: string;
  settingsSaveDialogVisible: boolean;
  settingsSaveState: string;
  settingsEnvPath: string;
  saveIconUrl: string;
  rpcFields: LooseRecord[];
  feedFields: LooseRecord[];
  queueFields: LooseRecord[];
  cacheFields: LooseRecord[];
  exchangeFields: LooseRecord[];
}>();

const emit = defineEmits<{
  "update:settingsSection": [value: string];
  "update:settingsSecretsVisible": [value: boolean];
  save: [];
  logout: [];
}>();
</script>

<style scoped src="./SettingsView.css"></style>
