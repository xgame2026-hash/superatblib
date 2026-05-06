export const DASHBOARD_MORPHO_EVENTS_LOGIC = String.raw`
      function bindMorphoDashboardEvents() {
        document.addEventListener('click', function (event) {
          const target = event.target instanceof Element ? event.target.closest('.morpho-market-open[data-morpho-market]') : null;
          if (!target) return;
          event.preventDefault();
          openMorphoBlueMarketDetail(target.getAttribute('data-morpho-market') || '');
        });

        document.addEventListener('click', function (event) {
          const target = event.target instanceof Element ? event.target.closest('[data-morpho-run-market]') : null;
          if (!target) return;
          event.preventDefault();
          void runMorphoMarketAnalyze(
            target.getAttribute('data-morpho-run-market') || '',
            {
              kind: target.getAttribute('data-morpho-run-kind') || undefined,
              hfMax: target.getAttribute('data-morpho-run-hf-max') || undefined
            }
          );
        });

        [
          ['morphoOpportunityViewAll', 'all'],
          ['morphoOpportunityViewLiq', 'liquidatable'],
          ['morphoOpportunityViewNear', 'near'],
          ['morphoOpportunityViewRisky', 'risky']
        ].forEach(function (entry) {
          const button = document.getElementById(entry[0]);
          if (!button) return;
          button.addEventListener('click', function () {
            state.morphoOpportunityView = entry[1];
            syncMorphoOverviewWindowToConsole();
            try {
              localStorage.setItem('dashboard-morpho-opportunity-view', entry[1]);
            } catch (_error) {}
            renderAll();
          });
        });

        const morphoOpportunityRefresh = document.getElementById('morphoOpportunityRefresh');
        if (morphoOpportunityRefresh) {
          morphoOpportunityRefresh.addEventListener('click', function () {
            void refreshMorphoOverviewWindow();
          });
        }

        const morphoExecutorCheckButton = document.getElementById('morphoExecutorCheckButton');
        if (morphoExecutorCheckButton) {
          morphoExecutorCheckButton.addEventListener('click', function () {
            void runMorphoExecutorCheck();
          });
        }

        [
          ['morphoChainEthereum', 'ethereum'],
          ['morphoChainBase', 'base']
        ].forEach(function (entry) {
          const button = document.getElementById(entry[0]);
          if (!button) return;
          button.addEventListener('click', function () {
            state.morphoChain = entry[1];
            try {
              localStorage.setItem('dashboard-morpho-chain', entry[1]);
            } catch (_error) {}
            renderMorphoPage();
          });
        });
      }
`;
