export const DASHBOARD_MORPHO_PAGE = String.raw`
          <section id="pageMorpho" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="morphoPageTitle" class="page-title">Morpho Blue</div>
                  <div id="morphoPageSub" class="page-sub"></div>
                </div>
                <div class="top-pills">
                  <button id="morphoChainEthereum" class="top-pill" type="button">Ethereum</button>
                  <button id="morphoChainBase" class="top-pill" type="button">Base</button>
                </div>
              </div>
            </div>

            <article class="panel">
              <div class="panel-inner">
                <div class="panel-head">
                  <div>
                    <div class="summary-title-row">
                      <div id="morphoBlueTitle" class="panel-title">Morpho Blue Radar</div>
                      <div class="info-trigger">
                        <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                        <div id="morphoBlueInfo" class="info-popover">Starter watchlist for Morpho Blue Ethereum markets, backed by Morpho's official blue-api market and position risk data.</div>
                      </div>
                    </div>
                    <div id="morphoBlueSub" class="panel-sub"></div>
                  </div>
                </div>
                <div class="morpho-market-strip">
                  <div class="morpho-market-card">
                    <div id="morphoBlueMetricMarketsLabel" class="morpho-market-card-label">Tracked markets</div>
                    <div id="morphoBlueMetricMarketsValue" class="morpho-market-card-value">--</div>
                  </div>
                  <div class="morpho-market-card">
                    <div id="morphoBlueMetricLiveLabel" class="morpho-market-card-label">Live markets</div>
                    <div id="morphoBlueMetricLiveValue" class="morpho-market-card-value">--</div>
                  </div>
                  <div class="morpho-market-card">
                    <div id="morphoBlueMetricSupplyLabel" class="morpho-market-card-label">Total supply</div>
                    <div id="morphoBlueMetricSupplyValue" class="morpho-market-card-value">--</div>
                  </div>
                  <div class="morpho-market-card">
                    <div id="morphoBlueMetricBorrowLabel" class="morpho-market-card-label">Total borrow</div>
                    <div id="morphoBlueMetricBorrowValue" class="morpho-market-card-value">--</div>
                  </div>
                  <div class="morpho-market-card">
                    <div id="morphoBlueMetricRiskyLabel" class="morpho-market-card-label">Low-HF positions</div>
                    <div id="morphoBlueMetricRiskyValue" class="morpho-market-card-value">--</div>
                  </div>
                  <div class="morpho-market-card">
                    <div id="morphoBlueMetricNearLabel" class="morpho-market-card-label">Near liquidation</div>
                    <div id="morphoBlueMetricNearValue" class="morpho-market-card-value">--</div>
                  </div>
                  <div class="morpho-market-card">
                    <div id="morphoBlueMetricLiqLabel" class="morpho-market-card-label">Liquidatable</div>
                    <div id="morphoBlueMetricLiqValue" class="morpho-market-card-value">--</div>
                  </div>
                  <div class="morpho-market-card">
                    <div id="morphoBlueMetricRiskBorrowLabel" class="morpho-market-card-label">Low-HF borrow</div>
                    <div id="morphoBlueMetricRiskBorrowValue" class="morpho-market-card-value">--</div>
                  </div>
                </div>
                <div class="protocol-table-wrap">
                  <table class="protocol-table leaderboard-table morpho-market-table">
                    <thead>
                      <tr>
                        <th id="morphoBlueThMarket">Market</th>
                        <th id="morphoBlueThPair">Pair</th>
                        <th id="morphoBlueThLltv">LLTV</th>
                        <th id="morphoBlueThUtilization">Utilization</th>
                        <th id="morphoBlueThBorrow">Borrow</th>
                      </tr>
                    </thead>
                    <tbody id="morphoBlueRows"></tbody>
                  </table>
                </div>
                <div class="morpho-executor-shell">
                  <div class="panel-head morpho-executor-head">
                    <div>
                      <div id="morphoExecutorTitle" class="panel-title">Morpho Executor Skeleton</div>
                      <div id="morphoExecutorSub" class="panel-sub"></div>
                    </div>
                    <div class="morpho-opportunity-toolbar">
                      <button id="morphoExecutorCheckButton" class="console-filter-button" type="button">Run skeleton check</button>
                    </div>
                  </div>
                  <div class="morpho-executor-summary">
                    <span id="morphoExecutorStatusChip" class="strategy-chip status-blue">--</span>
                    <span id="morphoExecutorStatusText" class="morpho-executor-status-text">--</span>
                  </div>
                  <div id="morphoExecutorGaps" class="morpho-blue-disclaimer"></div>
                </div>
                <div class="morpho-opportunity-shell">
                  <div class="panel-head morpho-opportunity-head">
                    <div>
                      <div id="morphoBlueOpportunityTitle" class="panel-title">Read-only Opportunity Watchlist</div>
                      <div id="morphoBlueOpportunitySub" class="panel-sub"></div>
                    </div>
                    <div class="morpho-opportunity-toolbar">
                      <button id="morphoOpportunityViewAll" class="console-filter-button is-active" type="button">All</button>
                      <button id="morphoOpportunityViewLiq" class="console-filter-button" type="button">Liquidatable</button>
                      <button id="morphoOpportunityViewNear" class="console-filter-button" type="button">Near 1.01</button>
                      <button id="morphoOpportunityViewRisky" class="console-filter-button" type="button">Low HF</button>
                      <button id="morphoOpportunityRefresh" class="console-filter-button" type="button">Refresh Window</button>
                    </div>
                  </div>
                  <div class="protocol-table-wrap">
                    <table class="protocol-table leaderboard-table morpho-opportunity-table">
                      <thead>
                        <tr>
                          <th id="morphoBlueOpportunityThMarket">Market</th>
                          <th id="morphoBlueOpportunityThUser">User</th>
                          <th id="morphoBlueOpportunityThSignal">Signal</th>
                          <th id="morphoBlueOpportunityThHf">HF</th>
                          <th id="morphoBlueOpportunityThBorrow">Borrow</th>
                          <th id="morphoBlueOpportunityThGap">To liq</th>
                        </tr>
                      </thead>
                      <tbody id="morphoBlueOpportunityRows"></tbody>
                    </table>
                  </div>
                  <div id="morphoBlueDisclaimer" class="morpho-blue-disclaimer"></div>
                </div>
                <div class="chart-updated" id="morphoBlueUpdated">--</div>
              </div>
            </article>
          </section>
`;
