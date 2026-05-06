export const DASHBOARD_CONSOLE_RESULTS_LOGIC = String.raw`
        function targetBucket(target) {
          if (!target) return 'all';
          if (target.liquidatable) return 'liquidatable';
          const hf = toNumber(target.healthFactor);
          if (hf !== null && hf < 1.05) return 'risky';
          return 'safe';
        }

        function matchesConsoleRiskFilter(target) {
          if (state.consoleFilter === 'all') {
            return true;
          }
          if (state.consoleFilter === 'liquidatable') {
            return !!target && !!target.liquidatable;
          }
          return targetBucket(target) === state.consoleFilter;
        }

        function matchesConsoleSourceFilter(target) {
          return matchesTargetSourceFilter(target, state.consoleSourceFilter);
        }

        function renderConsoleTargetRow(target) {
          const hfTone = statusToneFromHf(target.healthFactor);
          const stateTone = target.liquidatable ? 'status-bad' : hfTone;
          const grossValue = toNumber(target.grossProfitDisplay);
          const grossTone = grossValue !== null && grossValue > 0 ? 'status-good' : '';
          const netValue = toNumber(target.roughNetProfitDisplay);
          const netTone = netValue !== null && netValue > 0 ? 'status-good' : '';
          const executionLabel = executionStatusForTarget(target);
          const executionTone =
            executionLabel === (state.language === 'zh' ? '门槛已通过' : 'Execution gate passed')
              ? 'status-good'
              : (
                  executionLabel === (state.language === 'zh' ? '净利为负' : 'Negative net') ||
                  executionLabel === (state.language === 'zh' ? '缺少可执行换币路由' : 'Missing executable swap route') ||
                  executionLabel === (state.language === 'zh' ? '换币报价超时或失败' : 'Swap quotes timed out or failed') ||
                  executionLabel === (state.language === 'zh' ? '换币路由利润门槛未通过' : 'Swap route failed profit gate') ||
                  executionLabel === (state.language === 'zh' ? '净利润低于广播阈值' : 'Net profit is below threshold') ||
                  executionLabel === (state.language === 'zh' ? '执行模拟未通过' : 'Execution simulation failed')
                )
                ? 'status-bad'
                : '';
          return '<tr' + (target.liquidatable ? ' class="is-liquidatable"' : '') + '>' +
            '<td class="user-cell"><span class="console-user-cell-content"><span class="console-user-address" role="button" tabindex="0" data-copy-value="' + escapeHtml(String(target.user || '')) + '" aria-label="' + escapeHtml(state.language === 'zh' ? '复制完整地址' : 'Copy full address') + '">' + escapeHtml(compactUserLabel(target.user || '--')) + '<span class="console-user-copy-tooltip">' + escapeHtml(state.language === 'zh' ? '复制' : 'Copy') + '</span></span></span></td>' +
            '<td class="' + hfTone + '">' + escapeHtml(String(target.healthFactor || '--')) + '</td>' +
            '<td class="' + stateTone + '">' + escapeHtml(String(target.state || '--')) + '</td>' +
            '<td class="' + executionTone + '">' + escapeHtml(String(executionLabel || '--')) + '</td>' +
            '<td>' + escapeHtml(String(target.debtSymbol || '--')) + '</td>' +
            '<td>' + escapeHtml(String(target.collateralSymbol || '--')) + '</td>' +
            '<td class="' + grossTone + '">' + escapeHtml(compactUsdDisplay(target.grossProfitDisplay || '--')) + '</td>' +
            '<td class="' + netTone + '">' + escapeHtml(compactUsdDisplay(target.roughNetProfitDisplay || '--')) + '</td>' +
          '</tr>';
        }

        function renderConsoleResultsMarkup(displayedTargets, scanStarted, morphoOnlyVisible) {
          if (!displayedTargets.length) {
            return '<tr><td colspan="8">' + escapeHtml(scanStarted ? t('targetsEmpty') : (state.language === 'zh' ? '暂无数据' : 'No data yet.')) + '</td></tr>';
          }
          if (!morphoOnlyVisible) {
            return displayedTargets.map(renderConsoleTargetRow).join('');
          }
          return groupTargetsByMarket(displayedTargets).map(function (group) {
            return '<tr class="console-results-group-row">' +
              '<td colspan="8">' +
                '<div class="console-results-group-head">' +
                  '<div class="console-results-group-title">' + escapeHtml(group.marketLabel || '--') + '</div>' +
                  '<div class="console-results-group-actions">' +
                    '<button class="ghost-button console-results-group-action console-market-filter-button" data-market-key="' + escapeHtml(group.marketKey || '--') + '" type="button">' + escapeHtml(t('morphoUseMarket')) + '</button>' +
                    '<button class="ghost-button console-results-group-action console-market-run-button" data-market-key="' + escapeHtml(group.marketKey || '--') + '" type="button">' + escapeHtml(t('morphoRunMarket')) + '</button>' +
                    '<button class="ghost-button console-results-group-action console-market-near-button" data-market-key="' + escapeHtml(group.marketKey || '--') + '" type="button">' + escapeHtml(t('morphoRunNear')) + '</button>' +
                    '<button class="ghost-button console-results-group-action console-market-liq-button" data-market-key="' + escapeHtml(group.marketKey || '--') + '" type="button">' + escapeHtml(t('morphoRunLiq')) + '</button>' +
                  '</div>' +
                '</div>' +
                renderMorphoTargetGroupSummary(group) +
                '<div class="console-results-group-meta">' +
                  escapeHtml(compactTargetMarketKey(group.marketKey || '--')) +
                  ' / ' +
                  escapeHtml(summarizeMorphoTargetGroup(group.targets)) +
                '</div>' +
              '</td>' +
            '</tr>' +
            group.targets.map(renderConsoleTargetRow).join('');
          }).join('');
        }
`;
