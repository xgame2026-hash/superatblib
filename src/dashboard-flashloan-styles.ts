export const DASHBOARD_FLASHLOAN_STYLES = String.raw`
      .flashloan-console-stack {
        display: grid;
        gap: 12px;
        min-height: 0;
      }

      .flashloan-trend-panel.chart-box {
        min-height: 248px;
      }

      .flashloan-trend-panel .chart-frame {
        padding: 8px 14px 4px;
      }

      .flashloan-trend-panel .chart-frame .chart-stage {
        min-height: 180px;
        height: 180px;
      }

      .flashloan-trend-panel .chart-frame .chart-stage svg {
        height: 180px;
      }

      .flashloan-trend-panel .chart-widget-head,
      .flashloan-trend-panel .chart-widget-foot {
        padding-top: 10px;
        padding-bottom: 10px;
      }

      .flashloan-control-panel .panel-inner {
        padding: 14px 16px;
      }

      .flashloan-top-grid {
        display: block;
      }

      .flashloan-summary-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 0;
        min-width: 0;
      }

      .flashloan-summary-strip .console-summary-card {
        min-height: 44px;
        padding: 9px 10px;
      }

      .flashloan-summary-strip .console-summary-value {
        margin-top: 4px;
        font-size: 15px;
      }

      .flashloan-summary-strip .console-summary-meta {
        margin-top: 4px;
      }

      #pageFlashloanConsole .console-results-toolbar {
        align-items: end;
      }

      .flashloan-toolbar-controls {
        display: grid;
        grid-template-columns: minmax(120px, 0.9fr) minmax(88px, 0.58fr) minmax(88px, 0.58fr);
        gap: 8px;
        align-items: end;
        margin-left: auto;
        min-width: min(520px, 45vw);
      }

      .flashloan-toolbar-field {
        display: grid;
        gap: 6px;
        min-width: 0;
      }

      .flashloan-toolbar-field .field-label {
        font-size: 10px;
        line-height: 1;
      }

      .flashloan-toolbar-field input,
      .flashloan-toolbar-field select {
        min-height: 40px;
      }

      .flashloan-results-table th:nth-child(4),
      .flashloan-results-table td:nth-child(4),
      .flashloan-results-table th:nth-child(5),
      .flashloan-results-table td:nth-child(5) {
        text-align: right;
      }

      #pageFlashloanConsole .console-results-table-wrap {
        height: calc(100vh - 180px);
        max-height: calc(100vh - 130px);
        overflow: auto;
        overscroll-behavior: contain;
      }

      #pageFlashloanConsole .flashloan-results-table {
        min-width: 1120px;
        table-layout: fixed;
      }

      #pageFlashloanConsole .flashloan-results-table col {
        width: 14.2857%;
      }

      #pageFlashloanConsole .flashloan-results-table th,
      #pageFlashloanConsole .flashloan-results-table td {
        text-align: left;
        overflow: hidden;
      }

      #pageFlashloanConsole .flashloan-results-table th:nth-child(4),
      #pageFlashloanConsole .flashloan-results-table td:nth-child(4),
      #pageFlashloanConsole .flashloan-results-table th:nth-child(5),
      #pageFlashloanConsole .flashloan-results-table td:nth-child(5) {
        text-align: right;
      }

      #pageFlashloanConsole .flashloan-results-table td:nth-child(2) .leaderboard-asset {
        flex-wrap: nowrap;
        gap: 8px;
      }

      #pageFlashloanConsole .flashloan-results-table td:nth-child(7) {
        white-space: nowrap;
      }

      #pageFlashloanConsole .console-results-table-wrap::-webkit-scrollbar {
        width: 12px;
        height: 12px;
      }

      #pageFlashloanConsole .console-results-table-wrap::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.04);
      }

      #pageFlashloanConsole .console-results-table-wrap::-webkit-scrollbar-thumb {
        border: 3px solid rgba(6,8,11,0.92);
        border-radius: 999px;
        background: rgba(120, 131, 149, 0.72);
      }

      #pageFlashloanConsole .console-results-table-wrap::-webkit-scrollbar-thumb:hover {
        background: rgba(154, 165, 182, 0.86);
      }

      #pageFlashloanConsole .console-results-table-wrap {
        scrollbar-width: thin;
        scrollbar-color: rgba(120, 131, 149, 0.72) rgba(255,255,255,0.04);
      }

      .flashloan-results-table tbody tr.is-broadcastable td {
        background: rgba(18, 68, 34, 0.24);
      }

      .flashloan-results-table tbody tr.is-broadcastable:hover td {
        background: rgba(24, 86, 42, 0.32);
      }

      .flashloan-results-table tbody tr.is-liquidatable td {
        background: rgba(86, 18, 24, 0.32);
      }

      .flashloan-results-table tbody tr.is-liquidatable:hover td {
        background: rgba(104, 24, 31, 0.4);
      }

      .flashloan-action-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 74px;
        padding: 5px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: #d7dceb;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .flashloan-action-chip.is-ready {
        border-color: rgba(74, 222, 128, 0.22);
        background: rgba(21, 68, 39, 0.32);
        color: #8ef0af;
      }

      .flashloan-action-chip.is-watch {
        border-color: rgba(250, 204, 21, 0.18);
        background: rgba(90, 69, 10, 0.22);
        color: #ffd76a;
      }

      .flashloan-action-chip.is-blocked {
        border-color: rgba(244, 114, 182, 0.16);
        background: rgba(94, 30, 65, 0.22);
        color: #ff9ac6;
      }

      @media (max-width: 1600px) {
        .flashloan-toolbar-controls {
          min-width: min(460px, 42vw);
        }

        .flashloan-summary-strip {
          gap: 10px;
        }
      }

      @media (max-width: 1180px) {
        .flashloan-toolbar-controls {
          order: 5;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          margin-left: 0;
          min-width: 100%;
        }

        .flashloan-summary-strip {
          grid-template-columns: 1fr;
        }

      }

      @media (max-width: 720px) {
        .flashloan-toolbar-controls {
          grid-template-columns: 1fr;
        }
      }
`;
