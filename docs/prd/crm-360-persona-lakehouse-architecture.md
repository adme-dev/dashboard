# 360 Persona Pool and Lakehouse Architecture

## Purpose

Define the shared 360 pool for linked applications, including:

- `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval`
- `/Users/paulgiurin/Documents/GitHub/vehicle-marketplace`
- `/Users/paulgiurin/Documents/Projects/dashboard`
- Future dealer websites, mobile applications, social integrations, communications, receptionist, AI agents, and MCP clients.

The goal is a federated customer-data platform in which each application retains its local Persona and event ownership while a governed central identity control plane and lakehouse provide cross-application customer understanding, attribution, audiences, and activation.

## Core decision

The 360 platform consists of separate planes:

1. Identity control plane.
2. Operational Persona projection.
3. Event ingestion and transport plane.
4. Analytical lakehouse.
5. Trait, feature, and segment computation plane.
6. Activation plane.
7. Governance, privacy, and observability plane.

The lake is not the operational identity database. It does not assign Persona IDs, perform live merges, authorize access, or serve receptionist calls directly.

## Federated identity model

Both automotive applications may keep their existing local Persona IDs, cookies, anonymous IDs, profiles, and audience systems.

The central platform stores mappings:

```text
identity namespace
  -> tenant Persona ID
     -> application ID + local Persona ID
     -> application ID + anonymous ID
     -> CRM person ID
     -> marketplace user/profile ID
     -> dealer-platform identity profile ID
     -> social platform-scoped subject ID
     -> provider lead ID
```

A local Persona ID is not replaced or leaked to another application. The central Persona service returns only the tenant-scoped Persona ID and policy-allowed local mapping.

Applications publish evidence and signals. The identity control plane decides links, conflicts, merges, splits, and namespace access.

## System architecture

```text
Dealer sites / Marketplace / CRM / Mobile / Social / Voice / Providers
                              |
                 Signed event ingestion gateway
                              |
                  Schema + consent validation
                              |
                  Durable queues and DLQ
                    /                     \
          Identity evidence lane      Event lake lane
                  |                         |
        Operational identity graph       Raw zone
                  |                         |
        Persona operational view       Normalized zone
                  |                         |
          Persona APIs and UI       Identity-resolved zone
                                            |
                                  Features and traits zone
                                            |
                                Segment snapshot and metrics
                                            |
                                 Approved activation service
                                            |
                                  Google / Meta / TikTok / CRM
```

## Plane 1: Identity control plane

Recommended operational store: transactional PostgreSQL.

Responsibilities:

- Identity namespaces.
- Tenant and group Persona IDs.
- Application local-subject mappings.
- Encrypted identifiers and matching tokens.
- Identity evidence and resolution decisions.
- Conflicts, candidates, merges, splits, aliases, and rollback history.
- Consent references and suppressions.
- Access control and audit.

Requirements:

- Strong transactions for merge and split.
- Row-level or equivalent tenant isolation.
- Low-latency indexed resolution.
- Idempotent evidence processing.
- Reversible decisions.
- No broad analytical scans in request paths.

## Plane 2: Operational Persona projection

The CRM, receptionist, mobile, AI, and MCP clients need a compact, policy-filtered Persona view.

Example projection:

- Persona ID and resolution state.
- CRM person and active opportunity links.
- Current explicit preferences.
- Current eligible inferred traits.
- Product and vehicle interests.
- Recent interactions and lifecycle summary.
- Communication and channel eligibility.
- Current consent and suppression summary.
- Current segment names visible to the caller.
- Source, confidence, and freshness for every derived field.

This projection is generated from authoritative operational records and lake-derived features. It is not manually edited as the source of truth.

## Plane 3: Event ingestion and transport

Every linked application publishes a common envelope:

```json
{
  "schemaVersion": "persona.event/v1",
  "eventId": "evt_...",
  "eventType": "automotive.vehicle_viewed",
  "applicationId": "vehicle-marketplace",
  "environment": "production",
  "namespaceId": "ns_...",
  "tenantId": "client_...",
  "localPersonaId": "local_persona_...",
  "anonymousId": "anon_...",
  "personaId": "persona_...",
  "correlationId": "corr_...",
  "causationId": "cause_...",
  "browserEventId": "browser_...",
  "providerEventId": "provider_...",
  "consentSnapshotId": "consent_...",
  "purpose": "analytics",
  "occurredAt": "2026-07-24T00:00:00.000Z",
  "receivedAt": "2026-07-24T00:00:01.000Z",
  "payload": {}
}
```

Gateway responsibilities:

- Verify service identity and signature.
- Resolve environment, application, tenant, and namespace.
- Enforce schema registry compatibility.
- Validate event size, time skew, IDs, purpose, and consent reference.
- Reject raw secrets and prohibited PII.
- Assign receipt metadata and payload digest.
- Deduplicate by application, namespace, event ID, and schema contract.
- Route identity evidence separately from analytical events.
- Persist delivery evidence before acknowledgement.

## Plane 4: Analytical lakehouse

### Raw zone

Purpose: immutable source evidence and replay.

Contains:

- Validated event envelope.
- Redacted source payload.
- Receipt, source, schema, digest, consent, and delivery metadata.
- Quarantined records separated from accepted records.

Rules:

- No unrestricted raw email, phone, message body, voice transcript, or provider token.
- Restricted payloads use separate encrypted stores and object-level policy.
- Append-only writes.
- Partition by environment, application, namespace, event date, and event family.
- Retention varies by purpose and source.

### Normalized zone

Purpose: canonical cross-application event schemas.

Examples:

- `customer_interaction`
- `lead_event`
- `crm_lifecycle_event`
- `automotive_product_event`
- `social_engagement_event`
- `communication_event`
- `campaign_touch_event`
- `conversion_event`
- `identity_evidence_event`
- `consent_event`

Normalization preserves source event and raw-object references.

### Identity-resolved zone

Purpose: analytical association with tenant Persona IDs.

Rules:

- Resolution is copied from versioned identity decisions.
- The lake never independently guesses identity.
- Unresolved and candidate events remain available without forced linkage.
- Merge and split events create new projection versions rather than rewriting raw history.
- Queries can reproduce the identity graph as known at a selected point in time.

### Features and traits zone

Purpose: reusable, point-in-time-correct Persona features.

Examples:

- Vehicle makes, models, body types, fuel types, and price ranges of interest.
- Explicit and inferred purchase preferences.
- Recency, frequency, and engagement depth.
- Lead, appointment, qualified, won, and lost history.
- Channel response and communication preference.
- Social engagement and campaign interaction summaries.
- First-touch, last-touch, assist, and channel-overlap attribution.
- Inventory and market alignment.
- Lead velocity, response SLA, and lifecycle progression.

Every feature records:

- Persona and namespace.
- Feature definition and version.
- Window start and end.
- Computed time.
- Source event range.
- Confidence and quality.
- Consent and permitted purposes.
- Expiry.
- Model or rule version.

### Segment and activation zone

Purpose: immutable evidence for audience decisions and provider exports.

Contains:

- Segment definition version.
- Qualification snapshot.
- Entry and exclusion reasons.
- Consent and suppression decision.
- Minimum-size result.
- Destination eligibility.
- Frozen activation membership.
- Export manifest digest.
- Provider operation and removal results.

Raw identifiers do not belong in general segment tables.

## Plane 5: Trait, feature, and segment computation

Computation should support:

- Incremental updates from event streams.
- Scheduled complete rebuilds for reconciliation.
- Point-in-time correctness for attribution and ML.
- Versioned SQL, rules, and model artifacts.
- Data-quality assertions and lineage.
- Backfill without duplicate memberships or activations.
- Merge and split replay.
- Consent withdrawal and deletion recomputation.

Segment membership is a derived result, not a permanent property of a Persona.

## Plane 6: Activation

Activation reads only frozen, approved snapshots.

The activation service:

- Re-evaluates consent and suppression immediately before export.
- Enforces namespace, destination, purpose, minimum cohort, and client ownership.
- Fetches permitted identifiers from the identity vault.
- Applies destination-specific normalization and hashing.
- Uses provider-specific external IDs, never the internal Persona ID directly.
- Stores operation evidence and provider audience IDs.
- Reconciles additions, removals, rejections, expiry, and deletion.
- Supports an immediate client, segment, connection, destination, and platform kill switch.

## Plane 7: Governance and observability

Required governance:

- Data catalog and schema ownership.
- Field-level classification and permitted uses.
- Lineage from source event to feature, segment, activation, and report.
- Tenant and group access policy.
- Consent and notice versions.
- Source licensing and provider terms.
- Retention and deletion policy.
- PIA and launch approval artifacts.
- Data-quality and model governance.

Required observability:

- Event receipt, rejection, quarantine, lag, duplication, and DLQ.
- Schema drift and producer version adoption.
- Identity resolution, candidate, conflict, merge, split, and rollback.
- Raw-to-normalized and normalized-to-feature reconciliation.
- Feature freshness and expiry.
- Segment count changes and threshold failures.
- Activation export, match, rejection, suppression, removal, and expiry.
- Cross-tenant leakage canaries.
- Cost by application, tenant, table, pipeline, query, and activation destination.

## Application responsibilities

### Promotion Knox GWM Haval application

Retains ownership of:

- Local identity profiles and existing local identifiers.
- Dealer-site tracking and local anonymous continuity.
- Local audience UX and dealership workflows.
- Source-specific event correctness.

Publishes:

- Local identity evidence.
- Website and vehicle engagement.
- Confirmed leads and lifecycle events.
- Local audience qualification evidence where approved.
- Merge, split, correction, consent, and deletion changes.

Consumes:

- Tenant Persona mapping.
- Approved Persona summary.
- Group-aware continuity where enabled.
- Segment and suppression results.

### Vehicle marketplace

Retains ownership of:

- Marketplace users and anonymous profiles.
- Vehicle searches, watches, comparisons, and listing interactions.
- Explicit and inferred vehicle-interest signals.
- Marketplace audiences and advertising systems.

Publishes:

- Local identity evidence.
- Product-interest and engagement events.
- Preference signals with provenance and confidence.
- Marketplace lead and conversion events.
- Consent, correction, and deletion changes.

Consumes:

- Tenant Persona mapping where a dealer/client relationship authorizes it.
- Purpose-filtered lifecycle feedback.
- Suppression and activation decisions.

### Dashboard CRM platform

Owns:

- Central identity control plane.
- Canonical CRM people, leads, opportunities, activities, and communication eligibility.
- Cross-application tenant Persona APIs.
- Operational Persona projection.
- Central consent and suppression coordination.
- Lakehouse governance, feature definitions, segments, and activation controls.
- Audit, client administration, access, billing, and usage.

## Storage recommendation

### Initial reliable architecture

- PostgreSQL/Neon for identity control plane and operational Persona projections.
- Durable queues for event transport and replay.
- R2 for immutable, partitioned raw and normalized event objects.
- PostgreSQL materialized projections for initial feature and segment workloads.
- Existing BI/query stack for early reporting.

This can be delivered without making beta lakehouse products operational dependencies.

### Cloudflare lakehouse option

Cloudflare currently documents:

- Pipelines for durable event ingestion, SQL transforms, and exactly-once delivery to R2 as Iceberg, Parquet, or JSON.
- R2 Data Catalog as a managed Apache Iceberg catalog with schema evolution and standard Iceberg REST access.
- R2 SQL as a serverless distributed SQL engine over Iceberg tables in R2 Data Catalog.

Official references:

- https://developers.cloudflare.com/pipelines/
- https://developers.cloudflare.com/r2/data-catalog/
- https://developers.cloudflare.com/r2-sql/

As of the review date, Pipelines is documented as open beta. Introduce it through a replaceable `LakeSink` contract and a non-critical pilot. Do not make live identity resolution, lead capture, consent, suppression, or activation removal dependent on a beta analytical service.

### Suggested progression

1. Queue to R2 immutable JSON with manifests and replay.
2. Write normalized Parquet and establish schema registry and catalog discipline.
3. Pilot Pipelines into Iceberg tables for one non-sensitive event family.
4. Validate delivery, schema evolution, partitioning, compaction, deletion, cost, and R2 SQL query behavior.
5. Expand only after production readiness and fallback are proven.

## PII and sensitive-data separation

The 360 lake should be pseudonymous by default.

Store separately:

- Raw email and phone.
- Address and precise location.
- Voice recordings and transcripts.
- Message and email bodies.
- Social private-message content.
- Government, finance, health, or other sensitive identifiers.
- Provider access tokens.

Lake events reference opaque Persona, content, and consent IDs. Authorized services may join through governed views, not by distributing vault values into analytical tables.

## Retention, deletion, and correction

- Retention is defined per event family, purpose, jurisdiction, tenant, and source.
- Raw replay retention may differ from feature and activation retention.
- Consent withdrawal immediately suppresses activation even when analytical history is retained lawfully.
- Deletion creates a durable deletion request, blocks new ingestion, removes operational identifiers, removes destination memberships, and rewrites or tombstones analytical projections according to storage capability and legal policy.
- Merge and split do not mutate raw events; they create versioned resolution mappings.
- Corrections preserve prior values and effective periods for audit.
- Backup, Iceberg snapshot, compaction, and object-lifecycle behavior must be included in deletion verification.

## Query boundaries

### Operational request paths

Use PostgreSQL projections for:

- CRM page loads.
- Receptionist context.
- Lead resolution.
- Consent and suppression checks.
- AI and MCP authorization.
- Activation authorization.

### Analytical paths

Use the lakehouse for:

- Long-window attribution.
- Cohort and funnel analysis.
- Audience discovery and sizing.
- Feature computation.
- Model training and evaluation.
- Cross-application reconciliation.
- Historical Persona timelines.
- Demand, inventory, campaign, social, and lifecycle analysis.

A slow or unavailable analytical query must not prevent lead capture, calls, messages, appointments, or opt-outs.

## Initial lake tables

- `raw_application_events`
- `event_receipts`
- `quarantined_events`
- `normalized_customer_interactions`
- `normalized_automotive_product_events`
- `normalized_social_engagement_events`
- `normalized_campaign_touch_events`
- `normalized_crm_lifecycle_events`
- `normalized_consent_events`
- `persona_resolution_versions`
- `persona_event_projection`
- `persona_feature_snapshots`
- `segment_membership_snapshots`
- `activation_manifest_snapshots`
- `activation_delivery_results`
- `data_quality_results`
- `deletion_and_correction_evidence`

## Recommended rollout

### Phase 0: Contract alignment

- Inventory local Persona IDs, cookies, identifiers, events, audiences, consent, and retention in all linked applications.
- Approve ownership and namespace mappings.
- Standardize event names, IDs, schemas, purposes, and consent references.

### Phase 1: Shared ingestion

- Add signed application registration and event gateway.
- Publish one non-sensitive event family from each application.
- Store immutable redacted events and receipt evidence.
- Prove replay and DLQ behavior.

### Phase 2: Persona mapping

- Add local-subject mapping and versioned identity resolution.
- Publish known, anonymous, candidate, merge, split, consent, and correction events.
- Build the operational Persona summary.

### Phase 3: Canonical lake zones

- Normalize automotive, website, social, campaign, CRM, and consent events.
- Add data quality, lineage, freshness, and reconciliation.
- Add identity-resolved analytical projections.

### Phase 4: Traits and cohorts

- Add explicit vehicle preferences and lifecycle features.
- Add inferred traits only after provenance, confidence, expiry, and evaluation controls.
- Add segment preview and sizing without activation.

### Phase 5: Controlled activation

- Add frozen snapshots, suppressions, minimum sizes, approvals, isolated identifier export, and removal reconciliation.
- Pilot one client, one segment, one destination, and one purpose.

### Phase 6: Advanced intelligence

- Add multi-touch attribution, cross-channel overlap, lead quality, inventory demand, social engagement, next-best-action, and model features.
- Expose policy-filtered insights to mobile, receptionist, AI, and MCP.

## Definition of success

- Linked applications keep their local Persona systems without shared-table coupling.
- The central control plane can map authorized local Personas into tenant Personas.
- Raw history is immutable, replayable, redacted, and lineage-aware.
- Identity resolution remains transactional and reversible outside the lake.
- Traits and segments are reproducible from versioned source events.
- Consent, suppression, correction, and deletion propagate across applications and activations.
- Cross-client audiences cannot form accidentally.
- Live CRM and receptionist behavior continues during lakehouse outages.
- The platform can explain which events, rules, and consent produced any Persona trait or audience membership.

## Shared industry intelligence plane

The Persona lakehouse may supply privacy-safe aggregates to a separate Industry Intelligence plane. This is not a shared Persona pool and must not expose tenant-scoped identities, event histories, campaign records, or customers.

The intelligence plane combines external trends, marketplace demand, social momentum, inventory pressure, and opted-in portfolio benchmarks. It releases only thresholded cohorts with provenance, methodology, confidence, freshness, and suppression metadata. Crossovers discovered from these aggregates may be activated only against the requesting client's own consented Personas.

Detailed architecture and rollout are defined in `docs/prd/crm-shared-industry-trends-intelligence-rnd.md`.

## Push-pull analytics projections

The portal, agency dashboard, mobile application, AI, and MCP should pull tenant-safe projections rather than scan the Persona lake or synchronously call external providers. First-party behavior, confirmed leads, CRM lifecycle, campaign data, marketplace activity, inventory, and released knowledge signals push into governed planes and produce stable behavioral and commercial read models.

Identity resolution remains client scoped. Shared news, trends, benchmarks, and crossover signals attach through taxonomy, geography, time, and released aggregate features rather than cross-client Persona joins. Activation outcomes return to the lake as a measured feedback loop.

See `docs/prd/crm-360-intelligence-push-pull-analytics.md`.
