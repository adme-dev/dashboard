# XeroFlow Persona 360 Tracking Guide

## Purpose

This guide explains how XeroFlow turns consented website, lead, CRM, product,
campaign, and advertising activity into a tenant-scoped customer view.

Persona 360 is not covert fingerprinting and it is not a global pool that lets
one client inspect another client's customers. The live operational contract is
a client-scoped Persona ID supported by auditable identity evidence, consent,
suppression, and activation controls.

## The short version

```text
Website / app / provider / CRM event
                 |
        tenant + schema validation
                 |
       consent and policy snapshot
                 |
       deduplicated event storage
                 |
    anonymous signals + lead matching
                 |
       tenant-scoped Persona profile
                 |
    traits, timelines, cohorts, metrics
                 |
 consent + suppression + client approval
                 |
 approved Google / Meta audience export
                 |
      CRM and campaign outcome feedback
```

## Identity levels

### Anonymous visitor

The tracking script creates first-party anonymous and session identifiers.
These identifiers connect events within the permitted site and client
namespace. They do not identify a real person by themselves.

XeroFlow does not auto-merge people from IP address, user agent, device
characteristics, or behavioural similarity.

### Known Persona

A tenant-scoped Persona is created or resolved when reliable evidence exists,
including:

- A confirmed provider lead ID.
- A shared browser submission ID returned through a provider webhook.
- A verified email or phone associated with a confirmed lead.
- A CRM person or authenticated client-system subject.
- An explicit, audited identity-resolution decision.

### Group or cross-application Persona

Group identity is an optional governed relationship between separate
tenant Personas. It does not replace the tenant records and is not enabled by
default. It requires approved controller relationships, purposes, notices,
consent behavior, access rules, retention, and rollback controls.

### Advertising identity

Google and Meta receive destination-specific normalized and hashed identifiers
only when an audience export is authorized. Internal Persona IDs are not sent
as general-purpose advertising identifiers.

## End-to-end website tracking

### 1. Browser collection

`public/track.js` can record events such as:

- Page views, engagement, scrolling, clicks, phone clicks, and outbound clicks.
- Form starts, submits, abandonment, and field timing.
- Vehicle views, searches, filters, finance interactions, trade-in activity,
  test-drive bookings, wishlists, and video engagement.
- Confirmed `generate_lead` events.

Each event carries a browser-generated `event_id`, anonymous ID, optional
session ID, page and referrer context, timestamp, attribution, and event data.
The browser event ID is the canonical cross-system deduplication key.

Supported attribution includes UTMs, Google click IDs, Meta click IDs, TikTok,
Microsoft, LinkedIn, and email click identifiers.

### 2. Public ingestion

`POST /api/public/track`:

1. Resolves the client and site from a public write key.
2. Rejects oversized or invalid payloads.
3. evaluates the configured origin policy.
4. Snapshots consent at receive time.
5. Hashes the request IP with `TRACKING_IP_SALT` when available.
6. Applies fail-open, layered rate limiting.
7. Deduplicates on `(site_id, event_id)`.
8. Stores the tracking event and appends eligible Persona signals.
9. Promotes eligible confirmed conversions to the measurement outbox.

The endpoint intentionally avoids returning `5xx` responses to browser beacons.
Internal failures are logged while the browser receives a safe acknowledgement.

### 3. Consent snapshot

The dealer-domain consent value is forwarded in the payload because a
cross-origin collector cannot read that first-party cookie directly.

Current regional defaults are:

- EU, EEA, UK, and Switzerland: tracking, analytics, and marketing denied until
  an explicit choice is recorded.
- Australia and other known non-EU regions: essential tracking granted;
  analytics and marketing denied until explicitly granted.
- Missing region and missing consent signal: all categories denied.

Explicit consent always overrides the regional default. GA4 requires analytics
consent. Google Ads, Meta, and TikTok activation require marketing consent.

## Lead confirmation and reconciliation

`form_submit` is an intent signal, not automatically a confirmed lead.

1. The browser records a submission intent with a shared `browser_event_id`.
2. A provider webhook confirms whether the provider accepted the enquiry.
3. Stable provider lead IDs prevent webhook retries from creating duplicate
   canonical leads.
4. The shared browser ID deterministically joins website behavior, attribution,
   the provider lead, Persona, and CRM opportunity.
5. For providers that cannot echo the browser ID, XeroFlow can reconcile a
   unique candidate using keyed email/phone HMAC evidence, time, form, and
   product reference.
6. Ambiguous candidates remain unmatched rather than forcing an unsafe merge.

Email and phone are used to reuse the correct CRM person where unambiguous.
Distinct product or vehicle enquiries remain separate opportunities.

## Persona signal and identity model

The operational Persona system uses:

- `crm_identity_profiles` for tenant-scoped profiles.
- `crm_identity_subject_links` for hashed anonymous/session subject links.
- `crm_identity_evidence` for provenance and confidence.
- `crm_customer_signals` for append-only behavioral and commercial signals.
- `crm_consent_history` for purpose-aware consent evidence.
- `crm_persona_suppression_events` for opt-out and removal controls.
- `crm_identity_resolution_cases` and versioned members for governed conflict,
  merge, and split decisions.
- `crm_persona_metric_snapshots` for cached dashboard projections.

Verified and deterministic evidence may resolve a Persona automatically.
Probabilistic evidence may support diagnostics or a review case, but does not
auto-merge known people. Resolution decisions are versioned and reversible.

## What a Persona can contain

Subject to consent, purpose, and tenant access, the Persona timeline can show:

- Website and product behavior.
- Leads, source provider, forms, and submission history.
- First-touch, last-touch, and campaign attribution.
- CRM person and lifecycle stage.
- Separate opportunities and product or vehicle interests.
- Communication and channel eligibility.
- Identity evidence, conflicts, and reconciliation status.
- Cohort membership, freshness, confidence, and source provenance.

## Cohorts and campaign intelligence

Persona definitions are versioned rules. Membership is derived from the signal
ledger and stored as a time-bounded snapshot rather than a permanent label.

Examples include:

- Active vehicle researchers.
- Repeat visitors with no confirmed lead.
- Leads awaiting contact or qualification.
- Product, make, model, price, or inventory-interest cohorts.
- Won customers to suppress from acquisition.
- Dormant customers eligible for an approved re-engagement purpose.

Metrics are cached for 15 minutes for current periods and up to 24 hours for
historical periods. Cache entries are client- and filter-scoped.

## Google and Meta audience activation

An audience cannot be exported merely because a cohort exists.

The live activation path requires:

1. Client authorization for the destination.
2. An immutable cohort and activation request.
3. Minimum cohort size, defaulting to 1,000.
4. Privacy approval.
5. A second live approval from a different owner or administrator.
6. Current purpose consent and suppression checks for every member.
7. An enabled provider connection with no emergency stop.
8. Destination-specific normalization and SHA-256 hashing.
9. Queued export, reconciliation, removal, expiry, and append-only audit.

Google Customer Match and Meta Custom Audiences are implemented. Provider
match rates are delivery diagnostics; they are not proof that two internal
profiles represent the same person.

## CRM and campaign feedback

Client lead-capture modes decide whether confirmed leads remain analytics-only,
are captured as leads, or are promoted into lightweight/full CRM.

CRM lifecycle events such as contacted, qualified, won, and lost can feed
measurement and campaign reporting. This enables:

- Cost per confirmed or qualified lead.
- Cost per appointment or sale.
- Campaign and creative quality by downstream outcome.
- Suppression of converted or opted-out customers.
- Better Google and Meta optimization signals where consent permits.

## Production tracking controls

Cloudflare Pages project: `agency-dashboard`.

Production audit on 26 July 2026:

| Variable | Production state | Effective behavior |
| --- | --- | --- |
| `TRACKING_RATE_LIMIT_MODE` | Absent | `shadow`: log would-block traffic but allow it |
| `TRACKING_ORIGIN_MODE` | Absent | Per-site policy; mismatch is soft unless `enforce_origin=true` |

Related controls:

| Control | Default | Purpose |
| --- | --- | --- |
| `TRACKING_RATE_LIMIT_KEY_LIMIT` | `600` per window | Per-write-key ceiling |
| `TRACKING_RATE_LIMIT_IP_LIMIT` | `60` per window | Per-IP-hash burst ceiling |
| `TRACKING_RATE_LIMIT_WINDOW_MS` | `10000` | Limiter window |
| `TRACKING_IP_SALT` | No safe default | Peppers IP hashes; should be configured |
| `PERSONA_MIN_AUDIENCE_SIZE` | `1000` | Privacy threshold for activation |

Recommended rollout:

1. Keep rate limiting in `shadow` while reviewing would-block logs.
2. Populate each site's allowed origins.
3. Enable `enforce_origin` per site after observing legitimate traffic.
4. Change rate limiting to `enforce` only after false positives are resolved.
5. Preserve `TRACKING_ORIGIN_MODE=soft` as an emergency global rollback.

## Privacy and security boundaries

- All operational identity lookups are client scoped.
- No covert browser fingerprint is used as a Persona key.
- Raw IP is not stored by the tracking path; only a peppered hash should be
  retained.
- Raw identifiers are not general audience-table fields.
- Consent withdrawal and suppression prevent future activation and enqueue
  removals without deleting required audit evidence.
- Low-confidence or conflicting identity evidence creates review work rather
  than an automatic merge.
- AI and MCP access must carry tenant, purpose, permission, and audit context.
- Cross-client searching and automatic group-level sharing are prohibited.

## Portal and agency surfaces

Client portal:

- `/portal/analytics/audiences`
- `/portal/analytics/identity`
- `/portal/analytics`
- `/portal/crm`

Agency operations:

- Persona metrics and timelines.
- Cohort definitions and snapshots.
- Identity reconciliation cases.
- Provider settings and emergency stops.
- Two-person activation approvals.
- Export operations, failures, retries, and audit.

## Operational troubleshooting

### Website events are missing

Check the write key, active tracking site, request origin, payload validation,
consent snapshot, browser network request, and tracking ingestion logs.

### Submissions remain unmatched

Confirm that the form integration and provider webhook share the same
`browser_event_id`. If the provider cannot echo it, confirm stable email/phone,
form ID, product reference, submission time, and `LEAD_IDENTITY_HMAC_KEY`.
Ambiguous matches are intentionally left for review.

### Audience export is blocked

Check client authorization, marketing consent, suppressions, cohort size,
privacy/live approvals, provider connection, credential health, emergency stop,
and export operation status.

### Dashboard data appears stale

Current Persona snapshots can be cached for 15 minutes. Historical slices may
be cached for 24 hours. Provider exports and campaign-detail retrieval have
their own asynchronous operation and cache state.

## Current scope versus future lakehouse

Live today is the tenant-scoped operational Persona, signal ledger, consent and
suppression control plane, identity reconciliation, campaign intelligence,
cohorts, Google/Meta activation operations, and CRM/measurement links.

The broader 360 lakehouse is the next analytical plane for cross-application
events, point-in-time features, trends, market intelligence, AI, mobile, voice,
and MCP. It must consume versioned identity decisions; it must not independently
guess identity or bypass tenant, consent, and purpose controls.
