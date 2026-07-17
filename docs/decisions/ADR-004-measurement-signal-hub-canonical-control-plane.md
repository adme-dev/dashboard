# ADR-004: Make Zero the Measurement Signal Hub Control Plane

## Status

Accepted

## Date

2026-07-17

## Context

Zero already owns client records, lead intake, a native CRM, first-party tracking,
client-portal access, and connected Meta and Google accounts. Measurement rollout
work currently exists on Monday board `18422459929`, while provider consoles and
GTM expose only fragments of delivery readiness. None of those systems can answer,
in one tenant-scoped and auditable place:

- which collection and lifecycle authority applies to a client;
- whether Meta browser, web CAPI, CRM CAPI, Conversion Leads, Google tag enhanced
  conversions, Enhanced Conversions for Leads, or Data Manager is configured;
- which system may mutate each capability;
- which canonical lifecycle event was accepted and why;
- whether a conversion was queued, delivered, retried, skipped, or rejected.

A connected advertising account is not proof that a conversion destination is
ready. Existing provider setups may be owned by GTM, a partner, or a client, and
must not be overwritten merely because Zero can observe them. Monday is a useful
incumbent work board, but runtime configuration in arbitrary board columns would
remain weakly typed, hard to audit, and unsafe to consume in delivery code.

The approved master plan is
[`2026-07-17-measurement-signal-hub-capi-outcomes.md`](../superpowers/plans/2026-07-17-measurement-signal-hub-capi-outcomes.md).
The execution hierarchy is
[`2026-07-17-measurement-signal-hub-execution-backlog.md`](../superpowers/plans/2026-07-17-measurement-signal-hub-execution-backlog.md).

## Decision

### Canonical ownership

Neon-backed Zero services are the canonical source for measurement configuration,
outcome authority, canonical events, delivery state, and audit history.

- KV may contain a derived, versioned, non-secret edge projection. It is never
  authoritative and a cache publication failure cannot roll back Neon truth.
- Meta, Google, GTM, partner, and client systems are observed or delivery systems.
  Their diagnostics become evidence attached to Zero state; they do not replace it.
- The native Zero board becomes the working rollout system after an idempotent
  import and explicit cutover. Monday is read-only history after the final
  reconciliation and is never read by runtime delivery code.
- A dedicated conversion-delivery Worker and Queue will fan canonical events out
  asynchronously. Provider calls never block lead, CRM, or portal mutations.

### Configuration and capability model

Each client has at most one measurement profile. New profiles and destinations
default to `enabled=false` and `environment=test`; existing connected accounts do
not imply a destination or live enablement.

Transport (`collectionTier`) and lifecycle truth (`outcomeAuthority`) remain
independent. Every provider capability has its own status, management origin,
mutation authority, evidence timestamp, and blocker. In particular, Meta web CAPI,
Meta CRM CAPI, and Meta Conversion Leads are separate capabilities, as are Google
tag enhanced conversions, Enhanced Conversions for Leads, and Data Manager.

Secrets are represented only by opaque secret-manager references. Raw access
tokens, webhook secrets, provider payloads, and contact PII are prohibited in
canonical configuration, audit rows, diagnostics, logs, Monday, and task evidence.

### Versioning and mutation

All configuration mutations pass through a typed measurement service.

1. The caller supplies the expected configuration version.
2. The database update scopes by client and expected version and increments the
   version atomically.
3. A zero-row update is a stable `VERSION_CONFLICT` (`409` at HTTP boundaries).
4. The transaction writes a before/after audit record with actor, reason, and the
   resulting version.
5. Only after commit may the service publish a redacted KV projection.
6. KV failure returns committed Neon state plus a cache-health warning; it never
   converts canonical success into data loss or reverts the version.

Direct configuration SQL from routes, UI components, Workers, and importers is not
a supported interface.

### Outcome authority and lifecycle conflicts

The platform-owned event taxonomy begins with `lead_created`, `lead_contacted`,
`lead_qualified`, `lead_won`, `lead_lost`, `purchase`, and allowlisted website
conversions. Provider-specific names are destination mappings, not lifecycle truth.

Authority is deterministic:

| Mode | Final authority | Portal action |
|---|---|---|
| `zero_native` | Linked native CRM opportunity; otherwise the unlinked Zero lead | Disabled, proposal-only, or authoritative according to the profile and user permission |
| `client_webhook` | Valid signed event from the configured client system | Disabled or proposal-only |
| `connector_sync` | Configured connector and its reconciliation watermark | Disabled or proposal-only |
| `manual_import` | Approved internal import | Disabled or proposal-only |

`portalOutcomeMode=authoritative` is valid only with `outcomeAuthority=zero_native`.
The user must also have `can_manage_lead_outcomes=true`. Linked opportunities move
through the shared CRM transition service; unlinked leads move through the shared
lead transition service. Proposal mode records a proposal without changing final
state.

Events are tenant-scoped and deduplicated by source system plus source event ID.
Conflict ordering uses the source `occurredAt`, not arrival time. Terminal outcomes
do not regress automatically. Ambiguous identity, a competing terminal outcome, or
a lower-authority update is rejected into an exception workflow while its attempted
transition remains in immutable history.

### Consent, data minimisation, and retention

Consent is snapshotted on the canonical event. Policy skips are recorded as a
delivery outcome and are not retried as transport failures.

The initial retention policy is:

| Data class | Retention | Notes |
|---|---:|---|
| Configuration and configuration audit | 7 years after supersession/client closure | Identifier-only change history; no secrets or contact PII |
| Lifecycle transition history and canonical events | 395 days | Supports attribution investigation and annual comparison |
| Redacted delivery attempts/diagnostics | 395 days | Provider request ID and error class only |
| Encrypted deferred identifier envelope, if later approved | Maximum 7 days | Separate store/key, explicit expiry, never in general JSON/logs |
| Rejected webhook metadata | 30 days | Hashes, reason and timing only; raw body is discarded |
| Queue/DLQ payload | Operational minimum | Canonical identifiers only; Neon remains replay source |

Deletion jobs must fail closed and emit aggregate audit telemetry. Legal hold is an
explicit, audited exception. Changing these periods requires a new decision record
and data/privacy approval.

### Permissions and live gates

- Internal view: roles already permitted to view clients or media buying, restricted
  to their existing client scope.
- Internal configure/validate: `owner`, `admin`, and explicitly authorised media
  operations roles, again constrained by client access.
- Replay and test delivery: `owner` or `admin`, with reason and audit record.
- Live enablement: two-person approval, fresh destination evidence, consent/privacy
  approval, validated deduplication, and no severity-1/2 blocker.
- Portal mutation: authenticated active client user, matching tenant,
  `can_manage_lead_outcomes=true`, permitted profile mode, and expected version.

Schema and service development may proceed with everything dormant. Provider
delivery cannot go live until the pilot baseline, fresh identifier path, operational
owners, and launch attestations are recorded. Architectural acceptance is therefore
separate from production activation.

### Error taxonomy

Measurement boundaries use stable machine codes:

| Code | HTTP | Meaning |
|---|---:|---|
| `MEASUREMENT_VALIDATION_ERROR` | 422 | Input does not satisfy the typed contract |
| `MEASUREMENT_NOT_FOUND` | 404 | Resource does not exist in the caller's client scope |
| `MEASUREMENT_FORBIDDEN` | 403 | Caller lacks role, client access, or capability authority |
| `MEASUREMENT_VERSION_CONFLICT` | 409 | Expected version is stale |
| `MEASUREMENT_DISABLED` | 409 | Profile/destination/feature is disabled or paused |
| `MEASUREMENT_DUPLICATE` | 200/202 | Idempotent event was already accepted |
| `MEASUREMENT_POLICY_SKIP` | 202 | Consent or configured policy forbids delivery |
| `MEASUREMENT_RATE_LIMITED` | 429 | Boundary rate limit was exceeded |
| `MEASUREMENT_PROVIDER_RETRYABLE` | internal | Provider timeout, `429`, or supported `5xx` |
| `MEASUREMENT_PROVIDER_PERMANENT` | internal | Invalid auth/config/payload; retry waits for change |
| `MEASUREMENT_CACHE_STALE` | 200 with warning | Neon committed; derived cache publication failed |

Public responses never expose database errors, stack traces, provider bodies, secret
references, or whether a different tenant owns an identifier.

## Alternatives Considered

### Keep Monday as the configuration source

Rejected. Board columns do not provide the constraints, transactional versioning,
tenant isolation, secret boundaries, or delivery outbox required for runtime truth.

### Infer readiness from connected Meta/Google accounts

Rejected. Spend/account scopes and conversion-ingestion scopes have different
lifecycles, and an observed externally managed capability is not authority to mutate.

### Call providers synchronously from lead and CRM routes

Rejected. Provider latency and failures would weaken lifecycle writes and create a
database/provider dual-write problem. The outbox plus dedicated delivery worker is
replayable and independently observable.

### Put the entire control plane in KV or Worker state

Rejected. KV remains useful for low-latency hostname resolution, but is unsuitable
as the relational audit, lifecycle, and transaction source.

## Consequences

- Zero becomes able to explain configuration and delivery health without querying
  Monday or treating a provider console as canonical.
- Schema and API work must enforce client scope and optimistic concurrency at the
  database boundary, not only in UI state.
- A cache outage may reduce edge freshness but cannot erase or supersede Neon truth.
- Provider adapters remain blocked until the native outcome/outbox path and safety
  gates are demonstrated.
- The control plane retains minimal operational metadata for defined periods and
  requires a separate approved design before retaining encrypted raw identifiers.

## Verification Scenarios

The implementation must prove these outcomes:

1. A stale update returns `MEASUREMENT_VERSION_CONFLICT` without changing state.
2. A source-event retry returns the existing canonical event.
3. A terminal `won`/`lost` state cannot be silently reversed by a later-arriving,
   lower-authority or older event.
4. A valid identifier owned by another client behaves as not found.
5. An expired or invalid webhook signature is rejected before body processing.
6. Provider `429` records a retryable attempt without changing lifecycle truth.
7. A disabled or paused client creates no provider delivery.
8. A cache publication failure leaves the incremented Neon version readable and
   surfaces a redacted health warning.

## Related

- [`Measurement Signal Hub threat model`](../security/measurement-signal-hub-threat-model.md)
- [`Meta and Google readiness audit`](../superpowers/research/2026-07-17-meta-google-account-readiness-audit.md)
- ADR-003: Use Cloudflare Workflows as the Automation Spine
