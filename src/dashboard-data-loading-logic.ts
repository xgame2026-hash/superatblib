export const DASHBOARD_DATA_LOADING_LOGIC = String.raw`
      const DASHBOARD_FETCH_TIMEOUT_MS = 10000;
      let consoleOpportunityRefreshInFlight = null;

      async function fetchJson(url, options) {
        const requestOptions = options ? Object.assign({}, options) : {};
        const timeoutMs = typeof requestOptions.timeoutMs === 'number'
          ? requestOptions.timeoutMs
          : DASHBOARD_FETCH_TIMEOUT_MS;
        delete requestOptions.timeoutMs;
        let timeoutId = null;
        if (!requestOptions.signal && typeof AbortController !== 'undefined') {
          const controller = new AbortController();
          requestOptions.signal = controller.signal;
          timeoutId = setTimeout(function () {
            controller.abort();
          }, timeoutMs);
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

      async function loadStrategyNews() {
        try {
          const payload = await fetchJson('https://news.supermtnode.io/api/news?limit=5', {
            timeoutMs: 6000,
            cache: 'no-store'
          });
          state.data.strategyNews = payload;
          if (state.page === 'overview') {
            renderOverviewHub();
          }
          return payload;
        } catch (error) {
          state.data.strategyNews = {
            ok: false,
            rows: [],
            error: error instanceof Error ? error.message : String(error)
          };
          return null;
        }
      }

      function applyOverviewSnapshot(payload) {
        const data = payload && payload.data ? payload.data : {};
        state.data.overviewSnapshot = payload || null;
        if (data.eigenphiOverview && !data.eigenphiOverview.sourceUnavailable) {
          state.data.eigenphiOverview = data.eigenphiOverview;
          saveCachedEigenphiOverview(state.overviewPeriod, data.eigenphiOverview);
        } else if (!state.data.eigenphiOverview) {
          state.data.eigenphiOverview = loadCachedEigenphiOverview(state.overviewPeriod);
        }
        if (data.eigenphiFlashloanOverview && !data.eigenphiFlashloanOverview.sourceUnavailable) {
          state.data.eigenphiFlashloanOverview = data.eigenphiFlashloanOverview;
          saveCachedEigenphiFlashloanOverview(state.flashloanPeriod, data.eigenphiFlashloanOverview);
        } else if (!state.data.eigenphiFlashloanOverview) {
          state.data.eigenphiFlashloanOverview = loadCachedEigenphiFlashloanOverview(state.flashloanPeriod);
        }
        if (data.morphoBlueMarkets) {
          state.data.morphoBlueMarkets = data.morphoBlueMarkets;
        }
        if (data.strategyNews) {
          state.data.strategyNews = data.strategyNews;
        }
      }

      async function loadOverviewSnapshot(options) {
        const config = options || {};
        const query = new URLSearchParams();
        query.set('period', String(state.overviewPeriod || '1'));
        query.set('flashloanPeriod', String(state.overviewPeriod || '1'));
        if (config.force) {
          query.set('refresh', '1');
        }

        state.loading.eigenphiOverview = true;
        state.loading.eigenphiFlashloanOverview = true;
        state.loading.morphoBlueMarkets = true;
        try {
          const payload = await fetchJson('/api/overview-snapshot?' + query.toString(), {
            timeoutMs: 12000
          });
          applyOverviewSnapshot(payload);
          return payload;
        } catch (_error) {
          if (!state.data.eigenphiOverview) {
            state.data.eigenphiOverview = loadCachedEigenphiOverview(state.overviewPeriod);
          }
          if (!state.data.eigenphiFlashloanOverview) {
            state.data.eigenphiFlashloanOverview = loadCachedEigenphiFlashloanOverview(state.flashloanPeriod);
          }
          return null;
        } finally {
          state.loading.eigenphiOverview = false;
          state.loading.eigenphiFlashloanOverview = false;
          state.loading.morphoBlueMarkets = false;
          renderOverview();
          renderMorphoPage();
          renderFlashloanPage();
        }
      }

      function loadCachedEigenphiOverview(period) {
        try {
          const raw = localStorage.getItem(overviewCacheKey(period));
          const payload = raw ? JSON.parse(raw) : null;
          return payload && payload.sourceUnavailable ? null : payload;
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
          const payload = raw ? JSON.parse(raw) : null;
          return payload && payload.sourceUnavailable ? null : payload;
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

      function applyLoadedFoundationData(results) {
        state.data.config = results[0].status === 'fulfilled' ? results[0].value : state.data.config;
        state.data.version = results[1].status === 'fulfilled' ? results[1].value : state.data.version;
        state.data.liveState = results[2].status === 'fulfilled' ? results[2].value : state.data.liveState;
        state.data.history = results[3].status === 'fulfilled' ? results[3].value : state.data.history;
        state.data.wallet = results[4].status === 'fulfilled' && results[4].value ? results[4].value : state.data.wallet;
        state.data.settings = results[5].status === 'fulfilled' ? results[5].value : state.data.settings;
        state.data.strategy = results[6].status === 'fulfilled' && results[6].value
          ? results[6].value
          : (state.data.strategy || fallbackStrategySummary());
        state.data.rpcUsage = results[7].status === 'fulfilled' && results[7].value ? results[7].value : state.data.rpcUsage;

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
          fetchJson('/api/version'),
          fetchJson('/api/live-state'),
          fetchJson('/api/history?limit=80'),
          config.includeWallet ? fetchJson('/api/wallet').catch(function () { return null; }) : Promise.resolve(state.data.wallet),
          fetchJson('/api/settings'),
          fetchJson('/api/strategy-markets').catch(function () { return null; }),
          config.includeWallet ? fetchJson('/api/rpc/usage').catch(function () { return null; }) : Promise.resolve(state.data.rpcUsage)
        ]);
        applyLoadedFoundationData(results);
      }

      async function loadInitialData() {
        const overviewSnapshotTask = state.page === 'overview'
          ? loadOverviewSnapshot().catch(function () {
              return null;
            })
          : Promise.resolve(null);

        await loadDashboardFoundationData({
          includeWallet: false,
          includeQuicknode: false
        });

        if (state.page !== 'overview') {
          await loadActivePageData();
        }

        overviewSnapshotTask.then(function () {
          renderAll();
        }).catch(function () {});
      }

      async function loadActivePageData() {
        const tasks = [];
        if (state.page === 'liquidation') {
          tasks.push(loadEigenphiOverview());
          tasks.push(loadEigenphiLeaderboard());
          tasks.push(loadEigenphiLatestLiquidation({ force: false }));
        } else if (state.page === 'flashloan') {
          tasks.push(loadEigenphiFlashloanOverview());
        } else if (state.page === 'morpho') {
          tasks.push(loadMorphoBlueMarkets('ethereum'));
          tasks.push(loadMorphoBlueMarkets('base'));
        }
        if (!tasks.length) return;
        await Promise.allSettled(tasks);
      }

      async function loadDeferredData() {
        const tasks = [
          refreshWalletAssets(),
          loadActivePageData()
        ];
        if (state.page === 'console') {
          tasks.push(refreshConsoleOpportunities());
        }
        await Promise.allSettled(tasks);
      }

      async function refreshConsoleOpportunities() {
        if (consoleOpportunityRefreshInFlight) {
          return consoleOpportunityRefreshInFlight;
        }
        consoleOpportunityRefreshInFlight = Promise.allSettled([
          loadPublicLiquidationFeed(),
          loadLiquidationQueueStatus()
        ]).finally(function () {
          consoleOpportunityRefreshInFlight = null;
        });
        return consoleOpportunityRefreshInFlight;
      }

      async function loadData() {
        if (state.page === 'overview') {
          await loadOverviewSnapshot();
          return;
        }

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
          includeQuicknode: false
        });

        await Promise.allSettled([morphoTask, eigenphiTask, leaderboardTask, latestLiquidationTask, flashloanTask]);
      }

      async function refreshRpcUsage() {
        try {
          const payload = await fetchJson('/api/rpc/usage');
          state.data.rpcUsage = payload;
          renderConsole();
        } catch (_error) {}
      }

      async function loadPublicLiquidationFeed() {
        try {
          const chain = state.form && state.form.chain ? state.form.chain : 'ethereum';
          const payload = await fetchJson('/api/public-liquidation-feed?chain=' + encodeURIComponent(chain));
          state.data.publicLiquidationFeed = payload;
          state.consoleLiveTargets = state.consoleLiveTargets.filter(function (row) {
            return !row || row.source !== 'public-feed';
          });
          if (payload && Array.isArray(payload.targets) && payload.targets.length > 0) {
            mergeConsoleTargets(payload.targets);
          }
          renderConsole();
          return payload;
        } catch (error) {
          state.data.publicLiquidationFeed = {
            ok: false,
            source: 'public-feed',
            chain: state.form && state.form.chain ? state.form.chain : 'ethereum',
            error: error instanceof Error ? error.message : String(error),
            targets: [],
            queue: { enabled: false, status: 'error' }
          };
          return null;
        }
      }

      async function loadLiquidationQueueStatus() {
        try {
          const chain = state.form && state.form.chain ? state.form.chain : 'bnb';
          const market = state.form && state.form.market ? state.form.market : 'aave-v3-bnb';
          const query = new URLSearchParams();
          query.set('chain', chain);
          query.set('market', market);
          const payload = await fetchJson('/api/liquidation-queue/status?' + query.toString());
          state.data.liquidationQueue = payload;
          renderConsole();
          return payload;
        } catch (error) {
          state.data.liquidationQueue = {
            ok: false,
            source: 'local',
            chain: state.form && state.form.chain ? state.form.chain : 'bnb',
            market: state.form && state.form.market ? state.form.market : '',
            eligible: false,
            reason: error instanceof Error ? error.message : String(error),
            queue: { enabled: false, status: 'error' }
          };
          return null;
        }
      }

      async function reportLiquidationQueueEvent(outcome, result) {
        try {
          const parsed = result && result.parsed ? result.parsed : null;
          const broadcastResult = parsed && parsed.broadcastResult ? parsed.broadcastResult : (result && result.broadcastResult ? result.broadcastResult : null);
          const txHash =
            (result && result.txHash) ||
            (parsed && parsed.txHash) ||
            (broadcastResult && broadcastResult.executeTxHash) ||
            (broadcastResult && broadcastResult.txHash) ||
            undefined;
          const payload = {
            chain: state.form && state.form.chain ? state.form.chain : 'ethereum',
            market: state.form && state.form.market ? state.form.market : 'aave-v3-bnb',
            walletAddress: state.data && state.data.liquidationQueue && state.data.liquidationQueue.walletAddress
              ? state.data.liquidationQueue.walletAddress
              : undefined,
            outcome: outcome,
            user: state.autoExecuteSelection && state.autoExecuteSelection.user ? state.autoExecuteSelection.user : undefined,
            txHash: txHash,
            result: result || null
          };
          return await fetchJson('/api/liquidation-queue/event', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (_error) {
          return null;
        }
      }

      async function refreshWalletAssets() {
	        if (state.loading.walletAssets) return;
	        state.loading.walletAssets = true;
	        renderConsole();
	        try {
	          const results = await Promise.allSettled([
	            fetchJson('/api/wallet?force=1'),
	            fetchJson('/api/rpc/usage')
	          ]);
	          if (results[0].status === 'fulfilled') {
	            state.data.wallet = results[0].value;
	          }
	          if (results[1].status === 'fulfilled') {
	            state.data.rpcUsage = results[1].value;
	          }
	        } finally {
	          state.loading.walletAssets = false;
	          renderConsole();
	        }
	      }
	`;
