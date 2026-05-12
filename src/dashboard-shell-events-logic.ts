export const DASHBOARD_SHELL_EVENTS_LOGIC = String.raw`
      function bindShellDashboardEvents() {
        const versionMenu = document.getElementById('versionMenu');
        const connectButton = document.getElementById('connectButton');
        if (versionMenu && connectButton) {
          connectButton.addEventListener('click', function (event) {
            event.stopPropagation();
            const open = !versionMenu.classList.contains('open');
            versionMenu.classList.toggle('open', open);
            connectButton.setAttribute('aria-expanded', open ? 'true' : 'false');
          });
          document.addEventListener('click', function (event) {
            if (!versionMenu.contains(event.target)) {
              versionMenu.classList.remove('open');
              connectButton.setAttribute('aria-expanded', 'false');
            }
          });
        }

        document.getElementById('marketSelect').addEventListener('change', function () {
          syncFormFromInputs();
          const settings = state.data.settings && state.data.settings.settings ? state.data.settings.settings : null;
          if (settings && settings.chains && settings.chains[state.form.chain]) {
            state.form.rpcUrl = settings.chains[state.form.chain].rpcUrl || '';
          }
          if (settings && settings.markets && settings.markets[state.form.market]) {
            state.form.contract = settings.markets[state.form.market].liquidatorContract || '';
          } else if (settings && settings.chains && settings.chains[state.form.chain]) {
            state.form.contract = settings.chains[state.form.chain].liquidatorContract || '';
          }
          renderAll();
          loadPublicLiquidationFeed().catch(function () {});
          loadLiquidationQueueStatus().catch(function () {});
        });

        document.getElementById('txGraphHashSearchButton').addEventListener('click', loadTxGraphData);
        document.getElementById('txGraphChainSelect').addEventListener('change', function () {
          syncTxGraphFormFromInputs();
          syncTxGraphRpcFromConfig({ force: true });
          renderTxGraph();
        });
        document.getElementById('txGraphTransfersToggle').addEventListener('change', function () {
          syncTxGraphFormFromInputs();
          renderTxGraph();
        });
        document.getElementById('txGraphCallsToggle').addEventListener('change', function () {
          syncTxGraphFormFromInputs();
          renderTxGraph();
        });
        document.getElementById('txGraphReferencesToggle').addEventListener('change', function () {
          syncTxGraphFormFromInputs();
          renderTxGraph();
        });
        document.getElementById('txGraphFullscreen').addEventListener('click', function () {
          toggleTxGraphFullscreen();
        });
        document.getElementById('txGraphHashInput').addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            loadTxGraphData();
          }
        });
        document.addEventListener('fullscreenchange', function () {
          window.requestAnimationFrame(syncTxGraphViewport);
        });

        let resizeFrame = null;
        function handleResponsiveResize() {
          if (resizeFrame) {
            cancelAnimationFrame(resizeFrame);
          }
          resizeFrame = requestAnimationFrame(function () {
            syncResponsiveLayout();
          });
        }

        window.addEventListener('resize', handleResponsiveResize);
        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', handleResponsiveResize);
        }
        if (typeof ResizeObserver !== 'undefined') {
          const responsiveObserver = new ResizeObserver(handleResponsiveResize);
          responsiveObserver.observe(document.body);
        }
      }
`;
