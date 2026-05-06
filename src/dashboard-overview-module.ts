export const DASHBOARD_OVERVIEW_PAGE = String.raw`
          <section id="pageOverview" class="page active">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="overviewPageTitle" class="page-title">Overview</div>
                  <div id="overviewPageSub" class="page-sub"></div>
                </div>
                <div class="topbar-right">
                  <button class="top-pill" type="button" data-period="1">24H</button>
                  <button class="top-pill active" type="button" data-period="7">7D</button>
                  <button class="top-pill" type="button" data-period="30">30D</button>
                </div>
              </div>
            </div>

            <article class="panel summary-card">
              <div class="panel-inner">
                <div class="summary-head">
                  <div class="summary-title-row">
                    <div id="overviewHubTitle" class="panel-title">Market Hub</div>
                    <div class="info-trigger">
                      <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                      <div id="overviewHubInfo" class="info-popover">Aggregate command center for liquidation, flashloan, and Morpho read-only surfaces.</div>
                    </div>
                  </div>
                </div>
                <div class="summary-grid">
                  <div id="overviewHubLeft" class="summary-col"></div>
                  <div id="overviewHubRight" class="summary-col"></div>
                </div>
                <div class="summary-foot">
                  <div id="overviewHubUpdated" class="chart-updated">--</div>
                  <div></div>
                </div>
              </div>
            </article>

            <article class="panel">
              <div class="panel-inner">
                <div class="panel-head">
                  <div>
                    <div class="summary-title-row">
                      <div id="overviewSurfacesTitle" class="panel-title">专题入口</div>
                      <div class="info-trigger">
                        <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                        <div id="overviewSurfacesInfo" class="info-popover">Use the aggregate cards to jump into dedicated liquidation, flashloan, and Morpho pages.</div>
                      </div>
                    </div>
                    <div id="overviewSurfacesSub" class="panel-sub"></div>
                  </div>
                </div>
                <div id="overviewSurfaceCards" class="overview-surface-grid"></div>
              </div>
            </article>

            <div class="chart-grid">
              <article class="panel">
                <div class="panel-inner">
                  <div class="panel-head">
                    <div>
                      <div class="summary-title-row">
                        <div id="overviewLiquidationSnapshotTitle" class="panel-title">Liquidation Snapshot</div>
                        <div class="info-trigger">
                          <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                          <div id="overviewLiquidationSnapshotInfo" class="info-popover">Latest liquidation rows from the dedicated liquidation surface.</div>
                        </div>
                      </div>
                      <div id="overviewLiquidationSnapshotSub" class="panel-sub"></div>
                    </div>
                  </div>
                  <div class="protocol-table-wrap">
                    <table class="protocol-table leaderboard-table">
                      <thead>
                        <tr id="overviewLiquidationSnapshotHeaderRow"></tr>
                      </thead>
                      <tbody id="overviewLiquidationSnapshotRows"></tbody>
                    </table>
                  </div>
                </div>
              </article>

              <article class="panel">
                <div class="panel-inner">
                  <div class="panel-head">
                    <div>
                      <div class="summary-title-row">
                        <div id="overviewFlashloanSnapshotTitle" class="panel-title">Flashloan Snapshot</div>
                        <div class="info-trigger">
                          <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                          <div id="overviewFlashloanSnapshotInfo" class="info-popover">Latest flashloan rows from the dedicated flashloan surface.</div>
                        </div>
                      </div>
                      <div id="overviewFlashloanSnapshotSub" class="panel-sub"></div>
                    </div>
                  </div>
                  <div class="protocol-table-wrap">
                    <table class="protocol-table leaderboard-table">
                      <thead>
                        <tr id="overviewFlashloanSnapshotHeaderRow"></tr>
                      </thead>
                      <tbody id="overviewFlashloanSnapshotRows"></tbody>
                    </table>
                  </div>
                </div>
              </article>
            </div>

            <article class="panel">
              <div class="panel-inner">
                <div class="panel-head">
                  <div>
                    <div class="summary-title-row">
                      <div id="strategyMarketsTitle" class="panel-title">Execution Markets</div>
                      <div class="info-trigger">
                        <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                        <div id="strategyMarketsInfo" class="info-popover">A market radar that separates what is executable now from what should be built next.</div>
                      </div>
                    </div>
                    <div id="strategyMarketsSub" class="panel-sub"></div>
                  </div>
                </div>
                <div class="protocol-table-wrap">
                  <table class="protocol-table protocol-summary-table">
                    <colgroup>
                      <col class="strategy-col-market" />
                      <col class="strategy-col-segment" />
                      <col class="strategy-col-priority" />
                      <col class="strategy-col-status" />
                      <col class="strategy-col-competition" />
                      <col class="strategy-col-next" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th id="smMarket">Market</th>
                        <th id="smSegment">Segment</th>
                        <th id="smPriority">Priority</th>
                        <th id="smStatus">Status</th>
                        <th id="smCompetition">Competition</th>
                        <th id="smNext">Next move</th>
                      </tr>
                    </thead>
                    <tbody id="strategyMarketRows"></tbody>
                  </table>
                </div>
              </div>
            </article>
          </section>
`;
