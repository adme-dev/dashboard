# Persona Campaign Intelligence Delivery Plan

## Objective

Connect website behaviour, confirmed leads, CRM identities, catalog products and campaign attribution into a tenant-scoped intelligence layer. All cross-client reporting remains aggregate-only. Advertising-platform audience writes remain disabled until a separately approved activation release.

## Delivery slices

### Slice 1: Signal and privacy foundation

- [x] Add normalized customer signals keyed by tenant and pseudonymous subject hash.
- [x] Persist consent changes separately from behavioural events.
- [x] Strip query strings, arbitrary free text and PII-like fields from persona context.
- [x] Preserve source-event lineage and deterministic idempotency.
- [x] Keep tracking and lead ingestion durable when enrichment is unavailable.
- [x] Capture consent policy version, privacy notice and decision method.
- [x] Expose a first-party consent API for client banners and preference centres.
- [x] Keep client portal authorization separate from person-level consent.
- [x] Add append-only purpose, channel and destination suppression events.
- [x] Enforce current marketing consent and suppression before provider sync staging.

### Slice 2: Identity and product connection

- [x] Link anonymous and session hashes to existing CRM identity profiles only after deterministic lead confirmation.
- [x] Detect conflicting profile links and fail closed.
- [x] Backfill historical anonymous signals after a safe identity match.
- [x] Resolve VIN, stock ID, SKU, source product ID and product URL against the existing CRM catalog.
- [x] Preserve separate opportunities for distinct product enquiries.
- [x] Add tenant-scoped conflict, merge, split and link-review cases.
- [x] Require a different owner or admin to approve a proposed identity resolution.
- [x] Record immutable resolution versions, mappings and audit evidence.
- [x] Support rollback through a new projection version without rewriting raw history.
- [x] Surface identity coverage and governed cases in the client portal.
- [x] Require dynamic Media Buying permission for agency persona and cohort reads.
- [x] Require dynamic Admin permission for activation and reconciliation operations.
- [x] Keep sensitive agency activation and reconciliation responses out of shared caches.

### Slice 3: Persona rules and cohort previews

- [ ] Add versioned system and client persona definitions.
- [ ] Record positive signals, negative signals, minimum confidence and permitted channels.
- [ ] Calculate aggregate cohort size, consent-eligible size, suppression and known-profile coverage.
- [ ] Enforce a minimum audience threshold.
- [ ] Cache aggregate previews for 15 minutes.
- [ ] Expose client CRM and agency read-only APIs.
- [ ] Add a client CRM audience-intelligence panel.

### Slice 4: Reconciliation and operational health

- [ ] Monitor tracking-to-ledger write failures.
- [ ] Monitor identity conflicts and unlinked confirmed leads.
- [ ] Monitor catalog freshness and unmatched product references.
- [ ] Monitor consent coverage and audience suppression.
- [ ] Require current queue, DLQ, policy, approval and alert evidence before activation.
- [x] Record payload-free background-job execution attempts with stable job identity.
- [x] Fail unknown queue job types into retry and DLQ handling.
- [x] Expose admin-only queue success-rate, duration, lag and stale-execution SLOs.
- [x] Add provider-neutral plans, subscriptions and client entitlement overrides.
- [x] Add an immutable, idempotent and payload-minimised usage ledger.
- [x] Enforce Persona Identity and destination entitlements before audience activation.
- [x] Expose the effective tenant-scoped entitlement snapshot to the client portal.
- [x] Add dormant Twilio/Telnyx provider-reference and per-channel routing controls.
- [x] Add an independently gated receptionist profile with industry, knowledge, evaluation, budget and handoff prerequisites.
- [x] Add tenant-scoped external MCP client registration using token hashes and append-only audit.
- [x] Expose fail-closed communications, receptionist and MCP readiness to agency and client portal contexts.

### Slice 5: Campaign optimisation

- [ ] Add persona-by-campaign, creative, landing page, device and product reporting.
- [ ] Add cohort overlap and suppression analysis.
- [ ] Add cost per qualified persona, opportunity and sale.
- [ ] Feed won, lost and sold outcomes into campaign recommendations.
- [ ] Keep recommendation generation separate from provider mutations.

### Slice 6: Provider activation

- [ ] Create provider-specific payload adapters.
- [ ] Add dry-run payload inspection and size reconciliation.
- [ ] Require privacy approval and live-delivery approval from different users.
- [ ] Dispatch through an idempotent outbox with retries and DLQ.
- [ ] Add provider receipt reconciliation and deletion propagation.
- [ ] Roll out one client and one provider at a time.

## Release gates

- Migration is additive and transactionally verified.
- Existing tracking, lead intake, CRM and catalog tests remain green.
- New signal sanitation and cohort-scoring tests pass.
- Production build passes with Node 24.
- Staging pages return 200 and APIs reject unauthenticated requests.
- No provider audience write is possible from this release.
- Production promotion occurs only after CI, deployment and smoke checks pass.
