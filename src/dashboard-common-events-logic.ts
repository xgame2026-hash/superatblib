export const DASHBOARD_COMMON_EVENTS_LOGIC = String.raw`
      function showCopyFeedback(target, tooltipSelector) {
        const tooltip = target.querySelector(tooltipSelector);
        if (tooltip) tooltip.textContent = copiedActionLabel();
        target.classList.add('is-copied');
        if (target._copyFeedbackTimer) {
          clearTimeout(target._copyFeedbackTimer);
        }
        target._copyFeedbackTimer = setTimeout(function () {
          target.classList.remove('is-copied');
          if (tooltip) tooltip.textContent = copyActionLabel();
          target._copyFeedbackTimer = null;
        }, 1200);
      }

      function bindCommonDashboardEvents() {
        document.addEventListener('click', function (event) {
          const target = event.target instanceof Element ? event.target.closest('[data-page-link]') : null;
          if (!target) return;
          event.preventDefault();
          const page = target.getAttribute('data-page-link') || 'overview';
          setPage(page);
        });

        document.addEventListener('click', function (event) {
          const target = event.target instanceof Element ? event.target.closest('.leaderboard-address-copy') : null;
          if (!target) return;
          event.preventDefault();
          const value = target.getAttribute('data-copy-value') || '';
          copyTextToClipboard(value).then(function () {
            showCopyFeedback(target, '.leaderboard-copy-tooltip');
          }).catch(function () {});
        });

        document.addEventListener('click', function (event) {
          const target = event.target instanceof Element ? event.target.closest('.console-user-address[data-copy-value]') : null;
          if (!target) return;
          event.preventDefault();
          const value = target.getAttribute('data-copy-value') || '';
          copyTextToClipboard(value).then(function () {
            showCopyFeedback(target, '.console-user-copy-tooltip');
          }).catch(function () {});
        });

        document.addEventListener('keydown', function (event) {
          const target = event.target instanceof Element ? event.target.closest('.console-user-address[data-copy-value]') : null;
          if (!target) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          const value = target.getAttribute('data-copy-value') || '';
          copyTextToClipboard(value).then(function () {
            showCopyFeedback(target, '.console-user-copy-tooltip');
          }).catch(function () {});
        });

        document.addEventListener('click', function (event) {
          const target = event.target instanceof Element ? event.target.closest('[data-open-txgraph]') : null;
          if (!target) return;
          event.preventDefault();
          const value = target.getAttribute('data-open-txgraph') || '';
          openTxGraphForHash(value);
        });

        document.addEventListener('click', function (event) {
          const target = event.target instanceof Element ? event.target.closest('[data-strategy-action]') : null;
          if (!target) return;
          event.preventDefault();
          const action = target.getAttribute('data-strategy-action') || '';
          const market = target.getAttribute('data-strategy-market') || '';
          if (action === 'use-market' || action === 'open-console') {
            if (market && market !== state.form.market) {
              state.form.market = market;
              state.form.chain = inferExecutionChainFromMarketSelection(market);
              state.form.lookbackBlocks = defaultExecutionLookbackForChain(state.form.chain);
            }
            state.consoleSourceFilter = 'all';
            renderAll();
            if (action === 'open-console') {
              setPage('console');
            }
            return;
          }
          if (action === 'open-morpho-page') {
            setPage('morpho');
            return;
          }
          if (action === 'open-morpho-settings') {
            state.settingsSection = 'morpho';
            localStorage.setItem('dashboard-settings-section', state.settingsSection);
            setPage('settings');
            return;
          }
        });

        document.getElementById('trendExpandButton').addEventListener('click', function () {
          openChartModal('trend');
        });
        document.getElementById('distributionExpandButton').addEventListener('click', function () {
          openChartModal('distribution');
        });
        document.getElementById('saveSettingsButton').addEventListener('click', saveSettings);
        document.getElementById('toggleSettingsVisibilityButton').addEventListener('click', toggleSensitiveSettingsVisibility);

        const settingsSectionGeneral = document.getElementById('settingsSectionGeneral');
        if (settingsSectionGeneral) {
          settingsSectionGeneral.addEventListener('click', function () {
            state.settingsSection = 'general';
            localStorage.setItem('dashboard-settings-section', state.settingsSection);
            applyTranslations();
            renderSettings();
          });
        }
        const settingsSectionExchanges = document.getElementById('settingsSectionExchanges');
        if (settingsSectionExchanges) {
          settingsSectionExchanges.addEventListener('click', function () {
            state.settingsSection = 'exchanges';
            localStorage.setItem('dashboard-settings-section', state.settingsSection);
            applyTranslations();
            renderSettings();
          });
        }
        const settingsSectionMorpho = document.getElementById('settingsSectionMorpho');
        if (settingsSectionMorpho) {
          settingsSectionMorpho.addEventListener('click', function () {
            state.settingsSection = 'morpho';
            localStorage.setItem('dashboard-settings-section', state.settingsSection);
            applyTranslations();
            renderSettings();
          });
        }

        document.getElementById('modalClose').addEventListener('click', closeModal);
        document.getElementById('modal').addEventListener('click', function (event) {
          if (event.target === document.getElementById('modal')) {
            closeModal();
          }
        });
      }
`;
