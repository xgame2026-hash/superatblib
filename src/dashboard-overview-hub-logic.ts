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
        renderOverviewSurfaceCardsSkeleton();
        renderOverviewNews();
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

      function renderOverviewNews() {
        const payload = state.data && state.data.strategyNews ? state.data.strategyNews : null;
        const remoteRows = payload && Array.isArray(payload.rows) ? payload.rows.slice(0, 5) : [];
        const fallbackItems = [
          {
            tag: state.language === 'zh' ? '架构' : 'Architecture',
            title: state.language === 'zh' ? '首页改为服务端快照入口' : 'Overview now favors server snapshots',
            body: state.language === 'zh'
              ? '高频变化数据后续由服务器定时汇总到 Redis，客户端只读取快照，减少端点压力。'
              : 'High-churn data can be aggregated into Redis by the server; the client reads snapshots instead of polling every endpoint.'
          },
          {
            tag: state.language === 'zh' ? '策略' : 'Strategy',
            title: state.language === 'zh' ? '执行市场只接入已部署策略' : 'Execution markets require deployed strategies',
            body: state.language === 'zh'
              ? '控制台只展示服务器已部署、已预检通过的 ETH / ARB / BNB 策略市场。'
              : 'The console only exposes ETH / ARB / BNB strategy markets that are deployed and prechecked on the server.'
          },
          {
            tag: state.language === 'zh' ? '维护' : 'Maintenance',
            title: state.language === 'zh' ? 'BASE / POLYGON 继续维护' : 'BASE / POLYGON remain in maintenance',
            body: state.language === 'zh'
              ? '相关节点不进入执行市场，也不参与立即同步与清算队列。'
              : 'These nodes stay out of execution markets, immediate sync, and liquidation queues.'
          }
        ];
        const items = remoteRows.length
          ? remoteRows.map(function (row) {
              return {
                tag: row.tag || (state.language === 'zh' ? '资讯' : 'Intel'),
                title: row.title || '--',
                body: row.content || row.body || '--',
                time: row.time || row.createdAt || ''
              };
            })
          : fallbackItems;
        text('overviewNewsTitle', state.language === 'zh' ? '最新资讯' : 'Latest Intel');
        text(
          'overviewNewsSub',
          remoteRows.length
            ? (
                state.language === 'zh'
                  ? '来自 news.supermtnode.io 的策略资讯，首页只读取最新 5 条。'
                  : 'Strategy intel from news.supermtnode.io. Overview reads the latest 5 rows.'
              )
            : (
                state.language === 'zh'
                  ? '资讯服务未返回数据，当前显示本地默认内容。'
                  : 'News service returned no rows. Showing local fallback content.'
              )
        );
        html('overviewNewsList', items.map(function (item) {
          return '<article class="overview-news-item">' +
            '<div class="overview-news-tag">' + escapeHtml(item.tag) + '</div>' +
            '<div class="overview-news-copy">' +
              '<div class="overview-news-title">' + escapeHtml(item.title) + '</div>' +
              (item.time ? '<div class="overview-news-time">' + escapeHtml(formatNewsTime(item.time)) + '</div>' : '') +
              '<div class="overview-news-body">' + escapeHtml(item.body) + '</div>' +
            '</div>' +
          '</article>';
        }).join(''));
      }

      function formatNewsTime(value) {
        const time = Date.parse(String(value || ''));
        if (!Number.isFinite(time)) return String(value || '');
        try {
          return new Date(time).toLocaleString(state.language === 'zh' ? 'zh-CN' : 'en-US', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        } catch (_error) {
          return String(value || '');
        }
      }

      function summarizeBscTailScan(payload) {
        const rows = payload && Array.isArray(payload.rows) ? payload.rows : [];
        const shortfall = rows.filter(function (row) { return row && row.status === 'shortfall'; }).length;
        const near = rows.filter(function (row) { return row && row.status === 'near'; }).length;
        return {
          ok: Boolean(payload && payload.ok),
          markets: payload && typeof payload.markets === 'number' ? payload.markets : null,
          candidates: payload && typeof payload.candidates === 'number' ? payload.candidates : null,
          shortfall: shortfall,
          near: near,
          actionable: shortfall + near,
          error: payload && payload.error ? String(payload.error) : ''
        };
      }

      function renderOverviewSurfaceCards(liquidation, flashloan, morphoPayload) {
        const morphoAnalysis = morphoPayload && morphoPayload.analysis ? morphoPayload.analysis : null;
        const bscTail = summarizeBscTailScan(state.data.bscTailScan);
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
          },
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
        const summary = liquidation && liquidation.summary && liquidation.summary.data ? liquidation.summary.data : null;
        const flashloanSummary = flashloan && flashloan.summary && flashloan.summary.data ? flashloan.summary.data : null;
        const bscTail = summarizeBscTailScan(state.data.bscTailScan);

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
            [t('overviewHubRightRows')[2], bscTail.candidates !== null ? formatInteger(bscTail.candidates) : '--'],
            [t('overviewHubRightRows')[3], bscTail.ok ? formatInteger(bscTail.actionable) : '--']
          ]
        );

        const overviewSnapshot = state.data && state.data.overviewSnapshot ? state.data.overviewSnapshot : null;
        const snapshotGeneratedAt = overviewSnapshot && overviewSnapshot.generatedAt
          ? Date.parse(overviewSnapshot.generatedAt) / 1000
          : null;
        const updatedTimes = [
          liquidation && liquidation.summary ? liquidation.summary.updateTimestamp : null,
          flashloan && flashloan.summary ? flashloan.summary.updateTimestamp : null,
          morphoPayload && morphoPayload.generatedAt ? Date.parse(morphoPayload.generatedAt) / 1000 : null
        ].filter(function (value) { return Number.isFinite(value); });
        const latestUpdated = Number.isFinite(snapshotGeneratedAt)
          ? snapshotGeneratedAt
          : (updatedTimes.length ? Math.max.apply(null, updatedTimes) : null);
        text('overviewHubUpdated', latestUpdated ? formatRelativeFromUnix(latestUpdated) : '--');

        renderOverviewSurfaceCards(liquidation, flashloan, morphoPayload);
        text('overviewSurfacesSub', '');
        renderOverviewNews();
      }
`;
