# Handoff — CRM Enhancement Program (Phase 1 merged · Phase 2 in progress)

- **Date:** 2026-06-01
- **Author session:** CRM enhancements execution
- **Spec / Plan:** `docs/superpowers/specs/2026-06-01-crm-enhancements-prd.md` · `docs/superpowers/plans/2026-06-01-crm-enhancements-tasks.md`
- **Memory:** `crm-platform.md` (index entry in MEMORY.md) — kept current.

---

## TL;DR

- **Phase 1 (Sales Productivity) is DONE and MERGED to `main`** via PR #60 (squash → `origin/main` `765e09fe`). **Not deployed** (deploy is user-gated).
- **Phase 2 (Data Quality / Relationships / Governance) is IN PROGRESS** on branch **`feat/crm-enhancements-phase2`** (pushed). Done: migration 148 + **F11 relationships** + **F5 lifecycle+auto-tagging** (`03389626`) + **F12 field-level audit trail** (`fc6ccdc7`). Remaining: **F7, F6**. 92/92 CRM unit tests green.
- Everything lives in the isolated worktree **`.worktrees/crm-enh-phase1`** (its own non-symlinked `node_modules`). Other sessions are untouched.

---

## How to resume (exact steps)

```bash
cd /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/crm-enh-phase1
git branch --show-current            # → feat/crm-enhancements-phase2
git status --porcelain               # → clean (working tree)
git fetch origin                     # check origin/main hasn't moved under you

# Baseline must be green before you touch anything:
pnpm exec nuxt prepare               # regenerates .nuxt (needed for vitest + ~~ alias)
pnpm exec vitest run test/crm        # → 15 files / 75 tests pass
```

If the worktree is gone (cleaned up), recreate it:
```bash
cd /Users/paulgiurin/Documents/Projects/dashboard
git worktree add .worktrees/crm-enh-phase2 feat/crm-enhancements-phase2
cd .worktrees/crm-enh-phase2
rm -f node_modules 2>/dev/null; pnpm install --prefer-offline   # OWN node_modules — never symlink
cp /Users/paulgiurin/Documents/Projects/dashboard/.env .env     # for DB access
pnpm exec nuxt prepare
```

---

## Current state (what's built)

### Phase 1 — MERGED (`origin/main` 765e09fe), live in repo, NOT deployed
Migration **147** (`crm_tasks`, `crm_stage_automations`, `crm_scores` w/ `score_type`, `crm_score_history`, `crm_opportunity_stage_history`), already run on the **dev** DB.
- **F1 Follow-up Tasks** — `server/utils/crm/tasks.ts`, agency+portal `*/crm/tasks/*`, `useCrmTasks`, `CrmTaskList`/`CrmTaskForm`, Tasks tab on agency + portal, embedded in slideovers.
- **F2 Stage automation + history** — `server/utils/crm/stageAutomation.ts` `recordStageChange` wired into agency+portal `opportunities/[id]/move.patch.ts`; admin CRUD `crm/stage-automations/*` + `CrmStageAutomationManager`.
- **F3 Scoring** — `server/utils/crm/scoring.ts` + `scoreSignals.ts` (`recomputeScore`/`recomputeIfScorable`), `crm/scoring/{compute,index}`, in-band recompute on activity-create + stage-change, `CrmScorePanel` + grade column on `PeopleTable`.
- **F4 Analytics** — `server/utils/crm/analytics.ts`, `crm/analytics/{summary,performance}`, `CrmInsights.client.vue` (Unovis), Insights tab.

### Phase 2 — IN PROGRESS on `feat/crm-enhancements-phase2`
Migration **148** (already run on dev DB) adds: `lifecycle_stage`+`tags`+`owner_id`+`assigned_to` on `crm_people`/`crm_companies`, `assigned_to` on `crm_opportunities`, `pg_trgm` + trigram indexes, and tables `crm_relationships`, `crm_audit_log`, `crm_assignment_rules`, `crm_merge_log`, `crm_settings`.
- **F11 Relationships + hierarchy — DONE.** `server/utils/crm/relationships.ts` (`inverseOf`, `wouldCreateCycle`; 7 unit tests) + `relationshipsDb.ts` (`listRelationships` normalized to target perspective w/ name resolution, `assertNoHierarchyCycle`, `assertEndpointsExist`). Agency + portal `*/crm/relationships/*` CRUD (upsert on duplicate edge). `CrmRelationshipsPanel` embedded in the person/company slideover (`RecordSlideover.vue`). 5/5 real-DB integration.

**Test status:** 75/75 CRM unit tests green. Phase-1 typecheck confirmed **0 new errors** (project has ~1272 PRE-EXISTING baseline errors, `typescript.strict:false`, non-blocking — ignore them, only care that none reference your new files).

---

## Remaining Phase 2 work (do in this order)

Reference: plan sections 2C/2D. Next free migration is **149** (only if a feature needs new columns — F7/F6 mostly use 148 tables). Re-verify the number at build time (parallel sessions consume numbers).

✅ **F5 — Lifecycle + auto-tagging — DONE** (`03389626`). `server/utils/crm/lifecycle.ts` (11 unit tests), hooks on opp-create/won (via `recordStageChange` `isWon`)/activity, agency+portal mirrored, list `?lifecycle/?tag` filters, lifecycle badge + tag chips columns, editable lifecycle+tags (UInputTags) in `RecordForm`. `app/utils/crmLifecycle.ts` shared display helper.

✅ **F12 — Field-level audit trail — DONE** (`fc6ccdc7`). `server/utils/crm/audit.ts` (`diffFields`/`recordFieldChanges`, 6 unit tests), wired into all 7 PATCH handlers (people/companies/opportunities columnar + engine records data-key+stage diff, agency+portal), `crm/audit/index.get` + portal mirror, `CrmAuditHistory` "History" section in person/company/opportunity/engine-record slideovers.

1. **F7 — Assignment + ownership/visibility** (`crm_assignment_rules`, `crm_settings` from 148)
   - TDD `server/utils/crm/assignment.ts`: `pickAssignee(rule)` incl. **atomic round-robin** via `UPDATE crm_assignment_rules SET assignment_index = (assignment_index+1) % len RETURNING`.
   - Hook on person/opportunity create without owner.
   - **Visibility:** read `crm_settings.record_visibility` in `queryScope.ts`; when `'owner'`, append `AND (owner_id = :uid OR assigned_to = :uid)` for non-admin/manager. **DEFAULT `'team'` path MUST be byte-for-byte unchanged (zero regression).** Gate the `'owner'` branch behind real demand (possible YAGNI — ship the column + flag regardless).
   - Settings endpoint + reassign/claim UI.

2. **F6 — Dedupe + merge** (`crm_merge_log` + `pg_trgm` from 148)
   - TDD `server/utils/crm/dedupe.ts`: `normalizeEmail/Phone/Name`, `candidatePairs` (trigram + exact key), `similarityScore`.
   - `crm/dedupe/{suggestions.get, merge.post}` — merge reassigns ALL children (opportunities, activities, tasks, scores, stage_history, relationships) loser→winner in **one `transaction()`**, deletes loser, writes `crm_merge_log`. ADMIN-gated.
   - Duplicates view + side-by-side merge modal. Real-DB integration: **zero orphaned child rows**.

Then **2E close-out**: full typecheck (0 new errors), deep-dive review, **open Phase 2 PR**, browser click-test. Deploy only on explicit user go-ahead.

---

## Conventions established this program (FOLLOW THESE)

- **Per-feature cadence:** TDD pure util (RED→GREEN) → agency endpoints → **portal mirror** → composable → UI → **throwaway real-DB integration harness** → atomic commit. One commit per feature.
- **Scoping:** every query via `buildWhere`/`queryScope` (client-scoped + soft-delete). Portal scopes by `requireClientAuth(event).clientId`, never trusts request `client_id`.
- **Agency↔portal reuse:** components read `inject('crmApiBase','/api/crm')`; portal page provides `/api/client-portal/crm`. **Agency-only features** (scoring, analytics) self-guard with `inject('crmApiBase') === '/api/crm'` and call `/api/crm/...` directly (no portal endpoints).
- **Server imports:** `~~/server/utils/...` only. Endpoints: `requireAuth`/`requireWriteAccess`, admin via `requireRole(event, PERMISSIONS.ADMIN)` from `~~/server/utils/permissions`.
- **Migrations:** additive `IF NOT EXISTS`; run immediately with `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-); psql "$DATABASE_URL" -f <file>`.
- **Forms:** Nuxt UI v4 only; `UFormField`; dates via `UPopover`+`UCalendar`+`@internationalized/date` (see `CrmTaskForm.vue`); never empty USelectMenu values (use sentinels). No `<style>` blocks (the `@apply` semantic-utility hazard); `bg-elevated/40` etc. are fine in templates.

### Integration harness recipe (throwaway, NOT committed)
```bash
# write scripts/_itest_*.ts, then:
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/_itest_*.ts   # --tsconfig REQUIRED for ~~ alias
rm -f scripts/_itest_*.ts
```
- Use `pg` directly for setup/teardown; import the REAL util to exercise it. `db.ts` reads `process.env.DATABASE_URL`, so utils using `queryRows/queryOne/execute` work under tsx.
- If a util calls Nitro's `createError`, shim it: `(globalThis as any).createError = (o) => Object.assign(new Error(o.statusMessage), o)` BEFORE importing the util.
- pg quirks seen: NUMERIC → **string** (utils must `Number()`); DATE vs timestamptz tz skew (cast `::date::text` in SQL — see `analytics/summary.get.ts`); pass params as the 2nd arg to `db.query(text, params)` (not `{params}`).
- **Trust exit codes / file reads, NOT buffered stdout** (this env mangles multi-line stdout). Filter the pg SSL deprecation warning lines out of harness output.

---

## Hard rules / hazards (from project memory)

- **Deploy ONLY `origin/main`, from a checkout with its OWN `node_modules`** — NEVER a worktree whose `node_modules` is symlinked (it shares the Nuxt build cache and 500s every prerendered marketing route). Verify a deploy with `wrangler pages deployment list` (top row Production + Source=main), NOT just HTTP 200. **Do not deploy without explicit user go-ahead.**
- **Concurrent sessions share the working dir** — there are ~7 other worktrees. `git fetch` before assuming `origin/main`; never `git add -A`; verify the next migration number isn't taken.
- **Pushing** to `adme-dev/dashboard` requires the **`adme-dev`** gh account active (it was, this session). `Paul008` gets 403. GitHub Issues are disabled — track via PR comments.
- **Crons** (F1b reminders, F3 score decay — both deferred) need a **companion Worker** (Pages has no `scheduled()`), header `x-cron-secret: $CRON_SECRET`.
- Fresh worktree: `pnpm exec nuxt prepare` once before vitest or it falsely reports "no tests".
- `nuxt typecheck` needs `NODE_OPTIONS='--max-old-space-size=16384'`; it takes ~5 min and prints the full pre-existing baseline — grep for your own file paths to judge "0 new errors".

---

## Key decisions / deviations made

- **Marketing sync DEFERRED** for the whole program — the native CRM module has **no marketing presence at all** (no entry in `features/index.vue`/`MarketingNav`); adding a lone sub-feature would be incoherent. Marketing the CRM is a separate product decision.
- **Scoring/analytics are agency-only** (no portal endpoints) — clients don't score their own contacts; UI self-guards.
- **F3 task-complete recompute skipped** — the scoring model is driven by activities + opportunities, not tasks, so it'd be a no-op.
- **Cycle-length** in F4 fixed to be tz/driver-independent via `created_at::date::text` + `actual_close_date::text`.
- **Ownership/visibility** (F7) defaults to `'team'` = today's behaviour, zero regression; `'owner'` branch is opt-in per client.

---

## Open questions for the user (next session)

1. **Deploy Phase 1 to prod?** (currently merged-but-not-deployed). If yes: build+deploy `origin/main` from a clean checkout.
2. Continue straight through F5→F12→F7→F6 then open the Phase 2 PR, or pause for a browser eyeball of F11 + the Phase 1 surfaces first?
3. Do any clients actually want **owner-scoped visibility** (F7), or ship the column+flag and leave the `'owner'` branch unbuilt (YAGNI)?
