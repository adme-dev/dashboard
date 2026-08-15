# Monday Campaign Performance Linkage

## Objective

Complete the cutover of active Google and Meta campaign jobs from Monday into
XeroFlow by linking only provable platform campaigns, persisting the durable
link in XeroFlow, and enabling safe pacing alerts and approval-only proposals.
Monday remains a temporary discovery/writeback source during migration; it is
not required for ongoing performance monitoring after a link is established.

## Behaviour

- Read active campaign jobs from the configured Monday Marketing board during
  cutover and resolve each job to its imported XeroFlow task and Xero-linked
  client.
- Prefer an explicit Campaign ID already recorded on the job. Otherwise infer
  only a unique same-client, same-platform, campaign-type-compatible match with
  a distinctive title token in common.
- Never guess, choose between tied candidates, cross clients, or replace an
  explicit Campaign ID with a different ID.
- Persist every proven ID in XeroFlow's task column values and mapping
  provenance before any external writeback. Monday writeback is an optional
  migration aid and must not block the durable XeroFlow link when the retiring
  connection is read-only.
- Set the matched current-period `media_spend.budget_allocated` from the job's
  approved positive budget only when the durable link is first established.
  The platform campaign row is the durable source used by pacing after cutover;
  recurring Monday reconciliation must never overwrite a later XeroFlow budget.
- Reconciliation is idempotent. Unresolved and ambiguous jobs are returned as
  actionable results without mutation.
- The hourly scheduler may run the reconciliation while Monday remains
  connected. Failure must not block the independent pacing job.
- Register the existing pacing watchdog so its 7am-local gate creates durable
  automation escalations even while member bell/push delivery is globally
  paused.
- Enable automated pacing review with `critical=propose`, `warning=notify`, and
  `info=off`. A proposal is only a XeroFlow action awaiting human approval; it
  must never write to Google or Meta automatically.
- Live budget execution remains behind the existing owner/admin approval,
  freshness, policy, and platform guardrails.

## Interfaces

- Pure matcher: campaign job + candidate platform rows -> matched, pending, or
  ambiguous result with evidence.
- Monday client mutation: parameterized `change_multiple_column_values` using
  the supported JSON column-values variable.
- Reconciliation service: dry-run by default and explicit apply mode.
- Operator script: repeatable dry-run/apply command using the same service.
- Cron endpoint: authenticated by `x-cron-secret`; reports counts without
  exposing tokens or client data.

## Verification

- Unit tests cover explicit IDs, the four currently provable live matches,
  wrong-client/platform/type rejection, ambiguous ties, and the generic boosted
  job remaining pending.
- Monday GraphQL tests prove the supported mutation and variable encoding.
- Service/cron tests prove dry-run immutability, idempotent apply, and failure
  isolation.
- Live dry-run must list every active job and only the provable matches before
  apply. Post-apply XeroFlow readback must be authoritative; Monday agrees only
  when its retiring connection has optional write scope.
- Focused lint, type checking, diff review, and secret scanning must pass before
  commit and push.

## Non-goals

- Creating or launching campaigns.
- Guessing links from broad client/platform similarity.
- Silent live-budget changes.
- Making Monday a permanent dependency of XeroFlow pacing or optimization.
