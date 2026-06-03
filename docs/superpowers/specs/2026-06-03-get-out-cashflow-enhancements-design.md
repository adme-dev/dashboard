# Get Out — Cashflow Target Enhancements

- **Date:** 2026-06-03
- **Status:** Approved (design), implementation pending
- **Owner:** Paul
- **Surface:** `/xeroflow/get-out` (admin-gated agency cashflow cockpit)

## Background

The "Get Out" page is the agency's monthly cash-survival scorecard: a configurable
target (`wages + expenses + extras`) measured against invoicing, wrapped in a rich
set of forecasting and diagnostic cards.

A review of the implementation surfaced two structural findings:

1. **The headline number has a basis mismatch.** `server/api/xero/get-out.get.ts:78`
   sums `inv.total` — the **GST-inclusive** invoice total — and compares it against a
   **GST-exclusive** cash obligation (`getOutTarget`). In Australia, GST is 1/11 of a
   tax-inclusive total, so on $100k invoiced ~$9,091 of the ATO's money is credited
   toward the survival target. The tax-provision card sets GST aside correctly, but the
   hero "Surplus/Shortfall" double-counts it as available coverage. **The page can show
   "on target" while structurally ~9% short on the cash that actually pays wages.**

2. **Most capability is built but not surfaced.** There are **28 `get-out` endpoints;
   only ~15 render.** Notably already-built-but-hidden: `cashflow-13w` (13-week running
   balance with a *pre-computed projected low point*), `unbilled-wip` ("forgotten money"),
   `pipeline-coverage` (the 3–4× rule), plus `mrr-movement`, `yoy`, `ytd`, `utilization`,
   `profitability`, `efficiency`, `cash-runway`.

This milestone fixes finding #1 and surfaces the three highest value-to-effort capabilities
from finding #2.

## Decisions (locked)

- **Scope:** Top-4 priority only. Larger items go to the Phase-2 backlog (documented, not built).
- **GST fix:** Measure invoiced **ex-GST** against the target, and show GST as an explicit
  line in the forecast bridge (ties to the existing tax-provision set-aside). Hero number
  becomes a true cash-coverage figure.
- **Delivery:** Phased, independently reviewable/deployable PRs — one per feature.

## Goals

- The hero Surplus/Shortfall reflects **cash coverage**, not GST-inflated revenue.
- The operator can see the **intra-month/quarter cash low point** and overdraft risk.
- Surface **unbilled WIP** and **pipeline coverage** so forward cash is actionable.
- No regressions: existing cards keep working; payload stays backward-compatible.

## Non-Goals (this milestone)

- Forecast calibration, "thrive" tier above break-even, lever/what-if simulator,
  client-concentration stress test (all Phase-2 backlog below).
- Surfacing `mrr-movement`, `yoy`, `ytd`, `utilization`, `profitability`, `efficiency`
  (candidates for a later milestone).
- Any marketing-page sync (internal tool — not public).

## Cross-cutting conventions

- **Null-safe templates.** All new payload fields accessed with `?.`/`?? fallback` in the
  Vue template. (Lesson learned: `quote-velocity` is KV-cached 600s; a post-deploy stale
  payload lacking a new field crashed the render and blanked the page.)
- **Backward-compatible payloads.** Add fields; never rename/remove existing ones in the
  same PR that the template still reads.
- **Pure logic is unit-tested.** Extract any non-trivial computation (PR 1's GST split)
  into a pure helper under `server/utils/` with a Vitest spec, mirroring
  `quoteInvoiceMatch.ts`.
- **Verify against live schema/endpoints**, then deploy via `pnpm deploy:production`, then
  curl the endpoint for `401` (auth gate) — proving it's wired and not 500-ing.
- **Component naming** follows the auto-import prefix convention: files under
  `app/components/xeroflow/get-out/` render as `XeroflowGetOut*`.

---

## PR 1 — GST basis fix (hero card reads true cash coverage)

**Problem:** `difference = invoicedTotal(incl GST) − getOutTarget(excl GST)`.

**Backend — `server/api/xero/get-out.get.ts`:**
- New pure helper `server/utils/getOutInvoiceTotals.ts`:
  ```
  splitInvoiceTotals(invoices): { inclGst, exGst, gst }
  ```
  Per invoice, prefer real Xero fields and degrade gracefully:
  - `exGst  += inv.subTotal ?? (inv.total - inv.totalTax) ?? inv.total / 1.1`
  - `gst    += inv.totalTax ?? (inv.total - inv.subTotal) ?? inv.total / 11`
  - `inclGst += inv.total`
  This handles GST-free / partially-taxable invoices correctly instead of a blanket
  `/11`, and falls back to the AU 1/11 assumption only when fields are absent.
- Replace `currentMonthInvoicedTotal` math with `splitInvoiceTotals(...)`.
- `difference = exGst − getOutTarget` (the cash-coverage number).
- Payload (additive, backward-compatible):
  ```
  currentMonth: {
    invoicedTotal,         // KEEP = inclGst (existing consumers unaffected)
    invoicedExGst,         // NEW
    gstCollected,          // NEW
    invoicedCount,
  }
  difference,              // now ex-GST basis
  basis: 'ex_gst',         // NEW — explicit marker
  ```

**Backend — `server/api/xero/get-out/forecast.get.ts`:**
- Add a GST line to the bridge/leakage so the forecast bridge reconciles on the same
  ex-GST basis. Confirm the forecast's `invoiced` layer uses ex-GST (or annotate the GST
  component) so the band ties out with the hero card and the tax-provision set-aside.

**Frontend — `app/pages/xeroflow/get-out.vue`:**
- Hero "Surplus/Shortfall" already binds `data.difference` — now ex-GST, no change needed.
- "Invoiced so far" card: keep showing `invoicedTotal` (gross) but add a subline
  `ex-GST {{ formatCurrency(data.currentMonth.invoicedExGst) }} · {{ formatCurrency(data.currentMonth.gstCollected) }} GST to ATO`.
- All new bindings null-safe.

**Tests:** `test/utils/getOutInvoiceTotals.test.ts` — GST-inclusive standard invoice,
GST-free invoice (`totalTax = 0`), mixed, missing-fields fallback (`/1.1`, `/11`),
empty array.

**Acceptance:**
- `difference` equals `exGst − target` for a known fixture.
- A $110,000-incl invoice contributes $100,000 ex-GST and $10,000 GST (or 1/11 split when
  only `total` is present).
- Existing cards (`invoicedTotal`, pacing, history) unchanged.
- Endpoint returns `401` on prod post-deploy (no 500).

---

## PR 2 — 13-week cashflow card + low-point / overdraft callout

**Backend:** none. `server/api/xero/get-out/cashflow-13w.get.ts` already returns
`openingCash`, `buckets[]`, `closingBalanceProjected`, **`lowestBalanceProjected`**,
**`lowestBalanceProjectedWeek`**, inflow/outflow totals, `projectionInputs`.

**Frontend:**
- `app/pages/xeroflow/get-out.vue`: `useFetch('/api/xero/get-out/cashflow-13w', { lazy:true, server:false })`
  with a typed shape; render in a full-width card (it deserves the room — banker's view).
- New `app/components/xeroflow/get-out/CashflowChart.client.vue` (pattern: existing
  `PacingChart`): a running-balance line/area across the 13 weekly buckets, a zero
  reference line, and a marker at the projected low-point week.
- **Low-point callout** derived purely from the payload:
  - `lowestBalanceProjected >= buffer` → green "Lowest projected balance $X (week N)".
  - `0 <= lowestBalanceProjected < buffer` → amber "Tight — dips to $X in week N".
  - `lowestBalanceProjected < 0` → red "⚠ Projected overdraft: −$X in week N".
  - `buffer` is a sensible constant (e.g. one `weeklyBurn` from `projectionInputs`), noted
    inline; no new config this PR.
- Empty/loading + null-safe states (no opening cash / no bank summary → "connect a bank
  feed in Xero to see the running balance").

**Tests:** if any bucketing/low-point *interpretation* logic lands in the component,
extract the pure part (e.g. `classifyLowPoint(lowest, buffer)`) into a helper + spec.
Chart rendering itself is not unit-tested (consistent with existing chart components).

**Acceptance:**
- Card renders 13 weeks with a correct running balance tied to `openingCash`.
- Callout severity matches `lowestBalanceProjected` vs buffer.
- Graceful empty state when bank summary is absent.

---

## PR 3 — Unbilled WIP card ("forgotten money")

**Backend:** none. `server/api/xero/get-out/unbilled-wip.get.ts` returns
`summary { totalHours, totalAmount, projectCount }` + `projects[] { name, clientName,
hours, amount, ageDays }` from billable `time_entries WHERE invoiced = false`.

**Frontend:**
- `useFetch('/api/xero/get-out/unbilled-wip', …)` typed; new card in the 3-up diagnostic
  rows.
- Headline `summary.totalAmount` ("uninvoiced work you could bill now"), project list
  sorted by amount with an `ageDays` badge (amber > 30d, red > 60d).
- **Graceful empty state is mandatory:** this agency may not use time tracking. If
  `projectCount === 0` / `totalAmount === 0`, show "No unbilled WIP — time tracking not
  in use" rather than an empty/broken card. Confirm the `time_entries` table exists; if
  the endpoint 500s on a missing table, add a guard so it returns an empty summary.

**Tests:** none beyond endpoint verification (no new pure logic). Verify the `time_entries`
table/columns exist in a migration; document if WIP is structurally empty for this tenant.

**Acceptance:**
- Card renders top-N projects with ages when WIP exists.
- Clean empty state when it doesn't; endpoint never 500s on absent data.

---

## PR 4 — Pipeline coverage card (3–4× rule)

**Backend:** none. `server/api/xero/get-out/pipeline-coverage.get.ts` returns
`quarterlyTarget`, `pipeline { quotesWeighted, recurringContribution, inferredMonthlyMrr,
totalFace, totalWeighted, … }`, `coverage { face, weighted, band }`.

**Frontend:**
- `useFetch('/api/xero/get-out/pipeline-coverage', …)` typed; new card.
- Coverage gauge/ratio against the 3–4× rule, colored by `coverage.band`
  (`<1×` red → `1–3×` amber → `3–4×+` healthy), with the explanatory "≥3–4× to reliably
  hit" caption.
- Pipeline composition breakdown (weighted quotes + recurring + inferred MRR) vs the
  quarterly target so the operator sees *what* makes up the coverage.
- Null-safe; loading/empty states.

**Tests:** none beyond endpoint verification (band logic lives server-side already).

**Acceptance:**
- Ratio + band render correctly against `quarterlyTarget`.
- Breakdown sums tie to `pipeline.totalWeighted`.
- Endpoint `401` on prod post-deploy.

---

## Phase-2 backlog (documented, NOT built this milestone)

1. **Forecast calibration** — snapshot each month's worst/realistic/best forecast, grade
   vs actual next month ("realistic ran 12% hot"). Needs light persistence
   (a `get_out_forecast_snapshots` table + a monthly snapshot cron).
2. **"Thrive" tier above break-even** — a target layer above survival for owner pay /
   profit / debt paydown / tax buffer (Profit-First-style allocation). Needs config schema
   extension + a second target line throughout.
3. **Gap-closing lever / what-if simulator** — model collect-overdue-AR + raise-missing-
   retainers + close-likely-quotes against the remaining gap.
4. **Client-concentration stress test on the target** — "if your 28%-of-target client
   churns, monthly coverage drops below target by $Z."
5. **Surface the remaining built endpoints** — `mrr-movement`, `yoy`, `ytd`,
   `utilization`, `profitability`, `efficiency`, `cash-runway`.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| GST fix silently changes a number people anchor on | Keep `invoicedTotal` (gross) visible; add an explicit ex-GST subline + `basis` marker; unit-test the split |
| `subTotal`/`totalTax` field names differ in `xeroFetch` output | Helper falls back to `total − totalTax`, then `/1.1` & `/11`; verify field names against a live payload during PR 1 |
| `unbilled-wip` 500s if `time_entries` absent for tenant | Guard endpoint to return empty summary; mandatory empty state in UI |
| Stale KV cache crashes new templates post-deploy | Null-safe bindings on every new field (cross-cutting rule) |
| `cashflow-13w` needs a Xero bank feed for opening cash | Empty-state copy directing to connect the feed |

## Rollout

Per PR: implement → unit tests (where logic) → `pnpm deploy:production` → curl endpoint
`401` → note for human browser UAT (deploy proves wiring, not visuals). Cards are additive
and degrade gracefully, so each PR is independently safe to ship.
