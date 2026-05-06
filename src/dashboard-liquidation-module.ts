export const DASHBOARD_LIQUIDATION_PAGE = String.raw`
          <section id="pageLiquidation" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="liquidationPageTitle" class="page-title">Liquidation</div>
                  <div id="liquidationPageSub" class="page-sub"></div>
                </div>
                <div class="topbar-right">
                  <button class="top-pill" type="button" data-period="1">24H</button>
                  <button class="top-pill active" type="button" data-period="7">7D</button>
                  <button class="top-pill" type="button" data-period="30">30D</button>
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
                    <div id="summaryTitle" class="panel-title">Summary</div>
                    <div class="info-trigger">
                      <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                      <div id="summaryInfo" class="info-popover">Key metrics of DeFi liquidation market in the past 24H/7D/30D.</div>
                    </div>
                  </div>
                </div>
                <div class="summary-grid">
                  <div id="summaryLeft" class="summary-col"></div>
                  <div id="summaryRight" class="summary-col"></div>
                </div>
                <div class="summary-foot">
                  <div id="summaryUpdated" class="chart-updated">--</div>
                  <div></div>
                </div>
              </div>
            </article>

            <div class="chart-grid">
              <article class="panel chart-box chart-widget">
                <div class="panel-inner">
                  <div class="chart-widget-head">
                    <div class="chart-title-row">
                      <div id="trendTitle" class="panel-title">Trend</div>
                      <div class="info-trigger">
                        <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                        <div id="trendInfo" class="info-popover">Liquidation Amount/Transaction Count trend with time in the past 24H/7D/30D based on UTC.</div>
                      </div>
                    </div>
                    <button id="trendExpandButton" class="chart-expand-button chart-expand-icon" type="button" aria-label="Expand trend"><img src="/img/zoom.svg" alt="zoom" /></button>
                  </div>
                  <div class="chart-frame">
                    <div id="trendChart" class="chart-stage">
                      <div class="chart-watermark"><img src="/img/bglogo.svg" alt="" aria-hidden="true" /></div>
                    </div>
                  </div>
                  <div class="chart-widget-foot">
                    <div id="trendUpdated" class="chart-updated">--</div>
                    <div></div>
                  </div>
                </div>
              </article>

              <article class="panel chart-box chart-widget">
                <div class="panel-inner">
                  <div class="chart-widget-head">
                    <div class="chart-title-row">
                      <div id="distributionTitle" class="panel-title">Profit Distribution</div>
                      <div class="info-trigger">
                        <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                        <div id="distributionInfo" class="info-popover">The distribution of liquidation transactions' profits in the past 24H/7D/30D.</div>
                      </div>
                    </div>
                    <button id="distributionExpandButton" class="chart-expand-button chart-expand-icon" type="button" aria-label="Expand distribution"><img src="/img/zoom.svg" alt="zoom" /></button>
                  </div>
                  <div class="chart-frame">
                    <div id="distributionChart" class="chart-stage">
                      <div class="chart-watermark"><img src="/img/bglogo.svg" alt="" aria-hidden="true" /></div>
                    </div>
                  </div>
                  <div class="chart-widget-foot">
                    <div id="distributionUpdated" class="chart-updated">--</div>
                    <div id="distributionFootnote">*PDF: Probability Density Function</div>
                  </div>
                </div>
              </article>
            </div>

            <article class="panel latest-liquidation-shell">
              <div class="panel-inner latest-liquidation-panel">
                <div class="panel-head" style="padding:0; margin-bottom:0;">
                  <div class="summary-title-row">
                    <div id="latestLiquidationTitle" class="panel-title">Latest Liquidation</div>
                    <div class="info-trigger">
                      <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                      <div id="latestLiquidationInfo" class="info-popover">A list of real-time liquidation transactions with all details.</div>
                    </div>
                  </div>
                </div>
                <div class="latest-liquidation-toolbar">
                  <div class="latest-liquidation-toolbar-left">
                    <div id="latestLiquidationDateWrap" class="latest-date-control">
                      <img class="latest-date-icon" src="/img/date.svg" alt="" aria-hidden="true" />
                      <input id="latestLiquidationDate" class="latest-date-input" type="text" readonly data-empty="1" aria-haspopup="dialog" aria-expanded="false" />
                      <span id="latestLiquidationDatePlaceholder" class="latest-date-placeholder">Pick date</span>
                      <button id="latestLiquidationDateClear" class="latest-date-clear" type="button" aria-label="Clear date">×</button>
                      <div id="latestLiquidationDatePicker" class="latest-date-picker" hidden>
                        <div class="latest-date-picker-head">
                          <button id="latestLiquidationDatePrev" class="latest-date-picker-nav" type="button" aria-label="Previous month">‹</button>
                          <div id="latestLiquidationDateTitle" class="latest-date-picker-title">April 2026</div>
                          <button id="latestLiquidationDateNext" class="latest-date-picker-nav is-next" type="button" aria-label="Next month">›</button>
                        </div>
                        <div id="latestLiquidationDateWeekdays" class="latest-date-picker-weekdays"></div>
                        <div id="latestLiquidationDateGrid" class="latest-date-picker-grid"></div>
                      </div>
                    </div>
                  </div>
                  <div class="latest-liquidation-toolbar-right">
                    <div class="latest-unit-toggle" role="tablist" aria-label="Latest liquidation unit">
                      <button id="latestLiquidationUnitQuantity" class="latest-unit-button" type="button" data-unit="quantity">Quantity</button>
                      <button id="latestLiquidationUnitUsd" class="latest-unit-button active" type="button" data-unit="usd">USD</button>
                    </div>
                  </div>
                </div>
                <div class="protocol-table-wrap">
                  <table class="protocol-table leaderboard-table latest-liquidation-table">
                    <thead>
                      <tr id="latestLiquidationHeaderRow"></tr>
                    </thead>
                    <tbody id="latestLiquidationRows"></tbody>
                  </table>
                </div>
                <div class="latest-liquidation-foot">
                  <div id="latestLiquidationUpdated" class="chart-updated">--</div>
                  <div class="latest-liquidation-pagination">
                    <div class="latest-page-size-wrap">
                      <span class="latest-page-size-label">
                        <span class="info-trigger">
                          <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                          <span id="latestLiquidationItemsPerPageInfo" class="info-popover">Some transactions contain 2 or more liquidations.</span>
                        </span>
                        <span id="latestLiquidationItemsPerPageLabel">items per page:</span>
                      </span>
                      <span class="latest-page-size-select-wrap">
                        <select id="latestLiquidationPageSize" class="latest-page-size-select">
                          <option value="10">10</option>
                          <option value="20">20</option>
                          <option value="50">50</option>
                        </select>
                      </span>
                    </div>
                    <span id="latestLiquidationRange" class="latest-range">0 - 0</span>
                    <button id="latestLiquidationPrev" class="latest-page-button" type="button" aria-label="Previous">‹</button>
                    <button id="latestLiquidationNext" class="latest-page-button is-ghost" type="button" aria-label="Next">›</button>
                  </div>
                </div>
              </div>
            </article>

            <article class="panel">
              <div class="panel-inner leaderboard-panel">
                <div class="leaderboard-head">
                  <div class="summary-title-row">
                    <div id="leaderboardTitle" class="panel-title">Liquidation Leaderboard</div>
                    <div class="info-trigger">
                      <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                      <div id="leaderboardInfo" class="info-popover">Top liquidation entries ranked by period. Switch tabs to inspect tx profit, liquidations, liquidators, liquidated assets, and liquidated borrowers.</div>
                    </div>
                  </div>
                </div>
                <div class="leaderboard-tabs">
                  <button id="leaderboardTabTxProfit" class="leaderboard-tab active" type="button" data-tab="txProfit">Tx Profit <span class="info-trigger"><img class="chart-info-icon" src="/img/info3.svg" alt="info" /><span id="leaderboardTabTxProfitInfo" class="info-popover">Transactions ranked by profit in the selected period.</span></span></button>
                  <button id="leaderboardTabLiquidations" class="leaderboard-tab" type="button" data-tab="liquidations">Liquidations <span class="info-trigger"><img class="chart-info-icon" src="/img/info3.svg" alt="info" /><span id="leaderboardTabLiquidationsInfo" class="info-popover">Liquidation entries in the selected period.</span></span></button>
                  <button id="leaderboardTabLiquidators" class="leaderboard-tab" type="button" data-tab="liquidators">Liquidators <span class="info-trigger"><img class="chart-info-icon" src="/img/info3.svg" alt="info" /><span id="leaderboardTabLiquidatorsInfo" class="info-popover">Addresses aggregated by liquidation profit.</span></span></button>
                  <button id="leaderboardTabAssets" class="leaderboard-tab" type="button" data-tab="liquidatedAssets">Liquidated Assets <span class="info-trigger"><img class="chart-info-icon" src="/img/info3.svg" alt="info" /><span id="leaderboardTabAssetsInfo" class="info-popover">Assets aggregated by liquidation activity.</span></span></button>
                  <button id="leaderboardTabBorrowers" class="leaderboard-tab" type="button" data-tab="liquidatedBorrowers">Liquidated Borrowers <span class="info-trigger"><img class="chart-info-icon" src="/img/info3.svg" alt="info" /><span id="leaderboardTabBorrowersInfo" class="info-popover">Borrowers aggregated from liquidation entries.</span></span></button>
                </div>
                <div class="leaderboard-table-wrap">
                  <div class="protocol-table-wrap">
                    <table class="protocol-table leaderboard-table">
                      <thead>
                        <tr id="leaderboardHeaderRow"></tr>
                      </thead>
                      <tbody id="leaderboardRows"></tbody>
                    </table>
                  </div>
                </div>
              </div>
            </article>

            <article class="panel">
              <div class="panel-inner">
                <div class="panel-head">
                  <div>
                    <div class="summary-title-row">
                      <div id="protocolsTitle" class="panel-title">Protocols</div>
                      <div class="info-trigger">
                        <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                        <div id="protocolsInfo" class="info-popover">Top protocols ranked by liquidation amount in the past 24H/7D/30D. Click the protocol to find out the liquidation details of this protocol.</div>
                      </div>
                    </div>
                    <div id="protocolsSub" class="panel-sub"></div>
                  </div>
                </div>
                <div class="protocol-table-wrap">
                  <table class="protocol-table protocol-summary-table">
                    <thead>
                      <tr>
                        <th id="phProtocol">Protocol</th>
                        <th id="phChain">Liquidation Amount</th>
                        <th id="phWallet">Liquidation Tx Count</th>
                        <th id="phRpcs"># of Liquidator</th>
                        <th id="phTargets"># of Liquidated Borrower</th>
                        <th id="phProfit"># of Liquidated Asset</th>
                      </tr>
                    </thead>
                    <tbody id="protocolRows"></tbody>
                  </table>
                </div>
              </div>
            </article>
          </section>
`;
