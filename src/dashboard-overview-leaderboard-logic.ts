export const DASHBOARD_OVERVIEW_LEADERBOARD_LOGIC = String.raw`
      function renderEigenphiProtocols(overview) {
        const rows = overview && overview.protocols && Array.isArray(overview.protocols.data)
          ? overview.protocols.data
          : [];
        html('protocolRows', rows.length ? rows.map(function (row) {
          const info = row.protocolInfo || {};
          const showName = info.showName || info.name || '--';
          const localIcon = protocolIconSrc(showName);
          const iconSrc = localIcon || info.icon || '';
          const icon = iconSrc ? '<img src="' + escapeHtml(iconSrc) + '" alt="protocol" />' : '';
          return '<tr>' +
            '<td><span class="protocol-name">' + icon + '<span>' + escapeHtml(String(showName)) + '</span></span></td>' +
            '<td>' + escapeHtml(formatUsd(row.liquidationAmount)) + '</td>' +
            '<td>' + escapeHtml(formatInteger(row.liquidationTxCount)) + '</td>' +
            '<td>' + escapeHtml(formatInteger(row.liquidatorCount)) + '</td>' +
            '<td>' + escapeHtml(formatInteger(row.liquidatedBorrowerCount)) + '</td>' +
            '<td>' + escapeHtml(formatInteger(row.liquidatedAssetCount)) + '</td>' +
          '</tr>';
        }).join('') : '<tr><td colspan="6">--</td></tr>');
      }

      function leaderboardProtocolIcon(name) {
        const src = protocolIconSrc(name);
        return src ? '<img src="' + escapeHtml(src) + '" alt="protocol" />' : '';
      }

      function renderLeaderboardAddress(value) {
        const stringValue = String(value || '--');
        return '<span class="leaderboard-address">' +
          '<img class="leaderboard-identicon" src="' + leaderboardIdenticon(stringValue) + '" alt="avatar" />' +
          '<span class="leaderboard-address-text">' +
            '<span class="leaderboard-address-value">' + escapeHtml(shortAddress(stringValue)) + '</span>' +
            '<button class="leaderboard-address-copy" type="button" data-copy-value="' + escapeHtml(stringValue) + '" aria-label="Copy address">' +
              '<img src="/img/c2.svg" alt="" aria-hidden="true" />' +
              '<span class="leaderboard-copy-tooltip">' + escapeHtml(copyActionLabel()) + '</span>' +
            '</button>' +
          '</span>' +
        '</span>';
      }

      function renderLeaderboardHash(value) {
        const stringValue = String(value || '--');
        return '<span class="leaderboard-address">' +
          '<img class="leaderboard-identicon" src="' + leaderboardIdenticon(stringValue) + '" alt="tx" />' +
          '<span class="leaderboard-address-text">' +
            '<button class="leaderboard-address-value as-link" type="button" data-open-txgraph="' + escapeHtml(stringValue) + '">' + escapeHtml(shortAddress(stringValue)) + '</button>' +
            '<button class="leaderboard-address-copy" type="button" data-copy-value="' + escapeHtml(stringValue) + '" aria-label="Copy hash">' +
              '<img src="/img/c2.svg" alt="" aria-hidden="true" />' +
              '<span class="leaderboard-copy-tooltip">' + escapeHtml(copyActionLabel()) + '</span>' +
            '</button>' +
          '</span>' +
        '</span>';
      }

      function renderLeaderboardAsset(value) {
        const textValue = String(value || '--').trim() || '--';
        const parts = textValue.split(/\s+/).filter(Boolean);
        const items = parts
          .map(function (part) {
            const src = assetIconSrc(part);
            if (!src) {
              return '<span class="leaderboard-asset-part"><span class="leaderboard-asset-value">' + escapeHtml(part) + '</span></span>';
            }
            return '<span class="leaderboard-asset-part"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(part) + '" /><span class="leaderboard-asset-value">' + escapeHtml(part) + '</span></span>';
          })
          .filter(Boolean)
          .join('');
        if (!items) {
          return escapeHtml(textValue);
        }
        return '<span class="leaderboard-asset">' + items + '</span>';
      }

      function renderLeaderboardLatest(rows) {
        const cols = t('leaderboardColumns').liquidations;
        const header = [
          leaderboardHeaderCell(cols[0]),
          leaderboardHeaderCell(cols[1]),
          leaderboardHeaderCell(cols[2]),
          leaderboardHeaderCell(cols[3]),
          leaderboardHeaderCell(cols[4], 'is-numeric'),
          leaderboardHeaderCell(cols[5], 'is-numeric')
        ].join('');
        if (!rows.length) {
          return { header: header, rows: leaderboardEmptyRow(cols.length) };
        }
        return {
          header: header,
          rows: rows.slice(0, 5).map(function (row) {
            return '<tr>' +
              leaderboardDataCell(escapeHtml(formatLeaderboardTime(row.time))) +
              leaderboardDataCell(renderLeaderboardHash(row.txHash)) +
              leaderboardDataCell(renderLeaderboardAddress(row.liquidator)) +
              leaderboardDataCell(renderLeaderboardAsset(row.asset)) +
              leaderboardDataCell(escapeHtml(formatUsd(row.amount)), 'is-numeric') +
              leaderboardDataCell(renderLeaderboardProtocol(row.protocol), 'is-numeric') +
            '</tr>';
          }).join('')
        };
      }

      function leaderboardHeaderCell(label, className) {
        return '<th' + (className ? ' class="' + className + '"' : '') + '>' + escapeHtml(label) + '</th>';
      }

      function leaderboardDataCell(value, className) {
        return '<td' + (className ? ' class="' + className + '"' : '') + '>' + value + '</td>';
      }

      function leaderboardEmptyRow(columnCount) {
        return '<tr><td colspan="' + columnCount + '">' + escapeHtml(t('leaderboardEmpty')) + '</td></tr>';
      }

      function renderLeaderboardProtocol(protocol) {
        if (!protocol) return '--';
        return '<span class="leaderboard-asset">' + leaderboardProtocolIcon(protocol) + '<span>' + escapeHtml(String(protocol)) + '</span></span>';
      }

      function renderLeaderboardTxProfit(rows) {
        const cols = t('leaderboardColumns').txProfit;
        const header = [
          leaderboardHeaderCell(cols[0]),
          leaderboardHeaderCell(cols[1]),
          leaderboardHeaderCell(cols[2]),
          leaderboardHeaderCell(cols[3]),
          leaderboardHeaderCell(cols[4], 'is-numeric'),
          leaderboardHeaderCell(cols[5], 'is-numeric'),
          leaderboardHeaderCell(cols[6], 'is-numeric'),
          leaderboardHeaderCell(cols[7], 'is-numeric')
        ].join('');
        if (!rows.length) return { header: header, rows: leaderboardEmptyRow(cols.length) };
        return {
          header: header,
          rows: rows.slice(0, 12).map(function (row) {
            return '<tr>' +
              leaderboardDataCell(escapeHtml(formatLeaderboardTime(row.time))) +
              leaderboardDataCell(renderLeaderboardHash(row.txHash)) +
              leaderboardDataCell(renderLeaderboardAddress(row.liquidator)) +
              leaderboardDataCell(renderLeaderboardAsset(row.asset)) +
              leaderboardDataCell(escapeHtml(formatUsd(row.profit)), 'is-numeric') +
              leaderboardDataCell(escapeHtml(formatUsd(row.cost)), 'is-numeric') +
              leaderboardDataCell(escapeHtml(formatUsd(row.revenue)), 'is-numeric') +
              leaderboardDataCell(renderLeaderboardProtocol(row.protocol), 'is-numeric') +
            '</tr>';
          }).join('')
        };
      }

      function renderLeaderboardLiquidations(rows) {
        const cols = t('leaderboardColumns').liquidations;
        const header = [
          leaderboardHeaderCell(cols[0]),
          leaderboardHeaderCell(cols[1]),
          leaderboardHeaderCell(cols[2]),
          leaderboardHeaderCell(cols[3]),
          leaderboardHeaderCell(cols[4], 'is-numeric'),
          leaderboardHeaderCell(cols[5], 'is-numeric')
        ].join('');
        if (!rows.length) return { header: header, rows: leaderboardEmptyRow(cols.length) };
        return {
          header: header,
          rows: rows.slice(0, 12).map(function (row) {
            return '<tr>' +
              leaderboardDataCell(escapeHtml(formatLeaderboardTime(row.time))) +
              leaderboardDataCell(renderLeaderboardHash(row.txHash)) +
              leaderboardDataCell(renderLeaderboardAddress(row.liquidator)) +
              leaderboardDataCell(renderLeaderboardAsset(row.asset)) +
              leaderboardDataCell(escapeHtml(formatUsd(row.amount)), 'is-numeric') +
              leaderboardDataCell(renderLeaderboardProtocol(row.protocol), 'is-numeric') +
            '</tr>';
          }).join('')
        };
      }

      function renderLeaderboardLiquidators(rows) {
        const cols = t('leaderboardColumns').liquidators;
        const header = [
          leaderboardHeaderCell(cols[0]),
          leaderboardHeaderCell(cols[1], 'is-numeric'),
          leaderboardHeaderCell(cols[2], 'is-numeric'),
          leaderboardHeaderCell(cols[3], 'is-numeric')
        ].join('');
        if (!rows.length) return { header: header, rows: leaderboardEmptyRow(cols.length) };
        return {
          header: header,
          rows: rows.slice(0, 12).map(function (row) {
            return '<tr>' +
              leaderboardDataCell(renderLeaderboardAddress(row.liquidator)) +
              leaderboardDataCell(escapeHtml(formatUsd(row.amount)), 'is-numeric') +
              leaderboardDataCell(escapeHtml(formatInteger(row.txCount)), 'is-numeric') +
              leaderboardDataCell(escapeHtml(formatInteger(row.liquidatedAssetCount)), 'is-numeric') +
            '</tr>';
          }).join('')
        };
      }

      function renderLeaderboardAssets(rows) {
        const cols = t('leaderboardColumns').liquidatedAssets;
        const header = [
          leaderboardHeaderCell(cols[0]),
          leaderboardHeaderCell(cols[1], 'is-numeric'),
          leaderboardHeaderCell(cols[2], 'is-numeric')
        ].join('');
        if (!rows.length) return { header: header, rows: leaderboardEmptyRow(cols.length) };
        return {
          header: header,
          rows: rows.slice(0, 12).map(function (row) {
            return '<tr>' +
              leaderboardDataCell(renderLeaderboardAsset(row.asset)) +
              leaderboardDataCell(escapeHtml(formatUsd(row.amount)), 'is-numeric') +
              leaderboardDataCell(escapeHtml(formatInteger(row.txCount)), 'is-numeric') +
            '</tr>';
          }).join('')
        };
      }

      function renderLeaderboardBorrowers(rows) {
        const cols = t('leaderboardColumns').liquidatedBorrowers;
        const header = [
          leaderboardHeaderCell(cols[0]),
          leaderboardHeaderCell(cols[1], 'is-numeric'),
          leaderboardHeaderCell(cols[2], 'is-numeric'),
          leaderboardHeaderCell(cols[3], 'is-numeric')
        ].join('');
        if (!rows.length) return { header: header, rows: leaderboardEmptyRow(cols.length) };
        return {
          header: header,
          rows: rows.slice(0, 12).map(function (row) {
            return '<tr>' +
              leaderboardDataCell(renderLeaderboardAddress(row.borrower)) +
              leaderboardDataCell(escapeHtml(formatUsd(row.amount)), 'is-numeric') +
              leaderboardDataCell(escapeHtml(formatInteger(row.txCount)), 'is-numeric') +
              leaderboardDataCell(escapeHtml(formatInteger(row.liquidatedAssetCount)), 'is-numeric') +
            '</tr>';
          }).join('')
        };
      }

      const latestDateMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const latestDateWeekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

      function latestDateParts(value) {
        if (!value || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
        const parts = value.split('-').map(function (part) { return Number(part); });
        if (parts.some(function (part) { return !Number.isFinite(part); })) return null;
        return { year: parts[0], month: parts[1] - 1, day: parts[2] };
      }

      function latestDateToValue(year, month, day) {
        return String(year).padStart(4, '0') + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      }

      function latestDateDisplay(value) {
        const parts = latestDateParts(value);
        if (!parts) return '';
        return latestDateMonthNames[parts.month] + ' ' + parts.day + ', ' + parts.year;
      }

      function ensureLatestDatePickerBase() {
        if (Number.isInteger(state.latestLiquidation.pickerYear) && Number.isInteger(state.latestLiquidation.pickerMonth)) {
          return;
        }
        const selected = latestDateParts(state.latestLiquidation.date);
        const base = selected || (function () {
          const now = new Date();
          return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
        })();
        state.latestLiquidation.pickerYear = base.year;
        state.latestLiquidation.pickerMonth = base.month;
      }

      function openLatestDatePicker() {
        ensureLatestDatePickerBase();
        state.latestLiquidation.pickerOpen = true;
        renderLatestDatePicker();
      }

      function closeLatestDatePicker() {
        state.latestLiquidation.pickerOpen = false;
        renderLatestDatePicker();
      }

      function shiftLatestDatePickerMonth(delta) {
        ensureLatestDatePickerBase();
        let year = state.latestLiquidation.pickerYear;
        let month = state.latestLiquidation.pickerMonth + delta;
        while (month < 0) {
          month += 12;
          year -= 1;
        }
        while (month > 11) {
          month -= 12;
          year += 1;
        }
        state.latestLiquidation.pickerYear = year;
        state.latestLiquidation.pickerMonth = month;
        renderLatestDatePicker();
      }

      function renderLatestDatePicker() {
        const picker = document.getElementById('latestLiquidationDatePicker');
        const title = document.getElementById('latestLiquidationDateTitle');
        const weekdays = document.getElementById('latestLiquidationDateWeekdays');
        const grid = document.getElementById('latestLiquidationDateGrid');
        const input = document.getElementById('latestLiquidationDate');
        if (!picker || !title || !weekdays || !grid || !input) return;

        input.setAttribute('aria-expanded', state.latestLiquidation.pickerOpen ? 'true' : 'false');
        picker.hidden = !state.latestLiquidation.pickerOpen;
        if (!state.latestLiquidation.pickerOpen) {
          return;
        }

        ensureLatestDatePickerBase();
        title.textContent = latestDateMonthNames[state.latestLiquidation.pickerMonth] + ' ' + state.latestLiquidation.pickerYear;
        weekdays.innerHTML = latestDateWeekdays.map(function (label) {
          return '<div class="latest-date-picker-weekday">' + label + '</div>';
        }).join('');

        const selected = latestDateParts(state.latestLiquidation.date);
        const firstOfMonth = new Date(state.latestLiquidation.pickerYear, state.latestLiquidation.pickerMonth, 1);
        const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
        const gridStart = new Date(state.latestLiquidation.pickerYear, state.latestLiquidation.pickerMonth, 1 - firstWeekday);
        const cells = [];
        for (let index = 0; index < 42; index += 1) {
          const current = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
          const inCurrentMonth = current.getMonth() === state.latestLiquidation.pickerMonth;
          const weekend = current.getDay() === 0 || current.getDay() === 6;
          const value = latestDateToValue(current.getFullYear(), current.getMonth(), current.getDate());
          const isSelected = selected && value === state.latestLiquidation.date;
          const classNames = ['latest-date-picker-day'];
          if (inCurrentMonth) classNames.push('is-current');
          if (weekend) classNames.push('is-weekend');
          if (isSelected) classNames.push('is-selected');
          cells.push(
            '<button class="' + classNames.join(' ') + '" type="button" data-date-value="' + value + '">' +
              current.getDate() +
            '</button>'
          );
        }
        grid.innerHTML = cells.join('');
      }

      function syncLatestLiquidationControls() {
        const dateInput = document.getElementById('latestLiquidationDate');
        const dateWrap = document.getElementById('latestLiquidationDateWrap');
        const pageSizeSelect = document.getElementById('latestLiquidationPageSize');
        if (dateInput) {
          dateInput.value = latestDateDisplay(state.latestLiquidation.date);
          dateInput.dataset.empty = state.latestLiquidation.date ? '0' : '1';
        }
        if (dateWrap) {
          dateWrap.classList.toggle('has-value', Boolean(state.latestLiquidation.date));
        }
        if (pageSizeSelect) {
          pageSizeSelect.value = String(state.latestLiquidation.pageSize || 10);
        }
        qsa('.latest-unit-button').forEach(function (button) {
          button.classList.toggle('active', button.getAttribute('data-unit') === state.latestLiquidation.unit);
        });
        renderLatestDatePicker();
      }

      function formatLatestLiquidationValue(value) {
        if (state.latestLiquidation.unit === 'quantity') {
          return formatMetricNumber(value, 4);
        }
        return formatUsd(value);
      }

      function renderLatestLiquidation(payload) {
        syncLatestLiquidationControls();
        const cols = t('latestLiquidationColumns');
        const header = [
          leaderboardHeaderCell(cols[0]),
          leaderboardHeaderCell(cols[1]),
          leaderboardHeaderCell(cols[2]),
          leaderboardHeaderCell(cols[3]),
          leaderboardHeaderCell(cols[4]),
          leaderboardHeaderCell(cols[5], 'is-numeric'),
          leaderboardHeaderCell(cols[6]),
          leaderboardHeaderCell(cols[7], 'is-numeric'),
          leaderboardHeaderCell(cols[8], 'is-numeric')
        ].join('');

        html('latestLiquidationHeaderRow', header);

        if (state.loading.eigenphiLatestLiquidation && !payload) {
          html('latestLiquidationRows', [
            '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
            '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>',
            '<tr><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td><td><div class="skeleton-table-cell"></div></td></tr>'
          ].join(''));
          text('latestLiquidationUpdated', '--');
          text('latestLiquidationRange', '0 - 0');
          document.getElementById('latestLiquidationPrev').disabled = true;
          document.getElementById('latestLiquidationNext').disabled = true;
          return;
        }

        const rows = payload && payload.ok && Array.isArray(payload.rows) ? payload.rows : [];
        html('latestLiquidationRows', rows.length ? rows.map(function (row) {
          const debtValue = state.latestLiquidation.unit === 'quantity' ? row.debtQuantity : row.debtToCover;
          const liquidationValue = state.latestLiquidation.unit === 'quantity' ? row.liquidationQuantity : row.liquidationAmount;
          return '<tr>' +
            leaderboardDataCell(escapeHtml(formatLeaderboardTime(row.time))) +
            leaderboardDataCell(renderLeaderboardHash(row.txHash)) +
            leaderboardDataCell(renderLeaderboardAddress(row.borrower)) +
            leaderboardDataCell(renderLeaderboardAddress(row.liquidator)) +
            leaderboardDataCell(renderLeaderboardAsset(row.debtAsset)) +
            leaderboardDataCell(escapeHtml(formatLatestLiquidationValue(debtValue)), 'is-numeric') +
            leaderboardDataCell(renderLeaderboardAsset(row.liquidationAsset)) +
            leaderboardDataCell(escapeHtml(formatLatestLiquidationValue(liquidationValue)), 'is-numeric') +
            leaderboardDataCell(renderLeaderboardProtocol(row.protocol), 'is-numeric') +
          '</tr>';
        }).join('') : leaderboardEmptyRow(cols.length).replace(t('leaderboardEmpty'), t('latestLiquidationNoData')));

        text('latestLiquidationUpdated', payload && payload.updateTimestamp ? formatRelativeFromUnix(payload.updateTimestamp) : '--');
        if (payload && payload.rangeEnd) {
          text('latestLiquidationRange', String((payload.rangeStart || 0) + 1) + ' - ' + String(payload.rangeEnd || 0));
        } else {
          text('latestLiquidationRange', '0 - 0');
        }
        document.getElementById('latestLiquidationPrev').disabled = !(payload && payload.hasPrev);
        document.getElementById('latestLiquidationNext').disabled = !(payload && payload.hasNext);
      }

      function renderEigenphiLeaderboard(payload) {
        const tabs = payload && payload.tabs ? payload.tabs : {};
        const latestRows = payload && payload.latest && Array.isArray(payload.latest.rows) ? payload.latest.rows : [];
        const tabKey = tabs[state.leaderboardTab] ? state.leaderboardTab : 'txProfit';
        const dataset = tabs[tabKey] && Array.isArray(tabs[tabKey].rows) ? tabs[tabKey].rows : [];
        let rendered;
        const latestRendered = renderLeaderboardLatest(latestRows);

        qsa('.leaderboard-tab').forEach(function (node) {
          node.classList.toggle('active', node.getAttribute('data-tab') === tabKey);
        });

        html('leaderboardLatestHeaderRow', latestRendered.header);
        html('leaderboardLatestRows', latestRendered.rows);

        if (tabKey === 'liquidations') rendered = renderLeaderboardLiquidations(dataset);
        else if (tabKey === 'liquidators') rendered = renderLeaderboardLiquidators(dataset);
        else if (tabKey === 'liquidatedAssets') rendered = renderLeaderboardAssets(dataset);
        else if (tabKey === 'liquidatedBorrowers') rendered = renderLeaderboardBorrowers(dataset);
        else rendered = renderLeaderboardTxProfit(dataset);

        html('leaderboardHeaderRow', rendered.header);
        html('leaderboardRows', rendered.rows);
      }
`;
