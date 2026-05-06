export const DASHBOARD_CONSOLE_STYLES = String.raw`
      @font-face {
        font-family: 'DottedSongtiCircle';
        src: url('/font/DottedSongtiCircleRegular.otf') format('opentype');
        font-display: swap;
      }

      .console-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(400px, 0.92fr);
        gap: 16px;
        min-height: 0;
        height: 100%;
        align-items: stretch;
      }

      .console-control {
        display: grid;
        gap: 12px;
      }

      .quicknode-usage {
        color: #9ca5b3;
        min-height: 16px;
      }

      .console-control .panel-head {
        display: none;
      }

      .console-control-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px 28px;
      }

      .console-control-column {
        display: grid;
        gap: 12px;
        align-content: start;
      }

      .console-side-form {
        display: grid;
        gap: 12px;
        align-content: start;
      }

      .console-fields-two {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .console-fields-two > .field:only-child {
        grid-column: 1 / -1;
      }

      .console-ops-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.04fr) minmax(0, 1fr);
        gap: 14px;
        align-items: start;
      }

      .console-ops-grid > * {
        min-width: 0;
      }

      .console-ops-left {
        display: grid;
        gap: 12px;
        align-content: start;
      }

      .console-ops-left .console-fields-two {
        align-items: start;
      }

      .console-ops-left .field {
        margin: 0;
        align-content: start;
      }

      .console-ops-left .settings-select-wrap {
        align-self: start;
      }

      .console-dry-run-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: end;
      }

      .console-ops-left .button-grid {
        width: 100%;
        margin-top: 0 !important;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .console-ops-left .button-grid .action-button {
        width: 100%;
        min-height: 56px;
      }

      .console-ops-left .button-grid .action-button .action-button-content {
        gap: 12px;
      }

      .console-ops-left .button-grid .action-button .action-button-label {
        font-size: 17px;
      }

      .console-ops-left .button-grid .action-button .action-button-icon {
        width: 24px;
        height: 24px;
      }

      .console-ops-left .button-grid #actionSelfFunded .action-button-icon {
        width: 26px;
        height: 26px;
      }

      .console-readonly-grid {
        margin-top: 2px;
      }

      .console-machine-shell {
        min-height: 0;
        height: 100%;
        margin-top: 23px;
      }

      .console-machine-grid {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        min-height: 106px;
        padding: 12px 24px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        background-color: #1b1f26;
        background-image:
          linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
        background-size: 40px 40px, 40px 40px, 10px 10px, 10px 10px;
        background-position: -1px -1px, -1px -1px, -1px -1px, -1px -1px;
        overflow: hidden;
      }

      @media (max-width: 1280px) {
        .console-layout,
        .console-main,
        .console-side,
        .console-control,
        .console-ops-grid,
        .console-runtime-strip {
          gap: 12px;
        }

        .console-machine-shell {
          margin-top: 14px;
        }

        .console-machine-grid {
          min-height: 92px;
          padding: 10px 18px;
        }
      }

      @media (max-width: 1180px) {
        .console-ops-grid {
          grid-template-columns: 1fr;
        }

        .console-ops-left .button-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .console-machine-shell {
          margin-top: 0;
        }

        .console-machine-grid {
          min-height: 106px;
        }
      }

      @media (max-width: 720px) {
        .console-ops-left .button-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .console-machine-grid:not(.is-active) .console-machine-caret {
        opacity: 0;
        animation: none;
      }

      .console-machine-grid::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0));
        pointer-events: none;
      }

      .console-machine-readout {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-height: 34px;
        width: 100%;
        text-align: center;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 220ms ease, transform 220ms ease;
      }

      .console-machine-grid.is-active .console-machine-readout {
        opacity: 1;
        transform: translateY(0);
      }

      .console-machine-text {
        font-family: 'DottedSongtiCircle', 'SF Mono', 'Menlo', monospace;
        font-size: clamp(12px, 0.92vw, 18px);
        line-height: 1.04;
        letter-spacing: 0.01em;
        color: #37ff67;
        text-shadow:
          0 0 6px rgba(55,255,103,0.14),
          0 0 12px rgba(55,255,103,0.08);
        word-break: break-word;
        max-width: 88%;
      }

      .console-machine-caret {
        width: 8px;
        height: 1.1em;
        border-radius: 2px;
        background: rgba(55, 255, 103, 0.88);
        box-shadow: 0 0 8px rgba(55,255,103,0.22);
        animation: console-machine-caret-blink 1s steps(1, end) infinite;
        flex: 0 0 auto;
      }

      @keyframes console-machine-caret-blink {
        0%, 49% {
          opacity: 1;
        }
        50%, 100% {
          opacity: 0;
        }
      }

      .console-main,
      .console-side {
        display: grid;
        gap: 16px;
      }

      .console-main,
      .console-side {
        min-height: 0;
        grid-template-rows: auto minmax(0, 1fr);
        align-content: stretch;
      }

      .console-side {
        grid-template-rows: minmax(0, 1fr);
        align-content: stretch;
      }

      .console-side > .panel {
        height: 100%;
      }

      .console-runtime-strip {
        display: grid;
        grid-template-columns: minmax(0, 1.04fr) minmax(0, 1fr);
        gap: 14px;
        margin: 0;
      }

      .console-runtime-metric {
        padding: 12px 16px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
      }

      .console-runtime-label {
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8e94a4;
      }

      .console-runtime-value {
        margin-top: 6px;
        font-size: 12.6px;
        line-height: 1.2;
        font-weight: 400;
        color: #f3f6ff;
        word-break: break-word;
      }

      .console-decision-card {
        display: grid;
        gap: 6px;
        min-width: 0;
        min-height: 118px;
        padding: 14px 16px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)),
          rgba(255,255,255,0.03);
      }

      .console-decision-label {
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8e94a4;
      }

      .console-decision-value {
        font-size: 18px;
        line-height: 1.2;
        font-weight: 700;
        color: #f3f6ff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .console-decision-meta {
        font-size: 11px;
        line-height: 1.45;
        color: #9ca5b3;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .console-decision-gate {
        margin-top: 2px;
        font-size: 11px;
        line-height: 1.45;
        color: #d4b35a;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .terminal-shell,
      .intel-shell {
        min-height: 0;
      }

      .terminal-shell .panel-inner {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
        padding: 0;
        overflow: hidden;
      }

      .intel-shell .panel-inner {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
        padding: 0;
        overflow: hidden;
      }

      .terminal-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        background: #25282e;
      }

      .terminal-title-row {
        display: inline-flex;
        align-items: center;
        gap: 12px;
      }

      .terminal-title-icon {
        width: 18px;
        height: 18px;
        object-fit: contain;
      }

      @media (max-width: 860px) {
        .console-ops-grid {
          grid-template-columns: 1fr;
        }

        .console-ops-left .button-grid {
          grid-template-columns: 1fr;
        }

        .console-machine-shell {
          min-height: 118px;
          margin-top: 0;
        }

        .console-machine-grid {
          min-height: 118px;
        }

        .console-summary-strip {
          grid-template-columns: 1fr;
        }
      }

      .terminal-toolbar-actions {
        display: inline-flex;
        align-items: center;
        gap: 14px;
      }

      .terminal-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
      }

      .terminal-icon-button img {
        width: 18px;
        height: 18px;
        object-fit: contain;
      }

      .terminal-icon-button:hover {
        opacity: 0.88;
      }

      .terminal-output {
        flex: 1 1 auto;
        min-height: 0;
        height: 100%;
        margin: 0;
        padding: 14px 18px;
        border-radius: 0;
        border: 0;
        background: #06080b;
        color: #dce7f3;
        overflow-x: hidden;
        overflow-y: scroll;
        font-size: 12px;
        line-height: 1.55;
      }

      .terminal-output::-webkit-scrollbar {
        width: 12px;
        height: 12px;
      }

      .terminal-output::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.04);
      }

      .terminal-output::-webkit-scrollbar-thumb {
        border: 3px solid rgba(6,8,11,0.92);
        border-radius: 999px;
        background: rgba(120, 131, 149, 0.72);
      }

      .terminal-output::-webkit-scrollbar-thumb:hover {
        background: rgba(154, 165, 182, 0.86);
      }

      .terminal-output {
        scrollbar-width: thin;
        scrollbar-color: rgba(120, 131, 149, 0.72) rgba(255,255,255,0.04);
      }

      .intel-shell .panel-head {
        margin: 0;
        padding: 18px 22px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        background: #25282e;
      }

      .intel-shell .panel-title {
        margin: 0;
      }

      .intel-shell .panel-body {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        padding: 16px 18px 18px;
      }

      .console-results-shell .panel-inner {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: 0;
        overflow: hidden;
      }

      .intel-shell .panel-body.console-results-body,
      .console-results-body {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        padding: 0;
      }

      .console-results-toolbar {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 16px 18px 10px;
        flex-wrap: wrap;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }

      .console-results-filter-group {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .console-results-filter-group.is-hidden {
        display: none;
      }

      .console-results-filter-label {
        color: #8991a0;
        font-size: 11px;
        line-height: 1;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
      }

      .console-filter-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 74px;
        min-height: 40px;
        padding: 9px 14px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        color: #b6bdc9;
        font-size: 12px;
        line-height: 1;
        font-weight: 700;
        cursor: pointer;
        transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
      }

      .console-filter-button:hover {
        border-color: rgba(140, 117, 255, 0.34);
        color: #ece7ff;
      }

      .console-filter-button.is-active {
        border-color: rgba(140, 117, 255, 0.9);
        background: rgba(89, 66, 167, 0.24);
        color: #f2ecff;
        box-shadow: inset 0 0 0 1px rgba(140, 117, 255, 0.2);
      }

      .console-summary-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        padding: 16px 18px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }

      @media (max-width: 1120px) {
        .console-summary-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .console-results-group-head {
          align-items: flex-start;
          flex-direction: column;
        }

        .console-results-group-actions {
          width: 100%;
        }
      }

      .console-summary-card {
        min-width: 0;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
      }

      .console-summary-label {
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8e94a4;
      }

      .console-summary-value {
        margin-top: 6px;
        font-size: 17px;
        line-height: 1.2;
        font-weight: 700;
        color: #f3f6ff;
        word-break: break-word;
      }

      .console-summary-meta {
        margin-top: 6px;
        font-size: 11px;
        line-height: 1.4;
        color: #9ca5b3;
        word-break: break-word;
      }

      .console-results-table-wrap {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
        background: #06080b;
        margin: 0;
        border: 0;
        border-radius: 0;
        overflow: auto;
        padding: 0;
      }

      .console-results-table {
        width: 100%;
        height: auto;
        table-layout: auto;
        border-collapse: separate;
        border-spacing: 0;
      }

      .console-results-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #15181e;
        text-align: left;
      }

      .console-results-table th,
      .console-results-table td {
        text-align: left;
        padding-left: 18px;
        padding-right: 18px;
      }

      .console-results-table td {
        color: #dce2eb;
        vertical-align: top;
        padding-top: 14px;
        padding-bottom: 14px;
        white-space: normal;
      }

      .console-results-table td.market-cell {
        white-space: normal;
        word-break: break-word;
        line-height: 1.15;
      }

      .console-results-table td.user-cell {
        white-space: nowrap;
        width: 88px;
        max-width: 88px;
        font-family: "SFMono-Regular", SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
        font-size: 11.5px;
        letter-spacing: 0.01em;
      }

      .console-results-table th#consoleResultsThUser {
        width: 88px;
      }

      .console-user-cell-content {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        max-width: 100%;
      }

      .console-user-address {
        position: relative;
        display: inline-block;
        width: 11ch;
        min-width: 11ch;
        max-width: 11ch;
        white-space: nowrap;
        overflow: visible;
        text-overflow: clip;
        cursor: pointer;
        color: inherit;
        transition: color 140ms ease;
      }

      .console-user-address:hover,
      .console-user-address:focus-visible {
        color: #f3f6fb;
        outline: none;
      }

      .console-user-address.is-copied {
        color: #78f0b2;
      }

      .console-user-copy-tooltip {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 6px);
        transform: translateX(-50%);
        padding: 3px 6px;
        border-radius: 4px;
        background: rgba(10, 12, 16, 0.94);
        color: #dce2eb;
        font-family: Inter, sans-serif;
        font-size: 10px;
        line-height: 1;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 140ms ease;
      }

      .console-user-address:hover .console-user-copy-tooltip,
      .console-user-address:focus-visible .console-user-copy-tooltip,
      .console-user-address.is-copied .console-user-copy-tooltip {
        opacity: 1;
      }

      .console-results-table tbody tr:hover td {
        background: rgba(255,255,255,0.03);
      }

      .console-results-table tbody tr.console-results-group-row:hover td {
        background: #10141a;
      }

      .console-results-table tbody tr.console-results-group-row td {
        padding-top: 12px;
        padding-bottom: 12px;
        background: #10141a;
        border-top: 1px solid rgba(255,255,255,0.06);
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }

      .console-results-group-title {
        color: #eff3fb;
        font-size: 13px;
        line-height: 1.3;
        font-weight: 700;
      }

      .console-results-group-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .console-results-group-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .console-results-group-action {
        min-height: 28px;
        padding: 6px 10px;
        border-radius: 7px;
        font-size: 11px;
        line-height: 1;
        color: #d9e0eb;
        white-space: nowrap;
      }

      .console-results-group-summary {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
      }

      .console-results-group-pill {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 4px 9px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: #d6dde8;
        font-size: 10.5px;
        line-height: 1;
        font-weight: 700;
        letter-spacing: 0.01em;
      }

      .console-results-group-pill.is-bad {
        border-color: rgba(255, 106, 122, 0.32);
        background: rgba(109, 24, 34, 0.34);
        color: #ffb6bf;
      }

      .console-results-group-pill.is-warn {
        border-color: rgba(255, 209, 102, 0.26);
        background: rgba(92, 70, 18, 0.34);
        color: #ffd978;
      }

      .console-results-group-pill.is-info {
        border-color: rgba(79, 162, 255, 0.26);
        background: rgba(18, 47, 92, 0.34);
        color: #9bcaff;
      }

      .console-results-group-meta {
        margin-top: 4px;
        color: #97a0ae;
        font-size: 11px;
        line-height: 1.45;
        word-break: break-word;
      }

      .console-results-table tbody tr.is-liquidatable td {
        background: rgba(86, 18, 24, 0.42);
      }

      .console-results-table tbody tr.is-liquidatable:hover td {
        background: rgba(104, 24, 31, 0.5);
      }

      .console-results-table tbody tr.is-liquidatable td:nth-child(1),
      .console-results-table tbody tr.is-liquidatable td:nth-child(2) {
        color: #ff6d7a;
        font-weight: 700;
      }

      .terminal-output-text {
        white-space: pre-wrap;
        word-break: break-word;
      }

      .terminal-output-caret {
        display: inline-block;
        width: 8px;
        height: 16px;
        margin-left: 6px;
        border-radius: 1px;
        background: rgba(220,231,243,0.92);
        vertical-align: -2px;
        animation: terminal-caret-blink 1s steps(1, end) infinite;
        flex: 0 0 auto;
      }

      @keyframes terminal-caret-blink {
        0%, 49% {
          opacity: 1;
        }
        50%, 100% {
          opacity: 0;
        }
      }
`;

export const DASHBOARD_CONSOLE_PAGE = String.raw`
          <section id="pageConsole" class="page">
            <div class="page-frame">
              <div class="page-header">
                <div>
                  <div id="consolePageTitle" class="page-title">Execution Console</div>
                  <div id="consolePageSub" class="page-sub"></div>
                </div>
              </div>
            </div>

            <div class="console-layout">
              <div class="console-main">
                <article class="panel">
                  <div class="panel-inner console-control">
                    <div class="console-runtime-strip">
                      <div class="console-runtime-metric">
                        <div id="consoleUsdcLabel" class="console-runtime-label">USDC Balance</div>
                        <div id="consoleUsdcValue" class="console-runtime-value">--</div>
                      </div>
                      <div class="console-runtime-metric">
                        <div id="consoleRpcUsageLabel" class="console-runtime-label">RPC Calls</div>
                        <div id="consoleRpcUsageValue" class="console-runtime-value">--</div>
                      </div>
                    </div>
                    <div class="console-decision-card">
                      <div id="consoleDecisionLabel" class="console-decision-label">Current Priority</div>
                      <div id="consoleDecisionValue" class="console-decision-value">--</div>
                      <div id="consoleDecisionMeta" class="console-decision-meta">Awaiting candidates</div>
                      <div id="consoleDecisionGate" class="console-decision-gate">Gate: Awaiting candidates</div>
                    </div>
                    <div class="console-ops-grid">
                      <div class="console-ops-left">
                        <div class="console-fields-two">
                          <label class="field">
                            <span id="labelChain" class="field-label">Market</span>
                            <span class="settings-select-wrap">
                              <select id="marketSelect">
                                <option value="auto-ethereum">Auto Rotation / Ethereum</option>
                                <option value="aave-v3-ethereum">Aave V3 / Ethereum</option>
                                <option value="spark-ethereum">SparkLend / Ethereum</option>
                                <option value="aave-v3-arbitrum">Aave V3 / Arbitrum</option>
                                <option value="aave-v3-polygon">Aave V3 / Polygon</option>
                                <option value="aave-v3-bnb">Aave V3 / BNB Chain</option>
                              </select>
                            </span>
                          </label>
                        </div>

                        <label class="field" style="display:none;">
                          <span id="labelRpc" class="field-label">RPC override</span>
                          <input id="rpcUrlInput" type="text" placeholder="https://your-rpc" />
                        </label>

                        <div class="button-grid" style="margin-top:2px;">
                          <button id="actionSelfFunded" class="action-button primary" type="button"><span class="action-button-content"><img id="actionSelfFundedIcon" class="action-button-icon" src="/img/readyStart.svg" alt="" aria-hidden="true" /><span id="actionSelfFundedLabel" class="action-button-label">启动清算器</span></span></button>
                          <button id="actionPause" class="action-button" type="button" disabled><span class="action-button-content"><img id="actionPauseIcon" class="action-button-icon" src="/img/stop.svg" alt="" aria-hidden="true" /><span id="actionPauseLabel" class="action-button-label">暂停</span></span></button>
                        </div>
                      </div>

                      <div class="console-machine-shell">
                        <div class="console-machine-grid">
                          <div class="console-machine-readout">
                            <span id="consoleMachineText" class="console-machine-text"></span>
                            <span class="console-machine-caret" aria-hidden="true"></span>
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
                        <div id="terminalTitle" class="panel-title">Execution Terminal</div>
                      </div>
                      <div class="terminal-toolbar-actions">
                        <button id="terminalExpand" class="terminal-icon-button" type="button" aria-label="Expand" title="Expand"><img src="/img/zoom2.svg" alt="" aria-hidden="true" /></button>
                      </div>
                    </div>
                    <pre id="terminalOutput" class="terminal-output"><span id="terminalOutputText" class="terminal-output-text">$ workstation ready</span><span class="terminal-output-caret" aria-hidden="true"></span></pre>
                  </div>
                </article>
              </div>

              <div class="console-side">
                <article class="panel intel-shell">
                  <div class="panel-inner">
                    <div class="panel-body console-results-body">
                      <div class="console-summary-strip">
                        <div class="console-summary-card">
                          <div id="consoleSummaryBestLabel" class="console-summary-label">Best Rough Net</div>
                          <div id="consoleSummaryBestValue" class="console-summary-value">--</div>
                          <div id="consoleSummaryBestMeta" class="console-summary-meta">--</div>
                        </div>
                        <div class="console-summary-card">
                          <div id="consoleSummaryRealizedLabel" class="console-summary-label">Latest Realized Net</div>
                          <div id="consoleSummaryRealizedValue" class="console-summary-value">--</div>
                          <div id="consoleSummaryRealizedMeta" class="console-summary-meta">--</div>
                        </div>
                        <div class="console-summary-card">
                          <div id="consoleSummaryLiquidatableLabel" class="console-summary-label">Liquidatable</div>
                          <div id="consoleSummaryLiquidatableValue" class="console-summary-value">0</div>
                          <div id="consoleSummaryLiquidatableMeta" class="console-summary-meta">--</div>
                        </div>
                      </div>
                      <div class="console-results-toolbar">
                        <div class="console-results-filter-group">
                          <span id="consoleFilterSignalLabel" class="console-results-filter-label">Signal</span>
                          <button id="consoleFilterAll" class="console-filter-button is-active" type="button">All</button>
                          <button id="consoleFilterLiquidatable" class="console-filter-button" type="button">Liquidatable</button>
                          <button id="consoleFilterRisky" class="console-filter-button" type="button">Risky</button>
                          <button id="consoleFilterSafe" class="console-filter-button" type="button">Safe</button>
                        </div>
                        <div class="console-results-filter-group">
                          <span id="consoleFilterSourceLabel" class="console-results-filter-label">Source</span>
                          <button id="consoleSourceAll" class="console-filter-button is-active" type="button">All sources</button>
                          <button id="consoleSourceMorpho" class="console-filter-button" type="button">Morpho Blue</button>
                        </div>
                        <div id="consoleMorphoSortGroup" class="console-results-filter-group is-hidden">
                          <span id="consoleMorphoSortLabel" class="console-results-filter-label">Market sort</span>
                          <button id="consoleMorphoSortLiq" class="console-filter-button is-active" type="button">By Liq</button>
                          <button id="consoleMorphoSortNear" class="console-filter-button" type="button">By Near</button>
                          <button id="consoleMorphoSortBorrow" class="console-filter-button" type="button">By Borrow</button>
                          <button id="consoleMorphoSortWorstHf" class="console-filter-button" type="button">By Worst HF</button>
                        </div>
                      </div>
                      <div class="table-wrap console-results-table-wrap">
                        <table class="console-results-table">
                          <thead>
                            <tr>
                              <th id="consoleResultsThUser">User</th>
                              <th id="consoleResultsThHf">HF</th>
                              <th id="consoleResultsThState">State</th>
                              <th id="consoleResultsThExec">Execution</th>
                              <th id="consoleResultsThDebt">Debt</th>
                              <th id="consoleResultsThCollateral">Collateral</th>
                              <th id="consoleResultsThGross">Gross</th>
                              <th id="consoleResultsThNet">Rough Net</th>
                            </tr>
                          </thead>
                          <tbody id="consoleResultsRows"></tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </section>
`;
