# ADR-003: Use Cloudflare Workflows as the Automation Spine

## Status

Accepted

## Date

2026-07-03

## Context

XeroFlow has several automation surfaces:

- social publishing schedule dispatch;
- social inbox reply automation and engagement processing;
- paid-media pacing and budget escalation;
- CRM/opportunity follow-ups;
- brief-to-job lifecycle checks;
- client approval and SLA reminders;
- video/audio generation and asset processing;
- EOM and financial closeout support.

Historically, these jobs have been split across cron routes, queue consumers,
direct API calls, and ad hoc background loops. That works for simple sweeps, but
it is weaker for per-item retries, waits, callbacks, human approval, and
diagnosable recovery.

Cloudflare Workflows is designed for durable multi-step Workers applications. As
of the reviewed Cloudflare docs on 2026-07-03, Workflows supports durable steps,
automatic retries, sleep/sleepUntil, event waits, instance lifecycle APIs, and
built-in observability. The docs also stress idempotent API/binding calls,
granular deterministic steps, no reliance on in-memory state across sleeps or
restarts, deterministic step names, bounded step outputs, and platform limits
such as event/result size and instance ID length.

## Decision

Use Cloudflare Workflows as the durable automation spine for long-running,
retry-sensitive, callback-driven, or human-in-the-loop automation.

The Nuxt app remains the source of truth for:

- authentication and RBAC;
- tenant and client access checks;
- request validation;
- business state transitions;
- provider dispatch;
- audit logs;
- user-visible readiness and health APIs.

Cloudflare Workflows owns orchestration:

- durable per-item execution;
- explicit sleeps and waits;
- retries with bounded backoff;
- event/callback waiting;
- saga-style sequencing where compensation is needed;
- instance status for operator diagnostics.

Cron remains useful as a sweep/recovery trigger. It should not be the primary
owner of work that needs per-item retry state, multi-step sequencing, callback
correlation, or human approval waits.

## Selection Rule

Prefer Workflows when a job has at least one of these traits:

- a user-visible or provider-visible action must not double-fire;
- the job waits for a future timestamp, webhook, approval, or provider callback;
- the job needs different retry behavior per step;
- the job needs an operator-visible instance status;
- the job spans multiple systems where partial failure must be recoverable;
- the job should be resumable after Worker restart or infrastructure failure.

Prefer cron, queues, or direct route execution when:

- the job is a simple bounded sweep;
- the work is fire-and-forget and already idempotent at the database boundary;
- the job is high-volume and each item is trivial;
- the job needs only periodic reconciliation, not per-item durable orchestration.

## Automation Migration Order

1. Social scheduled publishing: already implemented behind
   `AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY`.
2. Social inbox automation: foundation exists for new inbound conversation
   events behind `AGENCY_WORKFLOWS_ENABLED`.
3. Paid-media pacing and budget escalation: a read-only `social.spend.review`
   Workflow foundation now exists for deterministic per-period review
   instances, Worker readiness/status inspection, and production smoke
   enforcement. Budget proposal/apply behavior remains in the existing
   human-approved chain until write semantics are fully idempotent and
   approval-gated.
4. CRM/opportunity follow-ups: use Workflows for due follow-ups, waits, and
   reminders where a missed callback or duplicate reminder matters.
5. Brief-to-job lifecycle checks: a read-only `brief.lifecycle.check` Workflow
   foundation now exists for deterministic per-brief lifecycle/completeness
   checks, Worker readiness/status inspection, and production smoke
   enforcement. Conversion, assignment, comments, and notifications remain in
   app-owned approval-safe paths until their workflow cutover rules are
   explicitly reviewed.
6. Video/audio generation: use Workflows for provider polling, callback waits,
   asset persistence, and failure recovery where the provider submission ID is
   the idempotency anchor.
7. EOM/financial closeout: use Workflows only after financial write proposals
   are fully permissioned, confirmed, and audited.

## Implementation Standards

- Every Workflow instance ID must be deterministic and fit Cloudflare's instance
  ID limit.
- Every non-idempotent step must check whether the operation is still needed
  before performing the side effect.
- Step names must be deterministic.
- Large artifacts must be stored in R2/Postgres and passed by reference, not
  returned as large step values.
- Workflow event types must use Cloudflare-compatible characters; use hyphen or
  underscore, not dotted event names.
- App callbacks must validate shared secrets, feature flags, payload schema, and
  current database state before mutating anything.
- Provider dispatch must remain in app-owned code paths unless a specific
  provider adapter has been reviewed for Worker-side execution.
- Workflow readiness must verify required bindings for every active workflow
  kind.
- Production cutovers require Graphify freshness, focused tests, Worker
  typecheck/dry-run, authenticated smoke, and production origin smoke.

## Consequences

- New automation work should include a Workflows fit check before adding another
  cron-only loop.
- Existing cron routes should gradually become sweepers that start or reconcile
  Workflow instances.
- Operator docs and readiness scripts must list every active Workflow kind.
- The current social publishing cutover remains blocked until authenticated
  production smoke passes and the primary flag is deliberately flipped.

## Sources

- Cloudflare Workflows overview: https://developers.cloudflare.com/workflows/
- Sleeping and retrying: https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/
- Events and parameters: https://developers.cloudflare.com/workflows/build/events-and-parameters/
- Rules of Workflows: https://developers.cloudflare.com/workflows/build/rules-of-workflows/
- Limits: https://developers.cloudflare.com/workflows/reference/limits/

## Related

- `docs/project-purpose.md`
- `docs/decisions/ADR-002-cloudflare-agents-ai-orchestration.md`
- `docs/superpowers/plans/2026-07-02-social-publishing-enterprise-hardening.md`
