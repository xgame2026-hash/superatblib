export const DASHBOARD_OVERVIEW_HUB_LOGIC = String.raw`
      function renderOverviewHubSkeletonRows(columns, rowCount) {
        return Array.from({ length: rowCount }).map(function () {
          return '<tr>' + Array.from({ length: columns }).map(function () {
            return '<td><div class="skeleton-table-cell"></div></td>';
          }).join('') + '</tr>';
        }).join('');
      }

      function renderOverviewSurfaceCardsSkeleton() {
        html('overviewSurfaceCards', Array.from({ length: 3 }).map(function () {
          return '<article class="overview-surface-card overview-surface-card-skeleton">' +
            '<div class="overview-surface-card-head">' +
              '<div class="overview-surface-card-head-copy">' +
                '<div class="skeleton-line overview-surface-skeleton-title"></div>' +
                '<div class="skeleton-line overview-surface-skeleton-sub"></div>' +
              '</div>' +
              '<div class="skeleton-block overview-surface-skeleton-button"></div>' +
            '</div>' +
            '<div class="overview-surface-card-metrics">' +
              '<div class="overview-surface-metric"><span class="skeleton-line overview-surface-skeleton-label"></span><strong class="skeleton-line overview-surface-skeleton-value"></strong></div>' +
              '<div class="overview-surface-metric"><span class="skeleton-line overview-surface-skeleton-label"></span><strong class="skeleton-line overview-surface-skeleton-value"></strong></div>' +
              '<div class="overview-surface-metric"><span class="skeleton-line overview-surface-skeleton-label"></span><strong class="skeleton-line overview-surface-skeleton-value"></strong></div>' +
            '</div>' +
          '</article>';
        }).join(''));
      }

      function renderOverviewHubSkeleton() {
        renderNamedSummaryColumns(
          'overviewHubLeft',
          'overviewHubRight',
          t('overviewHubLeftRows').map(function (label) { return [label, '--']; }),
          t('overviewHubRightRows').map(function (label) { return [label, '--']; })
        );
        html('overviewHubLeft', [
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>'
        ].join(''));
        html('overviewHubRight', [
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>',
          '<div class="summary-row"><div class="skeleton-table-cell"></div><div class="skeleton-table-cell"></div></div>'
        ].join(''));
        text('overviewHubUpdated', '--');
        text('overviewSurfacesSub', '--');
        text('overviewLiquidationSnapshotSub', '--');
        text('overviewFlashloanSnapshotSub', '--');
        renderOverviewSurfaceCardsSkeleton();
        html('overviewLiquidationSnapshotHeaderRow', renderOverviewSnapshotHeader(t('overviewLiquidationSnapshotCols')));
        html('overviewFlashloanSnapshotHeaderRow', renderOverviewSnapshotHeader(t('overviewFlashloanSnapshotCols')));
        html('overviewLiquidationSnapshotRows', renderOverviewHubSkeletonRows(5, 5));
        html('overviewFlashloanSnapshotRows', renderOverviewHubSkeletonRows(5, 5));
        html('strategyMarketRows', renderOverviewHubSkeletonRows(6, 6));
      }

      function renderNamedSummaryColumns(leftId, rightId, leftRows, rightRows) {
        html(leftId, leftRows.map(function (row) {
          return '<div class="summary-row"><div class="summary-label">' + escapeHtml(row[0]) + '</div><div class="summary-value">' + escapeHtml(row[1]) + '</div></div>';
        }).join(''));
        html(rightId, rightRows.map(function (row) {
          return '<div class="summary-row"><div class="summary-label">' + escapeHtml(row[0]) + '</div><div class="summary-value">' + escapeHtml(row[1]) + '</div></div>';
        }).join(''));
      }

      function renderOverviewSnapshotHeader(labels) {
        return labels.map(function (label) {
          return '<th>' + escapeHtml(label) + '</th>';
        }).join('');
      }

      function renderOverviewLatestLiquidationRows(payload) {
        const rows = payload && Array.isArray(payload.rows) ? payload.rows : [];
        if (!rows.length) {
          return '<tr><td colspan="5">--</td></tr>';
        }
        return rows.slice(0, 5).map(function (row) {
          return '<tr>' +
            '<td>' + escapeHtml(formatLeaderboardTime(row.time)) + '</td>' +
            '<td>' + renderLeaderboardHash(row.txHash) + '</td>' +
            '<td>' + renderLeaderboardAsset(row.liquidationAsset || row.asset) + '</td>' +
            '<td class="is-numeric">' + escapeHtml(formatUsd(row.liquidationAmount || row.amount)) + '</td>' +
            '<td>' + renderLeaderboardProtocol(row.protocol) + '</td>' +
          '</tr>';
        }).join('');
      }

      function renderOverviewFlashloanRows(payload) {
        const rows = payload && payload.latest && Array.isArray(payload.latest.rows) ? payload.latest.rows : [];
        if (!rows.length) {
          return '<tr><td colspan="5">--</td></tr>';
        }
        return rows.slice(0, 5).map(function (row) {
          return '<tr>' +
            '<td>' + escapeHtml(formatLeaderboardTime(row.time)) + '</td>' +
            '<td>' + renderLeaderboardHash(row.txHash) + '</td>' +
            '<td>' + escapeHtml(String(row.purpose || '--')) + '</td>' +
            '<td class="is-numeric">' + escapeHtml(formatUsd(row.amount)) + '</td>' +
            '<td>' + renderLeaderboardProtocol(row.protocol) + '</td>' +
          '</tr>';
        }).join('');
      }

      function renderOverviewSurfaceCards(liquidation, flashloan, morphoPayload) {
        const morphoAnalysis = morphoPayload && morphoPayload.analysis ? morphoPayload.analysis : null;
        const cards = [
          {
            key: 'liquidation',
            title: t('overviewSurfaceLiquidationTitle'),
            sub: t('overviewSurfaceLiquidationSub'),
            buttonIcon: '/img/liquidationicon.svg',
            lines: [
              [t('overviewSurfaceMetricAmount'), liquidation && liquidation.summary && liquidation.summary.data ? formatUsd(liquidation.summary.data.liquidationAmount) : '--'],
              [t('overviewSurfaceMetricTxCount'), liquidation && liquidation.summary && liquidation.summary.data ? formatInteger(liquidation.summary.data.txCount) : '--'],
              [t('overviewSurfaceMetricRisk'), liquidation && liquidation.summary && liquidation.summary.data ? formatInteger(liquidation.summary.data.liquidatedBorrowerCount) : '--']
            ],
            button: t('overviewSurfaceOpenLiquidation')
          },
          {
            key: 'flashloan',
            title: t('overviewSurfaceFlashloanTitle'),
            sub: t('overviewSurfaceFlashloanSub'),
            buttonIcon: '/img/flashloanicon.svg',
            lines: [
              [t('overviewSurfaceMetricAmount'), flashloan && flashloan.summary && flashloan.summary.data ? formatUsd(flashloan.summary.data.amount) : '--'],
              [t('overviewSurfaceMetricTxCount'), flashloan && flashloan.summary && flashloan.summary.data ? formatInteger(flashloan.summary.data.txCount) : '--'],
              [t('overviewSurfaceMetricRisk'), flashloan && flashloan.summary && flashloan.summary.data ? formatInteger(flashloan.summary.data.flashloanBorrowerCount) : '--']
            ],
            button: t('overviewSurfaceOpenFlashloan')
          },
          {
            key: 'morpho',
            title: t('overviewSurfaceMorphoTitle'),
            sub: t('overviewSurfaceMorphoSub'),
            buttonIcon: '/img/map.svg',
            lines: [
              [t('overviewSurfaceMetricMarkets'), morphoPayload && typeof morphoPayload.registryCount === 'number' ? String(morphoPayload.registryCount) : '--'],
              [t('overviewSurfaceMetricLiq'), morphoAnalysis && typeof morphoAnalysis.liquidatablePositions === 'number' ? String(morphoAnalysis.liquidatablePositions) : '--'],
              [t('overviewSurfaceMetricRisk'), morphoAnalysis && typeof morphoAnalysis.riskyPositions === 'number' ? String(morphoAnalysis.riskyPositions) : '--']
            ],
            button: t('overviewSurfaceOpenMorpho')
          }
        ];
        html('overviewSurfaceCards', cards.map(function (card) {
          return '<article class="overview-surface-card">' +
            '<div class="overview-surface-card-head">' +
              '<div>' +
                '<div class="overview-surface-card-title">' + escapeHtml(card.title) + '</div>' +
                '<div class="overview-surface-card-sub">' + escapeHtml(card.sub) + '</div>' +
              '</div>' +
              '<button class="ghost-button overview-surface-open" type="button" data-page-link="' + escapeHtml(card.key) + '">' +
                '<img class="overview-surface-open-icon" src="' + escapeHtml(card.buttonIcon) + '" alt="" aria-hidden="true" />' +
                '<span>' + escapeHtml(card.button) + '</span>' +
              '</button>' +
            '</div>' +
            '<div class="overview-surface-card-metrics">' +
              card.lines.map(function (line) {
                return '<div class="overview-surface-metric"><span>' + escapeHtml(line[0]) + '</span><strong>' + escapeHtml(line[1]) + '</strong></div>';
              }).join('') +
            '</div>' +
          '</article>';
        }).join(''));
      }

      function renderOverviewHub() {
        const liquidation = state.data.eigenphiOverview;
        const flashloan = state.data.eigenphiFlashloanOverview;
        const morphoPayload = state.data.morphoBlueMarkets;
        const morphoAnalysis = morphoPayload && morphoPayload.analysis ? morphoPayload.analysis : null;
        const strategy = state.data.strategy;
        const summary = liquidation && liquidation.summary && liquidation.summary.data ? liquidation.summary.data : null;
        const flashloanSummary = flashloan && flashloan.summary && flashloan.summary.data ? flashloan.summary.data : null;

        renderNamedSummaryColumns(
          'overviewHubLeft',
          'overviewHubRight',
          [
            [t('overviewHubLeftRows')[0], summary ? formatUsd(summary.liquidationAmount) : '--'],
            [t('overviewHubLeftRows')[1], summary ? formatInteger(summary.txCount) : '--'],
            [t('overviewHubLeftRows')[2], flashloanSummary ? formatUsd(flashloanSummary.amount) : '--'],
            [t('overviewHubLeftRows')[3], flashloanSummary ? formatInteger(flashloanSummary.txCount) : '--']
          ],
          [
            [t('overviewHubRightRows')[0], morphoAnalysis ? String(morphoAnalysis.riskyPositions || 0) : '--'],
            [t('overviewHubRightRows')[1], morphoAnalysis ? String(morphoAnalysis.liquidatablePositions || 0) : '--'],
            [t('overviewHubRightRows')[2], strategy && Array.isArray(strategy.markets) ? String(strategy.markets.length) : '--'],
            [t('overviewHubRightRows')[3], strategy ? String(strategy.currentExecutionLabel || '--') : '--']
          ]
        );

        const updatedTimes = [
          liquidation && liquidation.summary ? liquidation.summary.updateTimestamp : null,
          flashloan && flashloan.summary ? flashloan.summary.updateTimestamp : null,
          morphoPayload && morphoPayload.generatedAt ? Date.parse(morphoPayload.generatedAt) / 1000 : null
        ].filter(function (value) { return Number.isFinite(value); });
        const latestUpdated = updatedTimes.length ? Math.max.apply(null, updatedTimes) : null;
        text('overviewHubUpdated', latestUpdated ? formatRelativeFromUnix(latestUpdated) : '--');

        renderOverviewSurfaceCards(liquidation, flashloan, morphoPayload);
        text(
          'overviewSurfacesSub',
          state.language === 'zh'
            ? '总览只做入口聚合，详细分析请进入各专题页。'
            : 'Overview stays aggregated. Use the dedicated pages for detailed analysis.'
        );

        html('overviewLiquidationSnapshotHeaderRow', renderOverviewSnapshotHeader(t('overviewLiquidationSnapshotCols')));
        html('overviewFlashloanSnapshotHeaderRow', renderOverviewSnapshotHeader(t('overviewFlashloanSnapshotCols')));
        html('overviewLiquidationSnapshotRows', renderOverviewLatestLiquidationRows(state.data.eigenphiLatestLiquidation));
        html('overviewFlashloanSnapshotRows', renderOverviewFlashloanRows(flashloan));
        text('overviewLiquidationSnapshotSub', state.language === 'zh' ? '最近 5 条清算记录' : 'Latest 5 liquidation rows');
        text('overviewFlashloanSnapshotSub', state.language === 'zh' ? '最近 5 条闪电贷记录' : 'Latest 5 flashloan rows');
      }
`;
