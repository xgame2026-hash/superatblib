import { DASHBOARD_CONSOLE_STYLES } from './dashboard-console-module.js';
import { DASHBOARD_TXGRAPH_STYLES } from './dashboard-txgraph-module.js';

export const DASHBOARD_BASE_STYLES = String.raw`
      :root {
        --bg: #111315;
        --bg-soft: #16191e;
        --panel: #1a1d22;
        --panel-2: #171a20;
        --border: rgba(255, 255, 255, 0.08);
        --border-strong: rgba(124, 108, 255, 0.45);
        --text: #f5f7fa;
        --muted: #9ca5b3;
        --soft: #c4c9d4;
        --purple: #8a7dff;
        --purple-2: #6d62e8;
        --green: #69f0ae;
        --yellow: #ffd166;
        --red: #ff7a7a;
        --blue: #4fa2ff;
        --shadow: 0 22px 70px rgba(0, 0, 0, 0.32);
        --radius: 5px;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-width: 0;
        height: 100%;
        background:
          radial-gradient(circle at top left, rgba(138, 125, 255, 0.12), transparent 22%),
          linear-gradient(180deg, #111315 0%, #0f1114 100%);
        color: var(--text);
        font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
      }

      body {
        overflow: hidden;
      }

      button,
      input,
      select {
        font: inherit;
      }

      .mono,
      .nav-icon,
      .stat-value,
      .terminal-output,
      table,
      .top-pill,
      .metric-strip-value {
        font-family: "SF Mono", "JetBrains Mono", "Menlo", monospace;
      }

      .app-shell {
        position: relative;
        width: 100%;
        height: 100vh;
        display: grid;
        grid-template-columns: 64px minmax(0, 1fr);
        grid-template-rows: 64px minmax(0, 1fr);
        background: #111315;
        overflow: hidden;
      }

      .sidebar {
        grid-column: 1;
        grid-row: 2;
        position: relative;
        z-index: 1;
        background: #1A1B1E;
        border-right: 1px solid rgba(255, 255, 255, 0.045);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 14px 6px 12px;
        gap: 16px;
      }

      .brand-badge {
        display: none;
      }

      .brand-badge img {
        width: 34px;
        height: 34px;
        object-fit: contain;
      }

      .sidebar-section {
        width: 100%;
        display: grid;
        gap: 14px;
      }

      .sidebar-caption {
        display: none;
      }

      .sidebar-nav {
        display: grid;
        gap: 16px;
        width: 100%;
        justify-items: center;
      }

      .nav-button {
        width: 46px;
        height: 46px;
        border-radius: 12px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        display: grid;
        place-items: center;
        transition: background 140ms ease, border-color 140ms ease, opacity 140ms ease;
        box-shadow: none;
      }

      .nav-button:hover {
        background: rgba(29, 31, 36, 0.38);
      }

      .nav-button.active {
        background: rgba(112, 100, 255, 0.14);
        border-color: rgba(138, 125, 255, 0.24);
        color: var(--text);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
      }

      .nav-icon {
        width: 26px;
        height: 26px;
        opacity: 0.68;
        object-fit: contain;
        filter: brightness(0) saturate(100%) invert(84%) sepia(6%) saturate(201%) hue-rotate(183deg) brightness(85%) contrast(86%);
      }

      .nav-button.active .nav-icon {
        opacity: 1;
        filter: brightness(0) saturate(100%) invert(68%) sepia(28%) saturate(1615%) hue-rotate(208deg) brightness(103%) contrast(102%);
      }

      .nav-button[data-page="txgraph"] .nav-icon {
        opacity: 0.9;
      }

      .nav-button.active[data-page="txgraph"] .nav-icon {
        opacity: 1;
      }

      .workspace {
        grid-column: 2;
        grid-row: 2;
        position: relative;
        z-index: 1;
        height: 100%;
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        min-width: 0;
      }

      .topbar {
        grid-column: 1 / -1;
        grid-row: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.045);
        background: #1A1B1E;
        position: sticky;
        top: 0;
        z-index: 30;
      }

      .topbar-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 160px;
      }

      .logo-lockup {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .logo-word {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 800;
        letter-spacing: 0.02em;
      }

      .logo-aave {
        width: 34px;
        height: 34px;
        object-fit: contain;
      }

      .logo-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 20px;
        padding: 0 7px;
        border: 1.5px solid rgba(255,255,255,0.78);
        border-radius: 3px;
        color: rgba(255,255,255,0.9);
        font-size: 14px;
        font-weight: 300;
        line-height: 1;
        letter-spacing: 0;
        background: transparent;
      }

      .topbar .logo-chip {
        position: relative;
        overflow: hidden;
        border: 0;
        padding: 0 8px;
        min-height: 22px;
        color: rgba(255,255,255,0.92);
        background: rgba(255,255,255,0.02);
        isolation: isolate;
      }

      .topbar .logo-chip::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 3px;
        padding: 1px;
        background: linear-gradient(120deg, rgba(255,255,255,0.50), rgba(138,125,255,0.95), rgba(95,213,182,0.92), rgba(255,255,255,0.52));
        background-size: 220% 220%;
        animation: chip-border-shift 3.8s linear infinite;
        -webkit-mask:
          linear-gradient(#000 0 0) content-box,
          linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
      }

      .topbar .logo-chip::after {
        content: "";
        position: absolute;
        top: -35%;
        left: -42%;
        width: 34%;
        height: 170%;
        background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.28), rgba(255,255,255,0));
        transform: rotate(18deg);
        animation: chip-sweep 3.2s ease-in-out infinite;
        pointer-events: none;
      }

      @keyframes chip-border-shift {
        0% { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
      }

      @keyframes chip-sweep {
        0%, 18% {
          transform: translateX(0) rotate(18deg);
          opacity: 0;
        }
        24% {
          opacity: 1;
        }
        56% {
          transform: translateX(390%) rotate(18deg);
          opacity: 0.92;
        }
        100% {
          transform: translateX(390%) rotate(18deg);
          opacity: 0;
        }
      }

      .topbar-center {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 18px;
      }

      .top-center-icon {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        opacity: 0.86;
      }

      .top-center-icon img {
        width: 22px;
        height: 22px;
        object-fit: contain;
      }

      .topbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: flex-end;
        min-width: 220px;
        position: relative;
      }

      .top-icons {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .icon-button {
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        border-radius: 5px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.04);
      }

      .icon-button img {
        width: 15px;
        height: 15px;
        opacity: 0.78;
        object-fit: contain;
      }

      .top-pill,
      .ghost-button,
      .action-button,
      .connect-button {
        border-radius: 5px;
        border: 1px solid var(--border);
      }

      .top-pill {
        padding: 7px 10px;
        color: var(--muted);
        background: rgba(255,255,255,0.03);
        font-size: 11px;
        cursor: pointer;
      }

      .top-pill.active {
        color: #ecfff8;
        border-color: rgba(115, 223, 181, 0.58);
        background: rgba(103, 214, 173, 0.24);
      }

      .connect-button,
      .ghost-button,
      .action-button {
        background: rgba(255,255,255,0.04);
        color: var(--text);
        padding: 9px 12px;
        cursor: pointer;
      }

      .connect-button {
        display: inline-flex;
        align-items: center;
        gap: 0;
        padding: 0;
        background: rgba(255,255,255,0.06);
        border-color: rgba(255,255,255,0.16);
        height: 36px;
        font-size: 12px;
        font-weight: 500;
        overflow: hidden;
      }

      .action-button.primary {
        background: linear-gradient(180deg, rgba(138, 125, 255, 0.24), rgba(138, 125, 255, 0.08));
        border-color: rgba(138, 125, 255, 0.48);
      }

      .ghost-button:hover,
      .action-button:hover,
      .connect-button:hover,
      .icon-button:hover {
        border-color: rgba(138, 125, 255, 0.42);
      }

      .connect-button img {
        width: 14px;
        height: 14px;
        object-fit: contain;
      }

      .connect-main img {
        width: 18px;
        height: 18px;
      }

      .connect-main {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        height: 36px;
        padding: 0 14px;
      }

      .connect-arrow-box {
        width: 35px;
        height: 36px;
        display: grid;
        place-items: center;
        border-left: 1px solid rgba(255,255,255,0.22);
      }

      .connect-arrow-box img {
        width: 9px;
        height: 9px;
        transform: rotate(-90deg);
        transition: transform 180ms ease;
      }

      .version-menu {
        position: relative;
      }

      .version-menu.open .connect-arrow-box img {
        transform: rotate(0deg);
      }

      .version-dropdown {
        position: absolute;
        right: 0;
        top: 44px;
        width: 260px;
        padding: 14px 16px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.14);
        background: #1a1d22;
        box-shadow: 0 18px 54px rgba(0,0,0,0.36);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-6px);
        transition: opacity 160ms ease, transform 160ms ease, visibility 160ms ease;
        z-index: 60;
      }

      .version-menu.open .version-dropdown {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      .version-dropdown-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
        margin-bottom: 5px;
      }

      .version-dropdown-sub {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }

	      .content-scroll {
	        overflow: auto;
	        min-height: 0;
	        height: 100%;
	        display: flex;
	        flex-direction: column;
	        padding: 22px 18px 82px;
	      }

      .page {
        display: none;
        min-height: 0;
        flex: 0 0 auto;
      }

      .page.active {
        display: grid;
        gap: 16px;
        align-content: start;
        flex: 1 0 auto;
      }

      #pageConsole.page.active {
        grid-template-rows: auto minmax(0, 1fr);
      }

      #pageTxgraph.page.active {
        grid-template-rows: auto minmax(0, 1fr);
      }

      .page-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        padding: 4px 0 2px;
      }

      .page-title {
        font-size: 21px;
        font-weight: 620;
        letter-spacing: -0.018em;
        line-height: 1.12;
      }

      .page-sub {
        color: var(--muted);
        font-size: 13px;
        margin-top: 6px;
        max-width: 860px;
      }

      .panel {
        background: linear-gradient(180deg, rgba(28, 31, 37, 0.98), rgba(21, 24, 29, 0.98));
        border: 1px solid var(--border);
        border-radius: 5px;
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      .panel-inner {
        padding: 16px 18px;
      }

      .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      .panel-title {
        font-size: 16px;
        font-weight: 700;
      }

      .panel-sub {
        color: var(--muted);
        font-size: 12px;
        margin-top: 4px;
      }

      .panel-sub:empty {
        display: none;
      }

      .tiny {
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .overview-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
      }

      .summary-card {
        padding: 0;
      }

      .summary-card .panel-inner {
        padding: 0;
      }

      .summary-head,
      .summary-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 13px 20px;
      }

      .summary-head {
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }

      .summary-title-row {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .summary-title-row .panel-title {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .summary-grid {
        position: relative;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 18px;
        padding: 0 20px;
      }

      .summary-col {
        min-width: 0;
      }

      .summary-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 16px;
        min-height: 46px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }

      .summary-label {
        color: #a9afb9;
        font-family: "SF Mono", "JetBrains Mono", monospace;
        font-size: 13px;
        font-weight: 400;
        letter-spacing: 0.01em;
      }

      .summary-value {
        color: #e8ecf2;
        font-family: "SF Mono", "JetBrains Mono", monospace;
        font-size: 14px;
        font-weight: 400;
        letter-spacing: 0.01em;
      }

      .summary-foot {
        color: #a6abb5;
        font-size: 11px;
        min-height: 34px;
      }

      .summary-head .chart-info-icon {
        width: 15px;
        height: 15px;
        opacity: 0.58;
      }

      .chart-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .chart-box {
        min-height: 320px;
      }

      .chart-stage {
        min-height: 248px;
        background: transparent;
        overflow: hidden;
        position: relative;
      }

      .chart-stage svg {
        display: block;
        width: 100%;
        height: 248px;
      }

      .chart-stage canvas {
        display: block;
        width: 100% !important;
        height: 100% !important;
      }

      .chart-watermark {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 0;
      }

      .chart-watermark img {
        width: min(260px, 44%);
        max-width: 260px;
        opacity: 0.26;
        filter: saturate(1.08) brightness(1.08);
        object-fit: contain;
        user-select: none;
      }

      .chart-stage canvas,
      .chart-stage .chart-empty {
        position: relative;
        z-index: 1;
      }

      .chart-widget {
        padding: 0;
      }

      .chart-widget .panel-inner {
        padding: 0;
      }

      .chart-widget-head,
      .chart-widget-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
      }

      .chart-widget-head {
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }

      .chart-widget-foot {
        border-top: 1px solid rgba(255,255,255,0.05);
        color: #a6abb5;
        font-size: 11px;
        min-height: 34px;
      }

      .chart-title-row {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .info-trigger {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 15px;
        height: 15px;
        flex: 0 0 auto;
      }

      .chart-title-row .panel-title {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }

      .chart-info-icon {
        width: 15px;
        height: 15px;
        object-fit: contain;
        opacity: 0.58;
      }

      .info-popover {
        position: absolute;
        top: calc(100% + 12px);
        left: -14px;
        z-index: 8;
        width: 260px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.12);
        background: #2a2b31;
        color: #f0f3f8;
        box-shadow: 0 18px 36px rgba(0,0,0,0.32);
        font-size: 11px;
        line-height: 1.35;
        letter-spacing: -0.02em;
        opacity: 0;
        pointer-events: none;
        transform: translateY(6px);
        transition: opacity 140ms ease, transform 140ms ease;
      }

      .info-trigger:hover .info-popover,
      .info-trigger:focus-within .info-popover {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }

      .chart-expand-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
      }

      .chart-expand-icon img {
        width: 14px;
        height: 14px;
        object-fit: contain;
        opacity: 0.92;
      }

      .chart-frame {
        padding: 12px 16px 8px;
      }

      .chart-frame .chart-stage {
        min-height: 286px;
      }

      .chart-frame .chart-stage svg {
        height: 286px;
      }

      .chart-updated {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
      }

      .chart-updated::before {
        content: "";
        width: 12px;
        height: 12px;
        display: inline-block;
        background: url("/img/time.svg") center/contain no-repeat;
        opacity: 0.78;
      }

      .chart-empty {
        min-height: 248px;
        display: grid;
        place-items: center;
        color: var(--muted);
        font-size: 13px;
      }

      .chart-tooltip {
        position: absolute;
        z-index: 3;
        min-width: 220px;
        max-width: 280px;
        padding: 12px 14px;
        border-radius: 4px;
        border: 1px solid rgba(112, 226, 164, 0.65);
        background: rgba(245, 245, 245, 0.88);
        color: #171a1f;
        box-shadow: 0 12px 28px rgba(0,0,0,0.32);
        pointer-events: none;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 120ms ease, transform 120ms ease;
      }

      .chart-tooltip.open {
        opacity: 1;
        transform: translateY(0);
      }

      .chart-tooltip.distribution-tooltip {
        min-width: 280px;
        border-color: rgba(79, 162, 255, 0.9);
        background: rgba(246, 246, 246, 0.9);
        box-shadow: 0 16px 30px rgba(0,0,0,0.28);
      }

      .chart-tooltip.distribution-tooltip::after {
        content: "";
        position: absolute;
        left: 50%;
        bottom: -6px;
        width: 12px;
        height: 12px;
        background: rgba(246, 246, 246, 0.9);
        border-right: 1px solid rgba(79, 162, 255, 0.9);
        border-bottom: 1px solid rgba(79, 162, 255, 0.9);
        transform: translateX(-50%) rotate(45deg);
      }

      .chart-tooltip.distribution-tooltip .chart-tooltip-row {
        justify-content: flex-start;
        gap: 10px;
      }

      .chart-tooltip-title {
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .chart-tooltip-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 11px;
        margin-top: 6px;
      }

      .chart-tooltip-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #2b3037;
      }

      .chart-tooltip-value {
        font-weight: 700;
        color: #171a1f;
      }

      .chart-tooltip-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        display: inline-block;
        flex: 0 0 auto;
      }

      .chart-tooltip-line {
        color: #2b3037;
        line-height: 1.2;
      }

      .skeleton-line,
      .skeleton-block,
      .skeleton-table-cell {
        position: relative;
        overflow: hidden;
        background: rgba(255,255,255,0.06);
      }

      .skeleton-line::after,
      .skeleton-block::after,
      .skeleton-table-cell::after {
        content: "";
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.09), transparent);
        animation: skeleton-slide 1.15s linear infinite;
      }

      .skeleton-line {
        height: 10px;
        border-radius: 4px;
      }

      .skeleton-block {
        border-radius: 4px;
      }

      .skeleton-table-cell {
        height: 10px;
        border-radius: 4px;
      }

      .overview-surface-card-skeleton .overview-surface-card-head-copy {
        min-width: 0;
        flex: 1 1 auto;
      }

      .overview-surface-skeleton-title {
        width: 38%;
        height: 14px;
        margin-bottom: 10px;
      }

      .overview-surface-skeleton-sub {
        width: 52%;
        height: 10px;
      }

      .overview-surface-skeleton-button {
        width: 112px;
        height: 30px;
        border-radius: 8px;
      }

      .overview-surface-skeleton-label {
        display: block;
        width: 46px;
        height: 10px;
      }

      .overview-surface-skeleton-value {
        display: block;
        width: 58px;
        height: 12px;
      }

      @keyframes skeleton-slide {
        100% {
          transform: translateX(100%);
        }
      }

      @keyframes latest-date-picker-in {
        from {
          opacity: 0;
          transform: scale(0.96);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .protocol-table-wrap,
      .table-wrap {
        overflow: auto;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.05);
      }

      .leaderboard-panel .panel-inner {
        padding: 16px 18px 18px;
      }

      .latest-liquidation-panel .panel-inner {
        padding: 14px 16px 16px;
      }

      .latest-liquidation-shell {
        overflow: visible;
        position: relative;
        z-index: 4;
      }

      .latest-liquidation-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 10px;
        margin-bottom: 10px;
      }

      .latest-liquidation-toolbar-left,
      .latest-liquidation-toolbar-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .latest-date-control {
        position: relative;
        width: min(30%, 216px);
        min-width: 196px;
        cursor: pointer;
      }

      .latest-date-input {
        width: 100%;
        height: 42px;
        padding: 0 14px 0 42px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(38, 40, 47, 0.92);
        color: #d8dde5;
        font-size: 13px;
        outline: none;
        cursor: pointer;
        user-select: none;
      }

      .latest-date-input[data-empty="1"] {
        color: transparent;
      }

      .latest-date-input::-webkit-calendar-picker-indicator {
        opacity: 0;
        cursor: pointer;
      }

      .latest-date-icon {
        position: absolute;
        left: 14px;
        top: 50%;
        width: 16px;
        height: 16px;
        transform: translateY(-50%);
        opacity: 0.7;
        pointer-events: none;
      }

      .latest-date-placeholder {
        position: absolute;
        left: 42px;
        top: 50%;
        transform: translateY(-50%);
        color: #8b919d;
        font-size: 13px;
        pointer-events: none;
      }

      .latest-date-control.has-value .latest-date-placeholder {
        display: none;
      }

      .latest-date-clear {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        width: 24px;
        height: 24px;
        display: none;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #d9dde4;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }

      .latest-date-control.has-value .latest-date-clear {
        display: inline-flex;
      }

      .latest-date-clear:hover {
        background: rgba(255,255,255,0.04);
      }

      .latest-date-picker {
        position: absolute;
        left: 0;
        top: calc(100% + 8px);
        z-index: 80;
        width: 100%;
        min-width: 286px;
        max-width: 332px;
        padding: 12px 12px 12px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(38, 40, 47, 0.98);
        box-shadow: 0 20px 40px rgba(0,0,0,0.35);
        transform-origin: left top;
        animation: latest-date-picker-in 140ms ease-out;
      }

      .latest-date-picker-head {
        display: grid;
        grid-template-columns: 34px 1fr 34px;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
      }

      .latest-date-picker-title {
        text-align: center;
        color: #d6dae2;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.01em;
      }

      .latest-date-picker-nav {
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #d6dae2;
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
      }

      .latest-date-picker-nav:hover {
        background: rgba(255,255,255,0.04);
      }

      .latest-date-picker-weekdays {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        margin-bottom: 6px;
      }

      .latest-date-picker-weekday {
        text-align: center;
        color: #a6adb8;
        font-size: 12px;
        padding: 6px 0;
      }

      .latest-date-picker-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
      }

      .latest-date-picker-day {
        width: 100%;
        aspect-ratio: 1 / 1;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #7e8591;
        font-size: 13px;
        font-weight: 400;
        cursor: pointer;
      }

      .latest-date-picker-day:hover {
        background: rgba(255,255,255,0.04);
        color: #d9dde4;
      }

      .latest-date-picker-day.is-current {
        color: #d9dde4;
      }

      .latest-date-picker-day.is-weekend.is-current {
        color: #ff727d;
      }

      .latest-date-picker-day.is-selected {
        background: rgba(86, 215, 186, 0.18);
        color: #eef6ff;
        box-shadow: inset 0 0 0 1px rgba(86, 215, 186, 0.35);
      }

      .latest-unit-toggle {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 4px;
        border-radius: 9px;
        background: rgba(17, 18, 22, 0.72);
      }

      .latest-unit-button {
        min-width: 74px;
        height: 34px;
        padding: 0 16px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #aeb4bf;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 140ms ease, color 140ms ease;
      }

      .latest-unit-button.active {
        background: rgba(48, 50, 58, 0.98);
        color: #f2f5fb;
      }

      .latest-liquidation-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 14px;
        position: relative;
        z-index: 2;
      }

      .latest-liquidation-pagination {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        flex-wrap: wrap;
        color: #afb4be;
        font-size: 13px;
        position: relative;
        z-index: 2;
      }

      .latest-page-size-wrap {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        white-space: nowrap;
      }

      .latest-page-size-label {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        white-space: nowrap;
        font-size: 12px;
      }

      .latest-page-size-label img {
        width: 13px;
        height: 13px;
        opacity: 0.7;
      }

      .latest-page-size-select-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
      }

      .latest-page-size-select {
        appearance: none;
        -webkit-appearance: none;
        min-width: 78px;
        height: 34px;
        padding: 0 30px 0 12px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(38, 40, 47, 0.94);
        color: #eef1f6;
        font-size: 13px;
      }

      .latest-page-size-select-wrap::after {
        content: '';
        position: absolute;
        right: 10px;
        top: 50%;
        width: 10px;
        height: 10px;
        transform: translateY(-50%);
        background: url('/img/updown.svg') center / contain no-repeat;
        opacity: 0.8;
        pointer-events: none;
      }

      .latest-page-button {
        position: relative;
        z-index: 2;
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 7px;
        background: rgba(63, 68, 80, 0.86);
        color: #eef1f6;
        font-size: 19px;
        line-height: 1;
        cursor: pointer;
      }

      .latest-page-button.is-ghost {
        background: transparent;
      }

      .latest-page-button:disabled {
        opacity: 0.32;
        cursor: default;
      }

      .latest-range {
        min-width: 70px;
        text-align: center;
        font-size: 13px;
      }

      .latest-liquidation-table td:first-child,
      .latest-liquidation-table th:first-child {
        padding-left: 14px;
      }

      .latest-liquidation-table td:last-child,
      .latest-liquidation-table th:last-child {
        padding-right: 14px;
      }

      .leaderboard-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0;
      }

      .leaderboard-tabs {
        position: relative;
        display: flex;
        align-items: flex-end;
        gap: 34px;
        padding: 0;
        margin-top: 8px;
      }

      .leaderboard-tabs::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: rgba(255,255,255,0.08);
      }

      .leaderboard-table-wrap {
        padding: 0;
      }

      .leaderboard-tab {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        padding: 0 0 10px;
        border: 0;
        background: transparent;
        color: #9fa6b2;
        font-size: 14px;
        font-weight: 400;
        cursor: pointer;
      }

      .leaderboard-tab.active {
        color: #f4f6fa;
        font-weight: 650;
      }

      .leaderboard-tab.active::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: -1px;
        height: 3px;
        background: rgba(103, 214, 173, 0.7);
      }

      .leaderboard-table th,
      .leaderboard-table td {
        text-align: left;
        padding-top: 15px;
        padding-bottom: 15px;
      }

      .leaderboard-table th.is-numeric,
      .leaderboard-table td.is-numeric {
        text-align: right;
      }

      .leaderboard-table th.is-center,
      .leaderboard-table td.is-center {
        text-align: center;
      }

      .leaderboard-address {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .leaderboard-identicon {
        width: 16px;
        height: 16px;
        border-radius: 4px;
        flex: 0 0 auto;
        image-rendering: pixelated;
        object-fit: cover;
      }

      .leaderboard-address-text {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .leaderboard-address-copy {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        flex: 0 0 auto;
      }

      .leaderboard-address-value {
        color: #54b498;
        text-decoration: none;
        white-space: nowrap;
        transition: text-decoration-color 160ms ease;
      }

      .leaderboard-address:hover .leaderboard-address-value,
      .leaderboard-address:focus-within .leaderboard-address-value {
        text-decoration: underline;
        text-underline-offset: 3px;
        text-decoration-thickness: 1px;
      }

      .leaderboard-address-value.as-link {
        display: inline-flex;
        align-items: center;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        font: inherit;
      }

      .leaderboard-address-copy img {
        width: 14px;
        height: 14px;
        object-fit: contain;
        opacity: 0.46;
        transition: opacity 160ms ease, transform 160ms ease;
      }

      .leaderboard-address-copy:hover img,
      .leaderboard-address-copy:focus-visible img {
        opacity: 0.8;
      }

      .leaderboard-address-copy.is-copied img {
        opacity: 1;
        transform: scale(0.94);
      }

      .leaderboard-copy-tooltip {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 10px);
        transform: translateX(-50%) translateY(4px);
        padding: 8px 12px;
        border-radius: 8px;
        background: rgba(39, 40, 49, 0.96);
        color: #f3f4f7;
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
        opacity: 0;
        pointer-events: none;
        transition: opacity 160ms ease, transform 160ms ease;
        z-index: 8;
      }

      .leaderboard-address-copy:hover .leaderboard-copy-tooltip,
      .leaderboard-address-copy:focus-visible .leaderboard-copy-tooltip {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .leaderboard-asset {
        display: inline-flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }

      .leaderboard-asset-part {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
      }

      .leaderboard-asset-value {
        color: #54b498;
        white-space: nowrap;
      }

      .leaderboard-asset img {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        object-fit: cover;
      }

      .leaderboard-table td:first-child,
      .leaderboard-table th:first-child {
        padding-left: 16px;
      }

      .leaderboard-table td:last-child,
      .leaderboard-table th:last-child {
        padding-right: 16px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 14px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        text-align: left;
        vertical-align: middle;
        font-size: 12px;
        line-height: 1.3;
        transition: background-color 160ms ease;
      }

      th {
        background: rgba(20, 22, 28, 0.98);
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding-top: 13px;
        padding-bottom: 13px;
      }

      .protocol-name {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .protocol-name img {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        object-fit: cover;
      }

      .protocol-table th:nth-child(n + 2),
      .protocol-table td:nth-child(n + 2) {
        text-align: right;
      }

      .protocol-summary-table th:nth-child(n + 3),
      .protocol-summary-table td:nth-child(n + 3) {
        text-align: center;
      }

      .protocol-summary-table {
        table-layout: fixed;
        width: 100%;
      }

      .protocol-summary-table col.strategy-col-market {
        width: 22%;
      }

      .protocol-summary-table col.strategy-col-segment {
        width: 14%;
      }

      .protocol-summary-table col.strategy-col-priority {
        width: 8.5%;
      }

      .protocol-summary-table col.strategy-col-status {
        width: 9%;
      }

      .protocol-summary-table col.strategy-col-competition {
        width: 7.5%;
      }

      .protocol-summary-table col.strategy-col-next {
        width: auto;
      }

      th#smMarket,
      #strategyMarketRows td:nth-child(1) {
        width: 22%;
        min-width: 190px;
        text-align: left;
      }

      th#smSegment,
      #strategyMarketRows td:nth-child(2) {
        width: 14%;
        min-width: 150px;
        white-space: nowrap;
      }

      th#smPriority,
      #strategyMarketRows td:nth-child(3) {
        width: 8.5%;
        min-width: 104px;
        white-space: nowrap;
      }

      th#smStatus,
      #strategyMarketRows td:nth-child(4) {
        width: 9%;
        min-width: 82px;
        white-space: nowrap;
      }

      th#smCompetition,
      #strategyMarketRows td:nth-child(5) {
        width: 7.5%;
        min-width: 66px;
        white-space: nowrap;
      }

      th#smNext,
      #strategyMarketRows td:last-child {
        width: 39%;
        text-align: left;
        vertical-align: middle;
      }

      .protocol-table.leaderboard-table th:not(.is-numeric),
      .protocol-table.leaderboard-table td:not(.is-numeric) {
        text-align: left;
      }

      .protocol-table tbody tr:hover td {
        background: rgba(255,255,255,0.035);
      }

      .strategy-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 48px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 12px;
        line-height: 1.2;
        font-weight: 600;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
      }

      .strategy-chip.status-good {
        background: rgba(93, 227, 157, 0.12);
        border-color: rgba(93, 227, 157, 0.28);
      }

      .strategy-chip.status-warn {
        background: rgba(255, 202, 87, 0.12);
        border-color: rgba(255, 202, 87, 0.28);
      }

      .strategy-chip.status-bad {
        background: rgba(255, 107, 122, 0.12);
        border-color: rgba(255, 107, 122, 0.28);
      }

      .strategy-chip.status-blue {
        background: rgba(96, 165, 250, 0.12);
        border-color: rgba(96, 165, 250, 0.28);
      }

      .strategy-next-cell {
        display: grid;
        grid-template-rows: auto minmax(42px, auto) auto;
        gap: 8px;
        align-items: start;
        justify-content: stretch;
        align-content: center;
        min-width: 0;
      }

      .strategy-insight-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        min-height: 22px;
      }

      .strategy-insight-badge {
        min-height: 20px;
        padding: 2px 7px;
        font-size: 9px;
        line-height: 1;
      }

      .strategy-row-selected td {
        background: rgba(138, 125, 255, 0.06);
      }

      .strategy-row-selected:hover td {
        background: rgba(138, 125, 255, 0.09) !important;
      }

      .strategy-next-text {
        line-height: 1.55;
        overflow-wrap: anywhere;
        word-break: break-word;
        min-height: 42px;
        display: block;
      }

      .strategy-market-badges {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 4px;
        vertical-align: middle;
      }

      .strategy-market-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 20px;
        padding: 2px 7px;
        border-radius: 999px;
        font-size: 9px;
        line-height: 1;
        font-weight: 700;
        color: #e7ebf4;
        background: rgba(138, 125, 255, 0.14);
        border: 1px solid rgba(138, 125, 255, 0.32);
      }

      .strategy-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        min-height: 26px;
      }

      .strategy-action-button {
        min-height: 26px;
        padding: 3px 8px;
        font-size: 10px;
        color: #d9deea;
        background: rgba(255,255,255,0.03);
      }

      .strategy-action-button:hover {
        border-color: rgba(138, 125, 255, 0.48);
        background: rgba(138, 125, 255, 0.10);
      }

      .strategy-action-button.is-current-market,
      .strategy-action-button:disabled {
        color: #ece9ff;
        background: rgba(138, 125, 255, 0.16);
        border-color: rgba(138, 125, 255, 0.34);
        cursor: default;
        opacity: 1;
      }

      .strategy-action-button.is-current-market:hover,
      .strategy-action-button:disabled:hover {
        background: rgba(138, 125, 255, 0.16);
        border-color: rgba(138, 125, 255, 0.34);
      }

      #strategyMarketRows td {
        vertical-align: middle;
      }

      #strategyMarketRows td:first-child .protocol-name {
        display: inline-grid;
        gap: 6px;
        align-items: start;
      }

      .strategy-market-label {
        min-width: 0;
      }

      .strategy-market-title {
        display: block;
        line-height: 1.35;
      }

      .morpho-market-strip {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 14px;
      }

      .morpho-market-card {
        min-height: 78px;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid rgba(79, 162, 255, 0.14);
        background:
          linear-gradient(180deg, rgba(79, 162, 255, 0.08), rgba(79, 162, 255, 0.02)),
          rgba(18, 22, 30, 0.96);
      }

      .morpho-market-card-label {
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .morpho-market-card-value {
        margin-top: 10px;
        color: #eef4ff;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      .morpho-market-table th:nth-child(3),
      .morpho-market-table td:nth-child(3),
      .morpho-market-table th:nth-child(4),
      .morpho-market-table td:nth-child(4),
      .morpho-market-table th:nth-child(5),
      .morpho-market-table td:nth-child(5) {
        text-align: right;
      }

      .morpho-market-pair {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .morpho-market-pair-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #dce2eb;
        white-space: nowrap;
      }

      .morpho-market-pair-item img {
        width: 16px;
        height: 16px;
        border-radius: 999px;
        object-fit: cover;
      }

      .morpho-market-pair-sep {
        color: #6f7784;
      }

      .morpho-market-open {
        padding: 0;
        border: 0;
        background: transparent;
        color: #eef4ff;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: color 140ms ease;
      }

      .morpho-market-open:hover,
      .morpho-market-open:focus-visible {
        color: #7dc4ff;
        outline: none;
      }

      .morpho-market-riskline {
        margin-top: 8px;
      }

      .morpho-market-secondary {
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
      }

      .morpho-opportunity-shell {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid rgba(79, 162, 255, 0.12);
      }

      .morpho-executor-shell {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid rgba(79, 162, 255, 0.12);
      }

      .morpho-executor-head {
        margin-bottom: 10px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .morpho-executor-summary {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .morpho-executor-status-text {
        color: #dce2eb;
        font-size: 13px;
        line-height: 1.45;
      }

      .morpho-opportunity-head {
        margin-bottom: 10px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .morpho-opportunity-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .morpho-opportunity-table th:nth-child(3),
      .morpho-opportunity-table td:nth-child(3),
      .morpho-opportunity-table th:nth-child(4),
      .morpho-opportunity-table td:nth-child(4),
      .morpho-opportunity-table th:nth-child(5),
      .morpho-opportunity-table td:nth-child(5),
      .morpho-opportunity-table th:nth-child(6),
      .morpho-opportunity-table td:nth-child(6) {
        text-align: right;
      }

      .morpho-opportunity-market {
        display: inline-flex;
        flex-direction: column;
        gap: 6px;
      }

      .morpho-opportunity-market-sub {
        color: var(--muted);
        font-size: 12px;
      }

      .morpho-opportunity-drill {
        align-self: flex-start;
        min-height: 28px;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 11px;
        line-height: 1;
      }

      .morpho-blue-disclaimer {
        margin-top: 10px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .modal-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .modal-detail-item {
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        min-width: 0;
      }

      .modal-detail-item.is-full {
        grid-column: 1 / -1;
      }

      .modal-detail-label {
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .modal-detail-value {
        margin-top: 8px;
        color: #eef4ff;
        font-size: 13px;
        line-height: 1.45;
        word-break: break-word;
      }

      .modal-detail-list {
        margin-top: 8px;
        display: grid;
        gap: 8px;
      }

      .modal-detail-note {
        color: #dce2eb;
        line-height: 1.45;
      }

      .metric-strip {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .metric-strip-card {
        padding: 10px 14px 10px;
        border-radius: 5px;
        background: linear-gradient(180deg, rgba(130, 120, 255, 0.34), rgba(109, 98, 232, 0.12));
        border: 1px solid rgba(166, 154, 255, 0.62);
        min-height: 72px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        overflow: hidden;
        box-shadow:
          0 0 0 1px rgba(121, 104, 255, 0.16),
          0 10px 30px rgba(38, 28, 88, 0.22),
          inset 0 1px 0 rgba(255,255,255,0.08);
      }

      .metric-strip-head,
      .metric-strip-value-row {
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: center;
      }

      .metric-strip-head {
        min-height: 20px;
      }

      .metric-strip-head-icon,
      .metric-strip-value-icon {
        width: 28px;
        height: 28px;
        flex: 0 0 28px;
        object-fit: contain;
      }

      .metric-strip-head-icon {
        width: 20px;
        height: 20px;
        flex-basis: 20px;
        opacity: 0.8;
      }

      .metric-strip-chain-name {
        color: rgba(244,246,255,0.96);
        font-size: 12px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
      }

      .metric-strip-label {
        color: rgba(230,235,255,0.68);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        text-align: center;
      }

      .metric-strip-value {
        margin-top: 6px;
        font-size: 17px;
        font-weight: 400;
        line-height: 1.05;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
      }

      .metric-strip-card.metric-strip-icon-card .metric-strip-value-row {
        margin-top: 6px;
      }

      .metric-strip-card.metric-strip-icon-card .metric-strip-value {
        margin-top: 0;
        font-size: 17px;
        font-weight: 400;
        text-align: center;
      }

${DASHBOARD_CONSOLE_STYLES}

      .page-frame {
        border: 0;
        background: transparent;
        padding: 0;
      }

      .settings-layout {
        display: grid;
        gap: 16px;
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .field {
        display: grid;
        gap: 7px;
      }

      .field.full {
        grid-column: 1 / -1;
      }

      .field-label {
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      input,
      select,
      textarea {
        width: 100%;
        background: rgba(255,255,255,0.03);
        color: var(--text);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 5px;
        padding: 10px 12px;
        font-size: 13px;
      }

      input::placeholder,
      textarea::placeholder {
        color: rgba(196, 201, 212, 0.58);
      }

      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus,
      textarea:-webkit-autofill,
      textarea:-webkit-autofill:hover,
      textarea:-webkit-autofill:focus,
      select:-webkit-autofill,
      select:-webkit-autofill:hover,
      select:-webkit-autofill:focus {
        -webkit-text-fill-color: var(--text);
        caret-color: var(--text);
        border: 1px solid rgba(138, 125, 255, 0.22);
        -webkit-box-shadow: 0 0 0 1000px rgba(205, 214, 231, 0.08) inset;
        box-shadow: 0 0 0 1000px rgba(205, 214, 231, 0.08) inset;
        transition: background-color 99999s ease-out 0s;
      }

      textarea {
        resize: vertical;
        min-height: 88px;
      }

      .toggle-row {
        display: grid;
        grid-template-columns: repeat(6, minmax(max-content, 1fr));
        gap: 10px;
        align-items: stretch;
      }

      .toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.08);
        color: var(--soft);
        background: rgba(255,255,255,0.03);
        font-size: 12px;
        width: 100%;
        min-width: 0;
        white-space: nowrap;
        text-align: center;
        cursor: pointer;
        transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
      }

      .toggle input {
        margin: 0;
        width: 16px;
        height: 16px;
        min-width: 16px;
        flex: 0 0 16px;
        appearance: none;
        -webkit-appearance: none;
        border: 0;
        border-radius: 0;
        background: url('/img/select_no.svg') center / 16px 16px no-repeat;
        cursor: pointer;
        box-shadow: none;
        padding: 0;
      }

      .toggle input:checked {
        background-image: url('/img/select_ok.svg');
      }

      .toggle input:focus-visible {
        outline: 0;
        filter: drop-shadow(0 0 0.35rem rgba(138, 125, 255, 0.42));
      }

      .toggle:has(input:checked) {
        border-color: rgba(138, 125, 255, 0.42);
        background: rgba(138, 125, 255, 0.12);
        color: #e2d7ff;
      }

      .button-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      .action-button {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 50px;
        padding: 0 14px;
      }

      .action-button-content {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        line-height: 1;
      }

      .action-button-icon {
        width: 20px;
        height: 20px;
        object-fit: contain;
        opacity: 0.92;
        vertical-align: middle;
        transform: translateY(1px);
      }

      .action-button-label {
        display: inline-flex;
        align-items: center;
        font-size: 13px;
        line-height: 1;
      }

      .action-button:not(.primary) {
        color: rgba(255,255,255,0.68);
      }

      .action-button:not(.primary) .action-button-icon {
        opacity: 0.56;
      }

      @keyframes dashboardActionIconSpin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes dashboardActionIconPulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.42;
          transform: scale(0.84);
        }
      }

      #actionSelfFunded .action-button-icon {
        width: 18px;
        height: 18px;
      }

      #actionSelfFunded.is-running .action-button-icon {
        animation: dashboardActionIconSpin 1s linear infinite;
        transform-origin: center;
      }

      #arbActionStart.is-running .action-button-icon {
        animation: dashboardActionIconSpin 1s linear infinite;
        transform-origin: center;
      }

      #actionPause.is-paused .action-button-icon {
        animation: dashboardActionIconPulse 0.55s ease-in-out infinite;
        transform-origin: center;
      }

      .intel-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      .intel-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        padding: 10px 12px;
        min-height: 92px;
      }

      .intel-label {
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        text-align: center;
      }

      .intel-value {
        margin-top: 8px;
        font-size: 16px;
        font-weight: 700;
        text-align: center;
      }

      .wallet-list,
      .status-list {
        display: grid;
        gap: 10px;
      }

      .status-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
      }

      .console-runtime-strip {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin: 8px 0 14px;
      }

      .console-runtime-metric {
        padding: 10px 12px;
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
        overflow-y: auto;
        padding: 0;
      }

      .console-results-table {
        width: 100%;
        height: auto;
        border-collapse: separate;
        border-spacing: 0;
      }

      .console-results-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #15181e;
      }

      .console-results-table th,
      .console-results-table td {
        padding-left: 18px;
        padding-right: 18px;
      }

      .console-results-table th:nth-child(2),
      .console-results-table th:nth-child(6),
      .console-results-table td:nth-child(2),
      .console-results-table td:nth-child(6) {
        text-align: right;
      }

      .console-results-table td {
        color: #dce2eb;
        vertical-align: top;
        padding-top: 14px;
        padding-bottom: 14px;
      }

      .console-results-table td.status-good {
        color: var(--green);
      }

      .console-results-table td.status-warn {
        color: var(--yellow);
      }

      .console-results-table td.status-bad {
        color: var(--red);
      }

      .console-results-table td:first-child {
        font-family: "SFMono-Regular", SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
        font-size: 11.5px;
        letter-spacing: 0.01em;
      }

      .console-results-table tbody tr:hover td {
        background: rgba(255,255,255,0.03);
      }

      .console-results-table tbody tr.is-liquidatable td {
        background: rgba(86, 18, 24, 0.42);
      }

      .console-results-table tbody tr.is-liquidatable:hover td {
        background: rgba(104, 24, 31, 0.5);
      }

      .console-results-table tbody tr.is-liquidatable td:nth-child(2),
      .console-results-table tbody tr.is-liquidatable td:nth-child(3) {
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

      .intel-distribution-box {
        padding: 10px 12px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        color: #aeb5c0;
        font-size: 12px;
      }

      .targets-layout {
        display: grid;
        gap: 16px;
      }

${DASHBOARD_TXGRAPH_STYLES}

      .settings-select-wrap {
        position: relative;
        display: block;
      }

      .settings-select-wrap::before,
      .settings-custom-select-button::before {
        content: '';
        position: absolute;
        top: 1px;
        right: 52px;
        bottom: 1px;
        width: 1px;
        background: rgba(255,255,255,0.1);
        pointer-events: none;
      }

      .settings-select-wrap::after,
      .settings-custom-select-button::after {
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

      .settings-select-wrap select {
        appearance: none;
        -webkit-appearance: none;
        padding-right: 64px;
      }

      .settings-select-wrap.custom-select-ready select {
        position: absolute;
        inset: 0;
        opacity: 0;
        pointer-events: none;
      }

      .settings-select-wrap.custom-select-ready::before,
      .settings-select-wrap.custom-select-ready::after {
        display: none;
      }

      .settings-custom-select {
        position: relative;
        display: block;
        width: 100%;
      }

      .settings-custom-select-button {
        position: relative;
        width: 100%;
        min-height: 42px;
        padding: 10px 64px 10px 12px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 5px;
        background: rgba(255,255,255,0.03);
        color: var(--text);
        font-size: 13px;
        line-height: 20px;
        text-align: left;
        cursor: pointer;
        transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
      }

      .settings-custom-select-button:hover,
      .settings-custom-select.is-open .settings-custom-select-button {
        border-color: rgba(138, 125, 255, 0.42);
        background: rgba(255,255,255,0.055);
      }

      .settings-custom-select-button:focus-visible {
        outline: 0;
        box-shadow: 0 0 0 3px rgba(138, 125, 255, 0.25);
      }

      .settings-custom-select-menu {
        position: absolute;
        bottom: calc(100% + 6px);
        left: 0;
        right: 0;
        z-index: 90;
        display: none;
        max-height: 220px;
        overflow: auto;
        padding: 6px;
        border: 1px solid rgba(138, 125, 255, 0.32);
        border-radius: 6px;
        background: #1a1d22;
        box-shadow: 0 18px 42px rgba(0,0,0,0.42);
      }

      .settings-custom-select.is-open .settings-custom-select-menu {
        display: grid;
        gap: 4px;
      }

      .settings-custom-select-option {
        width: 100%;
        min-height: 34px;
        padding: 7px 10px;
        border: 0;
        border-radius: 5px;
        background: transparent;
        color: var(--soft);
        font-size: 13px;
        text-align: left;
        cursor: pointer;
      }

      .settings-custom-select-option:hover,
      .settings-custom-select-option.is-selected {
        background: rgba(138, 125, 255, 0.14);
        color: #f2f3f7;
      }


      .targets-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .targets-toolbar-left,
      .targets-toolbar-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .pill-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        font-size: 12px;
        color: var(--soft);
        white-space: nowrap;
        min-height: 42px;
        cursor: pointer;
        transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
      }

      .pill-toggle input {
        margin: 0;
        width: 16px;
        height: 16px;
        min-width: 16px;
        flex: 0 0 auto;
        appearance: none;
        -webkit-appearance: none;
        border: 0;
        border-radius: 0;
        background: url('/img/select_no.svg') center / 16px 16px no-repeat;
        cursor: pointer;
        box-shadow: none;
        padding: 0;
      }

      .pill-toggle input:checked {
        background-image: url('/img/select_ok.svg');
      }

      .pill-toggle input:focus-visible {
        outline: 0;
        filter: drop-shadow(0 0 0.35rem rgba(138, 125, 255, 0.42));
      }

      .pill-toggle:has(input:checked) {
        border-color: rgba(138, 125, 255, 0.42);
        background: rgba(138, 125, 255, 0.12);
        color: #e2d7ff;
      }

      .pill-toggle span {
        display: inline-flex;
        align-items: center;
        white-space: nowrap;
      }

      .selected-target-box {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .selected-target-item {
        padding: 12px 14px;
        border-radius: 5px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
      }

      .selected-target-item strong {
        display: block;
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }

      .settings-layout {
        grid-template-columns: 220px minmax(0, 1fr);
      }

      .settings-menu {
        display: grid;
        gap: 8px;
      }

      .settings-menu button {
        text-align: left;
      }

      .settings-menu button.is-active {
        border-color: rgba(138, 125, 255, 0.48);
        background: rgba(138, 125, 255, 0.12);
        color: #f4f7fb;
      }

      .settings-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px 16px;
      }

      .settings-form-grid .field.full {
        grid-column: 1 / -1;
      }

      .settings-chain-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .settings-chain-icon {
        width: 18px;
        height: 18px;
        object-fit: contain;
        flex: 0 0 auto;
      }

      .settings-field-hidden {
        display: none !important;
      }

      .settings-panel-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .settings-action-button {
        min-height: 36px;
        padding: 0 12px;
      }

      .settings-action-button .action-button-icon {
        width: 16px;
        height: 16px;
      }

      .settings-action-button .action-button-label {
        font-size: 12px;
      }

      .settings-input.is-masked {
        letter-spacing: 0.08em;
      }

      .footer-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: var(--muted);
        font-size: 12px;
        padding-top: 10px;
      }

	      .app-footer {
	        position: fixed;
	        right: 0;
	        bottom: 0;
	        left: 64px;
	        z-index: 18;
	        padding: 18px 22px 16px;
	        border-top: 1px solid rgba(255,255,255,0.045);
	        border-left: 0;
	        border-right: 1px solid rgba(255,255,255,0.045);
        border-bottom: 0;
        border-radius: 0;
        background: #15171b;
        box-shadow: none;
        overflow: visible;
        color: #9ea4ae;
      }

      .app-footer-main,
      .app-footer-bottom {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 18px;
        position: relative;
        z-index: 1;
      }

      .app-footer-bottom {
        margin-top: 18px;
        position: relative;
        z-index: 1;
      }

      .app-footer-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 220px;
        margin-right: auto;
      }

      .app-footer-brand img {
        width: 34px;
        height: 34px;
        object-fit: contain;
        opacity: 0.9;
      }

      .app-footer-chip {
        min-height: 18px;
        padding: 0 6px;
        font-size: 12px;
        border-width: 1px;
        color: rgba(255,255,255,0.56);
        border-color: rgba(255,255,255,0.18);
      }

      .app-footer-nav {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        min-width: 0;
        margin-left: auto;
      }

      .app-footer-links {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 22px;
        min-width: 0;
        margin-left: 0;
        margin-right: 0;
      }

      .app-footer-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #a9afb9;
        font-size: 12px;
        font-weight: 500;
        text-decoration: none;
        white-space: nowrap;
      }

      .app-footer-link img {
        width: 14px;
        height: 14px;
        object-fit: contain;
        opacity: 0.82;
      }

      .app-footer-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        justify-content: flex-start;
      }

      .app-footer-action {
        width: 28px;
        height: 28px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.06);
        background: rgba(255,255,255,0.06);
        display: grid;
        place-items: center;
      }

      .app-footer-action img {
        width: 14px;
        height: 14px;
        object-fit: contain;
        opacity: 0.76;
      }

      .app-footer-legal {
        display: inline-flex;
        align-items: center;
        gap: 24px;
        color: #8f96a1;
        font-size: 11px;
      }

      .app-footer-copy {
        color: #8f96a1;
        font-size: 11px;
        white-space: nowrap;
        margin-left: auto;
        text-align: right;
      }

      .overlay {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 26px;
        background: rgba(7, 8, 12, 0.74);
        backdrop-filter: blur(8px);
        z-index: 40;
      }

      .overlay.open {
        display: flex;
      }

      .saving-overlay {
        position: fixed;
        inset: 0;
        z-index: 80;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(3, 7, 18, 0.56);
        backdrop-filter: blur(10px);
      }

      .saving-overlay.open {
        display: flex;
      }

      .saving-dialog {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        min-width: 180px;
        min-height: 58px;
        padding: 16px 20px;
        border: 1px solid #333438;
        border-radius: 12px;
        background: #000000;
        color: #cf9eff;
        font-size: 14px;
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
      }

      .saving-spinner {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        border: 2px solid rgba(207, 158, 255, 0.24);
        border-top-color: #cf9eff;
        animation: saving-spinner-rotate 820ms linear infinite;
      }

      @keyframes saving-spinner-rotate {
        to {
          transform: rotate(360deg);
        }
      }

      .modal-card {
        width: min(980px, calc(100vw - 120px));
        max-height: calc(100vh - 80px);
      }

      .modal-card.chart-modal {
        width: min(1460px, calc(100vw - 64px));
      }

      .modal-card.message-dialog {
        width: min(328px, calc(100vw - 48px));
        min-height: 160px;
        overflow: hidden;
        border-radius: 12px;
        border: 1px solid #343537;
        background: #000000;
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
      }

      .modal-card.message-dialog .panel-inner {
        padding: 0 !important;
        background: transparent;
      }

      .modal-card.message-dialog .panel-head {
        margin: 0 !important;
        padding: 8px 9px 8px 18px;
        background: #161618;
      }

      .modal-card.message-dialog .panel-title {
        color: #808080;
        font-size: 14px;
      }

      .modal-card.message-dialog .panel-sub {
        display: none;
      }

      .modal-card.message-dialog .modal-close-button {
        width: 26px;
        height: 26px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #808080;
      }

      .modal-card.message-dialog .modal-body {
        margin: 9px;
        padding: 26px 26px 0;
        color: #ffffff;
        font-size: 14px;
        line-height: 1.4;
        text-align: center;
      }

      .message-dialog-body {
        white-space: pre-wrap;
      }

      .message-dialog-actions {
        display: grid;
        grid-template-columns: repeat(1, minmax(0, 88px));
        justify-content: center;
        gap: 8px;
        padding: 26px;
      }

      .message-dialog-actions button {
        min-height: 38px;
        border: 0;
        border-radius: 12px;
        color: #06101f;
        font-size: 14px;
        font-weight: 800;
        background: linear-gradient(135deg, #9996a2, #7b6cff);
        cursor: pointer;
      }

      .modal-close-button {
        width: 34px;
        height: 34px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        color: #e8ecf4;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        line-height: 1;
        padding: 0;
        cursor: pointer;
        transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
      }

      .modal-close-button:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.18);
      }

      .modal-body {
        padding: 0 18px 18px;
        overflow: auto;
        max-height: calc(100vh - 180px);
      }

      .modal-pre {
        margin: 0;
        padding: 14px;
        border-radius: 5px;
        border: 1px solid rgba(255,255,255,0.06);
        background: #06080b;
        color: #dce7f3;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "SF Mono", "JetBrains Mono", monospace;
        font-size: 12px;
        line-height: 1.55;
      }

      .modal-chart-stage {
        min-height: 600px;
      }

      .modal-chart-stage canvas {
        display: block;
        width: 100% !important;
        height: 100% !important;
      }

      .status-good { color: var(--green); }
      .status-warn { color: var(--yellow); }
      .status-bad { color: var(--red); }
      .status-blue { color: var(--blue); }

      .overview-surface-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .overview-surface-card {
        padding: 16px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.08);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)),
          radial-gradient(circle at top right, rgba(123,97,255,0.14), transparent 50%);
        display: grid;
        gap: 14px;
      }

      .overview-surface-card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .overview-surface-card-title {
        font-size: 16px;
        font-weight: 700;
        color: rgba(255,255,255,0.96);
      }

      .overview-surface-card-sub {
        margin-top: 4px;
        font-size: 12px;
        color: #98a0ad;
      }

      .overview-surface-card .ghost-button {
        min-height: 30px;
        padding: 5px 10px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.01em;
        line-height: 1.1;
        white-space: nowrap;
      }

      .overview-surface-open {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .overview-surface-open-icon {
        width: 12px;
        height: 12px;
        flex: 0 0 12px;
        object-fit: contain;
        opacity: 0.9;
      }

      .overview-surface-card-metrics {
        display: grid;
        gap: 10px;
      }

      .overview-surface-metric {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 12px;
        color: #98a0ad;
      }

      .overview-surface-metric strong {
        color: rgba(255,255,255,0.94);
        font-size: 14px;
      }

      .overview-news-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .overview-news-item {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 12px;
        min-height: 112px;
        padding: 16px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.025);
      }

      .overview-news-tag {
        align-self: start;
        min-width: 54px;
        padding: 6px 9px;
        border-radius: 999px;
        border: 1px solid rgba(108,240,232,0.35);
        background: rgba(108,240,232,0.08);
        color: #77eadc;
        font-size: 11px;
        line-height: 1;
        font-weight: 800;
        text-align: center;
      }

      .overview-news-copy {
        min-width: 0;
      }

      .overview-news-title {
        color: rgba(255,255,255,0.95);
        font-size: 14px;
        line-height: 1.3;
        font-weight: 800;
      }

      .overview-news-time {
        margin-top: 5px;
        color: #77eadc;
        font-size: 11px;
        line-height: 1.2;
        font-weight: 700;
      }

      .overview-news-body {
        margin-top: 8px;
        color: #9ca5b3;
        font-size: 12px;
        line-height: 1.55;
      }

      @media (max-width: 1600px) {
        .morpho-market-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

	        .content-scroll {
	          padding: 16px 14px 74px;
	        }

        .page.active,
        .overview-grid,
        .chart-grid,
        .settings-layout,
        .console-layout,
        .txgraph-layout,
        .txgraph-grid {
          gap: 12px;
        }

        .panel-inner {
          padding: 14px 16px;
        }

        .summary-head,
        .summary-foot,
        .chart-widget-head,
        .chart-widget-foot {
          padding-left: 16px;
          padding-right: 16px;
        }

        .summary-grid,
        .chart-frame {
          padding-left: 16px;
          padding-right: 16px;
        }

	        .app-footer {
	          padding: 14px 16px 12px;
	        }

        .app-footer-main,
        .app-footer-bottom {
          gap: 14px;
        }

        .app-footer-bottom {
          margin-top: 12px;
          flex-wrap: wrap;
        }

        .app-footer-nav {
          width: auto;
          margin-left: auto;
          justify-content: flex-end;
          flex-wrap: nowrap;
        }

        .app-footer-links {
          gap: 16px;
          flex-wrap: nowrap;
        }

        .app-footer-actions {
          min-width: 0;
          margin-left: 0;
        }

        .app-footer-copy {
          margin-left: 0;
        }
      }

      @media (max-width: 1440px) {
        .overview-surface-grid,
        .overview-news-list {
          grid-template-columns: minmax(0, 1fr);
        }

        .morpho-market-strip {
          grid-template-columns: minmax(0, 1fr);
        }

        .modal-detail-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        .console-layout,
        .settings-layout {
          grid-template-columns: minmax(0, 1fr);
        }

        .txgraph-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        .txgraph-filter-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 820px) {
        .app-footer-nav {
          display: none;
        }
      }

      @media (max-width: 960px) {
        .txgraph-filter-row {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    
`;
