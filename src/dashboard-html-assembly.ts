import { DASHBOARD_BODY_ASSEMBLY } from './dashboard-body-assembly.js';
import { DASHBOARD_DOCUMENT_BODY_OPEN, DASHBOARD_DOCUMENT_FOOT, DASHBOARD_DOCUMENT_HEAD } from './dashboard-document-module.js';
import { DASHBOARD_STYLE_ASSEMBLY } from './dashboard-style-assembly.js';

// Highest-level HTML composition: document frame, styles, then body payload.
export const DASHBOARD_HTML_ASSEMBLY = String.raw`${DASHBOARD_DOCUMENT_HEAD}
${DASHBOARD_STYLE_ASSEMBLY}
${DASHBOARD_DOCUMENT_BODY_OPEN}
${DASHBOARD_BODY_ASSEMBLY}
${DASHBOARD_DOCUMENT_FOOT}`;
