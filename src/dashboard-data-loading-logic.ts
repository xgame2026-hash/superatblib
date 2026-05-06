export const DASHBOARD_DATA_LOADING_LOGIC = String.raw`
      const DASHBOARD_FETCH_TIMEOUT_MS = 10000;

      async function fetchJson(url, options) {
        const requestOptions = options ? Object.assign({}, options) : {};
        let timeoutId = null;
        if (!requestOptions.signal && typeof AbortController !== 'undefined') {
          const controller = new AbortController();
          requestOptions.signal = controller.signal;
          timeoutId = setTimeout(function () {
            controller.abort();
          }, DASHBOARD_FETCH_TIMEOUT_MS);
        }
        try {
          const response = await fetch(url, requestOptions);
          if (!response.ok) {
            let detail = '';
            try {
              const payload = await response.json();
              if (payload && payload.error) {
                detail = ': ' + String(payload.error);
              }
            } catch {
              // Keep the original status-only failure if the body is not JSON.
            }
            throw new Error('Request failed: ' + response.status + detail);
          }
          return response.json();
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      }

      function fallbackStrategySummary() {
        return {
          ok: false,
          currentExecutionLabel: '--',
          nextBuildLabel: '--',
          advancedTrackLabel: '--',
          markets: []
        };
      }

      function latestLiquidationQueryKey(page, pageSize, date) {
        return [String(page || 0), String(pageSize || 10), date || 'all'].join('|');
      }

      function buildLatestLiquidationQuery(page, pageSize, date) {
        const query = new URLSearchParams();
        query.set('chain', 'ethereum');
        query.set('page', String(page || 0));
        query.set('pageSize', String(pageSize || 10));
        if (date) {
          query.set('date', date);
        }
        return query;
      }

      async function fetchLatestLiquidationPage(page, pageSize, date) {
        const query = buildLatestLiquidationQuery(page, pageSize, date);
        const payload = await fetchJson('/api/market-data/latest-liquidation?' + query.toString());
        if (payload && typeof payload === 'object') {
          payload.__queryKey = latestLiquidationQueryKey(page, pageSize, date);
        }
        return payload;
      }

      function cacheLatestLiquidationPayload(payload) {
        if (!payload || !payload.__queryKey) return;
        state.latestLiquidation.cache[payload.__queryKey] = payload;
        const keys = Object.keys(state.latestLiquidation.cache);
        if (keys.length > 12) {
          keys.slice(0, keys.length - 12).forEach(function (key) {
            delete state.latestLiquidation.cache[key];
          });
        }
      }

      function prefetchLatestLiquidationPage(page) {
        const pageSize = state.latestLiquidation.pageSize || 10;
        const date = state.latestLiquidation.date || '';
        if (page < 0) return Promise.resolve(null);
        const key = latestLiquidationQueryKey(page, pageSize, date);
        if (state.latestLiquidation.cache[key]) {
          return Promise.resolve(state.latestLiquidation.cache[key]);
        }
        if (state.latestLiquidation.inflight[key]) {
          return state.latestLiquidation.inflight[key];
        }
        state.latestLiquidation.inflight[key] = fetchLatestLiquidationPage(page, pageSize, date)
          .then(function (payload) {
            cacheLatestLiquidationPayload(payload);
            return payload;
          })
          .catch(function () {
            return null;
          })
          .finally(function () {
            delete state.latestLiquidation.inflight[key];
          });
        return state.latestLiquidation.inflight[key];
      }

      function overviewCacheKey(period) {
        return 'dashboard-market-data-overview-' + String(period || '7');
      }

      function leaderboardCacheKey(period) {
        return 'dashboard-market-data-leaderboard-' + String(period || '7');
      }

      function flashloanCacheKey(period) {
        return 'dashboard-market-data-flashloan-' + String(period || '7');
      }

      function loadCachedEigenphiOverview(period) {
        try {
          const raw = localStorage.getItem(overviewCacheKey(period));
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      }

      function saveCachedEigenphiOverview(period, payload) {
        try {
          localStorage.setItem(overviewCacheKey(period), JSON.stringify(payload));
        } catch {
          // ignore cache failures
        }
      }

      function loadCachedEigenphiLeaderboard(period) {
        try {
          const raw = localStorage.getItem(leaderboardCacheKey(period));
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      }

      function saveCachedEigenphiLeaderboard(period, payload) {
        try {
          localStorage.setItem(leaderboardCacheKey(period), JSON.stringify(payload));
        } catch {
          // ignore cache failures
        }
      }

      function loadCachedEigenphiFlashloanOverview(period) {
        try {
          const raw = localStorage.getItem(flashloanCacheKey(period));
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      }

      function saveCachedEigenphiFlashloanOverview(period, payload) {
        try {
          localStorage.setItem(flashloanCacheKey(period), JSON.stringify(payload));
        } catch {
          // ignore cache failures
        }
      }

      async function loadEigenphiOverview() {
        state.loading.eigenphiOverview = true;
        try {
          const payload = await fetchJson(
            '/api/market-data/liquidation-overview?chain=ethereum&period=' + encodeURIComponent(state.overviewPeriod)
          );
          state.data.eigenphiOverview = payload;
          saveCachedEigenphiOverview(state.overviewPeriod, payload);
        } catch (_error) {
          if (!state.data.eigenphiOverview) {
            state.data.eigenphiOverview = loadCachedEigenphiOverview(state.overviewPeriod);
          }
        } finally {
          state.loading.eigenphiOverview = false;
          renderOverview();
          renderLiquidationPage();
        }
      }

      async function loadEigenphiLeaderboard() {
        state.loading.eigenphiLeaderboard = true;
        try {
          const payload = await fetchJson(
            '/api/market-data/liquidation-leaderboard?chain=ethereum&period=' + encodeURIComponent(state.overviewPeriod)
          );
          state.data.eigenphiLeaderboard = payload;
          saveCachedEigenphiLeaderboard(state.overviewPeriod, payload);
        } catch (_error) {
          if (!state.data.eigenphiLeaderboard) {
            state.data.eigenphiLeaderboard = loadCachedEigenphiLeaderboard(state.overviewPeriod);
          }
        } finally {
          state.loading.eigenphiLeaderboard = false;
          renderOverview();
          renderLiquidationPage();
        }
      }

      async function loadEigenphiFlashloanOverview() {
        state.loading.eigenphiFlashloanOverview = true;
        try {
          const payload = await fetchJson(
            '/api/market-data/flashloan-overview?chain=ethereum&period=' + encodeURIComponent(state.flashloanPeriod)
          );
          state.data.eigenphiFlashloanOverview = payload;
          saveCachedEigenphiFlashloanOverview(state.flashloanPeriod, payload);
        } catch (error) {
          const cached = loadCachedEigenphiFlashloanOverview(state.flashloanPeriod);
          if (cached) {
            state.data.eigenphiFlashloanOverview = cached;
          } else if (!state.data.eigenphiFlashloanOverview) {
            state.data.eigenphiFlashloanOverview = {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
              chain: 'ethereum',
              period: state.flashloanPeriod,
              summary: null,
              trend: { data: [] },
              protocols: { data: [] },
              latest: { rows: [] },
              top: { rows: [] }
            };
          }
        } finally {
          state.loading.eigenphiFlashloanOverview = false;
          renderOverview();
          renderFlashloanPage();
        }
      }

      async function loadEigenphiLatestLiquidation(options) {
        const config = options || {};
        const page = state.latestLiquidation.page || 0;
        const pageSize = state.latestLiquidation.pageSize || 10;
        const date = state.latestLiquidation.date || '';
        const key = latestLiquidationQueryKey(page, pageSize, date);
        const cached = !config.force ? state.latestLiquidation.cache[key] : null;

        if (cached) {
          state.data.eigenphiLatestLiquidation = cached;
          state.loading.eigenphiLatestLiquidation = false;
          prefetchLatestLiquidationPage(page + 1);
          if (page > 0) prefetchLatestLiquidationPage(page - 1);
          return cached;
        }

        const requestId = ++state.latestLiquidation.requestId;
        state.loading.eigenphiLatestLiquidation = true;
        if (config.renderLoading) {
          state.data.eigenphiLatestLiquidation = null;
          if (state.page === 'overview') {
            renderOverview();
          }
        }
        try {
          const payload = await fetchLatestLiquidationPage(page, pageSize, date);
          cacheLatestLiquidationPayload(payload);
          if (requestId === state.latestLiquidation.requestId) {
            state.data.eigenphiLatestLiquidation = payload;
          }
          prefetchLatestLiquidationPage(page + 1);
          if (page > 0) prefetchLatestLiquidationPage(page - 1);
          return payload;
        } catch (_error) {
          if (requestId === state.latestLiquidation.requestId && !state.data.eigenphiLatestLiquidation) {
            state.data.eigenphiLatestLiquidation = { ok: false, rows: [] };
          }
        } finally {
          if (requestId === state.latestLiquidation.requestId) {
            state.loading.eigenphiLatestLiquidation = false;
            renderOverview();
            renderLiquidationPage();
          }
        }
      }

      async function loadMorphoBlueMarkets(chain) {
        const morphoChain = chain === 'base' ? 'base' : 'ethereum';
        const loadingKey = morphoChain === 'base' ? 'morphoBlueBaseMarkets' : 'morphoBlueMarkets';
        const dataKey = morphoChain === 'base' ? 'morphoBlueBaseMarkets' : 'morphoBlueMarkets';
        state.loading[loadingKey] = true;
        try {
          const payload = await fetchJson('/api/morpho-blue/markets?chain=' + encodeURIComponent(morphoChain));
          state.data[dataKey] = payload;
        } catch (_error) {
          if (!state.data[dataKey]) {
            state.data[dataKey] = { ok: false, chain: morphoChain, markets: [] };
          }
        } finally {
          state.loading[loadingKey] = false;
          renderOverview();
          renderMorphoPage();
        }
      }

      async function loadMarketDataIndexStatus() {
        try {
          const payload = await fetchJson('/api/market-data/index-status');
          state.data.marketDataIndexStatus = payload;
          renderMarketDataIndexStatus();
          return payload;
        } catch (_error) {
          return null;
        }
      }

      function applyLoadedFoundationData(results) {
        state.data.config = results[0].status === 'fulfilled' ? results[0].value : state.data.config;
        state.data.liveState = results[1].status === 'fulfilled' ? results[1].value : state.data.liveState;
        state.data.history = results[2].status === 'fulfilled' ? results[2].value : state.data.history;
        state.data.wallet = results[3].status === 'fulfilled' && results[3].value ? results[3].value : state.data.wallet;
        state.data.settings = results[4].status === 'fulfilled' ? results[4].value : state.data.settings;
        state.data.marketDataIndexStatus = results[5].status === 'fulfilled' ? results[5].value : state.data.marketDataIndexStatus;
        state.data.quicknodeUsage = results[6].status === 'fulfilled' && results[6].value ? results[6].value : state.data.quicknodeUsage;
        state.data.strategy = results[7].status === 'fulfilled' && results[7].value
          ? results[7].value
          : (state.data.strategy || fallbackStrategySummary());

        applyLanguagePreferenceFromSettings();
        hydrateFormFromSettings({ preserveChain: state.hasHydratedForm });
        hydrateArbitrageFormFromState();
        state.hasHydratedForm = true;
        state.lastResult = state.data.liveState && state.data.liveState.state ? state.data.liveState.state.lastResult : null;
      }

      async function loadDashboardFoundationData(options) {
        const config = options || {};
        const results = await Promise.allSettled([
          fetchJson('/api/config'),
          fetchJson('/api/live-state'),
          fetchJson('/api/history?limit=80'),
          config.includeWallet ? fetchJson('/api/wallet').catch(function () { return null; }) : Promise.resolve(state.data.wallet),
          fetchJson('/api/settings'),
          fetchJson('/api/market-data/index-status').catch(function () { return null; }),
          config.includeQuicknode ? fetchJson('/api/quicknode/usage').catch(function () { return null; }) : Promise.resolve(state.data.quicknodeUsage),
          fetchJson('/api/strategy-markets').catch(function () { return null; })
        ]);
        applyLoadedFoundationData(results);
      }

      async function loadInitialData() {
        const primaryTasks = [
          loadMorphoBlueMarkets('ethereum'),
          loadEigenphiOverview(),
          loadEigenphiLatestLiquidation({ force: true }),
          loadEigenphiFlashloanOverview(),
          loadMarketDataIndexStatus()
        ];

        await loadDashboardFoundationData({
          includeWallet: false,
          includeQuicknode: false
        });

        Promise.allSettled(primaryTasks).then(function () {
          renderAll();
        }).catch(function () {});
      }

      async function loadDeferredData() {
        await Promise.allSettled([
          loadMorphoBlueMarkets('base'),
          loadEigenphiLeaderboard(),
          fetchJson('/api/wallet').then(function (payload) {
            state.data.wallet = payload;
          }).catch(function () {}),
          fetchJson('/api/quicknode/usage').then(function (payload) {
            state.data.quicknodeUsage = payload;
          }).catch(function () {})
        ]);
      }

      async function loadData() {
        const morphoTask = Promise.allSettled([
          loadMorphoBlueMarkets('ethereum'),
          loadMorphoBlueMarkets('base')
        ]);
        const eigenphiTask = loadEigenphiOverview();
        const leaderboardTask = loadEigenphiLeaderboard();
        const latestLiquidationTask = loadEigenphiLatestLiquidation({ force: true });
        const flashloanTask = loadEigenphiFlashloanOverview();

        await loadDashboardFoundationData({
          includeWallet: true,
          includeQuicknode: true
        });

        await Promise.allSettled([morphoTask, eigenphiTask, leaderboardTask, latestLiquidationTask, flashloanTask]);
        await loadMarketDataIndexStatus();
      }

      async function refreshQuicknodeUsage() {
        try {
          const payload = await fetchJson('/api/quicknode/usage');
          state.data.quicknodeUsage = payload;
          renderConsole();
        } catch (_error) {}
      }
`;
