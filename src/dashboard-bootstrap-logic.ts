export const DASHBOARD_BOOTSTRAP_LOGIC = String.raw`
      function renderConsole() {
        consoleController.renderConsole();
      }

      function renderOverview() {
        qsa('#pageOverview .top-pill[data-period], #pageLiquidation .top-pill[data-period]').forEach(function (node) {
          node.classList.toggle('active', node.getAttribute('data-period') === state.overviewPeriod);
        });
        if (state.bootLoading) {
          renderOverviewHubSkeleton();
          return;
        }
        if (
          (state.loading.eigenphiOverview && !state.data.eigenphiOverview) ||
          (state.loading.eigenphiFlashloanOverview && !state.data.eigenphiFlashloanOverview) ||
          (state.loading.eigenphiLatestLiquidation && !state.data.eigenphiLatestLiquidation) ||
          (state.loading.morphoBlueMarkets && !state.data.morphoBlueMarkets) ||
          !state.data.strategy
        ) {
          renderOverviewHubSkeleton();
          return;
        }
        renderOverviewHub();
        renderStrategyMarkets(state.data.strategy);
      }

      function renderLiquidationPage() {
        const overview = state.data.eigenphiOverview;
        const leaderboard = state.data.eigenphiLeaderboard;
        const latestLiquidation = state.data.eigenphiLatestLiquidation;
        if ((state.loading.eigenphiOverview && !overview) || (state.loading.eigenphiLeaderboard && !leaderboard) || (state.loading.eigenphiLatestLiquidation && !latestLiquidation)) {
          renderOverviewSkeleton();
          return;
        }
        [
          function () { renderMarketDataIndexStatus(); },
          function () { renderEigenphiSummary(overview); },
          function () { renderEigenphiTrend(overview); },
          function () { renderEigenphiDistribution(overview); },
          function () { renderLatestLiquidation(latestLiquidation); },
          function () { renderEigenphiLeaderboard(leaderboard); },
          function () { renderEigenphiProtocols(overview); }
        ].forEach(function (renderSection) {
          try {
            renderSection();
          } catch (error) {
            console.error('Liquidation render section failed:', error);
          }
        });
      }

      function renderFlashloanPage() {
        qsa('#pageFlashloan .top-pill[data-flashloan-period]').forEach(function (node) {
          node.classList.toggle('active', node.getAttribute('data-flashloan-period') === state.flashloanPeriod);
        });
        renderMarketDataIndexStatus();
        renderFlashloanPagePayload(state.data.eigenphiFlashloanOverview);
      }

      function renderFlashloanConsolePage() {
        const page = document.getElementById('pageFlashloanConsole');
        if (!page || !page.classList.contains('active')) return;
        renderFlashloanDeskPayload();
      }

      function renderMorphoPage() {
        renderMorphoBlueMarkets(
          state.morphoChain === 'base'
            ? state.data.morphoBlueBaseMarkets
            : state.data.morphoBlueMarkets
        );
      }

      function applyTranslations() {
        applyChromeTranslations();
        applyOverviewTranslations();
        applyMorphoTranslations();
        applyConsoleTranslations();
      }

      function renderTopbar() {
      }

      function defaultExecutionLookbackForChain(chain) {
        switch (chain) {
          case 'ethereum':
            return '2000';
          case 'polygon':
            return '12000';
          case 'arbitrum':
            return '8000';
          default:
            return '30000';
        }
      }

      function applyFormToInputs() {
        const marketSelect = document.getElementById('marketSelect');
        if (marketSelect) {
          marketSelect.value = state.form.market || 'aave-v3-ethereum';
          if (!marketSelect.value) {
            marketSelect.value = Array.from(marketSelect.options).some(function (option) {
              return option.value === 'aave-v3-ethereum';
            }) ? 'aave-v3-ethereum' : (marketSelect.options[0] ? marketSelect.options[0].value : '');
            state.form.market = marketSelect.value || 'aave-v3-ethereum';
            state.form.chain = inferExecutionChainFromMarketSelection(state.form.market);
          }
          if (typeof syncCustomSelect === 'function') {
            syncCustomSelect(marketSelect);
          }
        }
        const lookbackInput = document.getElementById('lookbackInput');
        const limitInput = document.getElementById('limitInput');
        const minNetProfitInput = document.getElementById('minNetProfitInput');
        const hfMaxInput = document.getElementById('hfMaxInput');
        const morphoMarketIdInput = document.getElementById('morphoMarketIdInput');
        const morphoKindSelect = document.getElementById('morphoKindSelect');
        if (lookbackInput) lookbackInput.value = state.form.lookbackBlocks;
        if (limitInput) limitInput.value = state.form.limit;
        if (minNetProfitInput) minNetProfitInput.value = state.form.minNetProfit;
        if (hfMaxInput) hfMaxInput.value = state.form.hfMax;
        if (morphoMarketIdInput) morphoMarketIdInput.value = state.form.morphoMarketId || '';
        if (morphoKindSelect) morphoKindSelect.value = state.form.morphoKind || '';
        document.getElementById('rpcUrlInput').value = state.form.rpcUrl;
        state.form.autoSwap = true;
        state.form.broadcast = true;
      }

      function syncFormFromInputs() {
        state.form.market = document.getElementById('marketSelect').value || 'aave-v3-ethereum';
        state.form.chain = inferExecutionChainFromMarketSelection(state.form.market);
        const lookbackInput = document.getElementById('lookbackInput');
        const limitInput = document.getElementById('limitInput');
        const minNetProfitInput = document.getElementById('minNetProfitInput');
        const hfMaxInput = document.getElementById('hfMaxInput');
        const morphoMarketIdInput = document.getElementById('morphoMarketIdInput');
        const morphoKindSelect = document.getElementById('morphoKindSelect');
        state.form.lookbackBlocks = lookbackInput
          ? lookbackInput.value
          : defaultExecutionLookbackForChain(state.form.chain);
        state.form.limit = limitInput
          ? (limitInput.value || state.form.limit || '50')
          : (state.form.limit || '50');
        state.form.minNetProfit = minNetProfitInput
          ? minNetProfitInput.value
          : state.form.minNetProfit;
        state.form.hfMax = hfMaxInput
          ? (hfMaxInput.value || '')
          : (state.form.hfMax || '');
        state.form.morphoMarketId = morphoMarketIdInput
          ? morphoMarketIdInput.value.trim()
          : (state.form.morphoMarketId || '');
        state.form.morphoKind = morphoKindSelect
          ? String(morphoKindSelect.value || '')
          : (state.form.morphoKind || '');
        state.form.rpcUrl = document.getElementById('rpcUrlInput').value.trim();
        state.form.addressProvider = '';
        state.form.user = '';
        state.form.contract = '';
        state.form.allowRisky = false;
        state.form.autoSwap = true;
        state.form.broadcast = true;
        state.form.distributeProfit = false;
        state.form.deploy = false;
        state.form.liquidationOnly = true;
      }

      function setPage(page) {
        const nextPage = validPages.includes(page) ? page : 'overview';
        state.page = nextPage;
        localStorage.setItem('dashboard-page', nextPage);
        qsa('.nav-button').forEach(function (button) {
          button.classList.toggle('active', button.getAttribute('data-page') === nextPage);
        });
        validPages.forEach(function (name) {
          document.getElementById('page' + name.charAt(0).toUpperCase() + name.slice(1)).classList.toggle('active', name === nextPage);
        });
        applyTranslations();
        renderAll();
      }

      function setLanguage(language) {
        state.language = language === 'en' ? 'en' : 'zh';
        localStorage.setItem('dashboard-language', state.language);
        document.documentElement.lang = state.language === 'zh' ? 'zh-CN' : 'en';
        applyTranslations();
        renderAll();
      }

      async function setOverviewPeriod(period) {
        state.overviewPeriod = ['1', '7', '30'].includes(String(period)) ? String(period) : '7';
        localStorage.setItem('dashboard-overview-period', state.overviewPeriod);
        state.data.eigenphiOverview = loadCachedEigenphiOverview(state.overviewPeriod);
        state.data.eigenphiLeaderboard = loadCachedEigenphiLeaderboard(state.overviewPeriod);
        state.loading.eigenphiOverview = true;
        state.loading.eigenphiLeaderboard = true;
        renderOverview();
        renderLiquidationPage();
        await Promise.allSettled([
          loadEigenphiOverview(),
          loadEigenphiLeaderboard()
        ]);
        renderOverview();
        renderLiquidationPage();
      }

      async function setFlashloanPeriod(period) {
        state.flashloanPeriod = ['1', '7', '30'].includes(String(period)) ? String(period) : '7';
        localStorage.setItem('dashboard-flashloan-period', state.flashloanPeriod);
        state.flashloanLatest.page = 0;
        state.data.eigenphiFlashloanOverview = loadCachedEigenphiFlashloanOverview(state.flashloanPeriod);
        state.loading.eigenphiFlashloanOverview = true;
        renderFlashloanPage();
        await loadEigenphiFlashloanOverview();
        renderFlashloanPage();
      }

      function renderAll() {
        syncExecutionMarketSelectOptions();
        applyFormToInputs();
        applyTxGraphFormToInputs();
        renderTopbar();
        renderOverview();
        renderLiquidationPage();
        renderFlashloanPage();
        renderFlashloanConsolePage();
        renderLab();
        renderMorphoPage();
        renderConsole();
        renderArbitrage();
        renderTxGraph();
        renderSettings();
        text('runState', t(state.runStateMode === 'running' ? 'runtimeRunning' : state.runStateMode === 'paused' ? 'runtimePaused' : 'runtimeIdle'));
        requestAnimationFrame(syncConsoleLayoutHeight);
        requestAnimationFrame(syncArbitrageLayoutHeight);
        requestAnimationFrame(syncTxGraphLayoutHeight);
        requestAnimationFrame(syncFlashloanConsoleTableHeight);
      }

      function syncResponsiveLayout() {
        if (state.page === 'overview') {
          renderOverview();
        } else if (state.page === 'liquidation') {
          renderLiquidationPage();
        } else if (state.page === 'flashloan') {
          renderFlashloanPage();
        } else if (state.page === 'flashloanConsole') {
          renderFlashloanConsolePage();
        } else if (state.page === 'lab') {
          renderLab();
        } else if (state.page === 'morpho') {
          renderMorphoPage();
        } else if (state.page === 'console') {
          renderConsole();
        } else if (state.page === 'arbitrage') {
          renderArbitrage();
        } else if (state.page === 'txgraph') {
          renderTxGraph();
        } else if (state.page === 'settings') {
          renderSettings();
        }
        syncConsoleLayoutHeight();
        syncArbitrageLayoutHeight();
        syncTxGraphLayoutHeight();
        syncFlashloanConsoleTableHeight();
      }

      function syncConsoleLayoutHeight() {
        consoleController.syncConsoleLayoutHeight();
      }

      function syncArbitrageLayoutHeight() {
        const page = document.getElementById('pageArbitrage');
        const layout = page ? page.querySelector('.console-layout') : null;
        const content = document.querySelector('.content-scroll');
        const footer = document.querySelector('.app-footer');
        if (!layout) return;
        if (!page || !page.classList.contains('active') || !footer || !content || window.innerWidth <= 1440) {
          layout.style.removeProperty('height');
          return;
        }
        const targetGap = 16;
        const availableHeight = Math.floor(content.clientHeight - layout.offsetTop - footer.offsetHeight - targetGap);
        if (availableHeight > 0) {
          layout.style.height = availableHeight + 'px';
        } else {
          layout.style.removeProperty('height');
        }
      }

      function syncTxGraphLayoutHeight() {
        const page = document.getElementById('pageTxgraph');
        const layout = page ? page.querySelector('.txgraph-layout') : null;
        const content = document.querySelector('.content-scroll');
        const footer = document.querySelector('.app-footer');
        if (!layout) return;
        if (!page || !page.classList.contains('active') || !footer || !content || window.innerWidth <= 1440) {
          layout.style.removeProperty('height');
          return;
        }
        const targetGap = 16;
        const availableHeight = Math.floor(content.clientHeight - layout.offsetTop - footer.offsetHeight - targetGap);
        if (availableHeight > 0) {
          layout.style.height = availableHeight + 'px';
        } else {
          layout.style.removeProperty('height');
        }
      }

      function syncTerminalOutput() {
        consoleController.syncTerminalOutput();
      }

      function appendTerminal(chunk) {
        consoleController.appendTerminal(chunk);
      }

      function mergeConsoleTargets(rows) {
        consoleController.mergeConsoleTargets(rows);
      }

      async function startAutoExecute() {
        await consoleController.startAutoExecute();
      }

      function pauseAutoExecute() {
        consoleController.pauseAutoExecute();
      }

      function bindEvents() {
        qsa('.nav-button').forEach(function (button) {
          button.addEventListener('click', function () {
            setPage(button.getAttribute('data-page'));
          });
        });
        bindOverviewDashboardEvents();
        bindFlashloanDashboardEvents();
        bindMorphoDashboardEvents();
        bindLabDashboardEvents();
        bindArbitrageDashboardEvents();
        bindCommonDashboardEvents();
        bindShellDashboardEvents();
        consoleController.bindEvents();
      }

      async function init() {
        bindEvents();
        state.data.eigenphiOverview = loadCachedEigenphiOverview(state.overviewPeriod);
        state.data.eigenphiLeaderboard = loadCachedEigenphiLeaderboard(state.overviewPeriod);
        state.data.eigenphiFlashloanOverview = loadCachedEigenphiFlashloanOverview(state.flashloanPeriod);
        state.flashloanLatest.pageSize = Number(localStorage.getItem('dashboard-flashloan-page-size') || '10') || 10;
        hydrateLabState();
        ensureLabPriceTimer();
        syncMorphoOverviewWindowToConsole();
        applyTranslations();
        setPage(state.page);
        renderAll();
        try {
          await loadInitialData();
        } catch (error) {
          console.error('Dashboard initial load failed:', error);
        }
        state.bootLoading = false;
        document.getElementById('settingsLanguage').value = state.language;
        syncMorphoOverviewWindowToConsole();
        applyTranslations();
        setPage(state.page);
        renderAll();
        loadDeferredData().then(function () {
          renderAll();
        }).catch(function () {});
        setInterval(function () {
          if (state.running) return;
          loadData().then(function () {
            renderAll();
          }).catch(function () {});
        }, 15000);
        setInterval(function () {
          refreshRpcUsage();
        }, 60000);
        setInterval(function () {
          loadPublicLiquidationFeed();
          loadLiquidationQueueStatus();
        }, 10000);
      }
`;
