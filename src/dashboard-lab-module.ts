export const DASHBOARD_LAB_PAGE = String.raw`
          <section id="pageLab" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="labPageTitle" class="page-title">Flashloan Lab</div>
                  <div id="labPageSub" class="page-sub">Drag actions into a route, price the route live, then arm the existing flash-loan execution adapter when the profit gate passes.</div>
                </div>
              </div>
            </div>

            <div class="lab-layout">
              <aside class="panel lab-palette-panel">
                <div class="panel-inner">
                  <div class="panel-head">
                    <div>
                      <div id="labPaletteTitle" class="panel-title">动作库</div>
                      <div id="labPaletteSub" class="panel-sub">拖到中间画布，或点击添加。</div>
                    </div>
                  </div>
                  <div id="labActionPalette" class="lab-action-palette"></div>
                </div>
              </aside>

              <main class="panel lab-canvas-panel">
                <div class="panel-inner">
                  <div class="lab-canvas-head">
                    <div>
                      <div id="labCanvasTitle" class="panel-title">Combo Builder</div>
                      <div id="labCanvasSub" class="panel-sub">从借入、换币、转入协议、还款到利润门槛，按执行顺序组合。</div>
                    </div>
                    <div id="labPriceBadge" class="lab-price-badge">ETH --</div>
                  </div>
                  <div id="labBuilder" class="lab-builder" aria-live="polite"></div>
                  <div id="labDropzone" class="lab-dropzone" tabindex="0">
                    <span class="lab-dropzone-plus">+</span>
                    <span id="labDropzoneLabel">拖入动作或点击左侧动作继续构建</span>
                  </div>
                </div>
              </main>

              <aside class="panel lab-inspector-panel">
                <div class="panel-inner">
                  <div class="panel-head">
                    <div>
                      <div id="labInspectorTitle" class="panel-title">实时参数</div>
                      <div id="labInspectorSub" class="panel-sub">选择市场、本金和报价路径。</div>
                    </div>
                  </div>

                  <div class="lab-field-grid">
                    <label class="field">
                      <span id="labMarketLabel" class="field-label">Market</span>
                      <span class="settings-select-wrap">
                        <select id="labMarketSelect">
                          <option value=""></option>
                          <option value="ethereum">Ethereum</option>
                          <option value="arbitrum">Arbitrum</option>
                          <option value="polygon">Polygon</option>
                        </select>
                      </span>
                    </label>
                    <label class="field">
                      <span id="labBorrowAssetLabel" class="field-label">Borrow</span>
                      <span class="settings-select-wrap">
                        <select id="labBorrowAssetSelect">
                          <option value=""></option>
                          <option value="USDT">USDT</option>
                          <option value="USDC">USDC</option>
                          <option value="DAI">DAI</option>
                        </select>
                      </span>
                    </label>
                    <label class="field">
                      <span id="labBorrowAmountLabel" class="field-label">Amount</span>
                      <input id="labBorrowAmountInput" type="text" inputmode="decimal" placeholder="10000" />
                    </label>
                    <label class="field">
                      <span id="labTargetAssetLabel" class="field-label">Target</span>
                      <span class="settings-select-wrap">
                        <select id="labTargetAssetSelect">
                          <option value=""></option>
                          <option value="ETH">ETH</option>
                          <option value="WETH">WETH</option>
                          <option value="WBTC">WBTC</option>
                          <option value="LINK">LINK</option>
                          <option value="UNI">UNI</option>
                          <option value="AAVE">AAVE</option>
                          <option value="MKR">MKR</option>
                          <option value="LDO">LDO</option>
                          <option value="CRV">CRV</option>
                          <option value="BAL">BAL</option>
                          <option value="COMP">COMP</option>
                          <option value="SNX">SNX</option>
                        </select>
                      </span>
                    </label>
                    <label class="field">
                      <span id="labHopAssetLabel" class="field-label">Add hop</span>
                      <span class="settings-select-wrap">
                        <select id="labHopAssetSelect">
                          <option value=""></option>
                          <option value="WETH">WETH</option>
                          <option value="WBTC">WBTC</option>
                          <option value="LINK">LINK</option>
                          <option value="UNI">UNI</option>
                          <option value="AAVE">AAVE</option>
                          <option value="MKR">MKR</option>
                          <option value="LDO">LDO</option>
                          <option value="CRV">CRV</option>
                          <option value="BAL">BAL</option>
                          <option value="COMP">COMP</option>
                          <option value="SNX">SNX</option>
                        </select>
                      </span>
                    </label>
                    <label class="field">
                      <span id="labBuyVenueLabel" class="field-label">Buy venue</span>
                      <span class="settings-select-wrap">
                        <select id="labBuyVenueSelect">
                          <option value=""></option>
                          <option value="0x">0x</option>
                          <option value="Paraswap">Paraswap</option>
                          <option value="Uniswap V3">Uniswap V3</option>
                          <option value="Curve">Curve</option>
                          <option value="Balancer">Balancer</option>
                        </select>
                      </span>
                    </label>
                    <label class="field">
                      <span id="labSellVenueLabel" class="field-label">Sell venue</span>
                      <span class="settings-select-wrap">
                        <select id="labSellVenueSelect">
                          <option value=""></option>
                          <option value="Uniswap V3">Uniswap V3</option>
                          <option value="Curve">Curve</option>
                          <option value="Balancer">Balancer</option>
                          <option value="0x">0x</option>
                          <option value="Paraswap">Paraswap</option>
                        </select>
                      </span>
                    </label>
                    <label class="field">
                      <span id="labSlippageLabel" class="field-label">Slippage bps</span>
                      <input id="labSlippageInput" type="text" inputmode="numeric" placeholder="30" />
                    </label>
                    <label class="field">
                      <span id="labMinProfitLabel" class="field-label">Min profit</span>
                      <input id="labMinProfitInput" type="text" inputmode="decimal" placeholder="25" />
                    </label>
                  </div>

                  <div class="lab-route-editor">
                    <div>
                      <div id="labRoutePathLabel" class="field-label">Swap path</div>
                      <div id="labRoutePath" class="lab-route-path"></div>
                    </div>
                    <button id="labActionAddHop" class="ghost-button lab-add-hop-button" type="button">Add hop</button>
                  </div>

                  <div class="lab-quote-grid">
                    <div class="lab-quote-card"><span id="labQuoteBuyLabel">Buy Target</span><strong id="labQuoteBuyValue">--</strong></div>
                    <div class="lab-quote-card"><span id="labQuoteRepayLabel">Repay</span><strong id="labQuoteRepayValue">--</strong></div>
                    <div class="lab-quote-card is-wide"><span id="labQuoteProfitLabel">Estimated net</span><strong id="labQuoteProfitValue">--</strong></div>
                  </div>

                  <div class="lab-route-quotes">
                    <div id="labRouteQuotesTitle" class="field-label">Aggregator quotes</div>
                    <div id="labRouteQuotes" class="lab-route-quotes-list"></div>
                  </div>

                  <div id="labExecutionNote" class="lab-execution-note">Execution adapter: current flash-loan liquidator broadcaster.</div>

                  <div class="lab-action-row">
                    <button id="labActionLaunch" class="action-button primary" type="button" disabled>
                      <span class="action-button-content">
                        <img class="action-button-icon" src="/img/readyStart.svg" alt="" aria-hidden="true" />
                        <span id="labLaunchLabel" class="action-button-label">立即发起</span>
                      </span>
                    </button>
                    <button id="labActionReset" class="action-button" type="button">
                      <span class="action-button-content">
                        <img class="action-button-icon" src="/img/Refresh.svg" alt="" aria-hidden="true" />
                        <span id="labResetLabel" class="action-button-label">重置</span>
                      </span>
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </section>
`;
