# Task List — CRM Enhancement Program

- **PRD:** `docs/superpowers/specs/2026-06-01-crm-enhancements-prd.md`
- **Date:** 2026-06-01
- **Donor source (primary):** `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval`
- **Donor source (reference):** `/Users/paulgiurin/Documents/GitHub/crm-dashboard-main`

## Legend
- `[ ]` not started · `[~]` in progress · `[x]` done
- **Size:** S ≈ <½ day · M ≈ ½–1.5 days · L ≈ 2–4 days
- Every pure util task is **TDD** (write the failing test first).
- After any phase migration: run it via `psql "$DATABASE_URL" -f …` immediately (see PRD §3).
- Before building any **form**: invoke the `frontend-design` skill (project rule).
- Mirror every appropriate agency endpoint under `server/api/client-portal/crm/**` (scope by `requireClientAuth().clientId`).

---

## PHASE 0 — Setup (do once, before Phase 1)

- [ ] **0.1 (S)** Create an isolated worktree off `origin/main` with its **own** `node_modules` (not symlinked): `git worktree add --detach .worktrees/crm-enh origin/main` → `rm node_modules` symlink (if any) → `pnpm install --prefer-offline` → `pnpm exec nuxt prepare`.
- [ ] **0.2 (S)** Confirm the next free migration number (`ls server/database/migrations | sort | tail`). PRD assumes **147** for Phase 1 — verify nothing parallel took it.
- [ ] **0.3 (S)** Skim donor files to copy from: `promotion-knox/database/crm-followups-schema.sql`, `…/server/api/crm/followups/*`, `…/server/api/crm/analytics/*`, `…/database/crm-followups-schema.sql` (lead_scores section), `…/server/utils/lead-assignment.ts`, `…/server/utils/customer-lifecycle-automation.ts`.

---

## PHASE 1 — Sales Productivity  (migration 147)

> Build order within the phase: **F1 → F2 → F4 stage-history hook → F3 → F4 analytics**. One migration, one release.

### 1A · Migration & types
- [ ] **1A.1 (M)** Write `server/database/migrations/147-crm-sales-productivity.sql` (all `IF NOT EXISTS`):
  - `crm_tasks` (id uuid pk, client_id, target_type text check in (person,company,opportunity), target_id uuid, title, description, task_type, priority, status, due_at timestamptz, reminder_at timestamptz, completed_at timestamptz, outcome text null, assigned_to uuid null, created_by uuid, created_at, updated_at). Indexes: `(client_id,status,due_at)`, `(target_type,target_id)`, `(assigned_to,status)`.
  - `crm_stage_automations` (id, client_id, stage_id uuid, object_type text default 'opportunity', action text default 'create_task', task_template jsonb, is_active bool default true, created_at).
  - `crm_scores` (id, client_id, target_type, target_id, **score_type text default 'lead'**, total_score int, grade text, engagement_score int, intent_score int, fit_score int, recency_score int, score_version int default 1, computed_at, updated_at, **unique(client_id,target_type,target_id,score_type)**). *(score_type future-proofs `health` scoring — Phase 1 only writes `'lead'`.)*
  - `crm_score_history` (id, client_id, target_type, target_id, total_score int, grade text, reason text, created_at). Index `(client_id,target_type,target_id,created_at)`.
  - `crm_opportunity_stage_history` (id, client_id, opportunity_id, from_stage_id null, to_stage_id, changed_by, changed_at). Index `(opportunity_id,changed_at)`.
- [ ] **1A.2 (S)** Run migration 147 against the DB; verify all 5 tables exist (`\dt crm_*`).
- [ ] **1A.3 (S)** Add types to `app/types/crm.ts`: `CrmTask`, `CrmStageAutomation`, `CrmScore`, `CrmScoreComponents`, `CrmStageHistoryRow` (extend `index.ts`, not `.d.ts`).

### 1B · F1 Follow-up Tasks & Reminders
- [ ] **1B.1 (M, TDD)** `server/utils/crm/tasks.ts`: `validateTask()` (zod), `deriveStatus(row, now)` (returns `'overdue'` for pending+past-due), `buildTaskFilter()` (reuse `queryScope`). Unit tests: validation rejects bad enums; overdue derivation at boundaries.
- [ ] **1B.2 (M)** Agency API `server/api/crm/tasks/{index.get, index.post, [id].patch, [id].delete}.ts` — client-scoped, `requireAuth`, status/priority/assignee/target filters on GET, derived overdue in the SELECT (`CASE`).
- [ ] **1B.3 (S)** Portal mirror `server/api/client-portal/crm/tasks/*` — identical logic, scoped by `requireClientAuth().clientId`.
- [ ] **1B.4 (S)** Composable `app/composables/useCrmTasks.ts` reading `inject('crmApiBase')`.
- [ ] **1B.5 (M)** `app/components/crm/TaskForm.vue` — **invoke frontend-design skill first**; `UFormField` per field, `UPopover`+`UCalendar` for `due_at`/`reminder_at`, `USelectMenu` for type/priority/assignee (sentinel for unassigned).
- [ ] **1B.6 (M)** `app/components/crm/TaskList.vue` — `UTable` (`accessorKey`/`header`), overdue/priority badges, complete/edit/delete row actions, complete-modal captures `outcome`.
- [ ] **1B.7 (S)** Embed `TaskList` (scoped to the record) in `OpportunitySlideover.vue`, `RecordSlideover.vue`, and the person/company slideovers.
- [ ] **1B.8 (M)** Add a **Tasks tab** to `app/pages/agency/crm/index.vue` (and read-only or full in `app/pages/portal/crm.vue`) — global task list with filters.
- [ ] **1B.9 (S)** Integration check (throwaway tsx harness, real client, self-clean): create→list→complete→delete; verify overdue derivation and portal isolation.

### 1C · F2 Stage-change Automation
- [ ] **1C.1 (M, TDD)** `server/utils/crm/stageAutomation.ts`: `applyStageAutomations({clientId, opportunity, toStageId, tx})` → for each active rule on the destination stage, create a task from `task_template` (compute `due_at = now + due_offset_days`), assigned to owner. Idempotency guard: skip if an open task from the same rule+opportunity already exists. Unit tests: template→task mapping, offset math, idempotency.
- [ ] **1C.2 (S)** Call `applyStageAutomations` inside the opportunity stage-change path (`opportunities/[id].patch.ts` + any move endpoint), **inside the existing `transaction()`** using `client.query()`.
- [ ] **1C.3 (S)** Minimal admin config UI: list/add/remove rules per stage in pipeline settings (`requireRole(PERMISSIONS.ADMIN)` on the write endpoints `server/api/crm/stage-automations/*`).
- [ ] **1C.4 (S)** Integration check: rule on a stage → move opportunity → exactly one task; move back-and-forth → no duplicate.

### 1D · F4 stage-history hook (must land before/with analytics)
- [ ] **1D.1 (S)** In the same stage-change `transaction()`, insert a `crm_opportunity_stage_history` row (`from`/`to`/`changed_by`/`changed_at`). (Shares the hook site with 1C.2.)

### 1E · F3 Contact / Lead Scoring
- [ ] **1E.1 (L, TDD)** `server/utils/crm/scoring.ts` — pure: `computeEngagement(signals)`, `computeIntent(signals)`, `computeFit(signals, config)`, `computeRecency(lastActivityAt, now)`, `totalScore()` (weighted 30/30/20/20), `gradeFor(total)`. Decision: **grade enum = Hot/Warm/Cold** (document thresholds). Exhaustive unit tests per component + grade boundaries + recency decay curve. (Port logic from `promotion-knox` lead_scores.)
- [ ] **1E.2 (M)** `server/utils/crm/scoreSignals.ts` — gathers inputs for a target (activity counts/types, last activity, open-opportunity presence, fit fields) via `queryRows`. Tested against fixture rows.
- [ ] **1E.3 (M)** API `server/api/crm/scoring/{compute.post, index.get}.ts` — `compute.post` does single or bulk (by target_type), writes `crm_scores` (upsert) + `crm_score_history` (with `reason`). `index.get` lists scores for a target type.
- [ ] **1E.4 (S)** In-band recompute calls on: activity create (`activities/index.post.ts`), task complete (`tasks/[id].patch.ts`), opportunity stage change. Fire-and-forget within the request (don't fail the parent op on a scoring error — log and continue).
- [ ] **1E.5 (M)** UI: grade badge column + sort on `PeopleTable.vue`; a **score breakdown panel** (component bars) in the person slideover.
- [ ] **1E.6 (S)** Integration check: log activity → engagement+recency rise, history row written; bulk compute over fixtures produces stable grades.

### 1F · F4 Sales Analytics & Forecasting
- [ ] **1F.1 (L, TDD)** `server/utils/crm/analytics.ts` — pure aggregation given fixture opportunity/stage/history rows: `funnel()`, `winRate(byOwner?)`, `weightedForecast(window, owner?)` (Σ value×stage.probability), `avgCycleLength()` + `avgTimeInStage()` (from history). Unit tests prove each math path.
- [ ] **1F.2 (M)** API `server/api/crm/analytics/{summary,funnel,performance,forecast}.get.ts` — client-scoped, date-range + owner query params.
- [ ] **1F.3 (L)** UI: **Insights tab** on `/agency/crm` with Unovis charts — funnel, pipeline-by-stage bar, win-rate, weighted forecast; date-range + owner filters. Label cycle-time charts "data since <ship date>".
- [ ] **1F.4 (S)** Integration check: funnel/win-rate/forecast render from seeded opportunities; cycle-time empty-but-correct pre-history.

### 1G · F1b reminders cron (optional follow-on — not blocking the slice)
- [ ] **1G.1 (M)** `server/api/cron/crm-task-reminders.post.ts` (guard `x-cron-secret`): find tasks with `reminder_at <= now()` not yet notified → emit via `server/utils/notifications.ts`; persist overdue status.
- [ ] **1G.2 (S)** Companion Worker `workers/crm-cron` (Pages has no `scheduled()`); set `CRON_SECRET`; schedule (e.g. `*/15 * * * *`). Mirror the `meta-status-cron` pattern.

### 1H · Phase 1 close-out
- [ ] **1H.1 (S)** `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck` — 0 **new** errors. Run vitest — all CRM tests green (exit code, not stdout).
- [ ] **1H.2 (S)** Pre-commit deep-dive review (re-read every changed file; `~~/` vs `~/`; no empty USelectMenu values; no `@apply` of semantic utilities in `<style>`; transaction() uses `client.query`).
- [ ] **1H.3 (S)** Marketing sync: add Follow-up Tasks + Scoring + Insights to `app/pages/features/*` + `MarketingNav.vue`.
- [ ] **1H.4 (S)** Atomic commits → PR to `main`. Deploy from a clean own-`node_modules` checkout of `origin/main`; verify with `wrangler pages deployment list`. Browser click-test agency + portal.

---

## PHASE 2 — Data Quality, Relationships & Governance  (migration 148)

### 2A · Migration & types
- [ ] **2A.1 (M)** `148-crm-data-quality.sql`: `ALTER TABLE crm_people/crm_companies ADD COLUMN lifecycle_stage text, ADD COLUMN tags text[] DEFAULT '{}', ADD COLUMN owner_id uuid, ADD COLUMN assigned_to uuid`; `ALTER TABLE crm_opportunities ADD COLUMN assigned_to uuid` (owner_id already exists); `CREATE EXTENSION IF NOT EXISTS pg_trgm`; `crm_merge_log`; `crm_assignment_rules`; **`crm_relationships`** (from/to polymorphic + relationship_type + is_decision_maker + is_primary_contact); **`crm_audit_log`** (entity_type, entity_id, field, old_value, new_value, changed_by, changed_at; index `(entity_type,entity_id,changed_at)`); **`crm_settings`** (client_id pk-ish, `record_visibility text default 'team'`). Run it.
- [ ] **2A.2 (S)** Extend `app/types/crm.ts`: lifecycle/tags/owner on person/company, `CrmAssignmentRule`, `CrmMergeLogRow`, `CrmRelationship`, `CrmAuditRow`, `CrmSettings`.

### 2B · F5 Lifecycle + Auto-tagging
- [ ] **2B.1 (M, TDD)** `server/utils/crm/lifecycle.ts` — transition rules (`lead→prospect→active→customer→lost→dormant`), `nextLifecycle(event, current)`, tag derivation. Unit-tested.
- [ ] **2B.2 (S)** Hook into opportunity create (→prospect) + won (→customer + `won` tag) + activity paths. In-band, non-fatal.
- [ ] **2B.3 (M)** UI: lifecycle badge + tag chips on People/Companies tables + slideovers; filter by lifecycle/tag (sentinel-safe USelectMenu).
- [ ] **2B.4 (S)** Portal mirror + integration check (win → customer + tag).

### 2C · F6 Duplicate Detection + Merge
- [ ] **2C.1 (M, TDD)** `server/utils/crm/dedupe.ts` — `normalizeEmail/Phone/Name`, `candidatePairs()` (trigram + exact-key), `similarityScore()`. Unit-tested on fixtures.
- [ ] **2C.2 (M)** API `server/api/crm/dedupe/{suggestions.get, merge.post}.ts` — merge reassigns ALL children (opportunities, activities, tasks, scores, stage_history) loser→winner inside one `transaction()`, deletes loser, writes `crm_merge_log`. `requireRole(PERMISSIONS.ADMIN)` on merge.
- [ ] **2C.3 (M)** UI: Duplicates view (suggested pairs) + side-by-side merge modal (per-field winner picker).
- [ ] **2C.4 (S, integration)** Real-DB test: merge two people → zero orphaned child rows, log written, survivor correct.

### 2D · F7 Assignment + Ownership & Visibility
- [ ] **2D.1 (M, TDD)** `server/utils/crm/assignment.ts` — `pickAssignee(rule)` for `round_robin|load_balanced|priority|single`; **atomic RR** via `UPDATE crm_assignment_rules SET assignment_index = (assignment_index+1) % pool_len RETURNING`. Unit + a concurrency reasoning test.
- [ ] **2D.2 (S)** Hook: person/opportunity create without owner → run active rule.
- [ ] **2D.3 (M)** UI: assignment-rules settings (admin) + manual **reassign** + **claim** actions on records.
- [ ] **2D.4 (S, integration)** Concurrent-create test: RR pool of 3 over 10 creates distributes 4/3/3, no double-assign.
- [ ] **2D.5 (M)** Visibility flag in `queryScope.ts`: read `crm_settings.record_visibility`; when `'owner'`, append `AND (owner_id = :uid OR assigned_to = :uid)` for non-admin/non-manager users; `'team'` (default) unchanged. **Guard: default path must be byte-for-byte the current query** (zero regression). Unit-test both branches.
- [ ] **2D.6 (S)** Settings endpoint `server/api/crm/settings/*` (admin) to toggle `record_visibility`; tiny UI control. Gate building the `'owner'` branch behind real demand (see PRD §7 — may be YAGNI initially; still ship the column + flag).

### 2F · F11 Contact Relationships & Company Hierarchy
- [ ] **2F.1 (M, TDD)** `server/utils/crm/relationships.ts` — `inverseOf(type)` mapping (reports_to⇄manages, parent_of⇄subsidiary_of, symmetric for spouse/colleague), `assertNoCycle()` for company hierarchy. Unit-tested.
- [ ] **2F.2 (M)** API `server/api/crm/relationships/{index.get,index.post,[id].delete}.ts` (+ portal mirror) — client-scoped; GET by target returns links with derived inverse + decision-maker flag.
- [ ] **2F.3 (M)** UI: **Relationships panel** in person/company slideovers (add/remove, decision-maker toggle); compact company org-tree. (Invoke frontend-design skill for the add-link form.)
- [ ] **2F.4 (S, integration)** A `reports_to` B → inverse shows on B; company cycle rejected; decision-makers flagged on the company contact list.

### 2G · F12 Field-level Audit Trail
- [ ] **2G.1 (M, TDD)** `server/utils/crm/audit.ts` — `recordFieldChanges({entityType, entityId, before, after, fields, actor, tx})` diffs whitelisted fields, writes `crm_audit_log` rows. Unit-tested (changed→row, unchanged→none, JSONB/`updated_at` skipped).
- [ ] **2G.2 (S)** Invoke `recordFieldChanges` in the patch handlers of people/companies/opportunities/records — single call site each, inside the existing transaction.
- [ ] **2G.3 (S)** API `server/api/crm/audit/index.get.ts` (by entity) + portal mirror; **History section/tab** in each record slideover (human-readable field labels, newest-first).
- [ ] **2G.4 (S, integration)** Patching stage+value writes two attributed rows; History tab renders them; no-op patch writes nothing.

### 2E · Phase 2 close-out
- [ ] **2E.1 (S)** typecheck (16GB heap) + vitest green; pre-commit deep-dive; marketing sync; PR → main; deploy from clean checkout; verify + click-test (incl. visibility flag both modes, relationships panel, history tab).

---

## PHASE 3 — Power-User UX & Integrations  (migration 149)

### 3A · Migration & types
- [ ] **3A.1 (M)** `149-crm-power-ux.sql`: tsvector/GIN indexes (or generated columns) on `crm_people/companies/opportunities/activities/tasks`; `crm_views`; `crm_communications`; **`crm_documents`** (target polymorphic + document_type + file_key + expires_at); **`crm_opportunity_line_items`** (+ `quote_id` column on `crm_opportunities`); **`crm_sales_targets`**; contact-preference columns on `crm_people` (`do_not_contact/do_not_email/do_not_call/do_not_sms` bool, `preferred_channel`, `best_time`). Run it.
- [ ] **3A.2 (S)** Types: `CrmView`, `CrmCommunication`, `CrmDocument`, `CrmLineItem`, `CrmSalesTarget`, contact-prefs on person, search-result union.

### 3B · F8 Global Full-text Search
- [ ] **3B.1 (M, TDD)** `server/utils/crm/search.ts` — build `websearch_to_tsquery`, rank, snippet; client-scoped. Tested.
- [ ] **3B.2 (M)** API `server/api/crm/search.get.ts` (+ portal mirror) — unified typed results with target links.
- [ ] **3B.3 (M)** UI: command-palette global search on `/agency/crm` (`UModal` + input + grouped results).
- [ ] **3B.4 (S)** Perf check on realistic volume (< 300ms), isolation check.

### 3C · F9 Saved Views + Filters + Bulk Actions
- [ ] **3C.1 (M)** Extend list endpoints with richer filter grammar via `buildWhere`/`queryScope` (validate against injection; escape ILIKE `%`/`_`).
- [ ] **3C.2 (M)** `crm_views` CRUD API (+ portal) — per-user + shared.
- [ ] **3C.3 (M)** Bulk endpoints: `bulk-assign`, `bulk-tag`, `bulk-status`, `bulk-delete` (one request, transactional, client-scoped).
- [ ] **3C.4 (M)** **Export endpoint** `server/api/crm/{people,companies,opportunities}/export.get.ts?format=csv|xlsx` — streams the *current filtered view*, respects client scope + visibility flag (2D.5). Reuse `server/utils/crm/csv.ts` for CSV; add xlsx writer.
- [ ] **3C.5 (L)** UI: filter builder, save/load view dropdown, multi-select rows + bulk action bar + **Export button** across People/Companies/Opportunities tables.
- [ ] **3C.6 (S)** Round-trip test: save view → reload → identical results; bulk-tag 50 rows in one call; export of a filtered list contains exactly the filtered rows.

### 3D · F10 Unified Communication Log (+ contact preferences)
- [ ] **3D.1 (M)** `crm_communications` CRUD API (+ portal); merge with `crm_activities` in the timeline query.
- [ ] **3D.2 (M)** Bridges (read-only ingestion, no coupling reversal): on email-module send + lead-module inbound, write a `crm_communications` row when the contact maps to a CRM person. Feature-flag the bridges. **Honour contact prefs** — exclude `do_not_email` contacts from bridged sends.
- [ ] **3D.3 (M)** UI: unified per-contact timeline filterable by channel; contact-preference toggles (do-not-contact/email/call/sms, preferred channel) on the person record with a visible flag.
- [ ] **3D.4 (S)** Integration check: bridged email appears on the contact timeline tagged `email/outbound`; `do_not_email` contact is flagged + excluded.
- [ ] **3D.5 (note)** **Mailbox sync is OUT of scope here** — true per-rep OAuth Gmail/Outlook two-way sync is Phase 4 (PRD §8). Do not start it in this slice.

### 3E · F13 Documents / Attachments on Records
- [ ] **3E.1 (M)** Upload/download API `server/api/crm/documents/*` (+ portal) using the existing **R2** binding pattern; signed download URLs; client-scoped; `crm_documents` CRUD.
- [ ] **3E.2 (M)** UI: **Documents panel** in record slideovers (upload/list/download/delete, expiry badge).
- [ ] **3E.3 (S, integration)** Upload PDF to an opportunity → stored in R2 + listed; cross-client fetch denied; expired doc badged.

### 3F · F14 Opportunity ↔ Quote Link + Line Items
- [ ] **3F.1 (M)** `crm_opportunity_line_items` CRUD API (+ portal); roll-up to opportunity `value` (document derive-vs-manual rule).
- [ ] **3F.2 (M)** "Create/Link Quote" action calling the **existing** agency quotes module create path with line-items; store `quote_id` on the opportunity. **If that path isn't cleanly callable server-side, ship line-items + a manual link field first** (PRD §7).
- [ ] **3F.3 (M)** UI: line-items editor in opportunity slideover + quote link/status chip.
- [ ] **3F.4 (S, integration)** Line-items roll up to value; Create Quote pre-fills + links back; chip reflects status.

### 3G · F15 Sales Targets / Quotas + Leaderboard
- [ ] **3G.1 (M, TDD)** Extend `server/utils/crm/analytics.ts` with `attainment(target, window)` computing actuals (won value/count) from `crm_opportunities`. Unit-tested.
- [ ] **3G.2 (M)** API `server/api/crm/targets/*` (admin-set) + attainment query endpoint.
- [ ] **3G.3 (M)** UI: **Leaderboard / Targets** panel on the Insights tab — per-rep target vs actual, % attainment, ranked.
- [ ] **3G.4 (S, integration)** $50k target + $30k won → 60% attainment; leaderboard ranks reps for the period.

### 3H · Phase 3 close-out
- [ ] **3H.1 (S)** typecheck + vitest green; pre-commit deep-dive; marketing sync; PR → main; deploy from clean checkout; verify + click-test (search, saved views, export, comms log, documents, quote link, leaderboard).

---

## Cross-cutting reminders (every phase)
- Mirror agency ↔ portal via `provide/inject('crmApiBase')`; portal scopes by `requireClientAuth().clientId`, never trusts request `client_id`.
- New migration number is a moving target — re-check before writing (parallel sessions).
- Crons = companion Workers + `CRON_SECRET`, never a dashboard toggle.
- Deploy ONLY `origin/main`, from a checkout with its **own** `node_modules`; verify via `wrangler pages deployment list`, not HTTP 200.
- TDD every pure util; `nuxt prepare` before vitest in a fresh worktree; trust exit codes over buffered stdout.
