export const DASHBOARD_ARBITRAGE_LOGIC = String.raw`
      function renderArbitrage() {
        const wallets = state.data.wallet && state.data.wallet.wallets ? state.data.wallet.wallets : [];
        const ethereumWallet = wallets.find(function (item) { return item.chain === 'ethereum'; }) || null;
        const settingsWrapper = state.data.settings;
        const settings = settingsWrapper && settingsWrapper.settings ? settingsWrapper.settings : null;
        const historySummary = state.data.history && state.data.history.summary ? state.data.history.summary : {};
        const currentResult = state.arbitrageLastResult && state.arbitrageLastResult.parsed ? state.arbitrageLastResult.parsed : null;
        const inventorySnapshots = currentResult && Array.isArray(currentResult.inventorySnapshots)
          ? currentResult.inventorySnapshots
          : [];
        const rebalanceSuggestions = currentResult && Array.isArray(currentResult.rebalanceSuggestions)
          ? currentResult.rebalanceSuggestions
          : [];
        const orderPair = currentResult && currentResult.orderPair ? currentResult.orderPair : null;
        const selectedVenues = resolveConfiguredArbitrageVenues(settings);
        const selectedVenueCsv = selectedVenues.join(',');
        if (selectedVenueCsv && state.arbitrageForm.venues !== selectedVenueCsv) {
          state.arbitrageForm.venues = selectedVenueCsv;
        }
        const selectedVenuesDisplay = selectedVenues.length
          ? selectedVenues.map(arbitrageVenueLabel).join(' / ')
          : (state.language === 'zh' ? '请在配置中至少设置两家交易所' : 'Configure at least two exchanges');
        const selectedVenueCount = selectedVenues.length;
        const activeArbToken = String(state.arbitrageForm.token || '').trim();
        const trackedSymbols = activeArbToken || DEFAULT_ARBITRAGE_TOKEN_LIST;
        const paperNotionalValue = '1000 USD';
        const totalPaperUsdt = inventorySnapshots.reduce(function (sum, snapshot) {
          return sum + (toNumber(snapshot.quoteBalanceDisplay) || 0);
        }, 0);
        const totalPaperUsdtDisplay = totalPaperUsdt > 0 ? (totalPaperUsdt.toFixed(2) + ' USD') : '--';
        const opportunityRows = (state.arbitrageLiveTargets || [])
          .filter(function (row) { return !!row && !!row.user; })
          .map(function (row) {
            return {
              symbol: row.pathLabel || row.collateralSymbol || '--',
              venues: row.debtSymbol || '--',
              signalLabel: row.signalLabel || '--',
              buyPriceDisplay: row.buyPriceDisplay || row.grossProfitDisplay || '--',
              sellPriceDisplay: row.sellPriceDisplay || row.roughNetProfitDisplay || '--',
              netSpreadDisplay: row.selectionScoreDisplay || '--',
              feeEstimateDisplay: row.feeEstimateDisplay || '--',
              availableNotionalDisplay: row.availableNotionalDisplay || '--',
              liquidatable: !!row.liquidatable,
              state: row.state || '--',
              marketLabel: row.marketLabel || '--',
              rank: row.rank,
              user: row.user
            };
          })
          .sort(function (a, b) {
            const left = toNumber(a.netSpreadDisplay);
            const right = toNumber(b.netSpreadDisplay);
            if (left === null && right === null) return 0;
            if (left === null) return 1;
            if (right === null) return -1;
            return right - left;
          });
        const visibleOpportunityRows = opportunityRows.filter(function (row) {
          if (state.arbitrageFilter === 'positive') {
            return row.liquidatable;
          }
          if (state.arbitrageFilter === 'liquidatable') {
            return row.state === 'inventory-blocked';
          }
          if (state.arbitrageFilter === 'watch') {
            return !row.liquidatable && row.state !== 'inventory-blocked';
          }
          return true;
        }).slice(0, 16);
        const readyCount = opportunityRows.filter(function (row) {
          return row.liquidatable;
        }).length;
        const currentSelection = state.arbitrageAutoExecuteSelection && state.arbitrageAutoExecuteSelection.user
          ? state.arbitrageAutoExecuteSelection
          : null;
        const topOpportunity = opportunityRows[0] || null;
        const currentPriority = currentSelection
          ? String(currentSelection.pathLabel || '--') + ' / ' + String(currentSelection.debtSymbol || '--')
          : (topOpportunity
              ? String(topOpportunity.symbol || '--') + ' / ' + String(topOpportunity.venues || '--')
              : (state.language === 'zh' ? '等待首个价差结果' : 'Waiting for first spread result'));
        const latestReason = currentSelection
          ? (orderPair && orderPair.status === 'paper-ready'
              ? (state.language === 'zh' ? '净价差、深度和 paper 库存都已到位' : 'Net spread, depth, and paper inventory are all ready')
              : (orderPair && orderPair.status === 'inventory-blocked'
                  ? (state.language === 'zh' ? '价差存在，但买入所 USDT 或卖出所现货库存不足' : 'Spread exists, but USDT or sell-side inventory is short')
                  : (orderPair && orderPair.status === 'depth-blocked'
                      ? (state.language === 'zh' ? '价差存在，但盘口深度不足以支撑目标单笔规模' : 'Spread exists, but top-of-book depth is too thin for the target ticket')
                      : (state.language === 'zh' ? '继续观察盘口与手续费缓冲' : 'Keep watching books and fee buffers'))))
          : (topOpportunity
              ? (state.language === 'zh' ? '已开始抓取跨交易所盘口' : 'Cross-exchange quotes are now streaming')
              : (state.language === 'zh' ? '等待公开行情返回首批盘口' : 'Waiting for first public market quotes'));
        const machineMessage = selectedVenueCount < 2
          ? (state.language === 'zh' ? '至少选择两家交易所' : 'SELECT AT LEAST TWO EXCHANGES')
          : state.arbitrageRunStateMode === 'paused'
          ? (state.language === 'zh' ? '价差扫描已暂停' : 'SPREAD SCAN PAUSED')
          : currentSelection
            ? (
                ((orderPair && orderPair.status === 'paper-ready')
                  ? (state.language === 'zh' ? '纸上可执行 ' : 'PAPER READY ')
                  : ((orderPair && orderPair.status === 'inventory-blocked')
                      ? (state.language === 'zh' ? '先补库存 ' : 'REBALANCE ')
                      : (state.language === 'zh' ? '观察盘口 ' : 'WATCH BOOKS '))) +
                String(currentSelection.pathLabel || '--')
              )
            : (state.arbitrageRunStateMode === 'running'
                ? (state.language === 'zh' ? '扫描跨交易所价差' : 'SCANNING CEX SPREADS')
                : (state.language === 'zh' ? '等待启动价差扫描' : 'READY FOR SPREAD SCAN'));
        text('arbitragePageTitle', state.language === 'zh' ? '跨交易所套利台' : 'CEX Arbitrage Desk');
        text('arbitragePageSub', '');
        text('arbScanTitle', state.language === 'zh' ? '观察币对' : 'Watch Symbols');
        text('arbAssetLabel', state.language === 'zh' ? '已选交易所' : 'Selected Exchanges');
        text('arbAssetValue', selectedVenuesDisplay);
        text('arbRpcUsageLabel', state.language === 'zh' ? '观察币对' : 'Tracked Symbols');
        text('arbRpcUsageValue', trackedSymbols);
        text('arbDecisionLabel', state.language === 'zh' ? '当前机会首选' : 'Current Opportunity');
        text('arbDecisionValue', currentPriority);
        text(
          'arbDecisionMeta',
          currentSelection
            ? (
                String(currentSelection.debtSymbol || '--') +
                ' / 净价差 ' + String(currentSelection.selectionScoreDisplay || '--') +
                ' / 买价 ' + String(currentSelection.buyPriceDisplay || '--') +
                ' / 卖价 ' + String(currentSelection.sellPriceDisplay || '--') +
                (rebalanceSuggestions[0]
                  ? (' / ' + (state.language === 'zh' ? '再平衡 ' : 'Rebalance ') + String(rebalanceSuggestions[0].exchange || '--') + ' ' + String(rebalanceSuggestions[0].symbol || '--') + ' ' + String(rebalanceSuggestions[0].shortfallDisplay || '--'))
                  : '') +
                ' / ' + latestReason
              )
            : (selectedVenuesDisplay + ' / ' + latestReason)
        );
        const arbTokenInput = document.getElementById('arbTokenInput');
        if (arbTokenInput) {
          const nextValue = String(state.arbitrageForm.token || '').trim();
          if (arbTokenInput.value !== nextValue) {
            arbTokenInput.value = nextValue;
          }
          arbTokenInput.placeholder = DEFAULT_ARBITRAGE_TOKEN_LIST;
        }
        text('arbTerminalTitle', state.language === 'zh' ? '套利日志' : 'Arbitrage Log');
        const arbTerminalOutputText = document.getElementById('arbTerminalOutputText');
        if (arbTerminalOutputText) {
          const terminalText = String(state.arbitrageTerminal || '').replace(/\n+$/g, '');
          arbTerminalOutputText.textContent = terminalText || (state.language === 'zh'
            ? '$ CEX arbitrage workspace ready\n$ 修改配置里的交易所和币对后启动扫描'
            : '$ CEX arbitrage workspace ready\n$ Update configured venues and symbols before starting');
        }
        const arbTerminalOutput = document.getElementById('arbTerminalOutput');
        if (arbTerminalOutput) {
          arbTerminalOutput.scrollTop = arbTerminalOutput.scrollHeight;
        }
        const arbMachineGrid = document.getElementById('arbMachineGrid');
        if (arbMachineGrid) arbMachineGrid.classList.add('is-active');
        text('arbMachineText', machineMessage);

        const arbStartButton = document.getElementById('arbActionStart');
        const arbStartIcon = document.getElementById('arbActionStartIcon');
        const arbStartLabel = document.getElementById('arbActionStartLabel');
        const arbPauseButton = document.getElementById('arbActionPause');
        const arbPauseIcon = document.getElementById('arbActionPauseIcon');
        const arbPauseLabel = document.getElementById('arbActionPauseLabel');
        if (arbStartButton) arbStartButton.disabled = !!state.arbitrageRunning || selectedVenueCount < 2;
        if (arbPauseButton) arbPauseButton.disabled = !state.arbitrageRunning;
        if (arbStartButton) arbStartButton.classList.toggle('is-running', state.arbitrageRunStateMode === 'running');
        if (arbPauseButton) arbPauseButton.classList.toggle('is-paused', state.arbitrageRunStateMode === 'paused');
        if (arbStartIcon) arbStartIcon.setAttribute('src', state.arbitrageRunStateMode === 'running' ? '/img/run.svg' : '/img/readyStart.svg');
        if (arbPauseIcon) arbPauseIcon.setAttribute('src', '/img/stop.svg');
        if (arbStartLabel) arbStartLabel.textContent = state.arbitrageRunStateMode === 'paused'
          ? (state.language === 'zh' ? '继续价差扫描' : 'Resume Spread Scan')
          : (state.language === 'zh' ? '启动价差扫描' : 'Start Spread Scan');
        if (arbPauseLabel) arbPauseLabel.textContent = state.language === 'zh' ? '暂停监控' : 'Pause Monitor';

        text('arbSummaryBestLabel', state.language === 'zh' ? '最佳净价差' : 'Best Net Spread');
        text('arbSummaryBestValue', topOpportunity ? String(topOpportunity.netSpreadDisplay || '--') : '--');
        text('arbSummaryBestMeta', topOpportunity ? (String(topOpportunity.symbol || '--') + ' / ' + String(topOpportunity.venues || '--')) : (selectedVenuesDisplay + ' / ' + trackedSymbols));
        text('arbSummaryRealizedLabel', state.language === 'zh' ? 'Paper USDT' : 'Paper USDT');
        text('arbSummaryRealizedValue', totalPaperUsdtDisplay);
        text(
          'arbSummaryRealizedMeta',
          inventorySnapshots.length
            ? (state.language === 'zh'
                ? ('交易所 ' + String(inventorySnapshots.length) + ' / 单笔 ' + paperNotionalValue)
                : ('Venues ' + String(inventorySnapshots.length) + ' / Ticket ' + paperNotionalValue))
            : selectedVenueCount
              ? (state.language === 'zh'
                ? ('已选 ' + String(selectedVenueCount) + ' 家 / 单笔 ' + paperNotionalValue)
                : ('Selected ' + String(selectedVenueCount) + ' / Ticket ' + paperNotionalValue))
              : (state.language === 'zh'
                  ? '默认按单笔 1000 USD 估算净价差'
                  : 'Net spread is estimated on a 1000 USD paper ticket')
        );
        text('arbSummaryReadyLabel', state.language === 'zh' ? '活跃机会' : 'Live Opportunities');
        text('arbSummaryReadyValue', String(readyCount));
        text('arbSummaryReadyMeta', state.language === 'zh' ? ('总币对 ' + String(opportunityRows.length) + ' / 再平衡提醒 ' + String(rebalanceSuggestions.length)) : ('Total ' + String(opportunityRows.length) + ' / Rebalance ' + String(rebalanceSuggestions.length)));

        text('arbFilterAll', state.language === 'zh' ? '全部' : 'All');
        text('arbFilterPositive', state.language === 'zh' ? '可执行' : 'Executable');
        text('arbFilterLiquidatable', state.language === 'zh' ? '待再平衡' : 'Needs Rebalance');
        text('arbFilterWatch', state.language === 'zh' ? '待观察' : 'Watch');
        [
          ['arbFilterAll', 'all'],
          ['arbFilterPositive', 'positive'],
          ['arbFilterLiquidatable', 'liquidatable'],
          ['arbFilterWatch', 'watch']
        ].forEach(function (entry) {
          const node = document.getElementById(entry[0]);
          if (!node) return;
          const active = state.arbitrageFilter === entry[1];
          node.classList.toggle('is-active', active);
          node.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        text('arbThMarket', state.language === 'zh' ? '币对' : 'Symbol');
        text('arbThPair', state.language === 'zh' ? '买入所 / 卖出所' : 'Buy / Sell');
        text('arbThHf', state.language === 'zh' ? '净价差' : 'Net Spread');
        text('arbThGross', state.language === 'zh' ? '买价' : 'Buy Price');
        text('arbThNet', state.language === 'zh' ? '卖价' : 'Sell Price');
        text('arbThState', state.language === 'zh' ? '状态' : 'Status');
        text('arbThAction', state.language === 'zh' ? '动作' : 'Action');
        html('arbOpportunityRows', visibleOpportunityRows.length
          ? visibleOpportunityRows.map(function (row) {
              const statusText = row.liquidatable
                ? (state.language === 'zh' ? '纸上可执行' : 'Paper-ready')
                : (row.state === 'inventory-blocked'
                    ? (state.language === 'zh' ? '库存不足' : 'Inventory short')
                    : (state.language === 'zh' ? '继续观察' : 'Watch'));
              const actionText = row.liquidatable
                ? (state.language === 'zh' ? '等待 API 下单' : 'Await API execution')
                : (row.state === 'inventory-blocked'
                    ? (state.language === 'zh' ? '补 USDT / 现货库存' : 'Top up USDT / asset')
                    : (state.language === 'zh' ? '继续扫描' : 'Keep scanning'));
              const rowClass = row.liquidatable
                ? ' class="is-broadcastable"'
                : (row.state === 'inventory-blocked' ? ' class="is-liquidatable"' : '');
              return '<tr' + rowClass + '>' +
                '<td>' + escapeHtml(String(row.symbol || '--')) + '</td>' +
                '<td>' + escapeHtml(String(row.venues || '--')) + '</td>' +
                '<td>' + escapeHtml(String(row.netSpreadDisplay || '--')) + '</td>' +
                '<td>' + escapeHtml(String(row.buyPriceDisplay || '--')) + '</td>' +
                '<td>' + escapeHtml(String(row.sellPriceDisplay || '--')) + '</td>' +
                '<td>' + escapeHtml(statusText) + '</td>' +
                '<td>' + escapeHtml(actionText) + '</td>' +
              '</tr>';
            }).join('')
          : '<tr><td colspan="7">' + escapeHtml(state.language === 'zh'
              ? ('暂无公开盘口结果。点击“启动价差扫描”，开始抓取配置中的 ' + selectedVenuesDisplay + ' 实时价差。')
              : ('No public quote results yet. Start the spread scanner to pull live opportunities from configured venues: ' + selectedVenuesDisplay + '.')) + '</td></tr>');
      }

      function syncArbitrageFormFromInputs() {
        state.arbitrageForm.chain = 'cex';
        state.arbitrageForm.rpcUrl = '';
        const arbTokenInput = document.getElementById('arbTokenInput');
        state.arbitrageForm.token = arbTokenInput
          ? String(arbTokenInput.value || '').trim()
          : String(state.arbitrageForm.token || '').trim();
        persistArbitrageTokenPreference(state.arbitrageForm.token);
        const settingsWrapper = state.data.settings;
        const settings = settingsWrapper && settingsWrapper.settings ? settingsWrapper.settings : null;
        state.arbitrageForm.venues = resolveConfiguredArbitrageVenues(settings).join(',');
      }

      function syncArbitrageTerminalOutput() {
        const node = document.getElementById('arbTerminalOutputText');
        if (!node) return;
        node.textContent = String(state.arbitrageTerminal || '').replace(/\\n+$/g, '');
      }

      function appendArbitrageTerminal(chunk) {
        state.arbitrageTerminal += chunk;
        syncArbitrageTerminalOutput();
        const container = document.getElementById('arbTerminalOutput');
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }

      function appendArbitrageTerminalNormalized(chunk) {
        const runSerial = Math.max(1, Number(state.arbitrageAutoExecuteRunSerial || 1));
        const normalized = String(chunk).replace(/\\$ cycle (\\d+)/g, function (_match, cycle) {
          return '$ round ' + String(runSerial) + ' / cycle ' + String(cycle);
        });
        appendArbitrageTerminal(normalized);
      }

      function mergeArbitrageTargets(rows) {
        if (!Array.isArray(rows)) return;
        state.arbitrageLiveTargets = rows
          .filter(function (row) { return !!row && !!row.user; })
          .map(function (row) {
            return {
              rank: typeof row.rank === 'number' ? row.rank : undefined,
              marketKey: row.marketKey || undefined,
              marketLabel: row.marketLabel || '--',
              user: row.user,
              pathLabel: row.pathLabel || undefined,
              signalLabel: row.signalLabel || undefined,
              healthFactor: row.healthFactor || '--',
              liquidatable: !!row.liquidatable,
              state: row.state || '--',
              debtSymbol: row.debtSymbol || '--',
              collateralSymbol: row.collateralSymbol || '--',
              grossProfitDisplay: row.grossProfitDisplay || '--',
              roughNetProfitDisplay: row.roughNetProfitDisplay || '--',
              selectionScoreDisplay: row.selectionScoreDisplay || '--',
              selectionMethod: row.selectionMethod || '--',
              source: row.source || 'scan',
              buyExchange: row.buyExchange || undefined,
              sellExchange: row.sellExchange || undefined,
              buyPriceDisplay: row.buyPriceDisplay || undefined,
              sellPriceDisplay: row.sellPriceDisplay || undefined,
              feeEstimateDisplay: row.feeEstimateDisplay || undefined,
              availableNotionalDisplay: row.availableNotionalDisplay || undefined
            };
          })
          .sort(function (a, b) {
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

      async function startArbitrageAutoExecute(options) {
        if (state.arbitrageRunning) {
          return;
        }
        const preserveSession = Boolean(options && options.preserveSession);
        syncArbitrageFormFromInputs();
        if (parseArbitrageVenueSelection(state.arbitrageForm.venues || '').length < 2) {
          appendArbitrageTerminal('\\n$ failed: 请先在配置里设置至少两家交易所\\n');
          renderArbitrage();
          return;
        }
        if (!preserveSession) {
          state.arbitrageAutoExecuteRunSerial = 0;
        }
        const resumeCursor = state.arbitrageRunStateMode === 'paused' && state.arbitrageAutoExecuteResumeCursor
          ? state.arbitrageAutoExecuteResumeCursor
          : null;
        const forcedResumeCursor = !resumeCursor && preserveSession && state.arbitrageAutoExecuteResumeCursor
          ? state.arbitrageAutoExecuteResumeCursor
          : null;
        const activeResumeCursor = resumeCursor || forcedResumeCursor;
        const isResuming = !!(activeResumeCursor && activeResumeCursor.resumeFromBlock);
        state.arbitrageAutoExecuteRunSerial = Number(state.arbitrageAutoExecuteRunSerial || 0) + 1;
        state.arbitrageRunning = true;
        state.arbitrageHasRun = true;
        state.arbitrageRunStateMode = 'running';
        if (isResuming) {
          appendArbitrageTerminal('\\n$ 从区块 ' + String(activeResumeCursor.resumeFromBlock) + ' 继续套利台\\n');
        } else if (preserveSession) {
          appendArbitrageTerminal('\\n$ 继续上一轮套利监控...\\n');
        } else {
          state.arbitrageLiveTargets = [];
          state.arbitrageAutoExecuteSelection = null;
          state.arbitrageLastResult = null;
          state.arbitrageAutoExecuteResumeCursor = null;
          state.arbitrageTerminal = '$ 启动跨交易所价差扫描...\\n';
          state.arbitrageTerminal += '$ 交易所 ' + parseArbitrageVenueSelection(state.arbitrageForm.venues || '').map(arbitrageVenueLabel).join(', ') + '\\n';
          state.arbitrageTerminal += '$ 币对 ' + (String(state.arbitrageForm.token || '').trim() || DEFAULT_ARBITRAGE_TOKEN_LIST) + '\\n';
          appendArbitrageTerminal('');
        }
        renderArbitrage();

        const query = new URLSearchParams();
        query.set('market', state.arbitrageForm.market || 'route-arb-ethereum');
        if (state.arbitrageForm.token) query.set('token', String(state.arbitrageForm.token));
        if (state.arbitrageForm.venues) query.set('venues', String(state.arbitrageForm.venues));
        if (isResuming && activeResumeCursor) {
          query.set('resumeFromBlock', String(activeResumeCursor.resumeFromBlock));
          if (activeResumeCursor.resumeChunkStart) query.set('resumeChunkStart', String(activeResumeCursor.resumeChunkStart));
          if (activeResumeCursor.resumeChunkEnd) query.set('resumeChunkEnd', String(activeResumeCursor.resumeChunkEnd));
          if (activeResumeCursor.resumeUserOffset) query.set('resumeUserOffset', String(activeResumeCursor.resumeUserOffset));
        }

        const controller = new AbortController();
        state.arbitrageAutoExecuteAbortController = controller;
        let shouldReconnect = false;
        let streamEndedUnexpectedly = false;

        try {
          const response = await fetch('/api/arbitrage-stream?' + query.toString(), {
            method: 'GET',
            signal: controller.signal
          });
          if (!response.body) {
            throw new Error('Empty response body.');
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            const lines = buffer.split('\\n');
            buffer = lines.pop() || '';
            lines.forEach(function (line) {
              if (!line.trim()) return;
              const event = JSON.parse(line);
              if (event.type === 'meta') {
                appendArbitrageTerminal(
                  '$ auto-execute ' +
                  String(event.marketLabel || event.market || event.chain || '--') +
                  ' / round ' +
                  String(state.arbitrageAutoExecuteRunSerial) +
                  '\\n'
                );
                renderArbitrage();
              } else if (event.type === 'stdout' || event.type === 'stderr') {
                appendArbitrageTerminalNormalized(event.data);
              } else if (event.type === 'targets') {
                mergeArbitrageTargets(event.data);
                renderArbitrage();
              } else if (event.type === 'selection') {
                state.arbitrageAutoExecuteSelection = event.data || null;
                if (!event.data) {
                  renderArbitrage();
                  return;
                }
                appendArbitrageTerminal(
                  '$ 价差首选 #' +
                    String(event.data && typeof event.data.rank === 'number' ? event.data.rank : 1) +
                    ' [' +
                    String(event.data && event.data.pathLabel ? event.data.pathLabel : '--') +
                    '] ' +
                    String(event.data && event.data.debtSymbol ? event.data.debtSymbol : '--') +
                    ' | ' +
                    '买 ' + String(event.data && event.data.buyPriceDisplay ? event.data.buyPriceDisplay : '--') +
                    ' / 卖 ' + String(event.data && event.data.sellPriceDisplay ? event.data.sellPriceDisplay : '--') +
                    ' | net spread ' +
                    String(event.data && event.data.selectionScoreDisplay ? event.data.selectionScoreDisplay : '--') +
                    '\\n'
                );
                renderArbitrage();
              } else if (event.type === 'execution') {
                state.arbitrageLastResult = event.data;
                appendArbitrageTerminal(
                  '$ arbitrage execution ' +
                    String(event.data && event.data.ok ? 'completed' : 'blocked') +
                    '\\n'
                );
                renderArbitrage();
              } else if (event.type === 'progress') {
                state.arbitrageAutoExecuteResumeCursor = {
                  resumeFromBlock: event.resumeFromBlock ? String(event.resumeFromBlock) : (event.nextFromBlock ? String(event.nextFromBlock) : null),
                  resumeChunkStart: event.resumeChunkStart ? String(event.resumeChunkStart) : null,
                  resumeChunkEnd: event.resumeChunkEnd ? String(event.resumeChunkEnd) : null,
                  resumeUserOffset: event.resumeUserOffset ? String(event.resumeUserOffset) : '0'
                };
              } else if (event.type === 'result') {
                state.arbitrageLastResult = event.data;
                if (state.arbitrageRunStateMode === 'running') {
                  shouldReconnect = true;
                  streamEndedUnexpectedly = true;
                  const streamError = event.data && event.data.ok === false && event.data.error
                    ? String(event.data.error)
                    : '';
                  appendArbitrageTerminal(
                    '\\n$ ' +
                      (
                        streamError
                          ? 'stream interrupted, reconnecting: ' + streamError
                          : 'stream interrupted, reconnecting...'
                      ) +
                      '\\n'
                  );
                } else {
                  appendArbitrageTerminal('\\n$ completed\\n');
                  state.arbitrageAutoExecuteResumeCursor = null;
                }
              }
            });
          }
          if (state.arbitrageRunStateMode === 'running') {
            shouldReconnect = true;
            streamEndedUnexpectedly = true;
          }
        } catch (error) {
          if (controller.signal.aborted) {
            if (state.arbitragePendingRestart) {
              state.arbitragePendingRestart = false;
              appendArbitrageTerminal('\\n$ 币对已更新，重新启动扫描...\\n');
              state.arbitrageRunStateMode = 'running';
              renderArbitrage();
              setTimeout(function () {
                void startArbitrageAutoExecute({ preserveSession: false });
              }, 50);
              return;
            }
            appendArbitrageTerminal('\\n$ paused\\n');
            state.arbitrageRunStateMode = 'paused';
            renderArbitrage();
            return;
          }
          appendArbitrageTerminal('\\n$ failed: ' + String(error) + '\\n');
          if (state.arbitrageRunStateMode === 'running') {
            shouldReconnect = true;
            streamEndedUnexpectedly = true;
          } else {
            state.arbitrageRunStateMode = 'idle';
            state.arbitrageAutoExecuteResumeCursor = null;
          }
        } finally {
          state.arbitrageRunning = false;
          state.arbitrageAutoExecuteAbortController = null;
          if (shouldReconnect && state.arbitrageRunStateMode === 'running') {
            renderArbitrage();
            setTimeout(function () {
              if (state.arbitrageRunStateMode === 'running' || state.arbitrageRunStateMode === 'idle') {
                state.arbitrageRunStateMode = 'running';
                void startArbitrageAutoExecute({ preserveSession: true });
              }
            }, streamEndedUnexpectedly ? 1000 : 3000);
            return;
          }
          if (state.arbitrageRunStateMode === 'running') {
            state.arbitrageRunStateMode = 'idle';
            state.arbitrageAutoExecuteResumeCursor = null;
          }
          renderArbitrage();
        }
      }

      function pauseArbitrageAutoExecute() {
        if (!state.arbitrageAutoExecuteAbortController) {
          return;
        }
        state.arbitrageAutoExecuteAbortController.abort();
      }
`;
