import { DASHBOARD_ARBITRAGE_PAGE } from './dashboard-arbitrage-module.js';
import { DASHBOARD_CONSOLE_PAGE } from './dashboard-console-module.js';
import { DASHBOARD_FLASHLOAN_PAGE } from './dashboard-flashloan-module.js';
import { DASHBOARD_LAB_PAGE } from './dashboard-lab-module.js';
import { DASHBOARD_LIQUIDATION_PAGE } from './dashboard-liquidation-module.js';
import { DASHBOARD_MORPHO_PAGE } from './dashboard-morpho-module.js';
import { DASHBOARD_OVERVIEW_PAGE } from './dashboard-overview-module.js';
import { DASHBOARD_SETTINGS_PAGE } from './dashboard-settings-module.js';
import { DASHBOARD_STRATEGY_PLAZA_PAGE } from './dashboard-strategy-plaza-module.js';
import { DASHBOARD_TXGRAPH_PAGE } from './dashboard-txgraph-module.js';

// Visual page order matches sidebar navigation order.
export const DASHBOARD_PAGE_ASSEMBLY = String.raw`
${DASHBOARD_OVERVIEW_PAGE}
${DASHBOARD_FLASHLOAN_PAGE}
${DASHBOARD_LIQUIDATION_PAGE}
${DASHBOARD_MORPHO_PAGE}
${DASHBOARD_CONSOLE_PAGE}
${DASHBOARD_LAB_PAGE}
${DASHBOARD_ARBITRAGE_PAGE}
${DASHBOARD_TXGRAPH_PAGE}
${DASHBOARD_STRATEGY_PLAZA_PAGE}
${DASHBOARD_SETTINGS_PAGE}
`;
