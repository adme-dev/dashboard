# CRM Enhancement Program — Phase 3 Shipped (Handoff)

**Date:** 2026-06-02
**Status:** Phases 1–3 + the F9 opportunities follow-up are **shipped to production**. Two optional follow-ups remain, gated on sign-off.
**Production:** `origin/main` @ `c697ae4e` → CF Pages deployment `1b445d3a` (Production, branch `main`). Verify any deploy with `wrangler pages deployment list`, never just HTTP 200.

---

## 1. TL;DR — where things stand

The native multi-vertical CRM now has a full **CRM Enhancement Program** (15 features, F1–F15) live in production:

- **Phase 1 — Sales Productivity** (F1–F4): tasks, stage-change automation, contact scoring, sales analytics/forecast. (migration 147)
- **Phase 2 — Data Quality, Relationships & Governance** (F5/F6/F7/F11/F12): lifecycle + auto-tagging, dedupe/merge, assignment + ownership/visibility, contact relationships, field-level audit trail. (migration 148)
- **Phase 3 — Power-User UX & Integrations** (F8–F15): global search, filters/saved-views/bulk/export, unified comms log + contact prefs, documents (R2), opportunity line-items + quote link, sales targets + leaderboard. (migration 152)
- **F9 follow-up**: filters + export on the Opportunities pipeline (completes F9 across all three entities).

All migrations are additive (`IF NOT EXISTS` guarded) and have run on the dev DB; they apply to prod on first authenticated DB hit post-deploy. **158 CRM unit tests** green; typecheck clean at the documented **1272 pre-existing-error baseline** (0 new).

---

## 2. What's live in production (Phase 3 detail)

| Feat | What | Key files |
|------|------|-----------|
| **F8** | Global full-text search (⌘K command palette, `websearch_to_tsquery` over people/companies/opportunities/activities/tasks, ranked) | `server/utils/crm/search.ts`, `server/api/crm/search.get.ts` (+portal), `app/components/crm/GlobalSearch.client.vue` |
| **F9** | Injection-safe filter grammar · saved views (own/shared) · bulk actions (tag/assign/status/delete) · CSV/XLSX export — on **People, Companies, Opportunities** | `server/utils/crm/{filters,viewsDb,bulk,exportRecords}.ts`, `app/components/crm/{FilterBuilder,SavedViews,BulkBar}.vue`, `app/utils/crmFilterFields.ts` |
| **F10** | Unified comms+activity timeline · contact preferences (do-not-contact/email/call/sms) · bridge primitive | `server/utils/crm/{comms,commsDb}.ts`, `app/components/crm/{CommTimeline,ContactPrefs}.vue` |
| **F13** | Documents/attachments on records (R2, signed downloads, expiry badges) | `server/utils/crm/{documents,documentsDb}.ts`, `app/components/crm/Documents.vue` (reuses `server/utils/storage.ts`) |
| **F14** | Opportunity line-items + value roll-up · quote link/status chip | `server/utils/crm/{lineItems,lineItemsDb}.ts`, `app/components/crm/LineItems.vue` |
| **F15** | Sales targets + attainment leaderboard (Insights tab) | `server/utils/crm/{analytics(+attainment/leaderboard),targetsDb}.ts`, `app/components/crm/Leaderboard.client.vue` |

Every agency surface is mirrored to the **client portal** via `provide/inject('crmApiBase')`; portal endpoints scope by `requireClientAuth(event).clientId` and never trust a request-supplied `client_id`. Migration 152 added: FTS GIN indexes, `crm_views`, `crm_communications` + 6 contact-pref columns on `crm_people`, `crm_documents`, `crm_opportunity_line_items` (+ `quote_id` on opps), `crm_sales_targets`.

---

## 3. Remaining work (the only outstanding items)

All three touch nothing already-built and are **optional polish**. The first is CRM-internal; the other two edit *other live modules*, so they were deliberately deferred for explicit sign-off.

1. **~~Opportunities F9 UI~~ — DONE** (PR #73, shipped). Listed for completeness.
2. **Bridge wiring** *(needs sign-off — edits email + leads modules)*: call `bridgeCommunication()` (already built in `server/utils/crm/commsDb.ts`) from the email-marketing **send** path and the **lead-inbound** path so outbound emails / inbound leads land on the CRM timeline when the contact maps to a CRM person. It's **dormant** behind `CRM_COMMS_BRIDGE_ENABLED` (off by default), idempotent by `external_id`, and honours contact prefs on outbound — but wiring it modifies those modules' handlers.
3. **Quote auto-create** *(needs sign-off — edits Pricing/quotes module)*: today F14 links an *existing* quote (picker) or deep-links to Pricing. The full version adds a server-callable path to **create** a quote from an opportunity's line-items. The quotes `index.post.ts` is auth-coupled (`requirePricingAccess`) + auto-numbers, so it isn't cleanly callable as a function — would need extracting the insert into a util or an internal `$fetch`.

---

## 4. How to resume development

```bash
# 1. Fresh worktree off the LATEST origin/main (CRM work is isolated; rebase happens at PR time)
cd /Users/paulgiurin/Documents/Projects/dashboard
git fetch origin
git worktree add -b <feat-branch> .worktrees/<dir> origin/main

# 2. Own node_modules (warm pnpm store ~10s) — NEVER a symlinked node_modules (breaks prod prerender)
cd .worktrees/<dir> && pnpm install --prefer-offline

# 3. Prepare (required in a fresh worktree or vitest dies on the ~~ alias) + baseline tests
pnpm exec nuxt prepare
pnpm exec vitest run test/crm            # 158 green baseline

# 4. Typecheck gate (OOMs at default heap — must set the big heap). Baseline = 1272 errors; goal = 0 NEW.
NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck
```

**Real-DB integration probe recipe** (throwaway, NOT committed — delete before commit):
```bash
export DATABASE_URL=$(grep '^DATABASE_URL' /Users/paulgiurin/Documents/Projects/dashboard/.env | cut -d= -f2-)
pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/_probe.mjs
```
- The `--tsconfig` flag is required for the `~~/` alias under tsx.
- Import the underlying **util** (e.g. `runBulk` from `crm/bulk.ts`), NOT an endpoint file (`defineEventHandler` is a Nitro global → ReferenceError at module load).
- `.env` is NOT in worktrees — read `DATABASE_URL` from the main repo's `.env`.
- `agency_clients` INSERT needs NOT-NULL `billing_type` (use `'retainer'`) + `name`. Use **valid-hex UUIDs** (no stray letters like `u`/`g`).

**Ship flow** (after PR is reviewed/merged):
```bash
# Deploy ONLY origin/main, from the deploy-prod worktree (its own REAL node_modules)
cd /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/deploy-prod
git checkout --detach origin/main
rm -rf node_modules/.cache/nuxt .nuxt/tsconfig.tsbuildinfo
pnpm deploy:production
wrangler pages deployment list --project-name agency-dashboard   # top row must be Production + Source=<merge sha>
```

---

## 5. Patterns & gotchas (learned this program — reuse these)

**Architecture / reuse**
- **`server/utils/crm/queryScope.ts`** is the foundation: `buildWhere(clientId, Cond[])` always enforces `deleted_at IS NULL` + `client_id`; `visibilityConds(clientId, user)` is the F7 owner-visibility gate (default `team` → returns `[]` → byte-identical query = zero regression).
- **Filter grammar** (`filters.ts`): columns NEVER come from user input (whitelisted per entity); operators are type-checked; values parameterised; ILIKE `%`/`_` escaped. `buildFilterConds(entity, clauses, alias?)` — pass `alias='o'` for joined queries (opportunities list) and fold `?`→`$N` manually.
- **Agency ↔ portal**: every feature has an agency endpoint (`/api/crm/*`, explicit `client_id`) + a portal mirror (`/api/client-portal/crm/*`, `requireClientAuth`). Frontend composables/components read `inject('crmApiBase','/api/crm')`; the portal page provides `'/api/client-portal/crm'`.
- **R2 files**: reuse `server/utils/storage.ts` (`isStorageConfigured`/`uploadFile`/`generateStorageKey`/`getPresignedDownloadUrl`/`deleteFile`, category `attachments` = 50MB). Returns 503 when storage unconfigured (prod is configured).

**Build / deploy hazards**
- **Deploy only `origin/main`**, from a checkout with its **own** `node_modules`. A symlinked `node_modules` shares the Nuxt build cache and 500s every prerendered marketing route. Verify via `wrangler pages deployment list` (200 ≠ live — Pages serves the SPA shell at 200 for any path).
- A new Phase-3 API endpoint returning **401** (not 404) on prod confirms the new server bundle is live.
- **`git diff origin/main..HEAD` (two-dot) MISLEADS** once origin/main advances under your branch — it shows origin/main's *newer* commits as your "deletions." Use three-dot `...` / the GitHub PR (merge-base) view.

**Typecheck / Vue**
- `nuxt typecheck` OOMs at default heap — always `NODE_OPTIONS='--max-old-space-size=16384'`. Baseline is **1272 pre-existing errors**; the bar is **0 new**, none in your files.
- `v-model="x as any"` **breaks SFC compilation** (can't assign to a cast). Type a local draft with `value: any` instead.
- A top-level `await useFetch` in a conditionally-rendered component needs a Suspense boundary → use non-awaited `useFetch` in panels.
- pg **NUMERIC returns strings** (`line_total`, `unit_price`, `amount`, `target_value`) → `Number()`-coerce in the UI.
- **Nuxt UI v4 (Reka) tabs ignore a bare synthetic `.click()`** — when driving the browser, dispatch the full `pointerdown/mousedown/pointerup/mouseup/click` sequence to switch tabs; USelect option-pick needs an IIFE-wrapped `evaluate` (JS-realm `const` reuse throws).

**Migrations**
- Migration numbers are a **moving target** (parallel sessions). Re-check the highest number on `origin/main` right before writing. Phase 3 was renumbered 149→**152**. Next free after 152 = **153** (re-verify).

---

## 6. Verification status

- ✅ 158 CRM unit tests (every pure util TDD'd).
- ✅ Typecheck 0-new across the whole program.
- ✅ Per-feature throwaway real-DB probes — cross-client **IDOR-safety** proven for search, bulk, documents, line-items; bridge pref-enforcement/idempotency; value roll-up; leaderboard attainment.
- ✅ Browser eyeball (Kimi WebBridge, prod, owner login): F8 palette, F9 toolbar (Filters/Views/Export/multi-select), F10 contact-prefs + comms timeline, F13 documents, F15 leaderboard. (F14 line-items in the opp slideover verified by tests/probe, not click-tested.)

## 7. Reference docs
- PRD: `docs/superpowers/specs/2026-06-01-crm-enhancements-prd.md`
- Task list (F1–F15, phases): `docs/superpowers/plans/2026-06-01-crm-enhancements-tasks.md`
- Engine + earlier CRM: `docs/superpowers/handoffs/2026-05-31-crm-handoff.md`
