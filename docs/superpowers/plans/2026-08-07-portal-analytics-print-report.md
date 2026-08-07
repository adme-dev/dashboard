# Portal Analytics Print Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Replace printing the responsive analytics dashboard with a dedicated authenticated A4 portrait report that Safari can save as a complete, readable PDF.

**Architecture:** The interactive analytics page builds a normalized print-route URL. A client-only report composable fetches the existing authenticated analytics endpoints in parallel and produces one typed report model. A presentation-only report component renders explicit physical-page grids and tables inside a `layout: false` print route, which waits for data and fonts before enabling the user-triggered print dialog.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Tailwind CSS, Vitest, Playwright, pdfjs-dist.

---

## Task 1: Normalize and preserve print filters

**Files:**
- Create: `app/utils/portalAnalyticsPrint.ts`
- Modify: `app/types/index.ts`
- Create: `test/app/portalAnalyticsPrintQuery.test.ts`

1. Write failing unit tests for valid dates, malformed dates, comma-separated platforms, `runningOnly`, allowed trend metrics, defaults, and deterministic `/portal/analytics/print` URL generation.
2. Run `pnpm exec vitest run test/app/portalAnalyticsPrintQuery.test.ts` and confirm failure because the utility does not exist.
3. Add `PortalAnalyticsPrintFilters` and report-section response/model types to `app/types/index.ts`.
4. Implement `normalizePortalAnalyticsPrintFilters(query, now)` and `buildPortalAnalyticsPrintUrl(filters)` as pure functions. Use the same 30-day defaults as the interactive page; allow only `spend`, `impressions`, `clicks`, `leads`, `cpc`, `ctr`, and `costPerLead`.
5. Re-run the focused test and confirm it passes.
6. Commit with `git commit -m "feat(analytics): normalize print report filters"`.

## Task 2: Load one typed report model

**Files:**
- Create: `app/composables/usePortalAnalyticsPrintReport.ts`
- Create: `test/app/portalAnalyticsPrintModel.test.ts`

1. Write failing unit tests around exported pure model helpers: required overview/trend/campaign data is retained, optional endpoint failures become explicit unavailable sections, and empty optional endpoint responses remain available-but-empty.
2. Run `pnpm exec vitest run test/app/portalAnalyticsPrintModel.test.ts` and confirm failure.
3. Implement the pure report-model builder plus the composable state (`status`, `error`, `report`, `ready`, `refresh`).
4. Fetch required endpoints in parallel: `/api/portal/analytics/overview`, `/trends`, and `/campaigns?limit=200`. Fetch optional tracking summary/health/timeseries/funnel/breakdowns, `/funnel`, `/personas`, and `/refresh-overview`; capture each optional failure without failing the complete report.
5. Re-run the focused model test and confirm it passes.
6. Commit with `git commit -m "feat(analytics): load printable report data"`.

## Task 3: Build the physical-page report

**Files:**
- Create: `app/components/analytics/PortalAnalyticsPrintReport.vue`
- Modify: `test/app/portalPdfExport.test.ts`

1. Extend the browser/PDF regression with a representative report fixture and assertions for A4 portrait, multi-page output, first and final section text, no horizontal overflow, four computed KPI columns, two computed section columns, repeated table headers, and absence of interactive controls.
2. Run `pnpm exec vitest run test/app/portalPdfExport.test.ts` and confirm the new dedicated-report case fails.
3. Implement the presentation component with semantic sections: executive summary, campaign performance, lead outcomes, website/funnel performance, and persona/audience insights.
4. Use explicit `.print-kpi-grid` and `.print-two-column` CSS, fixed-layout tables, wrapped text/URLs, `thead { display: table-header-group }`, row-level fragmentation protection, and `@page { size: A4 portrait; margin: 12mm; }`. Do not use responsive breakpoints for print geometry and do not render interactive dashboard controls.
5. Re-run the PDF regression and inspect the generated test PDF page geometry/text assertions.
6. Commit with `git commit -m "feat(analytics): render A4 portal report"`.

## Task 4: Add the authenticated print route and export handoff

**Files:**
- Create: `app/pages/portal/analytics/print.vue`
- Modify: `app/pages/portal/analytics/index.vue`
- Modify: `test/app/portalPdfExport.test.ts`

1. Add a failing contract test that expects the dashboard export action to target `/portal/analytics/print` with current filters and expects the route to use `layout: false`, `portal-auth`, a screen-only toolbar, and a direct `window.print()` user action.
2. Run the focused query/PDF tests and confirm failure.
3. Replace the dashboard's theme-mutating `window.print()` function with an `exportPdfUrl` computed value and a Nuxt UI button that opens the dedicated report in a new tab.
4. Implement the print route: normalize query, set an informative document title, load the report, show Nuxt UI loading/error states, render the report, await `document.fonts.ready` plus two animation frames, then enable **Print / Save PDF**. Keep **Back to analytics** and retry actions screen-only.
5. Run all three focused tests and confirm they pass.
6. Commit with `git commit -m "feat(analytics): add Safari-safe PDF export route"`.

## Task 5: Battle-test, ship, and verify production

**Files:**
- Review every file changed above plus `docs/superpowers/specs/2026-08-07-portal-analytics-print-report-design.md`.

1. Re-read every modified/new file end-to-end. Check server/frontend aliases, query reactivity, no duplicate UI, no unsafe CSS construction, no raw form controls, no unexpected API or infrastructure changes, and no interactive elements inside the report component.
2. Run focused tests:
   `pnpm exec vitest run test/app/portalAnalyticsPrintQuery.test.ts test/app/portalAnalyticsPrintModel.test.ts test/app/portalPdfExport.test.ts`.
3. Run lint on the changed implementation and tests with `pnpm exec eslint <changed files>`.
4. Run `pnpm build` using Node 24 and confirm the production bundle succeeds.
5. Run `pnpm deploy:check`; stop if the immutable Pages target is not `agency-dashboard`.
6. Mark the approved design status as implemented, commit any review/test corrections, push `main`, and run `pnpm deploy:production`.
7. Verify `https://app.xeroflow.io/portal/analytics/print?...` responds through the authenticated portal flow and report the production deployment URL/version. The final Safari acceptance PDF remains a user-visible check because the native macOS print dialog cannot be automated reliably in CI.
