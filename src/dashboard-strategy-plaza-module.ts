export const DASHBOARD_STRATEGY_PLAZA_STYLES = String.raw`
      .strategy-plaza-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.18fr) minmax(320px, 0.82fr);
        gap: 16px;
      }

      .strategy-plaza-hero {
        display: grid;
        grid-template-columns: 54px minmax(0, 1fr);
        gap: 14px;
        align-items: center;
        padding: 18px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.08);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018)),
          rgba(255,255,255,0.025);
      }

      .strategy-plaza-icon {
        width: 54px;
        height: 54px;
        border-radius: 8px;
        border: 1px solid rgba(138,125,255,0.36);
        background: rgba(138,125,255,0.12);
        display: grid;
        place-items: center;
      }

      .strategy-plaza-icon img {
        width: 28px;
        height: 28px;
        filter: brightness(0) saturate(100%) invert(68%) sepia(28%) saturate(1615%) hue-rotate(208deg) brightness(103%) contrast(102%);
      }

      .strategy-plaza-title {
        font-size: 18px;
        line-height: 1.2;
        font-weight: 720;
        color: #f3f6ff;
      }

      .strategy-plaza-sub {
        margin-top: 6px;
        font-size: 12.5px;
        line-height: 1.5;
        color: #9ca5b3;
        max-width: 760px;
      }

      .strategy-category-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }

      .strategy-category-card {
        min-height: 150px;
        display: grid;
        align-content: start;
        gap: 10px;
        padding: 14px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.028);
      }

      .strategy-category-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .strategy-category-name {
        font-size: 14px;
        line-height: 1.2;
        font-weight: 700;
        color: #f3f6ff;
      }

      .strategy-category-count {
        flex: 0 0 auto;
        min-width: 34px;
        height: 22px;
        padding: 0 8px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        color: #8a7dff;
        background: rgba(138,125,255,0.12);
        border: 1px solid rgba(138,125,255,0.24);
      }

      .strategy-category-desc {
        font-size: 12px;
        line-height: 1.5;
        color: #9ca5b3;
      }

      .strategy-category-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .strategy-category-tag {
        padding: 4px 7px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        color: #c4c9d4;
        font-size: 11px;
        line-height: 1.2;
      }

      .strategy-plaza-side {
        display: grid;
        gap: 16px;
      }

      .strategy-status-list {
        display: grid;
        gap: 10px;
      }

      .strategy-status-row {
        display: grid;
        grid-template-columns: 10px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        padding: 10px 0;
        border-top: 1px solid rgba(255,255,255,0.07);
      }

      .strategy-status-row:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .strategy-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #8a7dff;
      }

      .strategy-status-dot.is-live {
        background: #69f0ae;
      }

      .strategy-status-dot.is-build {
        background: #ffd166;
      }

      .strategy-status-main {
        min-width: 0;
      }

      .strategy-status-name {
        font-size: 12.5px;
        font-weight: 700;
        color: #f3f6ff;
      }

      .strategy-status-sub {
        margin-top: 3px;
        font-size: 11.5px;
        line-height: 1.35;
        color: #9ca5b3;
      }

      .strategy-status-pill {
        padding: 4px 8px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.08);
        color: #c4c9d4;
        font-size: 11px;
        white-space: nowrap;
      }

      .strategy-plaza-table {
        width: 100%;
        border-collapse: collapse;
      }

      .strategy-plaza-table th,
      .strategy-plaza-table td {
        padding: 10px 8px;
        border-top: 1px solid rgba(255,255,255,0.07);
        text-align: left;
        vertical-align: top;
      }

      .strategy-plaza-table th {
        color: #8e94a4;
        font-size: 10.5px;
        line-height: 1.2;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .strategy-plaza-table td {
        color: #f3f6ff;
        font-size: 12px;
        line-height: 1.4;
      }

      .strategy-plaza-table td.strategy-muted {
        color: #9ca5b3;
      }

      @media (max-width: 1120px) {
        .strategy-plaza-layout {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 760px) {
        .strategy-category-grid {
          grid-template-columns: 1fr;
        }

        .strategy-plaza-hero {
          grid-template-columns: 1fr;
        }
      }
`;

export const DASHBOARD_STRATEGY_PLAZA_PAGE = String.raw`
          <section id="pageStrategyPlaza" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div class="page-title">策略广场</div>
                  <div class="page-sub">按市场、资金模式和执行成熟度整理策略，后续接入可配置策略模板。</div>
                </div>
              </div>
            </div>

            <div class="strategy-plaza-layout">
              <main class="panel">
                <div class="panel-inner">
                  <div class="strategy-plaza-hero">
                    <div class="strategy-plaza-icon">
                      <img src="/img/ai.svg" alt="" aria-hidden="true" />
                    </div>
                    <div>
                      <div class="strategy-plaza-title">策略目录</div>
                      <div class="strategy-plaza-sub">把清算、闪电贷、跨所价差、Morpho、资金管理等策略分层管理。当前页先作为策略入口和状态面板，避免把不同执行风险混在一个控制台里。</div>
                    </div>
                  </div>

                  <div class="strategy-category-grid">
                    <article class="strategy-category-card">
                      <div class="strategy-category-head">
                        <div class="strategy-category-name">清算策略</div>
                        <div class="strategy-category-count">4</div>
                      </div>
                      <div class="strategy-category-desc">Aave / Spark / 多链池子型市场，按健康因子、粗净利和 gas 闸门排序。</div>
                      <div class="strategy-category-meta">
                        <span class="strategy-category-tag">Aave V3</span>
                        <span class="strategy-category-tag">Spark</span>
                        <span class="strategy-category-tag">Self-funded</span>
                      </div>
                    </article>

                    <article class="strategy-category-card">
                      <div class="strategy-category-head">
                        <div class="strategy-category-name">闪电贷组合</div>
                        <div class="strategy-category-count">3</div>
                      </div>
                      <div class="strategy-category-desc">从借入、换币、偿还到利润门槛的组合路径，适合标准化执行脚本。</div>
                      <div class="strategy-category-meta">
                        <span class="strategy-category-tag">Aave Flashloan</span>
                        <span class="strategy-category-tag">0x Route</span>
                      </div>
                    </article>

                    <article class="strategy-category-card">
                      <div class="strategy-category-head">
                        <div class="strategy-category-name">跨市场价差</div>
                        <div class="strategy-category-count">5</div>
                      </div>
                      <div class="strategy-category-desc">中心化交易所与链上流动性之间的价差观察，先保留 paper scan，再推进真实下单。</div>
                      <div class="strategy-category-meta">
                        <span class="strategy-category-tag">Binance</span>
                        <span class="strategy-category-tag">OKX</span>
                        <span class="strategy-category-tag">On-chain</span>
                      </div>
                    </article>

                    <article class="strategy-category-card">
                      <div class="strategy-category-head">
                        <div class="strategy-category-name">隔离市场</div>
                        <div class="strategy-category-count">2</div>
                      </div>
                      <div class="strategy-category-desc">Morpho Blue 等隔离借贷市场，单独跟踪 oracle、抵押品深度和 unwind 路径。</div>
                      <div class="strategy-category-meta">
                        <span class="strategy-category-tag">Morpho</span>
                        <span class="strategy-category-tag">Base</span>
                      </div>
                    </article>
                  </div>
                </div>
              </main>

              <aside class="strategy-plaza-side">
                <section class="panel">
                  <div class="panel-inner">
                    <div class="panel-head">
                      <div>
                        <div class="panel-title">执行状态</div>
                        <div class="panel-sub">把可运行、构建中和观察策略分开。</div>
                      </div>
                    </div>
                    <div class="strategy-status-list">
                      <div class="strategy-status-row">
                        <span class="strategy-status-dot is-live"></span>
                        <div class="strategy-status-main">
                          <div class="strategy-status-name">Aave V3 清算</div>
                          <div class="strategy-status-sub">当前主执行路径，支持多链资产预检。</div>
                        </div>
                        <span class="strategy-status-pill">Live</span>
                      </div>
                      <div class="strategy-status-row">
                        <span class="strategy-status-dot is-build"></span>
                        <div class="strategy-status-main">
                          <div class="strategy-status-name">Morpho Blue</div>
                          <div class="strategy-status-sub">已接入分析面，执行路径继续隔离验证。</div>
                        </div>
                        <span class="strategy-status-pill">Build</span>
                      </div>
                      <div class="strategy-status-row">
                        <span class="strategy-status-dot"></span>
                        <div class="strategy-status-main">
                          <div class="strategy-status-name">跨所价差</div>
                          <div class="strategy-status-sub">保留扫描结果，真实下单需要风控闸门。</div>
                        </div>
                        <span class="strategy-status-pill">Watch</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section class="panel">
                  <div class="panel-inner">
                    <div class="panel-head">
                      <div>
                        <div class="panel-title">策略准入</div>
                        <div class="panel-sub">上线前必须满足的最小条件。</div>
                      </div>
                    </div>
                    <table class="strategy-plaza-table">
                      <thead>
                        <tr>
                          <th>项目</th>
                          <th>要求</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>资金</td>
                          <td class="strategy-muted">钱包余额、gas、稳定币额度可读。</td>
                        </tr>
                        <tr>
                          <td>RPC</td>
                          <td class="strategy-muted">使用 SuperMT Node endpoint，并读取真实调用量。</td>
                        </tr>
                        <tr>
                          <td>风控</td>
                          <td class="strategy-muted">利润、滑点、gas 与广播模式必须有显式闸门。</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </aside>
            </div>
          </section>
`;
