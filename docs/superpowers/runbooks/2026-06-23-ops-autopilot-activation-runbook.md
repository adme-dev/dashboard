# Ops Autopilot — Activation Runbook

**Audience:** the operator (Paul). Every step here is **operator-gated** — env-var flips on
Cloudflare Pages + redeploys, which an agent cannot do. Nothing in this runbook is automatic.

**Golden rules**
- **Spend & deploy stay human-approved — always.** No capability here writes to ad platforms
  or auto-advances tasks; they only *notify / raise escalations / gate*.
- **One capability at a time.** Activate, watch for a few days, then the next.
- **Env vars are `process.env`** → set in **Cloudflare Pages → `agency-dashboard` → Settings →
  Environment Variables → Production**, then **redeploy** (`pnpm deploy:production` or merge to
  `main`). They can't be set via CLI.
- **Allowlist first.** Before anything that notifies, set `OPS_AUTOPILOT_NOTIFY_ALLOWLIST` to
  your email only, so a first run can't email the whole team.

**Recommended order:** C5 → C1 → C2 → (later) Phase 4 lifecycle guard.

**Already shipped & dormant (no action needed to keep them off):**
- Safety rails (PR #161): `LIFECYCLE_GUARD_ENABLED`, `OPS_AUTOPILOT_NOTIFY_ALLOWLIST`.
- Pilot statuses (migration 194) **applied + verified** on `ADME Creative Request` (guard off).
- Flags `BRIEF_GATEKEEPER_ENABLED`, `AD_REPORTS_ENABLED` off; crons `ops-autopilot-pacing`
  and `send-ad-reports` **not registered** in `workers/pages-cron/src/index.ts`.

---

## 0. Pre-flight (every activation)
1. `OPS_AUTOPILOT_NOTIFY_ALLOWLIST=paul@adme.net.au` (Production env) + redeploy.
2. Confirm escalation inbox loads: `/agency/automation/escalations` (AUTOMATION role).

---

## C5 — Brief gatekeeper  *(lowest risk; no email burst)*
**Turn on:** set `BRIEF_GATEKEEPER_ENABLED=true` → redeploy.
**Verify:**
- Submit a deliberately **incomplete** brief → expect status set to `needs_info` + a
  request-info comment + a notification to the submitter.
- Submit a **complete** brief whose template has `auto_assign_to` → expect auto-assignment.
(Both are fail-open: a gatekeeper error never blocks the submit.)
**Rollback:** unset `BRIEF_GATEKEEPER_ENABLED` → redeploy.

---

## C1 — Budget/pacing watchdog  *(⚠️ first-run email-burst risk → allowlist is mandatory)*
**Prereqs:** §0 allowlist set (owner-only). 
**Register the cron** (it is NOT in `pages-cron` yet — this is a code change):
- Add `'/api/cron/ops-autopilot-pacing'` to a daily entry in `workers/pages-cron/src/index.ts`
  `ROUTES` (the handler self-gates to 7am tenant-local; or trigger ad-hoc with `?force=true`).
- Deploy the worker.
**Verify (use `?force=true` first, before scheduling):**
- First forced run → raises N escalations into `/agency/automation/escalations`.
- Immediate **second** forced run → `raised: 0` (dedup working).
- Confirm only the allowlisted address was emailed.
**Rollback:** remove the cron route (or unset allowlist to stop email); escalations are read-only.
**Then** broaden `OPS_AUTOPILOT_NOTIFY_ALLOWLIST` over a week, or unset for full AUTOMATION fan-out.

---

## C2 — Ad-report engine  *(no platform writes)*
**Prereqs:** at least one row in `ad_report_schedules` (the boards/clients to report on).
**Turn on:** set `AD_REPORTS_ENABLED=true` → redeploy; register `'/api/cron/send-ad-reports'`
in `pages-cron` ROUTES (monthly cadence) + deploy.
**Verify:** force a run → expect a PDF rendered to R2 + emailed via the analytics-report rail.
**Rollback:** unset `AD_REPORTS_ENABLED` (and/or remove the cron route) → redeploy.

---

## Phase 4 — Lifecycle guard  *(do AFTER the pilot statuses have been used for real)*
This makes 🟡 status transitions raise approval escalations. Prereqs: migration 194 applied
(done), §0 allowlist set.
**Turn on:** set `LIFECYCLE_GUARD_ENABLED=true` → redeploy.
**Verify on the pilot board (`ADME Creative Request`):**
- Move a **test** task into a 🟡 status — e.g. **Awaiting Approval** (approval), **Awaiting
  Creative Approval** (proofing), or **Check Daily** (monitoring, critical-severity spend).
- Expect **exactly one** escalation in `/agency/automation/escalations`, notified only to the
  allowlisted address. Move it again to the same status → no duplicate (dedup).
- 🟢 (e.g. Brief Required → QA) and 🔴 (Working on it) must raise **nothing**.
**Rollback:** unset `LIFECYCLE_GUARD_ENABLED` → redeploy (instant off; the guard no-ops).

---

## What is still NOT built (don't expect these to activate)
- **C6 roll-over / C7 confirmation loop** — now *unblocked* by the pilot statuses but not yet
  built (own slices).
- **C3 QA-linter / C4 tracking-health** — data-blocked (no campaign-config sync; `tracking_events=0`).
- **Phase E ad-platform deployment** — mostly missing code (campaign-creation payloads).
- **Auto-advance (G2)** — the guard only *raises*; it never moves tasks. Auto-advance is a
  separate, deliberately-deferred slice.

## Emergency stop
- Stop all escalation emails: unset `OPS_AUTOPILOT_NOTIFY_ALLOWLIST` won't help (that *widens*).
  Instead set it to a single quiet inbox, or turn off the source flag/cron for the capability.
- Stop the lifecycle guard: `LIFECYCLE_GUARD_ENABLED` off → redeploy.
- Stop pacing/reports: remove their cron routes from `pages-cron` → deploy.
