export const DASHBOARD_CHART_UTILS_LOGIC = String.raw`
      function formatInteger(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '--';
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(numeric);
      }

      function currentQuicknodeMetric() {
        const usage = state.data.quicknodeUsage;
        if (!usage || !usage.metrics) return null;
        return usage.metrics[state.form.chain] || null;
      }

      function quicknodeUsageText() {
        const metric = currentQuicknodeMetric();
        if (!metric) return t('quicknodeUsageUnavailable');
        if (metric.status === 'missing_key') return t('quicknodeUsageMissingKey');
        if (metric.status === 'missing_rpc') return t('quicknodeUsageMissingRpc');
        if (metric.status === 'unmatched') return t('quicknodeUsageUnmatched');
        if (metric.status === 'error') return t('quicknodeUsageError');
        if (typeof metric.requests24h !== 'number') return t('quicknodeUsageUnavailable');
        return t('quicknodeUsageLabel') + ': ' + formatInteger(metric.requests24h);
      }

      function chartWatermarkMarkup() {
        return '<div class="chart-watermark"><img src="/img/bglogo.svg" alt="" aria-hidden="true" /></div>';
      }

      function ensureChartTooltip(containerId, tooltipClass) {
        const container = document.getElementById(containerId);
        if (!container) return null;
        let tooltip = container.querySelector('.chart-tooltip');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.className = 'chart-tooltip ' + (tooltipClass || '');
          container.appendChild(tooltip);
        }
        return tooltip;
      }

      function hideChartTooltip(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const tooltip = container.querySelector('.chart-tooltip');
        if (tooltip) tooltip.classList.remove('open');
      }

      function renderDistributionExternalTooltip(context, containerId, boundaries) {
        const tooltipModel = context.tooltip;
        const tooltip = ensureChartTooltip(containerId, 'distribution-tooltip');
        const container = document.getElementById(containerId);
        if (!tooltip || !container) return;
        if (!tooltipModel || tooltipModel.opacity === 0 || !tooltipModel.dataPoints || !tooltipModel.dataPoints.length) {
          tooltip.classList.remove('open');
          return;
        }
        const point = tooltipModel.dataPoints[0];
        const title = getDistributionTooltipRange(boundaries, point.dataIndex);
        const value = formatDistributionProbability(point.raw);
        tooltip.innerHTML =
          '<div class="chart-tooltip-title">' + escapeHtml(title) + '</div>' +
          '<div class="chart-tooltip-row">' +
            '<span class="chart-tooltip-dot" style="background:#1798ff"></span>' +
            '<span class="chart-tooltip-line">' + escapeHtml(distributionAxisLabel()) + ': <span class="chart-tooltip-value">' + escapeHtml(value) + '</span></span>' +
          '</div>';
        const tooltipWidth = tooltip.offsetWidth || 280;
        const tooltipHeight = tooltip.offsetHeight || 72;
        const left = Math.max(10, Math.min(tooltipModel.caretX - tooltipWidth / 2, container.clientWidth - tooltipWidth - 10));
        const top = Math.max(8, tooltipModel.caretY - tooltipHeight - 16);
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.classList.add('open');
      }

      function shortAddress(value) {
        if (!value) return '--';
        const stringValue = String(value);
        return stringValue.slice(0, 6) + '...' + stringValue.slice(-4);
      }

      function hashString(value) {
        let hash = 0;
        const input = String(value || '');
        for (let index = 0; index < input.length; index += 1) {
          hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
        }
        return hash >>> 0;
      }

      function leaderboardIdenticon(address) {
        const seed = hashString(address || '--');
        const hue = seed % 360;
        const hue2 = (hue + 120) % 360;
        const bg = 'hsl(' + hue + ', 68%, 42%)';
        const fg = 'hsl(' + hue2 + ', 78%, 62%)';
        const light = 'rgba(255,255,255,0.9)';
        let rects = '';
        for (let y = 0; y < 5; y += 1) {
          for (let x = 0; x < 3; x += 1) {
            const bit = (seed >> (x + y * 3)) & 1;
            if (!bit) continue;
            const fill = ((seed >> (x + y * 5 + 4)) & 1) ? fg : light;
            rects += '<rect x="' + (x * 8) + '" y="' + (y * 8) + '" width="8" height="8" fill="' + fill + '"/>';
            if (x !== 2) {
              rects += '<rect x="' + ((4 - x) * 8) + '" y="' + (y * 8) + '" width="8" height="8" fill="' + fill + '"/>';
            }
          }
        }
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="' + bg + '"/>' + rects + '</svg>';
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      }

      function formatTime(value) {
        if (!value) return '--';
        try {
          return new Date(value).toLocaleString();
        } catch {
          return String(value);
        }
      }

      function formatLeaderboardTime(value) {
        const numeric = toNumber(value);
        if (numeric === null) return '--';
        return new Date(numeric * 1000).toISOString().replace('T', ' ').slice(0, 19);
      }

      function formatInteger(value) {
        const numeric = toNumber(value);
        if (numeric === null) return '--';
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(numeric);
      }

      function formatUsd(value) {
        const numeric = toNumber(value);
        if (numeric === null) return '--';
        return '$' + new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(numeric);
      }

      function formatMetricNumber(value, maxFractionDigits) {
        const numeric = toNumber(value);
        if (numeric === null) return '--';
        const digits = typeof maxFractionDigits === 'number' ? maxFractionDigits : 2;
        const minimumFractionDigits = Number.isInteger(numeric) ? 0 : Math.min(2, digits);
        return new Intl.NumberFormat('en-US', {
          minimumFractionDigits: minimumFractionDigits,
          maximumFractionDigits: digits
        }).format(numeric);
      }

      function setAnimatedMetric(id, value, maxFractionDigits) {
        const node = document.getElementById(id);
        if (!node) return;
        const numeric = toNumber(value);
        if (numeric === null) {
          node.textContent = '--';
          delete node.dataset.metricValue;
          return;
        }
        const digits = typeof maxFractionDigits === 'number' ? maxFractionDigits : 2;
        const formattedTarget = formatMetricNumber(numeric, digits);
        if (node.dataset.metricValue === formattedTarget) {
          node.textContent = formattedTarget;
          return;
        }
        const startValue = toNumber(node.dataset.metricValue);
        const from = startValue === null ? 0 : startValue;
        const change = numeric - from;
        const duration = 560;
        const startedAt = performance.now();
        node.dataset.metricValue = formattedTarget;

        function frame(now) {
          const progress = Math.min((now - startedAt) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const currentValue = from + change * eased;
          node.textContent = formatMetricNumber(currentValue, digits);
          if (progress < 1) {
            requestAnimationFrame(frame);
            return;
          }
          node.textContent = formattedTarget;
        }

        requestAnimationFrame(frame);
      }

      function formatTrendDate(timestamp) {
        const numeric = toNumber(timestamp);
        if (numeric === null) return '--';
        const date = new Date(numeric * 1000);
        if (state.overviewPeriod === '1') {
          return String(date.getUTCHours()).padStart(2, '0') + ':00';
        }
        return date.getUTCDate() + '. ' + date.toLocaleString('en-US', {
          month: 'short',
          timeZone: 'UTC'
        });
      }

      function buildTrendLabels(rows) {
        if (state.overviewPeriod === '30') {
          const lastNumeric = rows.length ? toNumber(rows[rows.length - 1].timestamp) : null;
          const lastDayIndex = lastNumeric === null ? null : Math.floor(lastNumeric / 86400);
          return rows.map(function (row, index) {
            const numeric = toNumber(row.timestamp);
            if (numeric === null) return '';
            const dayIndex = Math.floor(numeric / 86400);
            if (index === rows.length - 1) return formatTrendDate(row.timestamp);
            if (lastDayIndex === null) return '';
            return (lastDayIndex - dayIndex) % 4 === 0 ? formatTrendDate(row.timestamp) : '';
          });
        }
        if (state.overviewPeriod !== '1') {
          return rows.map(function (row) { return formatTrendDate(row.timestamp); });
        }
        const stepHours = rows.length <= 8 ? 1 : rows.length <= 12 ? 2 : rows.length <= 18 ? 3 : 4;
        return rows.map(function (row) {
          const numeric = toNumber(row.timestamp);
          if (numeric === null) return '';
          const date = new Date(numeric * 1000);
          const hour = date.getUTCHours();
          return hour % stepHours === 0 ? String(hour).padStart(2, '0') + ':00' : '';
        });
      }

      function formatTrendTooltipDate(timestamp) {
        const numeric = toNumber(timestamp);
        if (numeric === null) return '--';
        const date = new Date(numeric * 1000);
        if (state.overviewPeriod === '1') {
          return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'UTC'
          }).replace(',', '') + ' (UTC)';
        }
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC'
        }) + ' (UTC)';
      }

      function shouldShowTrendLabel(index, total) {
        if (total <= 7) return true;
        const step = total <= 12 ? 2 : total <= 18 ? 3 : total <= 26 ? 4 : 5;
        return index === 0 || index === total - 1 || index % step === 0;
      }

      function formatDistributionBucket(range) {
        const numeric = toNumber(range);
        if (numeric === null) return String(range || '--');
        const abs = Math.abs(numeric);
        let body;
        if (abs >= 1000000) {
          body = (abs / 1000000) + 'M';
        } else if (abs >= 1000) {
          body = (abs / 1000) + 'K';
        } else {
          body = String(abs);
        }
        return '$' + (numeric < 0 ? '-' : '') + body;
      }

      function formatDistributionRangeLabel(start, end) {
        const left = formatDistributionBucket(start);
        if (end === null || end === undefined) {
          return left + '~+';
        }
        return left + '~' + formatDistributionBucket(end);
      }

      function formatDistributionProbability(value) {
        const numeric = toNumber(value);
        if (numeric === null) return '--';
        return numeric.toFixed(4);
      }

      function getChartStageWidth(id, fallback) {
        const node = document.getElementById(id);
        const width = node ? Math.floor(node.clientWidth) : 0;
        return Math.max(fallback, width || 0);
      }

      function inferDistributionLowerBound(rows) {
        const first = rows.length ? toNumber(rows[0].range) : null;
        if (first === null) return null;
        const second = rows.length > 1 ? toNumber(rows[1].range) : null;
        if (second !== null && first !== 0 && second !== 0 && first * second > 0) {
          const ratio = Math.abs(second / first);
          if (Number.isFinite(ratio) && ratio > 0) {
            return first / ratio;
          }
        }
        if (first < 0) return first * 10;
        if (first > 0) return 0;
        return -1;
      }

      function buildDistributionBoundaries(rows) {
        if (!rows.length) return [];
        const boundaries = [inferDistributionLowerBound(rows)];
        rows.forEach(function (row) {
          boundaries.push(toNumber(row.range));
        });
        return boundaries;
      }

      function getDistributionTooltipRange(boundaries, index) {
        const start = boundaries[index];
        const end = boundaries[index + 1];
        if (start === undefined && end === undefined) return '--';
        return formatDistributionRangeLabel(start, end);
      }

      function formatRelativeFromUnix(timestamp) {
        const numeric = toNumber(timestamp);
        if (numeric === null) return '--';
        const diffSeconds = Math.max(0, Math.round(Date.now() / 1000 - numeric));
        if (state.language === 'zh') {
          if (diffSeconds < 60) return diffSeconds + ' 秒前';
          if (diffSeconds < 3600) {
            const mins = Math.round(diffSeconds / 60);
            return mins + ' 分钟前';
          }
          if (diffSeconds < 86400) {
            const hours = Math.round(diffSeconds / 3600);
            return hours + ' 小时前';
          }
          const days = Math.round(diffSeconds / 86400);
          return days + ' 天前';
        }
        if (diffSeconds < 60) return diffSeconds === 1 ? '1 sec ago' : diffSeconds + ' secs ago';
        if (diffSeconds < 3600) {
          const mins = Math.round(diffSeconds / 60);
          return mins === 1 ? 'a minute ago' : mins + ' mins ago';
        }
        if (diffSeconds < 86400) {
          const hours = Math.round(diffSeconds / 3600);
          return hours === 1 ? 'an hour ago' : hours + ' hours ago';
        }
        const days = Math.round(diffSeconds / 86400);
        return days === 1 ? 'a day ago' : days + ' days ago';
      }

      function trendAmountLabel() {
        return t('trendAmountLabel');
      }

      function trendTxLabel() {
        return t('trendTxLabel');
      }

      function distributionLegendLabel() {
        return t('distributionLegend');
      }

      function distributionAxisLabel() {
        return t('distributionAxisLabel');
      }

      function isDistributionHoverDataset(label) {
        return label === '__distribution-hover__';
      }

      function buildLegendLabels(chart, options) {
        const labels = window.Chart.defaults.plugins.legend.labels.generateLabels(chart);
        return labels
          .filter(function (item) {
            const dataset = chart.data.datasets[item.datasetIndex] || {};
            return !isDistributionHoverDataset(dataset.label);
          })
          .map(function (item) {
            const dataset = chart.data.datasets[item.datasetIndex] || {};
            const color = dataset.backgroundColor || item.fillStyle || '#afb4be';
            const fill = Array.isArray(color) ? color[0] : color;
            return Object.assign({}, item, {
              text: '  ' + item.text,
              pointStyle: 'circle',
              rotation: 0,
              lineWidth: 0,
              strokeStyle: fill,
              fillStyle: fill
            });
          });
      }

      function niceCeil(value) {
        const numeric = Math.max(1, toNumber(value) || 1);
        const exponent = Math.floor(Math.log10(numeric));
        const magnitude = Math.pow(10, exponent);
        const normalized = numeric / magnitude;
        let nice;
        if (normalized <= 1) nice = 1;
        else if (normalized <= 2) nice = 2;
        else if (normalized <= 2.5) nice = 2.5;
        else if (normalized <= 5) nice = 5;
        else nice = 10;
        return nice * magnitude;
      }

      function niceStepFromTarget(target) {
        const numeric = Math.max(0.000001, toNumber(target) || 0.000001);
        const exponent = Math.floor(Math.log10(numeric));
        const magnitude = Math.pow(10, exponent);
        const normalized = numeric / magnitude;
        let nice;
        if (normalized <= 1) nice = 1;
        else if (normalized <= 1.2) nice = 1.2;
        else if (normalized <= 1.25) nice = 1.25;
        else if (normalized <= 1.5) nice = 1.5;
        else if (normalized <= 2) nice = 2;
        else if (normalized <= 2.5) nice = 2.5;
        else if (normalized <= 3) nice = 3;
        else if (normalized <= 4) nice = 4;
        else if (normalized <= 5) nice = 5;
        else if (normalized <= 6) nice = 6;
        else if (normalized <= 8) nice = 8;
        else nice = 10;
        return nice * magnitude;
      }

      function buildTrendAxisConfig(maxValue) {
        const max = Math.max(1, toNumber(maxValue) || 1);
        if (state.overviewPeriod === '1') {
          if (max <= 1) return { step: 0.25, max: 1.25 };
          if (max <= 2) return { step: 0.5, max: 2.5 };
          if (max <= 5) return { step: 1, max: 5 };
        }
        const step = niceStepFromTarget(max / 5);
        return {
          step: step,
          max: step * 5
        };
      }

      function buildTrendAmountAxisConfig(maxValue) {
        const max = Math.max(1, toNumber(maxValue) || 1);
        if (state.overviewPeriod !== '1' || max <= 5) {
          return buildTrendAxisConfig(maxValue);
        }
        const paddedMax = niceCeil(max * 1.05);
        const step = niceStepFromTarget(paddedMax / 5);
        return {
          step: step,
          max: Math.max(paddedMax, step * 5)
        };
      }

      function formatTrendAmountTick(value) {
        const numeric = toNumber(value);
        if (numeric === null) return '--';
        if (numeric === 0) return '0';
        if (state.overviewPeriod === '1') {
          return formatPlainTick(numeric);
        }
        if (state.overviewPeriod === '30') {
          return (numeric / 1000000) + 'M';
        }
        return formatInteger(Math.round(numeric / 1000)) + 'k';
      }

      function formatPlainTick(value) {
        const numeric = toNumber(value);
        if (numeric === null) return '--';
        if (Math.abs(numeric - Math.round(numeric)) < 1e-9) return String(Math.round(numeric));
        return String(numeric);
      }

      function formatProbabilityTick(value) {
        const numeric = toNumber(value);
        if (numeric === null) return '--';
        if (numeric === 0 || numeric === 1) return String(numeric);
        return numeric.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      }

      function renderChartLegend(items, centerX, y) {
        let cursor = centerX;
        return items.map(function (item) {
          const x = cursor;
          cursor += item.width;
          if (item.type === 'bar') {
            return '<circle cx="' + x + '" cy="' + y + '" r="6.5" fill="' + item.color + '"></circle>' +
              '<text x="' + (x + 14) + '" y="' + (y + 4) + '" fill="#afb4be" font-size="10.5" font-weight="600">' + escapeHtml(item.label) + '</text>';
          }
          return '<line x1="' + (x - 2) + '" y1="' + y + '" x2="' + (x + 10) + '" y2="' + y + '" stroke="' + item.color + '" stroke-width="2.2"></line>' +
            '<circle cx="' + (x + 4) + '" cy="' + y + '" r="4.5" fill="' + item.color + '"></circle>' +
            '<text x="' + (x + 16) + '" y="' + (y + 4) + '" fill="#afb4be" font-size="10.5" font-weight="600">' + escapeHtml(item.label) + '</text>';
        }).join('');
      }

      function destroyChart(key) {
        if (state.charts[key]) {
          state.charts[key].destroy();
          state.charts[key] = null;
        }
      }

      const DASHBOARD_PROTOCOL_ICON_MAP = {
        aave: '/cryptoimg/aave.svg',
        aavev1: '/cryptoimg/aave.svg',
        aavev2: '/cryptoimg/aave.svg',
        aavev3: '/cryptoimg/aave.svg',
        balancer: '/cryptoimg/BAL.svg',
        balancerv2: '/cryptoimg/BAL.svg',
        lido: '/cryptoimg/lido.svg',
        maker: '/cryptoimg/mkr.svg',
        makerdao: '/cryptoimg/mkr.svg',
        uniswap: '/cryptoimg/uni.svg',
        uniswapv2: '/cryptoimg/uni.svg',
        uniswapv3: '/cryptoimg/uni.svg',
        pancake: '/cryptoimg/cake.svg',
        pancakeswap: '/cryptoimg/cake.svg',
        oneinch: '/cryptoimg/1inch.svg',
        '1inch': '/cryptoimg/1inch.svg'
      };

      const DASHBOARD_ASSET_ICON_MAP = {
        '1inch': '/cryptoimg/1inch.svg',
        aave: '/cryptoimg/aave.svg',
        arb: '/cryptoimg/arb.svg',
        avax: '/cryptoimg/avax.svg',
        bal: '/cryptoimg/BAL.svg',
        bat: '/cryptoimg/BAT.svg',
        bch: '/cryptoimg/bch.svg',
        btc: '/cryptoimg/btc.svg',
        cake: '/cryptoimg/cake.svg',
        crvusd: '/cryptoimg/crvUSD_s.svg',
        dai: '/cryptoimg/dai.svg',
        dot: '/cryptoimg/dot.svg',
        enj: '/cryptoimg/ENJ.svg',
        etc: '/cryptoimg/etc.svg',
        eth: '/cryptoimg/eth.svg',
        eusde: '/cryptoimg/eUSDe.svg',
        fei: '/cryptoimg/FEI.svg',
        fil: '/cryptoimg/fil.svg',
        gho: '/cryptoimg/gho.svg',
        link: '/cryptoimg/link.svg',
        ldo: '/cryptoimg/lido.svg',
        ltc: '/cryptoimg/ltc.svg',
        mana: '/cryptoimg/MANA.svg',
        mkr: '/cryptoimg/mkr.svg',
        reth: '/cryptoimg/rETH.svg',
        snx: '/cryptoimg/SNX.svg',
        sol: '/cryptoimg/sol.svg',
        steth: '/cryptoimg/stETH.svg',
        suds: '/cryptoimg/sUSD.svg',
        susd: '/cryptoimg/sUSD.svg',
        sui: '/cryptoimg/sui.svg',
        tusd: '/cryptoimg/TUSD.svg',
        uni: '/cryptoimg/uni.svg',
        usdc: '/cryptoimg/usdc.svg',
        usde: '/cryptoimg/usde.svg',
        usdt: '/cryptoimg/usdt.svg',
        weth: '/cryptoimg/weth.svg',
        wbtc: '/cryptoimg/btc.svg',
        wsteth: '/cryptoimg/wsteth.svg',
        xaut: '/cryptoimg/tether-gold-xaut-logo.svg',
        xmr: '/cryptoimg/xmr.svg',
        xrp: '/cryptoimg/xrp.svg',
        xtz: '/cryptoimg/xtz.svg',
        yfi: '/cryptoimg/YFI.svg',
        zec: '/cryptoimg/zec.svg'
      };

      function normalizeDashboardIconKey(value) {
        return String(value || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
      }

      function protocolIconSrc(name) {
        const normalized = normalizeDashboardIconKey(name);
        if (!normalized) return '';
        if (DASHBOARD_PROTOCOL_ICON_MAP[normalized]) {
          return DASHBOARD_PROTOCOL_ICON_MAP[normalized];
        }
        if (normalized === 'curve') return '/img/curve.png';
        return '';
      }

      function assetIconSrc(symbol) {
        const normalized = normalizeDashboardIconKey(symbol);
        if (!normalized) return '';
        return DASHBOARD_ASSET_ICON_MAP[normalized] || '';
      }
`;
