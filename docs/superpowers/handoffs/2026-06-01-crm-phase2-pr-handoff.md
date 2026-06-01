# Handoff — CRM Enhancement Phase 2 (FEATURE-COMPLETE, PR #63 open)

- **Date:** 2026-06-01
- **Branch:** `feat/crm-enhancements-phase2` @ `15151170` (pushed)
- **Worktree:** `.worktrees/crm-enh-phase1` (OWN non-symlinked `node_modules`)
- **PR:** **#63** → `main` — https://github.com/adme-dev/dashboard/pull/63
- **Supersedes:** `2026-06-01-crm-phase2-handoff.md` (same dir; that one tracked mid-flight)
- **Memory:** `crm-platform.md`

---

## TL;DR

CRM **Phase 2 (Data Quality / Relationships / Governance) is feature-complete** and in review as **PR #63**. All five features done, **111/111 CRM unit tests green**, each with throwaway real-DB integration. **✅ Typecheck CONFIRMED CLEAN** (cache-cleared full run: 1272 errors = documented pre-existing baseline, ZERO in Phase 2 files; result commented on #63). All close-out gates passed. **Remaining: user merges #63 → deploy `origin/main` from a clean checkout → browser eyeball.**

---

## How to resume

```bash
cd /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/crm-enh-phase1
git fetch origin
git branch --show-current            # → feat/crm-enhancements-phase2
git log --oneline -1                 # → 15151170 (or later)
pnpm exec nuxt prepare
pnpm exec vitest run test/crm        # → 19 files / 111 tests pass
```
If the worktree is gone:
```bash
cd /Users/paulgiurin/Documents/Projects/dashboard
git worktree add .worktrees/crm-enh-phase2 feat/crm-enhancements-phase2
cd .worktrees/crm-enh-phase2
rm -f node_modules; pnpm install --prefer-offline   # OWN node_modules, never symlink
cp /Users/paulgiurin/Documents/Projects/dashboard/.env .env
pnpm exec nuxt prepare
```

---

## What's done (all on the branch)

Migration **148** (additive, `IF NOT EXISTS`) — already RUN on the **dev** DB; **NOT yet on prod** (applies implicitly on first DB hit post-deploy, or run manually).

| Feature | Commit | Tests | Notes |
|---|---|---|---|
| F11 Relationships + hierarchy | `afd0af2b` | 7 | `relationships.ts`, agency+portal CRUD, `RelationshipsPanel` |
| F5 Lifecycle + auto-tagging | `03389626` | 11 | `lifecycle.ts`; hooks on opp create/won + activity; badges/chips/filters; editable in `RecordForm`; `app/utils/crmLifecycle.ts` |
| F12 Field-level audit trail | `fc6ccdc7` | 6 | `audit.ts`; all 7 PATCH handlers; read endpoints; `CrmAuditHistory` in 4 slideovers |
| (fix) audit join | `5ec9b2d9` | — | `LEFT JOIN team_members`, NOT `users` (no `users` table exists) |
| F7 Assignment + ownership/visibility | `f8b9668b` | 6 | `assignment.ts` (atomic RR); `queryScope.isOwnerScoped/visibilityConds` **dormant by default**; settings + assignment-rules endpoints (admin); `CrmGovernanceSettings`, `CrmOwnerSelect`+Claim |
| F6 Dedupe + merge | `b74963f3` | 13 | `dedupe.ts` + `mergeContacts` (one-tx, zero orphans); `crm/dedupe/{suggestions,merge}`; `CrmDuplicatesManager` |
| (fix) readonly tuple | `97418ae1` | — | spread `PERMISSIONS.MANAGEMENT` for `hasRole` |
| (fix) strict indexing | `15151170` | — | `noUncheckedIndexedAccess` assertions in assignment/dedupe |

Real-DB integration verified per feature (all throwaway, NOT committed): lifecycle transitions/revive; audit insert + array diff; **atomic RR 3/2/2 serial + 2/2/2 concurrent** + visibility branches + **zero-regression team default**; **merge → zero orphaned rows** + relationship collision/self-edge collapse + merge_log.

---

## Remaining work (in order)

1. ✅ **DONE — typecheck confirmed clean** (0 new errors; result on PR #63). _For reference if re-checking:_ `nuxt typecheck` is incremental and caches `.nuxt/*.tsbuildinfo`; clear it (`find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete`) before trusting a full run, else you get a misleading partial. Baseline is ~1272 pre-existing errors (`strict:false`) — grep for your own file paths.
2. **User merges PR #63** (squash). Conflict-free: branched off `765e09fe`, origin/main is now `12ab7bef`, **zero overlapping files**; mig 148 vs their 149 = no collision.
3. **Deploy** (user go-ahead only) — `pnpm deploy:production` from a checkout of `origin/main` with its OWN `node_modules`. Mig 148 applies on first DB hit. Verify with `wrangler pages deployment list` (top row Production + Source=main), not just HTTP 200.
4. **Browser eyeball** (couldn't drive Chrome here) — `/agency/crm`: **Duplicates** tab (scan + survivor-picker merge modal), **Settings** tab (visibility toggle + per-object assignment-rule editor), the **Owner** picker + **Claim** on a person/opportunity, lifecycle **badges/tag chips + filters** on People/Companies, **History** section in slideovers. Then `/portal/crm` (owner control should read "Managed by your agency"; lifecycle/audit present).

After that, Phase 2 is shippable. **Phase 3** (Power-UX + Integrations: F8 FTS, F9 saved views+bulk+export, F10 comms log, F13 documents, F14 quote link, F15 targets) is the next milestone — spec/plan already exist (`docs/superpowers/{specs,plans}/2026-06-01-crm-enhancements-*`).

---

## Conventions (followed throughout — keep them)

- **Per-feature cadence:** TDD pure util (RED→GREEN) → agency endpoints → **portal mirror** → composable → UI → throwaway real-DB integration harness → ONE atomic commit.
- **Scoping:** every query via `buildWhere`/`queryScope` (client-scoped + soft-delete). Portal scopes by `requireClientAuth().clientId`, never trusts request `client_id`.
- **Agency↔portal reuse:** components read `inject('crmApiBase','/api/crm')`; portal page provides `/api/client-portal/crm`. **Agency-only features** (scoring, analytics, governance settings, owner picker, dedupe) self-guard with `inject('crmApiBase') === '/api/crm'` and hit `/api/crm/...` directly.
- **Server imports** `~~/server/utils/...`; `requireAuth`/`requireWriteAccess`; admin via `requireRole(event, PERMISSIONS.ADMIN)`. `hasRole(user, [...PERMISSIONS.X])` (spread the readonly tuple).
- **Forms:** Nuxt UI v4 only; `UFormField`; never empty USelectMenu values (sentinels: `'all'`, `'__unset__'`, `'__none__'`); no `<style>` blocks (the `@apply` semantic-utility prod-build hazard).
- **app/utils + composables auto-import** (verified consts auto-import too); new files need `nuxt prepare` to register.

### Integration-harness recipe (throwaway, NOT committed)
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/_itest_*.ts   # --tsconfig REQUIRED for ~~ alias
rm -f scripts/_itest_*.ts
```
Use `pg` directly for setup/teardown; import the REAL util to exercise it. NUMERIC→string (`Number()`); inside `transaction(cb)` use `cb`'s `client.query()` (NOT queryOne/execute). Trust exit codes / file reads, not buffered stdout (filter the pg SSL deprecation lines).

---

## Hazards / hard rules

- **Staff table is `team_members`** (id, name, email) — there is NO `users` table. `owner_id`/`assigned_to`/`changed_by`/`created_by` all reference `team_members.id`; `/api/users/search` returns `{ suggestions: [{id,name}] }` from it.
- **Deploy ONLY `origin/main` from a checkout with its OWN `node_modules`** — never a symlinked-node_modules worktree (shares the Nuxt build cache → 500s every prerendered marketing route). Don't deploy without explicit user go-ahead.
- **Concurrent sessions share the working dir** (~10 worktrees). `git fetch` before assuming origin/main; never `git add -A` (stage explicit paths); re-verify the next migration number.
- **Push** needs the **`adme-dev`** gh account active (was, this session); `Paul008` gets 403. GitHub Issues are disabled — track via PR comments.
- **`nuxt typecheck`** needs `NODE_OPTIONS='--max-old-space-size=16384'`, takes ~5 min, prints the full ~1287 pre-existing baseline — grep for your own file paths. **Clear `*.tsbuildinfo` for a trustworthy full run** (incremental cache lies).
- Crons (none added here; F1b reminders / F3 decay deferred) = companion Workers (Pages has no `scheduled()`).

---

## Decisions made this phase

- **F7 owner-scoped visibility built but DORMANT by default** (`record_visibility='team'` ⇒ query byte-for-byte unchanged, integration-confirmed). Opt-in per client. (Your call: "build it, dormant by default".)
- **Marketing sync deferred** for the whole program (CRM has no marketing presence yet — separate product decision).
- **Scoring/analytics/governance/dedupe = agency-only** (no portal endpoints; UI self-guards).
- **Merge deletes the loser** (hard delete after child reassignment); derived scores dropped (recompute on next signal); relationships de-duplicated on collision.
- Engine-record audit diffs the JSONB `data` keys + `stage_id` (the columnar "skip JSONB" rule applies only to people/companies/opportunities).
