import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function expectThinFile(source: string, maxLines: number, label: string) {
  const trimmedLines = source.trim().split('\n');
  assert.ok(trimmedLines.length <= maxLines, `${label} should stay thin`);
}

const pageAssemblySource = readSource('./dashboard-page-assembly.ts');
expectThinFile(pageAssemblySource, 30, 'dashboard-page-assembly.ts');
assert.ok(
  pageAssemblySource.includes("import { DASHBOARD_OVERVIEW_PAGE } from './dashboard-overview-module.js';"),
  'page assembly should import overview page module'
);
assert.ok(
  pageAssemblySource.includes("import { DASHBOARD_LIQUIDATION_PAGE } from './dashboard-liquidation-module.js';"),
  'page assembly should import liquidation page module'
);
assert.ok(
  pageAssemblySource.includes("import { DASHBOARD_FLASHLOAN_PAGE } from './dashboard-flashloan-module.js';"),
  'page assembly should import flashloan page module'
);
assert.ok(
  pageAssemblySource.includes("import { DASHBOARD_LAB_PAGE } from './dashboard-lab-module.js';"),
  'page assembly should import lab page module'
);
assert.ok(
  pageAssemblySource.includes("import { DASHBOARD_MORPHO_PAGE } from './dashboard-morpho-module.js';"),
  'page assembly should import morpho page module'
);
assert.ok(
  pageAssemblySource.includes("import { DASHBOARD_CONSOLE_PAGE } from './dashboard-console-module.js';"),
  'page assembly should import console page module'
);
assert.ok(
  pageAssemblySource.includes("import { DASHBOARD_ARBITRAGE_PAGE } from './dashboard-arbitrage-module.js';"),
  'page assembly should import arbitrage page module'
);
assert.ok(
  pageAssemblySource.includes("import { DASHBOARD_TXGRAPH_PAGE } from './dashboard-txgraph-module.js';"),
  'page assembly should import txgraph page module'
);
assert.ok(
  pageAssemblySource.includes("import { DASHBOARD_SETTINGS_PAGE } from './dashboard-settings-module.js';"),
  'page assembly should import settings page module'
);
assert.ok(
  pageAssemblySource.includes('export const DASHBOARD_PAGE_ASSEMBLY = String.raw`'),
  'page assembly should export a template assembly'
);
assert.ok(!pageAssemblySource.includes('<!doctype html>'), 'page assembly should not inline document markup');
assert.ok(!pageAssemblySource.includes('const consoleController = createDashboardConsoleController({'), 'page assembly should not touch runtime wiring');
assert.ok(!/\n\s*function\s+\w+/m.test(pageAssemblySource), 'page assembly should not define functions directly');

const bodyAssemblySource = readSource('./dashboard-body-assembly.ts');
expectThinFile(bodyAssemblySource, 20, 'dashboard-body-assembly.ts');
assert.ok(
  bodyAssemblySource.includes("import { DASHBOARD_PAGE_ASSEMBLY } from './dashboard-page-assembly.js';"),
  'body assembly should import page assembly'
);
assert.ok(
  bodyAssemblySource.includes("import { DASHBOARD_RUNTIME_ASSEMBLY } from './dashboard-runtime-assembly.js';"),
  'body assembly should import runtime assembly'
);
assert.ok(
  bodyAssemblySource.includes("import { DASHBOARD_APP_SHELL_END, DASHBOARD_APP_SHELL_START, DASHBOARD_MODAL_SHELL } from './dashboard-shell-module.js';"),
  'body assembly should import shell fragments'
);
assert.ok(
  bodyAssemblySource.includes('export const DASHBOARD_BODY_ASSEMBLY = String.raw`'),
  'body assembly should export a template assembly'
);
assert.ok(!bodyAssemblySource.includes('<!doctype html>'), 'body assembly should not inline document markup');
assert.ok(!bodyAssemblySource.includes('const state = {'), 'body assembly should not inline runtime state');
assert.ok(!/\n\s*function\s+\w+/m.test(bodyAssemblySource), 'body assembly should not define functions directly');

const htmlAssemblySource = readSource('./dashboard-html-assembly.ts');
expectThinFile(htmlAssemblySource, 16, 'dashboard-html-assembly.ts');
assert.ok(
  htmlAssemblySource.includes("import { DASHBOARD_STYLE_ASSEMBLY } from './dashboard-style-assembly.js';"),
  'html assembly should import style assembly'
);
assert.ok(
  htmlAssemblySource.includes("import { DASHBOARD_BODY_ASSEMBLY } from './dashboard-body-assembly.js';"),
  'html assembly should import body assembly'
);
assert.ok(
  htmlAssemblySource.includes("import { DASHBOARD_DOCUMENT_BODY_OPEN, DASHBOARD_DOCUMENT_FOOT, DASHBOARD_DOCUMENT_HEAD } from './dashboard-document-module.js';"),
  'html assembly should import document fragments'
);
assert.ok(
  htmlAssemblySource.includes('export const DASHBOARD_HTML_ASSEMBLY = String.raw`'),
  'html assembly should export a template assembly'
);
assert.ok(!htmlAssemblySource.includes('<section id="pageOverview"'), 'html assembly should not inline page markup');
assert.ok(!htmlAssemblySource.includes('const consoleController = createDashboardConsoleController({'), 'html assembly should not inline runtime wiring');
assert.ok(!/\n\s*function\s+\w+/m.test(htmlAssemblySource), 'html assembly should not define functions directly');

console.log('dashboard assembly entries ok');
