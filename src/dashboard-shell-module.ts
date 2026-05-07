export const DASHBOARD_APP_SHELL_START = String.raw`
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-left">
          <div class="logo-lockup">
            <div class="logo-word">
              <img class="logo-aave" src="/img/SuperARB_logo.png" alt="SuperARB" />
                <span id="appVersionChip" class="logo-chip">v--</span>
            </div>
          </div>
        </div>
        <div class="topbar-right">
          <div id="versionMenu" class="version-menu">
            <button id="connectButton" class="connect-button" type="button" aria-expanded="false" aria-controls="versionDropdown">
              <span class="connect-main">
                <img src="/img/github.svg" alt="github" />
                <span id="connectButtonLabel">GitHub latest</span>
              </span>
              <span class="connect-arrow-box">
                <img src="/img/arrow.svg" alt="arrow" />
              </span>
            </button>
            <div id="versionDropdown" class="version-dropdown" role="status">
              <div id="versionDropdownTitle" class="version-dropdown-title">Checking version</div>
              <div id="versionDropdownSub" class="version-dropdown-sub">--</div>
            </div>
          </div>
        </div>
      </header>

      <aside class="sidebar">
        <div class="brand-badge">
          <img src="/img/SuperARB_logo.png" alt="SuperARB" />
        </div>
        <div class="sidebar-section">
          <div class="sidebar-caption">nav</div>
          <nav class="sidebar-nav">
            <button class="nav-button active" type="button" data-page="overview" title="Overview">
              <img class="nav-icon" src="/img/home.svg" alt="overview" />
            </button>
            <button class="nav-button" type="button" data-page="flashloan" title="Flashloan">
              <img class="nav-icon" src="/img/flashloanicon.svg" alt="flashloan" />
            </button>
            <button class="nav-button" type="button" data-page="liquidation" title="Liquidation">
              <img class="nav-icon" src="/img/liquidationicon.svg" alt="liquidation" />
            </button>
            <button class="nav-button" type="button" data-page="morpho" title="Morpho Blue">
              <img class="nav-icon" src="/img/morpho.svg" alt="morpho blue" />
            </button>
            <button class="nav-button" type="button" data-page="console" title="Console">
              <img class="nav-icon" src="/img/Console.svg" alt="console" />
            </button>
            <button class="nav-button" type="button" data-page="flashloanConsole" title="Flashloan Console">
              <img class="nav-icon" src="/img/startFlashloan.svg?v=202604161230" alt="flashloan console" />
            </button>
            <button class="nav-button" type="button" data-page="lab" title="Create">
              <img class="nav-icon" src="/img/combo.svg?v=202604161214" alt="combo" />
            </button>
            <button class="nav-button" type="button" data-page="arbitrage" title="Cross-Exchange Arbitrage">
              <img class="nav-icon" src="/img/balance.svg" alt="arbitrage" />
            </button>
            <button class="nav-button" type="button" data-page="txgraph" title="Query">
              <img class="nav-icon" src="/img/menu_3.svg" alt="query" />
            </button>
            <button class="nav-button" type="button" data-page="settings" title="Settings">
              <img class="nav-icon" src="/img/menu_5.svg" alt="settings" />
            </button>
          </nav>
        </div>
      </aside>

      <div class="workspace">
        <div class="content-scroll">
`;

export const DASHBOARD_APP_SHELL_END = String.raw`
        </div>
      </div>
    </div>
`;

export const DASHBOARD_MODAL_SHELL = String.raw`
    <div id="modal" class="overlay" aria-hidden="true">
      <div class="panel modal-card">
        <div class="panel-inner" style="padding-bottom:12px;">
          <div class="panel-head" style="margin-bottom:0;">
            <div>
              <div id="modalTitle" class="panel-title">Detail</div>
              <div id="modalSub" class="panel-sub"></div>
            </div>
            <button id="modalClose" class="modal-close-button" type="button" aria-label="Close">×</button>
          </div>
        </div>
        <div id="modalBody" class="modal-body"></div>
      </div>
    </div>
`;
