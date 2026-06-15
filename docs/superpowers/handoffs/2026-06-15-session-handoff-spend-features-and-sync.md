# Session Handoff — Spend features + ad-sync fixes (2026-06-15)

**Branch:** `main` (everything merged + pushed; latest `4e4874b3`).
**Prod:** Cloudflare Pages `agency-dashboard`, latest deploy `6fd2bf37`.
**Theme:** Built two spend features, then chased the ad-spend data to its source — fixed Google, diagnosed Meta.

---

## TL;DR — what shipped this session

1. **AI budget-write execution** (Meta+Google) — built, reviewed, merged, **deployed dormant** (flag-gated OFF). Never armed; no live write ever performed.
2. **Real-time AI pacing analysis** (the "Analyze with AI" button) — built (Tasks 1–5), reviewed twice, all fixes deployed. **LIVE.**
3. **Google spend sync queue fan-out** — fixed the root cause (waitUntil timeout), **verified end-to-end, Google data now fresh.**
4. **Meta $0-sync diagnosis** — root cause = Meta app on `development_access` API tier (empty from Cloudflare egress). **Fix is an operator tier upgrade.**
5. **Fail-loud guards** — Meta sync can no longer silently write $0. Deployed.

---

## 1. AI budget-write execution — DEPLOYED DORMANT
From the spend Review slideover, admin/owner pushes an approved AI pacing rec to a **live Meta/Google daily budget**, guard-railed + audited.
- Branch merged to main; migrations 177/178 **applied to prod**. Deploy verified (endpoint 401-gated).
- **Flag-gated OFF** (`liveBudgetChangesEnabled` + per-platform `metaBudgetWritesEnabled`/`googleBudgetWritesEnabled` — endpoint requires BOTH). Dormant until armed in Settings.
- ⚠️ **Never arm without go-ahead + a live read-back test on one Meta CBO campaign with a small delta.** No live write has ever run.
- Deferred: IM-01 concurrency hardening (needs a migration), Google live-write blocked on the MCC read path. Memory: [[budget-write-execution-feature]].

## 2. Real-time AI pacing analysis — LIVE
"Analyze with AI" in the spend Review slideover → Groq proposes a daily budget + rationale **side-by-side** with the deterministic number → human picks → "Approve this adjustment" feeds the existing plan→approve→Apply audit chain (admin Apply still the money gate).
- Tasks 1–5 built (incl. optional Meta-only "Refresh from platform"), 2 review passes; findings #1–#6 fixed + deployed. 37 tests.
- **No platform writes** in this feature — read-only analysis + audited planned/approved rows. Fail-safe to deterministic when Groq errors.
- Smoke-verified with a real Groq call on a real prod campaign. Memory: [[realtime-ai-pacing-analysis]].
- Deferred: in-browser UI eyeball (Chrome extension wasn't connected), marketing-page sync at go-live.

## 3. Google spend sync — FIXED + FRESH
**Root cause (proven, not the old MCC/token theories):** `syncGoogleSpend` looped ~102 accounts sequentially inside one Cloudflare `waitUntil` (~143 s) → killed before finishing → jobs stuck `running`/0, last data Jun 9. A live probe proved token-refresh + MCC + GAQL all return real data (~1.4 s/account).
- **Fix (merged `6b578e86`):** fan Google out per-account to `agency-jobs` exactly like Meta — `processGoogleConnection` (extracted loop) + `syncGoogleSpendByConnectionId` + `listGoogleConnectionIds` + consumer case `spend.sync.google.account` + kickoff fan-out. **Pages-only, no worker/migration/binding change.** Review confirmed the lift faithful; 4 follow-up fixes applied.
- **Verified end-to-end in prod** by manually acting as the consumer (POSTing each message to `/api/internal/process-job` with `CRON_SECRET` from `.env`): drained all 102 → job `completed`, **55 campaigns / ~$19.8k, fresh** (was 147 h stale).
- Memory: [[agency-jobs-queue-consumer]], [[budget-health-campaigns-not-loading]].

## 4. Meta $0 sync — DIAGNOSED (operator fix)
**Root cause (definitive):** the Meta app is on Marketing API **`development_access` tier**. A probe proved the IDENTICAL insights call returns real data from a **residential IP** but **EMPTY from Cloudflare egress** (3/3 good accounts), HTTP 2xx, **not rate-limited** (`call_count:1`, `x-app-usage:0`), tag `ads_api_access_tier:development_access`. So every prod (CF Pages) sync writes $0; local backfills work only because residential IP. NOT concurrency/SDK/Graph-version/code (bulk `syncMetaSpend` == per-account, identical `syncMetaSpendAccount`).
- **FIX = operator upgrades the Meta app Dev Access → Standard/Advanced Access** for `ads_read`/`ads_management` (App Dashboard → App Review; likely needs Business Verification).
- Full writeup: `docs/superpowers/specs/2026-06-15-meta-spend-zero-sync-pacing.md` (the pacing hypotheses in it are SUPERSEDED by the dev-tier finding).
- **Interim:** refresh Meta via bulk `syncMetaSpend(month, year)` from a residential IP (local tsx against prod DB) + bust KV `spend:summary:no-tenant:<period>:{all,meta}` on CACHE ns `7d5db1c489cb40f4b809d611e1408acd`.

## 5. Fail-loud guards — DEPLOYED (`4e4874b3`)
So a Meta $0 can never again look like success:
- `syncMetaSpendAccount`: records a real **failure** when an account WITH prior spend returns empty insights (the dev-tier/egress signature), not a clean 0.
- `recordSyncJobAccountResult`: logs a loud `console.error` when any sync job completes `synced_count=0` across N>0 accounts.

---

## 🔴 OPEN OPERATOR ITEMS (block the daily automation; not code)

1. **jobs-consumer `CRON_SECRET` is unset again** (`wrangler secret list --name jobs-consumer` → `[]`). Without it the worker can't auth to `/api/internal/process-job`, so **nothing drains the `agency-jobs` queue** — both Meta and Google jobs sit at 0-processed. **Set it as an ENCRYPTED secret so it survives deploys:** `cd workers/jobs-consumer && wrangler secret put CRON_SECRET` (same value as the Pages project's `CRON_SECRET`, in `.env`). Once set, the queue drains automatically (idempotent upserts).
2. **Meta app tier upgrade** (item 4) — required before Meta data will ever flow in prod, even with the secret set.

## Data state at handoff
- **Google: fresh** (~$19.8k, 55 campaigns, synced this session).
- **Meta: ~6 h old** from an earlier-session bulk backfill (~$29.8k, 87 campaigns). Will stay stale in prod until the tier upgrade; refresh via the interim recipe meanwhile.

## Deploy / env notes
- Deploy from `.worktrees/deploy-prod`: `git checkout <commit>` → `pnpm install --frozen-lockfile` → `pnpm deploy:production`. Big heap is set in the `build` script. Worker deploys: `cd workers/<name> && npx wrangler deploy`.
- gh push account: `adme-dev` (has access; Paul008 gets 403).
- Manual consumer drain recipe (until the secret is fixed): POST each `spend.sync.<platform>.account` message to `/api/internal/process-job` with `x-cron-secret`. Google works; Meta returns $0 until the tier upgrade.

## Memory updated
[[budget-write-execution-feature]], [[realtime-ai-pacing-analysis]], [[agency-jobs-queue-consumer]] (Google fix + Meta dev-tier finding + CRON_SECRET regression), MEMORY.md index.
