export const DASHBOARD_SETTINGS_PAGE = String.raw`
          <section id="pageSettings" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="settingsPageTitle" class="page-title">System setup</div>
                  <div id="settingsPageSub" class="page-sub">Manage RPC endpoints, private key, chain defaults, language, and chain-specific contracts.</div>
                </div>
              </div>
            </div>

            <div class="settings-layout">
              <article class="panel">
                <div class="panel-inner">
                  <div class="panel-head">
                    <div>
                      <div id="settingsMenuTitle" class="panel-title">General Settings</div>
                      <div id="settingsMenuSub" class="panel-sub">System-wide configuration and defaults.</div>
                    </div>
                  </div>
                  <div class="settings-menu">
                    <button id="settingsSectionGeneral" class="ghost-button" type="button">General</button>
                    <button id="settingsSectionExchanges" class="ghost-button" type="button">Exchanges</button>
                    <button id="settingsSectionMorpho" class="ghost-button" type="button">Morpho</button>
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
                    <label class="field full settings-field-hidden">
                      <span id="settingsPrivateKeyLabel" class="field-label">Private key</span>
                      <input id="settingsPrivateKey" class="settings-input" type="text" placeholder="0x..." />
                    </label>

                    <label class="field full">
                      <span id="settingsBitqueryApiKeyLabel" class="field-label">Bitquery Access Token</span>
                      <input id="settingsBitqueryApiKey" class="settings-input" type="text" placeholder="BQY_..." />
                    </label>

                    <label class="field full">
                      <span id="settingsZeroExApiKeyLabel" class="field-label">0x API Key</span>
                      <input id="settingsZeroExApiKey" class="settings-input" type="text" placeholder="0x_live_..." />
                    </label>

                    <label class="field full">
                      <span id="settingsQuickNodeApiKeyLabel" class="field-label">QuickNode Admin API Key</span>
                      <input id="settingsQuickNodeApiKey" class="settings-input" type="text" placeholder="qk_..." />
                    </label>
                    <label class="field full">
                      <span id="settingsControlRpcLabel" class="field-label">Control RPC URL</span>
                      <input id="settingsControlRpc" class="settings-input" type="text" />
                    </label>
                    <label class="field full">
                      <span id="settingsExecutionRpcLabel" class="field-label">Execution RPC URL</span>
                      <input id="settingsExecutionRpc" class="settings-input" type="text" />
                    </label>
                    <label class="field full">
                      <span id="settingsEthereumRpcLabel" class="field-label">Ethereum Chain RPC URL</span>
                      <input id="settingsEthereumRpc" class="settings-input" type="text" />
                    </label>
                    <label class="field full">
                      <span id="settingsFlashbotsRelayLabel" class="field-label">Flashbots Relay URL</span>
                      <input id="settingsFlashbotsRelay" class="settings-input" type="text" />
                    </label>
                    <label class="field full">
                      <span id="settingsFlashbotsAuthLabel" class="field-label">Flashbots Auth Private Key</span>
                      <input id="settingsFlashbotsAuth" class="settings-input" type="text" placeholder="0x..." />
                    </label>
                    <label class="field">
                      <span id="settingsBroadcastTransportLabel" class="field-label">Broadcast transport</span>
                      <span class="settings-select-wrap">
                        <select id="settingsBroadcastTransport">
                          <option value="flashbots_bundle">Flashbots bundle</option>
                          <option value="public_mempool">Public mempool</option>
                        </select>
                      </span>
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

                    <label class="field full">
                      <span id="settingsEthereumContractLabel" class="field-label">Aave Ethereum contract</span>
                      <input id="settingsEthereumContract" class="settings-input" type="text" />
                    </label>

                    <label class="field">
                      <span id="settingsDefaultMarketLabel" class="field-label">Default execution market</span>
                      <span class="settings-select-wrap">
                        <select id="settingsDefaultMarket">
                          <option value="aave-v3-ethereum">Aave V3 / Ethereum</option>
                          <option value="spark-ethereum">SparkLend / Ethereum</option>
                          <option value="aave-v3-arbitrum">Aave V3 / Arbitrum</option>
                          <option value="aave-v3-polygon">Aave V3 / Polygon</option>
                          <option value="aave-v3-bnb">Aave V3 / BNB Chain</option>
                        </select>
                      </span>
                    </label>
                    <label class="field">
                      <span id="settingsSparkContractLabel" class="field-label">Spark liquidator contract</span>
                      <input id="settingsSparkContract" class="settings-input" type="text" />
                    </label>

                    <label class="field">
                      <span id="settingsPolygonRpcLabel" class="field-label">Polygon RPC URL</span>
                      <input id="settingsPolygonRpc" class="settings-input" type="text" />
                    </label>
                    <label class="field">
                      <span id="settingsPolygonContractLabel" class="field-label">Polygon liquidator contract</span>
                      <input id="settingsPolygonContract" class="settings-input" type="text" />
                    </label>

                    <label class="field">
                      <span id="settingsArbitrumRpcLabel" class="field-label">Arbitrum RPC URL</span>
                      <input id="settingsArbitrumRpc" class="settings-input" type="text" />
                    </label>
                    <label class="field">
                      <span id="settingsArbitrumContractLabel" class="field-label">Arbitrum liquidator contract</span>
                      <input id="settingsArbitrumContract" class="settings-input" type="text" />
                    </label>

                    <label class="field">
                      <span id="settingsBnbRpcLabel" class="field-label">BNB RPC URL</span>
                      <input id="settingsBnbRpc" class="settings-input" type="text" />
                    </label>
                    <label class="field">
                      <span id="settingsBnbContractLabel" class="field-label">BNB liquidator contract</span>
                      <input id="settingsBnbContract" class="settings-input" type="text" />
                    </label>

                    <label class="field">
                      <span id="settingsExecutionLimitLabel" class="field-label">Target count</span>
                      <input id="settingsExecutionLimit" class="settings-input" type="text" inputmode="numeric" />
                    </label>
                    <label class="field">
                      <span id="settingsDefaultChainLabel" class="field-label">Default chain</span>
                      <span class="settings-select-wrap">
                        <select id="settingsDefaultChain">
                          <option value="ethereum">Ethereum</option>
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

                  <div id="settingsMorphoFields" class="settings-form-grid" style="display:none;">
                    <label class="field full">
                      <span id="settingsMorphoEthereumRpcLabel" class="field-label">Morpho Ethereum RPC</span>
                      <input id="settingsMorphoEthereumRpc" class="settings-input" type="text" placeholder="https://..." />
                    </label>

                    <label class="field full">
                      <span id="settingsMorphoBaseRpcLabel" class="field-label">Morpho Base RPC</span>
                      <input id="settingsMorphoBaseRpc" class="settings-input" type="text" placeholder="https://..." />
                    </label>

                    <label class="field full">
                      <span id="settingsMorphoPrivateRelayLabel" class="field-label">Morpho private relay</span>
                      <input id="settingsMorphoPrivateRelay" class="settings-input" type="text" placeholder="https://..." />
                    </label>

                    <label class="field full">
                      <span id="settingsMorphoMarketIdLabel" class="field-label">Morpho marketId</span>
                      <input id="settingsMorphoMarketId" class="settings-input" type="text" placeholder="0x... optional" />
                    </label>

                    <label class="field">
                      <span id="settingsMorphoSignalLabel" class="field-label">Morpho signal</span>
                      <span class="settings-select-wrap">
                        <select id="settingsMorphoSignal">
                          <option value="">All signals</option>
                          <option value="liquidatable">Liquidatable</option>
                          <option value="near-liquidation">Near liquidation</option>
                          <option value="risky">Low HF</option>
                        </select>
                      </span>
                    </label>

                    <label class="field">
                      <span id="settingsMorphoHfMaxLabel" class="field-label">Max HF</span>
                      <input id="settingsMorphoHfMax" class="settings-input" type="text" inputmode="decimal" />
                    </label>
                  </div>

                  <div id="settingsFoot" class="footer-bar">
                    <span id="settingsFileHint">.env.local</span>
                    <span id="settingsSaveState">idle</span>
                  </div>
                </div>
              </article>
            </div>
          </section>
`;
