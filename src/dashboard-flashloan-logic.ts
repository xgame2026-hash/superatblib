export const DASHBOARD_FLASHLOAN_LOGIC = String.raw`
      function normalizeFlashloanDeskPeriod(value) {
        const normalized = String(value || state.flashloanPeriod || '7').trim();
        return normalized === '1' || normalized === '30' ? normalized : '7';
      }

      function flashloanDeskPayload() {
        return state.data && state.data.eigenphiFlashloanOverview
          ? state.data.eigenphiFlashloanOverview
          : null;
      }

      function flashloanSourceError(payload) {
        return payload && payload.ok === false && payload.error
          ? String(payload.error)
          : '';
      }

      function flashloanUnavailableText(payload) {
        const error = flashloanSourceError(payload);
        if (!error) return t('flashloanDeskEmpty');
        return state.language === 'zh'
          ? '闪电贷数据源不可用：' + error
          : 'Flashloan data source unavailable: ' + error;
      }

      function flashloanDeskPositiveInteger(value, fallback, min, max) {
        const parsed = Number(String(value || '').trim());
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, Math.trunc(parsed)));
      }

      function ensureFlashloanDeskState() {
        state.flashloanPeriod = normalizeFlashloanDeskPeriod(state.flashloanPeriod);
        state.form.chain = 'ethereum';
        state.form.market = 'flashloan-transactions';
        if (!state.form.lookbackBlocks || state.form.lookbackBlocks === '2000') state.form.lookbackBlocks = '10';
        if (!state.form.limit || state.form.limit === '50' || state.form.limit === '8') state.form.limit = '10';
        state.form.minNetProfit = '';
        state.form.rpcUrl = '';
        state.form.addressProvider = '';
        state.form.user = '';
        state.form.contract = '';
        state.form.allowRisky = false;
        state.form.autoSwap = false;
        state.form.broadcast = false;
        state.form.distributeProfit = false;
        state.form.deploy = false;
        state.form.liquidationOnly = false;
        if (!state.flashloanDeskFilter) {
          state.flashloanDeskFilter = 'all';
        }
      }

      function syncFlashloanDeskInputs() {
        ensureFlashloanDeskState();
        const marketSelect = document.getElementById('flashloanMarketSelect');
        const lookbackInput = document.getElementById('flashloanLookbackInput');
        const limitInput = document.getElementById('flashloanLimitInput');
        if (marketSelect) marketSelect.value = normalizeFlashloanDeskPeriod(state.flashloanPeriod);
        if (lookbackInput) lookbackInput.value = state.form.lookbackBlocks || '10';
        if (limitInput) limitInput.value = state.form.limit || '10';
      }

      function syncFlashloanDeskStateFromInputs() {
        ensureFlashloanDeskState();
        const marketSelect = document.getElementById('flashloanMarketSelect');
        const lookbackInput = document.getElementById('flashloanLookbackInput');
        const limitInput = document.getElementById('flashloanLimitInput');
        const selectedPeriod = marketSelect ? String(marketSelect.value || '7') : '7';
        state.flashloanPeriod = normalizeFlashloanDeskPeriod(selectedPeriod);
        localStorage.setItem('dashboard-flashloan-period', state.flashloanPeriod);
        state.form.market = 'flashloan-transactions';
        state.form.chain = 'ethereum';
        state.form.lookbackBlocks = String(flashloanDeskPositiveInteger(lookbackInput ? lookbackInput.value : '10', 10, 1, 20));
        state.form.limit = String(flashloanDeskPositiveInteger(limitInput ? limitInput.value : '10', 10, 1, 20));
        state.form.minNetProfit = '';
        state.form.rpcUrl = '';
        state.form.addressProvider = '';
        state.form.user = '';
        state.form.contract = '';
        state.form.allowRisky = false;
        state.form.autoSwap = false;
        state.form.broadcast = false;
        state.form.distributeProfit = false;
        state.form.deploy = false;
        state.form.liquidationOnly = false;
      }

      function flashloanDeskRows() {
        ensureFlashloanDeskState();
        const payload = flashloanDeskPayload();
        const latestLimit = flashloanDeskPositiveInteger(state.form.lookbackBlocks, 10, 1, 20);
        const topLimit = flashloanDeskPositiveInteger(state.form.limit, 10, 1, 20);
        const latestRows = payload && payload.latest && Array.isArray(payload.latest.rows)
          ? payload.latest.rows.slice(0, latestLimit).map(function (row) {
              return Object.assign({}, row, { deskSource: 'latest' });
            })
          : [];
        const topRows = payload && payload.top && Array.isArray(payload.top.rows)
          ? payload.top.rows.slice(0, topLimit).map(function (row) {
              return Object.assign({}, row, { deskSource: 'top' });
            })
          : [];
        const seen = {};
        return latestRows.concat(topRows).filter(function (row) {
          const key = [
            row && (row.txHash || row.hash) ? String(row.txHash || row.hash) : '',
            row && row.borrower ? String(row.borrower) : '',
            row && row.asset ? String(row.asset) : '',
            row && row.amount !== undefined ? String(row.amount) : ''
          ].join('|');
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        });
      }

      function flashloanDeskActionTone(row) {
        if (row && row.deskSource === 'latest') return 'is-ready';
        if (row && row.deskSource === 'top') return 'is-blocked';
        return 'is-watch';
      }

      function flashloanDeskActionLabel(row) {
        if (state.flashloanDeskFilter === 'watch') return t('flashloanDeskActionWatch');
        if (row && row.deskSource === 'latest') return t('flashloanDeskActionReady');
        if (row && row.deskSource === 'top') return t('flashloanDeskActionBlocked');
        return t('flashloanDeskActionWatch');
      }

      function flashloanDeskFilteredRows() {
        const rows = flashloanDeskRows().slice().sort(function (left, right) {
          const leftTime = toNumber(left && left.time ? left.time : null) || 0;
          const rightTime = toNumber(right && right.time ? right.time : null) || 0;
          return rightTime - leftTime;
        });

        if (state.flashloanDeskFilter === 'executable') {
          return rows.filter(function (row) { return row.deskSource === 'latest'; });
        }
        if (state.flashloanDeskFilter === 'blocked') {
          return rows.filter(function (row) { return row.deskSource === 'top'; });
        }
        if (state.flashloanDeskFilter === 'watch') {
          return rows.slice().sort(function (left, right) {
            return (toNumber(right && right.fee !== undefined ? right.fee : null) || 0) -
              (toNumber(left && left.fee !== undefined ? left.fee : null) || 0);
          });
        }
        return rows;
      }

      function renderFlashloanDeskSummary() {
        const payload = flashloanDeskPayload();
        const summary = payload && payload.summary && payload.summary.data ? payload.summary.data : null;
        const rows = flashloanDeskRows();
        const bestRow = flashloanDeskFilteredRows()[0] || rows[0] || null;
        const bestMeta = bestRow
          ? [
              bestRow.asset || '--',
              bestRow.protocol || '--',
              bestRow.txHash ? shortAddress(String(bestRow.txHash)) : '--'
            ].join(' / ')
          : '--';
        const refreshValue = state.loading.eigenphiFlashloanOverview ? 'LOADING' : 'READ ONLY';
        const refreshMeta = flashloanSourceError(payload)
          ? (state.language === 'zh' ? '数据源不可用' : 'Data source unavailable')
          : payload && payload.fetchedAt
          ? String(payload.fetchedAt)
          : '--';

        text('flashloanSummaryBestLabel', t('flashloanDeskSummaryBest'));
        text('flashloanSummaryBestValue', summary ? formatUsd(summary.amount) : '--');
        text('flashloanSummaryBestMeta', bestMeta);
        text('flashloanSummaryReadyLabel', t('flashloanDeskSummaryExecutable'));
        text('flashloanSummaryReadyValue', summary ? formatInteger(summary.txCount) : String(rows.length));
        text(
          'flashloanSummaryReadyMeta',
          (summary ? formatInteger(summary.flashloanCount) : String(rows.length)) + ' ' + t('flashloanDeskBlockedSuffix')
        );
        text('flashloanSummaryBroadcastLabel', t('flashloanDeskSummaryBroadcast'));
        text('flashloanSummaryBroadcastValue', refreshValue);
        text('flashloanSummaryBroadcastMeta', refreshMeta);
      }

      function renderFlashloanDeskTable() {
        text('flashloanThUser', t('flashloanDeskCols')[0]);
        text('flashloanThPair', t('flashloanDeskCols')[1]);
        text('flashloanThSignal', t('flashloanDeskCols')[2]);
        text('flashloanThHf', t('flashloanDeskCols')[3]);
        text('flashloanThNet', t('flashloanDeskCols')[4]);
        text('flashloanThStatus', t('flashloanDeskCols')[5]);
        text('flashloanThAction', t('flashloanDeskCols')[6]);

        const rows = flashloanDeskFilteredRows();
        html('flashloanOpportunityRows', rows.length ? rows.map(function (row) {
          const rowClass = row.deskSource === 'latest'
            ? ' class="is-broadcastable"'
            : (row.deskSource === 'top' ? ' class="is-liquidatable"' : '');
          return '<tr' + rowClass + '>' +
            '<td>' + renderLeaderboardHash(row.txHash || row.hash || '--') + '</td>' +
            '<td>' + renderLeaderboardAddress(row.borrower || '--') + '<span style="color:#7f8795;"> / </span>' + renderLeaderboardAsset(row.asset || '--') + '</td>' +
            '<td>' + escapeHtml(String(row.purpose || '--')) + '</td>' +
            '<td>' + escapeHtml(formatUsd(row.amount)) + '</td>' +
            '<td>' + escapeHtml(formatUsd(row.fee)) + '</td>' +
            '<td>' + renderLeaderboardProtocol(row.protocol || '--') + '</td>' +
            '<td>' + escapeHtml(formatLeaderboardTime(row.time)) + ' <span class="flashloan-action-chip ' + escapeHtml(flashloanDeskActionTone(row)) + '">' + escapeHtml(flashloanDeskActionLabel(row)) + '</span></td>' +
          '</tr>';
        }).join('') : '<tr><td colspan="7" style="text-align:center; color:#8e98ab;">' + escapeHtml(flashloanUnavailableText(flashloanDeskPayload())) + '</td></tr>');
      }

      function renderFlashloanDeskControls() {
        text('flashloanMarketLabel', t('flashloanDeskPeriodLabel'));
        text('flashloanLookbackLabel', t('flashloanDeskLatestLimitLabel'));
        text('flashloanLimitLabel', t('flashloanDeskTopLimitLabel'));
        [
          ['flashloanFilterAll', 'all', t('flashloanDeskFilterAll')],
          ['flashloanFilterExecutable', 'executable', t('flashloanDeskFilterExecutable')],
          ['flashloanFilterBlocked', 'blocked', t('flashloanDeskFilterBlocked')],
          ['flashloanFilterWatch', 'watch', t('flashloanDeskFilterWatch')]
        ].forEach(function (entry) {
          const node = document.getElementById(entry[0]);
          if (!node) return;
          node.textContent = entry[2];
          node.classList.toggle('is-active', state.flashloanDeskFilter === entry[1]);
        });
      }

      function syncFlashloanConsoleTableHeight() {
        const page = document.getElementById('pageFlashloanConsole');
        const tableWrap = page ? page.querySelector('.console-results-table-wrap') : null;
        if (!page || !page.classList.contains('active') || !tableWrap) {
          if (tableWrap) tableWrap.style.removeProperty('height');
          return;
        }

        const rect = tableWrap.getBoundingClientRect();
        const viewportHeight = window.visualViewport && window.visualViewport.height
          ? window.visualViewport.height
          : (window.innerHeight || document.documentElement.clientHeight || 0);
        const footer = document.querySelector('.app-footer');
        const footerRect = footer ? footer.getBoundingClientRect() : null;
        const lowerEdge = footerRect && footerRect.top > rect.top && footerRect.top < viewportHeight
          ? footerRect.top
          : viewportHeight;
        const bottomGap = 30;
        const availableHeight = Math.floor(lowerEdge - rect.top - bottomGap);

        if (availableHeight > 0) {
          tableWrap.style.height = availableHeight + 'px';
        } else {
          tableWrap.style.removeProperty('height');
        }
      }

      function renderFlashloanSummary(payload) {
        const summary = payload && payload.summary && payload.summary.data ? payload.summary.data : null;
        const leftRows = summary
          ? [
              [t('flashloanSummaryLeftRows')[0], formatInteger(summary.txCount)],
              [t('flashloanSummaryLeftRows')[1], formatUsd(summary.amount)],
              [t('flashloanSummaryLeftRows')[2], formatUsd(summary.fee)]
            ]
          : t('flashloanSummaryLeftRows').map(function (label) { return [label, '--']; });
        const rightRows = summary
          ? [
              [t('flashloanSummaryRightRows')[0], formatInteger(summary.flashloanCount)],
              [t('flashloanSummaryRightRows')[1], formatInteger(summary.flashloanBorrowerCount)],
              [t('flashloanSummaryRightRows')[2], formatInteger(summary.flashloanAssetCount)]
            ]
          : t('flashloanSummaryRightRows').map(function (label) { return [label, '--']; });
        html('flashloanSummaryLeft', leftRows.map(function (row) {
          return '<div class="summary-row"><div class="summary-label">' + escapeHtml(row[0]) + '</div><div class="summary-value">' + escapeHtml(row[1]) + '</div></div>';
        }).join(''));
        html('flashloanSummaryRight', rightRows.map(function (row) {
          return '<div class="summary-row"><div class="summary-label">' + escapeHtml(row[0]) + '</div><div class="summary-value">' + escapeHtml(row[1]) + '</div></div>';
        }).join(''));
        text(
          'flashloanSummaryUpdated',
          flashloanSourceError(payload)
            ? (state.language === 'zh' ? '数据源不可用' : 'Data source unavailable')
            : payload && payload.summary ? formatRelativeFromUnix(payload.summary.updateTimestamp) : '--'
        );
      }

      function formatFlashloanTrendTooltipDate(timestamp, period) {
        const numeric = toNumber(timestamp);
        if (numeric === null) return '--';
        const date = new Date(numeric * 1000);
        if (period === '1') {
          return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
            timeZoneName: 'short'
          });
        }
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC'
        });
      }

      function renderFlashloanTrend(payload) {
        const rows = payload && payload.trend && Array.isArray(payload.trend.data) ? payload.trend.data : [];
        if (!rows.length) {
          destroyChart('flashloanTrend');
          html('flashloanTrendChart', chartWatermarkMarkup() + '<div class="chart-empty">' + escapeHtml(flashloanSourceError(payload) ? flashloanUnavailableText(payload) : t('noTrendData')) + '</div>');
          text('flashloanTrendUpdated', '--');
          return;
        }
        const period = state.flashloanPeriod;
        const previousPeriod = state.overviewPeriod;
        let labels;
        let amountAxis;
        let txAxis;
        try {
          state.overviewPeriod = period;
          labels = buildTrendLabels(rows);
          amountAxis = buildTrendAmountAxisConfig(Math.max(1, ...rows.map(function (row) { return toNumber(row.amount) || 0; })));
          txAxis = buildTrendAxisConfig(Math.max(1, ...rows.map(function (row) { return toNumber(row.txCount) || 0; })));
        } finally {
          state.overviewPeriod = previousPeriod;
        }
        const canvasId = 'flashloanTrendCanvas';
        html('flashloanTrendChart', chartWatermarkMarkup() + '<canvas id="' + canvasId + '"></canvas>');
        text('flashloanTrendUpdated', formatRelativeFromUnix(payload.trend && payload.trend.updateTimestamp));
        destroyChart('flashloanTrend');
        const canvas = document.getElementById(canvasId);
        if (!canvas || !window.Chart) return;
        state.charts.flashloanTrend = new window.Chart(canvas.getContext('2d'), {
          data: {
            labels: labels,
            datasets: [
              {
                type: 'bar',
                label: t('flashloanTrendAmountLabel'),
                data: rows.map(function (row) { return toNumber(row.amount) || 0; }),
                backgroundColor: 'rgba(102,228,155,0.82)',
                borderRadius: 2,
                yAxisID: 'y'
              },
              {
                type: 'line',
                label: t('flashloanTrendTxLabel'),
                data: rows.map(function (row) { return toNumber(row.txCount) || 0; }),
                borderColor: '#1798ff',
                backgroundColor: '#1798ff',
                pointBackgroundColor: '#1798ff',
                pointBorderColor: '#1798ff',
                pointRadius: 3.5,
                pointHoverRadius: 7,
                tension: 0.42,
                borderWidth: 2.2,
                yAxisID: 'y1'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { left: 6, right: 8, top: 6, bottom: 0 } },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: '#afb4be',
                  usePointStyle: true,
                  pointStyle: 'circle',
                  generateLabels: function (chart) { return buildLegendLabels(chart); },
                  boxWidth: 10,
                  boxHeight: 10,
                  padding: 22,
                  font: { size: 10.5, weight: '600' }
                }
              },
              tooltip: {
                backgroundColor: 'rgba(248,248,248,0.82)',
                borderColor: 'rgba(102,228,155,0.95)',
                borderWidth: 1.25,
                titleColor: '#171a1f',
                bodyColor: '#171a1f',
                callbacks: {
                  title: function (items) { return formatFlashloanTrendTooltipDate(rows[items[0].dataIndex].timestamp, period); },
                  label: function (context) {
                    return context.dataset.label + ': ' + (context.dataset.yAxisID === 'y' ? formatUsd(context.raw) : formatInteger(context.raw));
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                border: { color: 'rgba(255,255,255,0.16)' },
                ticks: { color: '#a7acb6', autoSkip: false, maxTicksLimit: period === '1' ? 6 : 8, maxRotation: 0, minRotation: 0, font: { size: 10.5 } }
              },
              y: {
                position: 'left',
                beginAtZero: true,
                max: amountAxis.max,
                grid: { display: false },
                border: { color: 'rgba(255,255,255,0.08)' },
                ticks: { color: '#7f8590', stepSize: amountAxis.step, callback: function (value) { return formatUsd(value).replace('.00', ''); }, font: { size: 10.5 } },
                title: { display: true, text: t('flashloanTrendAmountLabel'), color: '#7d828c', font: { size: 11, weight: '400' } }
              },
              y1: {
                position: 'right',
                beginAtZero: true,
                max: txAxis.max,
                grid: { display: false, drawOnChartArea: false },
                border: { display: false },
                ticks: { color: '#1798ff', stepSize: txAxis.step, callback: function (value) { return formatPlainTick(value); }, font: { size: 10.5 } },
                title: { display: true, text: t('flashloanTrendTxLabel'), color: '#1798ff', font: { size: 11, weight: '400' } }
              }
            }
          }
        });
      }

      function renderFlashloanTableRows(rows, columnCount) {
        if (!rows.length) return leaderboardEmptyRow(columnCount);
        return rows.map(function (row) {
          return '<tr>' +
            leaderboardDataCell(escapeHtml(formatLeaderboardTime(row.time))) +
            leaderboardDataCell(escapeHtml(String(row.purpose || '--'))) +
            leaderboardDataCell(renderLeaderboardHash(row.txHash || row.hash || '--')) +
            leaderboardDataCell(escapeHtml(formatUsd(row.amount)), 'is-numeric') +
            leaderboardDataCell(escapeHtml(formatUsd(row.fee)), 'is-numeric') +
            leaderboardDataCell(renderLeaderboardAddress(row.borrower || '--')) +
            leaderboardDataCell(renderLeaderboardAsset(row.asset || '--')) +
            leaderboardDataCell(renderLeaderboardProtocol(row.protocol || '--')) +
          '</tr>';
        }).join('');
      }

      function renderFlashloanRows(payload) {
        const latestCols = t('flashloanLatestCols');
        const topCols = t('flashloanTopCols');
        html('flashloanLatestHeaderRow', latestCols.map(function (label, index) {
          return leaderboardHeaderCell(label, index === 3 || index === 4 ? 'is-numeric' : '');
        }).join(''));
        html('flashloanTopHeaderRow', topCols.map(function (label, index) {
          return leaderboardHeaderCell(label, index === 3 || index === 4 ? 'is-numeric' : '');
        }).join(''));
        const latestRows = payload && payload.latest && Array.isArray(payload.latest.rows) ? payload.latest.rows : [];
        const topRows = payload && payload.top && Array.isArray(payload.top.rows) ? payload.top.rows : [];
        html('flashloanLatestRows', renderFlashloanTableRows(latestRows.slice(0, 10), latestCols.length));
        html('flashloanTopRows', renderFlashloanTableRows(topRows.slice(0, 10), topCols.length));
        text('flashloanLatestUpdated', payload && payload.latest ? formatRelativeFromUnix(payload.latest.updateTimestamp) : '--');
        text('flashloanTopUpdated', payload && payload.top ? formatRelativeFromUnix(payload.top.updateTimestamp) : '--');
      }

      function renderFlashloanProtocols(payload) {
        const rows = payload && payload.protocols && Array.isArray(payload.protocols.data) ? payload.protocols.data : [];
        html('flashloanProtocolRows', rows.length ? rows.map(function (row) {
          const info = row.protocolInfo || {};
          const showName = info.showName || info.name || row.protocol || '--';
          return '<tr>' +
            '<td>' + renderLeaderboardProtocol(showName) + '</td>' +
            '<td>' + escapeHtml(formatUsd(row.amount)) + '</td>' +
            '<td>' + escapeHtml(formatUsd(row.fee)) + '</td>' +
            '<td>' + escapeHtml(formatInteger(row.flashloanCount)) + '</td>' +
            '<td>' + escapeHtml(formatInteger(row.txCount)) + '</td>' +
            '<td>' + escapeHtml(formatInteger(row.borrowerCount)) + '</td>' +
            '<td>' + escapeHtml(formatInteger(row.flashloanAssetCount)) + '</td>' +
          '</tr>';
        }).join('') : '<tr><td colspan="7">--</td></tr>');
      }

      function renderFlashloanPagePayload(payload) {
        renderFlashloanSummary(payload);
        renderFlashloanTrend(payload);
        renderFlashloanRows(payload);
        renderFlashloanProtocols(payload);
      }

      function renderFlashloanDeskPayload() {
        syncFlashloanDeskInputs();
        renderFlashloanDeskControls();
        renderFlashloanDeskSummary();
        renderFlashloanDeskTable();
        requestAnimationFrame(syncFlashloanConsoleTableHeight);
      }
`;
