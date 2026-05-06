export const DASHBOARD_MORPHO_SHARED_LOGIC = String.raw`
      function isMorphoBlueTarget(target) {
        return !!target && String(target.source || '').toLowerCase() === 'morpho-blue';
      }

      function matchesTargetSourceFilter(target, sourceFilter) {
        if (!sourceFilter || sourceFilter === 'all') {
          return true;
        }
        return !!target && String(target.source || '').toLowerCase() === String(sourceFilter).toLowerCase();
      }

      function compactTargetMarketKey(value) {
        const label = String(value || '--').trim();
        if (!/^0x[a-fA-F0-9]{64}$/.test(label)) {
          return label || '--';
        }
        return label.slice(0, 8) + '...' + label.slice(-6);
      }

      function groupTargetsByMarket(targets) {
        const groups = [];
        const map = new Map();
        (Array.isArray(targets) ? targets : []).forEach(function (target) {
          const key = String(target && (target.marketKey || target.marketLabel) ? (target.marketKey || target.marketLabel) : '--').toLowerCase();
          if (!map.has(key)) {
            const group = {
              key: key,
              marketKey: target && target.marketKey ? String(target.marketKey) : '--',
              marketLabel: target && target.marketLabel ? String(target.marketLabel) : '--',
              targets: []
            };
            map.set(key, group);
            groups.push(group);
          }
          map.get(key).targets.push(target);
        });
        groups.forEach(function (group) {
          group.summary = summarizeMorphoTargetGroupMetrics(group.targets);
        });
        groups.sort(function (left, right) {
          const leftSummary = left && left.summary ? left.summary : summarizeMorphoTargetGroupMetrics(left.targets);
          const rightSummary = right && right.summary ? right.summary : summarizeMorphoTargetGroupMetrics(right.targets);
          const sortKey = String(state.morphoMarketSort || 'liquidatable');
          if (sortKey === 'near') {
            if (leftSummary.nearLiquidationCount !== rightSummary.nearLiquidationCount) {
              return rightSummary.nearLiquidationCount - leftSummary.nearLiquidationCount;
            }
            if (leftSummary.liquidatableCount !== rightSummary.liquidatableCount) {
              return rightSummary.liquidatableCount - leftSummary.liquidatableCount;
            }
          } else if (sortKey === 'borrow') {
            if (leftSummary.maxBorrowUsd !== rightSummary.maxBorrowUsd) {
              return rightSummary.maxBorrowUsd - leftSummary.maxBorrowUsd;
            }
            if (leftSummary.liquidatableCount !== rightSummary.liquidatableCount) {
              return rightSummary.liquidatableCount - leftSummary.liquidatableCount;
            }
          } else if (sortKey === 'worst-hf') {
            if (leftSummary.worstHf !== rightSummary.worstHf) {
              return leftSummary.worstHf - rightSummary.worstHf;
            }
            if (leftSummary.liquidatableCount !== rightSummary.liquidatableCount) {
              return rightSummary.liquidatableCount - leftSummary.liquidatableCount;
            }
          } else {
            if (leftSummary.liquidatableCount !== rightSummary.liquidatableCount) {
              return rightSummary.liquidatableCount - leftSummary.liquidatableCount;
            }
            if (leftSummary.nearLiquidationCount !== rightSummary.nearLiquidationCount) {
              return rightSummary.nearLiquidationCount - leftSummary.nearLiquidationCount;
            }
          }
          if (leftSummary.nearLiquidationCount !== rightSummary.nearLiquidationCount) {
            return rightSummary.nearLiquidationCount - leftSummary.nearLiquidationCount;
          }
          if (leftSummary.maxBorrowUsd !== rightSummary.maxBorrowUsd) {
            return rightSummary.maxBorrowUsd - leftSummary.maxBorrowUsd;
          }
          if (leftSummary.worstHf !== rightSummary.worstHf) {
            return leftSummary.worstHf - rightSummary.worstHf;
          }
          return String(left.marketLabel || '').localeCompare(String(right.marketLabel || ''));
        });
        return groups;
      }

      function summarizeMorphoTargetGroupMetrics(targets) {
        const rows = Array.isArray(targets) ? targets : [];
        let worstHf = null;
        let liquidatableCount = 0;
        let nearLiquidationCount = 0;
        let maxBorrowUsd = null;
        rows.forEach(function (target) {
          if (target && target.liquidatable) {
            liquidatableCount += 1;
          }
          const rawKind = target && target.raw && target.raw.kind ? String(target.raw.kind) : '';
          if (rawKind === 'near-liquidation') {
            nearLiquidationCount += 1;
          }
          const hf = toNumber(target && target.healthFactor);
          if (hf !== null && (worstHf === null || hf < worstHf)) {
            worstHf = hf;
          }
          const borrowUsd = toNumber(target && target.selectionScoreDisplay);
          if (borrowUsd !== null && (maxBorrowUsd === null || borrowUsd > maxBorrowUsd)) {
            maxBorrowUsd = borrowUsd;
          }
        });
        return {
          count: rows.length,
          liquidatableCount: liquidatableCount,
          nearLiquidationCount: nearLiquidationCount,
          worstHf: worstHf === null ? Number.POSITIVE_INFINITY : worstHf,
          maxBorrowUsd: maxBorrowUsd === null ? 0 : maxBorrowUsd
        };
      }

      function summarizeMorphoTargetGroup(targets) {
        const metrics = summarizeMorphoTargetGroupMetrics(targets);
        const worstHfText = metrics.worstHf === Number.POSITIVE_INFINITY ? '--' : formatMetricNumber(metrics.worstHf, 3);
        const maxBorrowText = metrics.maxBorrowUsd <= 0 ? '--' : '$' + formatMetricNumber(metrics.maxBorrowUsd, metrics.maxBorrowUsd >= 1000 ? 0 : 2);
        return state.language === 'zh'
          ? (String(metrics.count) + ' 个仓位 / ' + String(metrics.liquidatableCount) + ' 可清算 / 最差 HF ' + worstHfText + ' / 最大借款 ' + maxBorrowText)
          : (String(metrics.count) + ' positions / ' + String(metrics.liquidatableCount) + ' liquidatable / worst HF ' + worstHfText + ' / max borrow ' + maxBorrowText);
      }

      function currentMorphoWindowLabel() {
        const kind = String(state.form.morphoKind || '').trim();
        const hfMax = String(state.form.hfMax || '').trim();
        if (kind === 'liquidatable') {
          return state.language === 'zh' ? '窗口 可清算' : 'Window Liquidatable';
        }
        if (kind === 'near-liquidation') {
          return state.language === 'zh'
            ? ('窗口 逼近' + (hfMax ? ' <= ' + hfMax : ''))
            : ('Window Near' + (hfMax ? ' <= ' + hfMax : ''));
        }
        if (kind === 'risky') {
          return state.language === 'zh'
            ? ('窗口 低 HF' + (hfMax ? ' <= ' + hfMax : ''))
            : ('Window Low HF' + (hfMax ? ' <= ' + hfMax : ''));
        }
        if (hfMax) {
          return state.language === 'zh' ? ('窗口 HF <= ' + hfMax) : ('Window HF <= ' + hfMax);
        }
        return state.language === 'zh' ? '窗口 全部' : 'Window All';
      }

      function currentMorphoSortLabel() {
        const sortKey = String(state.morphoMarketSort || 'liquidatable');
        if (sortKey === 'near') {
          return state.language === 'zh' ? '排序 按逼近' : 'Sort By Near';
        }
        if (sortKey === 'borrow') {
          return state.language === 'zh' ? '排序 按借款' : 'Sort By Borrow';
        }
        if (sortKey === 'worst-hf') {
          return state.language === 'zh' ? '排序 按最差 HF' : 'Sort By Worst HF';
        }
        return state.language === 'zh' ? '排序 按可清算' : 'Sort By Liq';
      }

      function syncMorphoOverviewWindowToConsole() {
        const view = String(state.morphoOpportunityView || 'all');
        state.consoleSourceFilter = 'morpho-blue';
        if (view === 'liquidatable') {
          state.morphoMarketSort = 'liquidatable';
          state.consoleFilter = 'liquidatable';
          state.form.morphoKind = 'liquidatable';
          state.form.hfMax = '';
          return;
        }
        if (view === 'near') {
          state.morphoMarketSort = 'near';
          state.consoleFilter = 'all';
          state.form.morphoKind = 'near-liquidation';
          state.form.hfMax = '1.01';
          return;
        }
        if (view === 'risky') {
          state.morphoMarketSort = 'worst-hf';
          state.consoleFilter = 'risky';
          state.form.morphoKind = 'risky';
          state.form.hfMax = '1.05';
          return;
        }
        state.morphoMarketSort = 'liquidatable';
        state.consoleFilter = 'all';
        state.form.morphoKind = '';
        state.form.hfMax = '';
      }

      async function refreshMorphoOverviewWindow() {
        if (state.morphoOverviewRefreshing) return;
        syncMorphoOverviewWindowToConsole();
        state.morphoOverviewRefreshing = true;
        renderAll();
        try {
          await Promise.allSettled([
            loadMorphoBlueMarkets(state.morphoChain || 'ethereum'),
            consoleController && typeof consoleController.startMorphoReadOnlyAnalyze === 'function'
              ? consoleController.startMorphoReadOnlyAnalyze()
              : Promise.resolve()
          ]);
        } finally {
          state.morphoOverviewRefreshing = false;
          renderAll();
        }
      }

      function renderMorphoTargetGroupSummary(group) {
        const metrics = group && group.summary ? group.summary : summarizeMorphoTargetGroupMetrics(group && group.targets ? group.targets : []);
        const nearText = String(metrics.nearLiquidationCount);
        const liqText = String(metrics.liquidatableCount);
        const borrowText = metrics.maxBorrowUsd > 0
          ? '$' + formatMetricNumber(metrics.maxBorrowUsd, metrics.maxBorrowUsd >= 1000 ? 0 : 2)
          : '--';
        return '<div class="console-results-group-summary">' +
          '<span class="console-results-group-pill is-bad">' + escapeHtml(state.language === 'zh' ? ('可清算 ' + liqText) : ('Liq ' + liqText)) + '</span>' +
          '<span class="console-results-group-pill is-warn">' + escapeHtml(state.language === 'zh' ? ('逼近 ' + nearText) : ('Near ' + nearText)) + '</span>' +
          '<span class="console-results-group-pill">' + escapeHtml(state.language === 'zh' ? ('最大借款 ' + borrowText) : ('Top Borrow ' + borrowText)) + '</span>' +
          '<span class="console-results-group-pill is-info">' + escapeHtml(currentMorphoWindowLabel()) + '</span>' +
          '<span class="console-results-group-pill is-info">' + escapeHtml(currentMorphoSortLabel()) + '</span>' +
        '</div>';
      }

      function applyMorphoMarketFilter(marketId, options) {
        const normalized = String(marketId || '').trim();
        if (!normalized || normalized === '--') return;
        const skipRender = !!(options && options.skipRender);
        state.form.morphoMarketId = normalized;
        if (options && Object.prototype.hasOwnProperty.call(options, 'kind')) {
          state.form.morphoKind = String(options.kind || '');
        }
        if (options && Object.prototype.hasOwnProperty.call(options, 'hfMax')) {
          state.form.hfMax = String(options.hfMax || '');
        }
        state.consoleSourceFilter = 'morpho-blue';
        applyFormToInputs();
        if (!skipRender) {
          renderAll();
        }
        const marketInput = document.getElementById('morphoMarketIdInput');
        if (marketInput) {
          marketInput.focus();
          if (typeof marketInput.select === 'function') {
            marketInput.select();
          }
        }
      }

      async function runMorphoMarketAnalyze(marketId, options) {
        const normalized = String(marketId || '').trim();
        if (!normalized || normalized === '--') return;
        applyMorphoMarketFilter(normalized, {
          skipRender: true,
          kind: options && Object.prototype.hasOwnProperty.call(options, 'kind') ? options.kind : undefined,
          hfMax: options && Object.prototype.hasOwnProperty.call(options, 'hfMax') ? options.hfMax : undefined
        });
        state.page = 'console';
        try {
          localStorage.setItem('dashboard-page', 'console');
        } catch (_error) {}
        renderAll();
        if (consoleController && typeof consoleController.startMorphoReadOnlyAnalyze === 'function') {
          await consoleController.startMorphoReadOnlyAnalyze({
            marketIdOverride: normalized,
            kindOverride: options && Object.prototype.hasOwnProperty.call(options, 'kind') ? options.kind : undefined,
            hfMaxOverride: options && Object.prototype.hasOwnProperty.call(options, 'hfMax') ? options.hfMax : undefined
          });
        }
      }
`;
