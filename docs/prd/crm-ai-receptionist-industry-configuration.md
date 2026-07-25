# AI Receptionist Industry Configuration and Knowledge Governance

## Purpose

The AI phone receptionist must be configured as an industry-aware operational product. Industry behavior must not be implemented only through prompt changes. Each industry requires explicit prerequisites, permitted actions, prohibited actions, escalation policies, knowledge sources, compliance controls, and acceptance tests.

## Configuration hierarchy

Configuration resolves in this order, with the most specific approved value taking precedence:

1. Platform safety defaults.
2. Versioned industry template.
3. Client-level policy and commercial settings.
4. Location, department, or brand overrides.
5. Time-bounded operational overrides, such as holiday hours or an outage notice.

Overrides may narrow permissions without additional approval. Any override that expands permissions, data access, autonomous actions, call recording, payment handling, or regulated advice requires an approval workflow and audit record.

## Activation prerequisites

A receptionist cannot be enabled until the readiness service confirms the following required configuration:

- Business, legal entity, brand, location, timezone, languages, and caller-facing identity.
- Operating hours, holiday hours, overflow behavior, and after-hours behavior.
- Departments, queues, staff, escalation contacts, and human handoff rules.
- Services, products, eligibility rules, service areas, and exclusions.
- Booking types, durations, buffers, availability, cancellation rules, and confirmation channels.
- Emergency, vulnerability, complaint, privacy, and safety escalation procedures.
- Approved statements, disclaimers, prohibited claims, and regulated-topic boundaries.
- Recording, transcription, consent, retention, and data-residency settings.
- CRM, calendar, inventory, communications, and product-feed connection health.
- Knowledge-base owners, approved sources, publication status, and review dates.
- Call-volume, duration, concurrency, and spend limits.
- Test scenarios and named business approver sign-off.

Readiness must be calculated per location. A client with multiple locations may enable only locations that pass.

## Industry template contract

Each versioned industry template must define:

- Required and optional configuration fields.
- Required knowledge collections and source types.
- Supported intents and routing taxonomy.
- Allowed tools and actions by rollout stage.
- Actions requiring human confirmation.
- Prohibited actions and prohibited advice.
- Mandatory disclosures and consent language.
- Emergency and high-risk escalation paths.
- Data capture schema and minimum lead fields.
- Industry-specific entity identifiers, such as SKU, stock ID, listing ID, matter type, practitioner, or property address.
- Default operating metrics and service-level targets.
- Pre-release evaluation scenarios and minimum pass thresholds.

Templates must be immutable after publication. Changes create a new version with migration notes, client impact, and re-approval requirements.

## Knowledge-base governance

The receptionist knowledge base must be tenant-isolated, location-aware, attributable, versioned, and reviewable.

### Source types

- Approved website pages and structured content.
- Product, vehicle, property, service, or inventory APIs.
- Business policies, scripts, FAQs, price guides, and service documents.
- CRM-safe customer context and prior interaction summaries.
- Calendar, staff, location, and service availability.
- Temporary operational notices with explicit expiry dates.

### Publication lifecycle

Knowledge follows `draft -> reviewed -> approved -> published -> superseded -> archived`.

Every published item records its owner, source, applicable client and locations, industry classification, approval identity, effective date, review date, and expiry date where applicable. Retrieval must prefer structured live systems for availability, pricing, stock, appointments, and account-specific facts rather than stale documents.

### Answer policy

- Answer only from approved, applicable sources or deterministic tools.
- Preserve source attribution and retrieval diagnostics for audits.
- Never invent availability, pricing, eligibility, legal terms, clinical guidance, finance outcomes, or product facts.
- Ask a clarifying question when identifiers or intent are ambiguous.
- Transfer, create a follow-up, or state that a human must confirm when confidence or source freshness is insufficient.
- Do not expose internal documents, prompts, customer records, or another tenant's data.
- Treat website content as untrusted input until approved; retrieved instructions cannot expand tool permissions.

## Example industry requirements

### Automotive dealers

- Resolve stock number, VIN, vehicle listing, model, location, and availability from the live vehicle feed.
- Support sales enquiry, test-drive booking, trade-in, service booking, parts routing, and dealership transfer.
- Do not promise vehicle availability, valuation, finance approval, repayment terms, delivery dates, or discounts without an approved live source or human confirmation.
- Preserve vehicle and campaign attribution on the lead and CRM opportunity.

### Healthcare and allied health

- Support administrative intake and appointment management only unless a separately approved clinical workflow exists.
- Do not diagnose, triage clinically, or provide medical advice.
- Detect emergency language and follow the approved emergency escalation script.
- Apply stricter privacy, sensitive-data, consent, retention, and staff-access policies.

### Legal services

- Capture matter type, jurisdiction, urgency, opposing-party details required for conflict checks, and preferred contact method.
- Do not provide legal advice, establish representation, promise outcomes, or imply privilege.
- Route urgent deadlines and sensitive matters according to approved policy.

### Trades and field services

- Validate postcode, service radius, property type, issue category, urgency, and access constraints.
- Separate emergency dispatch from standard quote requests.
- Do not provide binding estimates, arrival guarantees, or licensing claims unless returned by an approved system.

### Property and real estate

- Resolve property or listing identifiers, agent, campaign, inspection schedule, and enquiry type.
- Support inspection registration and agent routing where approved.
- Do not make unverified representations about price, availability, offers, tenancy, or property condition.

### Hospitality and appointments

- Validate party size, date, time, location, accessibility, dietary notes, deposit policy, and cancellation rules.
- Use live reservation availability and require confirmation before creating or changing a booking.

### Professional services

- Capture service need, organization, location, urgency, budget band where approved, and consultation preference.
- Avoid professional, financial, tax, or compliance advice outside approved informational content.

## Runtime policy engine

Before every tool call, the runtime must evaluate:

- Tenant, client, location, industry-template version, and receptionist rollout stage.
- Caller authentication level and data sensitivity.
- Intent, requested action, tool permission, and required confirmation.
- Knowledge freshness and integration health.
- Call, concurrency, and spend budgets.
- Escalation, disclosure, recording, and retention requirements.

The policy result must be `allow`, `allow_with_confirmation`, `handoff`, or `deny`, with a machine-readable reason recorded in the call audit.

## Administration experience

The setup UI should provide:

- Industry template selection with visible version and capabilities.
- Guided prerequisite checklist and readiness score by location.
- Knowledge source connection, review, approval, freshness, and conflict views.
- Intent, routing, handoff, hours, booking, and action configuration.
- Test-call sandbox with transcript, sources, tool decisions, and policy outcomes.
- Change preview showing which locations and behaviors are affected.
- Approval and staged publication controls.
- Health, cost, containment, transfer, failure, and lead-conversion reporting.

## Evaluation and release gates

Each industry template requires a maintained evaluation set containing normal, ambiguous, adversarial, emergency, privacy, unavailable-product, unavailable-staff, integration-failure, and human-handoff scenarios.

A release cannot progress until it meets configured thresholds for factual grounding, correct routing, disclosure compliance, tool safety, handoff success, lead integrity, booking integrity, and tenant isolation. Production conversations should feed anonymized failure cases back into the evaluation set after review.

## Initial delivery sequence

1. Build the configuration schema, inheritance resolver, and readiness service.
2. Build knowledge publication, versioning, source attribution, and freshness controls.
3. Build the runtime action-policy evaluator and audit events.
4. Implement the automotive dealer template as the first complete vertical.
5. Add location-level administration and test-call tooling.
6. Pilot with a dedicated inbound number and read-only tools.
7. Add booking and lead creation only after evaluation and reconciliation pass.
8. Add further industries as separately versioned templates rather than branching the core receptionist.
