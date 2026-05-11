import assert from 'node:assert/strict';

import { DASHBOARD_BODY_ASSEMBLY } from './dashboard-body-assembly.js';
import { DASHBOARD_PAGE_ASSEMBLY } from './dashboard-page-assembly.js';
import { DASHBOARD_RUNTIME_ASSEMBLY } from './dashboard-runtime-assembly.js';
import { DASHBOARD_RUNTIME_CORE_ASSEMBLY } from './dashboard-runtime-core-assembly.js';
import { DASHBOARD_RUNTIME_MORPHO_TARGETS_ASSEMBLY } from './dashboard-runtime-morpho-targets-assembly.js';
import { DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY } from './dashboard-runtime-operations-assembly.js';
import { DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY } from './dashboard-runtime-overview-assembly.js';

function expectIncludes(haystack: string, fragment: string, label: string) {
  assert.ok(haystack.includes(fragment), `${label}: missing fragment`);
}

function expectExcludes(haystack: string, fragment: string, label: string) {
  assert.ok(!haystack.includes(fragment), `${label}: unexpected fragment`);
}

function expectOrder(haystack: string, earlier: string, later: string, label: string) {
  const earlierIndex = haystack.indexOf(earlier);
  const laterIndex = haystack.indexOf(later);
  assert.notEqual(earlierIndex, -1, `${label}: missing earlier fragment`);
  assert.notEqual(laterIndex, -1, `${label}: missing later fragment`);
  assert.ok(earlierIndex < laterIndex, `${label}: fragments are out of order`);
}

expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageOverview"', 'page assembly overview');
expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageLiquidation"', 'page assembly liquidation');
expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageFlashloan"', 'page assembly flashloan');
expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageFlashloanConsole"', 'page assembly flashloan console');
expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageLab"', 'page assembly lab');
expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageMorpho"', 'page assembly morpho');
expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageConsole"', 'page assembly console');
expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageArbitrage"', 'page assembly arbitrage');
expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageTxgraph"', 'page assembly txgraph');
expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageStrategyPlaza"', 'page assembly strategy plaza');
expectIncludes(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageSettings"', 'page assembly settings');
expectExcludes(DASHBOARD_PAGE_ASSEMBLY, '<script>', 'page assembly');
expectOrder(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageOverview"', '<section id="pageFlashloan"', 'page assembly order 1');
expectOrder(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageFlashloan"', '<section id="pageLiquidation"', 'page assembly order 2');
expectOrder(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageLiquidation"', '<section id="pageMorpho"', 'page assembly order 3');
expectOrder(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageMorpho"', '<section id="pageConsole"', 'page assembly order 4');
expectOrder(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageConsole"', '<section id="pageFlashloanConsole"', 'page assembly order 5');
expectOrder(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageFlashloanConsole"', '<section id="pageLab"', 'page assembly order 6');
expectOrder(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageLab"', '<section id="pageArbitrage"', 'page assembly order 6b');
expectOrder(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageArbitrage"', '<section id="pageTxgraph"', 'page assembly order 7');
expectOrder(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageTxgraph"', '<section id="pageStrategyPlaza"', 'page assembly order 8');
expectOrder(DASHBOARD_PAGE_ASSEMBLY, '<section id="pageStrategyPlaza"', '<section id="pageSettings"', 'page assembly order 9');

expectIncludes(DASHBOARD_BODY_ASSEMBLY, '<div class="app-shell">', 'body assembly shell');
expectIncludes(DASHBOARD_BODY_ASSEMBLY, '<footer class="app-footer"', 'body assembly footer');
expectIncludes(DASHBOARD_BODY_ASSEMBLY, '<div id="modal" class="overlay"', 'body assembly modal');
expectIncludes(DASHBOARD_BODY_ASSEMBLY, 'const consoleController = createDashboardConsoleController({', 'body assembly runtime');
expectOrder(DASHBOARD_BODY_ASSEMBLY, '<div class="app-shell">', '<section id="pageOverview"', 'body assembly shell before pages');
expectOrder(DASHBOARD_BODY_ASSEMBLY, '<section id="pageSettings"', '<footer class="app-footer"', 'body assembly pages before footer');
expectOrder(DASHBOARD_BODY_ASSEMBLY, '<footer class="app-footer"', '<div id="modal" class="overlay"', 'body assembly footer before modal');
expectOrder(DASHBOARD_BODY_ASSEMBLY, '<div id="modal" class="overlay"', 'const consoleController = createDashboardConsoleController({', 'body assembly modal before runtime');

expectIncludes(DASHBOARD_RUNTIME_CORE_ASSEMBLY, '<script src="/vendor/chart.js"></script>', 'runtime core vendor');
expectIncludes(DASHBOARD_RUNTIME_CORE_ASSEMBLY, 'const translations = {', 'runtime core translations');
expectIncludes(DASHBOARD_RUNTIME_CORE_ASSEMBLY, 'const state = {', 'runtime core state');
expectIncludes(DASHBOARD_RUNTIME_CORE_ASSEMBLY, 'function t(path)', 'runtime core i18n');
expectExcludes(DASHBOARD_RUNTIME_CORE_ASSEMBLY, 'const consoleController = createDashboardConsoleController({', 'runtime core');
expectExcludes(DASHBOARD_RUNTIME_CORE_ASSEMBLY, 'init();', 'runtime core');
expectOrder(DASHBOARD_RUNTIME_CORE_ASSEMBLY, 'const translations = {', 'const state = {', 'runtime core translations before state');
expectOrder(DASHBOARD_RUNTIME_CORE_ASSEMBLY, 'const state = {', 'function createDashboardConsoleController(deps)', 'runtime core state before console logic');

expectIncludes(DASHBOARD_RUNTIME_MORPHO_TARGETS_ASSEMBLY, 'function applyMorphoMarketFilter(marketId, options)', 'runtime morpho targets morpho helper');
expectIncludes(DASHBOARD_RUNTIME_MORPHO_TARGETS_ASSEMBLY, 'function deriveTargets()', 'runtime morpho targets adapter');
expectIncludes(DASHBOARD_RUNTIME_MORPHO_TARGETS_ASSEMBLY, 'function renderTargets(', 'runtime morpho targets render');
expectExcludes(DASHBOARD_RUNTIME_MORPHO_TARGETS_ASSEMBLY, 'init();', 'runtime morpho targets');

expectIncludes(DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY, 'function bindOverviewDashboardEvents()', 'runtime overview events');
expectIncludes(DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY, 'function renderOverviewSkeleton()', 'runtime overview skeleton');
expectIncludes(DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY, 'function renderOverviewHub()', 'runtime overview hub');
expectIncludes(DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY, 'function renderFlashloanPagePayload(payload)', 'runtime flashloan page');
expectIncludes(DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY, 'function renderEigenphiSummary(overview)', 'runtime overview summary');
expectIncludes(DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY, 'function renderStrategyMarkets(summary)', 'runtime overview strategy markets');
expectExcludes(DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY, 'const consoleController = createDashboardConsoleController({', 'runtime overview');

expectIncludes(DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY, 'function bindCommonDashboardEvents()', 'runtime operations common events');
expectIncludes(DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY, 'function bindShellDashboardEvents()', 'runtime operations shell events');
expectIncludes(DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY, 'function renderSettings()', 'runtime operations settings');
expectIncludes(DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY, 'function loadTxGraphData(', 'runtime operations txgraph');
expectIncludes(DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY, 'function renderLab()', 'runtime operations lab');
expectIncludes(DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY, 'function bindLabDashboardEvents()', 'runtime operations lab events');
expectIncludes(DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY, 'function bindArbitrageDashboardEvents()', 'runtime operations arbitrage events');
expectIncludes(DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY, 'function renderArbitrage()', 'runtime operations arbitrage logic');

expectIncludes(DASHBOARD_RUNTIME_ASSEMBLY, 'const consoleController = createDashboardConsoleController({', 'runtime assembly console controller');
expectIncludes(DASHBOARD_RUNTIME_ASSEMBLY, 'init();', 'runtime assembly init');
expectIncludes(DASHBOARD_RUNTIME_ASSEMBLY, '</script>', 'runtime assembly close script');
expectOrder(DASHBOARD_RUNTIME_ASSEMBLY, '<script src="/vendor/chart.js"></script>', 'const consoleController = createDashboardConsoleController({', 'runtime assembly controller after core');
expectOrder(DASHBOARD_RUNTIME_ASSEMBLY, 'const consoleController = createDashboardConsoleController({', 'init();', 'runtime assembly init after controller');

console.log('dashboard slices ok');
