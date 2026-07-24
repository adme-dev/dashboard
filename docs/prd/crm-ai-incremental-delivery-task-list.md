# XeroFlow CRM Incremental Delivery Task List

Status: Execution backlog
Last updated: 2026-07-24
Parent PRD: `docs/prd/crm-ai-customer-platform-prd.md`
Requirements checklist:
`docs/prd/crm-ai-customer-platform-implementation-checklist.md`

## 1. Delivery objective

Implement the CRM, product matching, communications, mobile, AI, billing and
MCP roadmap without disrupting the existing:

- Lead capture pipeline.
- Tracking and attribution pipeline.
- Provider webhooks.
- Client portal.
- Campaign analytics.
- External lead delivery.
- Existing customer workflows.

The delivery strategy is additive. New CRM behavior begins as an observer of
existing events, proves parity in shadow mode, and is enabled for selected
clients only after acceptance.

## 2. Non-disruption rules

Every implementation task must follow these rules:

1. Do not replace the current lead ingestion path in the first release.
2. Do not rename or drop existing tables or columns during foundation work.
3. Use additive, backward-compatible migrations.
4. Put new user-visible behavior behind client-scoped feature flags.
5. Default existing clients to their current behavior.
6. Use idempotent projectors and backfill jobs.
7. Separate canonical lead capture from optional CRM promotion.
8. Preserve existing API response contracts until consumers migrate.
9. Add observability before enabling writes.
10. Roll back by disabling a feature flag, not by deleting production data.
11. Canary with internal users, then one selected client.
12. Require reconciliation evidence before changing the source of truth.

## 3. Release model

### Stage A: dark

- Schema and services exist.
- No customer UI.
- No behavior changes.

### Stage B: shadow

- Existing lead events are projected into CRM records.
- Projection output is compared with the current system.
- CRM records do not drive customer workflows.

### Stage C: read only

- Internal and selected client users can inspect CRM records.
- Existing lead delivery remains authoritative.

### Stage D: assisted write

- Selected users update assignment, tasks and pipeline.
- Existing capture and provider integrations remain unchanged.

### Stage E: operational

- CRM becomes authoritative for enabled workflow domains.
- Every domain has monitoring, rollback and reconciliation.

### Stage F: AI enabled

- AI starts in suggest-only mode.
- Approval-required actions follow.
- Automatic actions require separate client authorization.

## 4. Immediate first ten tasks

These are the recommended next tasks in order.

| Order | ID | Task | Exit condition |
|---:|---|---|---|
| 1 | SAFE-001 | Produce a Graphify-backed architecture map of lead capture, tracking, attribution, webhooks, CRM tables, mobile APIs, dealer feeds, billing and queues. | Current event paths, owners, tables and consumers are documented without changing code. |
| 2 | SAFE-002 | Establish baseline lead and analytics health metrics. | Current lead counts, deduplication, unmatched rate, attribution coverage and webhook failures are measurable. |
| 3 | SAFE-003 | Add client-scoped CRM feature flags and `crm_mode` evaluation. | Existing clients resolve to current behavior; no CRM promotion changes. |
| 4 | SAFE-004 | Define CRM domain and event contracts in an ADR. | Contact, opportunity, activity, product interest and actor boundaries are approved. |
| 5 | SAFE-005 | Define entitlement and usage authorization interfaces. | Paid actions have one server-side preflight contract before providers are integrated. |
| 6 | DATA-001 | Add canonical CRM foundation tables through additive migrations. | Empty contact, opportunity, pipeline, activity and settings tables deploy safely. |
| 7 | DATA-002 | Build an idempotent lead-to-CRM shadow projector. | Existing confirmed leads produce deterministic shadow contacts and opportunities without affecting delivery. |
| 8 | DATA-003 | Build a shadow reconciliation report. | Captured leads, projected contacts, opportunities, duplicates and failures can be compared. |
| 9 | API-001 | Add read-only client-scoped CRM APIs. | Authorized internal users can read shadow contacts, opportunities and timelines. |
| 10 | UI-001 | Add an internal-only read-only CRM workspace. | Internal users can inspect records while all existing workflows remain authoritative. |

Do not start SMS, voice or autonomous AI before these ten tasks pass their
release gates.

## 5. Wave 0: safety envelope and architecture

### SAFE-001: architecture map

Deliverables:

- Graphify query and architecture graph.
- Lead-ingestion sequence diagrams.
- Tracking-to-confirmed-lead sequence.
- Provider webhook inventory.
- Existing CRM schema inventory.
- Dealer feed and product identifier inventory.
- Mobile API inventory.
- Queue and background worker inventory.
- Billing and entitlement inventory.
- Current production feature flags.

Acceptance:

- Every existing lead creation path has one documented entry point.
- Every path identifies its deduplication key.
- Every path identifies its client boundary.
- Existing and proposed sources of truth are explicit.

### SAFE-002: baseline metrics

Deliverables:

- Confirmed leads by source.
- Intent submissions versus confirmed leads.
- Duplicate suppression count.
- Unmatched submission count.
- Attribution coverage.
- CRM promotion attempts and failures.
- External delivery attempts and failures.
- Provider webhook latency and failure.

Acceptance:

- Metrics can be compared before and after every CRM rollout.
- Alerts distinguish existing issues from new regressions.

### SAFE-003: feature controls

Required flags:

- `crm_foundation_enabled`
- `crm_shadow_projection_enabled`
- `crm_read_enabled`
- `crm_write_enabled`
- `product_matching_enabled`
- `communications_enabled`
- `mobile_crm_enabled`
- `automation_enabled`
- `ai_assistant_enabled`
- `ai_phone_receptionist_enabled`
- `ai_phone_outbound_enabled`
- `external_mcp_enabled`

Acceptance:

- Flags are client-scoped and server-enforced.
- Existing clients default to disabled new behavior.
- Super administrators can inspect effective state.
- Disabling a flag stops new behavior without removing data.

### SAFE-004: architecture decisions

Required ADRs:

- CRM domain boundaries.
- Lead-to-CRM projection.
- Durable event and outbox model.
- Tenant ownership and agency access.
- Entitlement and usage authorization.
- Product catalog and inquiry matching.
- Communications provider abstraction.
- External MCP authorization.

### SAFE-005: release dashboard

Deliverables:

- Per-client rollout state.
- Projection health.
- Job failures.
- Reconciliation differences.
- Feature-flag state.
- Provider health.
- Usage anomalies.

## 6. Wave 1: CRM foundation in dark mode

### DATA-001: client CRM settings

- Add `crm_mode`.
- Add pipeline defaults.
- Add business hours.
- Add response SLA settings.
- Add assignment policy placeholder.
- Add AI and communications policy placeholders.

### DATA-002: canonical contacts

- Add contacts.
- Add normalized identifiers.
- Add client-scoped uniqueness rules.
- Add contact tags and custom-field seam.
- Add audit timestamps and actors.

### DATA-003: canonical opportunities

- Add opportunities.
- Add pipeline and stage.
- Add attribution references.
- Add primary and additional product interests.
- Add assignment.
- Add value and outcome fields.

### DATA-004: activities and timeline

- Add immutable activity events.
- Add notes.
- Add task records.
- Add appointment seam.
- Add actor, correlation and causation IDs.

### DATA-005: default pipelines

- Seed canonical categories.
- New.
- Assigned.
- Contacted.
- Qualified.
- Appointment.
- Won.
- Lost.

Acceptance for Wave 1:

- Migrations are additive.
- No existing endpoint changes behavior.
- Tenant isolation tests pass.
- Empty foundation deploys with all flags off.

## 7. Wave 2: shadow lead projection

### PROJ-001: confirmed-lead consumer

- Consume the existing confirmed canonical lead event.
- Resolve the effective CRM mode.
- Exit without projection for capture-only clients.
- Generate deterministic projection idempotency key.

### PROJ-002: contact resolution

- Normalize email and phone.
- Reuse deterministic matches.
- Record uncertain candidates without merging.
- Preserve source lead linkage.

### PROJ-003: opportunity creation

- Create one opportunity for one legitimate enquiry.
- Preserve separate opportunities for separate products or submissions.
- Copy first-touch and last-touch attribution.
- Record source and confirmation method.

### PROJ-004: initial timeline

- Lead intent.
- Provider confirmation.
- Attribution.
- Contact resolution.
- Opportunity creation.
- Product matching.

### PROJ-005: replay and backfill

- Date-bounded backfill.
- Dry-run mode.
- Idempotent replay.
- Progress and error reporting.
- Per-client pause.

### PROJ-006: reconciliation

Compare:

- Confirmed lead count.
- Contact count.
- Opportunity count.
- Duplicate suppression.
- Missing attribution.
- Missing browser event ID.
- Projection failures.

Acceptance for Wave 2:

- Shadow projection does not change current delivery.
- Replaying the same event creates no duplicate records.
- Projection differences are explainable.
- A feature flag stops projection immediately.

## 8. Wave 3: read-only CRM

### API-001: read repositories

- Contact search.
- Contact details.
- Opportunity list.
- Opportunity details.
- Pipeline summary.
- Timeline.
- Product interest.
- Reconciliation state.

### API-002: authorization

- Client user access.
- Agency access grant.
- Role filters.
- Field minimization.
- Audit.

### UI-001: internal CRM workspace

- Contacts.
- Opportunities.
- Pipeline.
- Lead timeline.
- Attribution.
- Product or vehicle card.
- Projection and reconciliation diagnostics.

### UI-002: selected client read-only pilot

- Enable for one selected client.
- Collect data-quality feedback.
- Keep current workflow authoritative.

Acceptance for Wave 3:

- Read-only CRM data matches shadow reconciliation.
- No write endpoint is exposed to the selected client.
- Existing portal routes remain unaffected.

## 9. Wave 4: operational CRM pilot

### WRITE-001: assignments

- Manual assignment.
- Assignment timeline event.
- Permission check.
- Notification seam.

### WRITE-002: pipeline transitions

- Allowed transition rules.
- Canonical stage category.
- Audit.
- Outcome timestamps.

### WRITE-003: tasks and notes

- Create and complete tasks.
- Add notes.
- Due and overdue state.
- Actor audit.

### WRITE-004: SLA

- Time to assignment.
- Time to first response.
- Business-hours calculation.
- Warning and breach events.

### WRITE-005: client pilot

- One internal or low-risk client.
- Daily reconciliation.
- Rollback via `crm_write_enabled`.

Acceptance for Wave 4:

- Disabling writes preserves captured data.
- Existing lead ingestion and delivery remain operational.
- Every mutation is authorized, audited and idempotent.

## 10. Wave 5: product and vehicle matching

### SKU-001: feed audit

- Identify current vehicle feed sources.
- Identify SKU, stock ID, VIN and source IDs.
- Identify update and removal behavior.
- Identify authoritative client mapping.

### SKU-002: canonical catalog

- Product source.
- Product.
- Product identifiers.
- Inventory location.
- Current availability.
- Product snapshots.

### SKU-003: tracking product context

- Capture SKU and stock ID.
- Capture VIN where present.
- Capture product URL.
- Capture structured vehicle metadata.
- Attach browser event ID.

### SKU-004: deterministic matcher

Match in order:

1. Canonical product ID.
2. Client SKU or stock ID.
3. Source product ID.
4. VIN.
5. Canonical URL.
6. Bounded metadata fallback.

### SKU-005: inquiry snapshot

- Preserve title, attributes, price, URL and availability at enquiry.
- Keep current availability separate.
- Retain sold and removed inventory for history.

### SKU-006: reconciliation UI

- Unmatched product identifiers.
- Ambiguous matches.
- Feed freshness.
- Match method and confidence.

Acceptance for Wave 5:

- Exact identifiers never cross client boundaries.
- Feed replay is idempotent.
- Sold inventory remains in historical enquiries.
- Product matching can be disabled independently.

## 11. Wave 6: dealer mobile CRM

### MOB-001: application audit

- Framework and version.
- Current authentication.
- Current environments.
- Existing APIs.
- Push provider.
- Release ownership.

### MOB-002: shared authentication and entitlements

- Secure token storage.
- Device registration.
- Client and role binding.
- Effective feature response.
- Device revocation.

### MOB-003: read-only mobile CRM

- Assigned leads.
- Contact.
- Opportunity.
- Product or vehicle.
- Timeline.
- Tasks.

### MOB-004: push and deep links

- New assignment.
- Customer reply.
- SLA warning.
- Task.
- Appointment.
- AI handoff.

### MOB-005: mobile writes

- Assignment.
- Stage.
- Notes.
- Tasks.
- Appointments.
- Idempotent outbox.

Acceptance for Wave 6:

- Mobile and web display the same canonical state.
- Offline replay applies each mutation once.
- Push payloads contain minimal personal data.

## 12. Wave 7: entitlements, usage and communications

### PAY-001: entitlement evaluator

- Plan entitlements.
- Client overrides.
- Role.
- Subscription state.
- Effective decision and reason.

### PAY-002: usage authorization

- Estimate.
- Spending limit.
- Reservation.
- Provider execution.
- Actual reconciliation.
- Customer price and margin.

### COMMS-001: provider-neutral contracts

- Voice.
- Messaging.
- Number management.
- Webhook normalization.
- Provider health.

### COMMS-002: Twilio adapter

- SMS first.
- Delivery and inbound webhooks.
- Usage.
- Voice evaluation seam.

### COMMS-003: Telnyx adapter

- SMS first.
- Delivery and inbound webhooks.
- Usage.
- Voice evaluation seam.

### COMMS-004: Australian pilot

- Twilio and Telnyx numbers.
- Voice AI latency and quality.
- SMS delivery.
- Actual total cost.
- Support and diagnostics.

Acceptance for Wave 7:

- No paid action bypasses entitlement and usage authorization.
- Capture continues during billing restriction.
- Provider retries do not duplicate messages or usage.
- Provider can be selected per client and channel.

## 13. Wave 8: automation

### AUTO-001: event triggers

- Lead confirmed.
- Assignment changed.
- Stage changed.
- Message received.
- SLA warning.
- Appointment changed.

### AUTO-002: safe actions

- Add tag.
- Create task.
- Notify.
- Assign.
- Move stage.
- Send approved template.

### AUTO-003: execution controls

- Idempotency.
- Delay.
- Business hours.
- Retry.
- Dead letter.
- Pause.
- Audit.

Acceptance for Wave 8:

- Every automation can be paused per client.
- Replays do not duplicate actions.
- Communications still enforce consent and usage.

## 14. Wave 9A: digital AI assistant

### AI-001: agent configuration

- Client knowledge.
- Tone.
- Business hours.
- Qualification.
- Appointments.
- Escalation.
- Tool policy.

### AI-002: tool services

- Contact and opportunity lookup.
- Product availability.
- Task creation.
- Appointment lookup and booking.
- Human handoff.

### AI-003: suggest-only mode

- Summaries.
- Suggested reply.
- Qualification recommendation.
- No automatic mutation.

### AI-004: approval mode

- Human approval request.
- Web approval.
- Mobile approval.
- Audit and expiry.

### AI-005: controlled automatic mode

- Explicit client policy.
- Spending limits.
- Confidence and risk gates.
- Immediate stop and handoff.

Acceptance for Wave 9:

- AI cannot exceed tool policy.
- AI cannot bypass consent or usage.
- Product availability is checked live.
- Every action is attributable and reversible where possible.

## 15. Wave 9B: AI phone receptionist

The phone receptionist is not enabled by Wave 9A. It has a separate feature
flag, provider route, number, budget and release approval.

### PHONE-001: isolated call path

- Dedicated test number.
- Separate inbound receptionist route.
- No changes to existing client numbers.
- Human, voicemail and provider-failure fallback.
- Emergency kill switch.

### PHONE-002: synthetic evaluation

- Greeting.
- Interruption.
- Silence.
- Background noise.
- Product enquiry.
- Unsupported request.
- Human transfer.
- Provider timeout.
- Model timeout.
- Maximum duration.

### PHONE-003: after-hours information pilot

- Inbound only.
- Approved knowledge only.
- No CRM mutation.
- Human or voicemail fallback.
- Call summary for review.

### PHONE-004: consented lead capture

- Confirm caller details.
- Confirm product or vehicle interest.
- Create one idempotent confirmed lead.
- Attach call and attribution context.
- Notify human staff.

### PHONE-005: read-only operational tools

- Product availability.
- Business hours.
- Location.
- Appointment availability.
- Existing enquiry lookup only after identity policy permits it.

### PHONE-006: controlled appointment booking

- Client opt-in.
- Explicit caller confirmation.
- Tool-level approval policy.
- Idempotency.
- Confirmation SMS or email subject to consent.

### PHONE-007: human handoff

- Live transfer.
- Mobile and web notification.
- AI summary.
- Caller context.
- Fallback if no user accepts.

### PHONE-008: cost and safety controls

- Per-call duration cap.
- Concurrent call cap.
- Monthly minute and monetary cap.
- Model and voice limits.
- Recording and transcript retention.
- Abuse and repeated-caller controls.

### PHONE-009: provider pilot

- Twilio ConversationRelay or Media Streams path.
- Telnyx AI Assistant or media-streaming path.
- Australian latency and quality measurements.
- Actual provider cost.
- Transfer and fallback reliability.

Acceptance for Wave 9B:

- General CRM or digital AI flags cannot enable phone AI.
- The pilot uses a separate number.
- Disabling the flag restores human or voicemail routing.
- Provider or model failure never traps the caller.
- No outbound AI call can start.
- Lead creation and appointment booking are idempotent.
- Every paid component is reconciled in the usage ledger.
- Disclosure and recording policy has been approved.

## 16. Wave 10: external MCP access

### MCP-001: protected server

- Remote HTTPS MCP endpoint.
- OAuth resource metadata.
- Audience validation.
- PKCE.
- Scopes.
- Revocation.

### MCP-002: read-only tools

- Contacts.
- Opportunities.
- Tasks.
- Products.
- Analytics.

### MCP-003: low-risk mutations

- Notes.
- Tasks.
- Approval policy.

### MCP-004: controlled mutations

- Assignment.
- Pipeline.
- Appointments.
- Communications.

### MCP-005: compatibility

- ChatGPT.
- Claude.
- Groq.
- Reference MCP client.

Acceptance for Wave 10:

- Tool arguments cannot switch tenant.
- Read grants cannot write.
- Revocation is immediate.
- Paid actions use the same usage authorization as web and mobile.

## 17. Pull request policy

Each pull request should:

- Address one bounded task or vertical slice.
- Name the PRD and checklist IDs.
- Avoid unrelated refactors.
- Include additive migration when required.
- Include feature-flag behavior.
- Include idempotency behavior.
- Include tenant-authorization coverage.
- Include observability.
- Include rollback instructions.
- State which release stage it enables.

Do not combine:

- Schema foundation and customer UI.
- Provider integration and autonomous AI.
- Backfill and source-of-truth cutover.
- Multiple communications providers in one first implementation PR.

## 18. Definition of ready

A task is ready when:

- Requirement and acceptance criterion are identified.
- Current code path and owner are known.
- Tenant boundary is defined.
- Feature flag is defined.
- Migration and rollback approach are defined.
- Observability is defined.
- External provider dependencies are available.

## 19. Definition of done

A task is done when:

- Acceptance criteria pass.
- Existing lead and analytics baselines do not regress.
- Tenant and role checks pass.
- Idempotency is proven where applicable.
- Feature flag can disable the behavior.
- Metrics and errors are visible.
- Documentation and checklist status are updated.
- Production activation is separately approved.

## 20. Recommended first working slice

Build one complete but dark vertical path:

`confirmed lead -> shadow contact -> shadow opportunity -> product interest -> timeline -> reconciliation report`

This slice proves the new CRM data model against real current traffic without
changing what clients see or how leads are delivered. Once parity is
established, expose it read-only before allowing operational writes.
