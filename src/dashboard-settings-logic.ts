export const DASHBOARD_SETTINGS_LOGIC = String.raw`
      function maskedSettingsValue(value) {
        const raw = String(value || '');
        if (!raw) return '';
        return '*'.repeat(Math.max(8, Math.min(raw.length, 36)));
      }

      function captureVisibleSensitiveSettings() {
        SENSITIVE_SETTINGS_FIELD_IDS.forEach(function (id) {
          const input = document.getElementById(id);
          if (!input) return;
          state.settingsRawValues[id] = input.value || '';
        });
      }

      function applySensitiveSettingsVisibility() {
        SENSITIVE_SETTINGS_FIELD_IDS.forEach(function (id) {
          const input = document.getElementById(id);
          if (!input) return;
          const rawValue = state.settingsRawValues[id] || '';
          if (state.settingsMasked) {
            input.value = maskedSettingsValue(rawValue);
            input.readOnly = true;
            input.classList.add('is-masked');
          } else {
            input.value = rawValue;
            input.readOnly = false;
            input.classList.remove('is-masked');
          }
        });
        const icon = document.getElementById('toggleSettingsVisibilityIcon');
        if (icon) {
          icon.setAttribute('src', state.settingsMasked ? '/img/eye-empty.svg' : '/img/eye-off.svg');
        }
        text('toggleSettingsVisibilityLabel', state.settingsMasked ? t('settingsShowSecrets') : t('settingsHideSecrets'));
      }

      function toggleSensitiveSettingsVisibility() {
        if (!state.settingsMasked) {
          captureVisibleSensitiveSettings();
        }
        state.settingsMasked = !state.settingsMasked;
        applySensitiveSettingsVisibility();
      }

      function readSensitiveSettingsValue(id) {
        const input = document.getElementById(id);
        if (!input) return '';
        return state.settingsMasked ? String(state.settingsRawValues[id] || '').trim() : input.value.trim();
      }

      function setInputValue(id, value) {
        const input = document.getElementById(id);
        if (input) input.value = value || '';
      }

      function parseArbitrageVenueSelection(value) {
        const allowed = ['binance', 'okx', 'bitget', 'mexc', 'gate'];
        if (typeof value !== 'string') return [];
        return Array.from(new Set(
          value
            .split(/[\\n,]/)
            .map(function (item) { return String(item || '').trim().toLowerCase(); })
            .filter(function (item) { return allowed.indexOf(item) >= 0; })
        ));
      }

      function arbitrageVenueLabel(key) {
        if (key === 'okx') return 'OKX';
        if (key === 'bitget') return 'Bitget';
        if (key === 'mexc') return 'MEXC';
        if (key === 'gate') return 'Gate';
        return 'Binance';
      }

      function resolveConfiguredArbitrageVenues(settings) {
        const configured = settings && typeof settings.arbitrageVenues === 'string'
          ? settings.arbitrageVenues
          : '';
        const fallback = configured || state.arbitrageForm.venues || 'binance,okx,bitget,mexc,gate';
        return parseArbitrageVenueSelection(fallback);
      }

      function executionMarketSelectOptions() {
        const configured = executionMarketsFromConfig().map(function (market) {
          return {
            value: String(market.key),
            label: String(market.label),
            chain: String(market.chain)
          };
        });
        if (configured.length > 0) {
          const ethereumMarkets = configured.filter(function (market) {
            return market.chain === 'ethereum';
          });
          if (ethereumMarkets.length > 1) {
            return [{ value: 'auto-ethereum', label: 'Auto Rotation / Ethereum' }].concat(
              configured.map(function (market) {
                return { value: market.value, label: market.label };
              })
            );
          }
          return configured.map(function (market) {
            return { value: market.value, label: market.label };
          });
        }
        return [
          { value: 'auto-ethereum', label: 'Auto Rotation / Ethereum' },
          { value: 'aave-v3-ethereum', label: 'Aave V3 / Ethereum' },
          { value: 'spark-ethereum', label: 'SparkLend / Ethereum' },
          { value: 'aave-v3-arbitrum', label: 'Aave V3 / Arbitrum' },
          { value: 'aave-v3-polygon', label: 'Aave V3 / Polygon' },
          { value: 'aave-v3-bnb', label: 'Aave V3 / BNB Chain' }
        ];
      }

      function syncSelectOptions(id, options, fallbackValue) {
        const select = document.getElementById(id);
        if (!select) return;
        const safeOptions = Array.isArray(options) ? options : [];
        const nextValue = safeOptions.some(function (option) { return option.value === fallbackValue; })
          ? fallbackValue
          : (safeOptions[0] ? safeOptions[0].value : '');
        const nextMarkup = safeOptions.map(function (option) {
          return '<option value="' + escapeHtml(option.value) + '">' + escapeHtml(option.label) + '</option>';
        }).join('');
        if (select.innerHTML !== nextMarkup) {
          select.innerHTML = nextMarkup;
        }
        if (nextValue) {
          select.value = nextValue;
        }
      }

      function syncExecutionMarketSelectOptions() {
        const options = executionMarketSelectOptions();
        const settingsWrapper = state.data.settings;
        const settings = settingsWrapper && settingsWrapper.settings ? settingsWrapper.settings : null;
        syncSelectOptions('marketSelect', options, state.form.market || 'aave-v3-ethereum');
        syncSelectOptions(
          'settingsDefaultMarket',
          options.filter(function (option) { return option.value !== 'auto-ethereum'; }),
          settings && settings.market ? settings.market : (state.form.market || 'aave-v3-ethereum')
        );
      }

      async function saveSettings() {
        if (!state.settingsMasked) {
          captureVisibleSensitiveSettings();
        }
        const section = state.settingsSection === 'exchanges'
          ? 'exchanges'
          : (state.settingsSection === 'morpho' ? 'morpho' : 'general');
        let payload;
        if (section === 'exchanges') {
          payload = {
            arbitrageVenues: readSensitiveSettingsValue('settingsArbitrageVenues'),
            exchanges: {
              binance: {
                apiKey: readSensitiveSettingsValue('settingsBinanceApiKey'),
                secretKey: readSensitiveSettingsValue('settingsBinanceSecretKey')
              },
              okx: {
                apiKey: readSensitiveSettingsValue('settingsOkxApiKey'),
                secretKey: readSensitiveSettingsValue('settingsOkxSecretKey')
              },
              bitget: {
                apiKey: readSensitiveSettingsValue('settingsBitgetApiKey'),
                secretKey: readSensitiveSettingsValue('settingsBitgetSecretKey')
              },
              mexc: {
                apiKey: readSensitiveSettingsValue('settingsMexcApiKey'),
                secretKey: readSensitiveSettingsValue('settingsMexcSecretKey')
              },
              gate: {
                apiKey: readSensitiveSettingsValue('settingsGateApiKey'),
                secretKey: readSensitiveSettingsValue('settingsGateSecretKey')
              }
            }
          };
        } else if (section === 'morpho') {
          payload = {
            morpho: {
              ethereumRpcUrl: readSensitiveSettingsValue('settingsMorphoEthereumRpc'),
              baseRpcUrl: readSensitiveSettingsValue('settingsMorphoBaseRpc'),
              privateRelayUrl: readSensitiveSettingsValue('settingsMorphoPrivateRelay'),
              marketId: document.getElementById('settingsMorphoMarketId').value.trim(),
              signal: document.getElementById('settingsMorphoSignal').value,
              hfMax: document.getElementById('settingsMorphoHfMax').value.trim()
            }
          };
        } else {
          payload = {
            ethereumRpcUrl: readSensitiveSettingsValue('settingsEthereumRpc'),
            baseRpcUrl: readSensitiveSettingsValue('settingsBaseRpc'),
            chains: {
              ethereum: {
                rpcUrl: readSensitiveSettingsValue('settingsEthereumRpc')
              },
              bnb: {
                rpcUrl: readSensitiveSettingsValue('settingsBnbRpc')
              },
              arbitrum: {
                rpcUrl: readSensitiveSettingsValue('settingsArbitrumRpc')
              },
              polygon: {
                rpcUrl: readSensitiveSettingsValue('settingsPolygonRpc')
              }
            }
          };
        }

        text('settingsSaveState', 'saving...');
        try {
          await fetchJson('/api/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (payload.language) {
            setLanguage(payload.language);
          }
          await loadData();
          renderAll();
          text('settingsSaveState', 'saved');
        } catch (error) {
          text('settingsSaveState', 'failed');
          openModal(t('settingsSaveFailed'), String(error));
        }
      }

      function renderSettings() {
        const settingsWrapper = state.data.settings;
        const settings = settingsWrapper && settingsWrapper.settings ? settingsWrapper.settings : null;
        if (!settings) return;
        const exchangeSettings = settings.exchanges || {
          binance: { apiKey: '', secretKey: '' },
          okx: { apiKey: '', secretKey: '' },
          bitget: { apiKey: '', secretKey: '' },
          mexc: { apiKey: '', secretKey: '' },
          gate: { apiKey: '', secretKey: '' }
        };

        state.settingsRawValues.settingsPrivateKey = settings.privateKey || '';
        state.settingsRawValues.settingsBitqueryApiKey = settings.bitqueryApiKey || '';
        state.settingsRawValues.settingsZeroExApiKey = settings.zeroExApiKey || '';
        state.settingsRawValues.settingsQuickNodeApiKey = settings.quicknodeAdminApiKey || '';
        state.settingsRawValues.settingsControlRpc = settings.controlRpcUrl || '';
        state.settingsRawValues.settingsExecutionRpc = settings.executionRpcUrl || '';
        state.settingsRawValues.settingsFlashbotsRelay = settings.flashbotsRelayUrl || '';
        state.settingsRawValues.settingsFlashbotsAuth = settings.flashbotsAuthPrivateKey || '';
        state.settingsRawValues.settingsArbitrageVenues = settings.arbitrageVenues || '';
        state.settingsRawValues.settingsEthereumRpc = settings.ethereumRpcUrl || '';
        state.settingsRawValues.settingsEthereumContract = settings.chains.ethereum.liquidatorContract || '';
        state.settingsRawValues.settingsSparkContract = settings.markets['spark-ethereum']
          ? (settings.markets['spark-ethereum'].liquidatorContract || '')
          : '';
        state.settingsRawValues.settingsPolygonRpc = settings.chains.polygon.rpcUrl || '';
        state.settingsRawValues.settingsPolygonContract = settings.chains.polygon.liquidatorContract || '';
        state.settingsRawValues.settingsArbitrumRpc = settings.chains.arbitrum.rpcUrl || '';
        state.settingsRawValues.settingsArbitrumContract = settings.chains.arbitrum.liquidatorContract || '';
        state.settingsRawValues.settingsBnbRpc = settings.chains.bnb.rpcUrl || '';
        state.settingsRawValues.settingsBnbContract = settings.chains.bnb.liquidatorContract || '';
        state.settingsRawValues.settingsBinanceApiKey = exchangeSettings.binance.apiKey || '';
        state.settingsRawValues.settingsBinanceSecretKey = exchangeSettings.binance.secretKey || '';
        state.settingsRawValues.settingsOkxApiKey = exchangeSettings.okx.apiKey || '';
        state.settingsRawValues.settingsOkxSecretKey = exchangeSettings.okx.secretKey || '';
        state.settingsRawValues.settingsBitgetApiKey = exchangeSettings.bitget.apiKey || '';
        state.settingsRawValues.settingsBitgetSecretKey = exchangeSettings.bitget.secretKey || '';
        state.settingsRawValues.settingsMexcApiKey = exchangeSettings.mexc.apiKey || '';
        state.settingsRawValues.settingsMexcSecretKey = exchangeSettings.mexc.secretKey || '';
        state.settingsRawValues.settingsGateApiKey = exchangeSettings.gate.apiKey || '';
        state.settingsRawValues.settingsGateSecretKey = exchangeSettings.gate.secretKey || '';
        state.settingsRawValues.settingsMorphoEthereumRpc = settings.morpho && settings.morpho.ethereumRpcUrl
          ? settings.morpho.ethereumRpcUrl
          : '';
        state.settingsRawValues.settingsMorphoBaseRpc = settings.morpho && settings.morpho.baseRpcUrl
          ? settings.morpho.baseRpcUrl
          : '';
        state.settingsRawValues.settingsMorphoPrivateRelay = settings.morpho && settings.morpho.privateRelayUrl
          ? settings.morpho.privateRelayUrl
          : '';
        state.settingsRawValues.settingsBaseRpc = settings.baseRpcUrl || '';
        applySensitiveSettingsVisibility();
        setInputValue('settingsDefaultMarket', settings.market || 'aave-v3-ethereum');
        setInputValue('settingsBroadcastTransport', settings.broadcastTransport || 'flashbots_bundle');
        setInputValue('settingsFundingMode', settings.fundingMode || 'flash_loan');
        setInputValue('settingsLanguage', settings.language || state.language);
        setInputValue('settingsExecutionLimit', settings.limit || state.form.limit || '50');
        document.getElementById('settingsMorphoMarketId').value = settings.morpho && settings.morpho.marketId
          ? settings.morpho.marketId
          : '';
        document.getElementById('settingsMorphoSignal').value = settings.morpho && typeof settings.morpho.signal === 'string'
          ? settings.morpho.signal
          : '';
        document.getElementById('settingsMorphoHfMax').value = settings.morpho && settings.morpho.hfMax
          ? settings.morpho.hfMax
          : (state.form.hfMax || '1.05');
        text('settingsFileHint', settingsWrapper.file || '.env');

        const section = state.settingsSection === 'exchanges'
          ? 'exchanges'
          : (state.settingsSection === 'morpho' ? 'morpho' : 'general');
        const generalButton = document.getElementById('settingsSectionGeneral');
        const exchangeButton = document.getElementById('settingsSectionExchanges');
        const morphoButton = document.getElementById('settingsSectionMorpho');
        const generalFields = document.getElementById('settingsGeneralFields');
        const exchangeFields = document.getElementById('settingsExchangeFields');
        const morphoFields = document.getElementById('settingsMorphoFields');
        if (generalButton) generalButton.classList.toggle('is-active', section === 'general');
        if (exchangeButton) exchangeButton.classList.toggle('is-active', section === 'exchanges');
        if (morphoButton) morphoButton.classList.toggle('is-active', section === 'morpho');
        if (generalFields) generalFields.style.display = section === 'general' ? 'grid' : 'none';
        if (exchangeFields) exchangeFields.style.display = section === 'exchanges' ? 'grid' : 'none';
        if (morphoFields) morphoFields.style.display = section === 'morpho' ? 'grid' : 'none';
      }
`;
