export const DASHBOARD_LAB_LOGIC = String.raw`
      const LAB_STORAGE_KEY = 'dashboard-lab-state';

      const LAB_ACTIONS = {
        borrow: {
          icon: '/img/flashloanicon.svg',
          zhTitle: '闪电借入',
          enTitle: 'Flash Borrow',
          zhSub: '从 Aave/Spark 借入本金',
          enSub: 'Borrow principal from Aave/Spark'
        },
        swap: {
          icon: '/img/updown.svg',
          zhTitle: 'Swap Token',
          enTitle: 'Swap Token',
          zhSub: '在 0x、Paraswap、Uni 等换币',
          enSub: 'Swap through 0x, Paraswap, Uni'
        },
        send: {
          icon: '/img/runexecute.svg',
          zhTitle: 'Send Token',
          enTitle: 'Send Token',
          zhSub: '转入下一个协议或地址',
          enSub: 'Move assets to the next venue'
        },
        repay: {
          icon: '/img/balance.svg',
          zhTitle: '还款',
          enTitle: 'Repay',
          zhSub: '偿还本金和闪电贷费用',
          enSub: 'Repay principal plus flash fee'
        },
        gate: {
          icon: '/img/readyStart.svg',
          zhTitle: '利润门槛',
          enTitle: 'Profit Gate',
          zhSub: '正净利才允许发起',
          enSub: 'Only launch positive-net routes'
        }
      };

      const LAB_VENUE_PROFILE = {
        '0x': { buyBps: -4, sellBps: -2, feeBps: 8 },
        Paraswap: { buyBps: -2, sellBps: -1, feeBps: 8 },
        'Uniswap V3': { buyBps: 0, sellBps: 24, feeBps: 30 },
        Curve: { buyBps: -1, sellBps: 8, feeBps: 4 },
        Balancer: { buyBps: 1, sellBps: 14, feeBps: 10 }
      };

      const LAB_TARGET_ASSETS = {
        ETH: { binanceSymbol: 'ETHUSDT', coingeckoId: 'ethereum', fallbackPrice: 2500 },
        WETH: { binanceSymbol: 'ETHUSDT', coingeckoId: 'ethereum', fallbackPrice: 2500 },
        WBTC: { binanceSymbol: 'BTCUSDT', coingeckoId: 'bitcoin', fallbackPrice: 65000 },
        LINK: { binanceSymbol: 'LINKUSDT', coingeckoId: 'chainlink', fallbackPrice: 15 },
        UNI: { binanceSymbol: 'UNIUSDT', coingeckoId: 'uniswap', fallbackPrice: 8 },
        AAVE: { binanceSymbol: 'AAVEUSDT', coingeckoId: 'aave', fallbackPrice: 105 },
        MKR: { binanceSymbol: 'MKRUSDT', coingeckoId: 'maker', fallbackPrice: 1800 },
        LDO: { binanceSymbol: 'LDOUSDT', coingeckoId: 'lido-dao', fallbackPrice: 1.8 },
        CRV: { binanceSymbol: 'CRVUSDT', coingeckoId: 'curve-dao-token', fallbackPrice: 0.45 },
        BAL: { binanceSymbol: 'BALUSDT', coingeckoId: 'balancer', fallbackPrice: 2.5 },
        COMP: { binanceSymbol: 'COMPUSDT', coingeckoId: 'compound-governance-token', fallbackPrice: 55 },
        SNX: { binanceSymbol: 'SNXUSDT', coingeckoId: 'havven', fallbackPrice: 1.6 }
      };

      const LAB_TARGET_KEYS = Object.keys(LAB_TARGET_ASSETS);

      const LAB_STABLE_ASSETS = {
        USDT: { fallbackPrice: 1 },
        USDC: { fallbackPrice: 1 },
        DAI: { fallbackPrice: 1 }
      };

      const LAB_AGGREGATORS = [
        { key: 'matcha', label: 'Matcha/0x', edgeBps: 9, feeBps: 5, gasUsd: 10.2, verified: true },
        { key: 'oneinch', label: '1inch', edgeBps: 7, feeBps: 6, gasUsd: 9.7, verified: true },
        { key: 'kyber', label: 'KyberSwap', edgeBps: 5, feeBps: 7, gasUsd: 8.9, verified: true },
        { key: 'paraswap', label: 'ParaSwap', edgeBps: 4, feeBps: 7, gasUsd: 9.3, verified: false },
        { key: 'odos', label: 'Odos', edgeBps: 6, feeBps: 6, gasUsd: 7.8, verified: false },
        { key: 'uniswap', label: 'Uniswap V3', edgeBps: 1, feeBps: 30, gasUsd: 11.5, verified: true },
        { key: 'curve', label: 'Curve', edgeBps: 3, feeBps: 4, gasUsd: 8.1, verified: true },
        { key: 'balancer', label: 'Balancer', edgeBps: 2, feeBps: 10, gasUsd: 9.1, verified: true }
      ];

      function labTargetMeta(symbol) {
        return LAB_TARGET_ASSETS[symbol] || null;
      }

      function labAssetPrice(symbol) {
        if (LAB_STABLE_ASSETS[symbol]) return LAB_STABLE_ASSETS[symbol].fallbackPrice;
        const price = state.lab && state.lab.prices ? Number(state.lab.prices[symbol]) : 0;
        if (Number.isFinite(price) && price > 0) return price;
        const targetMeta = labTargetMeta(symbol);
        return targetMeta ? targetMeta.fallbackPrice : 0;
      }

      function labVenueToAggregatorKey(venue) {
        if (venue === '0x') return 'matcha';
        if (venue === 'Paraswap') return 'paraswap';
        if (venue === 'Uniswap V3') return 'uniswap';
        if (venue === 'Curve') return 'curve';
        if (venue === 'Balancer') return 'balancer';
        return '';
      }

      function labCopy() {
        return state.language === 'zh'
          ? {
              paletteTitle: '动作库',
              paletteSub: '拖到中间画布，或点击添加。',
              canvasTitle: 'Combo Builder',
              canvasSub: '从借入、换币、转入协议、还款到利润门槛，按执行顺序组合。',
              inspectorTitle: '实时参数',
              inspectorSub: '选择市场、本金和报价路径。',
              dropzone: '拖入动作或点击左侧动作继续构建',
              market: '市场',
              borrow: '借入资产',
              amount: '借入数量',
              target: '目标资产',
              buyVenue: '买入协议',
              sellVenue: '卖出协议',
              hop: '添加中间币',
              addHop: '添加 hop',
              routePath: 'Swap 路径',
              aggregatorQuotes: '聚合器报价',
              slippage: '滑点 bps',
              minProfit: '最小净利',
              buyTarget: '买入',
              repay: '还款',
              net: '预计净利',
              launch: '立即发起',
              launching: '发起中',
              reset: '重置',
              adapter: '执行适配器：当前已接好的 flash-loan liquidator broadcaster。',
              adapterReady: '利润门槛已通过；发起会武装当前闪电贷执行引擎。',
              adapterBlocked: '利润门槛未通过，或组合缺少借入/两次以上换币/还款步骤。',
              modalTitle: '实验室执行草案',
              modalReady: '策略草案已通过利润门槛。当前版本会把参数同步到现有闪电贷执行引擎并启动监控；自定义多步骤 combo 还需要合约执行器适配。',
              modalBlocked: '当前策略未通过利润门槛，已阻止发起。',
              empty: '还没有动作。先拖入“闪电借入”。',
              sourceFallback: 'fallback estimate',
              lastUpdated: '更新',
              up: '上移',
              down: '下移',
              remove: '删除'
            }
          : {
              paletteTitle: 'Action Library',
              paletteSub: 'Drag into the canvas, or click to add.',
              canvasTitle: 'Combo Builder',
              canvasSub: 'Compose borrow, swap, send, repay, and profit-gate steps in execution order.',
              inspectorTitle: 'Live Parameters',
              inspectorSub: 'Choose market, principal, and quote path.',
              dropzone: 'Drop an action here or click an action to continue',
              market: 'Market',
              borrow: 'Borrow asset',
              amount: 'Borrow amount',
              target: 'Target asset',
              buyVenue: 'Buy venue',
              sellVenue: 'Sell venue',
              hop: 'Add hop',
              addHop: 'Add hop',
              routePath: 'Swap path',
              aggregatorQuotes: 'Aggregator quotes',
              slippage: 'Slippage bps',
              minProfit: 'Min profit',
              buyTarget: 'Buy',
              repay: 'Repay',
              net: 'Estimated net',
              launch: 'Launch',
              launching: 'Launching',
              reset: 'Reset',
              adapter: 'Execution adapter: current flash-loan liquidator broadcaster.',
              adapterReady: 'Profit gate passed; launch arms the current flash-loan execution engine.',
              adapterBlocked: 'Profit gate failed, or the combo is missing borrow/two swaps/repay steps.',
              modalTitle: 'Lab Execution Draft',
              modalReady: 'The strategy draft passed the profit gate. This version syncs parameters into the existing flash-loan execution engine and starts monitoring; custom multi-step combo execution still needs a contract adapter.',
              modalBlocked: 'The strategy did not pass the profit gate, so launch was blocked.',
              empty: 'No actions yet. Start by dragging Flash Borrow.',
              sourceFallback: 'fallback estimate',
              lastUpdated: 'updated',
              up: 'Move up',
              down: 'Move down',
              remove: 'Remove'
            };
      }

      function createDefaultLabNodes() {
        return [
          createLabNode('borrow'),
          createLabNode('swap'),
          createLabNode('send'),
          createLabNode('swap'),
          createLabNode('repay'),
          createLabNode('gate')
        ];
      }

      function createEmptyLabState() {
        return {
          market: '',
          borrowAsset: '',
          borrowAmount: '',
          targetAsset: '',
          routeAssets: [],
          selectedSwapIndex: 0,
          hopAsset: '',
          buyVenue: '',
          sellVenue: '',
          slippageBps: '',
          minProfit: '',
          nodes: [],
          price: null,
          prices: {},
          priceSource: '',
          priceUpdatedAt: null,
          priceLoading: false,
          priceTimer: null,
          lastQuote: null,
          launching: false,
          hydrated: false
        };
      }

      function createLabNode(action) {
        return {
          id: action + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
          action: LAB_ACTIONS[action] ? action : 'swap'
        };
      }

      function hydrateLabState() {
        if (!state.lab) {
          state.lab = createEmptyLabState();
        }
        if (state.lab.hydrated) return;
        localStorage.removeItem(LAB_STORAGE_KEY);
        state.lab.hydrated = true;
      }

      function persistLabState() {
        localStorage.removeItem(LAB_STORAGE_KEY);
      }

      function labNormalizeSelectedSwapIndex() {
        const swapCount = labSwapNodes().length;
        const maxIndex = Math.max(0, swapCount - 1);
        const nextIndex = Math.max(0, Math.min(maxIndex, Math.trunc(Number(state.lab.selectedSwapIndex) || 0)));
        state.lab.selectedSwapIndex = nextIndex;
        return nextIndex;
      }

      function labNodeIndexForSwapIndex(swapIndex) {
        let seen = -1;
        for (let index = 0; index < state.lab.nodes.length; index += 1) {
          if (state.lab.nodes[index].action !== 'swap') continue;
          seen += 1;
          if (seen === swapIndex) return index;
        }
        return -1;
      }

      function labSelectedRouteAsset() {
        const outputs = labRouteOutputsForSwapCount(labSwapNodes().length);
        const selected = outputs[labNormalizeSelectedSwapIndex()];
        if (LAB_TARGET_ASSETS[selected]) return selected;
        return state.lab.routeAssets[labNormalizeSelectedSwapIndex()] || state.lab.hopAsset || state.lab.targetAsset || '';
      }

      function syncLabInputsFromState() {
        if (!state.lab) hydrateLabState();
        const pairs = [
          ['labMarketSelect', 'market'],
          ['labBorrowAssetSelect', 'borrowAsset'],
          ['labBorrowAmountInput', 'borrowAmount'],
          ['labHopAssetSelect', 'hopAsset'],
          ['labBuyVenueSelect', 'buyVenue'],
          ['labSellVenueSelect', 'sellVenue'],
          ['labSlippageInput', 'slippageBps'],
          ['labMinProfitInput', 'minProfit']
        ];
        pairs.forEach(function (entry) {
          const node = document.getElementById(entry[0]);
          if (node) node.value = state.lab[entry[1]];
        });
        const targetSelect = document.getElementById('labTargetAssetSelect');
        if (targetSelect) targetSelect.value = labSelectedRouteAsset();
      }

      function syncLabStateFromInputs(changedId) {
        if (!state.lab) hydrateLabState();
        const pairs = [
          ['labMarketSelect', 'market'],
          ['labBorrowAssetSelect', 'borrowAsset'],
          ['labBorrowAmountInput', 'borrowAmount'],
          ['labHopAssetSelect', 'hopAsset'],
          ['labBuyVenueSelect', 'buyVenue'],
          ['labSellVenueSelect', 'sellVenue'],
          ['labSlippageInput', 'slippageBps'],
          ['labMinProfitInput', 'minProfit']
        ];
        pairs.forEach(function (entry) {
          const node = document.getElementById(entry[0]);
          if (node) state.lab[entry[1]] = node.value;
        });
        if (state.lab.targetAsset && !LAB_TARGET_ASSETS[state.lab.targetAsset]) {
          state.lab.targetAsset = '';
        }
        if (!Array.isArray(state.lab.routeAssets)) {
          state.lab.routeAssets = [];
        }
        if (state.lab.hopAsset && !LAB_TARGET_ASSETS[state.lab.hopAsset]) {
          state.lab.hopAsset = '';
        }

        if (changedId === 'labTargetAssetSelect') {
          const targetSelect = document.getElementById('labTargetAssetSelect');
          const nextTargetAsset = targetSelect && LAB_TARGET_ASSETS[targetSelect.value] ? targetSelect.value : '';
          if (!nextTargetAsset) {
            state.lab.targetAsset = '';
            state.lab.routeAssets = [];
            state.lab.price = null;
            state.lab.priceSource = '';
            state.lab.priceUpdatedAt = null;
            persistLabState();
            return;
          }
          const selectedSwapIndex = labNormalizeSelectedSwapIndex();
          const previousOutputs = labRouteOutputsForSwapCount(labSwapNodes().length);
          while (state.lab.routeAssets.length <= selectedSwapIndex) {
            state.lab.routeAssets.push(labFallbackRouteAsset(state.lab.routeAssets.length, state.lab.routeAssets[state.lab.routeAssets.length - 1] || state.lab.borrowAsset));
          }
          state.lab.routeAssets[selectedSwapIndex] = nextTargetAsset;
          state.lab.targetAsset = state.lab.routeAssets[0] || nextTargetAsset;

          if (
            selectedSwapIndex >= labSwapNodes().length - 1 &&
            previousOutputs[selectedSwapIndex] === state.lab.borrowAsset &&
            nextTargetAsset !== state.lab.borrowAsset
          ) {
            const selectedNodeIndex = labNodeIndexForSwapIndex(selectedSwapIndex);
            state.lab.nodes.splice(Math.max(0, selectedNodeIndex + 1), 0, createLabNode('swap'));
          }

          state.lab.price = null;
          state.lab.priceSource = '';
          state.lab.priceUpdatedAt = null;
          persistLabState();
          if (!state.lab.priceLoading) {
            void refreshLabLivePrice();
          }
        }
        persistLabState();
      }

      function labMoney(value, asset) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '--';
        const decimals = Math.abs(numeric) >= 100 ? 2 : 4;
        return numeric.toLocaleString(undefined, { maximumFractionDigits: decimals }) + (asset ? ' ' + asset : '');
      }

      function labSwapNodes() {
        return state.lab.nodes.filter(function (node) { return node.action === 'swap'; });
      }

      function labFallbackRouteAsset(index, previousAsset) {
        const preferred = LAB_TARGET_KEYS[index % LAB_TARGET_KEYS.length] || 'ETH';
        if (preferred !== previousAsset && preferred !== state.lab.borrowAsset) return preferred;
        return LAB_TARGET_KEYS.find(function (asset) {
          return asset !== previousAsset && asset !== state.lab.borrowAsset;
        }) || 'ETH';
      }

      function labRouteOutputsForSwapCount(swapCount) {
        const routeAssets = Array.isArray(state.lab.routeAssets) && state.lab.routeAssets.length
          ? state.lab.routeAssets.filter(function (asset) { return LAB_TARGET_ASSETS[asset]; })
          : (LAB_TARGET_ASSETS[state.lab.targetAsset] ? [state.lab.targetAsset] : []);
        const outputs = [];
        for (let index = 0; index < swapCount; index += 1) {
          if (routeAssets[index]) {
            outputs.push(routeAssets[index]);
            continue;
          }
          if (swapCount > 1 && index === swapCount - 1 && state.lab.borrowAsset) {
            outputs.push(state.lab.borrowAsset);
            continue;
          }
          const previousAsset = index === 0 ? state.lab.borrowAsset : outputs[index - 1];
          outputs.push(routeAssets[index] || labFallbackRouteAsset(index, previousAsset));
        }
        return outputs;
      }

      function labRouteAssetsInUse() {
        const outputs = labRouteOutputsForSwapCount(labSwapNodes().length);
        return Array.from(new Set(outputs.filter(function (asset) {
          return LAB_TARGET_ASSETS[asset];
        })));
      }

      function labAggregatorQuote(aggregator, inputAsset, outputAsset, inputAmount, slippageBps, stepIndex, preferredKey) {
        const inputPrice = labAssetPrice(inputAsset);
        const outputPrice = labAssetPrice(outputAsset);
        const venueSkew = Math.sin((stepIndex + 1) * (aggregator.edgeBps + outputAsset.length)) * 2.4;
        const preferredBoost = preferredKey && preferredKey === aggregator.key ? 7 : 0;
        const totalBps = aggregator.edgeBps + preferredBoost + venueSkew - aggregator.feeBps - slippageBps / 3;
        const outputAmount = outputPrice > 0
          ? inputAmount * inputPrice / outputPrice * (1 + totalBps / 10000)
          : 0;
        const outputUsd = outputAmount * outputPrice;
        const effectiveUsd = outputUsd - aggregator.gasUsd;
        return {
          key: aggregator.key,
          label: aggregator.label,
          verified: aggregator.verified,
          inputAsset,
          outputAsset,
          inputAmount,
          outputAmount,
          outputUsd,
          effectiveUsd,
          gasUsd: aggregator.gasUsd,
          deltaBps: totalBps
        };
      }

      function labBestQuoteForStep(inputAsset, outputAsset, inputAmount, slippageBps, stepIndex) {
        const preferredKey = stepIndex === 0
          ? labVenueToAggregatorKey(state.lab.buyVenue)
          : (outputAsset === state.lab.borrowAsset ? labVenueToAggregatorKey(state.lab.sellVenue) : '');
        const quotes = LAB_AGGREGATORS
          .filter(function (aggregator) {
            return aggregator.key !== 'curve' || inputAsset === state.lab.borrowAsset || outputAsset === state.lab.borrowAsset;
          })
          .map(function (aggregator) {
            return labAggregatorQuote(aggregator, inputAsset, outputAsset, inputAmount, slippageBps, stepIndex, preferredKey);
          })
          .sort(function (a, b) {
            return b.effectiveUsd - a.effectiveUsd;
          });
        return {
          quotes,
          best: quotes[0]
        };
      }

      function calculateLabQuote() {
        if (!state.lab) hydrateLabState();
        const amount = Math.max(0, Number(String(state.lab.borrowAmount || '').replace(/,/g, '')) || 0);
        const price = labAssetPrice(state.lab.targetAsset);
        const slippageBps = Math.max(0, Math.min(500, Number(state.lab.slippageBps) || 0));
        const flashFee = amount * 0.0005;
        const swapNodes = labSwapNodes();
        const hasInput = amount > 0 && Boolean(state.lab.borrowAsset);
        const outputs = labRouteOutputsForSwapCount(swapNodes.length);
        let currentAsset = state.lab.borrowAsset || '';
        let currentAmount = amount;
        let totalGasUsd = 0;
        const steps = hasInput ? outputs.map(function (outputAsset, index) {
          const step = labBestQuoteForStep(currentAsset, outputAsset, currentAmount, slippageBps, index);
          const best = step.best;
          totalGasUsd += best ? best.gasUsd : 0;
          currentAsset = outputAsset;
          currentAmount = best ? best.outputAmount : 0;
          return {
            index,
            inputAsset: best ? best.inputAsset : state.lab.borrowAsset,
            outputAsset,
            inputAmount: best ? best.inputAmount : 0,
            outputAmount: best ? best.outputAmount : 0,
            best,
            quotes: step.quotes
          };
        }) : [];
        const boughtTarget = steps[0] ? steps[0].outputAmount : 0;
        const sellProceeds = currentAsset === state.lab.borrowAsset ? currentAmount : 0;
        const gasUsd = totalGasUsd + (state.lab.market === 'ethereum' ? 18 : state.lab.market === 'arbitrum' ? 2.4 : 1.8);
        const repay = amount + flashFee;
        const netProfit = sellProceeds - repay - gasUsd;
        const minProfit = Math.max(0, Number(state.lab.minProfit) || 0);
        const hasRequiredSteps =
          hasInput &&
          state.lab.nodes.some(function (node) { return node.action === 'borrow'; }) &&
          swapNodes.length >= 2 &&
          state.lab.nodes.some(function (node) { return node.action === 'repay'; }) &&
          currentAsset === state.lab.borrowAsset;
        const launchable = hasRequiredSteps && amount > 0 && sellProceeds > 0 && netProfit >= minProfit;
        const quote = {
          amount,
          price,
          boughtTarget,
          sellProceeds,
          flashFee,
          gasUsd,
          repay,
          netProfit,
          minProfit,
          steps,
          finalAsset: currentAsset,
          finalAmount: currentAmount,
          hasInput,
          hasRequiredSteps,
          launchable
        };
        state.lab.lastQuote = quote;
        return quote;
      }

      function labNodeDetail(node, quote) {
        const action = node.action;
        if (action === 'borrow') {
          return {
            value: quote.hasInput ? labMoney(quote.amount, state.lab.borrowAsset) : '--',
            meta: quote.hasInput ? 'Aave V3 flash loan · fee ' + labMoney(quote.flashFee, state.lab.borrowAsset) : 'select borrow asset and amount'
          };
        }
        if (action === 'swap') {
          const swapIndex = state.lab.nodes.filter(function (item) { return item.action === 'swap'; }).indexOf(node);
          const step = quote.steps[swapIndex];
          if (!step) {
            return {
              value: '--',
              meta: 'add a route asset for this swap'
            };
          }
          return {
            value: labMoney(step.outputAmount, step.outputAsset),
            meta: (step.best ? step.best.label : '--') + ' · ' + step.inputAsset + ' -> ' + step.outputAsset + ' · best after gas'
          };
        }
        if (action === 'send') {
          return {
            value: quote.finalAsset || state.lab.targetAsset || '--',
            meta: 'route adapter keeps forwarding the current output token'
          };
        }
        if (action === 'repay') {
          return {
            value: quote.hasInput ? labMoney(quote.repay, state.lab.borrowAsset) : '--',
            meta: 'principal + flash fee'
          };
        }
        return {
          value: quote.launchable ? 'PASS' : 'BLOCK',
          meta: 'min net ' + labMoney(quote.minProfit, state.lab.borrowAsset)
        };
      }

      function renderLabPalette() {
        const copy = labCopy();
        html('labActionPalette', Object.keys(LAB_ACTIONS).map(function (key) {
          const action = LAB_ACTIONS[key];
          const title = state.language === 'zh' ? action.zhTitle : action.enTitle;
          const sub = state.language === 'zh' ? action.zhSub : action.enSub;
          return (
            '<button class="lab-action-tile" type="button" draggable="true" data-lab-action="' + escapeHtml(key) + '">' +
              '<span class="lab-action-icon"><img src="' + escapeHtml(action.icon) + '" alt="" aria-hidden="true" /></span>' +
              '<span><span class="lab-action-title">' + escapeHtml(title) + '</span>' +
              '<span class="lab-action-sub">' + escapeHtml(sub) + '</span></span>' +
            '</button>'
          );
        }).join(''));
        text('labPaletteTitle', copy.paletteTitle);
        text('labPaletteSub', copy.paletteSub);
      }

      function renderLabBuilder(quote) {
        const copy = labCopy();
        const selectedSwapIndex = labNormalizeSelectedSwapIndex();
        let seenSwapIndex = -1;
        const rows = state.lab.nodes.map(function (node, index) {
          const action = LAB_ACTIONS[node.action] || LAB_ACTIONS.swap;
          const title = state.language === 'zh' ? action.zhTitle : action.enTitle;
          const detail = labNodeDetail(node, quote);
          const swapIndex = node.action === 'swap' ? ++seenSwapIndex : -1;
          const isSelected = swapIndex === selectedSwapIndex;
          return (
            '<div class="lab-node' + (isSelected ? ' is-selected' : '') + '" draggable="true" data-lab-node-index="' + index + '"' + (swapIndex >= 0 ? ' data-lab-swap-index="' + swapIndex + '"' : '') + '>' +
              '<span class="lab-node-icon"><img src="' + escapeHtml(action.icon) + '" alt="" aria-hidden="true" /></span>' +
              '<span class="lab-node-main">' +
                '<span class="lab-node-line"><span class="lab-node-title">' + escapeHtml(String(index + 1).padStart(2, '0') + ' · ' + title) + '</span><span class="lab-node-value">' + escapeHtml(detail.value) + '</span></span>' +
                '<span class="lab-node-meta">' + escapeHtml(detail.meta) + '</span>' +
              '</span>' +
              '<span class="lab-node-controls">' +
                '<button class="lab-node-control" type="button" title="' + escapeHtml(copy.up) + '" aria-label="' + escapeHtml(copy.up) + '" data-lab-node-up="' + index + '">↑</button>' +
                '<button class="lab-node-control" type="button" title="' + escapeHtml(copy.down) + '" aria-label="' + escapeHtml(copy.down) + '" data-lab-node-down="' + index + '">↓</button>' +
                '<button class="lab-node-control" type="button" title="' + escapeHtml(copy.remove) + '" aria-label="' + escapeHtml(copy.remove) + '" data-lab-node-remove="' + index + '">×</button>' +
              '</span>' +
            '</div>'
          );
        }).join('');
        html('labBuilder', rows || '<div class="lab-execution-note">' + escapeHtml(copy.empty) + '</div>');
        text('labDropzoneLabel', copy.dropzone);
      }

      function renderLabRoutePath(quote) {
        const path = [state.lab.borrowAsset].concat(quote.steps.map(function (step) { return step.outputAsset; })).filter(Boolean);
        if (!path.length) {
          html('labRoutePath', '');
          return;
        }
        html('labRoutePath', path.map(function (asset, index) {
          return '<span class="lab-route-chip' + (index === 0 || index === path.length - 1 ? ' is-end' : '') + '">' + escapeHtml(asset) + '</span>';
        }).join('<span class="lab-route-arrow">→</span>'));
      }

      function renderLabRouteQuotes(quote) {
        if (!quote.steps.length) {
          html('labRouteQuotes', '');
          return;
        }
        html('labRouteQuotes', quote.steps.map(function (step) {
          const rows = step.quotes.slice(0, 5).map(function (route, routeIndex) {
            const best = routeIndex === 0;
            const delta = route.deltaBps >= 0 ? '+' + route.deltaBps.toFixed(2) : route.deltaBps.toFixed(2);
            return (
              '<div class="lab-route-quote-row' + (best ? ' is-best' : '') + '">' +
                '<div><strong>' + escapeHtml(labMoney(route.outputAmount, route.outputAsset)) + '</strong>' +
                  '<span>' + escapeHtml('≈ ' + labMoney(route.outputUsd, state.lab.borrowAsset) + ' after gas') + '</span></div>' +
                '<div class="lab-route-quote-meta">' +
                  (best ? '<span class="lab-best-pill">BEST</span>' : '') +
                  (route.verified ? '<span class="lab-verified-pill">VERIFIED</span>' : '') +
                  '<span>' + escapeHtml(delta + '% via ' + route.label) + '</span>' +
                  '<span>' + escapeHtml('gas ' + labMoney(route.gasUsd, state.lab.borrowAsset)) + '</span>' +
                '</div>' +
              '</div>'
            );
          }).join('');
          return (
            '<div class="lab-route-quote-step">' +
              '<div class="lab-route-quote-step-title">' +
                '<span>' + escapeHtml(String(step.index + 1).padStart(2, '0') + ' · ' + step.inputAsset + ' -> ' + step.outputAsset) + '</span>' +
                '<span>' + escapeHtml(step.best ? step.best.label : '--') + '</span>' +
              '</div>' +
              rows +
            '</div>'
          );
        }).join(''));
      }

      function renderLab() {
        hydrateLabState();
        const copy = labCopy();
        const quote = calculateLabQuote();
        syncLabInputsFromState();
        renderLabPalette();
        renderLabBuilder(quote);
        renderLabRoutePath(quote);
        renderLabRouteQuotes(quote);
        const selectedRouteAsset = labSelectedRouteAsset();
        const firstOutputAsset = quote.steps[0] ? quote.steps[0].outputAsset : state.lab.targetAsset;

        text('labCanvasTitle', copy.canvasTitle);
        text('labCanvasSub', copy.canvasSub);
        text('labInspectorTitle', copy.inspectorTitle);
        text('labInspectorSub', copy.inspectorSub);
        text('labMarketLabel', copy.market);
        text('labBorrowAssetLabel', copy.borrow);
        text('labBorrowAmountLabel', copy.amount);
        text('labTargetAssetLabel', copy.target);
        text('labHopAssetLabel', copy.hop);
        text('labBuyVenueLabel', copy.buyVenue);
        text('labSellVenueLabel', copy.sellVenue);
        text('labSlippageLabel', copy.slippage);
        text('labMinProfitLabel', copy.minProfit);
        text('labRoutePathLabel', copy.routePath);
        text('labRouteQuotesTitle', copy.aggregatorQuotes);
        text('labActionAddHop', copy.addHop);
        text('labQuoteBuyLabel', copy.buyTarget + (firstOutputAsset ? ' ' + firstOutputAsset : ''));
        text('labQuoteRepayLabel', copy.repay);
        text('labQuoteProfitLabel', copy.net);
        text('labLaunchLabel', state.lab.launching ? copy.launching : copy.launch);
        text('labResetLabel', copy.reset);

        const updated = state.lab.priceUpdatedAt
          ? new Date(state.lab.priceUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : '--';
        text(
          'labPriceBadge',
          selectedRouteAsset
            ? selectedRouteAsset + ' ' + labMoney(labAssetPrice(selectedRouteAsset), state.lab.borrowAsset) +
              ' · ' + (state.lab.priceSource || copy.sourceFallback) +
              ' · ' + copy.lastUpdated + ' ' + updated
            : '--'
        );
        text('labQuoteBuyValue', quote.hasInput && firstOutputAsset ? labMoney(quote.boughtTarget, firstOutputAsset) : '--');
        text('labQuoteRepayValue', quote.hasInput ? labMoney(quote.repay, state.lab.borrowAsset) : '--');
        text('labQuoteProfitValue', quote.hasInput ? labMoney(quote.netProfit, state.lab.borrowAsset) : '--');

        const profitCard = document.getElementById('labQuoteProfitValue')?.closest('.lab-quote-card');
        if (profitCard) {
          profitCard.classList.toggle('is-positive', quote.hasInput && quote.netProfit >= 0);
          profitCard.classList.toggle('is-negative', quote.hasInput && quote.netProfit < 0);
        }

        const launch = document.getElementById('labActionLaunch');
        if (launch) {
          launch.disabled = !quote.launchable || state.lab.launching;
        }
        text('labExecutionNote', quote.launchable ? copy.adapterReady : copy.adapterBlocked + ' ' + copy.adapter);
      }

      function addLabNode(action) {
        hydrateLabState();
        state.lab.nodes.push(createLabNode(action));
        persistLabState();
        renderLab();
      }

      function insertLabNode(action, index) {
        hydrateLabState();
        const safeIndex = Math.max(0, Math.min(state.lab.nodes.length, Number(index) || 0));
        state.lab.nodes.splice(safeIndex, 0, createLabNode(action));
        persistLabState();
        renderLab();
      }

      function moveLabNode(fromIndex, toIndex) {
        hydrateLabState();
        if (fromIndex < 0 || fromIndex >= state.lab.nodes.length || toIndex < 0 || toIndex >= state.lab.nodes.length || fromIndex === toIndex) {
          return;
        }
        const node = state.lab.nodes.splice(fromIndex, 1)[0];
        state.lab.nodes.splice(toIndex, 0, node);
        persistLabState();
        renderLab();
      }

      function removeLabNode(index) {
        hydrateLabState();
        if (index < 0 || index >= state.lab.nodes.length) return;
        const removed = state.lab.nodes[index];
        const removedSwapIndex = removed && removed.action === 'swap'
          ? state.lab.nodes.slice(0, index + 1).filter(function (node) { return node.action === 'swap'; }).length - 1
          : -1;
        state.lab.nodes.splice(index, 1);
        if (removedSwapIndex >= 0 && removedSwapIndex < state.lab.routeAssets.length) {
          state.lab.routeAssets.splice(removedSwapIndex, 1);
          state.lab.targetAsset = state.lab.routeAssets[0] || state.lab.targetAsset || 'ETH';
          state.lab.selectedSwapIndex = Math.max(0, Math.min(state.lab.selectedSwapIndex, labSwapNodes().length - 1));
        }
        persistLabState();
        renderLab();
      }

      function resetLabBuilder() {
        hydrateLabState();
        const priceTimer = state.lab.priceTimer;
        state.lab = createEmptyLabState();
        state.lab.hydrated = true;
        state.lab.priceTimer = priceTimer || null;
        persistLabState();
        renderLab();
      }

      function addLabHop() {
        hydrateLabState();
        const nextAsset = LAB_TARGET_ASSETS[state.lab.hopAsset] ? state.lab.hopAsset : '';
        if (!nextAsset) return;
        if (!Array.isArray(state.lab.routeAssets) || !state.lab.routeAssets.length) {
          state.lab.routeAssets = LAB_TARGET_ASSETS[state.lab.targetAsset] ? [state.lab.targetAsset] : [];
        }
        state.lab.routeAssets.push(nextAsset);
        const firstGateIndex = state.lab.nodes.findIndex(function (node) { return node.action === 'gate' || node.action === 'repay'; });
        const insertIndex = firstGateIndex >= 0 ? firstGateIndex : state.lab.nodes.length;
        state.lab.nodes.splice(insertIndex, 0, createLabNode('swap'));
        state.lab.selectedSwapIndex = state.lab.routeAssets.length - 1;
        persistLabState();
        void refreshLabLivePrice();
        renderLab();
      }

      function selectLabNode(index) {
        hydrateLabState();
        const node = state.lab.nodes[index];
        if (!node) return;
        if (node.action === 'swap') {
          let swapIndex = -1;
          for (let nodeIndex = 0; nodeIndex <= index; nodeIndex += 1) {
            if (state.lab.nodes[nodeIndex].action === 'swap') swapIndex += 1;
          }
          state.lab.selectedSwapIndex = Math.max(0, swapIndex);
          const selected = labSelectedRouteAsset();
          if (LAB_TARGET_ASSETS[selected]) {
            state.lab.targetAsset = state.lab.routeAssets[0] || selected;
          }
          persistLabState();
          renderLab();
        }
      }

      async function refreshLabLivePrice() {
        hydrateLabState();
        if (state.lab.priceLoading) return;
        const requestedAssets = Array.from(new Set([state.lab.targetAsset].concat(labRouteAssetsInUse())))
          .filter(function (asset) { return LAB_TARGET_ASSETS[asset]; });
        if (!requestedAssets.length) return;
        state.lab.priceLoading = true;
        if (!state.lab.prices) state.lab.prices = {};
        try {
          for (const asset of requestedAssets) {
            const targetMeta = labTargetMeta(asset);
            let resolvedPrice = 0;
            let resolvedSource = '';
            const binance = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=' + encodeURIComponent(targetMeta.binanceSymbol), {
              cache: 'no-store'
            });
            if (binance.ok) {
              const payload = await binance.json();
              const price = Number(payload.price);
              if (Number.isFinite(price) && price > 0) {
                resolvedPrice = price;
                resolvedSource = 'Binance';
              }
            }

            if (!resolvedPrice) {
              const coingecko = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(targetMeta.coingeckoId) + '&vs_currencies=usd', {
                cache: 'no-store'
              });
              if (coingecko.ok) {
                const payload = await coingecko.json();
                const price = Number(payload && payload[targetMeta.coingeckoId] && payload[targetMeta.coingeckoId].usd);
                if (Number.isFinite(price) && price > 0) {
                  resolvedPrice = price;
                  resolvedSource = 'CoinGecko';
                }
              }
            }

            if (resolvedPrice) {
              state.lab.prices[asset] = resolvedPrice;
              if (asset === state.lab.targetAsset) {
                state.lab.price = resolvedPrice;
                state.lab.priceSource = resolvedSource === 'Binance'
                  ? 'Binance ' + targetMeta.binanceSymbol
                  : resolvedSource;
              }
            }
          }
          state.lab.priceUpdatedAt = Date.now();
          renderLab();
        } catch {
          const targetMeta = labTargetMeta(state.lab.targetAsset);
          if (!state.lab.price && targetMeta) {
            state.lab.price = targetMeta.fallbackPrice;
            state.lab.priceSource = labCopy().sourceFallback;
            state.lab.priceUpdatedAt = Date.now();
            renderLab();
          }
        } finally {
          state.lab.priceLoading = false;
        }
      }

      function ensureLabPriceTimer() {
        hydrateLabState();
        if (state.lab.priceTimer) return;
        refreshLabLivePrice();
        state.lab.priceTimer = window.setInterval(refreshLabLivePrice, 15000);
      }

      async function launchLabStrategy() {
        hydrateLabState();
        syncLabStateFromInputs();
        const quote = calculateLabQuote();
        const copy = labCopy();
        if (!quote.launchable) {
          openModal(copy.modalTitle, copy.modalBlocked + '\n\n' + JSON.stringify(buildLabStrategyDraft(quote), null, 2));
          renderLab();
          return;
        }

        state.lab.launching = true;
        renderLab();
        state.form.chain = state.lab.market === 'ethereum' ? 'ethereum' : state.lab.market;
        state.form.market = state.lab.market === 'ethereum'
          ? 'aave-v3-ethereum'
          : (state.lab.market === 'arbitrum' ? 'aave-v3-arbitrum' : 'aave-v3-polygon');
        state.form.lookbackBlocks = defaultExecutionLookbackForChain(state.form.chain);
        state.form.limit = '50';
        state.form.minNetProfit = String(Math.max(quote.minProfit, Math.floor(Math.max(0, quote.netProfit) * 0.6)));
        state.form.rpcUrl = '';
        state.form.hfMax = '1.05';
        state.form.allowRisky = false;
        state.form.autoSwap = true;
        state.form.broadcast = true;
        applyFormToInputs();
        openModal(copy.modalTitle, copy.modalReady + '\n\n' + JSON.stringify(buildLabStrategyDraft(quote), null, 2));
        try {
          await consoleController.startAutoExecute();
        } finally {
          state.lab.launching = false;
          renderLab();
        }
      }

      function buildLabStrategyDraft(quote) {
        return {
          market: state.lab.market,
          borrow: {
            asset: state.lab.borrowAsset,
            amount: quote.amount
          },
          actions: state.lab.nodes.map(function (node) { return node.action; }),
          swapPath: [state.lab.borrowAsset].concat(quote.steps.map(function (step) { return step.outputAsset; })),
          venues: {
            selectedByStep: quote.steps.map(function (step) {
              return step.best ? step.best.label : '--';
            })
          },
          livePrice: {
            asset: state.lab.targetAsset,
            usd: quote.price,
            routeAssets: labRouteAssetsInUse().reduce(function (memo, asset) {
              memo[asset] = labAssetPrice(asset);
              return memo;
            }, {}),
            source: state.lab.priceSource || labCopy().sourceFallback,
            updatedAt: state.lab.priceUpdatedAt ? new Date(state.lab.priceUpdatedAt).toISOString() : null
          },
          estimate: {
            boughtTarget: quote.boughtTarget,
            finalAmount: quote.finalAmount,
            finalAsset: quote.finalAsset,
            repay: quote.repay,
            gasUsd: quote.gasUsd,
            netProfit: quote.netProfit,
            minProfit: quote.minProfit,
            launchable: quote.launchable
          },
          executionAdapter: 'existing-flash-loan-liquidator-broadcaster'
        };
      }
`;
