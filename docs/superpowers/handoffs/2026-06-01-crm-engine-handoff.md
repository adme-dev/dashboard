# CRM Custom-Objects Engine (Phase B) — Session Handoff

**Date:** 2026-06-01
**Status:** ✅ MERGED to main · 🔴 production deploy FAILED (non-CRM build error) · engine dormant in prod

---

## TL;DR

The custom-objects engine (Phase B of the multi-vertical CRM) is **code-complete, reviewed, tested, and merged to `main`**. The only open item is the **production CF Pages deploy**, which failed for a reason **unrelated to the CRM work** (a prerender/module-resolution error on public marketing routes, triggered by the worktree's symlinked `node_modules`). Production is unchanged. The engine is **dormant** in prod regardless (nothing changes for users until a client is assigned a config vertical).

---

## What's on `main` now

`origin/main` tip at handoff: **`585ced15`** (CRM landed via PR #50; later commits are unrelated cron work).

Verified present on origin/main:
- `server/database/migrations/141-crm-custom-objects.sql` (4 tables + Retail seed)
- `server/utils/crm/engine/` — 7 util files (validateRecord, recordFilter, resolveObjects, recordWrite, seedVertical, schemas, types)
- 4 `Engine*` record components + `RelationPicker` in `app/components/crm/`
- Agency + portal CRM pages wired with dynamic config-object tabs

**Migration 141 is already applied to the prod Neon DB** (4 engine tables live, Retail templates seeded). No prod migration step needed.

---

## PR chain (all resolved)

| PR | Scope | State |
|----|-------|-------|
| #40 | docs (spec + plan) | MERGED |
| #47 | B1–B3 backend + designer UI | CLOSED (landed via #50 lineage) |
| #50 | B4 record UI + page wiring | **MERGED to main** |

---

## What was built (B1–B4)

- **B1** — migration 141, engine types, `validateRecord` + `buildRecordFilter` (TDD), object-defs + field-defs definition API (agency-only, `requireRole(ADMIN)`)
- **B2** — `resolveClientObjects`/`assertObjectVisible` two-axis isolation gate, `seedVerticalFromTemplate` (wired into `verticals/assign.post`), records CRUD + `move` with client-scoped relation existence checks, client-portal mirror
- **B3** — `crmFieldControls` map, `useCrmObjectDefs`/`useCrmFieldDefs`, engine types in `app/types/crm.ts`, designer UI (`ObjectDefManager` + `FieldDefManager`)
- **B4** — `useCrmRecords`, `Engine*`-prefixed record components (`EngineRecordForm`/`EngineRecordSlideover`/`EngineRecordsTable`/`EnginePipelineBoard`) + `RelationPicker`, dynamic tabs wired into `/agency/crm` (+ "Custom Objects" designer tab) and `/portal/crm` (read-only), plus the `stage_id` client-ownership guard.

### Key design decisions (locked)
- JSONB record store (not generated tables)
- Curated CRM field-type enum (reuses `crm_custom_fields` list + `long_text` + `relation`)
- Agency-only object/field **definition**; records editable agency + portal
- Relations target **core only** (person/company) this milestone
- **Deviations from spec (documented):** `crm_pipeline_templates` → `crm_object_templates` (seeds whole objects); config-object stages reuse `crm_stages` with object-key-prefixed codes (`order:new`)
- **`Engine*` prefix** on record components is deliberate — core CRM already ships `RecordForm.vue`/`RecordSlideover.vue` for person/company; prefixing avoids clobbering them.

### Verification
- 30 unit tests green (`pnpm exec vitest run test/crm`)
- 12/12 real-DB integration checks (two-axis isolation, relation existence, idempotent seeding)
- 8/8 Retail E2E UAT (seed → create w/ currency coercion → invalid-option reject → order w/ core relation + stage → title search → pipeline move persisted → foreign-stage reject)
- ⚠️ **NOT browser-eyeballed** (no Chrome extension this session) — verified at logic + DB level only

---

## 🔴 The blocker: production deploy

`pnpm deploy:production` was run from the worktree (detached at origin/main `585ced15`). **`nuxt build` failed at prerender** — `wrangler pages deploy` never ran, **prod unchanged**.

- **26 routes 500'd, ALL public/marketing**: `/about /ai-training /banner-studio /creativity /features /landing /pricing /privacy /resources /sign-in /support /terms` — **0 CRM routes**
- **Root cause:** `importNotDefined` / `packageImportsResolve` (ESM `node:internal/modules/esm/resolve`) on `GET /` — a package's `exports` failed to resolve through the worktree's **symlinked `node_modules`**. Environment issue, not engine code.

### How to actually deploy (recommended)
Run from a **full checkout with real `node_modules`**, not the symlinked worktree:
```bash
cd /Users/paulgiurin/Documents/Projects/dashboard
git checkout main && git pull
pnpm install
pnpm deploy:production
```
(In a Claude tab, prefix with `! ` to run interactively.) Then browser click-test `/agency/crm` config tabs + `/portal/crm`.

If the prerender error persists on a clean checkout, it's a genuine main breakage (check a shared layout/plugin SSR path) — but that's independent of the CRM engine.

---

## Loose end (small follow-up PR needed)

After #50 merged, a tags/rating-field enhancement was committed to `crm-engine-records` but **is NOT on main**:
- `EngineRecordForm.vue` — renders `tags` (UInputTags) + `rating` (star picker)
- `crmFieldControls.ts` — `formatCell` renders rating as stars
- `test/crm/fieldControls.test.ts` — new unit tests (suite now 37 passing)
- Branch tip: **`8efa7be1`** on `crm-engine-records`

Open a small PR `crm-engine-records → main` (or cherry-pick those commits) to land it.

---

## Worktree / branches

- Worktree: `.worktrees/crm-engine-b1` on branch `crm-engine-records` (tip `8efa7be1`). Has `.env` + symlinked `node_modules` (both gitignored).
- ⚠️ `.env`: extract DB URL with `grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2-` (plain `grep DATABASE_URL` also matches POOLED).
- ⚠️ Fresh worktree needs `pnpm exec nuxt prepare` once before vitest (else `TSConfckParseError`, reports "no tests").

---

## Next milestone

**Phase C — automotive code pack** (port `crm_vehicles`/`crm_dealerships`/`crm_test_drives`/etc. onto the engine). Its own spec/plan cycle. Parent spec: `docs/superpowers/specs/2026-05-31-native-crm-twenty-blueprint-design.md` §9.

Full state in agent memory: `crm-platform.md`.
