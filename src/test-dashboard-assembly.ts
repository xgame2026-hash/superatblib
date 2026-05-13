import assert from 'node:assert/strict';

import { DASHBOARD_HTML } from './dashboard-html.js';

function expectIncludes(fragment: string, label: string) {
  assert.ok(
    DASHBOARD_HTML.includes(fragment),
    `dashboard html should include ${label}`
  );
}

function expectOrder(earlier: string, later: string, label: string) {
  const earlierIndex = DASHBOARD_HTML.indexOf(earlier);
  const laterIndex = DASHBOARD_HTML.indexOf(later);
  assert.notEqual(earlierIndex, -1, `${label}: missing earlier fragment`);
  assert.notEqual(laterIndex, -1, `${label}: missing later fragment`);
  assert.ok(earlierIndex < laterIndex, `${label}: fragments are out of order`);
}

expectIncludes('<!doctype html>', 'document head');
expectIncludes('<section id="pageOverview"', 'overview page');
expectIncludes('<section id="pageLiquidation"', 'liquidation page');
expectIncludes('<section id="pageFlashloan"', 'flashloan page');
expectIncludes('<section id="pageLab"', 'lab page');
expectIncludes('<section id="pageMorpho"', 'morpho page');
expectIncludes('<section id="pageConsole"', 'console page');
expectIncludes('<section id="pageArbitrage"', 'arbitrage page');
expectIncludes('<section id="pageTxgraph"', 'txgraph page');
expectIncludes('<section id="pageSettings"', 'settings page');
expectIncludes('<div id="modal" class="overlay"', 'modal shell');
expectIncludes('<script src="/vendor/chart.js"></script>', 'chart vendor script');
expectIncludes('const consoleController = createDashboardConsoleController({', 'console controller bootstrap');
expectIncludes('init();', 'runtime init');

expectOrder('<section id="pageOverview"', '<section id="pageFlashloan"', 'page order: overview before flashloan');
expectOrder('<section id="pageFlashloan"', '<section id="pageLiquidation"', 'page order: flashloan before liquidation');
expectOrder('<section id="pageLiquidation"', '<section id="pageMorpho"', 'page order: liquidation before morpho');
expectOrder('<section id="pageMorpho"', '<section id="pageConsole"', 'page order: morpho before console');
expectOrder('<section id="pageConsole"', '<section id="pageLab"', 'page order: console before lab');
expectOrder('<section id="pageLab"', '<section id="pageArbitrage"', 'page order: lab before arbitrage');
expectOrder('<section id="pageArbitrage"', '<section id="pageTxgraph"', 'page order: arbitrage before txgraph');
expectOrder('<section id="pageTxgraph"', '<section id="pageSettings"', 'page order: txgraph before settings');
expectOrder('<div id="modal" class="overlay"', '<script src="/vendor/chart.js"></script>', 'modal before runtime scripts');
expectOrder('const translations = {', 'const consoleController = createDashboardConsoleController({', 'translations before console controller');
expectOrder('const consoleController = createDashboardConsoleController({', 'init();', 'console controller before init');

console.log('dashboard assembly ok');
