# Dashboard Assembly Map

This dashboard is now assembled in thin layers instead of one oversized HTML file.

## Entry flow

1. `src/dashboard-html.ts`
   Public export consumed by the server layer.
2. `src/dashboard-html-assembly.ts`
   Composes `document + styles + body`.
3. `src/dashboard-body-assembly.ts`
   Composes `app shell + pages + modal + runtime`.
4. `src/dashboard-runtime-assembly.ts`
   Composes runtime slices, then creates `consoleController`, then calls `init()`.

## Validation flow

- `npm test`
  Repo-level smoke entry. Runs `typecheck` first, then dashboard assembly checks.
- `npm run test:dashboard`
  Runs dashboard-only structural checks without the extra typecheck step.

Current dashboard checks cover:

- final HTML output integrity
- page/body/runtime slice boundaries
- source-level entry guards for `html`, `runtime`, `page/body/html assembly`
- source-level entry guards for `document/style/shell`

## Page assembly

- `src/dashboard-page-assembly.ts`
  Keeps page order aligned with sidebar navigation.
- `src/dashboard-overview-module.ts`
  Overview page template.
- `src/dashboard-console-module.ts`
  Console page template.
- `src/dashboard-arbitrage-module.ts`
  Arbitrage page template and its page-local styles.
- `src/dashboard-txgraph-module.ts`
  Tx graph page template.
- `src/dashboard-settings-module.ts`
  Settings page template.

## Runtime slices

- `src/dashboard-runtime-core-assembly.ts`
  Vendor scripts, translations, state, i18n, base helpers, data loading, bootstrap.
- `src/dashboard-runtime-morpho-targets-assembly.ts`
  Morpho and targets shared logic, events, translations, adapters.
- `src/dashboard-runtime-overview-assembly.ts`
  Overview events and overview rendering logic.
- `src/dashboard-runtime-operations-assembly.ts`
  Arbitrage, txgraph, settings, shell/common events.

## Dependency rules

- Keep state, translations, and shared helpers in the core slice before downstream slices.
- Keep page order and sidebar order in sync.
- Put shared helpers before event binders that call them.
- Put `consoleController` creation after the pieces it depends on are injected.
- Keep `init()` as the final runtime step.

## Practical edit guide

- Editing markup for a page:
  Start in that page's `*-module.ts`.
- Editing runtime behavior for a domain:
  Start in the matching runtime slice or logic module, not in `dashboard-html.ts`.
- Adding a new page:
  Add a page module, insert it into `dashboard-page-assembly.ts`, then wire runtime if needed.
- Adding a new shared helper:
  Prefer the narrowest existing domain module first; only add to core if multiple domains need it.
