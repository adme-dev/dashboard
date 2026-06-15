# Handoff — Ad-spend sync fix + AI budget-write feature

**Date:** 2026-06-15
**Branch:** `main` (all work committed + pushed; latest `cbe59453`)
**Prod:** Cloudflare Pages `agency-dashboard`, deployment serving `1b14356` (commit `1b143564`)

---

## TL;DR

Two threads this session:
1. **Fixed the broken `/agency/social/spend` daily sync** (shipped to prod) and backfilled Meta data manually. Root cause was a missing queue consumer, then a Worker rate-limit burst.
2. **Designed + planned the AI "apply pacing to Meta/Google budget" feature.** Spec + implementation plan are written and approved; **no feature code written yet** — next session executes the plan.

---

## Thread 1 — Spend sync (SHIPPED)

### What was wrong & what shipped
- **Root cause #1:** the `agency-jobs` Cloudflare Queue (`JOBS_QUEUE`) had **no consumer** — Pages can't run queue consumers and the Nitro `cloudflare:queue` hook never fires. Meta spend fanned out 113 per-account messages that were never processed → `spend_sync_jobs` stuck `running` 0/113 → no data written for days.
  - **Fix (`c929d200`):** new standalone `workers/jobs-consumer/` Worker consumes `agency-jobs` and POSTs each message to a new `POST /api/internal/process-job` (runs `processJob()` in a real Pages request). Deployed + registered (1 consumer on agency-jobs).
- **Root cause #2 (discovered after #1):** the per-account queue path fans out 113 Meta calls **concurrently in ~37s → Meta returns empty `data:[]` (rate-limited)** → sync "completes" but writes `synced_count: 0`. Run **sequentially** the identical code works fine. (Tokens/scopes/data were all fine — "expired tokens / reconnect" was a RED HERRING; `token_expires_at` in DB is stale/meaningless.)
  - **Fix (`2a048624`):** throttled `jobs-consumer` consumer to `max_batch_size=1` + `max_concurrency=2` (near-sequential). Worker redeployed.
- **Also shipped (`1b143564`):** `budget-control-settings` + `alerts` endpoints now **degrade to empty defaults** instead of `400 "No organization selected"` when no Xero org is connected (was spamming the console; pre-existing, not a regression).
- **Also (in `c929d200`):** `SpendVarianceTable.vue` AI-pacing column shows the **campaign name** per recommendation (the "duplicate Review buttons" report — two campaigns under one client looked identical).

### Current data state
- **Meta: fresh.** I ran `syncMetaSpend(6,2026)` sequentially via local tsx against prod DB → wrote **87 campaigns / $29,821** (synced ~05:40 UTC 2026-06-15). KV cache busted so the page shows it.
- **Google: stale (Jun 9, $10,423).** Could NOT run via local tsx (`syncGoogleSpend` uses `useRuntimeConfig` → only works in the Nitro runtime). Plus the known Google MCC `login-customer-id` 403 bug (see [[budget-health-campaigns-not-loading]]).
- **Arctic Campers** (`act_1308605716453536`) genuinely 403s (#200) — account access lost. Should be disconnected.

### Open items (Thread 1)
- ⚠️ **CRON_SECRET on `jobs-consumer` was wiped** by my Worker redeploy (it was added as a **Plaintext** var, not a Secret; `wrangler deploy` removes plaintext vars not in `wrangler.toml`). **USER IS HANDLING THIS** — re-add as **Type: Secret** (encrypt) so it survives deploys. Until then the *daily automated* sync can't authenticate (manual data is already in).
- **Verify the daily cron end-to-end** once the secret is back: trigger a UI Sync, confirm the meta job completes with `processed==total` AND writes data (now that the consumer is throttled). If still $0, drop `max_concurrency` to 1.
- **Google sync** still needs a working path (it doesn't use the queue; runs via cron `waitUntil`). Investigate the MCC `login-customer-id` header for reads+writes together.
- **Consider rotating CRON_SECRET** — exposed in plaintext (dashboard + deploy output + chat). Rotation = update Pages project + `pages-cron` + `jobs-consumer` together.
- Recovery recipe if Meta data goes stale again: run `syncMetaSpend` sequentially (local tsx, `pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json`) + bust KV keys `spend:summary:no-tenant:<period>:{all,meta}` on namespace `CACHE` id `7d5db1c489cb40f4b809d611e1408acd`.

---

## Thread 2 — AI budget-write feature (DESIGNED + PLANNED, not built)

Goal: from the spend table's **Review** button, an admin can push an approved AI pacing recommendation to a **live Meta/Google campaign budget**, guard-railed + audited.

- **Spec (approved):** `docs/superpowers/specs/2026-06-15-budget-write-execution-design.md`
- **Plan (TDD, 8 tasks):** `docs/superpowers/plans/2026-06-15-budget-write-execution.md`

### Locked decisions
- Two-step **approve → Apply** (explicit button); **Apply restricted to admin/owner** (`PERMISSIONS.ADMIN = ['owner','admin']`); plan/approve stay media role.
- **Meta + Google**, **daily** budgets. **CBO + single-ad-set ABO** in Phase 1; **multi-ad-set ABO → `skipped`** (manual; proportional split is Phase 1.5).
- Guardrails: **clamp ±20%** (learning-phase; convergence via daily re-recommendation), **hard-enforce** relative cap (`maxMultiple`×current + monthly-budget margin) / Meta minimums / **1 change/campaign/day**, **authorized+audited override** (skips ±20%/cap, never minimum/rate-limit).
- Synchronous execute endpoint + **read-back verification**, **fail-loud**, **flag-gated off by default**.

### Key findings from spec review (already in the spec)
- `campaign_action_log` (migrations **177/178**) has all needed columns (jsonb `previous_value`/`new_value`/`metadata`, `executed_at`, `error_message`, `external_request_id`) → **no new migration for columns**.
- ⚠️ **177/178 are NOT applied to prod** → table missing → the existing plan/approve/cancel flow is dormant in prod. **Plan Task 0 applies them.**
- `action_status` CHECK has **no `manual_required`** → multi-ABO uses `skipped` + metadata reason.
- Verified hooks: `requireRole(event, roles)`, `metaFetch(url, token, params, retries, method, body)`, `getCampaigns`/`getAdSets` (have `daily_budget`), connection `metadata.currency`, `recordCampaignAction`, Google `:mutate` + `login-customer-id`.

### Next action
Execute the plan via **subagent-driven-development** (recommended) or executing-plans. Start at Task 0 (apply migrations), then Task 1 (guardrail engine). Flags stay OFF; do not enable Meta/Google writes in prod as part of the build — rollout is on 1–2 real CBO campaigns with small deltas after read-back is proven.

⚠️ This writes to **live client ad budgets** — never flip `metaBudgetWritesEnabled`/`googleBudgetWritesEnabled` without explicit go-ahead.

---

## Deploy / env notes
- Deploy Pages from the clean worktree: `.worktrees/deploy-prod` (checkout target commit, `pnpm deploy:production`). Build needs big heap (set in `build` script). Disk hit 100% mid-session — keep an eye on free space; clear `~/Library/Preferences/.wrangler/logs` + stale worktree `dist/` if ENOSPC.
- Worker deploys: `cd workers/<name> && npx wrangler deploy`. For `jobs-consumer`, **don't redeploy without the CRON_SECRET being a real Secret** or it gets wiped again (or pass `--keep-vars`).
- gh push: active account is `adme-dev` (has access).

## Memory updated
`[[agency-jobs-queue-consumer]]` (root cause, throttle fix, recovery recipe) and MEMORY.md index. Spec/plan paths above.
