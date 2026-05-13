import { DASHBOARD_CONSOLE_RESULTS_LOGIC } from './dashboard-console-results-logic.js';

export const DASHBOARD_CONSOLE_LOGIC = String.raw`
      function createDashboardConsoleController(deps) {
        const {
          state,
          t,
          text,
          html,
          escapeHtml,
          shortAddress,
          toNumber,
          statusToneFromHf,
          formatMetricNumber,
          setAnimatedMetric,
          currentQuicknodeMetric,
          deriveTargets,
          applyMorphoMarketFilter,
          syncFormFromInputs,
          renderAll,
          openModal
        } = deps;
        let balanceTickTimer = null;
        let balanceRotationKey = '';
        let balanceRotationIndex = 0;
        let machineTickTimer = null;
        let machineTypeTimer = null;
        let machineRotationIndex = 0;
        let machineRotationKey = '';

        function stopBalanceTimer() {
          if (balanceTickTimer) {
            clearTimeout(balanceTickTimer);
            balanceTickTimer = null;
          }
        }

        function stopMachineTimers() {
          if (machineTickTimer) {
            clearTimeout(machineTickTimer);
            machineTickTimer = null;
          }
          if (machineTypeTimer) {
            clearTimeout(machineTypeTimer);
            machineTypeTimer = null;
          }
        }

        function setMachineActive(active) {
          const node = document.querySelector('.console-machine-grid');
          if (!node) return;
          node.classList.toggle('is-active', !!active);
        }

        function selectedExecutionMarketLabel() {
          const select = document.getElementById('marketSelect');
          if (select && select.selectedOptions && select.selectedOptions[0]) {
            return String(select.selectedOptions[0].textContent || '').trim() || '--';
          }
          if (state.form.market === 'auto-ethereum') return 'Auto Rotation / Ethereum';
          const config = state.data && state.data.config ? state.data.config : null;
          const markets = config && Array.isArray(config.executionMarkets) ? config.executionMarkets : [];
          const matched = markets.find(function (item) {
            return String(item && item.key ? item.key : '').toLowerCase() === String(state.form.market || '').toLowerCase();
          });
          return matched && matched.label ? String(matched.label) : 'Aave V3 / Ethereum';
        }

        function selectedChainLabel() {
          const key = String(state.form.chain || '').toLowerCase();
          if (key === 'bnb') return 'BNB Chain';
          if (key === 'ethereum') return 'Ethereum';
          if (key === 'arbitrum') return 'Arbitrum One';
          if (key === 'polygon') return 'Polygon';
          if (key === 'base') return 'Base';
          return key ? key.toUpperCase() : '--';
        }

        function compactUserLabel(value) {
          const label = String(value || '--').trim();
          if (!label || label === '--') return '--';
          if (!/^0x[a-fA-F0-9]{40}$/.test(label)) {
            return label;
          }
          return label.slice(0, 4) + '...' + label.slice(-4);
        }

        function compactUsdDisplay(value) {
          const label = String(value || '--').trim();
          if (!label || label === '--') return '--';
          return label.replace(/\s*USD$/i, '');
        }

        function consoleTargetKey(target) {
          if (!target) return '--::--';
          const marketKey = target.marketKey ? String(target.marketKey).toLowerCase() : '--';
          const user = target.user ? String(target.user).toLowerCase() : '--';
          return marketKey + '::' + user;
        }

        function hasActionablePair(target) {
          return !!target &&
            target.source === 'analyze' &&
            target.debtSymbol !== '--' &&
            target.collateralSymbol !== '--';
        }

        function compareTargetsByExecutionPriority(a, b) {
          const leftActionable = hasActionablePair(a);
          const rightActionable = hasActionablePair(b);
          if (leftActionable !== rightActionable) {
            return leftActionable ? -1 : 1;
          }

          if (!!a.liquidatable !== !!b.liquidatable) {
            return a.liquidatable ? -1 : 1;
          }

          const leftNet = toNumber(a.roughNetProfitDisplay);
          const rightNet = toNumber(b.roughNetProfitDisplay);
          const leftPositive = leftNet !== null && leftNet > 0;
          const rightPositive = rightNet !== null && rightNet > 0;
          if (leftPositive !== rightPositive) {
            return leftPositive ? -1 : 1;
          }

          const leftHf = toNumber(a.healthFactor);
          const rightHf = toNumber(b.healthFactor);
          if (leftHf !== null || rightHf !== null) {
            if (leftHf === null) return 1;
            if (rightHf === null) return -1;
            if (leftHf !== rightHf) return leftHf - rightHf;
          }

          if (leftNet !== null || rightNet !== null) {
            if (leftNet === null) return 1;
            if (rightNet === null) return -1;
            if (leftNet !== rightNet) return rightNet - leftNet;
          }

          const leftGross = toNumber(a.grossProfitDisplay);
          const rightGross = toNumber(b.grossProfitDisplay);
          if (leftGross !== null || rightGross !== null) {
            if (leftGross === null) return 1;
            if (rightGross === null) return -1;
            if (leftGross !== rightGross) return rightGross - leftGross;
          }

          if (typeof a.rank === 'number' && typeof b.rank === 'number' && a.rank !== b.rank) {
            return a.rank - b.rank;
          }
          if (typeof a.rank === 'number') return -1;
          if (typeof b.rank === 'number') return 1;

          return String(a.user || '').localeCompare(String(b.user || ''));
        }

        function currentSelectionExecutionResult() {
          const selection = state.autoExecuteSelection;
          const parsed = state.lastResult && state.lastResult.parsed ? state.lastResult.parsed : null;
          if (!selection || !selection.user || !parsed) return null;
          const executionMarketKey = parsed.executionMarketKey
            ? String(parsed.executionMarketKey).toLowerCase()
            : '';
          const selectionMarketKey = selection.marketKey
            ? String(selection.marketKey).toLowerCase()
            : '';
          const executionPayload = parsed.executeLiquidation || parsed.liquidationCall || null;
          const executionDebtSymbol = executionPayload && executionPayload.debtSymbol
            ? String(executionPayload.debtSymbol).toLowerCase()
            : '';
          const executionCollateralSymbol = executionPayload && executionPayload.collateralSymbol
            ? String(executionPayload.collateralSymbol).toLowerCase()
            : '';
          if (
            executionMarketKey !== selectionMarketKey ||
            String(parsed.selectedUser || '').toLowerCase() !== String(selection.user || '').toLowerCase() ||
            executionDebtSymbol !== String(selection.debtSymbol || '').toLowerCase() ||
            executionCollateralSymbol !== String(selection.collateralSymbol || '').toLowerCase()
          ) {
            return null;
          }
          return parsed;
        }

        function latestExecutionReason() {
          const parsed = currentSelectionExecutionResult();
          if (!parsed) return '';
          const executionGate = parsed.executionGate || null;
          const autoSwap = parsed.autoSwap || null;
          if (executionGate && typeof executionGate.reason === 'string' && executionGate.reason.trim()) {
            return executionGate.reason.trim();
          }
          if (autoSwap && typeof autoSwap.blockedReason === 'string' && autoSwap.blockedReason.trim()) {
            return autoSwap.blockedReason.trim();
          }
          return '';
        }

        function summarizedExecutionReason(reason) {
          const message = String(reason || '').trim();
          if (!message) return '';
          const lower = message.toLowerCase();
          if (lower.indexOf('target is not liquidatable') >= 0) {
            return state.language === 'zh' ? '目标当前不可清算' : 'Target is not liquidatable';
          }
          if (lower.indexOf('no auto swap quote passed profitability gate') >= 0) {
            return state.language === 'zh' ? '换币路由利润门槛未通过' : 'Swap route failed profit gate';
          }
          if (lower.indexOf('all auto swap quotes failed') >= 0 || lower.indexOf('timed out') >= 0) {
            return state.language === 'zh' ? '换币报价超时或失败' : 'Swap quotes timed out or failed';
          }
          if (lower.indexOf('flash-loan repayment requires a swap route') >= 0 ||
              lower.indexOf('swaprequired()') >= 0 ||
              lower.indexOf('no executable swap route') >= 0) {
            return state.language === 'zh' ? '缺少可执行换币路由' : 'Missing executable swap route';
          }
          if (lower.indexOf('estimated net profit') >= 0 && lower.indexOf('below threshold') >= 0) {
            return state.language === 'zh' ? '净利润低于广播阈值' : 'Net profit is below threshold';
          }
          if (lower.indexOf('execution simulation failed') >= 0 || lower.indexOf('simulation failed') >= 0) {
            return state.language === 'zh' ? '执行模拟未通过' : 'Execution simulation failed';
          }
          return message;
        }

        function latestExecutionGateText() {
          const selection = state.autoExecuteSelection;
          const roughNet = selection ? toNumber(selection.roughNetProfitDisplay) : null;
          const reason = summarizedExecutionReason(latestExecutionReason());
          const currentExecution = currentSelectionExecutionResult();
          if (!selection || !selection.user) {
            return state.language === 'zh' ? '暂无首选机会' : 'No priority opportunity yet';
          }
          if (!selection.liquidatable) {
            return state.language === 'zh' ? '未到清算线' : 'Not liquidatable yet';
          }
          if (roughNet !== null && roughNet <= 0) {
            return state.language === 'zh'
              ? '粗净利为负，不广播'
              : 'Rough net is negative, do not broadcast';
          }
          if (reason) {
            return reason;
          }
          if (state.lastResult && state.lastResult.ok === true && currentExecution) {
            return state.language === 'zh' ? '门槛已通过' : 'Execution gate passed';
          }
          return state.language === 'zh' ? '等待模拟与路由确认' : 'Waiting for simulation and route';
        }

        function selectionMatchesTarget(target) {
          const selection = state.autoExecuteSelection;
          if (!selection || !target) return false;
          return String(selection.user || '').toLowerCase() === String(target.user || '').toLowerCase() &&
            String(selection.marketKey || '').toLowerCase() === String(target.marketKey || '').toLowerCase();
        }

        function executionStatusForTarget(target) {
          if (!target) return '--';
          if (target.source === 'morpho-blue') {
            return state.language === 'zh' ? '只读分析' : 'Read-only';
          }
          if (!hasActionablePair(target)) {
            return state.language === 'zh' ? '待分析' : 'Pending analysis';
          }
          if (!target.liquidatable) {
            return state.language === 'zh' ? '未到清算线' : 'Not liquidatable';
          }

          const roughNet = toNumber(target.roughNetProfitDisplay);
          if (roughNet !== null && roughNet <= 0) {
            return state.language === 'zh' ? '净利为负' : 'Negative net';
          }

          if (selectionMatchesTarget(target)) {
            const gateText = latestExecutionGateText(target);
            if (gateText) {
              return gateText;
            }
          }
          if (roughNet !== null && roughNet > 0) {
            return state.language === 'zh' ? '待模拟' : 'Awaiting simulation';
          }
          return state.language === 'zh' ? '待验证' : 'Awaiting validation';
        }

        function machineDecisionText() {
          const selection = state.autoExecuteSelection;
          if (!selection || !selection.user) {
            return state.language === 'zh' ? '等待首选目标' : 'Awaiting priority target';
          }
          return shortAddress(String(selection.user || '--')) +
            ' / ' +
            String(selection.debtSymbol || '--') +
            ' <- ' +
            String(selection.collateralSymbol || '--');
        }

        function machineActionText() {
          const selection = state.autoExecuteSelection;
          const roughNet = selection ? toNumber(selection.roughNetProfitDisplay) : null;
          const hasLiquidatable = state.consoleLiveTargets.some(function (row) { return !!row.liquidatable; });
          const reason = latestExecutionReason();
          if (state.runStateMode === 'paused') {
            return state.language === 'zh' ? '等待恢复监控' : 'Waiting to resume';
          }
          if (!selection || !selection.user) {
            return state.language === 'zh' ? '等待服务端机会' : 'Waiting for server opportunities';
          }
          if (!selection.liquidatable) {
            return state.language === 'zh' ? '等待仓位跌破清算线' : 'Waiting for liquidation threshold';
          }
          if (roughNet !== null && roughNet <= 0) {
            return state.language === 'zh' ? '等待正净利润候选' : 'Waiting for positive net profit';
          }
          if (reason) {
            return state.language === 'zh' ? '等待模拟可过路由' : 'Waiting for executable route';
          }
          if (hasLiquidatable) {
            return state.language === 'zh' ? '已武装，等待广播门槛' : 'Armed, waiting for broadcast gate';
          }
          return state.language === 'zh' ? '等待服务端机会' : 'Waiting for server opportunities';
        }

        function selectedWalletSummary() {
          const wallets = state.data.wallet && Array.isArray(state.data.wallet.wallets)
            ? state.data.wallet.wallets
            : [];
          const wallet = wallets.find(function (item) {
            return item && String(item.chain || '').toLowerCase() === String(state.form.chain || '').toLowerCase();
          });
          if (!wallet || wallet.ready !== true) {
            return state.language === 'zh' ? '钱包未就绪' : 'Wallet not ready';
          }
          const gasDisplay = wallet.nativeBalanceDisplay
            ? formatFixedAmount(wallet.nativeBalanceDisplay, 4)
            : '--';
          return 'Gas ' +
            gasDisplay +
            ' ' +
            String(wallet.nativeSymbol || '') +
            ' | USDC ' +
            String(wallet.usdcBalanceDisplay || '--') +
            ' | USDT ' +
            String(wallet.usdtBalanceDisplay || '--');
        }

        function queueStatusSummary() {
          if (!state.running && state.runStateMode !== 'paused') {
            return state.language === 'zh' ? '未排队' : 'Not queued';
          }
          if (state.consoleQueueAnnounced) {
            return state.language === 'zh' ? '排队成功' : 'Queued';
          }
          const queue = state.data.liquidationQueue && state.data.liquidationQueue.queue
            ? state.data.liquidationQueue.queue
            : null;
          if (queue && queue.enabled !== false) {
            return state.language === 'zh' ? '排队成功' : 'Queued';
          }
          return state.language === 'zh' ? '连接中' : 'Connecting';
        }

        function strategyStatusSummary() {
          if (state.runStateMode === 'paused') {
            return state.language === 'zh' ? '已暂停' : 'Paused';
          }
          if (state.running) {
            return state.language === 'zh' ? '策略正常' : 'Strategy OK';
          }
          return state.language === 'zh' ? '待启动' : 'Idle';
        }

        function waitingStatusSummary() {
          if (state.runStateMode === 'paused') {
            return state.language === 'zh' ? '暂停中' : 'Paused';
          }
          if (state.running) {
            return state.language === 'zh' ? '正在排队清算' : 'Waiting in queue';
          }
          return state.language === 'zh' ? '等待启动' : 'Waiting to start';
        }

        function bestNetSummary() {
          const selection = state.autoExecuteSelection;
          if (selection && selection.roughNetProfitDisplay) {
            return String(selection.roughNetProfitDisplay);
          }
          const candidates = state.consoleLiveTargets.filter(function (row) {
            return row && row.roughNetProfitDisplay;
          }).map(function (row) {
            return {
              value: toNumber(row.roughNetProfitDisplay),
              label: String(row.roughNetProfitDisplay || '--')
            };
          }).filter(function (row) {
            return row.value !== null;
          }).sort(function (left, right) {
            return Number(right.value) - Number(left.value);
          });
          return candidates[0] ? candidates[0].label : '--';
        }

        function machineLines() {
          return [
            (state.language === 'zh' ? '执行市场: ' : 'Market: ') + selectedExecutionMarketLabel(),
            (state.language === 'zh' ? '排队: ' : 'Queue: ') + queueStatusSummary(),
            (state.language === 'zh' ? '策略: ' : 'Strategy: ') + strategyStatusSummary(),
            (state.language === 'zh' ? '钱包: ' : 'Wallet: ') + selectedWalletSummary(),
            (state.language === 'zh' ? '状态: ' : 'Status: ') + waitingStatusSummary(),
            (state.language === 'zh' ? '最佳粗净利: ' : 'Best rough net: ') + bestNetSummary()
          ];
        }

        function typeMachineLine(value) {
          const node = document.getElementById('consoleMachineLine');
          if (!node) return;
          if (machineTypeTimer) {
            clearTimeout(machineTypeTimer);
            machineTypeTimer = null;
          }
          const textValue = String(value || '--');
          let cursor = 0;
          node.textContent = '';
          const step = function () {
            cursor += 1;
            node.textContent = textValue.slice(0, cursor);
            if (cursor < textValue.length) {
              machineTypeTimer = setTimeout(step, 28);
            } else {
              machineTypeTimer = null;
            }
          };
          step();
        }

        function syncMachineDisplay() {
          const lines = machineLines();
          const nextKey = lines.join('|');
          if (nextKey !== machineRotationKey) {
            machineRotationKey = nextKey;
            machineRotationIndex = 0;
          }
          const line = lines[machineRotationIndex % lines.length] || '--';
          typeMachineLine(line);
          machineRotationIndex = (machineRotationIndex + 1) % lines.length;
          if (machineTickTimer) {
            clearTimeout(machineTickTimer);
          }
          machineTickTimer = setTimeout(syncMachineDisplay, 2600);
          setMachineActive(true);
        }

        function availableBalanceItems(selectedWallet) {
          if (selectedWallet && Array.isArray(selectedWallet.watchedBalances) && selectedWallet.watchedBalances.length) {
            return selectedWallet.watchedBalances.map(function (item) {
              const symbol = String(item && item.symbol ? item.symbol : '--');
              const kind = String(item && item.kind ? item.kind : '');
              const balanceDisplay = item && item.balanceDisplay ? String(item.balanceDisplay) : '--';
              const label =
                kind === 'gas'
                  ? (state.language === 'zh' ? symbol + ' Gas' : symbol + ' Gas')
                  : (state.language === 'zh' ? symbol + ' 余额' : symbol + ' Balance');
              return {
                key: String(item && item.key ? item.key : symbol.toLowerCase()),
                label: label,
                value: balanceDisplay + ' ' + symbol,
              };
            });
          }

          const fallback = [];
          if (selectedWallet && selectedWallet.nativeBalanceDisplay) {
            const nativeSymbol = String(selectedWallet.nativeSymbol || 'ETH');
            fallback.push({
              key: nativeSymbol.toLowerCase() + '-gas',
              label: state.language === 'zh' ? nativeSymbol + ' Gas' : nativeSymbol + ' Gas',
              value: String(selectedWallet.nativeBalanceDisplay) + ' ' + nativeSymbol,
            });
          }
          if (selectedWallet && selectedWallet.usdcBalanceDisplay) {
            fallback.push({
              key: 'usdc',
              label: state.language === 'zh' ? 'USDC 余额' : 'USDC Balance',
              value: String(selectedWallet.usdcBalanceDisplay) + ' USDC',
            });
          }
          return fallback;
        }

        function syncBalanceTicker(selectedWallet) {
          const items = availableBalanceItems(selectedWallet);
          if (!items.length) {
            stopBalanceTimer();
            balanceRotationKey = '';
            balanceRotationIndex = 0;
            text('consoleUsdcLabel', state.language === 'zh' ? '资产余额' : 'Asset Balance');
            text('consoleUsdcValue', '--');
            return;
          }

          const nextKey = items.map(function (item) { return item.key; }).join('|');
          if (nextKey !== balanceRotationKey) {
            balanceRotationKey = nextKey;
            balanceRotationIndex = 0;
          } else if (balanceRotationIndex >= items.length) {
            balanceRotationIndex = 0;
          }

          const item = items[balanceRotationIndex] || items[0];
          text('consoleUsdcLabel', item.label);
          text('consoleUsdcValue', item.value);

          stopBalanceTimer();
          if (items.length > 1) {
            balanceTickTimer = setTimeout(function () {
              balanceRotationIndex = (balanceRotationIndex + 1) % items.length;
              syncBalanceTicker(selectedWallet);
            }, 2400);
          }
        }

        function syncTerminalOutput() {
          const node = document.getElementById('terminalOutputText');
          if (!node) return;
          node.textContent = String(state.terminal || '').replace(/\n+$/g, '');
        }

        function walletChainRows() {
          const wallets = state.data.wallet && Array.isArray(state.data.wallet.wallets)
            ? state.data.wallet.wallets
            : [];
          const rpcUsage = state.data.rpcUsage && state.data.rpcUsage.metrics
            ? state.data.rpcUsage.metrics
            : {};
	          return [
	            { key: 'ethereum', label: 'ETH', icon: '/chain/eth.svg' },
	            { key: 'bnb', label: 'BNB', icon: '/chain/bnb.svg' },
	            { key: 'arbitrum', label: 'ARB', icon: '/chain/arb.svg' }
	          ].map(function (chain) {
	            const wallet = wallets.find(function (item) { return item && item.chain === chain.key; }) || {};
	            const rpcMetric = rpcUsage[chain.key] || null;
	            return {
	              key: chain.key,
	              label: chain.label,
	              icon: chain.icon,
	              ready: wallet.ready === true,
	              reason: wallet.reason ? String(wallet.reason) : '',
	              gas: wallet.nativeBalanceDisplay && wallet.nativeSymbol
	                ? formatFixedAmount(wallet.nativeBalanceDisplay, 4) + ' ' + String(wallet.nativeSymbol)
	                : '--',
	              usdc: wallet.usdcBalanceDisplay ? String(wallet.usdcBalanceDisplay) + ' USDC' : '--',
	              usdt: wallet.usdtBalanceDisplay ? String(wallet.usdtBalanceDisplay) + ' USDT' : '--',
	              rpcCalls: formatRpcUsageMetric(rpcMetric),
	              rpcConfigured: rpcMetric ? rpcMetric.rpcConfigured !== false : false
	            };
	          });
	        }

	        function formatFixedAmount(value, fractionDigits) {
	          const numeric = Number(value);
	          if (!Number.isFinite(numeric)) return '--';
	          return new Intl.NumberFormat('en-US', {
	            minimumFractionDigits: fractionDigits,
	            maximumFractionDigits: fractionDigits
	          }).format(numeric);
	        }

	        function formatRpcUsageMetric(metric) {
	          if (!metric) return '--';
	          if (typeof metric.requestCount === 'number') {
	            return formatInteger(metric.requestCount);
	          }
	          if (
	            typeof metric.remainingRequests === 'number' &&
	            typeof metric.requestLimit === 'number' &&
	            metric.requestLimit > 0
	          ) {
	            return formatInteger(Math.max(0, metric.requestLimit - metric.remainingRequests));
	          }
	          const status = String(metric.status || '');
	          const zh = {
	            missing_credentials: '缺少 Token',
	            missing_rpc: '未配置 RPC',
	            unmatched: '未匹配端点',
	            error: '读取失败',
	            ok: '无用量'
	          };
	          const en = {
	            missing_credentials: 'Missing token',
	            missing_rpc: 'No RPC',
	            unmatched: 'Unmatched endpoint',
	            error: 'Error',
	            ok: 'No usage'
	          };
	          if (status === 'error' && /invalid token|missing token|401/i.test(String(metric.message || ''))) {
	            return state.language === 'zh' ? 'Token 失效' : 'Invalid token';
	          }
	          return state.language === 'zh' ? (zh[status] || '--') : (en[status] || '--');
	        }

	        function renderWalletAssetsTable() {
	          text('consoleWalletAssetsTitle', state.language === 'zh' ? '钱包资产' : 'Wallet Assets');
	          text(
	            'consoleWalletRefresh',
	            state.language === 'zh'
	              ? (state.loading.walletAssets ? '刷新中...' : '刷新')
	              : (state.loading.walletAssets ? 'Refreshing...' : 'Refresh')
	          );
	          const refreshButton = document.getElementById('consoleWalletRefresh');
	          if (refreshButton) refreshButton.disabled = !!state.loading.walletAssets;
	          text('consoleWalletChainHeader', state.language === 'zh' ? '链' : 'Chain');
	          text('consoleWalletGasHeader', state.language === 'zh' ? 'Gas 余额' : 'Gas');
	          text('consoleWalletRpcHeader', state.language === 'zh' ? 'RPC 用量' : 'RPC Usage');

	          if (state.loading.walletAssets) {
	            html('consoleWalletBalanceRows', renderWalletAssetSkeletonRows());
	            return;
	          }

          const rows = walletChainRows();
          html(
            'consoleWalletBalanceRows',
            rows.map(function (row) {
              const mutedClass = row.ready ? '' : ' class="is-muted"';
	              const rpcMutedClass = row.rpcConfigured ? '' : ' class="is-muted"';
	              const title = !row.ready && row.reason ? ' title="' + escapeHtml(row.reason) + '"' : '';
	              return '<tr' + title + '>' +
	                '<td class="console-wallet-chain"><img class="console-wallet-chain-icon" src="' + escapeHtml(row.icon) + '" alt="' + escapeHtml(row.label) + '" title="' + escapeHtml(row.label) + '" /></td>' +
	                '<td' + mutedClass + '>' + escapeHtml(row.gas) + '</td>' +
                '<td' + mutedClass + '>' + escapeHtml(row.usdc) + '</td>' +
                '<td' + mutedClass + '>' + escapeHtml(row.usdt) + '</td>' +
                '<td' + rpcMutedClass + '>' + escapeHtml(row.rpcCalls) + '</td>' +
                '</tr>';
            }).join('')
          );
        }

        function renderWalletAssetSkeletonRows() {
          return [0, 1, 2].map(function () {
            return '<tr class="console-wallet-skeleton-row">' +
              '<td><div class="skeleton-block console-wallet-skeleton-icon"></div></td>' +
              '<td><div class="skeleton-table-cell console-wallet-skeleton-cell"></div></td>' +
              '<td><div class="skeleton-table-cell console-wallet-skeleton-cell"></div></td>' +
              '<td><div class="skeleton-table-cell console-wallet-skeleton-cell"></div></td>' +
              '<td><div class="skeleton-table-cell console-wallet-skeleton-cell"></div></td>' +
              '</tr>';
          }).join('');
        }

        function walletStartupLines(payload) {
          const wallets = payload && Array.isArray(payload.wallets) ? payload.wallets : [];
          if (!wallets.length) return '$ 钱包资产读取: --\n';
          const selected = wallets.find(function (wallet) {
            return wallet && String(wallet.chain || '').toLowerCase() === String(state.form.chain || '').toLowerCase();
          }) || wallets[0];
          const chainName = selected && selected.chainName ? String(selected.chainName) : selectedChainLabel();
          if (!selected || selected.ready !== true) {
            return '$ ' + chainName + ' 钱包读取失败: ' + String(selected && selected.reason ? selected.reason : '--') + '\n';
          }
          return '$ ' +
            chainName +
            ' 钱包 ' +
            shortAddress(String(selected.address || '--')) +
            ' | Gas ' +
            (selected.nativeBalanceDisplay ? formatFixedAmount(selected.nativeBalanceDisplay, 4) : '--') +
            ' ' +
            String(selected.nativeSymbol || '') +
            ' | USDC ' +
            String(selected.usdcBalanceDisplay || '--') +
            ' | USDT ' +
            String(selected.usdtBalanceDisplay || '--') +
            '\n';
        }

        function appendTerminal(chunk) {
          const text = String(chunk || '');
          if (!text) return;
          state.terminal += text.endsWith('\n') ? text : text + '\n';
          syncTerminalOutput();
          const container = document.getElementById('terminalOutput');
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        }

        function appendTerminalNormalized(chunk) {
          const normalized = String(chunk)
            .split('\n')
            .filter(function (line) {
              const value = String(line || '').trim();
              if (!value) return false;
              if (/^\$\s*正在连接\s+.+节点服务器/i.test(value)) return false;
              if (/^\$\s*执行市场:/i.test(value)) return false;
              if (/^\$\s*已连接节点服务器/i.test(value)) return false;
              if (/^\$\s*预检通过:/i.test(value)) return false;
              if (/^\$\s*真实执行模式:/i.test(value)) return false;
              if (/^\$\s*执行合约:/i.test(value)) return false;
              if (/^\$\s*正在扫描清算机会/i.test(value)) return false;
              if (/^\$\s*清算监控已启动/i.test(value)) return false;
              if (/^\$\s*切换市场/i.test(value)) return false;
              if (/^\$\s*加载储备元数据/i.test(value)) return false;
              if (/^\$\s*储备元数据/i.test(value)) return false;
              if (/^\$?\s*round\s+\d+/i.test(value)) return false;
              if (/^\$?\s*cycle\s+\d+/i.test(value)) return false;
              if (/^Scanning pool events:/i.test(value)) return false;
              if (/^Found\s+\d+\s+new candidate users/i.test(value)) return false;
              if (/^Reading user account data:/i.test(value)) return false;
              if (/^Cycle\s+\d+\s+completed/i.test(value)) return false;
              return true;
            })
            .join('\n');
          if (!normalized) return;
          appendTerminal(normalized);
        }

        function mergeConsoleTargets(rows) {
          if (!Array.isArray(rows)) {
            return;
          }
          const map = new Map(
            state.consoleLiveTargets.map(function (row) {
              return [consoleTargetKey(row), row];
            })
          );
          rows.forEach(function (row) {
            if (!row || !row.user) return;
            const nextRow = {
              rank: typeof row.rank === 'number' ? row.rank : undefined,
              marketKey: row.marketKey || undefined,
              marketLabel: row.marketLabel || '--',
              user: row.user,
              healthFactor: row.healthFactor || '--',
              liquidatable: !!row.liquidatable,
              state: row.state || '--',
              debtSymbol: row.debtSymbol || '--',
              collateralSymbol: row.collateralSymbol || '--',
              grossProfitDisplay: row.grossProfitDisplay || '--',
              roughNetProfitDisplay: row.roughNetProfitDisplay || '--',
              repayAmountDisplay: row.repayAmountDisplay || undefined,
              seizeAmountDisplay: row.seizeAmountDisplay || undefined,
              exitPathDisplay: row.exitPathDisplay || undefined,
              simulationReason: row.simulationReason || undefined,
              selectionScoreDisplay: row.selectionScoreDisplay || '--',
              selectionMethod: row.selectionMethod || '--',
              source: row.source || 'scan'
            };
            map.set(consoleTargetKey(nextRow), nextRow);
          });
          state.consoleLiveTargets = Array.from(map.values()).sort(compareTargetsByExecutionPriority);
        }

        function consoleSnapshotMetaText(displayedTargets, sourceVisibleTargets) {
          const count = Array.isArray(displayedTargets) ? displayedTargets.length : 0;
          const sourceCount = Array.isArray(sourceVisibleTargets) ? sourceVisibleTargets.length : count;
          const bscScan = state.data && state.data.bscTailScan ? state.data.bscTailScan : null;
          if (bscScan && bscScan.toBlock) {
            return state.language === 'zh'
              ? '当前市场 · ' + String(count || sourceCount) + ' 条'
              : 'Current market · ' + String(count || sourceCount) + ' rows';
          }
          const feed = state.data && state.data.publicLiquidationFeed ? state.data.publicLiquidationFeed : null;
          if (feed && feed.ok === false) {
            return state.language === 'zh' ? '暂未更新' : 'Not updated';
          }
          return state.language === 'zh'
            ? selectedChainLabel() + ' · ' + String(count || sourceCount) + ' 条'
            : selectedChainLabel() + ' · ' + String(count || sourceCount) + ' rows';
        }

${DASHBOARD_CONSOLE_RESULTS_LOGIC}

        function renderConsole() {
          const wallets = state.data.wallet && state.data.wallet.wallets ? state.data.wallet.wallets : [];
          const targets = deriveTargets();
          const scanStarted = state.hasConsoleRun || state.running || state.consoleLiveTargets.length > 0 || !!state.data.bscTailScan;
          const sourceVisibleTargets = scanStarted
            ? targets.filter(matchesConsoleSourceFilter)
            : [];
          const visibleTargets = scanStarted
            ? sourceVisibleTargets.filter(matchesConsoleRiskFilter)
            : [];
          const currentSelection = state.autoExecuteSelection;
          const fallbackSelectionTarget =
            currentSelection && currentSelection.user
              ? {
                  rank: currentSelection.rank,
                  marketKey: currentSelection.marketKey || undefined,
                  marketLabel: currentSelection.marketLabel || '--',
                  user: currentSelection.user,
                  healthFactor: currentSelection.healthFactor || '--',
                  liquidatable: !!currentSelection.liquidatable,
                  state: currentSelection.liquidatable
                    ? (state.language === 'zh' ? '可清算' : 'Liquidatable')
                    : (state.language === 'zh' ? '等待机会' : 'Waiting'),
                  debtSymbol: currentSelection.debtSymbol || '--',
                  collateralSymbol: currentSelection.collateralSymbol || '--',
                  grossProfitDisplay: currentSelection.grossProfitDisplay || '--',
                  roughNetProfitDisplay: currentSelection.roughNetProfitDisplay || '--',
                  selectionScoreDisplay: currentSelection.selectionScoreDisplay || '--',
                  selectionMethod: currentSelection.selectionMethod || '--',
                  source: 'scan'
                }
              : null;
          const fallbackVisibleTargets =
            !visibleTargets.length &&
            fallbackSelectionTarget &&
            matchesConsoleSourceFilter(fallbackSelectionTarget) &&
            (state.consoleFilter === 'all' || !state.form.liquidationOnly || fallbackSelectionTarget.liquidatable) &&
            matchesConsoleRiskFilter(fallbackSelectionTarget)
              ? [fallbackSelectionTarget]
              : [];
          const displayedTargets = visibleTargets.length ? visibleTargets : fallbackVisibleTargets;
          const morphoOnlyVisible = sourceVisibleTargets.length > 0 && sourceVisibleTargets.every(function (target) {
            return isMorphoBlueTarget(target);
          });
          renderWalletAssetsTable();
          text('consoleSnapshotTitle', state.language === 'zh' ? '策略机会' : 'Strategy Opportunities');
          text(
            'consoleSnapshotCopy',
            state.language === 'zh'
              ? '按当前执行市场筛选出的候选机会，重点关注高风险、可清算和可执行目标。'
              : 'Candidates for the selected execution market, focused on risky, liquidatable, and actionable targets.'
          );
          text('consoleSnapshotMeta', consoleSnapshotMetaText(displayedTargets, sourceVisibleTargets));
          const startButton = document.getElementById('actionSelfFunded');
          const startIcon = document.getElementById('actionSelfFundedIcon');
          const startLabel = document.getElementById('actionSelfFundedLabel');
          const morphoButton = document.getElementById('actionMorphoReadOnly');
          const morphoLabel = document.getElementById('actionMorphoReadOnlyLabel');
          const pauseButton = document.getElementById('actionPause');
          const pauseIcon = document.getElementById('actionPauseIcon');
          const pauseLabel = document.getElementById('actionPauseLabel');
          const isRunning = state.runStateMode === 'running';
          const isPaused = state.runStateMode === 'paused';
          if (startButton) startButton.disabled = !!state.running;
          if (morphoButton) morphoButton.disabled = !!state.running || !!state.morphoReadOnlyRunning;
          if (pauseButton) pauseButton.disabled = !state.running;
          if (startButton) startButton.classList.toggle('is-running', isRunning);
          if (pauseButton) pauseButton.classList.toggle('is-paused', isPaused);
          if (startIcon) startIcon.setAttribute('src', isRunning ? '/img/run.svg' : '/img/readyStart.svg');
          if (pauseIcon) pauseIcon.setAttribute('src', '/img/stop.svg');
          if (startLabel) startLabel.textContent = isPaused
            ? (state.language === 'zh' ? '继续' : 'Resume')
            : (state.language === 'zh' ? '启动' : 'Start');
          if (pauseLabel) pauseLabel.textContent = isPaused ? '已暂停' : '暂停';
          if (morphoLabel) morphoLabel.textContent = state.morphoReadOnlyRunning
            ? (state.language === 'zh' ? 'Morpho 分析中' : 'Morpho running')
            : t('actions.morphoReadOnly');
          text('consoleFilterAll', t('consoleFilterAll'));
          text('consoleFilterLiquidatable', t('consoleFilterLiquidatable'));
          text('consoleFilterRisky', t('consoleFilterRisky'));
          text('consoleFilterSafe', t('consoleFilterSafe'));
          text('consoleFilterSignalLabel', state.language === 'zh' ? '信号' : 'Signal');
          text('consoleFilterSourceLabel', t('consoleSourceLabel'));
          text('consoleSourceAll', t('consoleSourceAll'));
          text('consoleSourceScan', t('consoleSourceScan'));
          text('consoleSourceMorpho', t('consoleSourceMorpho'));
          text('consoleSourceBscTail', t('consoleSourceBscTail'));
          text('consoleMorphoSortLabel', t('morphoSortLabel'));
          text('consoleMorphoSortLiq', t('morphoSortLiq'));
          text('consoleMorphoSortNear', t('morphoSortNear'));
          text('consoleMorphoSortBorrow', t('morphoSortBorrow'));
          text('consoleMorphoSortWorstHf', t('morphoSortWorstHf'));
          [
            ['consoleFilterAll', 'all'],
            ['consoleFilterLiquidatable', 'liquidatable'],
            ['consoleFilterRisky', 'risky'],
            ['consoleFilterSafe', 'safe']
          ].forEach(function (entry) {
            const node = document.getElementById(entry[0]);
            if (!node) return;
            const active = state.consoleFilter === entry[1];
            node.classList.toggle('is-active', active);
            node.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
          [
            ['consoleSourceAll', 'all'],
            ['consoleSourceScan', 'scan'],
            ['consoleSourceMorpho', 'morpho-blue'],
            ['consoleSourceBscTail', 'bsc-tail']
          ].forEach(function (entry) {
            const node = document.getElementById(entry[0]);
            if (!node) return;
            const active = state.consoleSourceFilter === entry[1];
            node.classList.toggle('is-active', active);
            node.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
          const morphoSortGroup = document.getElementById('consoleMorphoSortGroup');
          if (morphoSortGroup) {
            morphoSortGroup.classList.toggle('is-hidden', !morphoOnlyVisible);
          }
          [
            ['consoleMorphoSortLiq', 'liquidatable'],
            ['consoleMorphoSortNear', 'near'],
            ['consoleMorphoSortBorrow', 'borrow'],
            ['consoleMorphoSortWorstHf', 'worst-hf']
          ].forEach(function (entry) {
            const node = document.getElementById(entry[0]);
            if (!node) return;
            const active = state.morphoMarketSort === entry[1];
            node.classList.toggle('is-active', active);
            node.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
          html('consoleResultsRows', renderConsoleResultsMarkup(displayedTargets, scanStarted, morphoOnlyVisible));
          Array.from(document.querySelectorAll('.console-market-filter-button')).forEach(function (button) {
            button.addEventListener('click', function () {
              applyMorphoMarketFilter(button.getAttribute('data-market-key'));
            });
          });
          Array.from(document.querySelectorAll('.console-market-run-button')).forEach(function (button) {
            button.addEventListener('click', function () {
              void startMorphoReadOnlyAnalyze({
                marketIdOverride: button.getAttribute('data-market-key')
              });
            });
          });
          Array.from(document.querySelectorAll('.console-market-near-button')).forEach(function (button) {
            button.addEventListener('click', function () {
              void startMorphoReadOnlyAnalyze({
                marketIdOverride: button.getAttribute('data-market-key'),
                kindOverride: 'near-liquidation',
                hfMaxOverride: '1.01'
              });
            });
          });
          Array.from(document.querySelectorAll('.console-market-liq-button')).forEach(function (button) {
            button.addEventListener('click', function () {
              void startMorphoReadOnlyAnalyze({
                marketIdOverride: button.getAttribute('data-market-key'),
                kindOverride: 'liquidatable'
              });
            });
          });
          syncTerminalOutput();
          syncMachineDisplay();

          html('walletList', wallets.map(function (wallet) {
            return '<div class="status-row">' +
              '<div>' +
                '<div class="intel-label">' + escapeHtml(wallet.chainName || wallet.chain || '--') + '</div>' +
                '<div style="margin-top:6px;">' + escapeHtml(wallet.address ? shortAddress(wallet.address) : t('walletUnavailable')) + '</div>' +
              '</div>' +
              '<div style="text-align:right;">' +
                '<div class="' + (wallet.ready ? 'status-good' : 'status-bad') + '">' + escapeHtml(wallet.ready ? 'ready' : 'missing') + '</div>' +
                '<div style="margin-top:6px; color:#9ca5b3;">' + escapeHtml(
                  Array.isArray(wallet.watchedBalances) && wallet.watchedBalances.length
                    ? wallet.watchedBalances.map(function (item) {
                        const symbol = String(item && item.symbol ? item.symbol : '--');
                        const display = item && item.balanceDisplay ? String(item.balanceDisplay) : '--';
                        const kind = String(item && item.kind ? item.kind : '');
                        return display + ' ' + symbol + (kind === 'gas' ? ' gas' : '');
                      }).join(' / ')
                    : (wallet.usdcBalanceDisplay ? wallet.usdcBalanceDisplay + ' USDC' : '--')
                ) + '</div>' +
              '</div>' +
            '</div>';
          }).join('') || '<div class="status-row"><div>--</div><div>--</div></div>');
        }

        function syncConsoleLayoutHeight() {
          const page = document.getElementById('pageConsole');
          const layout = page ? page.querySelector('.console-layout') : null;
          const content = document.querySelector('.content-scroll');
          const footer = document.querySelector('.app-footer');
          if (!layout) return;
          if (!page || !page.classList.contains('active') || !footer || !content || window.innerWidth <= 1440) {
            layout.style.removeProperty('height');
            return;
          }
          const targetGap = 16;
          const availableHeight = Math.floor(content.clientHeight - layout.offsetTop - footer.offsetHeight - targetGap);
          if (availableHeight > 0) {
            layout.style.height = availableHeight + 'px';
          } else {
            layout.style.removeProperty('height');
          }
        }

        async function startAutoExecute(options) {
          if (state.running) {
            return;
          }
          const preserveSession = Boolean(options && options.preserveSession);
          syncFormFromInputs();
          state.consoleSourceFilter = 'all';
          if (!preserveSession) {
            const queueStatus = await loadLiquidationQueueStatus();
            if (queueStatus && queueStatus.eligible === false) {
              state.terminal = '$ 队列检查未通过: ' + String(queueStatus.reason || '--') + '\n';
              state.runStateMode = 'idle';
              state.running = false;
              renderConsole();
              return;
            }
            if (
              queueStatus &&
              queueStatus.queue &&
              queueStatus.queue.enabled !== false &&
              queueStatus.queue.action &&
              queueStatus.queue.action !== 'execute'
            ) {
              const position = queueStatus.queue.position || queueStatus.queue.queuePosition || queueStatus.queue.currentPosition || '';
              const size = queueStatus.queue.size || queueStatus.queue.queueSize || queueStatus.queue.total || '';
              state.terminal = '$ 等待执行队列';
              if (position && size) {
                state.terminal += ': ' + String(position) + ' / ' + String(size);
              }
              state.terminal += '\n';
              state.runStateMode = 'idle';
              state.running = false;
              renderConsole();
              return;
            }
          }
          if (!preserveSession) {
            state.autoExecuteRunSerial = 0;
          }
          const resumeCursor = state.runStateMode === 'paused' && state.autoExecuteResumeCursor
            ? state.autoExecuteResumeCursor
            : null;
          const forcedResumeCursor = !resumeCursor && preserveSession && state.autoExecuteResumeCursor
            ? state.autoExecuteResumeCursor
            : null;
          const activeResumeCursor = resumeCursor || forcedResumeCursor;
          const isResuming = !!(activeResumeCursor && activeResumeCursor.resumeFromBlock);
          state.autoExecuteRunSerial = Number(state.autoExecuteRunSerial || 0) + 1;
          state.running = true;
          state.hasConsoleRun = true;
          state.consoleStreamMode = true;
          state.runStateMode = 'running';
          if (isResuming) {
            appendTerminal('\n$ 继续连接节点服务器...\n');
          } else if (preserveSession) {
            appendTerminal('\n$ 继续上一轮监控...\n');
          } else {
            state.consoleLiveTargets = [];
            state.autoExecuteSelection = null;
            state.selectedTarget = null;
            state.lastResult = null;
            state.autoExecuteResumeCursor = null;
            state.consoleConnectionAnnounced = false;
            state.consoleQueueAnnounced = false;
            state.terminal =
              '$ 正在连接节点服务器...\n' +
              '$ 正在连接 ' + selectedChainLabel() + ' 节点服务器...\n';
            state.consoleLiveTargets = [];
            appendTerminal('');
          }
          renderConsole();

          const query = new URLSearchParams();
          query.set('chain', state.form.chain);
          query.set('market', state.form.market || 'aave-v3-bnb');
          if (state.form.lookbackBlocks) query.set('lookbackBlocks', String(state.form.lookbackBlocks));
          if (state.form.limit) query.set('limit', String(state.form.limit));
          if (state.form.minNetProfit) query.set('minNetProfit', String(state.form.minNetProfit));
          if (state.form.rpcUrl) query.set('rpcUrl', String(state.form.rpcUrl));
          if (state.form.hfMax) query.set('hfMax', String(state.form.hfMax));
          if (state.form.allowRisky) query.set('allowRisky', 'true');
          if (state.form.autoSwap) query.set('autoSwap', 'true');
          if (state.form.broadcast) query.set('broadcast', 'true');
          if (isResuming && activeResumeCursor) {
            query.set('resumeFromBlock', String(activeResumeCursor.resumeFromBlock));
            if (activeResumeCursor.resumeChunkStart) query.set('resumeChunkStart', String(activeResumeCursor.resumeChunkStart));
            if (activeResumeCursor.resumeChunkEnd) query.set('resumeChunkEnd', String(activeResumeCursor.resumeChunkEnd));
            if (activeResumeCursor.resumeUserOffset) query.set('resumeUserOffset', String(activeResumeCursor.resumeUserOffset));
          }

          const controller = new AbortController();
          state.autoExecuteAbortController = controller;
          let shouldReconnect = false;
          let streamEndedUnexpectedly = false;

          try {
            const response = await fetch('/api/auto-execute-stream?' + query.toString(), {
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
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              lines.forEach(function (line) {
                if (!line.trim()) return;
                const event = JSON.parse(line);
                if (event.type === 'meta') {
                  if (!state.consoleConnectionAnnounced) {
                    state.consoleConnectionAnnounced = true;
                    appendTerminal(
                      '$ 执行市场: ' +
                      String(event.marketLabel || event.market || selectedExecutionMarketLabel()) +
                      '\n' +
                      '$ 已连接节点服务器\n'
                    );
                  }
                  renderConsole();
                } else if (event.type === 'wallet') {
                  if (event.data) state.data.wallet = event.data;
                  if (event.rpcUsage) state.data.rpcUsage = event.rpcUsage;
                  if (!state.consoleQueueAnnounced) {
                    state.consoleQueueAnnounced = true;
                    appendTerminal(
                      '$ 执行模式: 开启：self-funded\n' +
                      walletStartupLines(event.data) +
                      '$ 进入排队系统成功...\n' +
                      '$ 清算监控已启动，等待清算中...\n'
                    );
                  }
                  renderConsole();
                } else if (event.type === 'stdout' || event.type === 'stderr') {
                  appendTerminalNormalized(event.data);
                } else if (event.type === 'targets') {
                  mergeConsoleTargets(event.data);
                  renderConsole();
                } else if (event.type === 'selection') {
                  state.autoExecuteSelection = event.data || null;
                  if (!event.data) {
                    renderConsole();
                    return;
                  }
                  if (event.data && event.data.liquidatable) {
                    appendTerminal(
                      '$ 发现可清算机会: ' +
                        String(event.data.user || '--') +
                        ' | ' +
                        String(event.data.debtSymbol || '--') +
                        ' <- ' +
                        String(event.data.collateralSymbol || '--') +
                        ' | 粗净利 ' +
                        String(event.data.roughNetProfitDisplay || '--') +
                        '\n'
                    );
                  }
                  renderConsole();
                } else if (event.type === 'execution') {
                  state.lastResult = event.data;
                  const parsed = event.data && event.data.parsed ? event.data.parsed : null;
                  const broadcastResult = parsed && parsed.broadcastResult ? parsed.broadcastResult : (event.data && event.data.broadcastResult ? event.data.broadcastResult : null);
                  const txHash =
                    (event.data && event.data.txHash) ||
                    (parsed && parsed.txHash) ||
                    (broadcastResult && broadcastResult.executeTxHash) ||
                    (broadcastResult && broadcastResult.txHash) ||
                    '';
                  reportLiquidationQueueEvent(
                    event.data && event.data.ok && txHash ? 'success' : (event.data && event.data.ok ? 'checked' : 'blocked'),
                    event.data || null
                  );
                  appendTerminal(
                    '$ armed execution ' +
                      String(event.data && event.data.ok ? 'completed' : 'blocked') +
                      '\n'
                  );
                  renderConsole();
                } else if (event.type === 'progress') {
                  state.autoExecuteResumeCursor = {
                    resumeFromBlock: event.resumeFromBlock ? String(event.resumeFromBlock) : (event.nextFromBlock ? String(event.nextFromBlock) : null),
                    resumeChunkStart: event.resumeChunkStart ? String(event.resumeChunkStart) : null,
                    resumeChunkEnd: event.resumeChunkEnd ? String(event.resumeChunkEnd) : null,
                    resumeUserOffset: event.resumeUserOffset ? String(event.resumeUserOffset) : '0'
                  };
                } else if (event.type === 'result') {
                  state.lastResult = event.data;
                  if (state.runStateMode === 'running') {
                    shouldReconnect = true;
                    streamEndedUnexpectedly = true;
                    const streamError = event.data && event.data.ok === false && event.data.error
                      ? String(event.data.error)
                      : '';
                    appendTerminal(
                      '\n$ ' +
                        (
                          streamError
                            ? 'stream interrupted, reconnecting: ' + streamError
                            : 'stream interrupted, reconnecting...'
                        ) +
                        '\n'
                    );
                  } else {
                    appendTerminal('\n$ completed\n');
                    state.autoExecuteResumeCursor = null;
                  }
                }
              });
            }
            if (state.runStateMode === 'running') {
              shouldReconnect = true;
              streamEndedUnexpectedly = true;
            }
          } catch (error) {
            if (controller.signal.aborted) {
              appendTerminal('\n$ paused\n');
              state.runStateMode = 'paused';
              renderConsole();
              return;
            }
            appendTerminal('\n$ failed: ' + String(error) + '\n');
            if (state.runStateMode === 'running') {
              shouldReconnect = true;
              streamEndedUnexpectedly = true;
            } else {
              state.runStateMode = 'idle';
              state.autoExecuteResumeCursor = null;
            }
          } finally {
            state.running = false;
            state.autoExecuteAbortController = null;
            if (shouldReconnect && state.runStateMode === 'running') {
              renderConsole();
              setTimeout(function () {
                if (state.runStateMode === 'running' || state.runStateMode === 'idle') {
                  state.runStateMode = 'running';
                  void startAutoExecute({ preserveSession: true });
                }
              }, streamEndedUnexpectedly ? 1000 : 3000);
              return;
            }
            if (state.runStateMode === 'running') {
              state.runStateMode = 'idle';
              state.autoExecuteResumeCursor = null;
            }
            renderConsole();
          }
        }

        function pauseAutoExecute() {
          if (!state.autoExecuteAbortController) {
            return;
          }
          state.autoExecuteAbortController.abort();
        }

        async function startMorphoReadOnlyAnalyze(options) {
          if (state.running || state.morphoReadOnlyRunning) {
            return;
          }
          const marketIdOverride = options && options.marketIdOverride
            ? String(options.marketIdOverride).trim()
            : '';
          const kindOverride = options && Object.prototype.hasOwnProperty.call(options, 'kindOverride')
            ? String(options.kindOverride || '')
            : null;
          const hfMaxOverride = options && Object.prototype.hasOwnProperty.call(options, 'hfMaxOverride')
            ? String(options.hfMaxOverride || '')
            : null;
          if (marketIdOverride) {
            applyMorphoMarketFilter(marketIdOverride, {
              skipRender: true,
              kind: kindOverride === null ? undefined : kindOverride,
              hfMax: hfMaxOverride === null ? undefined : hfMaxOverride
            });
          } else {
            if (kindOverride !== null) {
              state.form.morphoKind = kindOverride;
            }
            if (hfMaxOverride !== null) {
              state.form.hfMax = hfMaxOverride;
            }
          }
          syncFormFromInputs();
          state.morphoReadOnlyRunning = true;
          state.hasConsoleRun = true;
          state.consoleStreamMode = false;
          state.autoExecuteSelection = null;
          state.selectedTarget = null;
          state.lastResult = null;
          state.terminal += '\n$ 启动 Morpho read-only analyze...\n';
          state.terminal += '$ chain ' + String(state.morphoChain || 'ethereum') + '\n';
          if (state.form.morphoMarketId) {
            state.terminal += '$ marketId ' + String(state.form.morphoMarketId) + '\n';
          }
          if (state.form.morphoKind) {
            state.terminal += '$ signal ' + String(state.form.morphoKind) + '\n';
          }
          if (state.form.hfMax) {
            state.terminal += '$ hfMax ' + String(state.form.hfMax) + '\n';
          }
          state.terminal += '$ limit ' + String(state.form.limit || '50') + '\n';
          renderConsole();

          try {
            const response = await fetch('/api/run', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                action: 'analyze-morpho-blue',
                chain: state.morphoChain || 'ethereum',
                limit: state.form.limit || '50',
                marketId: state.form.morphoMarketId || undefined,
                kind: state.form.morphoKind || undefined,
                hfMax: state.form.hfMax || undefined,
                refresh: true
              })
            });
            const result = await response.json();
            if (!response.ok || !result || result.ok === false) {
              throw new Error(result && result.error ? String(result.error) : 'Morpho analyze failed.');
            }
            state.lastResult = result;
            if (!state.data.liveState) {
              state.data.liveState = { state: {} };
            }
            state.data.liveState.state = {
              ...(state.data.liveState.state || {}),
              updatedAt: new Date().toISOString(),
              lastAction: 'analyze-morpho-blue',
              lastResult: result,
              morphoBlueAnalyze: result
            };
            state.terminal += '$ Morpho read-only analyze completed\n';
            renderAll();
          } catch (error) {
            state.terminal += '$ failed: ' + String(error instanceof Error ? error.message : error) + '\n';
            renderConsole();
          } finally {
            state.morphoReadOnlyRunning = false;
            renderConsole();
          }
        }

        function bindEvents() {
          const actionSelfFundedButton = document.getElementById('actionSelfFunded');
          if (actionSelfFundedButton) {
            actionSelfFundedButton.addEventListener('click', function () { void startAutoExecute(); });
          }
          const actionMorphoReadOnlyButton = document.getElementById('actionMorphoReadOnly');
          if (actionMorphoReadOnlyButton) {
            actionMorphoReadOnlyButton.addEventListener('click', function () { void startMorphoReadOnlyAnalyze(); });
          }
	          const actionPauseButton = document.getElementById('actionPause');
	          if (actionPauseButton) {
	            actionPauseButton.addEventListener('click', function () { pauseAutoExecute(); });
	          }
	          const consoleWalletRefresh = document.getElementById('consoleWalletRefresh');
	          if (consoleWalletRefresh) {
	            consoleWalletRefresh.addEventListener('click', function () { void refreshWalletAssets(); });
	          }
	          [
            ['consoleFilterAll', 'all'],
            ['consoleFilterLiquidatable', 'liquidatable'],
            ['consoleFilterRisky', 'risky'],
            ['consoleFilterSafe', 'safe']
          ].forEach(function (entry) {
            const node = document.getElementById(entry[0]);
            if (!node) return;
            node.addEventListener('click', function () {
              state.consoleFilter = entry[1];
              renderConsole();
            });
          });
          [
            ['consoleSourceAll', 'all'],
            ['consoleSourceScan', 'scan'],
            ['consoleSourceMorpho', 'morpho-blue'],
            ['consoleSourceBscTail', 'bsc-tail']
          ].forEach(function (entry) {
            const node = document.getElementById(entry[0]);
            if (!node) return;
            node.addEventListener('click', function () {
              state.consoleSourceFilter = entry[1];
              renderConsole();
            });
          });
          [
            ['consoleMorphoSortLiq', 'liquidatable'],
            ['consoleMorphoSortNear', 'near'],
            ['consoleMorphoSortBorrow', 'borrow'],
            ['consoleMorphoSortWorstHf', 'worst-hf']
          ].forEach(function (entry) {
            const node = document.getElementById(entry[0]);
            if (!node) return;
            node.addEventListener('click', function () {
              state.morphoMarketSort = entry[1];
              renderConsole();
              renderAll();
            });
          });
          const terminalExpand = document.getElementById('terminalExpand');
          if (terminalExpand) {
            terminalExpand.addEventListener('click', function () {
              const node = document.getElementById('terminalOutputText');
              openModal(t('terminalTitle'), node ? node.textContent || '' : state.terminal);
            });
          }
        }

        return {
          renderConsole,
          syncConsoleLayoutHeight,
          syncTerminalOutput,
          syncMachineDisplay,
          appendTerminal,
          mergeConsoleTargets,
          startAutoExecute,
          startMorphoReadOnlyAnalyze,
          pauseAutoExecute,
          bindEvents
        };
      }
`;
