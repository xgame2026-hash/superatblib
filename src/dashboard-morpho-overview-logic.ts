export const DASHBOARD_MORPHO_OVERVIEW_LOGIC = String.raw`
      function morphoRiskTone(signal) {
        if (signal === 'critical') return 'status-bad';
        if (signal === 'warning') return 'status-warn';
        if (signal === 'watch') return 'status-blue';
        return 'status-good';
      }

      function morphoRiskSummary(entry) {
        const risk = entry && entry.risk ? entry.risk : null;
        if (!risk) return state.language === 'zh' ? '无风险数据' : 'No risk data';
        if (risk.liquidatablePositions > 0) {
          return state.language === 'zh'
            ? String(risk.liquidatablePositions) + ' 个可清算 / ' + String(risk.riskyPositions) + ' 个低 HF'
            : String(risk.liquidatablePositions) + ' liq / ' + String(risk.riskyPositions) + ' low-HF';
        }
        if (risk.riskyPositions > 0) {
          return state.language === 'zh'
            ? String(risk.riskyPositions) + ' 个低 HF'
            : String(risk.riskyPositions) + ' low-HF';
        }
        return state.language === 'zh' ? '观察窗口内无低 HF 仓位' : 'No low-HF positions';
      }

      function latestMorphoExecutorCheck() {
        const liveState = state.data.liveState && state.data.liveState.state ? state.data.liveState.state : null;
        const result = liveState && liveState.morphoExecutorCheck ? liveState.morphoExecutorCheck : null;
        const parsed = result && result.parsed ? result.parsed : null;
        const activeChain = String(state.morphoChain || 'ethereum') === 'base' ? 'base' : 'ethereum';
        if (parsed && parsed.chain && String(parsed.chain) !== activeChain) {
          return null;
        }
        return result;
      }

      function renderMorphoExecutorCheck() {
        const result = latestMorphoExecutorCheck();
        const parsed = result && result.parsed ? result.parsed : null;
        const button = document.getElementById('morphoExecutorCheckButton');
        if (button) {
          button.disabled = !!state.morphoExecutorChecking;
          button.textContent = state.morphoExecutorChecking
            ? t('morphoExecutorChecking')
            : t('morphoExecutorCheck');
        }
        text('morphoExecutorTitle', t('morphoExecutorTitle'));
        text('morphoExecutorSub', t('morphoExecutorSub'));
        if (!parsed) {
          text('morphoExecutorStatusChip', t('morphoExecutorStatusInitial'));
          const chip = document.getElementById('morphoExecutorStatusChip');
          if (chip) chip.className = 'strategy-chip status-blue';
          text('morphoExecutorStatusText', t('morphoExecutorStatusInitialSub'));
          text('morphoExecutorGaps', t('morphoExecutorStatusInitialGap'));
          return;
        }

        const missingCount = parsed.summary && typeof parsed.summary.missingCount === 'number'
          ? parsed.summary.missingCount
          : 0;
        const warnCount = parsed.summary && typeof parsed.summary.warnCount === 'number'
          ? parsed.summary.warnCount
          : 0;
        const chip = document.getElementById('morphoExecutorStatusChip');
        if (chip) {
          chip.className = 'strategy-chip ' + (missingCount > 0 ? 'status-blue' : (warnCount > 0 ? 'status-warn' : 'status-good'));
        }
        text(
          'morphoExecutorStatusChip',
          parsed && parsed.chain === 'base'
            ? (parsed && parsed.stage === 'base-execution-draft'
                ? (state.language === 'zh' ? 'Base 草案' : 'Base draft')
                : (state.language === 'zh' ? 'Base 已检查' : 'Base checked'))
            : t('morphoExecutorStatusWired')
        );
        let statusText = '';
        if (parsed && parsed.chain === 'base') {
          statusText = missingCount > 0
            ? (state.language === 'zh'
                ? ('Base 只读与基础设施检查已运行；仍缺 ' + String(missingCount) + ' 个关键项。')
                : ('Base read-only and infrastructure checks ran; ' + String(missingCount) + ' major gaps remain.'))
            : warnCount > 0
              ? (state.language === 'zh'
                  ? ('Base 已跑通 route/private execution draft，但仍有 ' + String(warnCount) + ' 个待补执行边界。')
                  : ('Base route/private execution drafts are live, but ' + String(warnCount) + ' execution boundaries still remain.'))
              : (state.language === 'zh'
                  ? 'Base 的 route/private execution draft 都已接线。'
                  : 'Base route/private execution drafts are wired.');
        } else if (missingCount > 0) {
          statusText = state.language === 'zh'
            ? ('只读已接入，执行骨架已接线；仍缺 ' + String(missingCount) + ' 个关键件。')
            : ('Read-only is live and the execution skeleton is wired; ' + String(missingCount) + ' major gaps remain.');
        } else if (warnCount > 0) {
          statusText = state.language === 'zh'
            ? ('关键缺口已收敛为 0，但仍有 ' + String(warnCount) + ' 个占位边界待实装。')
            : ('Major gaps are down to 0, but ' + String(warnCount) + ' placeholder boundaries still need real implementation.');
        } else {
          statusText = state.language === 'zh'
            ? '主要执行边界都已接线，剩下的是把占位骨架替换成真实执行实现。'
            : 'Major execution boundaries are wired; the remaining work is replacing placeholders with live execution integrations.';
        }
        text('morphoExecutorStatusText', statusText);
        const checks = parsed && Array.isArray(parsed.checks) ? parsed.checks : [];
        const gaps = checks.filter(function (item) {
          return item && (item.status === 'missing' || item.status === 'warn');
        }).map(function (item) {
          const tone = item.status === 'missing' ? 'status-bad' : 'status-warn';
          return '<div class="modal-detail-note"><span class="strategy-chip ' + escapeHtml(tone) + '">' +
            escapeHtml(String(item.status === 'missing'
              ? (state.language === 'zh' ? '未接入' : 'Missing')
              : (state.language === 'zh' ? '待补' : 'Warn'))) +
            '</span> ' +
            '<strong>' + escapeHtml(String(item.label || '--')) + '</strong>' +
            ' · ' + escapeHtml(String(item.detail || '--')) +
          '</div>';
        });
        html('morphoExecutorGaps', gaps.length ? gaps.join('') : escapeHtml(String(parsed.nextStep || '--')));
      }

      async function runMorphoExecutorCheck() {
        if (state.morphoExecutorChecking) return;
        state.morphoExecutorChecking = true;
        renderAll();
        try {
          const response = await fetch('/api/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'check-morpho-executor',
              chain: state.morphoChain || 'ethereum',
              marketId: state.form.morphoMarketId || undefined,
              kind: state.form.morphoKind || undefined,
              hfMax: state.form.hfMax || undefined,
              refresh: true
            })
          });
          const result = await response.json();
          if (!response.ok || !result || result.ok === false) {
            throw new Error(result && result.error ? String(result.error) : 'Morpho executor check failed.');
          }
          if (!state.data.liveState) {
            state.data.liveState = { state: {} };
          }
          state.data.liveState.state = {
            ...(state.data.liveState.state || {}),
            updatedAt: new Date().toISOString(),
            lastAction: 'check-morpho-executor',
            lastResult: result,
            morphoExecutorCheck: result
          };
        } catch (error) {
          openModal(
            t('morphoExecutorTitle'),
            String(error instanceof Error ? error.message : error)
          );
        } finally {
          state.morphoExecutorChecking = false;
          renderAll();
        }
      }

      function translateMorphoOpportunityKind(value) {
        if (state.language !== 'zh') {
          if (value === 'liquidatable') return 'Liquidatable';
          if (value === 'near-liquidation') return 'Near liquidation';
          return 'Risky';
        }
        if (value === 'liquidatable') return '可清算';
        if (value === 'near-liquidation') return '逼近清算';
        return '低 HF';
      }

      function morphoOpportunityPreset(kind) {
        if (kind === 'liquidatable') {
          return { kind: 'liquidatable', hfMax: '' };
        }
        if (kind === 'near-liquidation') {
          return { kind: 'near-liquidation', hfMax: '1.01' };
        }
        return { kind: 'risky', hfMax: '1.05' };
      }

      function activeMorphoOpportunityRows(payload) {
        const analysis = payload && payload.analysis ? payload.analysis : null;
        const rows = analysis && Array.isArray(analysis.topExecutionCandidates)
          ? analysis.topExecutionCandidates
          : (analysis && Array.isArray(analysis.topOpportunities)
              ? analysis.topOpportunities.filter(function (row) { return !!(row && row.executionCandidate); })
              : []);
        const view = String(state.morphoOpportunityView || 'all');
        if (view === 'liquidatable') {
          return rows.filter(function (row) { return String(row && row.kind || '') === 'liquidatable'; });
        }
        if (view === 'near') {
          return rows.filter(function (row) { return String(row && row.kind || '') === 'near-liquidation'; });
        }
        if (view === 'risky') {
          return rows.filter(function (row) { return String(row && row.kind || '') === 'risky'; });
        }
        return rows;
      }

      function morphoOpportunityEmptyMessage(payload) {
        const analysis = payload && payload.analysis ? payload.analysis : null;
        const executableRows = analysis && Array.isArray(analysis.topExecutionCandidates)
          ? analysis.topExecutionCandidates
          : [];
        const readOnlyRows = analysis && Array.isArray(analysis.topOpportunities)
          ? analysis.topOpportunities
          : [];
        if (!executableRows.length && readOnlyRows.length) {
          return state.language === 'zh'
            ? '当前窗口命中了只读低 HF 仓位，但都未通过执行候选过滤。'
            : 'The current window found read-only low-HF positions, but none passed execution candidacy filtering.';
        }
        return t('morphoBlueOpportunityEmpty');
      }

      function morphoOpportunityViewSummary(payload, visibleRows) {
        const rows = Array.isArray(visibleRows) ? visibleRows : activeMorphoOpportunityRows(payload);
        const view = String(state.morphoOpportunityView || 'all');
        const labels = t('morphoBlueOpportunityViews');
        const activeLabel =
          view === 'liquidatable' ? labels[1]
          : view === 'near' ? labels[2]
          : view === 'risky' ? labels[3]
          : labels[0];
        return state.language === 'zh'
          ? ('当前视图：' + String(activeLabel) + ' / ' + String(rows.length) + ' 条')
          : ('View: ' + String(activeLabel) + ' / ' + String(rows.length) + ' rows');
      }

      function renderMorphoOpportunityRows(payload) {
        const rows = activeMorphoOpportunityRows(payload);
        if (!rows.length) {
          return '<tr><td colspan="6">' + escapeHtml(morphoOpportunityEmptyMessage(payload)) + '</td></tr>';
        }
        return rows.map(function (row) {
          const tone = morphoRiskTone(
            row.kind === 'liquidatable'
              ? 'critical'
              : row.kind === 'near-liquidation'
                ? 'warning'
                : 'watch'
          );
          const preset = morphoOpportunityPreset(row.kind);
          return '<tr>' +
            '<td><span class="morpho-opportunity-market">' +
              '<button class="morpho-market-open" type="button" data-morpho-market="' + escapeHtml(String(row.marketId || '')) + '">' + escapeHtml(String(row.marketLabel || '--')) + '</button>' +
              '<span class="morpho-opportunity-market-sub">' + escapeHtml(String(row.loanSymbol || '--') + ' / ' + String(row.collateralSymbol || '--')) + '</span>' +
              '<button class="ghost-button morpho-opportunity-drill" type="button" data-morpho-run-market="' + escapeHtml(String(row.marketId || '')) + '" data-morpho-run-kind="' + escapeHtml(String(preset.kind || '')) + '" data-morpho-run-hf-max="' + escapeHtml(String(preset.hfMax || '')) + '">' + escapeHtml(t('morphoDrillDown')) + '</button>' +
            '</span></td>' +
            '<td>' + escapeHtml(shortAddress(String(row.user || '--'))) + '</td>' +
            '<td><span class="strategy-chip ' + escapeHtml(tone) + '">' + escapeHtml(translateMorphoOpportunityKind(row.kind)) + '</span></td>' +
            '<td>' + escapeHtml(formatHealthFactor(row.healthFactor)) + '</td>' +
            '<td>' + escapeHtml(formatUsd(row.borrowAssetsUsd)) + '</td>' +
            '<td>' + escapeHtml(formatSignedPercent(row.priceVariationToLiquidationPrice)) + '</td>' +
          '</tr>';
        }).join('');
      }

      function morphoBlueMarketById(marketId) {
        const payload = state.data.morphoBlueMarkets;
        const metrics = payload && Array.isArray(payload.markets) ? payload.markets : [];
        return metrics.find(function (item) {
          return String(item && item.marketId ? item.marketId : '').toLowerCase() === String(marketId || '').toLowerCase();
        }) || null;
      }

      function openMorphoBlueMarketDetail(marketId) {
        const entry = morphoBlueMarketById(marketId);
        if (!entry) return;
        const labels = t('morphoBlueDetailLabels');
        const risk = entry && entry.risk ? entry.risk : null;
        const opportunities = risk && Array.isArray(risk.topOpportunities) ? risk.topOpportunities : [];
        const rows = [
          [labels[0], entry.marketId || '--'],
          [labels[1], String(entry.loanAsset && entry.loanAsset.symbol ? entry.loanAsset.symbol : '--') + ' / ' + String(entry.loanAsset && entry.loanAsset.address ? entry.loanAsset.address : '--')],
          [labels[2], String(entry.collateralAsset && entry.collateralAsset.symbol ? entry.collateralAsset.symbol : '--') + ' / ' + String(entry.collateralAsset && entry.collateralAsset.address ? entry.collateralAsset.address : '--')],
          [labels[3], formatBpsPercent(entry.lltvBps)],
          [labels[4], entry.oracleAddress || '--'],
          [labels[5], entry.irmAddress || '--'],
          [labels[6], entry.live && typeof entry.live.supplyAssetsUsd === 'number' ? formatUsd(entry.live.supplyAssetsUsd) : '--'],
          [labels[7], entry.live && typeof entry.live.borrowAssetsUsd === 'number' ? formatUsd(entry.live.borrowAssetsUsd) : '--'],
          [labels[8], formatRatioPercent(entry.live ? entry.live.utilization : null)],
          [labels[9], formatSignedUsd(entry.delta ? entry.delta.supplyAssetsUsd : null)],
          [labels[10], formatSignedUsd(entry.delta ? entry.delta.borrowAssetsUsd : null)],
          [labels[11], formatSignedPercent(entry.delta ? entry.delta.utilization : null)],
          [labels[13], risk && risk.mode ? String(risk.mode) : '--'],
          [labels[14], risk && typeof risk.positionsFetched === 'number' ? String(risk.positionsFetched) : '--'],
          [labels[15], risk && typeof risk.riskyPositions === 'number' ? String(risk.riskyPositions) : '--'],
          [labels[16], risk && typeof risk.nearLiquidationPositions === 'number' ? String(risk.nearLiquidationPositions) : '--'],
          [labels[17], risk && typeof risk.liquidatablePositions === 'number' ? String(risk.liquidatablePositions) : '--'],
          [labels[18], risk ? formatHealthFactor(risk.worstHealthFactor) : '--'],
          [labels[19], risk && typeof risk.riskyBorrowAssetsUsd === 'number' ? formatUsd(risk.riskyBorrowAssetsUsd) : '--'],
          [labels[20], risk && typeof risk.liquidatableBorrowAssetsUsd === 'number' ? formatUsd(risk.liquidatableBorrowAssetsUsd) : '--']
        ];
        const notes = Array.isArray(entry.notes) ? entry.notes : [];
        const opportunityList = opportunities.length ? opportunities.map(function (item) {
          const candidateTag = item && item.executionCandidate
            ? (state.language === 'zh' ? '执行候选' : 'Execution candidate')
            : (state.language === 'zh' ? '只读降级' : 'Read-only only');
          return '<div class="modal-detail-note">' +
            '<strong>' + escapeHtml(candidateTag) + '</strong>' +
            ' · ' +
            '<strong>' + escapeHtml(translateMorphoOpportunityKind(item.kind)) + '</strong>' +
            ' · ' + escapeHtml(shortAddress(String(item.user || '--'))) +
            ' · HF ' + escapeHtml(formatHealthFactor(item.healthFactor)) +
            ' · ' + escapeHtml(formatUsd(item.borrowAssetsUsd)) +
            ' · ' + escapeHtml(formatSignedPercent(item.priceVariationToLiquidationPrice)) +
          '</div>';
        }).join('') : '--';
        const body = '<div class="modal-detail-grid">' +
          rows.map(function (row) {
            return '<div class="modal-detail-item">' +
              '<div class="modal-detail-label">' + escapeHtml(String(row[0] || '--')) + '</div>' +
              '<div class="modal-detail-value">' + escapeHtml(String(row[1] || '--')) + '</div>' +
            '</div>';
          }).join('') +
          '<div class="modal-detail-item is-full">' +
            '<div class="modal-detail-label">' + escapeHtml(String(labels[12] || '--')) + '</div>' +
            '<div class="modal-detail-list">' + (notes.length ? notes.map(function (note) {
              return '<div class="modal-detail-note">' + escapeHtml(String(note || '--')) + '</div>';
            }).join('') : '--') + '</div>' +
          '</div>' +
          '<div class="modal-detail-item is-full">' +
            '<div class="modal-detail-label">' + escapeHtml(String(labels[21] || '--')) + '</div>' +
            '<div class="modal-detail-list">' + opportunityList + '</div>' +
          '</div>' +
          '<div class="modal-detail-item is-full">' +
            '<div class="modal-detail-label">' + escapeHtml(String(labels[22] || '--')) + '</div>' +
            '<div class="modal-detail-list">' + escapeHtml(String(risk && risk.disclaimer ? risk.disclaimer : '--')) + '</div>' +
          '</div>' +
        '</div>';
        openModalHtml(
          t('morphoBlueDetailTitle'),
          t('morphoBlueDetailSub') + ' · ' + String(entry.label || '--'),
          body
        );
      }

      function renderMorphoBluePair(entry) {
        const symbols = [entry && entry.loanAsset ? entry.loanAsset.symbol : '--', entry && entry.collateralAsset ? entry.collateralAsset.symbol : '--'];
        return '<span class="morpho-market-pair">' + symbols.map(function (symbol) {
          const src = assetIconSrc(symbol);
          if (!src) {
            return '<span class="morpho-market-pair-item"><span>' + escapeHtml(String(symbol || '--')) + '</span></span>';
          }
          return '<span class="morpho-market-pair-item"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(String(symbol || '--')) + '" /><span>' + escapeHtml(String(symbol || '--')) + '</span></span>';
        }).join('<span class="morpho-market-pair-sep">/</span>') + '</span>';
      }

      function renderMorphoBlueMarkets(payload) {
        renderMorphoExecutorCheck();
        const activeChain = String(state.morphoChain || 'ethereum') === 'base' ? 'base' : 'ethereum';
        const isBase = activeChain === 'base';
        const chainLabel = isBase
          ? (state.language === 'zh' ? 'Base' : 'Base')
          : (state.language === 'zh' ? 'Ethereum' : 'Ethereum');
        const ethereumButton = document.getElementById('morphoChainEthereum');
        const baseButton = document.getElementById('morphoChainBase');
        if (ethereumButton) ethereumButton.classList.toggle('active', !isBase);
        if (baseButton) baseButton.classList.toggle('active', isBase);
        const metrics = payload && Array.isArray(payload.markets) ? payload.markets : [];
        const analysis = payload && payload.analysis ? payload.analysis : null;
        const totalSupply = metrics.reduce(function (sum, row) {
          return sum + (row && row.live && typeof row.live.supplyAssetsUsd === 'number' ? row.live.supplyAssetsUsd : 0);
        }, 0);
        const totalBorrow = metrics.reduce(function (sum, row) {
          return sum + (row && row.live && typeof row.live.borrowAssetsUsd === 'number' ? row.live.borrowAssetsUsd : 0);
        }, 0);
        const totalRisky = analysis && typeof analysis.riskyPositions === 'number' ? analysis.riskyPositions : 0;
        const totalLiquidatable = analysis && typeof analysis.liquidatablePositions === 'number' ? analysis.liquidatablePositions : 0;
        const totalExecutionCandidates = analysis && typeof analysis.executionCandidatePositions === 'number'
          ? analysis.executionCandidatePositions
          : 0;
        const liveCount = metrics.filter(function (row) { return row && row.live && row.live.available; }).length;

        text(
          'morphoPageSub',
          isBase
            ? (state.language === 'zh'
                ? 'Base 官方 blue-api 只读风险视图与配置检查。'
                : 'Base official blue-api read-only risk view and readiness checks.')
            : (state.language === 'zh'
                ? 'Ethereum 官方 blue-api 只读风险视图与执行草案。'
                : 'Ethereum official blue-api read-only risk view and execution draft.')
        );

        text('morphoBlueMetricMarketsValue', String(payload && typeof payload.registryCount === 'number' ? payload.registryCount : '--'));
        text('morphoBlueMetricLiveValue', String(payload && typeof payload.liveCount === 'number' ? payload.liveCount : '--'));
        text('morphoBlueMetricSupplyValue', metrics.length ? formatUsd(totalSupply) : '--');
        text('morphoBlueMetricBorrowValue', metrics.length ? formatUsd(totalBorrow) : '--');
        text('morphoBlueMetricRiskyValue', analysis && typeof analysis.riskyPositions === 'number' ? String(analysis.riskyPositions) : '--');
        text('morphoBlueMetricNearValue', analysis && typeof analysis.nearLiquidationPositions === 'number' ? String(analysis.nearLiquidationPositions) : '--');
        text('morphoBlueMetricLiqValue', analysis && typeof analysis.liquidatablePositions === 'number' ? String(analysis.liquidatablePositions) : '--');
        text('morphoBlueMetricRiskBorrowValue', analysis && typeof analysis.riskyBorrowAssetsUsd === 'number' ? formatUsd(analysis.riskyBorrowAssetsUsd) : '--');

        const sub =
          payload && payload.ok
            ? (
                state.language === 'zh'
                  ? chainLabel + ' 观察市场 ' + String(payload.registryCount || 0) + ' 个 / 实时在线 ' + String(liveCount) + ' 个 / 可清算 ' + String(totalLiquidatable) + ' 个 / 执行候选 ' + String(totalExecutionCandidates) + ' 个 / 低 HF ' + String(totalRisky) + ' 个' + (payload.stale ? ' / 使用缓存' : '')
                  : chainLabel + ' watch markets ' + String(payload.registryCount || 0) + ' / live ' + String(liveCount) + ' / liquidatable ' + String(totalLiquidatable) + ' / execution candidates ' + String(totalExecutionCandidates) + ' / low-HF ' + String(totalRisky) + (payload.stale ? ' / cached' : '')
              )
            : t('morphoBlueSub');
        text('morphoBlueSub', sub);
        [
          ['morphoOpportunityViewAll', 'all'],
          ['morphoOpportunityViewLiq', 'liquidatable'],
          ['morphoOpportunityViewNear', 'near'],
          ['morphoOpportunityViewRisky', 'risky']
        ].forEach(function (entry) {
          const button = document.getElementById(entry[0]);
          if (!button) return;
          const active = String(state.morphoOpportunityView || 'all') === entry[1];
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        const refreshButton = document.getElementById('morphoOpportunityRefresh');
        if (refreshButton) {
          refreshButton.disabled = !!state.morphoOverviewRefreshing;
          refreshButton.textContent = state.morphoOverviewRefreshing
            ? t('morphoBlueOpportunityRefreshing')
            : t('morphoBlueOpportunityRefresh');
        }

        const loadingKey = isBase ? 'morphoBlueBaseMarkets' : 'morphoBlueMarkets';
        if (state.loading[loadingKey] && !payload) {
          html('morphoBlueRows', [
            '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
            '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
            '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>'
          ].join(''));
          html('morphoBlueOpportunityRows', [
            '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
            '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>'
          ].join(''));
          text('morphoBlueDisclaimer', '--');
          text('morphoBlueUpdated', '--');
          return;
        }

        html('morphoBlueRows', metrics.length ? metrics.slice(0, 5).map(function (entry) {
          const riskTone = morphoRiskTone(entry && entry.risk ? entry.risk.signal : null);
          return '<tr>' +
            '<td><button class="morpho-market-open" type="button" data-morpho-market="' + escapeHtml(String(entry.marketId || '')) + '">' + escapeHtml(String(entry.label || '--')) + '</button><div class="morpho-market-riskline"><span class="strategy-chip ' + escapeHtml(riskTone) + '">' + escapeHtml(morphoRiskSummary(entry)) + '</span></div></td>' +
            '<td>' + renderMorphoBluePair(entry) + '</td>' +
            '<td>' + escapeHtml(formatBpsPercent(entry.lltvBps)) + '</td>' +
            '<td><span class="strategy-chip ' + escapeHtml((entry.live && typeof entry.live.utilization === 'number' && entry.live.utilization >= 0.9) ? 'status-warn' : 'status-blue') + '">' + escapeHtml(formatRatioPercent(entry.live ? entry.live.utilization : null)) + '</span></td>' +
            '<td>' + escapeHtml(entry.live && typeof entry.live.borrowAssetsUsd === 'number' ? formatUsd(entry.live.borrowAssetsUsd) : '--') + '<div class="morpho-market-secondary">' + escapeHtml((entry.risk && typeof entry.risk.worstHealthFactor === 'number') ? ('HF ' + formatHealthFactor(entry.risk.worstHealthFactor)) : '--') + '</div></td>' +
          '</tr>';
        }).join('') : '<tr><td colspan="5">' + escapeHtml(t('morphoBlueEmpty')) + '</td></tr>');
        html('morphoBlueOpportunityRows', renderMorphoOpportunityRows(payload));
        text('morphoBlueOpportunitySub', morphoOpportunityViewSummary(payload));
        text('morphoBlueDisclaimer', analysis && analysis.disclaimer ? analysis.disclaimer : t('morphoBlueDisclaimerFallback'));

        text('morphoBlueUpdated', payload && payload.fetchedAt ? formatRelativeFromUnix(Date.parse(payload.fetchedAt) / 1000) : '--');
      }
`;
