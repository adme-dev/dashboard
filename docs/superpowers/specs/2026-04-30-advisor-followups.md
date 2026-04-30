# Advisor — Follow-up Phase Notes

**Date:** 2026-04-30
**Context:** Deferred items from the Triage + Authoring phase, plus Tier 2-5 items from the original gap analysis. This document is a backlog of candidate next-phase work — not a spec for any one item. Each entry has enough detail to choose between them and to brainstorm one into a real spec.

**Status of source phase:** complete; 6 slices shipped on commits `73ec502 → e96d541`. 43 Vitest tests, 2 migrations (085, 086), 9 components in `app/components/advisor/`.

---

## A. High-leverage product additions

### A1. Portfolio analytics page
**Why now:** The phase landed `recommendation_outcomes` with `metric_delta` measurements at 30/60/90 days, plus `category` taxonomy across all clients. The data to compute "advisor ROI" exists; nothing surfaces it.

**Shape:**
- New route: `/advisor/analytics`
- Tiles: total measured impact (sum of $ deltas), win rate (% of outcomes where `deltaDirection === 'good'`), mean time-to-act (acted_at − created_at), # active clients with open recs
- Charts: recs by category (bar), recs by status over time (stacked), top-5 metrics moved (with $ delta)
- Drill-down: click a category bar → filtered `/advisor` view

**Effort:** M. Most queries are aggregations on existing tables; no schema changes needed. Charts via Unovis (already in stack).

**Watch:** outcomes are sparse for new tenants — empty-state guidance matters. Currency conversion if multi-tenant has different currencies.

---

### A2. Source-data drill-down in drawer
**Why now:** The current drawer shows the AI's recommendation but not the *evidence*. Advisors defend the advice in client meetings; right now they have to alt-tab to /reports.

**Shape:**
- New "Why this matters" section in the drawer (between Action and Controls grid)
- Renders the `xero_metric_snapshot` JSONB column already populated on every AI rec — small key/value table of the metrics the LLM saw at generation time
- For metrics in `target_metric`: link to `/reports` with the matching `period_key` pre-selected

**Effort:** S. Schema column already exists; this is read-only UI rendering JSONB.

**Watch:** snapshot may be large — collapsed by default, expand on click.

---

### A3. Metric chart over time on outcomes
**Why now:** Outcomes are listed as cards (day 30 / 60 / 90). A line chart with vertical markers at `created_at` and `acted_at` is far more legible and is the standard advisory deliverable for board packs.

**Shape:**
- Replace the outcomes card list with a single Unovis line chart per recommendation
- X-axis: time; Y-axis: metric value (currency / % / days / ratio per `METRIC_META`)
- Markers: created_at (gray), acted_at (green), each outcome (blue dot with delta tooltip)
- Fallback: keep the card list as a "table view" toggle for data-precision users

**Effort:** S. Pure UI; data already in `recommendation_outcomes`.

**Watch:** y-axis unit must match the metric's `METRIC_META.unit`.

---

### A4. Board-task linkage
**Why now:** This app's value prop is the boards system. Many recs are operational ("chase top 5 overdue invoices") and belong on a Finance board, not just an advisor backlog.

**Shape:**
- New column on `tasks`: `source_recommendation_id UUID REFERENCES recommendations(id) ON DELETE SET NULL`
- Drawer adds "Link to board task" affordance — searches existing tasks or creates one with the rec's title/action prefilled
- On the board: tasks with a linked rec get a small "from advisor" badge; clicking opens the rec drawer
- On the rec: linked tasks render in the relationship graph (the `AdvisorGraph` already supports this node type)

**Effort:** M. One migration, one new endpoint pair, drawer UI, board task badge.

**Watch:** when a board task is closed, should the rec auto-flip to status='done'? Probably *suggest* (toast prompt) rather than auto-do, to keep the audit trail clean.

---

## B. Quality-of-life improvements

### B1. AI rec thumbs up/down
**Why now:** Industry-standard for RAG/LLM systems in 2026. Lets you compute satisfaction-per-period and tune the Groq prompt empirically.

**Shape:**
- Add `quality_rating SMALLINT CHECK (quality_rating IN (-1, 0, 1)) DEFAULT 0` to `recommendations`
- Drawer: thumbs row next to the AI/Manual badge in the header (only shown for `source='ai'`)
- Optional `quality_note TEXT` field for "what was wrong with this rec"
- Future: feed `-1` rated recs back into a quality dashboard / fine-tuning corpus

**Effort:** XS. One ALTER TABLE, one PATCH field, one drawer UI element.

---

### B2. Snooze auto-resurface notification
**Why now:** Snooze visibility already works — but when a snoozed item reappears, nobody is told. Easy miss.

**Shape:**
- Daily cron (Cloudflare scheduled Worker or Nitro nitro hook): `SELECT id, assigned_to FROM recommendations WHERE snoozed_until = CURRENT_DATE`
- For each row, emit a notification through the existing `server/utils/notifications.ts` pipeline (subscription-aware, quiet-hours-aware, includes Workers AI importance scoring)
- Email digest variant: combine a tenant's resurfaced recs into a single morning email

**Effort:** S. Cron + 5-line handler; the notification stack is already wired.

**Watch:** rec might no longer have an assignee; fall back to "the whole tenant" or to whoever created it.

---

### B3. Saved views / personal triage queues
**Why now:** Each user reconstructs the same filter set every visit ("My open high-priority cashflow"). 3 clicks every time.

**Shape:**
- New table `advisor_views (id, user_id, name, filters JSONB, created_at)`
- Header gets a "Save view" button when filters differ from default; saved views render as quick-access chips in a new row above the filters
- Personal (per-user); future phase could add tenant-shared views

**Effort:** S. One migration, two endpoints (POST/DELETE), one component.

---

### B4. Email digest of new advisor recs
**Why now:** Recs sit in /advisor until someone visits. Account managers likely won't.

**Shape:**
- Daily/weekly digest configurable per user (reuse `paul:notifications` infra)
- Renders top 5 new recs by priority, grouped by client
- Resend integration already in place

**Effort:** S. Mostly a Resend template + cron; piggybacks on existing notification subscriptions.

---

### B5. Goal binding — `target_value`
**Why now:** Recs track `target_metric` + `target_direction` + `baseline_metric_value` but no explicit target ("get debtor days under 45"). Without that you can't render a progress bar.

**Shape:**
- Add `target_value NUMERIC NULL` to recommendations
- Drawer impact-attribution section gains a goal pill: "Baseline 62 → Target 45 → Latest 51 (49% there)"
- Manual-create modal advanced section: target value input next to direction
- LLM prompt update: emit `target_value` when the rec implies a clear numeric goal

**Effort:** S. One migration, drawer UI, one prompt addition.

---

## C. Smaller polish items

### C1. Backfill categories on existing AI recs
**Effort:** XS-S depending on volume. One-shot Groq classification pass over rows where `source='ai' AND category IS NULL`. Or skip entirely — natural decay as new reports replace old ones.

### C2. @mentions in comments
**Effort:** S. Reuse the `@mention` pattern from chat; render as `UPopover` on `@`. Notification fan-out via existing `mentions-enhanced.md` plumbing.

### C3. Markdown in comments
**Effort:** XS. `marked` or `unified` is likely already in node_modules; render with sanitisation.

### C4. Free-form tags alongside fixed-enum category
**Effort:** S. New `tags TEXT[]` column + new `recommendation_tags` view for autocomplete. Decision: when does a tag earn promotion to the fixed enum? Probably never, manually only.

### C5. Bulk actions in Kanban
**Effort:** S. Currently table-only. Multi-select on Kanban cards with checkbox or shift-click; reuse existing `<AdvisorBulkActionBar>` mounted by the parent.

### C6. Sub-tasks / checklist on a rec
**Effort:** S. Either a JSONB `checklist` column on `recommendations` or a small dedicated table. JSONB is simpler for a feature this lightweight.

### C7. Dependencies — "blocked by"
**Effort:** S. Reuse the `task_linked_items` pattern from migration 053; new table `recommendation_links` with `link_type IN ('related', 'blocks', 'is_blocked_by', 'duplicate')`. Render in the graph + filter.

### C8. SLA / aging signals
**Effort:** XS. New computed column on the index endpoint: `aged_days = EXTRACT(DAY FROM NOW() - created_at) WHERE status IN ('open', 'in_progress')`. Surface as a chip on cards/rows when > 30.

### C9. Keyboard shortcuts in the table
**Effort:** XS. `j` / `k` navigate, `e` open drawer, `x` toggle selection. Use `useEventListener` from VueUse.

### C10. Dismiss confirmation in drawer
**Effort:** XS. Currently single-click, no undo. Add a `UModal` confirmation (mirrors the bulk dismiss flow already shipped).

### C11. UTable v4 selection API verification
**Effort:** XS. The phase used a manual checkbox-column fallback (per spec). When time permits, verify if `v-model:selection` works on the installed UI version and migrate.

### C12. Drawer URL persistence
**Effort:** XS. Open drawer should write `?recId=...` to the URL so deep-link sharing works.

### C13. Empty state for first-time users
**Effort:** XS. Current empty state has one CTA ("Generate on /reports"). Add: "Or create one manually" → opens the create modal.

### C14. Mobile reflow audit
**Effort:** S. Filters + table likely break under 768px. Kanban already horizontal-scrolls. Audit + fix when a mobile use case appears.

---

## D. Strategic / multi-phase

### D1. Client-portal exposure of recommendations
**Why:** You have `requireClientAuth` infrastructure and a 11-page client portal. Selectively shareable recs would be a real revenue lever.

**Shape:**
- Add `visible_to_client BOOLEAN DEFAULT FALSE` on recommendations
- Drawer toggle "Share with client" — gated to `category IN ('cashflow', 'collections', 'pricing', 'growth')` (i.e. not internal cost-control / staffing items)
- Portal shows shared recs in a new "Advisor insights" page

**Effort:** L. New page in client portal, RBAC checks, redaction rules, audit trail of what was shared.

**Watch:** legal / compliance sign-off needed before shipping.

---

### D2. Quarterly board-pack PDF export
**Why:** Standard advisory deliverable. Currently advisors copy-paste manually.

**Shape:**
- New endpoint `/api/advisor/board-pack?period=YYYY-Q1&client_id=...` returns a PDF
- Renders: cover page, period summary, top recs by status, measured impact, themes by category, snapshot of key metrics with charts
- CF Browser Rendering for headless Chrome → PDF, or `pdfkit`

**Effort:** L. Heavy template work + pagination + asset handling.

---

### D3. Threshold-based proactive alerts
**Why:** `advisorMetrics.ts` knows the metric registry. A nightly threshold job could auto-create draft recs without waiting for an LLM pass.

**Shape:**
- New table `advisor_alert_rules (tenant_id, metric_key, threshold_value, direction, action: 'notify'|'create_rec')`
- Daily cron evaluates rules against current metric values
- Rule: "alert when debtor days > 60" → auto-creates a draft rec with `source='alert'` (new source value)

**Effort:** M. Cron + admin UI for rules + new source enum value.

**Watch:** false-positive risk — defer until you have clean metric history.

---

### D4. Approval gate on AI recs
**Why:** Currently AI output flows straight into the backlog. An optional "needs review → approve → publish" state would let advisors curate before the team sees recs.

**Shape:**
- Add `published BOOLEAN DEFAULT TRUE` on recommendations (default keeps current behaviour)
- Tenant setting "Require approval for AI recs" sets the LLM insertion to `published=FALSE`
- New "Pending review" tab in the navbar; only owner/admin sees unpublished recs
- On approval, audit event `published_by` + `published_at`

**Effort:** M. Schema, settings UI, RBAC, navbar pill.

**Watch:** this can become a bottleneck — make it tenant-opt-in.

---

### D5. Benchmarking — "your debtor days vs industry"
**Why:** Recs feel ungrounded without peer context.

**Shape:**
- Hard-coded benchmarks for digital marketing agencies (already referenced in the existing prompt: "DSO < 45 days, gross margin 45-60%")
- Drawer impact section gains a "vs industry" annotation: "Your DSO of 62 vs industry avg 45 — top quartile starts at 35"
- LLM prompt already has the benchmarks; surface them in UI too

**Effort:** S. Static data structure + UI annotation.

**Watch:** real benchmarking would pull from anonymised cross-tenant data — wait for ≥20 tenants on the platform before promising that.

---

### D6. Time-tracking integration on advisory work
**Why:** You already have task-level time tracking (per memory). Tracking advisor-time-per-rec would let you bill for advisory work or compute true cost-per-recommendation.

**Shape:**
- "Start timer" button on the rec drawer logs to `time_entries` with `recommendation_id` linkage
- Total advisor time per period rolls up into the portfolio analytics page (A1)

**Effort:** M. Schema link, timer UI, aggregation, billing integration.

---

### D7. Automation rules
**Why:** "When high-priority cashflow rec created → also create board task in Finance board, notify @Finance" — natural extension of the existing automation/recipe pattern in the boards system.

**Shape:**
- Reuse the existing automation engine (board-automations infrastructure from migration 005)
- New trigger types: `advisor_rec_created`, `advisor_rec_status_changed`
- Existing actions (create task, notify channel, send email) work as-is

**Effort:** S-M. Mostly trigger plumbing.

---

## Recommended next phase

If you want a single follow-up phase that delivers maximum incremental value:

**Bundle: A1 (analytics) + A2 (drill-down) + A3 (metric chart) + B1 (thumbs) + B2 (snooze cron)**

Together this is the **"prove advisor ROI"** phase:
- A1 surfaces the dollar impact across all clients (sales asset)
- A2 + A3 make individual recs defensible in client meetings
- B1 builds a quality feedback loop on AI output
- B2 closes the snooze loop so deferred work doesn't get lost

Estimated effort: ~M total (most pieces are read-only UI on existing data; B1 + B2 are tiny). Should fit a single phase comparable in size to slice 1 of the just-shipped phase.

Slice A4 (board-task linkage) is also strategic but bigger — recommend it as its own phase.

---

## What NOT to build

Items I'd actively recommend against until specific demand surfaces:

- **D5 cross-tenant benchmarking** — premature without ≥20 tenants
- **C4 free-form tags** — fixed taxonomy is working; tags fragment the analytics
- **C14 mobile audit** — no evidence anyone uses /advisor on mobile yet
- **D4 approval gate** — adds friction; only worth it if a customer asks
- **D2 PDF export** — long tail; CSV export from the table is good enough until a customer says otherwise
