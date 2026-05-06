import { DASHBOARD_PAGE_ASSEMBLY } from './dashboard-page-assembly.js';
import { DASHBOARD_RUNTIME_ASSEMBLY } from './dashboard-runtime-assembly.js';
import { DASHBOARD_APP_SHELL_END, DASHBOARD_APP_SHELL_START, DASHBOARD_MODAL_SHELL } from './dashboard-shell-module.js';

// Body order matters: shell -> pages -> modal -> runtime boot script.
export const DASHBOARD_BODY_ASSEMBLY = String.raw`
${DASHBOARD_APP_SHELL_START}
${DASHBOARD_PAGE_ASSEMBLY}

${DASHBOARD_APP_SHELL_END}

${DASHBOARD_MODAL_SHELL}

${DASHBOARD_RUNTIME_ASSEMBLY}
`;
