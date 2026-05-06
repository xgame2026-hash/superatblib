import { DASHBOARD_BOOTSTRAP_LOGIC } from './dashboard-bootstrap-logic.js';
import { DASHBOARD_CHART_UTILS_LOGIC } from './dashboard-chart-utils-logic.js';
import { DASHBOARD_CONSOLE_LOGIC } from './dashboard-console-logic.js';
import { DASHBOARD_CORE_TRANSLATIONS_LOGIC } from './dashboard-core-translations-logic.js';
import { DASHBOARD_CORE_UTILS_LOGIC } from './dashboard-core-utils-logic.js';
import { DASHBOARD_DATA_LOADING_LOGIC } from './dashboard-data-loading-logic.js';
import { DASHBOARD_VENDOR_SCRIPTS } from './dashboard-document-module.js';
import { DASHBOARD_FORM_STATE_LOGIC } from './dashboard-form-state-logic.js';
import { DASHBOARD_I18N_LOGIC } from './dashboard-i18n-logic.js';
import { DASHBOARD_STATE_LOGIC } from './dashboard-state-logic.js';
import { DASHBOARD_TRANSLATIONS_LOGIC } from './dashboard-translations-logic.js';

// Core layer defines globals and helpers that later runtime slices depend on.
export const DASHBOARD_RUNTIME_CORE_ASSEMBLY = String.raw`
${DASHBOARD_VENDOR_SCRIPTS}
    <script>
${DASHBOARD_TRANSLATIONS_LOGIC}

${DASHBOARD_STATE_LOGIC}
${DASHBOARD_I18N_LOGIC}

${DASHBOARD_CONSOLE_LOGIC}
${DASHBOARD_CORE_UTILS_LOGIC}
${DASHBOARD_CHART_UTILS_LOGIC}
${DASHBOARD_DATA_LOADING_LOGIC}
${DASHBOARD_FORM_STATE_LOGIC}
${DASHBOARD_CORE_TRANSLATIONS_LOGIC}
${DASHBOARD_BOOTSTRAP_LOGIC}
`;
