# PRD — CRM Phase 4: Intelligence, Activation & Channels

- **Status:** Draft for review
- **Date:** 2026-06-02
- **Owner:** Paul (paul@adme.net.au)
- **Predecessor:** `docs/superpowers/specs/2026-06-01-crm-enhancements-prd.md` (Phases 1–3, F1–F15 — shipped + live)
- **Related:** `docs/superpowers/plans/2026-06-01-crm-enhancements-tasks.md`

---

## 1. Background & Motivation

Phases 1–3 turned the CRM from a system of record into a tool reps run their day in: tasks, stage automation, scoring, analytics/forecasting, lifecycle, dedupe, assignment, relationships, audit, search, saved views, comms log, documents, quote generation, and a leaderboard — all live in production with agency + portal parity.

But three classes of value are **built-but-dormant or missing**:

1. **Nothing *fires*.** Tasks have `reminder_at` and overdue is *derived*, but no cron sends reminders; scores never *decay*; lifecycles never auto-go-*dormant*. The PRD's #1 goal — *"no lead goes cold silently"* — is unmet because the activation layer (companion-Worker crons) was deferred out of Phases 1–3.
2. **Forward-compat we already paid for is unused.** `crm_scores.score_type` already carries `health` (no migration needed) — churn-risk scoring is a util away.
3. **Intelligence & channels** — the AI layer and per-rep mailbox sync that the comms log + scoring + relationships were built to feed.

This PRD packages the documented "Phase 4 — Intelligence & Channels" (predecessor §8) into a buildable program, **plus a P0 closeout** of the loose ends a post-program code review surfaced.

### Non-goals (unchanged — owned elsewhere)
Email campaigns/templates (flyhub), inbound lead capture/routing (Leads module), notification fan-out/digests (Smart Watch — we *consume* it), workflow builder (Boards), quote engine (agency quotes — we link), meeting transcription (office-meeting system), product catalog (custom-objects engine), automotive (Phase C).

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|---|---|---|
| Reminders actually fire | % of `pending` tasks with `reminder_at` that triggered a notification on time | 100% (cron health) |
| No lead goes cold silently | Median time a `pending` task sits past `due_at` before action | trending down (now *measurable* via P4.0 instrumentation) |
| Scores stay honest | Score age (time since last recompute) p95 | < 24h (decay sweep) |
| Churn caught early | % of `customer`-lifecycle contacts with a `health` score | > 80% within 30d of P4.2 |
| Intelligence adopted | % of opportunities where a suggested next-best-action was accepted | baseline → up |

**This program also makes the Phase 1–3 success metrics measurable for the first time** (see P4.0 instrumentation) — today none of the PRD's six original metrics are instrumented.

### Guardrails
- Zero regressions; all additive. Crons gated + idempotent; AI features behind a flag.
- Agency + portal parity preserved via `provide/inject('crmApiBase')`.
- Client isolation via `queryScope.ts`; portal scopes by `requireClientAuth().clientId`.

---

## 3. Architecture & Conventions (delta from Phases 1–3)

All Phase 1–3 conventions hold (`queryRows/queryOne/execute/transaction`, additive `IF NOT EXISTS` migrations run via psql, `~~/` imports, Nuxt UI v4, TDD pure utils). New for Phase 4:

- **Cron = companion Worker.** Cloudflare Pages has **no `scheduled()` handler**. Each recurring job needs a companion Worker (pattern: `workers/meta-status-cron`, `pages-cron`) hitting `POST /api/cron/<job>` with header `x-cron-secret: $CRON_SECRET`. The endpoint self-gates (verifies the secret, checks tenant-local time where relevant) and is idempotent. **Never assume a dashboard toggle fires crons.**
- **AI = Groq stack.** Reuse the platform's existing Groq integration + Workers AI; do **not** add a new LLM dependency. Integrate the office-meeting system's transcripts/action-items rather than rebuilding call intelligence.
- **Flags as Pages secrets.** New activation flags follow the established pattern (`printf 'true' | wrangler pages secret put …` — no trailing newline; redeploy to apply).
- **Shared Neon DB:** `.env DATABASE_URL` is the live prod DB — psql migrations are immediately live; treat with deploy-level care.

---

## 4. Phase 4.0 — Program Closeout (P0, ship first)

Loose ends from the Phase 1–3 code review + PRD gap-check. Small, high-leverage, unblocks honest measurement. **Do this before the heavier P4.1–P4.5.**

### P4.0a — Marketing / front-facing sync *(the one genuine PRD miss)*
The new CRM capabilities (Tasks, Scoring, Insights/Forecasting, Saved Views + Export, Leaderboard, Duplicates/Merge, Documents, Relationships, Comms log, Quote generation) have **no presence** on the public site. Add CRM entries to `app/pages/features/index.vue`, detail entries in `app/pages/features/[slug].vue`, and a CRM section/category in `app/components/MarketingNav.vue` (per CLAUDE.md "Front-Facing Page Sync" + tasks 1H.3/2E.1/3H.1). **Acceptance:** a prospect can discover the CRM and its key capabilities from the marketing nav; dark-mode variants present on all hardcoded colors.

### P4.0b — Success-metric instrumentation
None of the predecessor PRD's six metrics are measured. Add a lightweight **CRM Adoption** card on the Insights tab (agency-only) computing, per client: % active opportunities with ≥1 open task, % people with a score, saved-views-per-user, duplicate rate post-merge. Pure aggregation util (TDD), one read endpoint. **Acceptance:** the card renders live numbers; util unit-tested against fixtures.

### P4.0c — Minor drift cleanups
- F4 analytics: either add the spec'd `analytics/funnel.get.ts` + `forecast.get.ts` thin wrappers, **or** formally document that `summary.get.ts` consolidates them (decide; don't leave the 404s ambiguous).
- **ESLint guard:** add a rule (or a CI grep check) banning single-arg `z.record(...)` — it compiles but 500s at runtime under Zod 4 (bit us on 6 endpoints). Cheap insurance against recurrence.

---

## 5. Phase 4.1 — Activation Crons (highest product value)

**Theme:** make the dormant Phase 1–3 timing features actually fire. One companion Worker, three self-gated cron endpoints.

### F1b — Task reminders
- `POST /api/cron/crm-task-reminders` (cron-secret gated): finds `pending` tasks where `reminder_at <= now()` and not yet reminded; fires via the **existing notifications system** (`server/utils/notifications.ts`) to `assigned_to`; marks reminded (idempotent — a `reminded_at` column or a notif-dedupe key). Persists derived-overdue as needed.
- **Acceptance:** a task with `reminder_at` in the past triggers exactly one notification on the next cron tick; re-runs don't re-notify.

### F3-decay — Score decay sweep
- `POST /api/cron/crm-score-decay`: recompute `lead` scores so the **recency** component erodes over time (the deterministic `scoring.ts` util already models decay — the cron just re-triggers recompute for stale targets). Writes a `crm_score_history` row with reason `decay`.
- **Acceptance:** a contact with no recent activity sees its score drop on the next sweep; history records the decay.

### F5-dormancy — Lifecycle dormancy
- Same Worker: flip `active`-lifecycle contacts with no activity in N days → `dormant` via `lifecycle.ts` (`applyLifecycleEvent`), N configurable per client in `crm_settings`.
- **Acceptance:** a contact idle past the threshold auto-moves to `dormant`; configurable; audited (F12).

**Infra:** one new `workers/crm-cron` companion Worker, schedule `0 * * * *` (handlers self-gate to the right cadence/tenant-local time), `CRON_SECRET` reused. No new tables (maybe `reminded_at`/`last_decay_at` columns — one small migration).

---

## 6. Phase 4.2 — Health / Churn-Risk Scoring

**Zero-migration win** — `crm_scores.score_type` enum already carries `health`.
- New `server/utils/crm/healthScoring.ts` (TDD, framework-free): a `health` score 0–100 from post-sale signals — engagement recency, open vs resolved tasks, support/comms cadence, contract/`expires_at` proximity (F13 docs), lifecycle. Mirrors `crm-dashboard-main`'s `customer_health_scores`.
- Recompute in-band (activity/task/comms create) for `customer`-lifecycle contacts + a sweep (reuse the P4.1 Worker).
- UI: a **health badge** (distinct from the lead grade) + breakdown on the person/company slideover; a "Churn risk" filter/saved-view.
- **Acceptance:** a customer with declining engagement + an expiring contract scores low-health and surfaces in the churn-risk view; util unit-tested per component.

---

## 7. Phase 4.3 — CRM AI Layer

**Theme:** turn the data (tasks, scores, comms, relationships, meeting action-items) into suggestions. Flag-gated (`CRM_AI_ENABLED`), Groq-backed.
- **Next-best-action** on an opportunity/contact (a ranked suggestion from open tasks, stage, score, last activity, comms gaps).
- **Auto-drafted follow-ups** — a suggested task/email-draft when a deal stalls (reuses comms log + scoring signals; draft only, human-sends).
- **Enrichment** — fill-gaps suggestions from existing signals (no third-party data vendor in v1).
- Integrate office-meeting **action-items → CRM tasks** (the office system already extracts them — wire the bridge, don't rebuild).
- **Acceptance:** an opportunity shows a relevant, explainable next-best-action; a stalled deal surfaces a draft follow-up the rep can accept/edit/dismiss; all behind the flag, off by default.

---

## 8. Phase 4.4 — Two-Way Mailbox Sync *(heavyweight — scope carefully)*

Per-rep OAuth Gmail/Outlook with inbound+outbound 1:1 email capture against contacts, writing into the F10 comms log. Large build (per-user OAuth, watch/push subscriptions, threading, token refresh, privacy). **Recommendation: spike first** (one provider, read-only inbound) before committing. Honors `do_not_email`. This is the program's biggest single effort — gate it behind explicit go-ahead and a spike.

---

## 9. Phase 4.5 — SMS / WhatsApp Channels *(parked)*

Net-new comm channel (Twilio/Telnyx) writing into the F10 comms log, honoring `do_not_sms`. Parked until a channel/provider decision. Out of scope for the initial Phase 4 build; documented for completeness.

---

## 10. Sequencing, Risks & Dependencies

- **Order:** P4.0 (closeout — unblocks measurement) → P4.1 (crons — highest value, smallest build) → P4.2 (health scoring — zero-migration) → P4.3 (AI layer) → P4.4 (mailbox, spike-gated) → P4.5 (SMS, parked).
- **Cron risk — notification flood on first run:** like the anomalies runbook, gate the first reminder/decay run (allowlist or a "since deploy" cutoff) so a backlog of overdue tasks doesn't fire a flood. Document a runbook.
- **AI risk — trust:** suggestions must be explainable (cite the signal) and never auto-send; flag-gated, off by default.
- **Deploy discipline:** only deploy `origin/main` from a checkout with its **own** node_modules; verify via `wrangler pages deployment list`. Migrations on `.env DATABASE_URL` are live on prod.
- **Migration numbers** are a moving target (parallel sessions) — re-check the highest before writing (155 used by the quote-number fix).

---

## 11. Out of Scope (Phase 5+)
- Third-party data enrichment vendors (Clearbit-style).
- Predictive/ML scoring (beyond deterministic + LLM-assisted).
- Automotive Pack (Phase C — separate initiative).
- Voice/call channel.

### Feature → sub-phase map

| Sub-phase | Migration | Items |
|---|---|---|
| **4.0 Closeout** | maybe 1 (cols) | Marketing sync · metric instrumentation · drift cleanups · ESLint guard |
| **4.1 Activation crons** | maybe 1 (cols) | F1b reminders · F3 decay · F5 dormancy (companion Worker) |
| **4.2 Health scoring** | **none** | `healthScoring.ts` + recompute + UI (`score_type='health'` already exists) |
| **4.3 CRM AI layer** | none | Next-best-action · auto-draft · enrichment · meeting action-items bridge (flag) |
| **4.4 Mailbox sync** | TBD | Per-rep OAuth inbound/outbound (spike first) |
| **4.5 SMS/WhatsApp** | TBD | Parked |
