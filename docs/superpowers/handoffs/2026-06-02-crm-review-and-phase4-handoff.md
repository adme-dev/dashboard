# Session Handoff — CRM Code Review, Bug Fixes, Phase-4 Kickoff

**Date:** 2026-06-02
**origin/main tip when written:** `148879e5`
**Predecessor handoff:** `docs/superpowers/handoffs/2026-06-02-crm-phase3-shipped-handoff.md`

---

## 1. TL;DR — where things stand

The CRM Enhancement Program (Phases 1–3 + all 3 follow-ups, F1–F15) is **100% complete, live in prod, and verified.** This session ran a post-program **code review + PRD gap-check**, fixed the bugs it found, enabled the comms bridge, and drafted a Phase-4 PRD. **All merged work is deployed and verified.** Local `main` == `origin/main` (reset this session; backup at `backup/local-main-2026-06-02`).

`.env DATABASE_URL` **is the live prod Neon DB** (proven: a prod-webhook bridge comm appeared via psql). So psql migrations run locally are immediately live on prod — treat with deploy-level care.

---

## 2. Shipped this session (all merged → origin/main, deployed, verified)

| PR | What | Verified |
|----|------|----------|
| #74 | CRM Phase-3 handoff doc | — |
| #77 | F10 bridge wiring (email send + lead inbound → CRM timeline) | bridge **confirmed firing** in prod |
| #79 | F14 quote auto-create ("Generate quote" from opp line-items) | browser-eyeballed |
| #82 | Pricing owner-access fix (`requirePricingAccess` was excluding `owner`) | `create-quote` → 200 |
| #84 | **Zod-4 `z.record` fix** (6 endpoints 500'd on single-arg form) | `POST /api/leads` → 200 (was 500) |
| #86 | **F14 quote atomicity** — transaction wrap + TOCTOU-safe link + **quote-number trigger fix** (mig 155) | real-DB probe |

**Bridge gate is ENABLED in prod:** `CRM_COMMS_BRIDGE_ENABLED=true` (Pages secret). Email side also needs `EMAIL_SENDING_ENABLED` (off); lead side is live.

**Migration 155** (`generate_quote_number()` fix) is already applied to the shared prod DB.

---

## 3. OPEN PRs — need action

- **#87 — Phase-4 PRD** (`docs/.../2026-06-02-crm-phase4-intelligence-prd.md`). **Review + merge.** This is the build spec for the next session.
- **#89 — ESLint guard** banning single-arg `z.record` (P4.0c). Trivial, no-deploy. **Merge.**

---

## 4. NEXT WORK — Phase 4 build (per PRD #87, smallest-value-first)

### P4.0a — Marketing / front-facing CRM sync *(the one real PRD miss; start here)*
The shipped CRM capabilities (Tasks, Scoring, Insights/Forecasting, Saved Views+Export, Leaderboard, Duplicates, Documents, Relationships, Comms log, Quote generation) have **no presence on the public site**. Add CRM entries to `app/pages/features/index.vue`, detail entries in `app/pages/features/[slug].vue`, and a CRM section in `app/components/MarketingNav.vue`. **Every hardcoded hex color needs a `dark:` variant** (marketing pages are dark-by-default — see CLAUDE.md "Dark Mode on Marketing"). Deploy → browser-eyeball.

### P4.0b — Success-metric instrumentation
None of the PRD's 6 metrics are measured. Add a CRM "Adoption" card (agency-only) on the Insights tab: % opps with ≥1 open task, % people scored, saved-views/user, post-merge dup rate. Pure aggregation util (TDD) + one read endpoint.

### P4.1 — Activation crons *(highest product value)*
Makes "no lead goes cold" real (nothing fires today). One companion Worker `workers/crm-cron` + endpoints `/api/cron/crm-{task-reminders,score-decay,dormancy}`, gated `x-cron-secret: $CRON_SECRET`, idempotent, **first-run flood-guarded** (mirror the anomalies runbook in CLAUDE.md — allowlist or since-deploy cutoff so a backlog of overdue tasks doesn't fire a notification flood). Reuse `server/utils/notifications.ts` for reminders; `scoring.ts` decay + `lifecycle.ts` dormancy already exist as pure utils — the cron just re-triggers them. Likely one small migration (`reminded_at`/`last_decay_at` cols).

### Later: P4.2 health/churn scoring (**zero migration** — `crm_scores.score_type='health'` exists) · P4.3 CRM AI layer (Groq, flag-gated) · P4.4 mailbox sync (spike first) · P4.5 SMS/WhatsApp (parked). Also P4.0c minor: decide F4 analytics endpoint drift (2 shipped vs spec's 4 — `funnel`/`forecast` 404).

---

## 5. Resume workflow (the disciplined loop used all session)

```bash
cd /Users/paulgiurin/Documents/Projects/dashboard && git fetch origin
git worktree add -b <branch> .worktrees/<dir> origin/main
cd .worktrees/<dir>
# OWN node_modules — NEVER symlinked for a DEPLOY (shares Nuxt build cache → 500s prerender).
# Symlink is OK for edit/test/typecheck/lint only:  ln -s ../../node_modules node_modules
pnpm exec nuxt prepare                 # required in fresh worktree or vitest/eslint die
pnpm exec vitest run test/crm          # ~175 green baseline
NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck   # baseline 1252, goal 0 NEW
```

**Real-DB probe** (throwaway, NOT committed): `export DATABASE_URL=$(grep '^DATABASE_URL' /Users/.../dashboard/.env|cut -d= -f2-)` then `pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/_probe.mjs`. Shim `globalThis.createError`; import the util not the endpoint (`defineEventHandler` is a Nitro global → ReferenceError). `agency_clients` INSERT needs `billing_type` ('retainer')+`name`; `crm_stages` orders by `sort_order`.

**Deploy** (only origin/main, from `.worktrees/deploy-prod` with its OWN node_modules):
```bash
cd .worktrees/deploy-prod && git checkout --detach origin/main
rm -rf node_modules/.cache/nuxt .nuxt/tsconfig.tsbuildinfo
pnpm deploy:production
pnpm exec wrangler pages deployment list --project-name agency-dashboard   # top row Production + Source=<merge sha>
```
Verify behaviour, not just HTTP 200 (Pages serves the SPA shell at 200 for any path). A new endpoint returning **401** (not 404) confirms the new bundle is live.

---

## 6. Hard-won lessons this session (don't relearn)

- **Verify, don't assume root causes.** Two wrong hypotheses this session were caught by verifying first (the manual-lead 500 was NOT `randomUUID` — it was Zod-4 `z.record`; found via `wrangler pages deployment tail` live logs). When stuck, tail prod logs.
- **Single-arg `z.record(x)` 500s at runtime under Zod 4** (compiles fine). #89 lints it; the fix is `z.record(z.string(), x)`.
- **`requirePricingAccess` excluded `owner`** (fixed #82) — if any other pricing-gated feature 403s for the owner, that's the place.
- **Quote-number trigger** (`generate_quote_number`) extracted the sequence at a hardcoded position → 2nd quote/year 500'd (fixed mig 155). Generic to the whole Pricing module.
- **`gh pr merge --delete-branch` fails its LOCAL post-step** ("'main' is already used by worktree") — the **remote merge still succeeds**; verify via `gh pr view <n> --json state`.
- **Migration numbers are a moving target** (parallel social/analytics sessions) — re-check the highest before writing (155 is used).
- **typecheck OOMs at default heap** — always the 16384 heap; baseline is 1252 (was 1272 pre-Zod-fix).
- Bridge end-to-end test path = the **generic webhook with an explicit `lead_id`** (manual `/api/leads` was the broken one, now fixed).

---

## 7. Reference
- Phase-4 PRD: `docs/superpowers/specs/2026-06-02-crm-phase4-intelligence-prd.md` (PR #87)
- Phase 1–3 PRD: `docs/superpowers/specs/2026-06-01-crm-enhancements-prd.md`
- Project memory `crm-platform.md` (loads every session) carries the durable record.
