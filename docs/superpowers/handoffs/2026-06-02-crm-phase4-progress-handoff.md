# Session Handoff — CRM Phase 4 (P4.0–P4.3 shipped)

**Date:** 2026-06-02
**Predecessor handoff:** `docs/superpowers/handoffs/2026-06-02-crm-review-and-phase4-handoff.md`
**Phase-4 PRD:** `docs/superpowers/specs/2026-06-02-crm-phase4-intelligence-prd.md`

---

## 1. TL;DR

The CRM **Phase-4 program** is now built and live through **P4.3**. This session shipped — each as its own PR, squash-merged to `origin/main`, deployed from `.worktrees/deploy-prod` (own non-symlinked node_modules), and behaviorally verified:

| Sub-phase | PR | origin/main | What |
|---|----|----|----|
| P4.0a | #93 | `b4a80495` | Marketing/front-facing CRM sync (new "Sales & CRM" pillar) |
| P4.0b | #95 | `0f5c8fca` | CRM adoption metrics card on Insights |
| P4.0c + P4.1 | #96 | `288c4549` | F4 funnel/forecast endpoints **+ activation crons** (reminders/decay/dormancy + `workers/crm-cron`) |
| P4.2 | #98 | `86698f16` | Customer health / churn-risk scoring |
| P4.3 | #101 | `95b57d3f` | CRM AI layer (next-best-action + Groq draft follow-up) |

Also merged at session start: #87 (Phase-4 PRD), #89 (eslint z.record guard), #90 (predecessor handoff).

**`.env DATABASE_URL` IS the live prod Neon DB** — psql migrations run locally are immediately live. **Migration 157** (P4.1) is already applied. P4.2/P4.3 added **no migration**.

---

## 2. Activation — what's DORMANT and how to turn it on

Everything ships safe. Three things are gated behind operator action (**get sign-off before any**):

### Activation crons (P4.1 reminders/decay/dormancy + P4.2 health sweep)
The endpoints `/api/cron/crm-{task-reminders,score-decay,dormancy,health-recompute}` exist + are `x-cron-secret`-gated, but **nothing fires** until the companion Worker is deployed:
```bash
cd workers/crm-cron
printf '<the Pages CRON_SECRET value>' | pnpm exec wrangler secret put CRON_SECRET   # no trailing newline
pnpm exec wrangler deploy
```
The Worker fires all four hourly. Reminders have a **26h anti-flood drain** (long-overdue backlog is marked reminded without notifying — protects the first run). `crm_settings.dormancy_days` (default 90) is per-client, settable via the settings PUT.

### CRM AI layer (P4.3)
Off until `CRM_AI_ENABLED='true'` is set as a Pages secret (a `GROQ_API_KEY` is already present — Groq powers other features):
```bash
printf 'true' | pnpm exec wrangler pages secret put CRM_AI_ENABLED --project-name agency-dashboard
# then redeploy from .worktrees/deploy-prod
```
Next-best-action is **deterministic** (no LLM); only the draft follow-up calls Groq, and it's draft-only (never sent).

---

## 3. What each slice delivered (file pointers)

- **P4.0a** — `app/pages/features/index.vue` (Sales & CRM category, 8 cards), `features/[slug].vue` (8 detail pages), `app/components/MarketingNav.vue` (`featuresCrm`). Only prod-live Phases 1–3 capabilities marketed; custom-objects engine excluded (dormant).
- **P4.0b** — `server/utils/crm/adoption.ts` (pure, TDD) + `server/api/crm/analytics/adoption.get.ts` + "CRM adoption" card in `Insights.client.vue`.
- **P4.0c** — `server/api/crm/analytics/{funnel,forecast}.get.ts` (thin wrappers, were 404).
- **P4.1** — `server/utils/crm/activation.ts` (pure: partitionReminders/isDormant/resolveDormancyDays), 3 cron endpoints, `workers/crm-cron`, mig 157 (`crm_tasks.reminded_at`, `crm_settings.dormancy_days`).
- **P4.2** — `server/utils/crm/healthScoring.ts` (pure, TDD per component) + `healthSignals.ts` (recompute, score_type='health', **zero migration**) + `/api/cron/crm-health-recompute` (added to crm-cron) + in-band recompute on activity-create + `HealthPanel.vue` + "Churn risk" card on Insights. Read: `/api/crm/health{,/compute,/at-risk}`.
- **P4.3** — `server/utils/crm/nextBestAction.ts` (deterministic, explainable, TDD) + `aiDraft.ts` (Groq, pure prompt builder TDD) + `aiSignals.ts` (gatherOppContext) + `aiConfig.ts` (flag) + `/api/crm/ai/{status,next-best-action,draft-followup}` + `AiSuggestions.client.vue` on the opportunity slideover.

Test count: **221 CRM unit tests** green. Typecheck baseline held at **1252, 0-new** for every PR.

---

## 4. NEXT WORK

- **P4.3b** *(deferred from P4.3)* — office-meeting **action-items → CRM-tasks bridge**. Office has `office_meeting_{sessions,artifacts,action_items}` (migs 101/114) + its own action-item→task path (mig 115). Wire those extracted action-items into `crm_tasks` (don't rebuild extraction). Scope the link to client/contact carefully.
- **P4.4** — two-way **mailbox sync** (per-rep Gmail/Outlook OAuth). The program's biggest single effort — **spike first** (one provider, read-only inbound) before committing. Honors `do_not_email`.
- **P4.5** — SMS/WhatsApp (parked; needs a provider decision).
- **Optional** — a marketing-site mention of health/churn scoring + the AI layer (P4.0a's "Lead Scoring"/"Insights"/"AI & Intelligence" cards broadly cover it; not yet explicit).

---

## 5. Resume workflow (used all session)

```bash
cd /Users/paulgiurin/Documents/Projects/dashboard && git fetch origin
git worktree add -b <branch> .worktrees/<dir> origin/main
cd .worktrees/<dir> && ln -s ../../node_modules node_modules   # symlink OK for edit/test/typecheck — NOT deploy
pnpm exec nuxt prepare                                          # required in a fresh worktree or vitest/eslint die
pnpm exec vitest run test/crm                                  # 221 green baseline
NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck   # baseline 1252; goal 0 NEW
```

**Deploy** (only `origin/main`, from `.worktrees/deploy-prod` with its OWN node_modules):
```bash
cd .worktrees/deploy-prod && git fetch origin && git checkout --detach origin/main
rm -rf node_modules/.cache/nuxt .nuxt/tsconfig.tsbuildinfo
pnpm deploy:production
pnpm exec wrangler pages deployment list --project-name agency-dashboard   # top row Production + Source=<merge sha>
```
Verify behaviour (a new endpoint → **401/403** not **404** = new bundle live), not just HTTP 200.

**Real-DB probe** (throwaway, NOT committed): `export DATABASE_URL=$(grep '^DATABASE_URL' /Users/.../dashboard/.env|cut -d= -f2-)`; `pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/_probe.ts`. Import the util, not the endpoint (`defineEventHandler` is a Nitro global → ReferenceError).

---

## 6. Hard-won lessons this session

- **Prod CRM is EMPTY org-wide** (0 people/opps/scores/views) — all test data cleaned up. Cards/scores render zero/empty until reps populate; couldn't probe non-zero math live (covered by unit tests + targeted throwaway probes that self-clean).
- **Transient Cloudflare API upload errors** (`code: 8000000`, "unknown error" on `…/pages/…/deployments`) happen — the **build still succeeded**; just **re-run `pnpm deploy:production`**. Bit the P4.3 deploy once; retry cleared it.
- **`crm_scores.grade` CHECK is `Hot/Warm/Cold`** — health scoring reuses it (Healthy/At-risk/Critical relabel in UI) to stay zero-migration.
- **`gh pr merge --delete-branch` fails its LOCAL post-step** when a worktree holds the branch ("'main' is already used by worktree" / "used by worktree") — the **remote merge still succeeds**; verify via `gh pr view <n> --json state`, then `git worktree remove`.
- **Migration numbers move under you** (parallel social/listening sessions) — 157 used now; re-check the highest before any new migration.
- **origin/main advances under you** — a concurrent session merged Social Listening 4a→4d (#91/#94/#99) during this session; `git merge-base --is-ancestor <my-sha> origin/main` confirms your work landed before deploying.
- Notifications: CRM-task reminders use `createNotification` (in-app, link `/agency/crm`); CRM tasks have no dedicated `/agency/tasks/<id>` route.

---

## 7. Reference
- Phase-4 PRD: `docs/superpowers/specs/2026-06-02-crm-phase4-intelligence-prd.md`
- Phase 1–3 PRD: `docs/superpowers/specs/2026-06-01-crm-enhancements-prd.md`
- Project memory `crm-platform.md` (loads every session) carries the durable record through P4.3.
