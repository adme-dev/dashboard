# Handoff — GA4 analytics: deploy collision + how to land the fix

**Date:** 2026-06-01
**Companion doc:** `HANDOFF-2026-05-31-ga4-analytics.md` (full Phase 1–3 record). This file is the *live-state delta* — read it first if you're resuming.

---

## TL;DR
- **All code is built, tested, and committed.** GA4 enterprise analytics Phases 1–3 (all 7 Phase-3 tasks) + a follow-up **batched GA4 dimension fix** are on **`main` @ `2c7e6ab1`**. Nothing is lost.
- **Production does NOT currently run the dimension fix.** A **concurrent Claude session redeployed its own branch over my clean-`main` deploy**, reverting `/api/cron/ga4-dimensions` out of prod. This is the unresolved item.
- **All synced GA4 data is safe in the DB** (survives any redeploy): channel data + 46/60 trafficked properties' dimension data.
- **Blocked on coordination, not code.** Two sessions are deploying different branches to the same Pages project. Don't ping-pong deploys — settle on one branch first.

---

## What is SAFE (no action needed)
- **`main` @ `2c7e6ab1`** = Phase 2 + Phase 3 (3.1–3.7) + batched dimension fix + handoff/wrangler docs. Fast-forwarded cleanly; verified `ga4-dimensions.post.ts` present, `ga4-sync` channel-only, `UPSERT_CHUNK` batching present.
- **DB data** (shared Neon, survives deploys):
  - `ga4_daily_channel`: ~4,150 rows, **60 trafficked properties**, 23 clients (powers funnel / blended panel / GA4 anomalies / benchmarks — all live).
  - `ga4_daily_dimension`: ~57,704 rows across **46 properties** × 5 dimension types.
  - `ga4_daily_event`: ~1,840 rows / 19 properties.
- **Migrations 126–131 applied** to prod DB (additive; safe regardless of which code is deployed).
- **Recovery worktree** at `.worktrees/ga4-dimfix` (branch `ga4-dimfix-recovery` == `main`, has its OWN `pnpm install`ed `node_modules` — safe to build/deploy from). Remove with `git worktree remove .worktrees/ga4-dimfix` once no longer needed.

## What is WRONG (the open item)
- **Production was redeployed by the other session to a `4a623c9`-based build** (their ad-publish/email branch). Evidence (probed live): `/api/cron/ga4-dimensions` → **302** (gone); `/api/cron/ga4-sync` + `/api/agency/analytics/presets` → **401** (present, they're on the shared `4a623c9` base).
- So the **batched dimension fix is not live**, and the **14 remaining trafficked properties** can't be backfilled (the endpoint isn't deployed). 46/60 are done.
- My last good deploy was `https://2bf309f7.agency-dashboard-6cm.pages.dev` (clean `main`) — since overwritten.

---

## RESUME STEPS (once the other session is parked)
1. **Settle on one branch.** Cleanest: the other session merges its ad-publish work into `main` (which already holds Phase 3 + the dimension fix), so one branch has everything. (Alternatively, deploy `main` and have them re-merge their work after.)
2. **Deploy from a worktree, NOT the shared checkout** (the shared checkout is on `feat/email-marketing` for the other session). The recovery worktree is ready:
   ```bash
   cd .worktrees/ga4-dimfix && git pull/rebase onto final main if needed
   pnpm deploy:production    # node_modules already installed here
   ```
   ⚠️ **Do NOT symlink node_modules for a build** — it shares `node_modules/.cache/nuxt` and a concurrent build corrupts the prerender bundle (`#internal/nuxt/paths` → all 13 marketing routes 500 → build fails). Use the worktree's own installed `node_modules`.
   ⚠️ **`pnpm deploy:production 2>&1 | tee log` masks failures** (pipeline exit = `tee` = 0). Always grep the log for `Deployment complete!` vs `Exiting due to prerender`.
3. **Verify the deploy** is live (expect 401, = route exists + guarded):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://agency-dashboard-6cm.pages.dev/api/cron/ga4-dimensions   # want 401, not 302
   ```
4. **Backfill the last 14 properties** — fire the dimension cron a few times (each run processes the stalest 25; ~2–3 runs closes the tail). `SECRET=$(grep '^CRON_SECRET=' .env | cut -d= -f2- | tr -d '"')`:
   ```bash
   curl -s -X POST https://agency-dashboard-6cm.pages.dev/api/cron/ga4-dimensions -H "x-cron-secret: $SECRET"
   ```
   Check coverage: `SELECT COUNT(DISTINCT c.property_id) FROM ga4_daily_channel c WHERE NOT EXISTS (SELECT 1 FROM ga4_daily_dimension d WHERE d.property_id=c.property_id);` → want 0.
5. **Enable the two cron triggers** (Cloudflare dashboard — only the operator can; recipes in `wrangler.toml`):
   - `0 * * * *` → `POST /api/cron/ga4-sync` (channel metrics)
   - `30 * * * *` → `POST /api/cron/ga4-dimensions` (dimensions; processes stalest 25/run)
   - header `x-cron-secret: <CRON_SECRET>`

---

## Known follow-up (minor, not blocking)
- **Empty-property re-fetch:** the dimension cursor orders by `MAX(synced_at) ASC NULLS FIRST`. The ~27 properties with **no traffic in-window** never get a `synced_at` stamp, so they sit at the front and get re-fetched every run (wasted GA4 quota; doesn't block the trafficked tail, which still converges). **Fix:** stamp a per-property "last attempt" timestamp even when 0 rows return (small `ga4_property_map` column or a cursor table) and order by that, so empties drop out after one attempt.
- API-only Phase 3 features still need UI: attribution model selector, presets picker, internal-benchmarks display, NL `ask` box, export-token manager.
- Deferred (documented in code): PDF rendering (needs CF Browser Rendering binding), rollup materialized views, warehouse push connectors, currency/timezone normalization, multi-touch touchpoint table.

## Hard-won lessons (also in memory `subagent-driven-execution-notes`)
- **Multiple Claude sessions share this one working copy.** A concurrent session switching branches / redeploying caused: (a) my commits entangling onto its branch lineage, (b) a deploy from the wrong tree, (c) production being overwritten. **Always isolate multi-commit + deploy work in your own git worktree** (branch off the SHA, `pnpm install` its own deps) and coordinate who owns the prod deploy.
- Recovery primitives used this session: `git log --all` / reflog to find entangled commits; `git worktree add -b <recovery> .worktrees/x <good-SHA>` + `git cherry-pick`; `git branch -f main <recovery>` (FF only, when main isn't checked out).

## Reference
- **Commits (on `main`):** `2c7e6ab1` batched dim fix → `b08152e` wrangler cron docs → `7021731`/`a2788f7` handoff docs → `4a623c9` (3.4) and the Phase-3 chain below it.
- **Key new files:** `server/utils/ga4DimensionSync.ts` (batched), `server/api/cron/ga4-dimensions.post.ts`, `server/utils/{canonicalFact,canonicalFactQuery,benchmarks,blendedMetrics,attribution,blendPresets,analyticsCache,channelTaxonomy}.ts`, `server/api/agency/analytics/{blended,attribution,presets,internal-benchmarks,ask,export-tokens,report-schedules}*`, `server/api/export/analytics.get.ts`, `server/utils/reports/*`, `app/components/agency/BlendedPanel.client.vue`, `app/pages/agency/analytics/reports.vue`, `server/utils/anomalyDetection/analysers/ga4.ts`.
- **Push:** `origin` needs the `adme-dev` gh account (Paul008 → 403). `main` is well ahead of remote.
- **Tests:** `pnpm exec vitest run test/server/utils` — Phase 2+3 add ~88 passing tests; baseline 104 `auth`/`cache`/`db` failures are pre-existing.
