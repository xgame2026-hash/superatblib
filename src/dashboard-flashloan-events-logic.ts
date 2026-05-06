export const DASHBOARD_FLASHLOAN_EVENTS_LOGIC = String.raw`
      function bindFlashloanDashboardEvents() {
        const marketSelect = document.getElementById('flashloanMarketSelect');
        const lookbackInput = document.getElementById('flashloanLookbackInput');
        const limitInput = document.getElementById('flashloanLimitInput');

        [marketSelect, lookbackInput, limitInput].forEach(function (node) {
          if (!node) return;
          node.addEventListener('change', function () {
            syncFlashloanDeskStateFromInputs();
            applyFormToInputs();
            renderFlashloanConsolePage();
            if (node === marketSelect) {
              void loadEigenphiFlashloanOverview();
            }
          });
          node.addEventListener('input', function () {
            syncFlashloanDeskStateFromInputs();
            renderFlashloanConsolePage();
          });
        });

        [
          ['flashloanFilterAll', 'all'],
          ['flashloanFilterExecutable', 'executable'],
          ['flashloanFilterBlocked', 'blocked'],
          ['flashloanFilterWatch', 'watch']
        ].forEach(function (entry) {
          const node = document.getElementById(entry[0]);
          if (!node) return;
          node.addEventListener('click', function () {
            state.flashloanDeskFilter = entry[1];
            renderFlashloanConsolePage();
          });
        });
      }
`;
