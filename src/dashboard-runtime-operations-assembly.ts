import { DASHBOARD_ARBITRAGE_EVENTS_LOGIC } from './dashboard-arbitrage-events-logic.js';
import { DASHBOARD_ARBITRAGE_LOGIC } from './dashboard-arbitrage-logic.js';
import { DASHBOARD_ARBITRAGE_STATE_LOGIC } from './dashboard-arbitrage-state-logic.js';
import { DASHBOARD_COMMON_EVENTS_LOGIC } from './dashboard-common-events-logic.js';
import { DASHBOARD_LAB_EVENTS_LOGIC } from './dashboard-lab-events-logic.js';
import { DASHBOARD_LAB_LOGIC } from './dashboard-lab-logic.js';
import { DASHBOARD_SETTINGS_LOGIC } from './dashboard-settings-logic.js';
import { DASHBOARD_SHELL_EVENTS_LOGIC } from './dashboard-shell-events-logic.js';
import { DASHBOARD_TXGRAPH_LOGIC } from './dashboard-txgraph-logic.js';
import { DASHBOARD_UI_SHELL_LOGIC } from './dashboard-ui-shell-logic.js';

export const DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY = String.raw`
${DASHBOARD_ARBITRAGE_STATE_LOGIC}
${DASHBOARD_LAB_LOGIC}
${DASHBOARD_TXGRAPH_LOGIC}
${DASHBOARD_COMMON_EVENTS_LOGIC}
${DASHBOARD_SHELL_EVENTS_LOGIC}
${DASHBOARD_SETTINGS_LOGIC}
${DASHBOARD_UI_SHELL_LOGIC}
${DASHBOARD_LAB_EVENTS_LOGIC}
${DASHBOARD_ARBITRAGE_EVENTS_LOGIC}
${DASHBOARD_ARBITRAGE_LOGIC}
`;
