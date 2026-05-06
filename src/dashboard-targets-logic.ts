export const DASHBOARD_TARGETS_LOGIC = String.raw`
      function renderTargetTableRow(target) {
        const tone = statusToneFromHf(target.healthFactor);
        const grossValue = toNumber(target.grossProfitDisplay);
        const netValue = toNumber(target.roughNetProfitDisplay);
        const grossTone = grossValue !== null && grossValue > 0 ? 'status-good' : '';
        const netTone = netValue !== null && netValue > 0 ? 'status-good' : '';
        return '<tr data-target-key="' + escapeHtml(targetIdentityKey(target)) + '">' +
          '<td>' + escapeHtml(typeof target.rank === 'number' ? '#' + String(target.rank) : '--') + '</td>' +
          '<td style="max-width:320px;"><div>' + escapeHtml(target.user) + '</div><div style="color:#9ca5b3; margin-top:4px;">' + escapeHtml(String(target.source || '--').toUpperCase()) + ' / ' + escapeHtml(String(target.selectionMethod || '--')) + '</div></td>' +
          '<td class="' + tone + '">' + escapeHtml(String(target.healthFactor || '--')) + '</td>' +
          '<td>' + escapeHtml(String(target.state || '--')) + '</td>' +
          '<td>' + escapeHtml(String(target.debtSymbol || '--')) + '</td>' +
          '<td>' + escapeHtml(String(target.collateralSymbol || '--')) + '</td>' +
          '<td class="' + grossTone + '">' + escapeHtml(String(target.grossProfitDisplay || '--')) + '</td>' +
          '<td class="' + netTone + '">' + escapeHtml(String(target.roughNetProfitDisplay || '--')) + '</td>' +
          '<td><button class="ghost-button target-view-button" data-target-key="' + escapeHtml(targetIdentityKey(target)) + '" type="button">⤢</button></td>' +
        '</tr>';
      }

      function renderMorphoGroupedTargetsRows(rows) {
        return groupTargetsByMarket(rows).map(function (group) {
          return '<tr class="console-results-group-row">' +
            '<td colspan="9">' +
              '<div class="console-results-group-head">' +
                '<div class="console-results-group-title">' + escapeHtml(group.marketLabel || '--') + '</div>' +
                '<div class="console-results-group-actions">' +
                  '<button class="ghost-button console-results-group-action target-market-filter-button" data-market-key="' + escapeHtml(group.marketKey || '--') + '" type="button">' + escapeHtml(t('morphoUseMarket')) + '</button>' +
                  '<button class="ghost-button console-results-group-action target-market-run-button" data-market-key="' + escapeHtml(group.marketKey || '--') + '" type="button">' + escapeHtml(t('morphoRunMarket')) + '</button>' +
                  '<button class="ghost-button console-results-group-action target-market-near-button" data-market-key="' + escapeHtml(group.marketKey || '--') + '" type="button">' + escapeHtml(t('morphoRunNear')) + '</button>' +
                  '<button class="ghost-button console-results-group-action target-market-liq-button" data-market-key="' + escapeHtml(group.marketKey || '--') + '" type="button">' + escapeHtml(t('morphoRunLiq')) + '</button>' +
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
          group.targets.map(renderTargetTableRow).join('');
        }).join('');
      }

      function bindTargetsRowActions(targets) {
        qsa('.target-view-button').forEach(function (button) {
          button.addEventListener('click', function () {
            const key = button.getAttribute('data-target-key');
            const match = targets.find(function (target) { return targetIdentityKey(target) === key; });
            if (match) {
              state.selectedTarget = match;
              renderTargets();
              openModal(t('targetDetail'), JSON.stringify(match, null, 2));
            }
          });
        });
        qsa('.target-market-filter-button').forEach(function (button) {
          button.addEventListener('click', function () {
            applyMorphoMarketFilter(button.getAttribute('data-market-key'));
          });
        });
        qsa('.target-market-run-button').forEach(function (button) {
          button.addEventListener('click', function () {
            void runMorphoMarketAnalyze(button.getAttribute('data-market-key'));
          });
        });
        qsa('.target-market-near-button').forEach(function (button) {
          button.addEventListener('click', function () {
            void runMorphoMarketAnalyze(button.getAttribute('data-market-key'), {
              kind: 'near-liquidation',
              hfMax: '1.01'
            });
          });
        });
        qsa('.target-market-liq-button').forEach(function (button) {
          button.addEventListener('click', function () {
            void runMorphoMarketAnalyze(button.getAttribute('data-market-key'), {
              kind: 'liquidatable'
            });
          });
        });
      }

      function renderTargets() {
        const targets = deriveTargets();
        const liquidatableOnly = state.form.liquidationOnly;
        const rows = targets.filter(function (target) {
          return matchesTargetSourceFilter(target, state.consoleSourceFilter) && (!liquidatableOnly || target.liquidatable);
        });
        const groupedMorphoRows = rows.length > 0 && rows.every(isMorphoBlueTarget);
        html('targetsRows', rows.length
          ? (groupedMorphoRows ? renderMorphoGroupedTargetsRows(rows) : rows.map(renderTargetTableRow).join(''))
          : '<tr><td colspan="9">' + escapeHtml(t('targetsEmpty')) + '</td></tr>');

        if (state.selectedTarget) {
          text('selectedUserValue', state.selectedTarget.user || '--');
          text(
            'selectedSignalValue',
            (typeof state.selectedTarget.rank === 'number' ? '#' + String(state.selectedTarget.rank) + ' / ' : '') +
            (state.selectedTarget.state || '--') +
            ' / HF ' + (state.selectedTarget.healthFactor || '--') +
            ' / ' + (state.selectedTarget.selectionMethod || '--') +
            ' / ' + (state.selectedTarget.selectionScoreDisplay || '--')
          );
          text('selectedDebtValue', state.selectedTarget.debtSymbol || '--');
          text('selectedCollateralValue', (state.selectedTarget.collateralSymbol || '--') + ' / ' + (state.selectedTarget.roughNetProfitDisplay || '--'));
        } else {
          text('selectedUserValue', '--');
          text('selectedSignalValue', '--');
          text('selectedDebtValue', '--');
          text('selectedCollateralValue', '--');
        }

        bindTargetsRowActions(targets);
      }
`;
