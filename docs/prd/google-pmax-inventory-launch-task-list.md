# Governed Google PMax Inventory Launch Task List

## Product and data foundation

- [x] Enforce fixed-flight total budget fields and compatibility guards.
- [x] Normalize an immutable, canonical launch configuration and SHA-256 identity.
- [x] Persist the governed launch state machine, approvals, events, retries, and safety
  constraints.
- [x] Bind one exact client-owned Google vehicle feed and asset mode.
- [x] Seed the project template and accountable launch tasks.
- [x] Persist immutable decision evidence and expiring onboarding attestations.

## Whole-platform evidence

- [x] Collect approved briefs, boards/tasks, knowledge, audiences/personas, spend,
  performance, anomalies, client intelligence, and Monday-derived records.
- [x] Read exact internal feed evidence without cross-client fallback.
- [x] Read Google Ads, Merchant link, conversion, asset, and destination evidence.
- [x] Evaluate new-account, Business Profile, location/store-code, and Vehicle Ads
  onboarding blockers.
- [x] Synchronise stable remediation tasks.
- [x] Add a bounded Cloudflare AI Gateway advisory that cannot alter readiness.

## Provider execution

- [x] Build deterministic retail PMax Vehicle Ads operations.
- [x] Use `CUSTOM_PERIOD` plus `totalAmountMicros`, with no daily amount field.
- [x] Resolve language constants and exact geo criteria.
- [x] Create an explicit NEW/USED condition tree and exclude the remainder.
- [x] Create or safely reuse an exact custom conversion goal.
- [x] Validate the create body before provider mutation.
- [x] Create campaign and asset group paused and verify exact readback.
- [x] Retry safely through deterministic resource discovery.
- [x] Enable or pause campaign and asset group together.
- [x] Require independent provider-write and activation kill switches.
- [x] Isolate Google mutations in a route-less Cloudflare Worker reached only through
  the Pages service binding.
- [x] Move canonical evidence persistence, Hyperdrive-backed platform evidence,
  onboarding policy, and remediation-task sync behind the same private Worker boundary.
- [x] Enable Cloudflare Smart Placement so database-bound Worker execution runs close
  to the configured Hyperdrive origin.
- [ ] Add role-specific manual asset resources before enabling `PROVIDED` execution.

## Operator experience

- [x] List approved PMax brief versions that do not yet have a launch plan.
- [x] Prepare plans from a brief ID only; re-read all fields and resolve account,
  currency, timezone, feed, conversion, and geo identities server-side.
- [x] Reject browser-supplied normalized configuration, idempotency keys, ambiguous
  geo suggestions, inactive feeds, and stale brief versions.
- [x] Add tenant/client-scoped launch list and detail evidence.
- [x] Add structured onboarding attestation UI.
- [x] Add preflight, create approval, paused execution, activation approval, and
  activation controls.
- [x] Add explicit spend acknowledgement and state-specific actions.
- [x] Surface the workspace from the Google Ads account screen.
- [x] Publish the feature on marketing pages and navigation.

## Release and operations

- [x] Apply migrations 350–360 to Neon and verify constraints and automatic rollout.
- [x] Add unit, route, migration, state-machine, provider, and kill-switch coverage.
- [x] Add private Worker boundary tests, standalone typecheck, and Wrangler dry run.
- [x] Document Cloudflare production gates and paused-first runbook.
- [ ] Deploy preview through `pnpm deploy:preview` after PR review.
- [ ] Complete one real paused-only Google comparison with activation disabled.
- [ ] Record launch authority and final conversion test for Northern GAC.
- [ ] Enable production activation only during an approved launch window.
- [ ] Monitor the first 72 hours and close seeded rollout tasks.
