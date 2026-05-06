export const DASHBOARD_FLASHLOAN_PAGE = String.raw`
          <section id="pageFlashloan" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="flashloanPageTitle" class="page-title">Flashloan</div>
                  <div id="flashloanPageSub" class="page-sub"></div>
                </div>
                <div class="topbar-right">
                  <button class="top-pill" type="button" data-flashloan-period="1">24H</button>
                  <button class="top-pill active" type="button" data-flashloan-period="7">7D</button>
                  <button class="top-pill" type="button" data-flashloan-period="30">30D</button>
                </div>
              </div>
            </div>

            <article class="panel market-data-index-card" data-market-index-panel>
              <div class="panel-inner market-data-index-inner">
                <div>
                  <div class="summary-title-row">
                    <div class="panel-title" data-market-index-title>Local Index</div>
                  </div>
                  <div class="panel-sub" data-market-index-sources>--</div>
                </div>
                <div class="market-data-index-metrics">
                  <div class="market-data-index-metric">
                    <div class="tiny" data-market-index-block-label>Latest Block</div>
                    <div class="market-data-index-value" data-market-index-block>--</div>
                  </div>
                  <div class="market-data-index-metric">
                    <div class="tiny" data-market-index-size-label>File Size</div>
                    <div class="market-data-index-value" data-market-index-size>--</div>
                  </div>
                  <div class="market-data-index-metric">
                    <div class="tiny" data-market-index-state-label>Status</div>
                    <div class="market-data-index-value" data-market-index-state>--</div>
                  </div>
                </div>
              </div>
            </article>

            <article class="panel summary-card">
              <div class="panel-inner">
                <div class="summary-head">
                  <div class="summary-title-row">
                    <div id="flashloanSummaryTitle" class="panel-title">Flashloan Summary</div>
                    <div class="info-trigger">
                      <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                      <div id="flashloanSummaryInfo" class="info-popover">Key flashloan metrics for the selected period.</div>
                    </div>
                  </div>
                </div>
                <div class="summary-grid">
                  <div id="flashloanSummaryLeft" class="summary-col"></div>
                  <div id="flashloanSummaryRight" class="summary-col"></div>
                </div>
                <div class="summary-foot">
                  <div id="flashloanSummaryUpdated" class="chart-updated">--</div>
                  <div></div>
                </div>
              </div>
            </article>

            <article class="panel chart-box chart-widget flashloan-trend-panel">
              <div class="panel-inner">
                <div class="chart-widget-head">
                  <div class="chart-title-row">
                    <div id="flashloanTrendTitle" class="panel-title">Flashloan Trend</div>
                    <div class="info-trigger">
                      <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                      <div id="flashloanTrendInfo" class="info-popover">Flashloan amount and transaction count trend for the selected period.</div>
                    </div>
                  </div>
                </div>
                <div class="chart-frame">
                  <div id="flashloanTrendChart" class="chart-stage">
                    <div class="chart-watermark"><img src="/img/bglogo.svg" alt="" aria-hidden="true" /></div>
                  </div>
                </div>
                <div class="chart-widget-foot">
                  <div id="flashloanTrendUpdated" class="chart-updated">--</div>
                  <div></div>
                </div>
              </div>
            </article>

            <div class="chart-grid">
              <article class="panel">
                <div class="panel-inner">
                  <div class="panel-head">
                    <div>
                      <div class="summary-title-row">
                        <div id="flashloanLatestTitle" class="panel-title">Latest Flashloan</div>
                        <div class="info-trigger">
                          <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                          <div id="flashloanLatestInfo" class="info-popover">Newest flashloan transactions from the live collection.</div>
                        </div>
                      </div>
                      <div id="flashloanLatestSub" class="panel-sub"></div>
                    </div>
                  </div>
                  <div class="protocol-table-wrap">
                    <table class="protocol-table leaderboard-table">
                      <thead>
                        <tr id="flashloanLatestHeaderRow"></tr>
                      </thead>
                      <tbody id="flashloanLatestRows"></tbody>
                    </table>
                  </div>
                  <div class="chart-widget-foot">
                    <div id="flashloanLatestUpdated" class="chart-updated">--</div>
                    <div></div>
                  </div>
                </div>
              </article>

              <article class="panel">
                <div class="panel-inner">
                  <div class="panel-head">
                    <div>
                      <div class="summary-title-row">
                        <div id="flashloanTopTitle" class="panel-title">Top Flashloan Transactions</div>
                        <div class="info-trigger">
                          <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                          <div id="flashloanTopInfo" class="info-popover">Largest flashloan bundles in the selected period.</div>
                        </div>
                      </div>
                      <div id="flashloanTopSub" class="panel-sub"></div>
                    </div>
                  </div>
                  <div class="protocol-table-wrap">
                    <table class="protocol-table leaderboard-table">
                      <thead>
                        <tr id="flashloanTopHeaderRow"></tr>
                      </thead>
                      <tbody id="flashloanTopRows"></tbody>
                    </table>
                  </div>
                  <div class="chart-widget-foot">
                    <div id="flashloanTopUpdated" class="chart-updated">--</div>
                    <div></div>
                  </div>
                </div>
              </article>
            </div>

            <article class="panel">
              <div class="panel-inner">
                <div class="panel-head">
                  <div>
                    <div class="summary-title-row">
                      <div id="flashloanProtocolsTitle" class="panel-title">Flashloan Protocols</div>
                      <div class="info-trigger">
                        <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                        <div id="flashloanProtocolsInfo" class="info-popover">Protocols ranked by flashloan amount.</div>
                      </div>
                    </div>
                    <div id="flashloanProtocolsSub" class="panel-sub"></div>
                  </div>
                </div>
                <div class="protocol-table-wrap">
                  <table class="protocol-table protocol-summary-table">
                    <thead>
                      <tr>
                        <th id="fphProtocol">Protocol</th>
                        <th id="fphAmount">Amount</th>
                        <th id="fphFee">Fee</th>
                        <th id="fphFlashloanCount">Flashloan Count</th>
                        <th id="fphTxCount">Tx Count</th>
                        <th id="fphBorrowers">Borrowers</th>
                        <th id="fphAssets">Assets</th>
                      </tr>
                    </thead>
                    <tbody id="flashloanProtocolRows"></tbody>
                  </table>
                </div>
              </div>
            </article>
          </section>
`;

export const DASHBOARD_FLASHLOAN_CONSOLE_PAGE = String.raw`
          <section id="pageFlashloanConsole" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="flashloanConsolePageTitle" class="page-title">Flashloan Console</div>
                  <div id="flashloanConsolePageSub" class="page-sub"></div>
                </div>
              </div>
            </div>

            <div class="flashloan-console-stack">
              <article class="panel flashloan-control-panel">
                <div class="panel-inner">
                  <div class="flashloan-top-grid">
                    <div class="flashloan-summary-strip">
                      <div class="console-summary-card">
                        <div id="flashloanSummaryBestLabel" class="console-summary-label">Total amount</div>
                        <div id="flashloanSummaryBestValue" class="console-summary-value">--</div>
                        <div id="flashloanSummaryBestMeta" class="console-summary-meta">--</div>
                      </div>
                      <div class="console-summary-card">
                        <div id="flashloanSummaryReadyLabel" class="console-summary-label">Tx count</div>
                        <div id="flashloanSummaryReadyValue" class="console-summary-value">0</div>
                        <div id="flashloanSummaryReadyMeta" class="console-summary-meta">--</div>
                      </div>
                      <div class="console-summary-card">
                        <div id="flashloanSummaryBroadcastLabel" class="console-summary-label">Data state</div>
                        <div id="flashloanSummaryBroadcastValue" class="console-summary-value">READ ONLY</div>
                        <div id="flashloanSummaryBroadcastMeta" class="console-summary-meta">--</div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article class="panel intel-shell flashloan-table-panel">
                <div class="panel-inner">
                  <div class="panel-body console-results-body">
                    <div class="console-results-toolbar">
                      <button id="flashloanFilterAll" class="console-filter-button is-active" type="button">All</button>
                      <button id="flashloanFilterExecutable" class="console-filter-button" type="button">Latest</button>
                      <button id="flashloanFilterBlocked" class="console-filter-button" type="button">Top</button>
                      <button id="flashloanFilterWatch" class="console-filter-button" type="button">High fee</button>
                      <div class="flashloan-toolbar-controls">
                        <label class="flashloan-toolbar-field">
                          <span id="flashloanMarketLabel" class="field-label">Period</span>
                          <span class="settings-select-wrap">
                            <select id="flashloanMarketSelect">
                              <option value="1">24H</option>
                              <option value="7" selected>7D</option>
                              <option value="30">30D</option>
                            </select>
                          </span>
                        </label>
                        <label class="flashloan-toolbar-field">
                          <span id="flashloanLookbackLabel" class="field-label">Latest rows</span>
                          <input id="flashloanLookbackInput" type="text" inputmode="numeric" placeholder="10" />
                        </label>
                        <label class="flashloan-toolbar-field">
                          <span id="flashloanLimitLabel" class="field-label">Top rows</span>
                          <input id="flashloanLimitInput" type="text" inputmode="numeric" placeholder="10" />
                        </label>
                      </div>
                    </div>
                    <div class="table-wrap console-results-table-wrap">
                      <table class="console-results-table flashloan-results-table">
                        <colgroup>
                          <col />
                          <col />
                          <col />
                          <col />
                          <col />
                          <col />
                          <col />
                        </colgroup>
                        <thead>
                          <tr>
                            <th id="flashloanThUser">Tx</th>
                            <th id="flashloanThPair">Borrower / Asset</th>
                            <th id="flashloanThSignal">Purpose</th>
                            <th id="flashloanThHf">Amount</th>
                            <th id="flashloanThNet">Fee</th>
                            <th id="flashloanThStatus">Protocol</th>
                            <th id="flashloanThAction">Time / Source</th>
                          </tr>
                        </thead>
                        <tbody id="flashloanOpportunityRows"></tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </section>
`;
