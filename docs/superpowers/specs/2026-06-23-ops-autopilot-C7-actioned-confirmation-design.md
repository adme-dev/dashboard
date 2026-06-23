# Ops Autopilot C7 — Actioned-Confirmation Loop (design)

**Status:** Approved design (2026-06-23). Next: implementation plan (writing-plans).
**Relates to:** dept-automation spec §5 (C7), C5 brief gatekeeper (built), the A.1 escalation
spine + `OPS_AUTOPILOT_NOTIFY_ALLOWLIST` (PR #161), the inbox.

## 1. Problem
The agency's #1 friction: Matthew briefs a change, then **chases** "is this actioned?" because
the system tells him nothing. The chasing has two moments: right after briefing ("did anyone
pick it up?") and later ("it's been sitting — is it moving?"). C7 closes both so the **system**
answers, not Matthew.

## 2. Goal & scope (v1)
Two notifications, driven off the **dashboard briefs system** (the system of record; the same
surface C5 already hooks):

1. **Acknowledged-on-pickup** — when a brief first gets an owner or becomes work, tell the
   briefer once.
2. **Stalled-SLA alert** — when a brief sits un-actioned past the SLA (**1 working day**), tell
   the briefer *and* raise an escalation for the on-call team.

**Non-goals (deliberate YAGNI for v1):** no completion-confirm, no client-facing notification,
**no task/status mutation** (confirm + alert only — respects the autonomy ceiling). Anchored on
dashboard briefs only (not Monday/email).

**Dormancy:** entirely gated by `C7_CONFIRMATION_ENABLED` (off) + the SLA cron is not registered.
Forward-looking: there are 0 briefs in prod today; C7 fires once briefing flows through the
dashboard (its payoff is coupled to brief adoption, which C5+C7 together make worthwhile).

## 3. What counts as "actioned"
First of either, whichever happens first, de-duplicated to **one** acknowledgement:
- `briefs.assigned_to` transitions NULL → set (someone owns it), or
- `briefs.converted_to_task_id` / `converted_to_project_id` transitions NULL → set (work created).

## 4. Data model (migration 195 — additive)
Two nullable columns on `briefs` for idempotent dedup (no behaviour without the flag):
- `c7_acknowledged_at TIMESTAMPTZ` — stamped when the ack fires; guarantees one ack per brief
  across all action paths.
- `c7_stall_alerted_at TIMESTAMPTZ` — stamped when a stall alert fires; prevents daily re-nagging.

One new notification type **`brief_actioned`** (added to `NotificationType` + the frontend
icon/color/label maps) for the briefer-facing confirm/alert messages — keeps the inbox honest
rather than overloading `brief_status_changed`. No dedicated inbox tab (shows under All/Unread).

## 5. Components
- **`server/utils/automation/actionedConfirmation.ts`** (pure, unit-tested):
  - `isFirstAction(brief)` — should we acknowledge? (has owner/conversion AND `c7_acknowledged_at` null)
  - `ackNotification(brief)` — builds the `createNotification` params (type `brief_actioned`) to
    the briefer (`submitted_by`), reason `direct`. Message adapts to the action: assigned →
    *"Your brief '<title>' has been picked up by <assignee>."*; converted without an assignee →
    *"Your brief '<title>' is now in the production pipeline."* (never renders a null assignee).
  - `addWorkingDays(from, n)` / `isStalled(brief, now, slaWorkingDays)` — Mon–Fri SLA (holidays
    ignored in v1); stalled = submitted, not yet actioned, `c7_stall_alerted_at` null, and
    `now > submitted_at + 1 working day` (or past `requested_deadline` if sooner).
  - `stallEscalation(brief)` — builds the A.1 `EscalationInput` (capability `brief_sla`,
    `warning` severity, proposedAction = none/notify-only) + the briefer notification params.
  - `isC7Enabled()` — `process.env.C7_CONFIRMATION_ENABLED === 'true'`.
  - **AI seam (forward-only, no AI built in v1):** `ackNotification` and `stallEscalation`
    accept an optional `suggestion?: string` that, when present, is appended to the message
    (e.g. *"Suggested next step: …"*). v1 always passes `undefined`. A later KB-AI step can
    populate it without touching the deterministic core (see §9.5).
- **Ack hook** — a thin runner `maybeAcknowledgeBrief(briefId)` called (flag-gated, fail-open)
  from the brief **assignment** and **conversion** code paths, mirroring `briefGatekeeperRunner`.
  Stamps `c7_acknowledged_at` then notifies. Never blocks the assignment/conversion.
- **Stall cron** — `server/api/cron/ops-autopilot-brief-sla.post.ts` (x-cron-secret, daily,
  `?force`): selects un-actioned briefs past SLA with `c7_stall_alerted_at` null → for each:
  `raiseEscalation` + `notifyEscalationApprovers` (team, **allowlist-capped** via
  `OPS_AUTOPILOT_NOTIFY_ALLOWLIST`) + direct `createNotification` to the briefer; stamps
  `c7_stall_alerted_at`. **Not registered** in `workers/pages-cron` (activation gate).

## 6. Data flow
```
Brief submitted ──(C5 gatekeeper)──> needs_info | passes
        │
   assigned_to set  OR  converted_to_task/project   ──ack hook──> ack to briefer (once; stamps c7_acknowledged_at)
        │
   (still un-actioned past 1 working day) ──daily SLA cron──> escalation (team, allowlist) + alert to briefer (once; stamps c7_stall_alerted_at)
```

## 7. Error handling
Fail-open everywhere (same contract as the gatekeeper/pacing watchdog): the ack hook and cron
log and continue; they never block a brief assignment/conversion and never throw. Flag-off and
unset cron = zero behaviour.

## 8. Testing
Unit tests (pure helpers): `isFirstAction` dedup; `addWorkingDays` across weekends; `isStalled`
boundaries (just-before / just-after SLA, `requested_deadline` override, already-alerted,
already-acknowledged); `ackNotification` / `stallEscalation` shape (recipient = `submitted_by`,
capability `brief_sla`, severity warning, no mutation). Flag-gating asserted. Follows the
`test/automation/*` pure-helper pattern (no DB in unit tests).

## 9. Activation (operator, later — added to the activation runbook)
Set `OPS_AUTOPILOT_NOTIFY_ALLOWLIST` (owner-only) → `C7_CONFIRMATION_ENABLED=true` + redeploy →
register `/api/cron/ops-autopilot-brief-sla` in `pages-cron` (daily). Verify: assign a test brief
→ briefer gets one ack; leave a test brief un-actioned + force the cron → one escalation + one
briefer alert, no repeats. Rollback: unset the flag / remove the cron route.

## 9.5 AI composition (separate slices — not built by C7)
C7's core is deterministic by design (a notification + an SLA check must be reliable, free, and
not depend on an LLM call). It *composes* with the AI layer without owning it:
- **Traffic controller (G1)** — capacity-aware auto-routing (`route_to_capacity`: AI proposes the
  best-fit available person, auto-applies routine, human override always). G1 is what *actions*
  a brief by assigning it. C7's trigger is `assigned_to` → set **regardless of who set it**, so
  once G1 ships, C7 confirms G1's assignments for free — no rework. G1 is its own slice (deferred).
- **KB-corrections AI** — the AI assistant using the Knowledge Base (agency standards/templates)
  to draft what a brief is missing or got wrong. This belongs to **C5 (the gatekeeper)** /a QA
  step, not C7. When it exists, it can feed C7's `suggestion` seam (e.g. the stall alert carries
  an AI next-step). Gated by `AI_TOOLS_ENABLED` + KB-ACL; out of C7's critical path.

The only C7 concession to AI now is the optional `suggestion` field (§5) — an empty seam, no
AI dependency added.

## 10. Out of scope / follow-ons
Completion-confirm; client-facing confirmation; `requested_deadline`-tiered urgency; holiday
calendar for the SLA; a "My Briefs" inbox tab for `brief_actioned`; covering non-dashboard
(Monday/email) briefing paths.
