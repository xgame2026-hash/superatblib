export const DASHBOARD_OVERVIEW_SKELETON_LOGIC = String.raw`
      function renderSummaryColumns(leftRows, rightRows) {
        html('summaryLeft', leftRows.map(function (row) {
          return '<div class="summary-row"><div class="summary-label">' + escapeHtml(row[0]) + '</div><div class="summary-value">' + escapeHtml(row[1]) + '</div></div>';
        }).join(''));
        html('summaryRight', rightRows.map(function (row) {
          return '<div class="summary-row"><div class="summary-label">' + escapeHtml(row[0]) + '</div><div class="summary-value">' + escapeHtml(row[1]) + '</div></div>';
        }).join(''));
      }

      function renderOverviewSkeleton() {
        renderSummaryColumns(
          t('summaryLeftRows').map(function (label) { return [label, '--']; }),
          t('summaryRightRows').map(function (label) { return [label, '--']; })
        );
        html('summaryLeft', [
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>'
        ].join(''));
        html('summaryRight', [
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>'
        ].join(''));
        text('summaryUpdated', '--');
        text('trendUpdated', '--');
        text('distributionUpdated', '--');
        text('latestLiquidationUpdated', '--');
        text('latestLiquidationRange', '0 - 0');
        html('trendChart',
          chartWatermarkMarkup() +
          '<div class="chart-empty" style="padding:24px;">' +
            '<div style="width:100%; display:grid; gap:12px;">' +
              '<div class="skeleton-line" style="width:24%;"></div>' +
              '<div class="skeleton-block" style="width:100%; height:160px;"></div>' +
              '<div style="display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:10px;">' +
                '<div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
        html('distributionChart',
          chartWatermarkMarkup() +
          '<div class="chart-empty" style="padding:24px;">' +
            '<div style="width:100%; display:grid; gap:12px;">' +
              '<div class="skeleton-line" style="width:28%;"></div>' +
              '<div class="skeleton-block" style="width:100%; height:160px;"></div>' +
            '</div>' +
          '</div>'
        );
        html('protocolRows', [
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>'
        ].join(''));
        html('leaderboardHeaderRow', '<th>Time</th><th>Liquidator</th><th>Asset</th><th>Profit</th><th>Cost</th><th>Revenue</th><th>Protocol</th>');
        html('leaderboardRows', [
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>'
        ].join(''));
        text('morphoBlueMetricMarketsValue', '--');
        text('morphoBlueMetricLiveValue', '--');
        text('morphoBlueMetricSupplyValue', '--');
        text('morphoBlueMetricBorrowValue', '--');
        text('morphoBlueMetricRiskyValue', '--');
        text('morphoBlueMetricNearValue', '--');
        text('morphoBlueMetricLiqValue', '--');
        text('morphoBlueMetricRiskBorrowValue', '--');
        html('morphoBlueRows', [
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>'
        ].join(''));
        html('morphoBlueOpportunityRows', [
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
          '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>'
        ].join(''));
        text('morphoBlueDisclaimer', '--');
        text('morphoBlueUpdated', '--');
        renderLatestLiquidation(null);
      }
`;
