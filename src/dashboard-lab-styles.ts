export const DASHBOARD_LAB_STYLES = String.raw`
      #pageLab.page.active {
        grid-template-rows: auto minmax(0, 1fr);
      }

      .lab-layout {
        display: grid;
        grid-template-columns: minmax(210px, 0.72fr) minmax(420px, 1.45fr) minmax(300px, 0.95fr);
        gap: 16px;
        align-items: stretch;
        min-height: 0;
      }

      .lab-palette-panel .panel-inner,
      .lab-canvas-panel .panel-inner,
      .lab-inspector-panel .panel-inner {
        height: 100%;
      }

      .lab-inspector-panel {
        min-height: 0;
      }

      .lab-inspector-panel .panel-inner {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }

      .lab-action-palette {
        display: grid;
        gap: 10px;
      }

      .lab-action-tile {
        width: 100%;
        min-height: 58px;
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        padding: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 5px;
        background: rgba(255,255,255,0.035);
        color: var(--text);
        text-align: left;
        cursor: grab;
      }

      .lab-action-tile:hover,
      .lab-action-tile:focus-visible {
        border-color: rgba(115, 223, 181, 0.42);
        background: rgba(58, 142, 112, 0.12);
        outline: 0;
      }

      .lab-action-icon,
      .lab-node-icon {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 5px;
        background: rgba(255,255,255,0.045);
      }

      .lab-action-icon img,
      .lab-node-icon img {
        width: 19px;
        height: 19px;
        object-fit: contain;
        filter: brightness(0) saturate(100%) invert(86%) sepia(7%) saturate(255%) hue-rotate(183deg) brightness(87%) contrast(88%);
      }

      .lab-action-title,
      .lab-node-title {
        font-size: 13px;
        font-weight: 650;
        line-height: 1.2;
      }

      .lab-action-sub,
      .lab-node-sub,
      .lab-node-meta,
      .lab-execution-note {
        display: block;
        color: var(--muted);
        font-size: 11px;
        line-height: 1.45;
      }

      .lab-canvas-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      .lab-price-badge {
        min-width: 132px;
        padding: 8px 10px;
        border: 1px solid rgba(115, 223, 181, 0.22);
        border-radius: 5px;
        background: rgba(30, 83, 65, 0.2);
        color: #bfffe5;
        font-family: "SF Mono", "JetBrains Mono", monospace;
        font-size: 12px;
        text-align: right;
        white-space: nowrap;
      }

      .lab-builder {
        display: grid;
        gap: 10px;
      }

      .lab-node {
        position: relative;
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        min-height: 74px;
        padding: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 5px;
        background:
          linear-gradient(180deg, rgba(31, 35, 45, 0.94), rgba(21, 24, 31, 0.94));
        cursor: grab;
      }

      .lab-node::before {
        content: "";
        position: absolute;
        left: 30px;
        top: -11px;
        height: 10px;
        border-left: 1px dashed rgba(255,255,255,0.22);
      }

      .lab-node:first-child::before {
        display: none;
      }

      .lab-node.is-drag-over {
        border-color: rgba(138, 125, 255, 0.54);
        background: rgba(83, 72, 170, 0.18);
      }

      .lab-node.is-selected {
        border-color: rgba(115, 223, 181, 0.62);
        background:
          linear-gradient(180deg, rgba(30, 72, 59, 0.44), rgba(21, 31, 29, 0.96));
        box-shadow: inset 3px 0 0 rgba(115, 223, 181, 0.72);
      }

      .lab-node-main {
        min-width: 0;
        display: grid;
        gap: 5px;
      }

      .lab-node-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .lab-node-value {
        min-width: 86px;
        color: #eef2ff;
        font-family: "SF Mono", "JetBrains Mono", monospace;
        font-size: 12px;
        text-align: right;
        white-space: nowrap;
      }

      .lab-node-controls {
        display: inline-grid;
        grid-template-columns: repeat(3, 26px);
        gap: 5px;
      }

      .lab-node-control {
        width: 26px;
        height: 26px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 5px;
        background: rgba(255,255,255,0.035);
        color: rgba(255,255,255,0.68);
        cursor: pointer;
        line-height: 1;
      }

      .lab-node-control:hover {
        color: #fff;
        border-color: rgba(138, 125, 255, 0.42);
      }

      .lab-dropzone {
        min-height: 120px;
        margin-top: 10px;
        display: grid;
        place-items: center;
        gap: 8px;
        padding: 18px;
        border: 1px dashed rgba(255,255,255,0.2);
        border-radius: 5px;
        background: rgba(255,255,255,0.018);
        color: var(--muted);
        text-align: center;
      }

      .lab-dropzone.is-drag-over {
        border-color: rgba(115, 223, 181, 0.58);
        background: rgba(30, 83, 65, 0.12);
      }

      .lab-dropzone-plus {
        font-size: 42px;
        line-height: 1;
        color: rgba(255,255,255,0.62);
      }

      .lab-field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .lab-quote-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
      }

      .lab-route-editor {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: end;
        margin-top: 12px;
      }

      .lab-route-path {
        min-height: 40px;
        display: flex;
        align-items: center;
        gap: 7px;
        flex-wrap: wrap;
        margin-top: 7px;
        padding: 8px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 5px;
        background: rgba(255,255,255,0.025);
      }

      .lab-route-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 24px;
        padding: 0 8px;
        border: 1px solid rgba(115, 223, 181, 0.22);
        border-radius: 5px;
        color: #dffcf1;
        background: rgba(30, 83, 65, 0.18);
        font-family: "SF Mono", "JetBrains Mono", monospace;
        font-size: 11px;
      }

      .lab-route-chip.is-end {
        border-color: rgba(138, 125, 255, 0.3);
        background: rgba(83, 72, 170, 0.18);
      }

      .lab-route-arrow {
        color: var(--muted);
        font-size: 12px;
      }

      .lab-add-hop-button {
        min-height: 40px;
        white-space: nowrap;
      }

      .lab-quote-card {
        min-height: 64px;
        display: grid;
        gap: 6px;
        align-content: center;
        padding: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 5px;
        background: rgba(255,255,255,0.035);
      }

      .lab-quote-card.is-wide {
        grid-column: 1 / -1;
      }

      .lab-quote-card span {
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .lab-quote-card strong {
        font-family: "SF Mono", "JetBrains Mono", monospace;
        font-size: 18px;
        font-weight: 500;
      }

      .lab-quote-card.is-positive strong {
        color: #8ef0af;
      }

      .lab-quote-card.is-negative strong {
        color: #ff9aa7;
      }

      .lab-route-quotes {
        display: grid;
        gap: 8px;
        margin-top: 14px;
        min-height: 0;
      }

      .lab-route-quotes-list {
        display: grid;
        gap: 10px;
        max-height: clamp(150px, 24vh, 320px);
        overflow-y: auto;
        overscroll-behavior: contain;
        padding-right: 4px;
      }

      .lab-route-quotes-list::-webkit-scrollbar {
        width: 6px;
      }

      .lab-route-quotes-list::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(255,255,255,0.18);
      }

      .lab-route-quote-step {
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 5px;
        overflow: hidden;
        background: rgba(255,255,255,0.025);
      }

      .lab-route-quote-step-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        color: #e8ecf2;
        font-family: "SF Mono", "JetBrains Mono", monospace;
        font-size: 11px;
      }

      .lab-route-quote-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(120px, auto);
        gap: 10px;
        align-items: center;
        padding: 9px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.045);
      }

      .lab-route-quote-row:last-child {
        border-bottom: 0;
      }

      .lab-route-quote-row.is-best {
        background: rgba(115, 223, 181, 0.09);
      }

      .lab-route-quote-row strong {
        display: block;
        color: #eef2ff;
        font-family: "SF Mono", "JetBrains Mono", monospace;
        font-size: 13px;
        font-weight: 600;
      }

      .lab-route-quote-row span {
        display: inline-flex;
        color: var(--muted);
        font-size: 11px;
      }

      .lab-route-quote-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        flex-wrap: wrap;
        text-align: right;
      }

      .lab-best-pill,
      .lab-verified-pill {
        min-height: 18px;
        padding: 0 6px;
        border-radius: 5px;
        color: #9ff4bd !important;
        background: rgba(35, 113, 70, 0.28);
        font-family: "SF Mono", "JetBrains Mono", monospace;
        font-size: 10px !important;
      }

      .lab-verified-pill {
        color: #b8cffc !important;
        background: rgba(76, 117, 190, 0.22);
      }

      .lab-execution-note {
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 5px;
        background: rgba(255,255,255,0.025);
      }

      .lab-action-row {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
        gap: 10px;
        margin-top: 12px;
      }

      .lab-action-row .action-button {
        min-height: 50px;
      }

      .lab-action-row .action-button:disabled {
        opacity: 0.42;
        cursor: not-allowed;
      }

      @media (max-width: 1440px) {
        .lab-layout {
          grid-template-columns: minmax(0, 1fr);
        }

        .lab-palette-panel .panel-inner,
        .lab-canvas-panel .panel-inner,
        .lab-inspector-panel .panel-inner {
          height: auto;
          overflow: visible;
        }

        .lab-action-palette {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 780px) {
        .lab-action-palette,
        .lab-field-grid,
        .lab-quote-grid,
        .lab-route-editor,
        .lab-action-row {
          grid-template-columns: minmax(0, 1fr);
        }

        .lab-route-quote-row {
          grid-template-columns: minmax(0, 1fr);
        }

        .lab-route-quote-meta {
          justify-content: flex-start;
          text-align: left;
        }

        .lab-node {
          grid-template-columns: 34px minmax(0, 1fr);
        }

        .lab-node-controls {
          grid-column: 1 / -1;
          justify-content: end;
        }
      }
`;
