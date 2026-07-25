# Automotive CRM Reference Architecture R&D

## Reference application

- Repository: `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval`
- Review date: 2026-07-24
- Purpose: identify reusable production patterns for the CRM, AI receptionist, mobile, product/inventory, analytics, communications, and billing platform.

This is an architectural reference, not a code-copy plan. The source product contains mature patterns alongside documented coupling, remediation work, Cloudflare bundle constraints, and implementation-specific assumptions. Every adopted capability should be re-expressed behind the dashboard platform's own tenant, identity, policy, API, event, and entitlement contracts.

## Executive recommendation

Bring across the operational spine, not the monolith:

1. A canonical tenant and location context injected by trusted server code.
2. A canonical CRM model connected to immutable product-interest snapshots.
3. Provider-neutral adapters for inventory, messaging, voice, analytics, calendars, and product feeds.
4. A durable event and delivery system with idempotency, consent gates, retries, dead-letter handling, and reconciliation.
5. Policy-authorized AI tools that cannot choose their own tenant scope.
6. A first-class human handoff lifecycle with ownership, SLA, notifications, acknowledgement, and resolution.
7. A standalone mobile client consuming versioned backend APIs.
8. Entitlement checks, usage reservations, metering, reconciliation, and hard cost controls around every paid capability.
9. An automotive industry package layered on the general CRM rather than automotive assumptions embedded in the core.

## Patterns to adopt

### 1. Trusted tenant context

The reference application resolves dealership context before business logic and filters data by `dealer_id`. Its voice inventory tools deliberately omit `dealerId` and `seller_id` from model-controlled tool schemas, injecting them through trusted runtime context.

Adopt this as a non-negotiable platform rule:

- Resolve `organizationId`, `clientId`, `locationId`, user identity, roles, entitlements, and industry-template version at the request boundary.
- Pass a typed `ExecutionContext` into services, jobs, webhooks, AI tools, and MCP tools.
- Never accept tenant or provider-account scope from an LLM tool argument when it can be derived from authenticated context.
- Apply database policy and service-level filtering as independent controls.
- Include tenant and location scope in every cache key, idempotency key, event, audit record, and realtime channel.

Reference patterns:

- `.planning/codebase/ARCHITECTURE.md`
- `server/voice/tools/inventory.ts`
- `docs/architecture/STOCK_VEHICLES_MULTI_TENANT.md`

### 2. Industry packages over core CRM primitives

The repository's Nuxt layers demonstrate useful domain packaging for SMS, EDM, test drives, call tracking, motor groups, widgets, and platform operations. Our platform should use the same separation concept without importing Nuxt layer coupling.

The CRM core should own:

- People and organizations.
- Leads and enquiries.
- Opportunities and pipeline stages.
- Activities, tasks, notes, consent, ownership, and SLA.
- Conversations and channel identities.
- Product interests and immutable enquiry-time product snapshots.

The automotive package should add:

- Dealership, location, department, and OEM configuration.
- Vehicle feed and seller mapping.
- Stock number, VIN, registration, model, variant, status, location, and price matching.
- Sales, test-drive, trade-in, finance, service, parts, and fleet intents.
- Vehicle-specific routing, qualification, attribution, and reporting.
- Automotive receptionist knowledge and action policies.

This keeps future healthcare, legal, property, trades, hospitality, and professional-services packages possible without schema forks.

### 3. Product and inventory adapter contract

The reference product maps each dealer to an external inventory seller and preserves tenant-scoped caches. This should become a generic product-catalog interface, with automotive as the first adapter.

Required adapter operations:

- `syncProducts(cursor)`
- `getProductByExternalId(externalId)`
- `getProductBySku(sku)`
- `searchProducts(filters)`
- `getAvailability(productId, locationId)`
- `getProductSnapshot(productId)`
- `subscribeToChanges()` where supported

Every lead or opportunity may link to multiple product interests. Store both the live product reference and an immutable snapshot of relevant title, SKU/stock ID, price, URL, image, location, availability, and provider identifiers at enquiry time.

Matching should use this precedence:

1. Signed first-party product ID.
2. Provider product ID.
3. SKU, stock number, VIN, or listing ID.
4. Canonical product URL.
5. Structured form fields.
6. Controlled fuzzy matching with confidence and human review.

Reference patterns:

- `docs/architecture/STOCK_VEHICLES_MULTI_TENANT.md`
- `server/voice/tools/inventory.ts`
- `server/utils/vehicle-inventory-index.ts`
- `server/services/vehicle-chat-inventory.ts`

### 4. Durable event delivery and attribution fan-out

The tracking consumer contains several strong patterns:

- Tenant configuration cached with bounded staleness.
- Separate destination configuration and failure isolation.
- Consent-aware delivery decisions.
- Per-event, per-destination audit rows.
- Idempotent upserts using `(event_id, destination)`.
- Retryable versus permanent failure classification.
- Exponential backoff, queue retry, and intended dead-letter handling.
- Encrypted provider credentials.

Adopt one canonical event envelope for website, provider webhook, CRM, communications, mobile, AI, and product events:

- `eventId`
- `eventType`
- `occurredAt`
- `receivedAt`
- `organizationId`
- `clientId`
- `locationId`
- `actor`
- `subject`
- `correlationId`
- `causationId`
- `browserEventId`
- `providerEventId`
- `idempotencyKey`
- `consentSnapshot`
- `attributionSnapshot`
- `schemaVersion`
- `payload`

Each destination must have an independent delivery state so one broken provider cannot poison unrelated analytics or CRM delivery.

Reference patterns:

- `workers/tracking-consumer/src/dispatch.ts`
- `workers/tracking-consumer/src/tenant-cache.ts`
- `workers/tracking-consumer/src/consent.ts`
- `workers/tracking-consumer/src/audit.ts`

### 5. Human handoff as a stateful workflow

The reference product treats handoff as more than a notification: it creates a handoff record, updates the conversation and enquiry, logs CRM activity, notifies staff through multiple channels, and tracks acknowledgement and completion.

Adopt a provider-neutral handoff state machine:

`requested -> queued -> assigned -> acknowledged -> active -> resolved`

Alternative terminal states:

`cancelled`, `expired`, `failed`, `customer_disconnected`

Each handoff should capture:

- Reason, risk, urgency, detected intent, and policy decision.
- Conversation and concise AI-generated summary.
- Customer, lead, opportunity, product interest, and attribution links.
- Assigned queue and person.
- SLA deadlines and escalation history.
- Notification deliveries and acknowledgements.
- Resolution and CRM lifecycle outcome.

Triggering should not rely only on keyword matching. Combine explicit customer requests, deterministic policies, integration failures, confidence, sentiment, regulated-topic boundaries, SLA, and a versioned classifier.

Reference patterns:

- `server/services/human-handoff-workflow.ts`
- `server/services/ai-handoff.ts`
- `docs/ai-handoff-notification-system.md`

### 6. Knowledge generated from structured client data

The reference application derives searchable dealership knowledge from structured location, hours, contact, warranty, finance, and service settings. This is useful, but generated knowledge must not become an unreviewed source of truth.

Adopt a two-layer knowledge model:

- Authoritative structured facts queried directly at runtime.
- Approved explanatory content indexed for retrieval.

Auto-generated entries should be marked as generated, lower precedence than approved manual policy, attributable to their source fields, and republished when those fields change. Live tools remain authoritative for stock, price, availability, appointments, account status, and customer-specific information.

Reference patterns:

- `server/utils/dealer-knowledge-sync.ts`
- `server/services/knowledge-base-retrieval.ts`
- `server/utils/knowledge-base-vectorization-status.ts`

### 7. Mobile as a separate product surface

The reference mobile application is a separate Ionic/Capacitor codebase using the same backend APIs with a mobile-specific authentication and lifecycle model. That separation is correct.

Our mobile app should share contracts, not web components. Initial mobile scope should include:

- Assigned and unassigned lead queues.
- Atomic lead claim and assignment.
- Pipeline and opportunity updates.
- Customer and product context.
- Call, SMS, email, and note actions.
- AI handoff and receptionist escalation queue.
- Push notifications and deep links.
- Appointment management.
- Communication history.
- Explicit offline state, queued mutations, conflict handling, and secure device storage.

The reference request-generation guard in its lead queue is useful for preventing stale responses from replacing current state. Lead claiming, however, must be atomic server-side rather than optimistic client-only assignment.

Reference patterns:

- `apps/mobile/src/composables/useLeadRouting.ts`
- `apps/mobile/src/composables/usePipeline.ts`
- `apps/mobile/src/services/api.ts`
- `CLAUDE.md` mobile boundaries

### 8. Entitlements, usage caps, and cost evidence

The reference product treats AI and external API use as billable events and includes usage-cap enforcement and cost tracking. Our commercial model needs a stricter reservation and reconciliation flow:

1. Resolve entitlement.
2. Estimate cost and reserve allowance.
3. Deny, degrade, or request approval when limits are exceeded.
4. Execute the provider operation.
5. Record provider usage and platform charge dimensions.
6. Reconcile estimate against actual cost.
7. Release unused reservation or record overage.
8. Alert on anomalies and approaching limits.

Meter at least voice minutes, phone numbers, SMS segments, email, transcription, model tokens, tool calls, storage, product sync volume, tracking events, workflow executions, users, locations, and MCP operations.

Reference patterns:

- `server/services/usage-cap-enforcement.ts`
- `server/services/usage-monitor.ts`
- `shared/voice/usage-audit.ts`
- `shared/voice/usage-reconciliation.ts`
- `docs/features/USAGE_CAP_ENFORCEMENT.md`
- `docs/features/POLAR_COST_TRACKING.md`

### 9. Independently deployable expensive or failure-prone runtimes

The repository moved voice, flow execution, tracking consumption, PDF work, cron processing, and other heavy capabilities into independent Cloudflare Workers. This is a useful containment pattern.

Separate runtimes should be considered for:

- Telephony media and voice agents.
- Event tracking fan-out.
- Workflow execution and delayed jobs.
- Product-feed ingestion and enrichment.
- Bulk communications.
- AI batch processing.
- Webhook ingestion.

Boundaries need signed service requests, scoped secrets, versioned payloads, idempotency, health endpoints, structured observability, deployment ownership, and secret-parity checks.

Reference pattern: `CLAUDE.md` worker extraction and secret-scoping guidance.

## Patterns to adapt rather than copy

### Fire-and-forget inventory publishing

`server/utils/inventory-outbox.ts` publishes realtime changes only after a database operation and may skip publishing when request context is absent. Despite its name, this is not a durable transactional outbox.

Use a real database outbox written in the same transaction as the domain mutation. A worker should claim, publish, retry, and mark rows delivered. Realtime UI notification is a projection, not the source of truth.

### Query- or fallback-selected dealer scope

Public inventory examples allow dealer selection through query or configured fallback. That can be suitable for public catalog browsing, but authenticated CRM, AI, MCP, billing, and communications operations must derive scope from trusted identity and explicit agency impersonation grants.

### Keyword-only handoff detection

Keyword triggers are useful deterministic signals but insufficient for production receptionist safety. They need policy, confidence, state, integration health, and industry-specific escalation evaluation.

### Automatically generated knowledge without approval

Structured-to-text knowledge generation is a useful authoring aid. It must enter the knowledge publication lifecycle rather than becoming immediately authoritative.

### Swallowing every integration error

Some reference services intentionally never throw to protect queues or user experiences. Our implementation must still write durable failure evidence, increment metrics, trigger alerts, and expose degraded state. Silent degradation is not acceptable for leads, consent, billing, bookings, or handoffs.

### Module-scope caches as the only cache

Worker-isolate maps are valuable short-lived accelerators, but they are not shared state and cannot provide cross-instance stampede protection. Use bounded local caches over shared cache/storage with explicit invalidation, freshness metadata, and single-flight or lease behavior for expensive refreshes.

### Monolithic feature growth

The reference monolith is close to its Cloudflare bundle limit and uses build-time stubbing plus extracted Workers. Our platform should establish service and frontend bundle boundaries before CRM, AI, communications, and industry packages accumulate in one deployment.

### Database split without a system-of-record contract

The reference uses Neon for application data and Supabase for vehicle inventory. Multiple stores are acceptable only when ownership, identifiers, freshness, deletion, failure, and reconciliation are explicit. The CRM must never infer product truth from a stale analytics projection.

## Missing safeguards to improve in our implementation

- Use a true transactional outbox rather than post-commit fire-and-forget publishing.
- Make lead claim and queue assignment atomic with conflict responses.
- Use signed webhook envelopes, replay windows, provider-event idempotency, and quarantine queues.
- Introduce schema-versioned events and compatibility policy.
- Centralize consent policy so producers and consumers cannot drift through copied functions.
- Build secret-parity and integration-readiness checks before enabling a worker or destination.
- Add per-tenant circuit breakers and destination-specific kill switches.
- Track knowledge source publication, freshness, citations, and policy decisions.
- Separate provider cost, customer usage, billable quantity, margin, credit, and invoice state.
- Add data export, retention, deletion, legal hold, and sensitive-field controls before broader industry rollout.

## Recommended implementation sequence

### Phase A: Platform contracts

- Define `ExecutionContext`, API error envelope, cursor pagination, idempotency, and event envelope.
- Define canonical person, organization, lead, opportunity, activity, conversation, product interest, product snapshot, consent, attribution, and handoff records.
- Establish tenant and location database policy, agency impersonation grants, and audit requirements.

### Phase B: Durable operations

- Implement inbox/outbox, queue delivery attempts, dead-letter handling, replay, and reconciliation.
- Implement provider adapters and destination-specific health state.
- Implement shared consent and attribution policy services.

### Phase C: Automotive package

- Implement dealer/location/department settings and automotive industry template.
- Implement vehicle-feed adapters, seller mapping, stock/VIN matching, immutable product snapshots, and feed health.
- Add sales, test-drive, trade-in, service, parts, finance, and fleet workflows.
- Preserve product and campaign context through lead, opportunity, handoff, appointment, and sale.

### Phase D: Communications and AI

- Implement unified conversations, channel identities, messaging adapters, receptionist sessions, and human handoff.
- Add approved knowledge publication and deterministic live-data tools.
- Add inbound-only receptionist pilot with dedicated numbers, budgets, recording policy, and fallback.

### Phase E: Mobile operations

- Ship lead queue, atomic claim, pipeline, communication actions, handoffs, appointments, push, and deep links.
- Add secure offline mutation queue and conflict resolution after online workflows stabilize.

### Phase F: Commercial controls

- Implement plan entitlements, usage reservation, provider-cost ledger, pricing ledger, reconciliation, alerts, and invoice integration.
- Enforce limits at every web, mobile, workflow, webhook, AI, MCP, and telephony entry point.

## Adoption decision matrix

| Reference capability | Decision | Dashboard target |
| --- | --- | --- |
| Tenant context and dealer filtering | Adopt and strengthen | Trusted `ExecutionContext` plus database policy |
| Nuxt feature layers | Adapt | Framework-neutral domain modules and APIs |
| External vehicle inventory mapping | Adopt generically | Product adapter plus automotive vehicle adapter |
| Voice inventory tools | Adopt security model | Model cannot provide tenant scope |
| Tracking queue fan-out | Adopt | Canonical event router with independent destinations |
| Consent destination gate | Adopt centrally | One versioned consent policy service |
| Delivery audit UPSERT | Adopt | Durable delivery ledger and replay tooling |
| AI handoff records and notifications | Adopt and strengthen | Stateful SLA-driven handoff workflow |
| Dealer knowledge auto-sync | Adapt | Draft generated knowledge plus approval workflow |
| Mobile codebase separation | Adopt | Shared OpenAPI contracts, separate native client |
| Usage caps and cost events | Adopt and strengthen | Reservation, actuals, margin, reconciliation, paywall |
| Extracted Cloudflare Workers | Adopt selectively | Telephony, events, workflows, feeds, bulk jobs |
| Fire-and-forget inventory outbox | Do not copy | Transactional outbox |
| Query-selected authenticated tenant | Do not copy | Identity-derived scope only |
| Keyword-only AI safety | Do not copy | Industry policy engine and evaluations |
| Monolith bundle workarounds | Avoid | Early deployment and package boundaries |

## Definition of successful reuse

A pattern is successfully brought over only when it is:

- Tenant- and location-safe.
- Provider-neutral.
- API- and event-versioned.
- Idempotent and reconcilable.
- Entitlement- and cost-aware.
- Observable and supportable.
- Compatible with web, mobile, AI, webhook, workflow, and MCP callers.
- Controlled by the industry policy layer where behavior differs by vertical.
- Covered by rollout flags, migration strategy, and a rollback path.
