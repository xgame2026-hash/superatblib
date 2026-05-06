import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function expectThinFile(source: string, maxLines: number, label: string) {
  const trimmedLines = source.trim().split('\n');
  assert.ok(trimmedLines.length <= maxLines, `${label} should stay thin`);
}

const documentModuleSource = readSource('./dashboard-document-module.ts');
expectThinFile(documentModuleSource, 32, 'dashboard-document-module.ts');
assert.ok(
  documentModuleSource.includes('export const DASHBOARD_DOCUMENT_HEAD = String.raw`<!doctype html>'),
  'document module should export document head'
);
assert.ok(
  documentModuleSource.includes('export const DASHBOARD_DOCUMENT_BODY_OPEN = String.raw`'),
  'document module should export body open'
);
assert.ok(
  documentModuleSource.includes('export const DASHBOARD_VENDOR_SCRIPTS = String.raw`'),
  'document module should export vendor scripts'
);
assert.ok(
  documentModuleSource.includes('export const DASHBOARD_DOCUMENT_FOOT = String.raw`'),
  'document module should export document foot'
);
assert.ok(!/\n\s*function\s+\w+/m.test(documentModuleSource), 'document module should not define functions directly');

const styleAssemblySource = readSource('./dashboard-style-assembly.ts');
expectThinFile(styleAssemblySource, 12, 'dashboard-style-assembly.ts');
assert.ok(
  styleAssemblySource.includes("import { DASHBOARD_BASE_STYLES } from './dashboard-base-styles.js';"),
  'style assembly should import base styles'
);
assert.ok(
  styleAssemblySource.includes("import { DASHBOARD_ARBITRAGE_STYLES } from './dashboard-arbitrage-module.js';"),
  'style assembly should import arbitrage styles'
);
assert.ok(
  styleAssemblySource.includes("import { DASHBOARD_FLASHLOAN_STYLES } from './dashboard-flashloan-styles.js';"),
  'style assembly should import flashloan styles'
);
assert.ok(
  styleAssemblySource.includes("import { DASHBOARD_LAB_STYLES } from './dashboard-lab-styles.js';"),
  'style assembly should import lab styles'
);
assert.ok(
  styleAssemblySource.includes('export const DASHBOARD_STYLE_ASSEMBLY = String.raw`'),
  'style assembly should export a style template'
);
assert.ok(!styleAssemblySource.includes('<!doctype html>'), 'style assembly should not inline html document markup');
assert.ok(!/\n\s*function\s+\w+/m.test(styleAssemblySource), 'style assembly should not define functions directly');

const shellModuleSource = readSource('./dashboard-shell-module.ts');
expectThinFile(shellModuleSource, 140, 'dashboard-shell-module.ts');
assert.ok(
  shellModuleSource.includes('export const DASHBOARD_APP_SHELL_START = String.raw`'),
  'shell module should export app shell start'
);
assert.ok(
  shellModuleSource.includes('export const DASHBOARD_APP_SHELL_END = String.raw`'),
  'shell module should export app shell end'
);
assert.ok(
  shellModuleSource.includes('export const DASHBOARD_MODAL_SHELL = String.raw`'),
  'shell module should export modal shell'
);
assert.ok(shellModuleSource.includes('<header class="topbar">'), 'shell module should include topbar markup');
assert.ok(shellModuleSource.includes('<footer class="app-footer">'), 'shell module should include footer markup');
assert.ok(shellModuleSource.includes('<div id="modal" class="overlay"'), 'shell module should include modal markup');
assert.ok(!shellModuleSource.includes('const consoleController = createDashboardConsoleController({'), 'shell module should not touch runtime wiring');
assert.ok(!/\n\s*function\s+\w+/m.test(shellModuleSource), 'shell module should not define functions directly');

const authModuleSource = readSource('./dashboard-auth.ts');
assert.ok(
  !authModuleSource.includes('Enter the authorization code to open the liquidation workstation.'),
  'auth page should not include the removed workstation helper sentence'
);

console.log('dashboard foundation entries ok');
