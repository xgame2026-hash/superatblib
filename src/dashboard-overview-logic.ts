import { DASHBOARD_OVERVIEW_LEADERBOARD_LOGIC } from './dashboard-overview-leaderboard-logic.js';
import { DASHBOARD_MORPHO_OVERVIEW_LOGIC } from './dashboard-morpho-overview-logic.js';

export const DASHBOARD_OVERVIEW_LOGIC = String.raw`
      function translateStrategyCompetition(value) {
        const label = String(value || '--');
        if (state.language !== 'zh') return label;
        if (label === 'high') return '高';
        if (label === 'medium') return '中';
        if (label === 'medium-low') return '中低';
        if (label === 'low') return '低';
        return label;
      }

      function translateStrategyNextStep(row) {
        const fallback = String(row && row.nextStep ? row.nextStep : '--');
        if (state.language === 'zh' && row && typeof row.nextStepZh === 'string' && row.nextStepZh) {
          return row.nextStepZh;
        }
        if (state.language !== 'zh') return fallback;
        const key = String(row && row.key ? row.key : '');
        const translations = {
          'aave-v3-ethereum': '继续作为主执行战场，但不要让它垄断新的市场发现。',
          'spark-ethereum': '保持 Spark 作为以太坊上的第二执行场所，并单独调优阈值，不要直接套用 Aave 主网参数。',
          'aave-v3-arbitrum': '把它当作第一个非以太坊主网执行场所，按链单独调 gas 和利润阈值，不要直接照搬 Ethereum。',
          'aave-v3-polygon': '保持 Polygon 的 RPC 和盈利阈值独立配置，避免被强行套用 Ethereum 默认参数。',
          'aave-v3-bnb': '先强化 RPC 质量检查和场所专属路由，再提升为常驻轮转市场。',
          'morpho-blue-ethereum': 'Adapter、route、planner、private skeleton 和 liquidate calldata draft 已接线，但 Morpho 仍缺 live repay/unwind calldata 与 relay submission，暂时不能作为真实执行市场。',
          'morpho-blue-base': '复用后续的 Morpho 适配器，并补上 Base 专属 RPC 与私有执行路由。',
          'compound-v3-arbitrum': '实现 Comet 清算适配器，并把路由假设从 Aave 储备逻辑里拆出来。',
          'euler-v2-ethereum': '研究 EVK 的清算语义，并建立独立的健康度/清算模型。',
          'gmx-v2-arbitrum': '把它视为独立策略线，执行需要感知预言机和订单簿，而不是作为借贷策略附属。',
          'hyperliquid': '把它做成独立执行系统，使用场所原生 API 和独立风控。'
        };
        return translations[key] || fallback;
      }

      function translateStrategyStatus(row) {
        if (row && typeof row.statusLabelZh === 'string' && state.language === 'zh') {
          return row.statusLabelZh;
        }
        if (row && typeof row.statusLabel === 'string' && state.language !== 'zh') {
          return row.statusLabel;
        }
        if (row && row.readiness === 'live') {
          return state.language === 'zh' ? '已执行' : 'Live';
        }
        if (row && row.readiness === 'next') {
          return state.language === 'zh' ? '准备中' : 'Next';
        }
        if (row && row.readiness === 'advanced') {
          return state.language === 'zh' ? '高级' : 'Advanced';
        }
        return state.language === 'zh' ? '研究中' : 'Research';
      }

      function strategyStatusTone(value) {
        if (value === 'status-good' || value === 'status-blue' || value === 'status-warn' || value === 'status-bad') {
          return value;
        }
        if (value === 'live') return 'status-good';
        if (value === 'next') return 'status-blue';
        if (value === 'advanced') return 'status-warn';
        return 'status-warn';
      }

      function strategyCompetitionTone(value) {
        if (value === 'high') return 'status-bad';
        if (value === 'medium') return 'status-warn';
        if (value === 'medium-low') return 'status-blue';
        if (value === 'low') return 'status-good';
        return '';
      }

      function strategyExecutionMarketKey(row) {
        const key = String(row && row.key ? row.key : '');
        const executableKeys = {
          'aave-v3-ethereum': true,
          'spark-ethereum': true,
          'aave-v3-arbitrum': true,
          'aave-v3-polygon': true,
          'aave-v3-bnb': true
        };
        return executableKeys[key] ? key : '';
      }

      function renderStrategyActions(row) {
        const key = String(row && row.key ? row.key : '');
        const buttons = [];
        const executionMarketKey = strategyExecutionMarketKey(row);
        const isSelectedMarket = executionMarketKey && executionMarketKey === state.form.market;
        if (executionMarketKey) {
          buttons.push(
            '<button class="ghost-button strategy-action-button' + (isSelectedMarket ? ' is-current-market' : '') + '" type="button" data-strategy-action="use-market" data-strategy-market="' + escapeHtml(executionMarketKey) + '"' + (isSelectedMarket ? ' disabled aria-disabled="true"' : '') + '>' +
              escapeHtml(isSelectedMarket ? t('strategyActionCurrentMarket') : t('strategyActionUseMarket')) +
            '</button>'
          );
          buttons.push(
            '<button class="ghost-button strategy-action-button" type="button" data-strategy-action="open-console" data-strategy-market="' + escapeHtml(executionMarketKey) + '">' +
              escapeHtml(t('strategyActionOpenConsole')) +
            '</button>'
          );
        } else if (key.indexOf('morpho-blue-') === 0) {
          buttons.push(
            '<button class="ghost-button strategy-action-button" type="button" data-strategy-action="open-morpho-page">' +
              escapeHtml(t('strategyActionOpenMorpho')) +
            '</button>'
          );
          buttons.push(
            '<button class="ghost-button strategy-action-button" type="button" data-strategy-action="open-morpho-settings">' +
              escapeHtml(t('strategyActionOpenMorphoSettings')) +
            '</button>'
          );
        }
        if (!buttons.length) return '';
        return '<div class="strategy-actions">' + buttons.join('') + '</div>';
      }

      function renderStrategyInsightBadges(row) {
        const badges = row && Array.isArray(row.insightBadges) ? row.insightBadges : [];
        if (!badges.length) return '';
        return '<div class="strategy-insight-badges">' + badges.map(function (badge) {
          const tone = strategyStatusTone(badge && badge.tone ? badge.tone : 'status-blue');
          const label = state.language === 'zh' && badge && typeof badge.labelZh === 'string' && badge.labelZh
            ? badge.labelZh
            : String(badge && badge.label ? badge.label : '--');
          return '<span class="strategy-chip strategy-insight-badge ' + escapeHtml(tone) + '">' + escapeHtml(label) + '</span>';
        }).join('') + '</div>';
      }

      function renderStrategyLabel(row) {
        const badges = [];
        if (row && row.currentEngine) {
          badges.push(state.language === 'zh' ? '当前主执行' : 'Current engine');
        }
        if (strategyExecutionMarketKey(row) && strategyExecutionMarketKey(row) === state.form.market) {
          badges.push(state.language === 'zh' ? '控制台已选' : 'Selected in console');
        }
        const badgeMarkup = badges.length
          ? '<span class="strategy-market-badges">' + badges.map(function (badge) {
              return '<span class="strategy-market-badge">' + escapeHtml(badge) + '</span>';
            }).join('') + '</span>'
          : '';
        return '<span class="protocol-name strategy-market-label">' +
          '<span class="strategy-market-title">' + escapeHtml(String(row && row.label ? row.label : '--')) + '</span>' +
          badgeMarkup +
        '</span>';
      }

      function formatRatioPercent(value) {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric)) return '--';
        return formatMetricNumber(numeric * 100, 1) + '%';
      }

      function formatBpsPercent(value) {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric)) return '--';
        return formatMetricNumber(numeric / 100, 1) + '%';
      }

      function formatSignedUsd(value) {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric)) return '--';
        const sign = numeric > 0 ? '+' : '';
        return sign + formatUsd(numeric);
      }

      function formatSignedPercent(value) {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric)) return '--';
        const sign = numeric > 0 ? '+' : '';
        return sign + formatMetricNumber(numeric * 100, 2) + '%';
      }

      function formatHealthFactor(value) {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric)) return '--';
        return formatMetricNumber(numeric, 3);
      }

${DASHBOARD_MORPHO_OVERVIEW_LOGIC}
${DASHBOARD_OVERVIEW_LEADERBOARD_LOGIC}

      function renderStrategyMarkets(summary) {
        const markets = summary && Array.isArray(summary.markets) ? summary.markets : [];
        text(
          'strategyMarketsSub',
          summary
            ? (
                state.language === 'zh'
                  ? '当前主执行：' + String(summary.currentExecutionLabel || '--') + ' / 控制台已选：' + String(state.form.market || '--') + ' / 下一步：' + String(summary.nextBuildLabel || '--') + ' / 进阶：' + String(summary.advancedTrackLabel || '--')
                  : 'Current: ' + String(summary.currentExecutionLabel || '--') + ' / Console: ' + String(state.form.market || '--') + ' / Next: ' + String(summary.nextBuildLabel || '--') + ' / Advanced: ' + String(summary.advancedTrackLabel || '--')
              )
            : t('strategyMarketsSub')
        );
        html('strategyMarketRows', markets.length ? markets.map(function (row) {
          const status = translateStrategyStatus(row);
          const segment =
            row.segment === 'perps'
              ? (state.language === 'zh' ? '永续' : 'Perps')
              : (state.language === 'zh' ? '借贷' : 'Lending');
          const executionMarketKey = strategyExecutionMarketKey(row);
          const isSelectedMarket = executionMarketKey && executionMarketKey === state.form.market;
          const statusTone = strategyStatusTone(row && row.statusTone ? row.statusTone : row.readiness);
          const competitionTone = strategyCompetitionTone(row.competition);
          const nextStep = translateStrategyNextStep(row);
          const actions = renderStrategyActions(row);
          const insightBadges = renderStrategyInsightBadges(row);
          return '<tr class="' + (isSelectedMarket ? 'strategy-row-selected' : '') + '">' +
            '<td>' + renderStrategyLabel(row) + '</td>' +
            '<td>' + escapeHtml(segment) + '</td>' +
            '<td>' + escapeHtml('#' + String(row.priority || '--')) + '</td>' +
            '<td><span class="strategy-chip ' + escapeHtml(statusTone) + '">' + escapeHtml(status) + '</span></td>' +
            '<td><span class="strategy-chip ' + escapeHtml(competitionTone) + '">' + escapeHtml(translateStrategyCompetition(row.competition || '--')) + '</span></td>' +
            '<td><div class="strategy-next-cell">' + insightBadges + '<div class="strategy-next-text">' + escapeHtml(nextStep) + '</div>' + actions + '</div></td>' +
          '</tr>';
        }).join('') : '<tr><td colspan="6">--</td></tr>');
      }

`;
