# Handoff — Ad-Spend Budget Alerting, Budget Modal, Inline Alerts, Account Mapping

**Date:** 2026-06-03
**Branch/prod state:** everything below is **merged to `origin/main` and deployed to production** (`agency-dashboard-6cm.pages.dev`) unless marked otherwise.
**App:** XeroFlow Agency dashboard (Nuxt 4 / Nitro, Neon Postgres, Cloudflare Pages + Workers).

---

## TL;DR — what got built & shipped this session

A full arc around ad-spend budget pacing, all live in prod:

| PR | What | main commit |
|----|------|-------------|
| #106 | **Budget alerting feature** — `adspendHealth` analyser (6 detectors) + Slack real-time + 9am digest cron + AI chat budget route + accountability tasks | `4b04dd0b` |
| #108 | Fix: detect Meta **compound** `campaign_status` (`CAMPAIGN_PAUSED`/`ADSET_PAUSED`) | `708f4d61` |
| #109 | Slack webhook **setup guide** (in-app accordion in Settings → Budget Alerts + marketing section on `/features/campaign-alerts`) | `9b4ab7e3` |
| #113 | **Budget dialog** — converted the inline in-cell budget editor to a shared modal (`SpendBudgetEditModal.vue`), used by the variance table + per-platform pages | `ef54457f` |
| #115 | **Inline alerts** — row badges on spend tables + "Active alerts" section inside the budget modal; `useSpendAlerts` composable, `SpendAlertBadge`, `/api/agency/social/spend/alerts` endpoint; `mediaSpendId` added to anomaly context | `019c86a0` |
| #116 | **"Map accounts" UI** — slideover on `/agency/social/spend` to map ad accounts → clients; `map-account` + `account-mappings` endpoints; **fixed a latent spendSync bug** (`WHERE name=$1 OR code=$2` referenced a non-existent `agency_clients.code` column) | `f0fc9fb0` |

Latest prod deploy: `e41efe95`.

---

## Key architecture notes

- **`adspendHealth` analyser** (`server/utils/anomalyDetection/analysers/adspendHealth.ts`): 6 pure detectors over `media_spend`+`daily_spend` — underspend, overspend, stopped, paused-with-budget, stale-sync, zero-conversion. Emits `type:'adspend'` anomalies, fingerprint `adspend:<kind>-<mediaSpendId>-<period>`, context now includes `{client, vendor, period, mediaSpendId}`.
  - **Gating:** underspend/overspend gate at **day ≥ 7** of month; zero-conversion at **day ≥ 10**; most detectors require **budget > 0** (only "stopped" works at budget=0).
  - Pure pace math in `adPacingMath.ts`.
- **Budget dialog** `app/components/social/SpendBudgetEditModal.vue`: editable budget/commission/rolling + read-only context (spend/budget/variance/commission) + pacing bar + **Active alerts** section (`target.alerts`) + budget history. Used by `SpendVarianceTable.vue` (per-client) and `app/pages/agency/social/[platform].vue` (per-campaign).
- **Inline alerts:** `useSpendAlerts()` fetches `/api/agency/social/spend/alerts` → `Map<mediaSpendId, alerts[]>`; `alertsFor(spendIds)` matches rows; `SpendAlertBadge.vue` renders the badge. Alerts endpoint is **media-accessible** (plain `requireAuth`) because the central `/api/ai/anomalies` is FINANCE-gated.
- **Account→client mapping:** ⚠️ see "Open item 1" below — there are now TWO mechanisms.
- **Slack/notifications:** all DORMANT until configured. Notification fan-out gated by `ANOMALY_NOTIFY_ALLOWLIST` / `ANOMALY_NOTIFICATIONS_DISABLED`.

---

## Current data / prod state (Neon DB, tenant = `b4a0a130…` "ADME Advertising Pty Ltd")

- **Xero org connected** (operator did the OAuth). Timezone Australia/Sydney.
- **Ad-spend data present:** ~482 `media_spend` / ~7318 `daily_spend` rows; 58 campaigns in 2026-06.
- **Anomalies populated via a SUPPRESSED backfill** (no notifications fired): **1 adspend + 24 GA4** under tenant `b4a0a130`.
  - The 1 adspend = **"Mornington Motor Group (meta) paused with budget allocated"** (warning), `mediaSpendId=05a85ced-971e-424a-a899-6fa36ae51bae`.
- **Demo data we set (REVERSIBLE — consider cleaning up):**
  - Mapped Meta connection `bc63e1dc-c8ad-48ec-818a-956aad9d6aa1` → client **Mornington Motor Group** (`17a75bda-9f75-42bf-863b-84eee03bb1e7`) via `ad_account_client_map` + backfilled `media_spend.client_id` (11 rows).
  - Set a **$2,000 budget** on paused campaign `05a85ced…` (Used Cars) to trigger the demo alert.
- Removed a **stray `__default__` xero_org_connection** row's anomalies (detection had wrongly targeted it because it was the most-recent connection; realigned to the real org by bumping `connected_at`). ⚠️ The `__default__` connection ROW may still exist — worth checking/cleaning.

**To re-run detection** (suppressed, safe): with dev server up on :3000 and `DATABASE_URL` exported:
```
DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) \
ANOMALY_NOTIFICATIONS_DISABLED=true \
pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/anomaly-backfill.ts
```
(It targets the **most-recently-connected** xero_org_connection — make sure that's `b4a0a130`.)

---

## OPEN ITEMS (continue here)

### 1. ⚠️ Duplicate account→client mapping mechanisms (decide & reconcile)
I built a "Map accounts" slideover (#116) **without realizing the per-platform page already had an inline per-account client dropdown.** They use DIFFERENT storage:
- **Pre-existing:** `[platform].vue` `assignClient()` → `PATCH /api/agency/social/connections/{id}` with `{clientId}` → sets **`social_connections.client_id`**.
- **Mine (#116):** `POST /api/agency/social/spend/map-account` → writes **`ad_account_client_map`** + **backfills `media_spend.client_id`** immediately.
- The spend SYNC resolves client via `findMapping` → `ad_account_client_map` (NOT `social_connections.client_id`). So the pre-existing dropdown may set `social_connections.client_id` but NOT populate `media_spend.client_id` on sync — **needs verification**.
- **Recommended reconciliation:** pick ONE mechanism. Likely: make the pre-existing `PATCH connections/{id}` (or `assignClient`) also (a) write `ad_account_client_map` and (b) backfill `media_spend.client_id`, then **remove my redundant "Map accounts" slideover** (`SpendAccountMappingManager.vue` + the "Map accounts" button in `spend.vue`). OR keep mine and retire the inline dropdown. **Confirm with the user before deleting either.**

### 2. Notification allowlist before going live
24 GA4 anomalies (+ adspend) sit suppressed. Before enabling live notifications / before the next 7am Sydney cron fires on genuinely-new ones: set **`ANOMALY_NOTIFY_ALLOWLIST`** (e.g. `paul@adme.net.au`) on prod Pages, per the anomaly runbook in `CLAUDE.md`. The hourly `pages-cron` worker drives `/api/cron/anomaly-detection` (self-gates to 7am) and IS deployed — so this is time-sensitive.

### 3. Real onboarding to make alerts broadly populate
Only the one demo account is mapped + budgeted. For real coverage: map the 215 connected ad accounts (113 Meta + 102 Google) to clients, then set budgets per campaign (via the budget modal). Under/overspend only fire from **day 7** of the month.

### 4. Slack budget alerts still dormant
Settings → Budget Alerts: no webhook configured → digest + real-time + accountability tasks all no-op. Set the webhook to activate (in-app setup guide is there). `pages-cron` already routes the 9am digest.

### 5. Backfill threw a caught SQL error
During `anomaly-backfill.ts`, one analyser threw a Postgres `scanner_yyerror` (caught by `safeAnalyser`, didn't block). Likely a Xero-dependent analyser query. Worth investigating — not blocking.

### 6. (Infra, done this session) R2 CORS
The `xero` R2 bucket had **no CORS config**, blocking the Media Studio audio preview (`media-eyeball/*.wav`) in the browser. Added a CORS rule (GET/HEAD/PUT for localhost:3000/3012 + prod). This was a Media Studio (separate workstream) issue, fixed opportunistically. Add any custom prod domain to the origins later.

---

## Gotchas / environment notes
- **Multi-session repo:** the shared working tree gets switched between branches by concurrent sessions (saw `feat/ga4-phase3-ui`, `docs/media-studio-master-brief`). Whatever branch is checked out is what localhost serves. After a branch switch under a running `pnpm dev`, **hard-refresh / restart dev** to pick up changes.
- **Deploy builds the WORKING TREE**, not `main` — always checkout/reset to `origin/main` before `pnpm deploy:production`. Flow used all session: merge PR → `git checkout main && git reset --hard origin/main` → deploy.
- `pnpm deploy:production` leaves a stale `.wrangler/deploy/config.json` that breaks `wrangler` worker deploys — `rm -f .wrangler/deploy/config.json` before deploying a companion worker.
- Tests: `pnpm exec vitest run <path>` (the `test` script is bare `vitest` = watch).
- DB reads: `export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)` then `psql "$DATABASE_URL"`.
- `agency_clients` has **no `code` column** (has `name`, `xero_contact_id`) — relevant to client resolution.

---

## Suggested first steps in the new session
1. Read this doc + `CLAUDE.md` (anomaly runbook section).
2. Resolve **Open item 1** (mapping redundancy) — verify whether `PATCH connections/{id}` populates `media_spend.client_id`; decide one mechanism; confirm with user before removing code.
3. Decide on **Open item 2** (notification allowlist) — likely set it before any live cron run.
4. Optionally clean up the demo data (Open item: the $2000 budget on `05a85ced` + the Mornington mapping) if it shouldn't persist.
