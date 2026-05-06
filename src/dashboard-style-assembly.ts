import { DASHBOARD_BASE_STYLES } from './dashboard-base-styles.js';
import { DASHBOARD_ARBITRAGE_STYLES } from './dashboard-arbitrage-module.js';
import { DASHBOARD_FLASHLOAN_STYLES } from './dashboard-flashloan-styles.js';
import { DASHBOARD_LAB_STYLES } from './dashboard-lab-styles.js';

export const DASHBOARD_STYLE_ASSEMBLY = String.raw`
${DASHBOARD_BASE_STYLES}
${DASHBOARD_ARBITRAGE_STYLES}
${DASHBOARD_FLASHLOAN_STYLES}
${DASHBOARD_LAB_STYLES}
`;
