import { DASHBOARD_MORPHO_CONSOLE_TRANSLATIONS_LOGIC } from './dashboard-morpho-console-translations-logic.js';
import { DASHBOARD_MORPHO_EVENTS_LOGIC } from './dashboard-morpho-events-logic.js';
import { DASHBOARD_MORPHO_SHARED_LOGIC } from './dashboard-morpho-shared-logic.js';
import { DASHBOARD_TARGETS_ADAPTER_LOGIC } from './dashboard-targets-adapter-logic.js';
import { DASHBOARD_TARGETS_LOGIC } from './dashboard-targets-logic.js';
import { DASHBOARD_TARGETS_SHARED_LOGIC } from './dashboard-targets-shared-logic.js';

export const DASHBOARD_RUNTIME_MORPHO_TARGETS_ASSEMBLY = String.raw`
${DASHBOARD_TARGETS_SHARED_LOGIC}
${DASHBOARD_MORPHO_SHARED_LOGIC}
${DASHBOARD_MORPHO_EVENTS_LOGIC}
${DASHBOARD_MORPHO_CONSOLE_TRANSLATIONS_LOGIC}
${DASHBOARD_TARGETS_ADAPTER_LOGIC}
${DASHBOARD_TARGETS_LOGIC}
`;
