import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./dashboard-runtime-assembly.ts', import.meta.url), 'utf8');
const trimmedLines = source.trim().split('\n');

assert.ok(trimmedLines.length <= 40, 'dashboard-runtime-assembly.ts should stay a thin runtime entry file');

assert.ok(
  source.includes("import { DASHBOARD_RUNTIME_CORE_ASSEMBLY } from './dashboard-runtime-core-assembly.js';"),
  'runtime entry should import core assembly'
);
assert.ok(
  source.includes("import { DASHBOARD_RUNTIME_MORPHO_TARGETS_ASSEMBLY } from './dashboard-runtime-morpho-targets-assembly.js';"),
  'runtime entry should import morpho-targets assembly'
);
assert.ok(
  source.includes("import { DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY } from './dashboard-runtime-overview-assembly.js';"),
  'runtime entry should import overview assembly'
);
assert.ok(
  source.includes("import { DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY } from './dashboard-runtime-operations-assembly.js';"),
  'runtime entry should import operations assembly'
);

assert.ok(
  source.includes('export const DASHBOARD_RUNTIME_ASSEMBLY = String.raw`'),
  'runtime entry should export a runtime assembly template'
);
assert.ok(
  source.includes('const consoleController = createDashboardConsoleController({'),
  'runtime entry should own shared console controller wiring'
);
assert.ok(source.includes('init();'), 'runtime entry should own final init call');

assert.ok(!source.includes('<!doctype html>'), 'runtime entry should not inline html document markup');
assert.ok(!source.includes('<section id="pageOverview"'), 'runtime entry should not inline page markup');
assert.ok(!source.includes('const state = {'), 'runtime entry should not inline state');
assert.ok(!/\n\s*function\s+\w+/m.test(source), 'runtime entry should not define runtime functions directly');

console.log('dashboard runtime entry ok');
