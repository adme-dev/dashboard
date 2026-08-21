# Universal Lead Gateway and Knox Activation Design

**Status:** approved by the user on 2026-08-21

## Problem

XeroFlow currently has several useful but separate lead-capture paths:

- a public browser tag that records journeys and form activity;
- a PII-minimised submission-intent bridge;
- authenticated Google and generic website lead webhooks;
- Meta lead ingestion and CSV backfill paths;
- canonical lead intake, routing, CRM promotion, conversion delivery, and health reporting;
- provider-validation tests for downstream measurement destinations.

The missing product boundary is a provider-neutral contract that distinguishes a
browser-observed candidate from a provider-confirmed lead, exposes the health of
every stage, and supports an end-to-end test without allowing synthetic leads to
pollute production operations.

Knox GWM Haval makes the gap concrete. Its XeroFlow browser tag is active and
stores traffic and behavioural events, but the website provider's application-
managed lead request is not connected to a Knox website endpoint. The provider's
own advertising tags can fire from its private success callback while XeroFlow
receives no canonical lead. Knox's Meta instant forms are a separate native
platform source and also require a Meta Lead Ads delivery connection.

## Evidence and constraints

The 90-day production comparison captured on 2026-08-21 was:

| Client | Browser form events | Submission intents | Canonical leads | Browser-linked leads |
|---|---:|---:|---:|---:|
| Knox GWM Haval | 149 | 4 | 0 | 0 |
| South Morang Motor Group | 496 | 11 | 100 | 0 |

South Morang's 100 canonical leads were delivered separately from browser
tracking: 99 through its authenticated website webhook and one through email.
None carried a `browserEventId`. South Morang therefore proves that lead
delivery can be healthy while browser-to-lead reconciliation remains absent; it
does not prove that a generic pixel can authoritatively capture provider-managed
leads.

The web platform imposes hard limits on automatic capture:

- A native `submit` event is not emitted when code calls `form.submit()` and is
  not a success receipt for an application-managed request:
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event
- The `formdata` event can augment a real `FormData` object, but does not cover
  arbitrary JSON requests or cross-origin iframe internals:
  https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects
- A service worker can observe controlled requests only when it is installed
  from the same origin and within scope; a third-party XeroFlow tag cannot
  universally install one on dealer domains:
  https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register
- HubSpot documents that its own automatic non-HubSpot form collector excludes
  JavaScript-bound forms, SPAs, dynamic forms, and iframes, and recommends a
  direct API integration when reliability matters:
  https://knowledge.hubspot.com/forms/use-non-hubspot-forms
- Snowplow's open-source tracker likewise states that automatic form tracking
  depends on the original form event actually firing:
  https://github.com/snowplow/snowplow-javascript-tracker

The design must therefore improve automatic coverage without representing
heuristic browser evidence as a confirmed customer lead.

## Decisions

### 1. A trusted server receipt defines a canonical lead

A browser-only detection is a **lead candidate**. It may create a short-lived,
PII-minimised submission intent, but it must not create a canonical inbox lead,
trigger staff notifications, route customer data, or publish a confirmed
conversion.

A **canonical lead** requires a trusted receipt from one of:

- the XeroFlow first-party lead gateway;
- a provider webhook;
- an authenticated provider API poll;
- a native ad-platform lead webhook or API;
- a controlled import with an auditable source.

This rule prevents validation errors, abandoned forms, button clicks, DOM
changes, or provider UI redesigns from creating false leads.

### 2. XeroFlow capture does not require an external CRM

`capture_only` means that XeroFlow stores and routes canonical leads without
promoting them into the optional XeroFlow CRM opportunity model. The universal
gateway is therefore a lead system of record in its own right. A dealer website
can post directly to XeroFlow even when no external CRM exists.

`full_crm` remains an optional downstream promotion mode. CRM integration is a
consumer of canonical leads, not a prerequisite for capture.

### 3. Use a layered connector model

Every client can enable one or more connector modes behind the same canonical
lead envelope:

1. **First-party gateway:** a controlled website or backend posts the confirmed
   lead directly to XeroFlow.
2. **Provider webhook:** Dealer Studio or another provider posts its confirmed
   lead to XeroFlow.
3. **Provider polling:** XeroFlow retrieves recent leads when webhook delivery is
   unavailable, with cursor state, overlap windows, and provider-ID deduplication.
4. **Native platform:** Meta Lead Ads and Google lead forms use their supported
   webhook/API mechanisms.
5. **Controlled import:** CSV and manual paths retain source provenance.
6. **Browser fallback:** the public tag records a candidate and attribution
   context only.

Provider adapters normalise into one versioned envelope. Provider-specific code
must not leak into lead intake, routing, CRM promotion, or measurement delivery.

### 4. Prefer explicit success signals over page heuristics

For a website integration, the success boundary should call
`window.xf.captureLeadContext()` and publish a named `xf_lead_confirmed`
`dataLayer` event containing non-PII correlation context. Named data-layer events
follow Google's documented integration model:
https://developers.google.com/tag-platform/tag-manager/datalayer

Traditional-form listeners, `formdata` augmentation, known success-page
patterns, and provider-specific DOM/network observations remain fallbacks. Each
fallback records its detection method and confidence. Network monkey-patching
must be opt-in per adapter and must never inspect, copy, or transmit arbitrary
request bodies.

### 5. Use a standard, durable webhook security profile

New XeroFlow-owned webhook producers and relays use the Standard Webhooks header
model:

- `webhook-id` as the immutable idempotency key;
- `webhook-timestamp` with a bounded replay window;
- `webhook-signature` over the exact raw payload;
- per-endpoint secrets with overlapping rotation support;
- constant-time signature comparison;
- JSON payloads with a versioned event type.

Reference: https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md

Existing Google, Meta, and legacy provider authentication remains supported in
provider-specific adapters. Google explicitly requires webhook-key validation,
`lead_id` deduplication, forward-compatible field parsing, and correct retry
status codes:
https://developers.google.com/google-ads/webhook/docs/implementation

## Architecture

```text
Website or native lead source
        |
        +-- browser candidate --------------------------+
        |   no raw PII; journey + correlation only      |
        |                                               v
        +-- trusted receipt --> connector adapter --> canonical lead intake
                                  |                         |
                                  |                         +-- inbox / routing
                                  |                         +-- optional CRM promotion
                                  |                         +-- confirmed conversion
                                  |                         +-- audit + health
                                  v
                         submission-intent reconciliation
```

### Canonical envelope

The existing provider-neutral website schema is the base and will be formalised
as `lead.submitted.v1`:

```ts
interface LeadSubmittedV1 {
  type: 'lead.submitted.v1'
  id: string
  occurredAt: string
  provider: string
  source: 'webhook' | 'meta' | 'google' | 'email' | 'manual' | 'csv'
  clientReference?: string
  form?: { id?: string, name?: string }
  customer?: {
    firstName?: string
    lastName?: string
    fullName?: string
    email?: string
    phone?: string
  }
  vehicle?: {
    stockNumber?: string
    vin?: string
    year?: string | number
    make?: string
    model?: string
    variant?: string
    condition?: string
    price?: string | number
    url?: string
  }
  fields: Record<string, string | number | boolean>
  attribution?: Record<string, string>
  consentDecision: 'granted' | 'denied' | 'unknown'
  test?: { isTest: true, runId: string } | { isTest: false }
}
```

Inbound adapters may retain their current external payloads. Normalisation into
this internal contract occurs before canonical intake. Unknown external fields
are ignored or retained under a size-bounded provider field map; they never
change security or routing semantics.

### Browser candidate contract

The browser tag may send:

- `browser_event_id`;
- anonymous and session identifiers;
- page/form/vehicle references;
- first- and last-touch campaign context;
- consent snapshot;
- normalised one-way email and/or phone fingerprints used only for a bounded
  reconciliation window;
- `test_run_id` when a signed self-test is active.

The public endpoint must not persist raw email, phone, names, messages, finance
answers, arbitrary fields, or provider credentials.

### Connector registry

A client connector record describes:

- connector type and provider;
- active, test, stale, or disabled status;
- supported capabilities: push, poll, browser-correlation, historical backfill;
- authentication reference, never plaintext in portal payloads;
- last successful receipt, last attempted receipt, cursor freshness, and error
  class;
- approved origins and expected form/provider identifiers;
- whether the connector can create canonical leads or candidates only.

Google, Meta, generic website, and future Dealer Studio adapters use this common
health representation even when their authentication mechanisms differ.

### First-party relay mode

For dealer sites whose form backend can be changed, the website posts to a
same-origin or XeroFlow-controlled relay. The relay durably accepts the lead
before asynchronous delivery to provider/CRM destinations. It returns a stable
receipt ID and preserves the provider response separately.

The public browser tag is never placed inline as a required dependency for form
completion. A tracker failure must not block the dealer form.

If the dealer cannot alter its backend or provider configuration, XeroFlow must
not silently substitute a fragile browser proxy. The integration remains
candidate-only until a trusted receipt path is available.

## Signed lead-capture self-test

The Site Tracking/Lead Health UI will expose **Run end-to-end test**.

1. An authorised user creates a run with client, site, connector, reason, and
   expected stages.
2. XeroFlow creates a one-use, origin-bound token that expires after 15 minutes.
3. The dealer page opens in test mode. The tag verifies the token with XeroFlow
   and marks subsequent test evidence with `test_run_id`.
4. The operator uses a documented safe mock identity. A provider-specific mock
   adapter may be used only when its behaviour is verified.
5. XeroFlow records stage evidence:
   - tracker loaded;
   - candidate created;
   - provider success observed;
   - trusted receipt accepted;
   - candidate reconciled;
   - canonical test lead stored;
   - configured destinations validated or deliberately skipped.
6. The portal displays pass, fail, timeout, or skipped for each stage and gives a
   redacted diagnostic.

Test evidence is append-only. Test leads carry both `is_test=true` and
`test_run_id`, are hidden from default inbox and analytics views, do not notify
staff, do not execute normal routing, and do not promote into CRM. Provider test
deliveries use provider-supported test or validate-only modes where available.

## Knox activation

Knox activation is the first rollout and acceptance case.

### Website leads

1. Preserve and verify the current Knox tracking-site installation and allowed
   origins.
2. Provision a Knox first-party website endpoint with its own rotatable secret.
3. Determine the strongest available Dealer Studio path in this order:
   - confirmed lead webhook to XeroFlow;
   - server/API adapter with polling and provider-ID deduplication;
   - controlled website relay that posts to XeroFlow first and then delivers to
     Dealer Studio;
   - explicit provider-success/data-layer bridge plus candidate-only monitoring.
4. Call `captureLeadContext()` at the real success boundary and forward the
   returned `zeroflow_*` values through the trusted receipt.
5. Run the signed self-test and require a canonical `is_test` lead reconciled to
   the browser event before declaring the website integration healthy.
6. Run one authorised live production enquiry only after the synthetic test
   passes, then verify inbox, attribution, routing, and conversion evidence.

### Meta instant forms

1. Confirm the Knox Facebook Page, ad account, forms, and XeroFlow client mapping.
2. Subscribe the approved Meta app/Page to the `leadgen` webhook when
   `leads_retrieval` is available.
3. Use an authenticated Graph API backfill with overlap and Meta lead-ID
   deduplication for missed recent leads.
4. Map all Knox instant-form IDs to the Knox client and expose unmapped forms as
   health issues rather than dropping them.
5. Verify one Meta test lead as `is_test`, then enable normal routing.

Meta instant forms never depend on the website tag because the customer does not
visit the dealer website.

## Reliability and failure handling

- Canonical ingestion is idempotent on provider plus provider lead ID, or the
  Standard Webhooks ID for XeroFlow-owned producers.
- Provider polling uses an overlap window and durable cursor so a transient poll
  failure cannot create a permanent gap.
- Receipt processing writes the canonical lead and conversion outbox state in a
  transaction where existing boundaries permit it.
- Destination delivery remains asynchronous, retryable, and observable. A
  downstream CRM outage cannot reject an already accepted XeroFlow lead.
- Browser APIs are fail-safe and never prevent the website's own submission.
- Request bodies are size limited and validated with Zod. Unknown fields cannot
  select clients, bypass authentication, or change test status.
- Endpoint secrets are per client/connector and support audited rotation.
- Health alerts distinguish tag missing, candidates without receipts, receipts
  without browser correlation, poll cursor stale, authentication failed, and
  destination delivery failed.
- A circuit breaker disables an unhealthy optional adapter without disabling
  the canonical intake path.

## Observability

The portal health view must show, per connector and selected period:

- browser candidates;
- trusted receipts and canonical leads;
- candidate-to-lead reconciliation rate;
- browser attribution coverage;
- latest successful receipt and latest poll cursor;
- duplicate/replayed receipts;
- test-run results;
- delivery and CRM-promotion status;
- explicit remediation guidance.

The hourly health cron alerts only on transitions or sustained breaches. A
client with healthy browser traffic but no receipt connector is reported as
`capture_not_connected`, not `tracking_missing`.

## Security and privacy

- Public tracking and candidate endpoints remain origin-enforced, consent-aware,
  rate-limited, and PII-minimised.
- Canonical PII enters only authenticated server endpoints or controlled imports.
- Provider credentials and signing keys are encrypted/referenced server-side and
  never returned after initial provisioning.
- Self-test tokens grant only test-evidence attribution for one client/site and
  expire after 15 minutes; they cannot read leads or create non-test leads.
- Diagnostics redact customer values, secrets, provider tokens, and raw payloads.
- Server-side URL fetching is not part of the generic envelope. Any future poll
  connector uses fixed provider hosts and must pass SSRF protections.

## Product and UI

The existing tracking analytics health area is extended rather than duplicated.
Nuxt UI v4 components are mandatory. The feature includes:

- connector cards with capability and freshness badges;
- a staged self-test slideover/modal;
- copy-once credential provisioning and rotation confirmations;
- a candidate-versus-confirmed explanation;
- Knox-specific setup status presented through the same universal model.

All form fields use `UFormField`, `UInput`, `USelectMenu`, `UTextarea`, and
`UButton` following the project form conventions. Relevant public feature pages
and navigation are updated in the same implementation.

## Testing strategy

### Contract and security tests

- canonical envelope validation and forward-compatible unknown fields;
- per-connector authentication, replay window, constant-time signature checks,
  and secret rotation;
- tenant isolation, source authority, idempotency, and duplicate delivery;
- public candidate PII minimisation, origin enforcement, consent, and rate limit;
- `is_test`/`test_run_id` containment across inbox, metrics, routing,
  notifications, CRM promotion, and conversions.

### Adapter tests

- Google native webhook fixtures and provider-key validation;
- Meta leadgen webhook plus API backfill overlap/deduplication;
- generic/Standard Webhooks website fixtures;
- polling cursor retry and stale-health transitions;
- traditional form, application-managed success API, and candidate-only browser
  fallback behaviour.

### End-to-end tests

- signed token lifecycle and origin binding;
- stage evidence transitions and timeouts;
- Knox safe Dealer Studio test;
- one authorised Knox production enquiry after test completion;
- monitoring alert when candidates continue but receipts stop.

The repository's committed baseline currently has 36 unrelated failures while
6,363 tests pass. Implementation acceptance uses focused green lead/tracking
tests plus a full-suite comparison that introduces no new failures.

## Rollout

1. Land and reconcile the active session's existing tracker, lead-intent,
   acceptance, reconciliation, and health work.
2. Activate Knox's website endpoint and strongest available Dealer Studio path.
3. Activate and backfill Knox Meta instant forms.
4. Add the connector registry/security profile and signed self-test behind a
   feature flag.
5. Pilot the universal view and self-test on Knox and South Morang.
6. Enable connector health alerts after baseline/backfill so existing gaps do
   not create a notification flood.
7. Roll out client by client, preferring trusted receipts and retaining browser
   heuristics only as candidate evidence.

## Success criteria

- Knox website test produces one canonical `is_test` lead linked to the same
  browser event, with no normal routing or notifications.
- An authorised production Knox enquiry lands once in the XeroFlow inbox with
  first-/last-touch attribution and expected routing.
- Knox Meta instant forms ingest in near real time and recent recoverable leads
  are backfilled without duplicates.
- The portal identifies the exact failed stage within five minutes of a broken
  test and alerts on a sustained receipt outage.
- Sites without a trusted receipt path remain visible as candidate-only and can
  never silently create confirmed conversions.
- Adding a new provider requires an adapter and capability declaration, not
  changes to canonical intake, routing, CRM promotion, or measurement delivery.

## Non-goals

- Treating clicks, DOM success text, or generic form submits as canonical leads.
- Scraping raw PII from arbitrary `fetch`/XHR bodies in the public tracker.
- Installing a cross-origin service worker from the XeroFlow tag.
- Requiring an external CRM before XeroFlow can store a lead.
- Replacing Dealer Studio's customer-facing form UI during the Knox activation.
- Combining Bendigo Kia's Google Ads OAuth/spend connection with this lead-
  capture architecture; that remains a separate operational integration task.

## Existing-work reconciliation gate

The active primary workspace contains substantial uncommitted work, including
the emerging `captureLeadContext`, submission-intent, canonical acceptance,
reconciliation, and health components. Those files are not copied into this
isolated design branch. Before implementation planning is finalised:

1. the owning session must commit or hand off its changes;
2. this branch must rebase onto that committed state;
3. each proposed task must be marked reuse, extend, or missing;
4. no equivalent implementation may be recreated in parallel.
