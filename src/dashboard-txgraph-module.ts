export const DASHBOARD_TXGRAPH_STYLES = String.raw`
      .txgraph-layout {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        gap: 16px;
        min-height: 0;
        height: 100%;
      }

      .txgraph-controls {
        display: grid;
        gap: 14px;
      }

      .txgraph-filter-row {
        display: grid;
        grid-template-columns: minmax(220px, 1.25fr) repeat(3, minmax(0, 1fr));
        gap: 12px;
        align-items: stretch;
      }

      .txgraph-filter-row .field,
      .txgraph-toggle-field {
        display: grid;
        gap: 7px;
        height: 100%;
      }

      .txgraph-toggle-label-spacer {
        visibility: hidden;
      }

      .txgraph-filter-row .toggle {
        height: 40px;
        min-height: 40px;
        padding: 0 14px;
        box-sizing: border-box;
      }

      .txgraph-hash-control {
        display: block;
      }

      .txgraph-select-wrap {
        position: relative;
        display: block;
      }

      .txgraph-select-wrap::before {
        content: '';
        position: absolute;
        top: 1px;
        right: 52px;
        bottom: 1px;
        width: 1px;
        background: rgba(255,255,255,0.1);
        pointer-events: none;
      }

      .txgraph-select-wrap::after {
        content: '';
        position: absolute;
        right: 18px;
        top: 50%;
        width: 14px;
        height: 14px;
        transform: translateY(-50%);
        background: url('/img/updown.svg') center / contain no-repeat;
        opacity: 0.9;
        pointer-events: none;
      }

      .txgraph-select-wrap select {
        appearance: none;
        -webkit-appearance: none;
        padding-right: 64px;
      }

      .txgraph-hash-input-wrap {
        display: block;
        width: 100%;
        position: relative;
      }

      .txgraph-hash-input {
        padding-right: 62px;
      }

      .txgraph-hash-button {
        position: absolute;
        right: 1px;
        top: 1px;
        bottom: 1px;
        width: 44px;
        height: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-left: 1px solid rgba(123, 97, 255, 0.28);
        border-radius: 0 5px 5px 0;
        background: linear-gradient(180deg, rgba(92, 74, 173, 0.92), rgba(54, 45, 102, 0.92));
        cursor: pointer;
        transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
      }

      .txgraph-hash-button:hover {
        border-color: rgba(151, 129, 255, 0.72);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
      }

      .txgraph-hash-button img {
        width: 16px;
        height: 16px;
        opacity: 0.92;
      }

      .txgraph-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .txgraph-toggle-row {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .txgraph-grid {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        gap: 16px;
        min-height: 500px;
      }

      .txgraph-side {
        display: grid;
        gap: 16px;
        align-content: start;
      }

      .txgraph-summary {
        display: grid;
        gap: 10px;
      }

      .txgraph-summary-item {
        padding: 12px 14px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
      }

      .txgraph-summary-item strong {
        display: block;
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }

      #txGraphSummaryHash {
        display: block;
        font-family: "SF Mono", "JetBrains Mono", "Menlo", monospace;
        font-size: 12px;
        line-height: 1.45;
        word-break: break-all;
        overflow-wrap: anywhere;
      }

      #txGraphSummaryHash a {
        color: inherit;
        text-decoration: none;
        border-bottom: 1px solid rgba(138, 125, 255, 0.28);
        cursor: pointer;
        transition: color 140ms ease, border-color 140ms ease;
      }

      #txGraphSummaryHash a:hover {
        color: #bdb5ff;
        border-color: rgba(189, 181, 255, 0.72);
      }

      .txgraph-canvas-wrap {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
      }

      .txgraph-canvas-wrap .panel-inner {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
      }

      .txgraph-canvas-panel {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        height: 100%;
      }

      .txgraph-grid .txgraph-canvas-wrap .txgraph-canvas-panel {
        min-height: 500px;
      }

      .txgraph-canvas-actions {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 6;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      #txGraphFullscreen img {
        filter: brightness(0) saturate(100%) invert(100%);
        opacity: 0.8;
      }

      .txgraph-canvas {
        position: relative;
        min-height: 0;
        height: 100%;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.08);
        background-color: #20242b;
        background-image:
          linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
        background-size: 40px 40px, 40px 40px, 10px 10px, 10px 10px;
        background-position: -1px -1px, -1px -1px, -1px -1px, -1px -1px;
      }

      .txgraph-canvas::after {
        content: 'SUPER LIQUIDATION';
        position: absolute;
        right: 26px;
        bottom: 20px;
        z-index: 1;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: rgba(0,0,0,0);
        -webkit-text-stroke: 1px rgba(214, 222, 232, 0.24);
        opacity: 0.9;
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
      }

      .txgraph-loading-overlay {
        position: absolute;
        inset: 0;
        z-index: 12;
        display: none;
        align-items: center;
        justify-content: center;
        border-radius: 5px;
        background: rgba(19, 23, 29, 0.52);
        backdrop-filter: blur(1px);
        pointer-events: all;
      }

      .txgraph-loading-overlay.is-visible {
        display: flex;
      }

      .txgraph-loading-indicator {
        display: grid;
        justify-items: center;
        gap: 12px;
        padding: 18px 20px;
        border-radius: 10px;
        background: rgba(16, 19, 24, 0.74);
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 16px 36px rgba(0,0,0,0.22);
      }

      .txgraph-loading-spinner {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        border: 3px solid rgba(128, 146, 166, 0.22);
        border-top-color: rgba(133, 241, 220, 0.92);
        animation: txgraph-spinner-rotate 0.9s linear infinite;
      }

      .txgraph-loading-text {
        color: rgba(224, 232, 241, 0.88);
        font-size: 12px;
        letter-spacing: 0.04em;
      }

      @keyframes txgraph-spinner-rotate {
        to {
          transform: rotate(360deg);
        }
      }

      .txgraph-canvas-panel:fullscreen {
        width: 100vw;
        height: 100vh;
        padding: 14px;
        background: #20242b;
      }

      .txgraph-canvas-panel:fullscreen .txgraph-canvas {
        min-height: calc(100vh - 28px);
      }

      .txgraph-tooltip {
        position: absolute;
        z-index: 20;
        min-width: 180px;
        max-width: 340px;
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid rgba(85, 174, 180, 0.68);
        background: rgba(240, 247, 247, 0.96);
        box-shadow: 0 10px 24px rgba(0,0,0,0.18);
        color: #273038;
        pointer-events: none;
        opacity: 0;
        transform: translate3d(0, 0, 0);
        transition: opacity 120ms ease;
      }

      .txgraph-tooltip.is-visible {
        opacity: 1;
      }

      .txgraph-tooltip-kind {
        color: #5c6774;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .txgraph-tooltip-label {
        margin-top: 4px;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.35;
        word-break: break-word;
      }

      .txgraph-tooltip-subtitle {
        margin-top: 4px;
        color: #55606d;
        font-size: 12px;
        line-height: 1.45;
        word-break: break-word;
      }

      .txgraph-empty {
        display: grid;
        place-items: center;
        min-height: 500px;
        color: #6d7480;
        font-size: 14px;
        text-align: center;
        position: relative;
        z-index: 2;
      }

      @media (max-width: 1600px) {
        .txgraph-grid {
          grid-template-columns: 280px minmax(0, 1fr);
          gap: 12px;
          min-height: 440px;
        }

        .txgraph-grid .txgraph-canvas-wrap .txgraph-canvas-panel,
        .txgraph-empty {
          min-height: 440px;
        }
      }

      .txgraph-detail-pre {
        margin: 0;
        padding: 14px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.08);
        background: #06080b;
        color: #dce7f3;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
      }
`;

export const DASHBOARD_TXGRAPH_PAGE = String.raw`
          <section id="pageTxgraph" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="txGraphPageTitle" class="page-title">Tx Graph</div>
                  <div id="txGraphPageSub" class="page-sub"></div>
                </div>
              </div>
            </div>

            <div class="txgraph-layout">
              <article class="panel">
                <div class="panel-inner txgraph-controls">
                  <label class="field full txgraph-hash-control">
                    <span id="txGraphHashLabel" class="field-label">Tx hash</span>
                    <span class="txgraph-hash-input-wrap">
                      <input id="txGraphHashInput" class="txgraph-hash-input" type="text" placeholder="0x..." />
                      <button id="txGraphHashSearchButton" class="txgraph-hash-button" type="button" aria-label="Search graph">
                        <img src="img/search.svg" alt="" aria-hidden="true" />
                      </button>
                    </span>
                  </label>

                  <div class="txgraph-filter-row">
                    <label class="field">
                      <span id="txGraphChainLabel" class="field-label">Chain</span>
                      <span class="txgraph-select-wrap">
                        <select id="txGraphChainSelect">
                          <option value="ethereum">Ethereum</option>
                          <option value="bnb">BNB Chain</option>
                          <option value="arbitrum">Arbitrum</option>
                          <option value="polygon">Polygon</option>
                        </select>
                      </span>
                    </label>
                    <label class="field" style="display:none;">
                      <span id="txGraphRpcLabel" class="field-label">RPC override</span>
                      <input id="txGraphRpcInput" type="text" placeholder="https://your-rpc" />
                    </label>
                    <div class="txgraph-toggle-field">
                      <span class="field-label txgraph-toggle-label-spacer" aria-hidden="true">Toggle</span>
                      <label class="toggle"><input id="txGraphTransfersToggle" type="checkbox" checked /> <span id="txGraphTransfersLabel">Transfers</span></label>
                    </div>
                    <div class="txgraph-toggle-field">
                      <span class="field-label txgraph-toggle-label-spacer" aria-hidden="true">Toggle</span>
                      <label class="toggle"><input id="txGraphCallsToggle" type="checkbox" checked /> <span id="txGraphCallsLabel">Smart Contract Calls</span></label>
                    </div>
                    <div class="txgraph-toggle-field">
                      <span class="field-label txgraph-toggle-label-spacer" aria-hidden="true">Toggle</span>
                      <label class="toggle"><input id="txGraphReferencesToggle" type="checkbox" checked /> <span id="txGraphReferencesLabel">References</span></label>
                    </div>
                  </div>
                </div>
              </article>

              <div class="txgraph-grid">
                <aside class="txgraph-side">
                  <article class="panel">
                    <div class="panel-inner txgraph-summary">
                      <div class="summary-title-row">
                        <div id="txGraphSummaryTitle" class="panel-title">Graph Summary</div>
                      </div>
                      <div class="txgraph-summary-item"><strong id="txGraphSummaryHashLabel">Tx</strong><span id="txGraphSummaryHash">--</span></div>
                      <div class="txgraph-summary-item"><strong id="txGraphSummaryChainLabel">Chain</strong><span id="txGraphSummaryChain">--</span></div>
                      <div class="txgraph-summary-item"><strong id="txGraphSummaryTransfersLabel">Transfers</strong><span id="txGraphSummaryTransfers">0</span></div>
                      <div class="txgraph-summary-item"><strong id="txGraphSummaryCallsLabel">Calls</strong><span id="txGraphSummaryCalls">0</span></div>
                      <div class="txgraph-summary-item"><strong id="txGraphSummaryRefsLabel">References</strong><span id="txGraphSummaryRefs">0</span></div>
                      <div class="txgraph-summary-item"><strong id="txGraphSummaryTraceLabel">Trace</strong><span id="txGraphSummaryTrace">--</span></div>
                    </div>
                  </article>
                </aside>

                <article class="panel txgraph-canvas-wrap">
                  <div class="panel-inner" style="padding:16px;">
                    <div class="txgraph-canvas-panel">
                      <div class="txgraph-canvas-actions">
                        <button id="txGraphFullscreen" class="terminal-icon-button" type="button" aria-label="Expand" title="Expand"><img src="/img/zoom2.svg" alt="" aria-hidden="true" /></button>
                      </div>
                      <div id="txGraphCanvas" class="txgraph-canvas"></div>
                      <div id="txGraphLoadingOverlay" class="txgraph-loading-overlay" aria-hidden="true">
                        <div class="txgraph-loading-indicator">
                          <div class="txgraph-loading-spinner" aria-hidden="true"></div>
                          <div id="txGraphLoadingText" class="txgraph-loading-text">图谱加载中...</div>
                        </div>
                      </div>
                      <div id="txGraphTooltip" class="txgraph-tooltip" aria-hidden="true"></div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </section>
`;
