export const DASHBOARD_TARGETS_ADAPTER_LOGIC = String.raw`
      function sortDerivedTargets(targets) {
        return (Array.isArray(targets) ? targets.slice() : []).sort(function (a, b) {
          if (typeof a.rank === 'number' && typeof b.rank === 'number' && a.rank !== b.rank) {
            return a.rank - b.rank;
          }
          const left = toNumber(a.healthFactor);
          const right = toNumber(b.healthFactor);
          if (left === null && right === null) return 0;
          if (left === null) return 1;
          if (right === null) return -1;
          return left - right;
        });
      }

      function syncSelectedDerivedTarget(targets) {
        if (!state.selectedTarget && targets.length > 0) {
          state.selectedTarget = targets[0];
        }
        if (state.selectedTarget) {
          const selected = targets.find(function (item) {
            return targetIdentityKey(item) === targetIdentityKey(state.selectedTarget);
          });
          state.selectedTarget = selected || targets[0] || null;
        }
      }

      function appendScanTargets(targetMap, scanParsed) {
        if (!scanParsed || !Array.isArray(scanParsed.topRiskyUsers)) return;
        scanParsed.topRiskyUsers.forEach(function (row, index) {
          const nextRow = {
            rank: index + 1,
            marketKey: scanParsed.marketId ? String(scanParsed.marketId) : (state.form.market || 'aave-v3-bnb'),
            marketLabel: scanParsed.protocol && scanParsed.chainName
              ? String(scanParsed.protocol.label || '--') + ' / ' + String(scanParsed.chainName || '--')
              : deriveTargetMarketLabel(state.form.market || 'aave-v3-bnb', 'Aave V3 / BNB Chain'),
            user: row.user,
            healthFactor: row.healthFactor,
            liquidatable: toNumber(row.healthFactor) !== null ? toNumber(row.healthFactor) < 1 : false,
            state: statusTextFromHf(row.healthFactor),
            debtSymbol: '--',
            collateralSymbol: '--',
            grossProfitDisplay: '--',
            roughNetProfitDisplay: '--',
            selectionScoreDisplay: '--',
            selectionMethod: '--',
            source: 'scan',
            raw: row
          };
          targetMap.set(targetIdentityKey(nextRow), nextRow);
        });
      }

      function appendAnalyzeTargets(targetMap, analyzeParsed) {
        if (!analyzeParsed || !Array.isArray(analyzeParsed.users)) return;
        analyzeParsed.users.forEach(function (row, index) {
          const nextMarketKey = analyzeParsed.marketId ? String(analyzeParsed.marketId) : (state.form.market || 'aave-v3-bnb');
          const key = String(nextMarketKey).toLowerCase() + '::' + String(row.user).toLowerCase();
          const existing = targetMap.get(key) || {};
          targetMap.set(key, {
            rank: typeof row.rank === 'number' ? row.rank : (existing.rank || index + 1),
            marketKey: existing.marketKey || nextMarketKey,
            marketLabel: existing.marketLabel || (analyzeParsed.protocol && analyzeParsed.chainName
              ? String(analyzeParsed.protocol.label || '--') + ' / ' + String(analyzeParsed.chainName || '--')
              : deriveTargetMarketLabel(nextMarketKey, 'Aave V3 / BNB Chain')),
            user: row.user,
            healthFactor: row.healthFactor || existing.healthFactor,
            liquidatable: typeof row.liquidatable === 'boolean' ? row.liquidatable : existing.liquidatable,
            state: typeof row.liquidatable === 'boolean'
              ? (row.liquidatable ? (state.language === 'zh' ? '可清算' : 'liquidatable') : statusTextFromHf(row.healthFactor))
              : existing.state || statusTextFromHf(row.healthFactor),
            debtSymbol: row.bestPair && row.bestPair.debtSymbol ? row.bestPair.debtSymbol : (existing.debtSymbol || '--'),
            collateralSymbol: row.bestPair && row.bestPair.collateralSymbol ? row.bestPair.collateralSymbol : (existing.collateralSymbol || '--'),
            grossProfitDisplay: row.bestPair && row.bestPair.grossProfitDisplay ? row.bestPair.grossProfitDisplay : (existing.grossProfitDisplay || '--'),
            roughNetProfitDisplay: row.selection && row.selection.roughNetProfitDisplay ? row.selection.roughNetProfitDisplay : (existing.roughNetProfitDisplay || '--'),
            selectionScoreDisplay: row.selection && row.selection.scoreDisplay ? row.selection.scoreDisplay : (existing.selectionScoreDisplay || '--'),
            selectionMethod: row.selection && row.selection.method ? row.selection.method : (existing.selectionMethod || '--'),
            bestPair: row.bestPair || existing.bestPair || null,
            topDebtAssets: row.topDebtAssets || [],
            topCollateralAssets: row.topCollateralAssets || [],
            source: 'analyze',
            raw: row
          });
        });
      }

      function appendMorphoBlueTargets(targetMap, morphoBlueParsed) {
        if (!morphoBlueParsed || !morphoBlueParsed.analysis) return;
        const rows = Array.isArray(morphoBlueParsed.analysis.topExecutionCandidates)
          ? morphoBlueParsed.analysis.topExecutionCandidates
          : (Array.isArray(morphoBlueParsed.analysis.topOpportunities)
              ? morphoBlueParsed.analysis.topOpportunities.filter(function (row) { return !!(row && row.executionCandidate); })
              : []);
        rows.forEach(function (row, index) {
          const key = String(row.marketId || '').toLowerCase() + '::' + String(row.user || '').toLowerCase();
          targetMap.set(key, {
            rank: index + 1,
            marketKey: row.marketId,
            marketLabel: row.marketLabel,
            user: row.user,
            healthFactor: typeof row.healthFactor === 'number' ? row.healthFactor.toFixed(3) : '--',
            liquidatable: typeof row.healthFactor === 'number' ? row.healthFactor < 1 : row.kind === 'liquidatable',
            state:
              row.kind === 'liquidatable'
                ? (state.language === 'zh' ? '可清算' : 'Liquidatable')
                : row.kind === 'near-liquidation'
                  ? (state.language === 'zh' ? '逼近清算' : 'Near liquidation')
                  : (state.language === 'zh' ? '低 HF' : 'Low HF'),
            debtSymbol: row.loanSymbol || '--',
            collateralSymbol: row.collateralSymbol || '--',
            grossProfitDisplay: '--',
            roughNetProfitDisplay: '--',
            selectionScoreDisplay: typeof row.borrowAssetsUsd === 'number' ? formatUsd(row.borrowAssetsUsd) : '--',
            selectionMethod: 'blue-api-execution-gate',
            source: 'morpho-blue',
            raw: row
          });
        });
      }

      function deriveTargets() {
        if (state.consoleStreamMode) {
          const liveTargets = sortDerivedTargets(state.consoleLiveTargets);
          syncSelectedDerivedTarget(liveTargets);
          return liveTargets;
        }

        const liveState = state.data.liveState && state.data.liveState.state ? state.data.liveState.state : {};
        const scanParsed = liveState.scan && liveState.scan.parsed ? liveState.scan.parsed : null;
        const analyzeParsed = liveState.analyze && liveState.analyze.parsed ? liveState.analyze.parsed : null;
        const morphoBlueParsed = liveState.morphoBlueAnalyze && liveState.morphoBlueAnalyze.parsed
          ? liveState.morphoBlueAnalyze.parsed
          : (state.data.morphoBlueMarkets && state.data.morphoBlueMarkets.analysis
              ? state.data.morphoBlueMarkets
              : null);
        const morphoOnlyMode = liveState.lastAction === 'analyze-morpho-blue' && !!morphoBlueParsed;
        const targetMap = new Map();

        if (!morphoOnlyMode) {
          appendScanTargets(targetMap, scanParsed);
          appendAnalyzeTargets(targetMap, analyzeParsed);
        }
        appendMorphoBlueTargets(targetMap, morphoBlueParsed);

        const targets = sortDerivedTargets(Array.from(targetMap.values()));
        syncSelectedDerivedTarget(targets);
        return targets;
      }
`;
