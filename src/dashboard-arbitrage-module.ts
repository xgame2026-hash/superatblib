export const DASHBOARD_ARBITRAGE_STYLES = String.raw`
      .arb-controls-shell {
        display: grid;
        gap: 12px;
      }

      .arb-workbench {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
        gap: 14px;
        align-items: stretch;
      }

      .arb-left-stack,
      .arb-right-stack {
        display: grid;
        gap: 14px;
        min-width: 0;
      }

      .arb-right-stack {
        grid-template-rows: minmax(0, 1fr);
      }

      .arb-monitor-shell {
        margin-top: 0;
        height: 100%;
      }

      .arb-monitor-shell .console-machine-grid {
        min-height: 84px;
        height: 100%;
      }

      .arb-left-stack .button-grid {
        width: 100%;
        margin-top: 4px !important;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .arb-left-stack .field .field-label {
        display: none;
      }

      .arb-left-stack .field {
        margin-top: 0;
      }

      .arb-left-stack .button-grid .action-button {
        width: 100%;
        min-height: 48px;
        border-radius: 14px;
      }

      .arb-left-stack .button-grid .action-button .action-button-content {
        gap: 10px;
      }

      .arb-left-stack .button-grid .action-button .action-button-label {
        font-size: 15px;
      }

      .arb-left-stack .button-grid .action-button .action-button-icon {
        width: 21px;
        height: 21px;
      }

      .console-summary-strip {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      @media (max-width: 1600px) {
        .arb-workbench,
        .arb-left-stack,
        .arb-right-stack,
        .arb-left-stack .button-grid {
          gap: 12px;
        }

        .arb-monitor-shell .console-machine-grid {
          min-height: 72px;
        }
      }

      @media (max-width: 1180px) {
        .arb-workbench {
          grid-template-columns: 1fr;
        }

        .arb-right-stack {
          grid-template-rows: auto;
        }
      }

      .arbitrage-results-table th:nth-child(4),
      .arbitrage-results-table th:nth-child(5),
      .arbitrage-results-table td:nth-child(4),
      .arbitrage-results-table td:nth-child(5) {
        text-align: right;
      }

      .arbitrage-results-table tbody tr.is-broadcastable td {
        background: rgba(18, 68, 34, 0.24);
      }

      .arbitrage-results-table tbody tr.is-broadcastable:hover td {
        background: rgba(24, 86, 42, 0.32);
      }

      .arbitrage-results-table tbody tr.is-liquidatable td {
        background: rgba(86, 18, 24, 0.36);
      }

      .arbitrage-results-table tbody tr.is-liquidatable:hover td {
        background: rgba(104, 24, 31, 0.44);
      }
`;

export const DASHBOARD_ARBITRAGE_PAGE = String.raw`
          <section id="pageArbitrage" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="arbitragePageTitle" class="page-title">CEX Arbitrage Desk</div>
                  <div id="arbitragePageSub" class="page-sub"></div>
                </div>
              </div>
            </div>

            <div class="console-layout">
              <div class="console-main">
                <article class="panel">
                  <div class="panel-inner console-control">
                    <div class="console-runtime-strip">
                      <div class="console-runtime-metric">
                        <div id="arbAssetLabel" class="console-runtime-label">Scanning Venues</div>
                        <div id="arbAssetValue" class="console-runtime-value">--</div>
                      </div>
                      <div class="console-runtime-metric">
                        <div id="arbRpcUsageLabel" class="console-runtime-label">Tracked Symbols</div>
                        <div id="arbRpcUsageValue" class="console-runtime-value">--</div>
                      </div>
                    </div>
                    <div class="console-decision-card">
                      <div id="arbDecisionLabel" class="console-decision-label">Current Opportunity</div>
                      <div id="arbDecisionValue" class="console-decision-value">--</div>
                      <div id="arbDecisionMeta" class="console-decision-meta">Public paper scanner is ready. API trading comes next.</div>
                    </div>
                    <div class="arb-workbench" style="margin-top: 2px;">
                      <div class="arb-left-stack">
                        <label class="field">
                          <span id="arbScanTitle" class="field-label">Scan Universe</span>
                          <input id="arbTokenInput" type="text" placeholder="BTC/USDT, ETH/USDT, SOL/USDT" />
                        </label>
                        <div class="button-grid" style="margin-top:2px;">
                          <button id="arbActionStart" class="action-button primary" type="button"><span class="action-button-content"><img id="arbActionStartIcon" class="action-button-icon" src="/img/readyStart.svg" alt="" aria-hidden="true" /><span id="arbActionStartLabel" class="action-button-label">启动价差扫描</span></span></button>
                          <button id="arbActionPause" class="action-button" type="button" disabled><span class="action-button-content"><img id="arbActionPauseIcon" class="action-button-icon" src="/img/stop.svg" alt="" aria-hidden="true" /><span id="arbActionPauseLabel" class="action-button-label">暂停监控</span></span></button>
                        </div>
                      </div>

                      <div class="arb-right-stack">
                        <div class="console-machine-shell arb-monitor-shell">
                          <div class="console-machine-grid" id="arbMachineGrid">
                            <div class="console-machine-readout">
                              <span id="arbMachineText" class="console-machine-text">READY FOR SPREAD SCAN</span>
                              <span class="console-machine-caret" aria-hidden="true"></span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>

                <article class="panel terminal-shell">
                  <div class="panel-inner">
                    <div class="terminal-toolbar">
                      <div class="terminal-title-row">
                        <img class="terminal-title-icon" src="/img/console_5.svg" alt="" aria-hidden="true" />
                        <div id="arbTerminalTitle" class="panel-title">Arbitrage Terminal</div>
                      </div>
                      <div class="terminal-toolbar-actions">
                        <button id="arbTerminalExpand" class="terminal-icon-button" type="button" aria-label="Expand" title="Expand"><img src="/img/zoom2.svg" alt="" aria-hidden="true" /></button>
                      </div>
                    </div>
                    <pre id="arbTerminalOutput" class="terminal-output"><span id="arbTerminalOutputText" class="terminal-output-text">$ CEX arbitrage workspace ready
$ 选择策略、交易所和币对后启动扫描</span><span class="terminal-output-caret" aria-hidden="true"></span></pre>
                  </div>
                </article>
              </div>

              <div class="console-side">
                <article class="panel intel-shell">
                  <div class="panel-inner">
                    <div class="panel-body console-results-body">
                      <div class="console-summary-strip">
                        <div class="console-summary-card">
                          <div id="arbSummaryBestLabel" class="console-summary-label">Best Net Spread</div>
                          <div id="arbSummaryBestValue" class="console-summary-value">--</div>
                          <div id="arbSummaryBestMeta" class="console-summary-meta">--</div>
                        </div>
                        <div class="console-summary-card">
                          <div id="arbSummaryRealizedLabel" class="console-summary-label">Paper Notional</div>
                          <div id="arbSummaryRealizedValue" class="console-summary-value">--</div>
                          <div id="arbSummaryRealizedMeta" class="console-summary-meta">--</div>
                        </div>
                        <div class="console-summary-card">
                          <div id="arbSummaryReadyLabel" class="console-summary-label">Live Opportunities</div>
                          <div id="arbSummaryReadyValue" class="console-summary-value">0</div>
                          <div id="arbSummaryReadyMeta" class="console-summary-meta">--</div>
                        </div>
                      </div>
                      <div class="console-results-toolbar">
                        <button id="arbFilterAll" class="console-filter-button is-active" type="button">All</button>
                        <button id="arbFilterPositive" class="console-filter-button" type="button">Executable</button>
                        <button id="arbFilterLiquidatable" class="console-filter-button" type="button">Needs Depth</button>
                        <button id="arbFilterWatch" class="console-filter-button" type="button">Watchlist</button>
                      </div>
                      <div class="table-wrap console-results-table-wrap">
                        <table class="console-results-table arbitrage-results-table">
                          <thead>
                            <tr>
                              <th id="arbThMarket">Symbol</th>
                              <th id="arbThPair">Buy / Sell</th>
                              <th id="arbThHf">Signal</th>
                              <th id="arbThGross">Buy Price</th>
                              <th id="arbThNet">Sell Price</th>
                              <th id="arbThState">Status</th>
                              <th id="arbThAction">Action</th>
                            </tr>
                          </thead>
                          <tbody id="arbOpportunityRows"></tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </section>
`;
