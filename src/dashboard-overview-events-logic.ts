export const DASHBOARD_OVERVIEW_EVENTS_LOGIC = String.raw`
      function bindOverviewDashboardEvents() {
        qsa('#pageOverview .top-pill[data-period], #pageLiquidation .top-pill[data-period]').forEach(function (button) {
          button.addEventListener('click', function () {
            setOverviewPeriod(button.getAttribute('data-period'));
          });
        });

        qsa('.leaderboard-tab').forEach(function (button) {
          button.addEventListener('click', function () {
            state.leaderboardTab = button.getAttribute('data-tab') || 'txProfit';
            localStorage.setItem('dashboard-leaderboard-tab', state.leaderboardTab);
            renderOverview();
          });
        });

        const latestDateWrap = document.getElementById('latestLiquidationDateWrap');
        const latestDateInput = document.getElementById('latestLiquidationDate');
        const latestDatePicker = document.getElementById('latestLiquidationDatePicker');
        const latestDatePrev = document.getElementById('latestLiquidationDatePrev');
        const latestDateNext = document.getElementById('latestLiquidationDateNext');
        const latestDateGrid = document.getElementById('latestLiquidationDateGrid');
        const latestDateClear = document.getElementById('latestLiquidationDateClear');
        if (latestDateWrap && latestDateInput) {
          latestDateWrap.setAttribute('tabindex', '0');
          latestDateWrap.addEventListener('click', function (event) {
            if (latestDatePicker && latestDatePicker.contains(event.target)) return;
            event.preventDefault();
            openLatestDatePicker();
          });
          latestDateWrap.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openLatestDatePicker();
            }
          });
          latestDateInput.addEventListener('focus', function () {
            latestDateInput.blur();
            openLatestDatePicker();
          });
        }
        if (latestDatePrev) {
          latestDatePrev.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            shiftLatestDatePickerMonth(-1);
          });
        }
        if (latestDateNext) {
          latestDateNext.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            shiftLatestDatePickerMonth(1);
          });
        }
        if (latestDateGrid) {
          latestDateGrid.addEventListener('click', async function (event) {
            const button = event.target.closest('[data-date-value]');
            if (!button) return;
            state.latestLiquidation.date = button.getAttribute('data-date-value') || '';
            state.latestLiquidation.page = 0;
            const selected = latestDateParts(state.latestLiquidation.date);
            if (selected) {
              state.latestLiquidation.pickerYear = selected.year;
              state.latestLiquidation.pickerMonth = selected.month;
            }
            closeLatestDatePicker();
            await loadEigenphiLatestLiquidation({ renderLoading: true });
            renderOverview();
          });
        }
        if (latestDateClear) {
          latestDateClear.addEventListener('click', async function (event) {
            event.preventDefault();
            event.stopPropagation();
            state.latestLiquidation.date = '';
            state.latestLiquidation.page = 0;
            closeLatestDatePicker();
            await loadEigenphiLatestLiquidation({ renderLoading: true });
            renderOverview();
          });
        }
        document.addEventListener('click', function (event) {
          if (!state.latestLiquidation.pickerOpen) return;
          if (latestDateWrap && latestDateWrap.contains(event.target)) return;
          closeLatestDatePicker();
        });
        document.addEventListener('keydown', function (event) {
          if (event.key === 'Escape' && state.latestLiquidation.pickerOpen) {
            closeLatestDatePicker();
          }
        });

        document.getElementById('latestLiquidationPageSize').addEventListener('change', async function () {
          state.latestLiquidation.pageSize = Number(this.value || '10') || 10;
          state.latestLiquidation.page = 0;
          localStorage.setItem('dashboard-latest-liquidation-page-size', String(state.latestLiquidation.pageSize));
          await loadEigenphiLatestLiquidation({ renderLoading: true });
          renderOverview();
        });

        qsa('.latest-unit-button').forEach(function (button) {
          button.addEventListener('click', function () {
            state.latestLiquidation.unit = button.getAttribute('data-unit') || 'usd';
            localStorage.setItem('dashboard-latest-liquidation-unit', state.latestLiquidation.unit);
            renderOverview();
          });
        });

        document.getElementById('latestLiquidationPrev').addEventListener('click', async function () {
          if (state.latestLiquidation.page <= 0) return;
          state.latestLiquidation.page -= 1;
          await loadEigenphiLatestLiquidation({ renderLoading: true });
          renderOverview();
        });

        document.getElementById('latestLiquidationNext').addEventListener('click', async function () {
          const payload = state.data.eigenphiLatestLiquidation;
          if (!payload || !payload.hasNext) return;
          state.latestLiquidation.page += 1;
          await loadEigenphiLatestLiquidation({ renderLoading: true });
          renderOverview();
        });
      }
`;
