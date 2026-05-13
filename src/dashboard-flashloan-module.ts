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
