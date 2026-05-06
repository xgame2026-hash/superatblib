export const DASHBOARD_ARBITRAGE_EVENTS_LOGIC = String.raw`
      function bindArbitrageDashboardEvents() {
        const arbActionStartButton = document.getElementById('arbActionStart');
        if (arbActionStartButton) {
          arbActionStartButton.addEventListener('click', function () {
            syncArbitrageFormFromInputs();
            renderArbitrage();
            void startArbitrageAutoExecute();
          });
        }
        const arbActionPauseButton = document.getElementById('arbActionPause');
        if (arbActionPauseButton) {
          arbActionPauseButton.addEventListener('click', function () {
            pauseArbitrageAutoExecute();
          });
        }
        const arbTerminalExpand = document.getElementById('arbTerminalExpand');
        if (arbTerminalExpand) {
          arbTerminalExpand.addEventListener('click', function () {
            const node = document.getElementById('arbTerminalOutputText');
            openModal(t('terminalTitle'), node ? node.textContent || '' : state.arbitrageTerminal);
          });
        }
        [
          ['arbFilterAll', 'all'],
          ['arbFilterPositive', 'positive'],
          ['arbFilterLiquidatable', 'liquidatable'],
          ['arbFilterWatch', 'watch']
        ].forEach(function (entry) {
          const node = document.getElementById(entry[0]);
          if (!node) return;
          node.addEventListener('click', function () {
            state.arbitrageFilter = entry[1];
            renderArbitrage();
          });
        });
        const arbTokenInput = document.getElementById('arbTokenInput');
        if (arbTokenInput) {
          const onTokenInput = function () {
            const previousToken = String(state.arbitrageForm.token || '').trim();
            state.arbitrageForm.token = String(arbTokenInput.value || '').trim();
            persistArbitrageTokenPreference(state.arbitrageForm.token);
            syncArbitrageFormFromInputs();
            renderArbitrage();
            if (
              state.arbitrageRunning &&
              state.arbitrageAutoExecuteAbortController &&
              String(state.arbitrageForm.token || '').trim() !== previousToken
            ) {
              state.arbitragePendingRestart = true;
              appendArbitrageTerminal('\\n$ 检测到观察币对变更，准备重启扫描...\\n');
              state.arbitrageAutoExecuteAbortController.abort();
            }
          };
          arbTokenInput.addEventListener('input', onTokenInput);
          arbTokenInput.addEventListener('change', onTokenInput);
        }
      }
`;
