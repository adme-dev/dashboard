# PRD — CRM Enhancement Program (Sales Productivity → Data Quality → Power-User UX)

- **Status:** Draft for review
- **Date:** 2026-06-01
- **Owner:** Paul (paul@adme.net.au)
- **Related:** `docs/superpowers/specs/2026-05-31-native-crm-twenty-blueprint-design.md`, `docs/superpowers/specs/2026-06-01-crm-custom-objects-engine-design.md`
- **Task list:** `docs/superpowers/plans/2026-06-01-crm-enhancements-tasks.md`

---

## 1. Background & Motivation

XeroFlow's native CRM now ships its core (People, Companies, Opportunities/Pipeline, Activities/Notes timeline), a custom-objects engine with vertical packs (Retail proof), CSV import, custom fields, and a client-portal CRM-as-a-service surface. It is live in production but is, today, a **system of record** — it stores entities but does not yet help a rep *run their day*.

We maintain two sibling CRM codebases that we can mine to close that gap quickly:

| Project | Stack | Role for this program |
|---|---|---|
| `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval` | **Nuxt 4 + Neon/pg/Drizzle + Cloudflare** (our exact stack) | **Primary donor** — schemas, SQL, and `server/utils` port near 1:1 |
| `/Users/paulgiurin/Documents/GitHub/crm-dashboard-main` | Nuxt 4 + **Supabase** + shadcn-vue | **Design reference only** — feature ideas + schema shapes; Supabase Auth/RLS/Realtime coupling makes direct ports costly |

This PRD turns the investigation into a buildable program: **10 enhancements across 3 phases**, each phase an independently shippable slice that leaves the CRM more useful than before.

### Non-goals (already covered elsewhere — do NOT rebuild here)

These overlap with existing dashboard modules. Importing them would be duplication:

- **Email *campaigns* / templates / drip / segmentation** → owned by the **flyhub Email Marketing** module. *(Note: per-rep two-way **mailbox sync** — capturing a rep's 1:1 Gmail/Outlook email against a contact — is NOT this and NOT covered. It is deferred to Phase 4; see §8.)*
- **Inbound lead capture / form imports (Google/Meta) / fan-out routing rules** → owned by the **Leads capture & routing** module.
- **Notification fan-out / digests / quiet hours / importance scoring** → owned by the **Smart Watch & Notifications** system (we *consume* it, we don't rebuild it).
- **Visual workflow/automation builder** → owned by **Boards automation**.
- **Client/customer portal** → owned by the **Client Portal** + the CRM portal surface.
- **Quote/proposal engine** → owned by the existing **agency quotes module** (`server/api/agency/quotes`, Briefs→Xero, `app/pages/agency/sales/quotes`). We do **not** rebuild a quote engine — F14 *links* an opportunity to it and adds opportunity line-items.
- **Meeting transcription / recording / call intelligence** → the existing **office-meeting system** (`server/utils/officeMeeting*`, `platform/calendar`, `portal/meetings`, action-items→tasks) already covers artifacts/transcription. We integrate with it, not rebuild it.
- **Generic product catalog** → already modellable via the shipped **custom-objects engine** (the Retail pack models Products + Orders as config objects). New verticals get a catalog as engine config, not new core tables.
- **SMS / WhatsApp / Twilio / Telnyx channels** → net-new *communication channel*, out of scope for this program (parked → Phase 4).
- **Trade-in / appraisal / VIN / vehicle inventory / test drives** → automotive-specific → belongs to **Phase C: Automotive Pack** (separate initiative). When we build it, lift `customer-trade-in-estimates-schema.sql` + `components/crm/TradeInEvaluationSection.vue` from `promotion-knox`.

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|---|---|---|
| Reps act on records, not just store them | % of active opportunities with ≥1 open follow-up task | > 70% within 30 days of Phase 1 |
| No lead goes cold silently | Median time a `pending` task sits past `due_at` before action | trending down week-over-week |
| Prioritisation is data-driven | % of People with a computed score/grade | 100% (auto-computed) |
| Managers get pipeline visibility | Insights tab adopted | weekly active use by account managers |
| Data stays clean | Duplicate person rate after merge tooling | < 2% |
| Power users move fast | Saved views created per active CRM user | ≥ 2 |

### Guardrails
- **Zero regressions** to the live CRM (all changes additive; existing endpoints untouched in signature).
- **Agency + portal parity** maintained via `provide/inject('crmApiBase')` — every new agency capability that is appropriate for clients is mirrored read/write or read-only in the portal.
- **Client isolation** preserved — every new table is `client_id`-scoped and every query passes through `server/utils/crm/queryScope.ts`; portal handlers scope by `requireClientAuth(event).clientId` and never trust a request-supplied `client_id`.

---

## 3. Architecture & Conventions (applies to all phases)

These are the existing patterns every task must follow. They are not negotiable — they are how the current CRM is built.

- **DB access:** `queryRows()`, `queryOne()`, `execute()`, `transaction()` from `~~/server/utils/db.ts`. Inside `transaction()` use `client.query()` directly (never `queryOne`/`execute` — separate connection).
- **Migrations:** additive SQL in `server/database/migrations/NNN-*.sql` with `IF NOT EXISTS` guards on every `CREATE`. **Run immediately** against the DB:
  ```bash
  export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
  psql "$DATABASE_URL" -f server/database/migrations/<file>.sql
  ```
  **Check the next free number at build time** — parallel sessions (social/email/leads) consume numbers. This PRD assumes 147/148/149 but verify.
- **Auth:** `requireAuth(event)` (agency) / `requireClientAuth(event)` (portal). Config/admin surfaces use `requireRole(event, PERMISSIONS.ADMIN)` (matches the locked "agency-only definition" rule). Records, tasks, scores are editable by any authed CRM user within their client scope.
- **Server imports:** `~~/server/utils/...` (double-tilde), never `~/server/utils/`.
- **Frontend reuse:** composables read `inject('crmApiBase', '/api/crm')`; the agency page provides `/api/crm`, `/portal/crm` provides `/api/client-portal/crm`. New components must follow this so they work in both surfaces unchanged.
- **UI:** Nuxt UI v4 only (`UTable`, `USelectMenu`, `UModal`, `UFormField`, `UBadge`, …). Charts via **Unovis** (`@unovis/vue`). Dates via `UPopover` + `UCalendar` + `@internationalized/date` (never `<UInput type="date">`). **Invoke the `frontend-design` skill before building any form** (project rule).
- **USelectMenu:** never `value: ''` — use sentinels (`'all'`, `'none'`).
- **Cron:** Cloudflare Pages has **no `scheduled()` handler** — any recurring job needs a **companion Worker** (see `workers/meta-status-cron`, `pages-cron`) hitting `POST /api/cron/<job>` with header `x-cron-secret: $CRON_SECRET`. Never assume a dashboard toggle fires crons.
- **Notifications:** reuse `server/utils/notifications.ts` / `subscriptions.ts` — do not build a parallel notifier.
- **Testing:** Vitest + happy-dom. TDD for every pure util (scoring, assignment, dedupe, analytics aggregation, validation). Fresh worktree needs `pnpm exec nuxt prepare` once before vitest or it falsely reports "no tests".
- **Front-facing sync:** per `CLAUDE.md`, when a phase ships user-visible CRM capability, update `app/pages/features/*` + `MarketingNav.vue`.

---

## 4. Phase 1 — Sales Productivity (Tier 1)

**Theme:** turn the CRM from a record store into a tool reps run their day in.
**Donor:** `promotion-knox` (`crm-followups-schema.sql`, `/server/api/crm/followups/*`, `/server/api/crm/analytics/*`, `lead_scores`).
**One migration (147)** adds 5 additive tables. Ships as one coherent release.

### F1 — Follow-up Tasks & Reminders
**Problem:** there is no CRM-native task. Boards tasks exist but aren't tied to a person/company/opportunity, so reps have no "what do I do next on this account" surface.

**Requirements**
- A task belongs to exactly one CRM target: `person | company | opportunity` (polymorphic `target_type` + `target_id`), `client_id`-scoped.
- Fields: `title`, `description`, `task_type` (`call|email|sms|meeting|follow_up|general`), `priority` (`low|medium|high|urgent`), `status` (`pending|in_progress|completed|cancelled`), `due_at`, `reminder_at`, `completed_at`, `outcome` (`contacted|voicemail|no_answer|rescheduled|converted|not_interested|null`), `assigned_to` (user), `created_by`.
- **Overdue** is *derived* at read time (`status='pending' AND due_at < now()`), surfaced as a virtual status — no extra write needed. A nightly sweep (optional, F1b) persists overdue + fires reminders.
- CRUD via `server/api/crm/tasks/*` + portal mirror under `server/api/client-portal/crm/tasks/*`.
- UI: a **Tasks tab** on `/agency/crm` (list with status/priority/assignee/due filters), a **task list embedded in each record slideover** (person/company/opportunity), and a create/edit form (`UFormField` + `UPopover`/`UCalendar` for due/reminder).
- Reminders integrate with the existing notifications system, not a new one.

**Acceptance**
- Create a task on an opportunity → it appears in the opportunity slideover and the Tasks tab.
- A `pending` task with `due_at` in the past renders with an overdue badge without a write.
- Completing a task captures `completed_at` + optional `outcome`.
- Portal user sees only their client's tasks; cannot read another client's.

### F2 — Stage-change Automation
**Problem:** moving an opportunity forward is a manual dead-end; nobody is reminded to do the next thing.

**Requirements**
- Per-client rules in `crm_stage_automations`: when an opportunity enters a given stage, auto-create a follow-up task from a template (`title`, `task_type`, `priority`, `due_offset_days`), assigned to the opportunity owner (fallback: rule-specified user).
- Hook fires inside the existing opportunity stage-change path (`opportunities/[id].patch.ts` and any move endpoint) — inside the same `transaction()`.
- Rules are admin-configured (`requireRole(PERMISSIONS.ADMIN)`); v1 config UI can be minimal (list + add/remove) in pipeline settings.
- Idempotent: re-entering a stage does not stack duplicate open tasks for the same rule+opportunity (guard on an existing open task from the same rule).

**Acceptance**
- With a rule "on `Proposal` → create call task due +2d", moving an opportunity to Proposal creates exactly one task assigned to the owner.
- Moving back and forth does not create duplicates while the first is still open.

### F3 — Contact / Lead Scoring
**Problem:** reps can't tell which contacts to work first; we have AI *importance* scoring for notifications but nothing scoring CRM contacts.

**Requirements**
- `crm_scores` (one row per `person|company` target) + `crm_score_history` (append-only). **Include a `score_type` column (`lead | health`) and unique on `(client_id, target_type, target_id, score_type)` from day one** — Phase 1 only computes `lead` (acquisition) scores, but this lets Phase 4 add `health`/churn-risk scoring (per `crm-dashboard-main`'s `customer_health_scores`) with **no migration**. Cheap forward-compatibility.
- `total_score` 0–100 from four components, each a pure deterministic function (TDD): **engagement** (activity volume), **intent** (open opportunities / high-intent activity types), **fit** (configurable signal from custom fields / company size), **recency** (decay on last activity). `grade` derived (`A–F`, or `Hot/Warm/Cold` — pick one enum, document it).
- `server/utils/crm/scoring.ts` is framework-free and unit-tested with fixture inputs (the single biggest "copy from `promotion-knox`, zero coupling" win).
- Recompute on: activity create, task complete, opportunity stage change (in-band) + a bulk recompute endpoint + a nightly **decay sweep** (cron → recency erodes scores).
- UI: a **grade badge column** on PeopleTable + a score breakdown panel in the person slideover (component bars). Sortable by score.

**Acceptance**
- `scoring.ts` unit tests cover each component + grade boundaries + decay.
- Logging an activity on a person raises their engagement + recency components and writes a history row with reason.
- People table can sort by score; grade badge renders.

### F4 — Sales Analytics & Forecasting
**Problem:** managers have only raw pipeline aggregation, no funnel/win-rate/cycle-time/forecast.

**Requirements**
- **New table `crm_opportunity_stage_history`** (id, client_id, opportunity_id, from_stage_id, to_stage_id, changed_by, changed_at) — populated forward-only by the stage-change hook (same one F2 uses). Required for cycle-time / stage-duration; **historical data starts accumulating from ship date** (documented limitation).
- Aggregation util `server/utils/crm/analytics.ts` (TDD on pure aggregation given fixture rows):
  - **Conversion funnel** by stage (count + value per stage).
  - **Win rate** (won / closed) overall and by owner.
  - **Weighted pipeline forecast** (Σ value × stage probability) by stage / owner / time window — computable without history.
  - **Avg sales-cycle length** + **avg time-in-stage** — from `crm_opportunity_stage_history` (forward-only).
- API: `server/api/crm/analytics/{summary,funnel,performance,forecast}.get.ts`.
- UI: an **Insights tab** on `/agency/crm` with Unovis charts (funnel, pipeline-by-stage bar, win-rate, weighted forecast). Date-range + owner filters.

**Acceptance**
- Funnel + win-rate + weighted forecast render from live opportunities on day one.
- Cycle-time charts populate as stage changes accrue post-ship (empty-but-correct before that).
- Aggregation util has unit tests proving funnel/win-rate/forecast math against fixtures.

---

## 5. Phase 2 — Data Quality, Relationships & Governance (Tier 2)

**Theme:** keep the database clean, model how contacts relate, route records to the right rep, and make changes auditable.
**Donor:** `promotion-knox` (`customer-lifecycle-automation.ts`, `customer_relationships.sql`, `/admin/customers/merge*`, `lead-assignment.ts`).
**Migration 148.**

### F5 — Customer Lifecycle + Auto-tagging
- Add `lifecycle_stage` + `tags text[]` to `crm_people` and `crm_companies`.
- Lifecycle enum: `lead → prospect → active → customer → lost → dormant`; transitions auto-driven (first opportunity → prospect; opportunity won → customer; no activity in N days → dormant) via `server/utils/crm/lifecycle.ts` (TDD on transition rules), hooked into opportunity + activity paths.
- UI: lifecycle badge + tag chips on tables/slideovers; filter by lifecycle/tag.
- **Acceptance:** winning an opportunity flips the linked person/company to `customer` and adds a `won` tag; transitions are unit-tested.

### F6 — Duplicate Detection + Merge
- Enable `pg_trgm`; candidate detection by normalized email/phone + name similarity (`server/utils/crm/dedupe.ts`, TDD on normalization + scoring).
- `crm_merge_log` audit table. Merge endpoint reassigns all child rows (opportunities, activities, tasks, scores, stage history) loser→winner inside one `transaction()`, then soft/hard-deletes the loser and logs.
- UI: a **Duplicates view** (suggested pairs) + a side-by-side merge modal (per-field winner picker).
- **Acceptance:** merging two people moves all children to the survivor with zero orphaned rows (integration test against real DB), logged in `crm_merge_log`.

### F7 — Lead Assignment Strategies + Record Ownership & Visibility (record-level)
- **Ownership:** `crm_opportunities` already has `owner_id`; add `owner_id`/`assigned_to` to `crm_people` and `crm_companies` (currently absent). Establish a single `owner_id` convention across all three core entities.
- **Assignment:** `crm_assignment_rules` (strategy `round_robin|load_balanced|priority|single`, `pool` jsonb of user ids, `assignment_index` for atomic RR, `is_active`). `server/utils/crm/assignment.ts` (TDD) — **atomic round-robin** via `UPDATE ... RETURNING` on `assignment_index` (prevents concurrent double-assignment).
- Hook: a new person/opportunity created without an owner runs the active rule. Manual **reassign** + **claim** actions in UI.
- **Visibility (decision — defaulted non-breaking):** add a per-client setting `record_visibility: 'team' | 'owner'` (default **`team`** = current behaviour, every staffer in a client sees every record). When set to **`owner`**, non-admin/non-manager users see only records they own or are assigned; admins/managers always see all. A "My records" filter is available in every mode via saved views (F9). This is opt-in per client and requires **no migration to switch** — it's a settings flag read by `queryScope.ts`.
- **Acceptance:** RR pool of 3 → ten new records distribute 4/3/3 under concurrent creates (integration test). With `record_visibility='owner'`, a rep's list excludes records owned by a colleague; an admin's list includes them; switching back to `team` restores full visibility without data change.

### F11 — Contact Relationships & Company Hierarchy
**Problem:** the CRM can't express how people relate (decision-maker, spouse, colleague, referral) or how companies nest (parent/subsidiary). This is a core CRM primitive both donors model and we lack entirely.

**Requirements**
- `crm_relationships` (port `promotion-knox`'s `customer_relationships`): `id, client_id, from_type, from_id, to_type, to_id, relationship_type, is_decision_maker, is_primary_contact, notes`. `relationship_type` enum covers person↔person (`spouse|partner|parent|child|sibling|colleague|referrer|reports_to`) and company↔company (`parent_of|subsidiary_of`) and person↔company (`works_at|decision_maker_at`).
- Bidirectional: store one row, derive the inverse (`reports_to` ⇄ `manages`, `parent_of` ⇄ `subsidiary_of`) via a util mirroring Knox's `get_inverse_relationship_type()`.
- `server/utils/crm/relationships.ts` (TDD) — inverse mapping + cycle guard (a company can't be its own ancestor).
- API `server/api/crm/relationships/*` + portal mirror; UI: a **Relationships panel** in person/company slideovers (add/remove links, decision-maker flag), and a compact org-tree for company hierarchy.

**Acceptance:** linking Person A `reports_to` Person B surfaces the inverse on B's panel; a company tree renders parent→children; decision-makers are flagged on the company's contact list; cycle creation is rejected.

### F12 — Field-level Audit Trail
**Problem:** we have activity timelines and (Phase 1) opportunity stage-history, but no general "who changed what field, when" record. Neither donor has it; it's valuable for disputes, governance, and trust.

**Requirements**
- `crm_audit_log` (`id, client_id, entity_type, entity_id, field, old_value, new_value, changed_by, changed_at`). Append-only; indexed `(entity_type, entity_id, changed_at)`.
- A shared `recordFieldChanges()` helper in `server/utils/crm/audit.ts` (TDD on diffing old vs new row) invoked from the patch handlers of people/companies/opportunities/records. Diff only whitelisted business fields (skip `updated_at`, large JSONB blobs unless explicitly tracked).
- UI: a **History tab/section** in each record slideover rendering the change log (human-readable field labels).

**Acceptance:** changing an opportunity's stage + value writes two audit rows attributing both to the actor; the record's History tab shows them newest-first; unchanged fields produce no rows.

---

## 6. Phase 3 — Power-User UX & Integrations (Tier 3)

**Theme:** make heavy daily users fast, attach documents, connect to quotes, and give leadership goal tracking.
**Donor:** `promotion-knox` FTS + `crm-dashboard-main` `search.service.ts` / `customer_documents` / quotes (reference); `communication_log`.
**Migration 149.**

### F8 — Global Full-text Search
- `websearch_to_tsquery`-based FTS across `crm_people`, `crm_companies`, `crm_opportunities`, `crm_activities`, `crm_tasks` (GIN indexes; generated tsvector or expression index). Unified `server/api/crm/search.get.ts` returning typed results with snippet + target link.
- UI: command-palette-style global search on `/agency/crm`.
- **Acceptance:** typing a name/email/company returns ranked cross-entity results < 300ms on realistic data; client-scoped.

### F9 — Saved Views + Advanced Filters + Bulk Actions
- `crm_views` (per-user or shared: `object_type`, `name`, `filters` jsonb, `columns` jsonb, `sort`, `is_shared`). Extend list endpoints with a richer filter grammar via existing `buildWhere`/`queryScope`. Bulk endpoints: `bulk-assign`, `bulk-tag`, `bulk-status`, `bulk-delete`.
- **Explicit list export:** a `?format=csv|xlsx` export of the *current filtered view* for People/Companies/Opportunities (we have CSV import but no export today). Streams server-side, respects client scope + visibility mode (F7).
- UI: filter builder, save/load view dropdown, multi-select rows + bulk action bar, an Export button on each list.
- **Acceptance:** a saved view round-trips (create → reload → identical results); a bulk-tag on 50 selected people applies in one request; exporting a filtered People list downloads exactly the rows the filter shows.

### F10 — Unified Communication Log
- `crm_communications` (`channel email|phone|sms|note|meeting`, `direction`, `subject`, `summary`, `body`, `from_addr`, `to_addr`, `user_id`, `external_id`, `thread_id`, `occurred_at`, `metadata`). Optional bridges from the **Email Marketing** + **Leads** modules write comm-log entries (read-only ingestion, no coupling reversal). Timeline merges with `crm_activities`.
- UI: unified per-contact timeline, filterable by channel. Also surface `contact preferences` here — add `do_not_contact`, `do_not_email`, `do_not_call`, `do_not_sms`, `preferred_channel`, `best_time` to `crm_people` (small additive columns; consent-aware, mirrors `crm-dashboard-main`'s contact preferences) and honour them when logging/sending.
- **Scope line:** F10 is **logging + module bridges only**. True per-rep two-way mailbox sync (OAuth Gmail/Outlook, inbound+outbound capture) is **deferred to Phase 4** (§8) — it's a large build and not required for daily CRM use.
- **Acceptance:** an email sent via the email module (when bridged) appears on the contact's unified timeline tagged `email/outbound`; a `do_not_email` contact is visibly flagged and excluded from bridged sends.

### F13 — Documents / Attachments on Records
**Problem:** the CRM can't attach files (contracts, signed quotes, IDs) to a person/company/opportunity. R2 storage already exists platform-wide (Briefs/proofs use it).

**Requirements**
- `crm_documents` (port `promotion-knox`'s `customer_documents`): `id, client_id, target_type, target_id, document_type, title, file_key, file_size, mime_type, uploaded_by, expires_at, created_at`. `document_type` enum (`contract|invoice|id|proposal|other`); `expires_at` for renewable docs.
- Upload via existing **R2** binding (reuse the platform upload util/pattern; no new storage infra). Signed download URLs; client-scoped access only.
- UI: a **Documents panel** in record slideovers (upload/list/download/delete), expiry badge.

**Acceptance:** uploading a PDF to an opportunity stores it in R2 and lists it on the record; another client cannot fetch it; an expired doc is badged.

### F14 — Opportunity ↔ Quote Link + Line Items
**Problem:** opportunities carry a single `value` but no line-item composition, and aren't connected to the existing agency quotes module.

**Requirements**
- `crm_opportunity_line_items` (`id, client_id, opportunity_id, name, description, quantity, unit_price, line_total` generated). Opportunity `value` can derive from Σ line totals (or stay manual — document the rule).
- Link field `quote_id` on `crm_opportunities` referencing the **existing** agency quotes module; a "Create/Link Quote" action from the opportunity that hands line-items to that module. **No new quote engine.**
- UI: line-items editor in the opportunity slideover; quote link/status chip.

**Acceptance:** adding line-items rolls up to the opportunity value; "Create Quote" produces a quote in the existing module pre-filled from line-items and links it back; the chip reflects quote status.

### F15 — Sales Targets / Quotas + Leaderboard
**Problem:** no goal-vs-actual for reps; F4 shows pipeline but not attainment. Neither donor has it — net-new, standard CRM, pairs with F4.

**Requirements**
- `crm_sales_targets` (`id, client_id, owner_id, period_start, period_end, metric` (`revenue|deals_won|new_opportunities`), `target_value`). Actuals computed from `crm_opportunities` (won value/count in period) by the F4 analytics util.
- API `server/api/crm/targets/*` (admin-set) + an attainment query.
- UI: a **Leaderboard / Targets** panel on the Insights tab — per-rep target vs actual, % attainment, ranked.

**Acceptance:** setting a $50k monthly revenue target for a rep and winning $30k shows 60% attainment; the leaderboard ranks reps by attainment for the selected period.

---

## 7. Sequencing, Risks & Dependencies

- **Build order is strict:** F1 (tasks) underpins F2 (stage automation creates tasks) and F3 feeds on activity/task signals; F4 needs the stage-history table that F2's hook populates. So **F1 → F2 → F4-history-hook → F3 → F4-analytics** within Phase 1.
- **Phase independence:** each phase ships on its own migration and is reverts-safe (additive). Phases 2–3 do not block Phase 1.
- **Cron dependencies:** F1b reminders, F3 decay sweep, and (later) F5 dormancy each need the **companion-Worker cron** pattern + `CRON_SECRET`. Phase 1 ships *without* cron (derived overdue, on-demand scoring); crons are explicit follow-on tasks so the core slice isn't blocked on Worker deployment.
- **Deploy discipline (from hard-won project memory):** only ever deploy `origin/main` to prod; build+deploy from a checkout with its **own** `node_modules` (never a worktree with symlinked node_modules — it shares the Nuxt build cache and 500s every prerendered marketing route). Verify with `wrangler pages deployment list` (top row Production + Source=main), not just HTTP 200.
- **Parallel-session hazard:** the shared working dir has concurrent sessions. `git status` before branch ops; isolate multi-commit runs in a worktree; never `git add -A`. Verify the next migration number isn't taken before writing it.
- **Risk — analytics history:** cycle-time metrics are forward-only (no backfill of stage changes). Mitigation: clearly label "data since <ship date>" in the Insights UI.
- **Risk — scoring trust:** a wrong score erodes rep trust fast. Mitigation: scoring is a transparent, unit-tested deterministic util with a visible component breakdown, not a black box.
- **F12 audit is cross-cutting:** the `recordFieldChanges()` helper is invoked from every core patch handler. Land it via a single shared util + one call site per entity, not scattered ad-hoc logging — otherwise coverage drifts.
- **Ownership/visibility is a settings flag, not a schema fork:** default `record_visibility='team'` preserves today's behaviour exactly (zero regression). Only `queryScope.ts` changes (reads the flag); flipping a client to `'owner'` later is a settings write, no migration. Confirm with stakeholders whether any client actually wants owner-scoped visibility before building the `'owner'` branch — it may be YAGNI for a while (ship the column + default, gate the branch).
- **F14 integrates, doesn't reimplement:** the opportunity→quote action must call the existing agency quotes module's create path; if that path isn't cleanly callable server-side, the smaller win (line-items + a manual link field) ships first.

---

## 8. Out of Scope / Future (Phase 4 and beyond)

Deliberately deferred — documented so the scope line is explicit, not accidental:

- **Two-way mailbox sync (Phase 4):** per-rep OAuth Gmail/Outlook with inbound+outbound 1:1 email capture against contacts (per `crm-dashboard-main`'s Gmail/Outlook sync). Large build (OAuth per user, watch/push subscriptions, threading). F10 deliberately ships logging + bridges first; this is the heavyweight follow-on. **Recommendation: defer.**
- **Health / churn-risk scoring activation (Phase 4):** the F3 `crm_scores` schema already carries `score_type` so `health` scoring lands with **no migration** — just a new scoring util + recency/engagement signals (per `customer_health_scores`). Activate once there's enough post-sale signal.
- **CRM AI layer (Phase 4):** next-best-action, auto-drafted follow-ups, data enrichment, sentiment — natural once tasks + scoring + comms log + relationships exist to feed them. Reuse the platform's Groq stack; integrate meeting-intelligence from the existing office-meeting system rather than rebuilding.
- **SMS/WhatsApp channels (Phase 4):** parked until a channel decision is made; would write into the F10 comms log.
- **Automotive Pack (Phase C):** separate initiative; reuse `promotion-knox` trade-in/vehicle/test-drive schemas. Product catalogs for new verticals come via the existing **custom-objects engine**, not new core tables.

### Revised feature → phase map (post-review)

| Phase | Migration | Features |
|---|---|---|
| **1 — Sales Productivity** | 147 | F1 Tasks · F2 Stage automation · F3 Scoring *(generic `score_type`)* · F4 Analytics + forecasting |
| **2 — Data Quality, Relationships & Governance** | 148 | F5 Lifecycle+tags · F6 Dedupe/merge · F7 Assignment + ownership/visibility · **F11 Relationships & hierarchy** · **F12 Field-level audit** |
| **3 — Power-User UX & Integrations** | 149 | F8 FTS · F9 Saved views + bulk + **export** · F10 Comms log *(+ contact preferences)* · **F13 Documents** · **F14 Quote link + line items** · **F15 Sales targets/leaderboard** |
| **4 — Intelligence & Channels** | — | Mailbox sync · Health-score activation · CRM AI layer · SMS/WhatsApp |
