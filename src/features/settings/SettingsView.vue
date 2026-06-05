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
            检测
          </el-button>
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
          <el-input
            v-model="settingsForm.privateKey"
            :type="secretInputType"
            placeholder="0x..."
            autocomplete="new-password"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          />
        </label>
        <label class="settings-field is-full">
          <span>SUPERMTNODE_APP_TOKEN</span>
          <el-input
            v-model="settingsForm.superMtNodeAppToken"
            :type="secretInputType"
            autocomplete="new-password"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          />
        </label>
        <label class="settings-field">
          <span>资金模式</span>
          <el-select v-model="settingsForm.fundingMode">
            <el-option label="Flash Loan" value="flash_loan" />
            <el-option label="Self funded" value="self_funded" />
          </el-select>
        </label>
        <label class="settings-field">
          <span>套利强度</span>
          <el-select v-model="settingsForm.arbitrageIntensity">
            <el-option label="保守" value="conservative" />
            <el-option label="加强" value="enhanced" />
            <el-option label="激进" value="aggressive" />
          </el-select>
        </label>
        <label class="settings-field">
          <span>单次金额授权</span>
          <el-input v-model="settingsForm.singleTradeAuthAmountUsdt" inputmode="decimal" placeholder="100">
            <template #suffix>USDT</template>
          </el-input>
        </label>
        <label class="settings-field">
          <span>启动检测</span>
          <el-select v-model="settingsForm.startupDetectionMode">
            <el-option label="自动" value="auto" />
            <el-option label="手动" value="manual" />
          </el-select>
        </label>
        <label class="settings-field">
          <span>WSS 纠错</span>
          <el-select v-model="settingsForm.wssCorrectionMode">
            <el-option label="启动" value="enabled" />
            <el-option label="关闭" value="disabled" />
          </el-select>
        </label>
        <label class="settings-field">
          <span>端口设置</span>
          <el-input v-model="settingsForm.dashboardPort" inputmode="numeric" placeholder="4310" />
        </label>
        <label class="settings-field">
          <span>启动音效</span>
          <el-select v-model="settingsForm.launchSoundMode">
            <el-option label="打开音效" value="enabled" />
            <el-option label="关闭音效" value="disabled" />
          </el-select>
        </label>
        <label class="settings-field">
          <span>界面语言</span>
          <el-select v-model="settingsForm.language">
            <el-option label="简体中文" value="zh" />
          </el-select>
        </label>
      </div>

      <div v-else-if="settingsSection === 'credentials'" class="settings-form-grid">
        <label class="settings-field is-full">
          <span>凭证管理</span>
          <el-select v-model="settingsForm.credentialAuthMode">
            <el-option label="单次" value="single" />
            <el-option label="多次循环" value="loop" />
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
            :type="secretInputType"
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
            <strong>{{ field.label ?? field.env }}</strong>
            <small>{{ field.env }}</small>
          </span>
          <el-input
            v-model="settingsForm.feeds[field.key]"
            :type="field.secret ? secretInputType : 'text'"
            :placeholder="field.placeholder ?? 'https://...'"
            :autocomplete="field.secret ? 'new-password' : 'off'"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          />
        </label>
      </div>

      <div v-else-if="settingsSection === 'queue'" class="settings-form-grid">
        <label v-for="field in queueFields" :key="field.key" class="settings-field" :class="{ 'is-full': field.full }">
          <span class="settings-field-meta">
            <strong>{{ field.label ?? field.env }}</strong>
            <small>{{ field.env }}</small>
          </span>
          <el-input
            v-model="settingsForm.queue[field.key]"
            :type="field.secret ? secretInputType : 'text'"
            :placeholder="field.placeholder"
            :autocomplete="field.secret ? 'new-password' : 'off'"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
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
              <el-input
                v-model="settingsForm.exchanges[exchange.key].apiKey"
                :type="secretInputType"
                placeholder="public key"
                autocomplete="new-password"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
              />
            </label>
            <label class="settings-field">
              <span>{{ exchange.secretEnv }}</span>
              <el-input
                v-model="settingsForm.exchanges[exchange.key].secretKey"
                :type="secretInputType"
                placeholder="secret key"
                autocomplete="new-password"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
              />
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
import { CircleCheck, Hide, SwitchButton, View } from "@element-plus/icons-vue";

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
  settingsSecurityChecking: boolean;
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
  "security-check": [];
  save: [];
  logout: [];
}>();
</script>

<style scoped src="./SettingsView.css"></style>
