import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./dashboard-html.ts', import.meta.url), 'utf8');
const trimmedLines = source.trim().split('\n');

assert.ok(trimmedLines.length <= 6, 'dashboard-html.ts should stay a thin entry file');
assert.ok(
  source.includes("import { DASHBOARD_HTML_ASSEMBLY } from './dashboard-html-assembly.js';"),
  'dashboard-html.ts should import dashboard html assembly'
);
assert.ok(
  source.includes('export const DASHBOARD_HTML = DASHBOARD_HTML_ASSEMBLY;'),
  'dashboard-html.ts should re-export the assembled html'
);

assert.ok(!source.includes('String.raw`'), 'dashboard-html.ts should not inline template strings');
assert.ok(!source.includes('<!doctype html>'), 'dashboard-html.ts should not inline html markup');
assert.ok(!source.includes('DASHBOARD_BODY_ASSEMBLY'), 'dashboard-html.ts should not reach into body assembly directly');
assert.ok(!source.includes('DASHBOARD_DOCUMENT_HEAD'), 'dashboard-html.ts should not reach into document assembly directly');
assert.ok(!source.includes('DASHBOARD_RUNTIME_ASSEMBLY'), 'dashboard-html.ts should not reach into runtime assembly directly');

console.log('dashboard entry ok');
