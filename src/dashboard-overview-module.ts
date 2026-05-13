export const DASHBOARD_OVERVIEW_PAGE = String.raw`
          <section id="pageOverview" class="page active">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="overviewPageTitle" class="page-title">Overview</div>
                  <div id="overviewPageSub" class="page-sub"></div>
                </div>
              </div>
            </div>

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

            <article class="panel">
              <div class="panel-inner">
                <div class="panel-head">
                  <div>
                    <div class="summary-title-row">
                      <div id="overviewNewsTitle" class="panel-title">Latest Intel</div>
                      <div class="info-trigger">
                        <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                        <div id="overviewNewsInfo" class="info-popover">Server-side news and operations updates.</div>
                      </div>
                    </div>
                    <div id="overviewNewsSub" class="panel-sub"></div>
                  </div>
                </div>
                <div id="overviewNewsList" class="overview-news-list"></div>
              </div>
            </article>

            <article class="panel">
              <div class="panel-inner">
                <div class="panel-head">
                  <div>
                    <div class="summary-title-row">
                      <div id="strategyMarketsTitle" class="panel-title">Liquidation Markets</div>
                      <div class="info-trigger">
                        <img class="chart-info-icon" src="/img/info3.svg" alt="info" />
                        <div id="strategyMarketsInfo" class="info-popover">A practical market map for choosing liquidation targets.</div>
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
                        <th id="smSegment">Chain / Mechanism</th>
                        <th id="smPriority">Stage</th>
                        <th id="smStatus">Opportunity</th>
                        <th id="smCompetition">Competition</th>
                        <th id="smNext">Action</th>
                      </tr>
                    </thead>
                    <tbody id="strategyMarketRows"></tbody>
                  </table>
                </div>
              </div>
            </article>
          </section>
`;
