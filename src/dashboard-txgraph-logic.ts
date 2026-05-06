export const DASHBOARD_TXGRAPH_LOGIC = String.raw`
      function setTxGraphLoadingOverlay(visible) {
        const overlay = document.getElementById('txGraphLoadingOverlay');
        if (!overlay) return;
        overlay.classList.toggle('is-visible', Boolean(visible));
        overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
      }

      async function loadTxGraphData() {
        syncTxGraphFormFromInputs();
        if (!state.txGraph.hash) {
          return;
        }
        state.txGraph.loading = true;
        renderTxGraph();
        try {
          const query = new URLSearchParams();
          query.set('txHash', state.txGraph.hash);
          query.set('chain', state.txGraph.chain);
          if (state.txGraph.rpcUrl) {
            query.set('rpcUrl', state.txGraph.rpcUrl);
          }
          state.txGraph.data = await fetchJson('/api/tx-graph?' + query.toString());
        } catch (error) {
          state.txGraph.data = {
            ok: false,
            error: String(error)
          };
        } finally {
          state.txGraph.loading = false;
          renderTxGraph();
        }
      }

      const TX_GRAPH_ICON_URLS = {
        contract: '/img/setupyellow.svg',
        wallet: '/img/pers.svg',
        token: '/img/around.svg',
        exchange: '/img/Refresh.svg',
        oracle: '/img/setupyellow.svg',
        system: '/img/mapgreen.svg'
      };

      function createTxGraphNodeStats(edges) {
        const stats = {};
        (edges || []).forEach(function (edge) {
          if (!edge || !edge.source || !edge.target) return;
          if (!stats[edge.source]) {
            stats[edge.source] = {
              degree: 0,
              callIn: 0,
              callOut: 0,
              transferIn: 0,
              transferOut: 0,
              referenceIn: 0,
              referenceOut: 0
            };
          }
          if (!stats[edge.target]) {
            stats[edge.target] = {
              degree: 0,
              callIn: 0,
              callOut: 0,
              transferIn: 0,
              transferOut: 0,
              referenceIn: 0,
              referenceOut: 0
            };
          }
          stats[edge.source].degree += 1;
          stats[edge.target].degree += 1;
          if (edge.kind === 'call') {
            stats[edge.source].callOut += 1;
            stats[edge.target].callIn += 1;
            const signal = String(edge.selector || edge.label || '').toLowerCase();
            if (
              signal.includes('swap') ||
              signal.includes('callback') ||
              signal.includes('token0') ||
              signal.includes('token1') ||
              signal.includes('exactoutput')
            ) {
              stats[edge.source].exchangeHint = (stats[edge.source].exchangeHint || 0) + 1;
              stats[edge.target].exchangeHint = (stats[edge.target].exchangeHint || 0) + 1;
            }
            if (
              signal.includes('price') ||
              signal.includes('oracle') ||
              signal.includes('answer') ||
              signal.includes('sentinel') ||
              signal.includes('scaled') ||
              signal.includes('handleaction')
            ) {
              stats[edge.source].oracleHint = (stats[edge.source].oracleHint || 0) + 1;
              stats[edge.target].oracleHint = (stats[edge.target].oracleHint || 0) + 1;
            }
          } else if (edge.kind === 'transfer') {
            stats[edge.source].transferOut += 1;
            stats[edge.target].transferIn += 1;
          } else if (edge.kind === 'reference') {
            stats[edge.source].referenceOut += 1;
            stats[edge.target].referenceIn += 1;
          }
        });
        return stats;
      }

      function txGraphNodeRole(node, stats) {
        const kind = String(node && node.kind || '').toLowerCase();
        if (kind === 'exchange') return 'exchange';
        if (kind === 'token') return 'token';
        if (kind === 'wallet') return 'wallet';
        if (kind === 'system') return 'system';
        return 'contract';
      }

      function txGraphNodeIcon(node, role) {
        if (role === 'exchange') return TX_GRAPH_ICON_URLS.exchange;
        if (role === 'oracle') return TX_GRAPH_ICON_URLS.oracle;
        if (role === 'wallet') return TX_GRAPH_ICON_URLS.wallet;
        if (role === 'system') return TX_GRAPH_ICON_URLS.system;
        if (role === 'token') return TX_GRAPH_ICON_URLS.token;
        return TX_GRAPH_ICON_URLS.contract;
      }

      function txGraphNodeSize(role, stats) {
        const degree = stats && Number.isFinite(stats.degree) ? stats.degree : 0;
        if (role === 'wallet') return Math.min(38, 30 + Math.max(0, degree - 2) * 0.34);
        if (role === 'token') return Math.min(38, 30 + Math.max(0, degree - 2) * 0.34);
        if (role === 'system') return Math.min(35, 28 + Math.max(0, degree - 1) * 0.24);
        if (role === 'exchange') return Math.min(42, 32 + Math.max(0, degree - 2) * 0.42);
        return Math.min(34, 26 + Math.max(0, degree - 1) * 0.24);
      }

      function txGraphCallWeight(edge, degreeMap) {
        const sourceDegree = degreeMap[edge.source] || 1;
        const targetDegree = degreeMap[edge.target] || 1;
        const selector = String(edge.selector || edge.label || '').toLowerCase();
        let weight = 0.95 + Math.max(sourceDegree, targetDegree) * 0.11;
        if (selector.includes('liquidation') || selector.includes('flash') || selector.includes('swap') || selector.includes('callback')) {
          weight += 0.95;
        } else if (selector.includes('balanceof') || selector.includes('latestanswer') || selector.includes('price') || selector.includes('scaled')) {
          weight -= 0.18;
        }
        return Math.max(0.9, Math.min(4.2, weight));
      }

      function txGraphTransferWeight(edge, degreeMap) {
        const amount = Math.abs(Number(edge.amountDisplay || '0'));
        const sourceDegree = degreeMap[edge.source] || 1;
        const targetDegree = degreeMap[edge.target] || 1;
        const weight = 0.7 + Math.log10(amount + 1) * 0.38 + Math.max(sourceDegree, targetDegree) * 0.04;
        return Math.max(0.85, Math.min(3.4, weight));
      }

      function txGraphReferenceWeight() {
        return 0.9;
      }

      function txGraphTooltipContent(raw, kind) {
        const record = raw || {};
        const label = String(record.label || record.selector || record.id || '--');
        const subtitle = kind === 'node'
          ? (record.address || record.subtitle || '')
          : (record.label || '');
        const kindLabel = kind === 'edge'
          ? String(record.kind || 'edge')
          : String(record.kind || 'node');
        return (
          '<div class="txgraph-tooltip-kind">' + escapeHtml(kindLabel) + '</div>' +
          '<div class="txgraph-tooltip-label">' + escapeHtml(label) + '</div>' +
          (subtitle ? '<div class="txgraph-tooltip-subtitle">' + escapeHtml(String(subtitle)) + '</div>' : '')
        );
      }

      function renderTxGraphCy(payload) {
        const container = document.getElementById('txGraphCanvas');
        const tooltip = document.getElementById('txGraphTooltip');
        if (!container || !window.cytoscape) return;
        const payloadNodeSignature = (payload && payload.nodes || []).map(function (node) {
          return [
            node && node.id ? node.id : '',
            node && node.kind ? node.kind : '',
            node && node.label ? node.label : ''
          ].join(':');
        }).join('|');
        const payloadEdgeSignature = (payload && payload.edges || []).map(function (edge) {
          return [
            edge && edge.id ? edge.id : '',
            edge && edge.kind ? edge.kind : '',
            edge && edge.source ? edge.source : '',
            edge && edge.target ? edge.target : '',
            edge && edge.label ? edge.label : ''
          ].join(':');
        }).join('|');
        const renderKey = [
          payload && payload.chain ? payload.chain : '',
          payload && payload.txHash ? payload.txHash : '',
          payloadNodeSignature,
          payloadEdgeSignature
        ].join(':');

        const allowedKinds = [];
        if (state.txGraph.showTransfers) allowedKinds.push('transfer');
        if (state.txGraph.showCalls) allowedKinds.push('call');
        if (state.txGraph.showReferences) allowedKinds.push('reference');
        const fullEdges = payload.edges || [];
        const activeNodeIds = new Set();
        const degreeMap = {};
        const nodeStats = createTxGraphNodeStats(fullEdges);
        fullEdges.forEach(function (edge) {
          activeNodeIds.add(edge.source);
          activeNodeIds.add(edge.target);
          degreeMap[edge.source] = (degreeMap[edge.source] || 0) + 1;
          degreeMap[edge.target] = (degreeMap[edge.target] || 0) + 1;
        });
        const filteredNodes = (payload.nodes || []).filter(function (node) {
          return activeNodeIds.size === 0 || activeNodeIds.has(node.id) || node.kind === 'system';
        });
        const manualPositions = state.txGraph.manualPositions || {};

        const elements = filteredNodes.map(function (node) {
          const stats = nodeStats[node.id] || {};
          const role = txGraphNodeRole(node, stats);
          const element = {
            data: {
              id: node.id,
              label: node && node.label ? node.label : '--',
              subtitle: node.subtitle || '',
              kind: node.kind,
              raw: node,
              role: role,
              icon: txGraphNodeIcon(node, role),
              size: txGraphNodeSize(role, stats)
            },
            classes: 'node-' + node.kind + ' role-' + role
          };
          const savedPosition = manualPositions[node.id];
          if (savedPosition && Number.isFinite(savedPosition.x) && Number.isFinite(savedPosition.y)) {
            element.position = {
              x: savedPosition.x,
              y: savedPosition.y
            };
          }
          return element;
        }).concat(fullEdges.map(function (edge) {
          return {
            data: {
              id: edge.id,
              source: edge.source,
              target: edge.target,
              label: edge.label,
              kind: edge.kind,
              raw: edge,
              weight: edge.kind === 'transfer'
                ? txGraphTransferWeight(edge, degreeMap)
                : edge.kind === 'call'
                  ? txGraphCallWeight(edge, degreeMap)
                  : txGraphReferenceWeight()
            },
            classes: 'edge-' + edge.kind
          };
        }));

        function syncTxGraphEdgeVisibility() {
          if (!state.txGraph.cy) return;
          state.txGraph.cy.edges().forEach(function (edge) {
            const kind = String(edge.data('kind') || '');
            const visible = allowedKinds.includes(kind);
            edge.toggleClass('edge-hidden', !visible);
          });
        }

        function hideTxGraphTooltip() {
          if (!tooltip) return;
          tooltip.classList.remove('is-visible');
          tooltip.innerHTML = '';
        }

        function showTxGraphTooltip(content, renderedPosition) {
          if (!tooltip || !container || !renderedPosition) return;
          tooltip.innerHTML = content;
          const panelRect = container.getBoundingClientRect();
          const tooltipRect = tooltip.getBoundingClientRect();
          const maxLeft = Math.max(12, panelRect.width - tooltipRect.width - 12);
          const maxTop = Math.max(12, panelRect.height - tooltipRect.height - 12);
          const nextLeft = Math.max(12, Math.min(renderedPosition.x + 18, maxLeft));
          const nextTop = Math.max(12, Math.min(renderedPosition.y - (tooltipRect.height / 2), maxTop));
          tooltip.style.left = nextLeft + 'px';
          tooltip.style.top = nextTop + 'px';
          tooltip.classList.add('is-visible');
        }

        function txGraphRenderedPoint(target, fallbackPosition) {
          if (fallbackPosition && Number.isFinite(fallbackPosition.x) && Number.isFinite(fallbackPosition.y)) {
            return fallbackPosition;
          }
          if (target && typeof target.renderedPosition === 'function') {
            const position = target.renderedPosition();
            if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
              return position;
            }
          }
          if (target && typeof target.renderedMidpoint === 'function') {
            const midpoint = target.renderedMidpoint();
            if (midpoint && Number.isFinite(midpoint.x) && Number.isFinite(midpoint.y)) {
              return midpoint;
            }
          }
          return null;
        }

        function rememberAllTxGraphPositions() {
          if (!state.txGraph.cy) return;
          state.txGraph.cy.nodes().forEach(function (node) {
            rememberTxGraphNodePosition(node);
          });
        }

        function clearTxGraphSelectionStyles() {
          if (!state.txGraph.cy) return;
          state.txGraph.cy.elements().removeClass('is-dimmed is-active is-active-node is-active-neighbor');
          state.txGraph.selectedNodeId = '';
          state.txGraph.selectedEdgeId = '';
        }

        function applyTxGraphNodeSelection(node) {
          if (!state.txGraph.cy || !node) return;
          clearTxGraphSelectionStyles();
          const connectedEdges = node.connectedEdges().filter(function (edge) {
            return !edge.hasClass('edge-hidden');
          });
          const neighborhood = node.union(node.neighborhood('node')).union(connectedEdges);
          state.txGraph.cy.elements().difference(neighborhood).addClass('is-dimmed');
          node.addClass('is-active-node');
          node.neighborhood('node').addClass('is-active-neighbor');
          connectedEdges.addClass('is-active');
          state.txGraph.selectedNodeId = node.id();
        }

        function applyTxGraphEdgeSelection(edge) {
          if (!state.txGraph.cy || !edge) return;
          clearTxGraphSelectionStyles();
          const related = edge.connectedNodes().union(edge);
          state.txGraph.cy.elements().difference(related).addClass('is-dimmed');
          edge.addClass('is-active');
          edge.connectedNodes().addClass('is-active-neighbor');
          state.txGraph.selectedEdgeId = edge.id();
        }

        function stopTxGraphLayout() {
          if (state.txGraph.dragPulseTimer) {
            clearTimeout(state.txGraph.dragPulseTimer);
            state.txGraph.dragPulseTimer = null;
          }
          if (state.txGraph.layout && typeof state.txGraph.layout.stop === 'function') {
            try {
              state.txGraph.layout.stop();
            } catch (error) {}
          }
          state.txGraph.layout = null;
        }

        function txGraphFixedConstraints(excludeNodeId) {
          return Object.keys(manualPositions).filter(function (nodeId) {
            if (!nodeId || nodeId === excludeNodeId) return false;
            const position = manualPositions[nodeId];
            return position && Number.isFinite(position.x) && Number.isFinite(position.y);
          }).map(function (nodeId) {
            const position = manualPositions[nodeId];
            return {
              nodeId: nodeId,
              position: {
                x: position.x,
                y: position.y
              }
            };
          });
        }

        function rememberTxGraphNodePosition(node) {
          if (!node || typeof node.id !== 'function') return;
          const position = node.position();
          if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
          state.txGraph.manualPositions[node.id()] = {
            x: position.x,
            y: position.y
          };
        }

        function txGraphLayoutConfig(options) {
          const next = options || {};
          if (window.cytoscapeCola) {
            return {
              name: 'cola',
              animate: next.animate !== undefined ? next.animate : true,
              refresh: 2,
              maxSimulationTime: next.maxSimulationTime || 4200,
              ungrabifyWhileSimulating: false,
              fit: next.fit !== undefined ? next.fit : false,
              padding: next.padding !== undefined ? next.padding : 72,
              randomize: false,
              avoidOverlap: true,
              handleDisconnected: true,
              convergenceThreshold: 0.008,
              centerGraph: next.centerGraph !== undefined ? next.centerGraph : true,
              fixedNodeConstraint: txGraphFixedConstraints(next.excludeNodeId),
              nodeSpacing: function (node) {
                if (node.hasClass('role-exchange')) return 38;
                if (node.hasClass('role-wallet')) return 28;
                if (node.hasClass('role-oracle') || node.hasClass('role-system')) return 26;
                return 24;
              },
              edgeLength: function (edge) {
                const kind = edge.data('kind');
                if (kind === 'call') return 112 + edge.data('weight') * 8;
                if (kind === 'reference') return 170;
                return 128 + edge.data('weight') * 6;
              }
            };
          }
          return {
            name: 'cose',
            animate: true,
            randomize: false,
            fit: next.fit !== undefined ? next.fit : false,
            padding: next.padding !== undefined ? next.padding : 72,
            idealEdgeLength: 160,
            nodeRepulsion: 880000,
            componentSpacing: 96,
            nestingFactor: 0.9,
            gravity: 0.28,
            numIter: 1800,
            initialTemp: 200,
            coolingFactor: 0.95,
            minTemp: 1
          };
        }

        function runTxGraphLayout(options) {
          if (!state.txGraph.cy) return;
          stopTxGraphLayout();
          state.txGraph.layout = state.txGraph.cy.layout(txGraphLayoutConfig(options));
          state.txGraph.layout.run();
        }

        if (state.txGraph.cy && state.txGraph.renderKey === renderKey) {
          syncTxGraphEdgeVisibility();
          return;
        }

        if (!state.txGraph.cy) {
          state.txGraph.cy = window.cytoscape({
            container: container,
            elements: elements,
            style: [
              {
                selector: 'node',
                style: {
                  'shape': 'rectangle',
                  'background-opacity': 0,
                  'background-image': 'data(icon)',
                  'background-fit': 'contain',
                  'background-width': '88%',
                  'background-height': '88%',
                  'background-position-x': '50%',
                  'background-position-y': '50%',
                  'background-repeat': 'no-repeat',
                  'background-clip': 'none',
                  'border-width': 0,
                  'label': 'data(label)',
                  'font-size': 5.2,
                  'font-weight': 500,
                  'color': '#4b5057',
                  'text-wrap': 'wrap',
                  'text-max-width': 160,
                  'text-valign': 'bottom',
                  'text-halign': 'center',
                  'text-margin-y': 10,
                  'text-outline-width': 0.62,
                  'text-outline-color': '#ffffff',
                  'text-outline-opacity': 0.82,
                  'width': 'data(size)',
                  'height': 'data(size)'
                }
              },
              {
                selector: 'node.hovered, node:selected',
                style: {
                  'underlay-color': 'rgba(82, 192, 182, 0.14)',
                  'underlay-shape': 'ellipse',
                  'underlay-padding': 10
                }
              },
              {
                selector: 'node.is-active-node, node.is-active-neighbor',
                style: {
                  'underlay-color': 'rgba(255, 122, 54, 0.12)',
                  'underlay-shape': 'ellipse',
                  'underlay-padding': 12,
                  'opacity': 1
                }
              },
              {
                selector: '.role-exchange',
                style: {
                  'width': 'mapData(size, 30, 38, 30, 38)',
                  'height': 'mapData(size, 30, 38, 30, 38)'
                }
              },
              {
                selector: '.role-asset-token',
                style: {
                  'width': 'mapData(size, 28, 34, 28, 34)',
                  'height': 'mapData(size, 28, 34, 28, 34)'
                }
              },
              {
                selector: '.role-wallet',
                style: {
                  'width': 'mapData(size, 28, 34, 28, 34)',
                  'height': 'mapData(size, 28, 34, 28, 34)'
                }
              },
              {
                selector: '.role-oracle, .role-system',
                style: {
                  'width': 'mapData(size, 24, 31, 24, 31)',
                  'height': 'mapData(size, 24, 31, 24, 31)'
                }
              },
              {
                selector: 'edge',
                style: {
                  'curve-style': 'bezier',
                  'line-cap': 'round',
                  'target-arrow-shape': 'vee',
                  'arrow-scale': 0.82,
                  'width': 'mapData(weight, 0.85, 4.2, 0.85, 2.9)',
                  'line-color': '#bcc3cd',
                  'target-arrow-color': '#bcc3cd',
                  'opacity': 0.72,
                  'label': 'data(label)',
                  'font-size': 4.25,
                  'font-weight': 450,
                  'color': '#646a73',
                  'text-rotation': 'autorotate',
                  'text-margin-y': -1,
                  'text-outline-width': 0.52,
                  'text-outline-color': '#ffffff',
                  'text-outline-opacity': 0.78,
                  'text-background-opacity': 0
                }
              },
              {
                selector: '.edge-transfer',
                style: {
                  'line-color': '#20242b',
                  'target-arrow-color': '#20242b',
                  'opacity': 0.72,
                  'color': '#676d75'
                }
              },
              {
                selector: '.edge-call',
                style: {
                  'line-color': '#74df57',
                  'target-arrow-color': '#74df57',
                  'opacity': 0.8,
                  'color': '#57a844'
                }
              },
              {
                selector: '.edge-reference',
                style: {
                  'line-color': '#5eaef4',
                  'target-arrow-color': '#5eaef4',
                  'line-style': 'dashed',
                  'line-dash-pattern': [4, 4],
                  'opacity': 0.6,
                  'color': '#5b93cb'
                }
              },
              {
                selector: '.edge-hidden',
                style: {
                  'opacity': 0,
                  'text-opacity': 0,
                  'overlay-opacity': 0,
                  'underlay-opacity': 0
                }
              },
              {
                selector: '.is-dimmed',
                style: {
                  'opacity': 0.2
                }
              },
              {
                selector: 'edge.is-active',
                style: {
                  'line-color': '#ff6f3c',
                  'target-arrow-color': '#ff6f3c',
                  'color': '#c95b2e',
                  'opacity': 0.96,
                  'width': 'mapData(weight, 0.85, 4.2, 1.7, 5.4)',
                  'arrow-scale': 1.02,
                  'z-index': 999
                }
              }
            ],
            layout: txGraphLayoutConfig({
              fit: true,
              centerGraph: true,
              maxSimulationTime: 3800,
              nodeCount: filteredNodes.length
            })
          });
          syncTxGraphEdgeVisibility();

          state.txGraph.cy.on('tap', 'node', function (event) {
            applyTxGraphNodeSelection(event.target);
            text('txGraphDetail', JSON.stringify(event.target.data('raw'), null, 2));
          });
          state.txGraph.cy.on('tap', 'edge', function (event) {
            if (event.target.hasClass('edge-hidden')) return;
            applyTxGraphEdgeSelection(event.target);
            text('txGraphDetail', JSON.stringify(event.target.data('raw'), null, 2));
          });
          state.txGraph.cy.on('tap', function (event) {
            if (event.target === state.txGraph.cy) {
              clearTxGraphSelectionStyles();
              text('txGraphDetail', '--');
              hideTxGraphTooltip();
            }
          });
          state.txGraph.cy.on('mouseover', 'node', function (event) {
            event.target.addClass('hovered');
            showTxGraphTooltip(txGraphTooltipContent(event.target.data('raw'), 'node'), txGraphRenderedPoint(event.target, event.renderedPosition));
          });
          state.txGraph.cy.on('mouseout', 'node', function (event) {
            event.target.removeClass('hovered');
            hideTxGraphTooltip();
          });
          state.txGraph.cy.on('mouseover', 'edge', function (event) {
            if (event.target.hasClass('edge-hidden')) return;
            showTxGraphTooltip(txGraphTooltipContent(event.target.data('raw'), 'edge'), txGraphRenderedPoint(event.target, event.renderedPosition));
          });
          state.txGraph.cy.on('mouseout', 'edge', function () {
            hideTxGraphTooltip();
          });
          state.txGraph.cy.on('grab', 'node', function (event) {
            hideTxGraphTooltip();
            stopTxGraphLayout();
            applyTxGraphNodeSelection(event.target);
            runTxGraphLayout({
              fit: false,
              centerGraph: false,
              animate: true,
              maxSimulationTime: 4800,
              padding: 72,
              excludeNodeId: event.target.id(),
              nodeCount: filteredNodes.length
            });
          });
          state.txGraph.cy.on('free', 'node', function (event) {
            rememberTxGraphNodePosition(event.target);
            rememberAllTxGraphPositions();
            stopTxGraphLayout();
            applyTxGraphNodeSelection(event.target);
          });
        } else {
          stopTxGraphLayout();
          hideTxGraphTooltip();
          state.txGraph.cy.elements().remove();
          state.txGraph.cy.add(elements);
          syncTxGraphEdgeVisibility();
          runTxGraphLayout({
            fit: true,
            centerGraph: true,
            maxSimulationTime: 3800,
            nodeCount: filteredNodes.length
          });
        }
        state.txGraph.renderKey = renderKey;
      }

      function txExplorerBaseUrl(chain) {
        const normalized = String(chain || '').trim().toLowerCase();
        if (normalized === 'bnb' || normalized === 'bsc') return 'https://bscscan.com/tx/';
        if (normalized === 'polygon') return 'https://polygonscan.com/tx/';
        if (normalized === 'arbitrum' || normalized === 'arb') return 'https://arbiscan.io/tx/';
        return 'https://etherscan.io/tx/';
      }

      function txGraphChainLabel(chain) {
        const normalized = String(chain || '').trim().toLowerCase();
        if (normalized === 'bnb' || normalized === 'bsc') return 'BNB Chain';
        if (normalized === 'arbitrum' || normalized === 'arb') return 'Arbitrum';
        if (normalized === 'polygon') return 'Polygon';
        if (normalized === 'ethereum') return 'Ethereum';
        return String(chain || '--');
      }

      function setTxGraphSummaryHashLink(hash, chain) {
        const normalizedHash = String(hash || '').trim();
        if (!normalizedHash) {
          text('txGraphSummaryHash', '--');
          return;
        }
        const href = txExplorerBaseUrl(chain) + encodeURIComponent(normalizedHash);
        html(
          'txGraphSummaryHash',
          '<a id="txGraphSummaryHashLink" href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer noopener">' + escapeHtml(normalizedHash) + '</a>'
        );
        const link = document.getElementById('txGraphSummaryHashLink');
        if (link) {
          link.addEventListener('click', function (event) {
            event.preventDefault();
            try {
              window.open(href, '_blank', 'noopener,noreferrer');
            } catch (_error) {
              window.location.href = href;
            }
          });
        }
      }

      function renderTxGraph() {
        applyTxGraphFormToInputs();

        const payload = state.txGraph.data;
        setTxGraphSummaryHashLink(state.txGraph.hash, state.txGraph.chain);
        text('txGraphSummaryChain', txGraphChainLabel(state.txGraph.chain || '--'));
        text('txGraphLoadingText', t('txGraphLoading'));

        if (state.txGraph.loading) {
          setTxGraphLoadingOverlay(true);
          text('txGraphSummaryTransfers', '0');
          text('txGraphSummaryCalls', '0');
          text('txGraphSummaryRefs', '0');
          text('txGraphSummaryTrace', '--');
          return;
        }

        setTxGraphLoadingOverlay(false);

        if (!payload) {
          if (state.txGraph.dragPulseTimer) {
            clearTimeout(state.txGraph.dragPulseTimer);
            state.txGraph.dragPulseTimer = null;
          }
          if (state.txGraph.layout && typeof state.txGraph.layout.stop === 'function') {
            try {
              state.txGraph.layout.stop();
            } catch (error) {}
            state.txGraph.layout = null;
          }
          if (state.txGraph.cy) {
            state.txGraph.cy.destroy();
            state.txGraph.cy = null;
          }
          state.txGraph.renderKey = '';
          html('txGraphCanvas', '<div class="txgraph-empty">' + escapeHtml(t('txGraphEmpty')) + '</div>');
          text('txGraphSummaryTransfers', '0');
          text('txGraphSummaryCalls', '0');
          text('txGraphSummaryRefs', '0');
          text('txGraphSummaryTrace', '--');
          return;
        }

        if (!payload.ok) {
          if (state.txGraph.dragPulseTimer) {
            clearTimeout(state.txGraph.dragPulseTimer);
            state.txGraph.dragPulseTimer = null;
          }
          if (state.txGraph.layout && typeof state.txGraph.layout.stop === 'function') {
            try {
              state.txGraph.layout.stop();
            } catch (error) {}
            state.txGraph.layout = null;
          }
          html('txGraphCanvas', '<div class="txgraph-empty">' + escapeHtml((payload.error || t('txGraphFailed'))) + '</div>');
          text('txGraphSummaryTransfers', '0');
          text('txGraphSummaryCalls', '0');
          text('txGraphSummaryRefs', '0');
          text('txGraphSummaryTrace', '--');
          text('txGraphDetail', payload.error || '--');
          if (state.txGraph.cy) {
            state.txGraph.cy.destroy();
            state.txGraph.cy = null;
          }
          state.txGraph.renderKey = '';
          return;
        }

        setTxGraphSummaryHashLink(payload.txHash, payload.chain || state.txGraph.chain);
        text('txGraphSummaryChain', txGraphChainLabel(payload.chain || state.txGraph.chain || '--'));
        text('txGraphSummaryTransfers', String(payload.summary && payload.summary.transferCount ? payload.summary.transferCount : 0));
        text('txGraphSummaryCalls', String(payload.summary && payload.summary.callCount ? payload.summary.callCount : 0));
        text('txGraphSummaryRefs', String(payload.summary && payload.summary.referenceCount ? payload.summary.referenceCount : 0));
        text('txGraphSummaryTrace', payload.traceAvailable ? t('txGraphTraceAvailable') : t('txGraphTraceUnavailable'));
        const payloadKey = [payload.chain || '', payload.txHash || ''].join(':');
        if (payloadKey !== state.txGraph.graphKey) {
          state.txGraph.graphKey = payloadKey;
          state.txGraph.manualPositions = {};
          state.txGraph.renderKey = '';
        }

        const container = document.getElementById('txGraphCanvas');
        if (container && !state.txGraph.cy) {
          container.innerHTML = '';
        }
        renderTxGraphCy(payload);
      }
`;
