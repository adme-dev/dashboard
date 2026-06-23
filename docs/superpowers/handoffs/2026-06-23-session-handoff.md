# Session Handoff — 2026-06-23 (test-suite health, Ops Autopilot, Inbox overhaul)

**App is pre-launch (no internal users).** Builds/deploys are low-risk. `adme-dev` is the
**active** gh account (push/merge/deploy all work; `gh auth setup-git` already done).
**Merging any PR to `main` auto-deploys to Cloudflare Pages prod** (the `deploy` job in
`.github/workflows/ci.yml` runs only on `main`). CI's `ci` job runs lint+typecheck
**non-blocking** and does **not** run vitest — so CI green ≠ tests green; local `vitest run`
is the real gate. Deploys take ~17 min (ci ~12m + the 16 GB nuxt build ~5m).

Durable state also lives in memory (auto-loads): `test-suite-health.md`,
`ops-autopilot-program.md`, `inbox-item-preview.md`, `inbox-detail-panel-bug.md`.

---

## ⏳ THE ONE OPEN ITEM — verify inbox anomaly view live

**PR #158** (`feat(inbox): rich anomaly detail + actions`, merge commit `88ac0b82`) is
**deploying** (gh run **28003538589**). It was NOT yet verified live (a wakeup was scheduled
in the old session but won't fire in a new one).

**To finish:** once the deploy completes, verify live via **Kimi WebBridge** (the only working
browser bridge — the Claude Chrome extension was not connected):
```bash
~/.kimi-webbridge/bin/kimi-webbridge status   # expect running:true, extension_connected:true
# navigate + click an anomaly notification + screenshot:
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"navigate","args":{"url":"https://app.xeroflow.io/agency/inbox","newTab":true},"session":"v"}'
# click the first list item:
curl -s -X POST http://127.0.0.1:10086/command -d '{"action":"evaluate","args":{"code":"document.querySelector(\".overflow-y-auto.divide-default .cursor-pointer\").click()"},"session":"v"}'
# screenshot to a path, then Read it:
curl -s -X POST http://127.0.0.1:10086/command -d '{"action":"screenshot","args":{"format":"jpeg","quality":70,"path":"/tmp/v.jpg"},"session":"v"}'
```
**Expected:** the detail panel shows severity/status badges, description, a **Recommendation**
card, maybe AI narrative + detected date, and **Acknowledge / Snooze 24h / Resolve** buttons —
instead of the raw `{severity, anomalyId, fingerprint}` dump.
**If it still shows the raw dump:** the most likely cause is the fetch `/api/ai/anomalies/<id>`
returning 400 ("No Xero organisation selected") — that endpoint requires a tenant/Xero org.
Check whether the session has a tenant; if not, the anomaly fetch fails → component shows the
`failed` UAlert fallback. Diagnose via the browser console / network, not by guessing.

---

## Workstream 1 — Test-suite health ✅ DONE + DEPLOYED (PR #154)
Greened main's **129 pre-existing vitest failures → 0** (4064 pass). db.test + auth.test
rewritten vs the current dual-driver / stateless-JWT+RBAC models; 9 drift fixes.
**Also fixed + deployed 2 auth security gaps found en route** (commit `f2ec3a65`, mig 191 live):
1. `hashToken` was a passthrough → now SHA-256 (secures magic-link/password-reset/email-verify
   token_hash at rest). 2. `invalidateAllSessions` was a no-op → now stamps
   `team_members.sessions_invalidated_at`; `validateSession` rejects JWTs with `iat` < cutoff
   (real "log out everywhere"). Both battle-tested 8/8 against the live DB. Merged + deployed.

## Workstream 2 — Ops Autopilot ✅ LANDED DORMANT + DEPLOYED (PR #155)
6 slices (A.1 escalation spine, A.2 inbox, C1.1 pacing watchdog, C2.1 ad-reports, A.3.1
lifecycle guard, C5 brief gatekeeper) merged to main + deployed — **all DORMANT** (flags
`AD_REPORTS_ENABLED`/`BRIEF_GATEKEEPER_ENABLED`/`LIFECYCLE_GUARD_ENABLED` off, crons
unregistered → zero behavior change). 72 automation tests green. Migs 192/193 live.
**C5 PRE-FLIGHT VERIFIED 8/8 against the live DB** (throwaway brief: needs_info→status+comment+
notify; complete→auto-assign+notify).
**Activation = operator step, go-ahead-gated** (flags are CF-dashboard env vars, can't be set
from CLI; + redeploy). Recommended order C5 → C1 → C2. ⚠️ C1's first cron run can email-burst —
roll out with the notification-allowlist discipline (like the anomaly cron). Full detail:
memory `ops-autopilot-program.md`.

## Workstream 3 — Inbox overhaul (3 PRs)
Worktree `.worktrees/inbox-preview`, branch `feat/inbox-item-preview`. Components:
`app/utils/inboxEntity.ts` (pure link→entity parser), `app/components/inbox/InboxItemPreview.vue`
(fetch + render), wired into `InboxNotification.vue`.
- **PR #156** ✅ deployed — task/brief inline preview (click a notification → see the underlying
  task/brief inline instead of navigating away).
- **PR #157** ✅ deployed + **verified live** — **the critical bug fix**. Root cause (found via
  live DOM inspection): `app/layouts/agency.vue` wraps every page in a flex-**column**; the inbox
  is the only two-panel page, so the tall list ate all height and the detail panel collapsed to
  **0px** → "nothing opened on the right". Fix: wrapped the inbox's panels in a flex-**row**
  `<div class="flex flex-1 min-h-0 overflow-hidden">`. Detail panel now opens + scrolls.
  Memory: `inbox-detail-panel-bug.md`.
- **PR #158** ⏳ DEPLOYING (see top) — rich anomaly detail + Acknowledge/Snooze/Resolve actions.

**User feedback still open after #158:** they want the detail to be in-depth with actions — #158
delivers that for `anomaly_critical` (the bulk of the inbox). If they want the same richness for
other types (lobby/consent "System" notifications, etc.) that's a follow-up. They verify live.

### How the inbox detail resolves content
A notification's `link` → `parseInboxEntity()`:
`/agency/tasks/<id>` → task, `/agency/briefs/<id>` → brief, `/anomalies?focus=<id>` → anomaly
(`/api/ai/anomalies/<id>`). Anything else → fallback to the old message + metadata card.
Easy to extend (add a route + a preview branch + tests). Tests: `test/utils/inboxEntity.test.ts`
+ `test/components/inboxItemPreview.test.ts` (SSR, no @vue/test-utils in repo; tested components
must `import {ref,computed,watch} from 'vue'`).

---

## Environment / gotchas
- Worktrees off repo root; `node_modules` symlinked; `pnpm exec nuxi prepare` once per worktree;
  `.env` only in the repo root (`DATABASE_URL=$(grep '^DATABASE_URL' ../../.env | cut -d= -f2-)`).
- Commit messages via `-F file` (backticks in `-m` break the shell).
- `gh pr merge` sometimes returns empty output but still merges — verify with `gh pr view --json state`.
- Live prod UI verification = Kimi WebBridge (`127.0.0.1:10086`), drives the user's real Chrome
  (their prod login). The Claude Chrome extension was disconnected this whole session.
