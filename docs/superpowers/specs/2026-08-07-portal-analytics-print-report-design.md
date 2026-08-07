# Portal Analytics Print Report Design

**Date:** 7 August 2026  
**Status:** Implemented
**Scope:** Client portal analytics export at `/portal/analytics`

## Problem

The current **Export PDF** action calls `window.print()` against the live responsive dashboard. That dashboard is optimized for a desktop viewport, not a physical page. Safari enters print media, but it continues to resolve responsive Tailwind breakpoints from the desktop viewport before scaling the result onto paper.

The supplied Safari exports demonstrate two separate failure modes:

1. Safari's **File -> Export as PDF** captured the fixed dashboard viewport as one oversized page and omitted content below the viewport.
2. Safari's macOS **Print -> PDF -> Save as PDF** produced ten A4 pages, but retained desktop-width grids and interactive controls. KPI cards, tables, URLs, and website analytics sections were compressed or clipped.

The existing print overrides correctly remove the portal shell and allow page fragmentation, but they cannot make every nested responsive dashboard component behave like a designed report. Continuing to add global print selectors would remain brittle and would couple PDF output to unrelated screen-layout changes.

## Goals

- Produce a polished, complete analytics report from Safari's standard **Save as PDF** flow.
- Keep the interactive `/portal/analytics` dashboard unchanged.
- Render an executive summary first, followed by detailed advertising, lead, website/funnel, and persona sections.
- Use an explicit physical-page layout independent of screen breakpoints.
- Preserve selectable text and vector browser rendering rather than rasterizing the dashboard into screenshots.
- Reuse the existing authenticated analytics data sources and formatting utilities.
- Make PDF regressions observable through automated layout and content checks.

## Non-Goals

- Generating or storing PDFs on the server.
- Adding Cloudflare Browser Rendering, queues, R2 archives, or new infrastructure.
- Recreating every interactive dashboard control in the report.
- Printing transient UI state such as open dropdowns, search fields, column pickers, reload buttons, or expanded campaign diagnostics.
- Changing analytics calculations, API payloads, authorization, or portal navigation.
- Guaranteeing identical browser-generated pagination across every browser version. The design instead guarantees readable A4 output and complete content.

## Chosen Architecture

Create a dedicated authenticated print route at:

```text
/portal/analytics/print?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&platform=...&runningOnly=true&metric=...
```

The route uses `layout: false` and the existing `portal-auth` middleware. It renders a purpose-built report document in normal page flow, without `UDashboardGroup`, the portal sidebar, scroll containers, or screen-only dashboard controls.

The existing **Export PDF** button opens this route in a new tab with the current filter query. The print page shows a compact screen-only toolbar with **Print / Save PDF** and **Back to analytics** actions. It does not automatically open the print dialog until its required data and chart rendering are ready; this avoids Safari capturing loading skeletons or partially drawn charts.

### Why this approach

- A dedicated route isolates physical-page layout from the responsive dashboard.
- It works with Safari's native PDF output and preserves selectable text.
- It avoids Cloudflare browser-rendering infrastructure and authenticated remote-browser complexity.
- It reuses existing APIs while allowing the report to select and organize data intentionally.
- Screen dashboard refactors cannot silently change PDF column geometry.

## Components and Responsibilities

### `app/pages/portal/analytics/print.vue`

- Owns URL filter parsing and validation.
- Fetches all report data through a print-report composable.
- Sets the document title used by Safari's PDF filename and header.
- Renders loading, error, ready, and print states.
- Coordinates font/chart readiness before enabling print.
- Contains only the screen toolbar and the print-report component.

### `app/components/analytics/PortalAnalyticsPrintReport.client.vue`

- Pure report presentation component.
- Accepts a complete typed report model plus client identity and date range.
- Defines semantic report sections and explicit print-only grids.
- Contains no API calls, route reads, browser storage, or interactive dashboard controls.
- Uses existing formatting utilities and lightweight chart components where they render reliably in print.

### `app/composables/usePortalAnalyticsPrintReport.ts`

- Normalizes the current analytics filters.
- Fetches the overview, trend, campaign summary, website/funnel, tracking, and persona data required by the report.
- Produces one typed `PortalAnalyticsPrintReport` model.
- Exposes `status`, `error`, `refresh`, and `ready` state.
- Fails explicitly when a required summary endpoint fails; optional sections record an unavailable state and remain clearly labelled rather than disappearing silently.

Where an existing component already exposes a stable data API, the composable reuses that API. It does not scrape rendered component DOM or duplicate analytics calculations in the browser.

### Shared types

Add the report model to `app/types/index.ts`. The model groups data by report section so presentation does not depend on raw endpoint response shapes.

## Data Flow

```text
Interactive analytics page
  -> user selects filters
  -> Export PDF builds /portal/analytics/print query
  -> print route validates query
  -> print composable fetches authenticated report data in parallel
  -> composable normalizes a complete report model
  -> print report renders
  -> charts/fonts signal ready
  -> Print / Save PDF becomes enabled
  -> Safari Print dialog -> PDF -> Save as PDF
```

The print route must preserve `startDate`, `endDate`, selected platforms, `runningOnly`, and trend metric. Invalid or missing date values use the same defaults as the interactive analytics page.

## Report Structure

The report is complete but ordered for decision-making:

1. **Report header and executive summary**
   - Client name and logo when available
   - Reporting period and generated timestamp
   - Eight KPIs in an explicit 2 x 4 A4 grid
   - Trend chart and platform legend

2. **Campaign performance**
   - Data freshness summary
   - Campaign table limited to report-relevant columns
   - The campaign table may span pages; individual rows must not split
   - No search, view switcher, column picker, expansion controls, or expanded diagnostics

3. **Lead and outcome performance**
   - Performance insights
   - Campaign outcome health
   - Lead progression
   - Platform breakdown and glossary

4. **Website and funnel performance**
   - Website/funnel KPIs
   - Channel table
   - Lead capture health
   - Visitor trend and acquisition summaries
   - Long URLs wrap within their cells

5. **Audience and identity insights**
   - Persona signals
   - Lead source mix
   - Identity/attribution summary

Optional sections render an explicit "Data unavailable for this period" message if their source is unavailable. Empty sections render concise empty-state copy and do not reserve a blank page.

## Physical-Page Layout Contract

- Target paper: A4 portrait, because Safari may override CSS orientation with the user's current print-dialog selection.
- `@page`: A4 portrait with 12 mm margins.
- Report width: normal document flow within the printable area; no transforms or scale-to-fit CSS.
- Base font: 9.5-10 pt; headings use a restrained hierarchy suitable for print.
- KPI grid: exactly four columns, independent of viewport width.
- General card grids: one or two explicit columns only.
- Tables: fixed layout, repeating headers, wrapped cells, and no horizontal scrolling.
- Charts: width `100%`, bounded physical height, and no viewport-derived minimum width.
- Page breaks: applied to major section boundaries where practical; `break-inside: avoid` is limited to page-sized cards, KPI cards, table rows, and small metric groups.
- Interactive elements: absent from the report DOM, not merely hidden by broad selectors.
- Print colors: light background, dark text, semantic accents with sufficient contrast.
- Browser headers and footers remain a Safari print-dialog preference; the page itself does not duplicate them.

The document must also remain readable if the user manually chooses landscape, but portrait is the validation baseline.

## Readiness and Printing

The print page tracks three readiness conditions:

1. Required API data has resolved.
2. `document.fonts.ready` has resolved when supported.
3. Print charts have emitted a rendered event or reached a bounded fallback timeout.

The **Print / Save PDF** button remains disabled with an explanatory label until ready. Printing calls `window.print()` only from a direct user action to satisfy Safari popup and print-dialog restrictions.

No fixed two-second theme restoration timer is used. The dedicated report is always light and does not mutate the user's saved color-mode preference.

## Error Handling

- Authentication failures continue through the existing `portal-auth` behavior.
- Invalid filter parameters are normalized rather than sent to APIs.
- Required overview or campaign failures show a full-page `UAlert` with retry and back actions.
- Optional section failures render an inline unavailable state and do not block the full report.
- Print remains disabled while required data is missing.
- Errors must not expose API response bodies, identifiers, or internal stack traces.

## Testing Strategy

### Unit tests

- Query parsing and normalization, including missing, malformed, and multi-platform filters.
- Report-model normalization for populated, empty, and optional-section failure states.
- Export URL generation from the interactive page.

### Component tests

- Print report renders all required headings and terminal section markers from a complete fixture.
- Interactive controls are absent from the print report DOM.
- Empty and unavailable sections render explicit messages.
- Long campaign names and URLs remain within their cells.

### Browser/PDF regression

- Render the dedicated report with representative fixture data under print media.
- Generate an A4 portrait PDF.
- Assert multiple pages are produced.
- Extract PDF text and confirm first and final report sections are present.
- Assert report scroll width does not exceed its printable width.
- Assert computed KPI and general section grids use their explicit print column counts.
- Render every generated PDF page to PNG and inspect representative first, table, website, and final pages before release.

### Safari acceptance test

On production Safari:

1. Open analytics with a known populated date range.
2. Click **Export PDF**.
3. Confirm the dedicated print page contains no portal navigation or dashboard controls.
4. Click **Print / Save PDF**, then choose **PDF -> Save as PDF**.
5. Confirm A4 output, readable KPI cards, wrapped tables/URLs, complete final audience section, and no clipped content.

## Rollout and Rollback

This is a frontend-only change with no database migrations, environment variables, or infrastructure bindings.

Rollout:

1. Deploy the print route and change the existing export button target together.
2. Verify the authenticated production print route and save a Safari acceptance PDF.
3. Retain the existing CSV export unchanged.

Rollback:

- Revert the implementation commit and redeploy.
- The existing analytics dashboard and APIs remain unaffected throughout.

## Success Criteria

- Safari produces a multi-page A4 PDF with no horizontally clipped or compressed sections.
- The report contains the executive summary, campaign, lead, website/funnel, and audience sections represented by available data.
- No portal navigation, search fields, dropdowns, reload buttons, column pickers, or expansion controls appear in the PDF.
- First and final report content are present in extracted PDF text.
- The interactive analytics page remains visually and behaviorally unchanged apart from the export action opening the dedicated print route.
- Focused tests, lint, production build, and deployment guard pass before release.
