export const DASHBOARD_OVERVIEW_SECTIONS_LOGIC = String.raw`
      function renderEigenphiSummary(overview) {
        const summary = overview && overview.summary && overview.summary.data ? overview.summary.data : null;
        if (!summary) {
          renderSummaryColumns(
            t('summaryLeftRows').map(function (label) { return [label, '--']; }),
            t('summaryRightRows').map(function (label) { return [label, '--']; })
          );
          text('summaryUpdated', '--');
          return;
        }

        renderSummaryColumns(
          [
            [t('summaryLeftRows')[0], formatInteger(summary.txCount)],
            [t('summaryLeftRows')[1], formatUsd(summary.liquidationAmount)],
            [t('summaryLeftRows')[2], formatUsd(summary.profit)],
            [t('summaryLeftRows')[3], formatUsd(summary.cost)]
          ],
          [
            [t('summaryRightRows')[0], formatUsd(summary.revenue)],
            [t('summaryRightRows')[1], formatInteger(summary.liquidatedBorrowerCount)],
            [t('summaryRightRows')[2], formatInteger(summary.liquidatedAssetCount)],
            [t('summaryRightRows')[3], formatInteger(summary.liquidatorCount)]
          ]
        );
        text('summaryUpdated', formatRelativeFromUnix(overview.summary.updateTimestamp));
      }

      function renderEigenphiTrend(overview, options) {
        options = options || {};
        const containerId = options.containerId || 'trendChart';
        const updatedId = options.updatedId || 'trendUpdated';
        const chartKey = options.chartKey || 'trend';
        const amountLabel = options.amountLabel || trendAmountLabel();
        const txLabel = options.txLabel || trendTxLabel();
        const rows = overview && overview.trend && Array.isArray(overview.trend.data) ? overview.trend.data : [];
        if (!rows.length) {
          destroyChart(chartKey);
          html(containerId, chartWatermarkMarkup() + '<div class="chart-empty">' + escapeHtml(t('noTrendData')) + '</div>');
          text(updatedId, '--');
          return;
        }
        const canvasId = chartKey + 'Canvas';
        html(containerId, chartWatermarkMarkup() + '<canvas id="' + canvasId + '"></canvas>');
        text(updatedId, formatRelativeFromUnix(overview.trend && overview.trend.updateTimestamp));
        destroyChart(chartKey);
        const canvas = document.getElementById(canvasId);
        if (!canvas || !window.Chart) return;
        const amountAxis = buildTrendAmountAxisConfig(Math.max(1, ...rows.map(function (row) { return toNumber(row.liquidationAmount) || 0; })));
        const txAxis = buildTrendAxisConfig(Math.max(1, ...rows.map(function (row) { return toNumber(row.liquidationTxCount) || 0; })));
        const barConfig = state.overviewPeriod === '1'
          ? { barThickness: 10, categoryPercentage: 0.5, barPercentage: 0.64 }
          : state.overviewPeriod === '7'
            ? { barThickness: 28, categoryPercentage: 0.88, barPercentage: 0.96 }
            : { barThickness: 10, categoryPercentage: 0.56, barPercentage: 0.52 };
        const trendLegendConfig = state.overviewPeriod === '1'
          ? { boxWidth: 10, boxHeight: 10, padding: 18, fontSize: 10.5 }
          : { boxWidth: 10, boxHeight: 10, padding: 22, fontSize: 10.5 };
        state.charts[chartKey] = new window.Chart(canvas.getContext('2d'), {
          data: {
            labels: buildTrendLabels(rows),
            datasets: [
              {
                type: 'bar',
                label: amountLabel,
                data: rows.map(function (row) { return toNumber(row.liquidationAmount) || 0; }),
                backgroundColor: 'rgba(102,228,155,0.82)',
                borderRadius: 2,
                barThickness: barConfig.barThickness,
                categoryPercentage: barConfig.categoryPercentage,
                barPercentage: barConfig.barPercentage,
                yAxisID: 'y'
              },
              {
                type: 'line',
                label: txLabel,
                data: rows.map(function (row) { return toNumber(row.liquidationTxCount) || 0; }),
                borderColor: '#1798ff',
                backgroundColor: '#1798ff',
                pointBackgroundColor: '#1798ff',
                pointBorderColor: '#1798ff',
                pointRadius: 3.5,
                pointHoverRadius: 7,
                pointHoverBackgroundColor: '#1798ff',
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 3,
                tension: 0.42,
                borderWidth: 2.2,
                yAxisID: 'y1'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
              mode: 'index',
              intersect: false
            },
            layout: {
              padding: { left: 6, right: 8, top: 6, bottom: 0 }
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: '#afb4be',
                  usePointStyle: true,
                  pointStyle: 'circle',
                  generateLabels: function (chart) {
                    return buildLegendLabels(chart);
                  },
                  boxWidth: trendLegendConfig.boxWidth,
                  boxHeight: trendLegendConfig.boxHeight,
                  padding: trendLegendConfig.padding,
                  font: { size: trendLegendConfig.fontSize, weight: '600' }
                }
              },
              tooltip: {
                backgroundColor: 'rgba(248,248,248,0.82)',
                borderColor: 'rgba(102,228,155,0.95)',
                borderWidth: 1.25,
                titleColor: '#171a1f',
                bodyColor: '#171a1f',
                displayColors: true,
                usePointStyle: true,
                boxWidth: 7,
                boxHeight: 7,
                padding: 10,
                bodySpacing: 6,
                titleMarginBottom: 8,
                cornerRadius: 8,
                caretSize: 0,
                caretPadding: 0,
                titleFont: { size: 11.5, weight: '700' },
                bodyFont: { size: 10.5, weight: '500' },
                boxPadding: 4,
                callbacks: {
                  title: function (items) {
                    return formatTrendTooltipDate(rows[items[0].dataIndex].timestamp);
                  },
                  labelColor: function (context) {
                    const isAmount = context.dataset.label === 'Liquidation Amount';
                    return {
                      borderColor: isAmount ? 'rgba(255,255,255,0.92)' : '#1798ff',
                      backgroundColor: isAmount ? 'rgba(102,228,155,0.82)' : '#1798ff',
                      borderWidth: 2,
                      borderRadius: 0
                    };
                  },
                  label: function (context) {
                    if (context.dataset.label === amountLabel) {
                      return amountLabel + ': ' + formatUsd(context.raw);
                    }
                    return txLabel + ': ' + formatInteger(context.raw);
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                border: { color: 'rgba(255,255,255,0.16)' },
                ticks: {
                  color: '#a7acb6',
                  autoSkip: false,
                  maxTicksLimit: state.overviewPeriod === '1' ? 6 : 8,
                  maxRotation: 0,
                  minRotation: 0,
                  font: { size: 10.5 },
                  callback: function (value) {
                    return this.getLabelForValue(value);
                  }
                }
              },
              y: {
                position: 'left',
                beginAtZero: true,
                max: amountAxis.max,
                grid: { display: false },
                border: { color: 'rgba(255,255,255,0.08)' },
                ticks: {
                  color: '#7f8590',
                  stepSize: amountAxis.step,
                  callback: function (value) { return formatTrendAmountTick(value); },
                  font: { size: 10.5 }
                },
                title: {
                  display: true,
                  text: amountLabel,
                  color: '#7d828c',
                  font: { size: 11, weight: '400' }
                }
              },
              y1: {
                position: 'right',
                beginAtZero: true,
                max: txAxis.max,
                grid: { display: false, drawOnChartArea: false },
                border: { display: false },
                ticks: {
                  color: '#1798ff',
                  stepSize: txAxis.step,
                  callback: function (value) { return formatPlainTick(value); },
                  font: { size: 10.5 }
                },
                title: {
                  display: true,
                  text: txLabel,
                  color: '#1798ff',
                  font: { size: 11, weight: '400' }
                }
              }
            }
          }
        });
      }

      function renderEigenphiDistribution(overview, options) {
        options = options || {};
        const containerId = options.containerId || 'distributionChart';
        const updatedId = options.updatedId || 'distributionUpdated';
        const chartKey = options.chartKey || 'distribution';
        const rows = overview && overview.distribution && Array.isArray(overview.distribution.data)
          ? overview.distribution.data
          : [];
        if (!rows.length) {
          destroyChart(chartKey);
          hideChartTooltip(containerId);
          html(containerId, chartWatermarkMarkup() + '<div class="chart-empty">' + escapeHtml(t('noDistributionData')) + '</div>');
          text(updatedId, '--');
          return;
        }

        const totalCount = rows.reduce(function (sum, row) {
          return sum + (toNumber(row.count) || 0);
        }, 0) || 1;
        const canvasId = chartKey + 'Canvas';
        html(containerId, chartWatermarkMarkup() + '<canvas id="' + canvasId + '"></canvas>');
        text(updatedId, formatRelativeFromUnix(overview.distribution && overview.distribution.updateTimestamp));
        destroyChart(chartKey);
        const canvas = document.getElementById(canvasId);
        if (!canvas || !window.Chart) return;
        const distributionBoundaries = buildDistributionBoundaries(rows);
        const distributionBarConfig = state.overviewPeriod === '1'
          ? { categoryPercentage: 1, barPercentage: 1, maxBarThickness: 128 }
          : state.overviewPeriod === '7'
            ? { categoryPercentage: 1, barPercentage: 1, maxBarThickness: 92 }
            : { categoryPercentage: 0.88, barPercentage: 0.88, maxBarThickness: 72 };
        const distributionProbabilities = rows.map(function (row) {
          return (toNumber(row.count) || 0) / totalCount;
        });
        state.charts[chartKey] = new window.Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: distributionBoundaries.map(function (boundary) { return formatDistributionBucket(boundary); }),
            datasets: [
              {
                label: '__distribution-hover__',
                data: rows.map(function () { return 1; }),
                grouped: false,
                borderRadius: 0,
                categoryPercentage: distributionBarConfig.categoryPercentage,
                barPercentage: distributionBarConfig.barPercentage,
                maxBarThickness: distributionBarConfig.maxBarThickness,
                backgroundColor: function (context) {
                  return context.active ? 'rgba(132,138,149,0.48)' : 'rgba(0,0,0,0)';
                },
                borderSkipped: false,
                order: 0
              },
              {
                label: distributionLegendLabel(),
                data: distributionProbabilities,
                borderRadius: 2,
                categoryPercentage: distributionBarConfig.categoryPercentage,
                barPercentage: distributionBarConfig.barPercentage,
                maxBarThickness: distributionBarConfig.maxBarThickness,
                backgroundColor: 'rgba(79,162,255,0.88)',
                order: 1
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
              mode: 'index',
              intersect: true
            },
            layout: {
              padding: { left: 6, right: 8, top: 6, bottom: 0 }
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: '#afb4be',
                  usePointStyle: true,
                  pointStyle: 'circle',
                  generateLabels: function (chart) {
                    return buildLegendLabels(chart);
                  },
                  boxWidth: 10,
                  boxHeight: 10,
                  padding: 22,
                  font: { size: 10.5, weight: '600' }
                }
              },
              tooltip: {
                enabled: false,
                external: function (context) {
                  renderDistributionExternalTooltip(context, containerId, distributionBoundaries);
                },
                filter: function (item) { return !isDistributionHoverDataset(item.dataset.label); },
                backgroundColor: 'rgba(248,248,248,0.82)',
                borderColor: 'rgba(79,162,255,0.92)',
                borderWidth: 1.25,
                titleColor: '#171a1f',
                bodyColor: '#171a1f',
                displayColors: false,
                padding: 10,
                bodySpacing: 6,
                titleMarginBottom: 8,
                cornerRadius: 8,
                caretSize: 0,
                caretPadding: 0,
                titleFont: { size: 11.5, weight: '700' },
                bodyFont: { size: 10.5, weight: '500' },
                boxPadding: 4,
                callbacks: {
                  title: function (items) {
                    return getDistributionTooltipRange(distributionBoundaries, items[0].dataIndex);
                  },
                  label: function (context) {
                    return distributionAxisLabel() + ': ' + formatDistributionProbability(context.raw);
                  }
                }
              }
            },
            scales: {
              x: {
                offset: false,
                grid: { display: false },
                border: { color: 'rgba(255,255,255,0.16)' },
                ticks: {
                  color: '#a7acb6',
                  autoSkip: false,
                  maxRotation: 42,
                  minRotation: 42,
                  font: { size: 10.5 }
                }
              },
              y: {
                position: 'left',
                beginAtZero: true,
                max: 1,
                grid: { display: false },
                border: { color: 'rgba(255,255,255,0.08)' },
                ticks: {
                  color: '#7f8590',
                  stepSize: 0.25,
                  callback: function (value) { return formatProbabilityTick(value); },
                  font: { size: 10.5 }
                },
                title: {
                  display: true,
                  text: distributionAxisLabel(),
                  color: '#7d828c',
                  font: { size: 11, weight: '400' }
                }
              }
            }
          }
        });
      }
`;
