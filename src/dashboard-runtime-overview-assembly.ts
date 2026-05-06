import { DASHBOARD_FLASHLOAN_EVENTS_LOGIC } from './dashboard-flashloan-events-logic.js';
import { DASHBOARD_FLASHLOAN_LOGIC } from './dashboard-flashloan-logic.js';
import { DASHBOARD_OVERVIEW_HUB_LOGIC } from './dashboard-overview-hub-logic.js';
import { DASHBOARD_OVERVIEW_EVENTS_LOGIC } from './dashboard-overview-events-logic.js';
import { DASHBOARD_OVERVIEW_LOGIC } from './dashboard-overview-logic.js';
import { DASHBOARD_OVERVIEW_SECTIONS_LOGIC } from './dashboard-overview-sections-logic.js';
import { DASHBOARD_OVERVIEW_SKELETON_LOGIC } from './dashboard-overview-skeleton-logic.js';

export const DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY = String.raw`
${DASHBOARD_OVERVIEW_EVENTS_LOGIC}
${DASHBOARD_FLASHLOAN_EVENTS_LOGIC}
${DASHBOARD_OVERVIEW_SKELETON_LOGIC}
${DASHBOARD_OVERVIEW_SECTIONS_LOGIC}
${DASHBOARD_OVERVIEW_HUB_LOGIC}
${DASHBOARD_FLASHLOAN_LOGIC}

      ${DASHBOARD_OVERVIEW_LOGIC}
`;
