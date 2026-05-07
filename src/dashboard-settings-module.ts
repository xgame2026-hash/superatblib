export const DASHBOARD_SETTINGS_PAGE = String.raw`
          <section id="pageSettings" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="settingsPageTitle" class="page-title">System setup</div>
                  <div id="settingsPageSub" class="page-sub">Manage RPC endpoints and specialized service configuration.</div>
                </div>
              </div>
            </div>

            <div class="settings-layout">
              <article class="panel">
                <div class="panel-inner">
                  <div class="panel-head">
                    <div>
                      <div id="settingsMenuTitle" class="panel-title">General Settings</div>
                      <div id="settingsMenuSub" class="panel-sub">Choose a configuration area.</div>
                    </div>
                  </div>
                  <div class="settings-menu">
                    <button id="settingsSectionGeneral" class="ghost-button" type="button">General</button>
                    <button id="settingsSectionExchanges" class="ghost-button" type="button">Exchanges</button>
                  </div>
                </div>
              </article>

              <article class="panel">
                <div class="panel-inner">
                  <div class="panel-head">
                    <div>
                      <div id="settingsPanelTitle" class="panel-title">General Settings</div>
                      <div id="settingsPanelSub" class="panel-sub"></div>
                    </div>
                    <div class="settings-panel-actions">
                      <button id="toggleSettingsVisibilityButton" class="action-button settings-action-button" type="button">
                        <span class="action-button-content">
                          <img id="toggleSettingsVisibilityIcon" class="action-button-icon" src="/img/eye-empty.svg" alt="" aria-hidden="true" />
                          <span id="toggleSettingsVisibilityLabel" class="action-button-label">显示</span>
                        </span>
                      </button>
                      <button id="saveSettingsButton" class="action-button primary settings-action-button" type="button">
                        <span class="action-button-content">
                          <img class="action-button-icon" src="/img/save.svg" alt="" aria-hidden="true" />
                          <span id="saveSettingsButtonLabel" class="action-button-label">保存</span>
                        </span>
                      </button>
                    </div>
                  </div>

                  <div id="settingsGeneralFields" class="settings-form-grid">
                    <label class="field full">
                      <span id="settingsPrivateKeyLabel" class="field-label">PRIVATE_KEY</span>
                      <input id="settingsPrivateKey" class="settings-input" type="text" placeholder="0x..." />
                    </label>
                    <label class="field full">
                      <span id="settingsEthereumRpcLabel" class="field-label">ETHEREUM_RPC_URL</span>
                      <input id="settingsEthereumRpc" class="settings-input" type="text" placeholder="https://..." />
                    </label>
                    <label class="field full">
                      <span id="settingsBnbRpcLabel" class="field-label">BNB_RPC_URL</span>
                      <input id="settingsBnbRpc" class="settings-input" type="text" placeholder="https://..." />
                    </label>
                    <label class="field full">
                      <span id="settingsArbitrumRpcLabel" class="field-label">ARBITRUM_RPC_URL</span>
                      <input id="settingsArbitrumRpc" class="settings-input" type="text" placeholder="https://..." />
                    </label>
                    <label class="field full">
                      <span id="settingsBaseRpcLabel" class="field-label">BASE_RPC_URL</span>
                      <input id="settingsBaseRpc" class="settings-input" type="text" placeholder="https://..." />
                    </label>
                    <label class="field full">
                      <span id="settingsPolygonRpcLabel" class="field-label">POLYGON_RPC_URL</span>
                      <input id="settingsPolygonRpc" class="settings-input" type="text" placeholder="https://..." />
                    </label>
                    <label class="field">
                      <span id="settingsFundingModeLabel" class="field-label">Funding mode</span>
                      <span class="settings-select-wrap">
                        <select id="settingsFundingMode">
                          <option value="flash_loan">Flash loan</option>
                          <option value="self_funded">Self funded</option>
                        </select>
                      </span>
                    </label>
                    <label class="field">
                      <span id="settingsLanguageLabel" class="field-label">Language</span>
                      <span class="settings-select-wrap">
                        <select id="settingsLanguage">
                          <option value="zh">简体中文</option>
                          <option value="en">English</option>
                        </select>
                      </span>
                    </label>
                  </div>

                  <div id="settingsExchangeFields" class="settings-form-grid" style="display:none;">
                    <label class="field full">
                      <span id="settingsArbitrageVenuesLabel" class="field-label">Arbitrage venues</span>
                      <input id="settingsArbitrageVenues" class="settings-input" type="text" placeholder="binance,okx,bitget,mexc,gate" />
                    </label>

                    <div class="field full">
                      <span id="settingsExchangeKeysLabel" class="field-label">Exchange API Keys</span>
                    </div>

                    <label class="field">
                      <span id="settingsBinanceApiKeyLabel" class="field-label">Binance API Key</span>
                      <input id="settingsBinanceApiKey" class="settings-input" type="text" placeholder="public key" />
                    </label>
                    <label class="field">
                      <span id="settingsBinanceSecretKeyLabel" class="field-label">Binance Secret Key</span>
                      <input id="settingsBinanceSecretKey" class="settings-input" type="text" placeholder="secret key" />
                    </label>

                    <label class="field">
                      <span id="settingsOkxApiKeyLabel" class="field-label">OKX API Key</span>
                      <input id="settingsOkxApiKey" class="settings-input" type="text" placeholder="public key" />
                    </label>
                    <label class="field">
                      <span id="settingsOkxSecretKeyLabel" class="field-label">OKX Secret Key</span>
                      <input id="settingsOkxSecretKey" class="settings-input" type="text" placeholder="secret key" />
                    </label>

                    <label class="field">
                      <span id="settingsBitgetApiKeyLabel" class="field-label">Bitget API Key</span>
                      <input id="settingsBitgetApiKey" class="settings-input" type="text" placeholder="public key" />
                    </label>
                    <label class="field">
                      <span id="settingsBitgetSecretKeyLabel" class="field-label">Bitget Secret Key</span>
                      <input id="settingsBitgetSecretKey" class="settings-input" type="text" placeholder="secret key" />
                    </label>

                    <label class="field">
                      <span id="settingsMexcApiKeyLabel" class="field-label">MEXC API Key</span>
                      <input id="settingsMexcApiKey" class="settings-input" type="text" placeholder="public key" />
                    </label>
                    <label class="field">
                      <span id="settingsMexcSecretKeyLabel" class="field-label">MEXC Secret Key</span>
                      <input id="settingsMexcSecretKey" class="settings-input" type="text" placeholder="secret key" />
                    </label>

                    <label class="field">
                      <span id="settingsGateApiKeyLabel" class="field-label">Gate API Key</span>
                      <input id="settingsGateApiKey" class="settings-input" type="text" placeholder="public key" />
                    </label>
                    <label class="field">
                      <span id="settingsGateSecretKeyLabel" class="field-label">Gate Secret Key</span>
                      <input id="settingsGateSecretKey" class="settings-input" type="text" placeholder="secret key" />
                    </label>
                  </div>

                  <div id="settingsFoot" class="footer-bar">
                    <span id="settingsFileHint">.env</span>
                    <span id="settingsSaveState">idle</span>
                  </div>
                </div>
              </article>
            </div>
          </section>
`;
