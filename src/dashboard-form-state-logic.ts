export const DASHBOARD_FORM_STATE_LOGIC = String.raw`
      function applyLanguagePreferenceFromSettings() {
        const settings = state.data.settings && state.data.settings.settings ? state.data.settings.settings : null;
        const preferred = settings && settings.language ? settings.language : null;
        if (!preferred) return;
        state.language = preferred === 'zh' ? 'zh' : 'en';
        localStorage.setItem('dashboard-language', state.language);
        document.documentElement.lang = state.language === 'zh' ? 'zh-CN' : 'en';
      }

      function preferredConsoleMarket(settings) {
        if (!settings) return state.form.market || 'aave-v3-ethereum';
        return settings.market || state.form.market || 'aave-v3-ethereum';
      }

      function executionMarketsFromConfig() {
        const config = state.data && state.data.config ? state.data.config : null;
        if (!config || !Array.isArray(config.executionMarkets)) {
          return [];
        }
        return config.executionMarkets.filter(function (item) {
          return item && typeof item.key === 'string' && typeof item.label === 'string' && typeof item.chain === 'string';
        });
      }

      function inferExecutionChainFromMarketSelection(value) {
        const normalized = String(value || '').trim().toLowerCase();
        if (!normalized || normalized === 'auto-ethereum' || normalized === 'auto') {
          return 'ethereum';
        }
        const matched = executionMarketsFromConfig().find(function (item) {
          return String(item.key || '').toLowerCase() === normalized;
        });
        return matched && matched.chain ? matched.chain : 'ethereum';
      }

      function preferredConsoleChain(settings) {
        return inferExecutionChainFromMarketSelection(preferredConsoleMarket(settings));
      }

      function hydrateFormFromSettings(options) {
        const settingsWrapper = state.data.settings;
        const settings = settingsWrapper && settingsWrapper.settings ? settingsWrapper.settings : null;
        if (!settings) return;
        const preserveChain = Boolean(options && options.preserveChain);
        const nextMarket = preferredConsoleMarket(settings);
        state.form.market = preserveChain ? (state.form.market || nextMarket) : nextMarket;
        state.form.chain = preserveChain
          ? inferExecutionChainFromMarketSelection(state.form.market || nextMarket)
          : preferredConsoleChain(settings);
        state.form.lookbackBlocks = defaultExecutionLookbackForChain(state.form.chain);
        state.form.limit = settings.limit || state.form.limit;
        state.form.minNetProfit = settings.minNetProfit || state.form.minNetProfit;
        state.form.morphoMarketId = settings.morpho && typeof settings.morpho.marketId === 'string'
          ? settings.morpho.marketId
          : state.form.morphoMarketId;
        state.form.morphoKind = settings.morpho && typeof settings.morpho.signal === 'string'
          ? settings.morpho.signal
          : state.form.morphoKind;
        state.form.hfMax = settings.morpho && typeof settings.morpho.hfMax === 'string'
          ? settings.morpho.hfMax
          : state.form.hfMax;

        const chainSettings = settings.chains && settings.chains[state.form.chain];
        state.form.rpcUrl =
          state.form.chain === 'ethereum'
            ? (
              settings.controlRpcUrl
              || (chainSettings && chainSettings.rpcUrl ? chainSettings.rpcUrl : '')
            )
            : (chainSettings && chainSettings.rpcUrl ? chainSettings.rpcUrl : '');
        const marketSettings = settings.markets && settings.markets[state.form.market];
        state.form.contract = marketSettings && marketSettings.liquidatorContract
          ? marketSettings.liquidatorContract
          : (chainSettings && chainSettings.liquidatorContract ? chainSettings.liquidatorContract : '');
      }

      function liveStateArbitrageToken() {
        const liveState = state.data.liveState && state.data.liveState.state ? state.data.liveState.state : null;
        const arbitrage = liveState && liveState.arbitrage && typeof liveState.arbitrage === 'object'
          ? liveState.arbitrage
          : null;
        return normalizeArbitrageTokenPreference(arbitrage && typeof arbitrage.token === 'string' ? arbitrage.token : '');
      }

      function hydrateArbitrageFormFromState() {
        const preferredToken =
          readStoredArbitrageToken()
          || liveStateArbitrageToken()
          || normalizeArbitrageTokenPreference(state.arbitrageForm.token || '')
          || DEFAULT_ARBITRAGE_TOKEN_LIST;
        state.arbitrageForm.token = preferredToken;
        persistArbitrageTokenPreference(preferredToken);
      }

      function txGraphDefaultRpc(chain) {
        const settingsWrapper = state.data.settings;
        const settings = settingsWrapper && settingsWrapper.settings ? settingsWrapper.settings : null;
        if (chain === 'ethereum') {
          return settings
            ? (settings.controlRpcUrl || settings.ethereumRpcUrl || '')
            : '';
        }
        const chainSettings = settings && settings.chains ? settings.chains[chain] : null;
        return chainSettings && chainSettings.rpcUrl ? chainSettings.rpcUrl : '';
      }

      function txGraphConfiguredRpcValues() {
        const settingsWrapper = state.data.settings;
        const settings = settingsWrapper && settingsWrapper.settings ? settingsWrapper.settings : null;
        const values = [];
        if (settings && settings.controlRpcUrl) {
          values.push(settings.controlRpcUrl);
        }
        if (settings && settings.ethereumRpcUrl) {
          values.push(settings.ethereumRpcUrl);
        }
        if (settings && settings.chains) {
          Object.keys(settings.chains).forEach(function (chain) {
            const rpcUrl = settings.chains[chain] && settings.chains[chain].rpcUrl
              ? settings.chains[chain].rpcUrl
              : '';
            if (rpcUrl) {
              values.push(rpcUrl);
            }
          });
        }
        return Array.from(new Set(values));
      }

      function syncTxGraphRpcFromConfig(options) {
        const force = Boolean(options && options.force);
        const configuredRpc = txGraphDefaultRpc(state.txGraph.chain);
        if (!configuredRpc) return;
        if (force || !state.txGraph.rpcUrl || txGraphConfiguredRpcValues().includes(state.txGraph.rpcUrl)) {
          state.txGraph.rpcUrl = configuredRpc;
        }
      }

      function applyTxGraphFormToInputs() {
        const hashInput = document.getElementById('txGraphHashInput');
        const chainSelect = document.getElementById('txGraphChainSelect');
        const rpcInput = document.getElementById('txGraphRpcInput');
        const transfersToggle = document.getElementById('txGraphTransfersToggle');
        const callsToggle = document.getElementById('txGraphCallsToggle');
        const refsToggle = document.getElementById('txGraphReferencesToggle');
        syncTxGraphRpcFromConfig();
        if (hashInput) hashInput.value = state.txGraph.hash || '';
        if (chainSelect) chainSelect.value = state.txGraph.chain || 'ethereum';
        if (rpcInput) rpcInput.value = state.txGraph.rpcUrl || '';
        if (transfersToggle) transfersToggle.checked = !!state.txGraph.showTransfers;
        if (callsToggle) callsToggle.checked = !!state.txGraph.showCalls;
        if (refsToggle) refsToggle.checked = !!state.txGraph.showReferences;
      }

      function syncTxGraphFormFromInputs() {
        state.txGraph.hash = document.getElementById('txGraphHashInput').value.trim();
        state.txGraph.chain = document.getElementById('txGraphChainSelect').value;
        state.txGraph.rpcUrl = document.getElementById('txGraphRpcInput').value.trim();
        state.txGraph.showTransfers = document.getElementById('txGraphTransfersToggle').checked;
        state.txGraph.showCalls = document.getElementById('txGraphCallsToggle').checked;
        state.txGraph.showReferences = document.getElementById('txGraphReferencesToggle').checked;
      }
`;
