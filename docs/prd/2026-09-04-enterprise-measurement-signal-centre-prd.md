# PRD: Enterprise Measurement Signal Centre and TikTok Events API

**Status:** Approved for implementation

**Date:** 4 September 2026

**Pilot client:** Werribee Toyota

**Pilot site:** `werribeetoyota.com.au`

**Owner:** XeroFlow Agency

**Research:** [`2026-09-04-xeroflow-enterprise-server-side-measurement-rd.md`](../research/2026-09-04-xeroflow-enterprise-server-side-measurement-rd.md)

**Architecture:** [`ADR-004`](../decisions/ADR-004-measurement-signal-hub-canonical-control-plane.md)

## 1. Objective

Build an enterprise-grade measurement capability in XeroFlow that captures a
rich first-party website and lifecycle signal stream, governs which signals may
be shared, and delivers consented conversions to TikTok, Meta, Google Ads, and
GA4 through a common control plane.

Werribee Toyota is the first TikTok pilot. The immediate outcome is trustworthy
TikTok Pixel plus Events API 2.0 measurement for vehicle research and confirmed
lead activity. The broader product outcome is an agency Signal Centre where
marketing teams can understand signal quality, delivery health, attribution,
deduplication, and funnel outcomes across providers. Clients receive a simpler,
safe portal view of tracking health and business outcomes.

### Users

- **Media buyer:** configures event mappings, validates provider delivery, and
  diagnoses attribution or match-quality gaps.
- **Account manager:** sees whether a client is measurement-ready and can explain
  blockers and funnel performance without reading provider payloads.
- **Technical operator:** investigates individual event lineage, retries safe
  failures, and manages controlled activation.
- **Client portal user:** sees collection health, funnel outcomes, and
  plain-language issues without access to credentials or personal identifiers.
- **Privacy/approving operator:** reviews consent, data-sharing, and production
  activation evidence.

## 2. Problem statement

The XeroFlow tag currently captures useful Werribee website behaviour, but no
TikTok conversion destination exists. Recent Werribee evidence also shows:

- marketing consent is denied for every sampled event;
- `form_submit` represents an attempted submission rather than a confirmed lead;
- no canonical website lead conversion is being produced;
- `ttclid` is supported by the tag but absent from the recent sample;
- TikTok's `_ttp` browser identifier is not captured; and
- provider health exists at destination level, but the agency lacks a unified
  event explorer and cross-provider signal-quality view.

Connecting an access token alone would therefore create unreliable optimisation
data. XeroFlow must fix collection truth and consent before live delivery.

## 3. Product principles

1. **Capture once, govern centrally.** XeroFlow owns one canonical event and
   provider-neutral history.
2. **Capture broadly, share deliberately.** Behaviour useful for XeroFlow does
   not automatically qualify for advertising delivery.
3. **Confirmed outcomes beat intent.** Form attempts never masquerade as leads.
4. **Consent travels with the event.** Delivery uses the immutable consent
   snapshot from collection time.
5. **Browser and server are complementary.** They reuse the same event identity
   for provider deduplication.
6. **Safe by default.** New profiles and destinations remain disabled and in test
   mode until evidence and approval gates pass.
7. **No PII in the event plane.** Canonical events, queues, logs, diagnostics,
   audit, and portal views never contain raw contact data or credentials.
8. **Explain every outcome.** Each event is captured, rejected, policy-skipped,
   queued, delivered, retried, dead-lettered, or reconciled with a stable reason.

## 4. Scope

### In scope

- A browser-facing XeroFlow consent bridge for explicit CMP choices.
- Capture and persistence of `ttclid` and `_ttp` alongside existing provider
  click/browser identifiers.
- Confirmed lead and booking signals correlated to the originating browser event.
- Versioned canonical event mappings and provider allowlists.
- A native TikTok Events API 2.0 destination and delivery adapter.
- TikTok Pixel/server event-id parity and test-event validation.
- Provider receipt, retry, diagnostic, and match-input coverage reporting.
- An agency Signal Centre with event, destination, and funnel views.
- A redacted client portal measurement summary.
- Consistent vocabulary across TikTok, Meta, Google Data Manager, and GA4.
- Werribee test-mode validation and a controlled production activation runbook.
- Public feature pages describing the shipped capability.

### Out of scope

- Campaign creation, budgets, bidding, creative, or media optimisation strategy.
- Replacing TikTok, Meta, Google Ads, or GA4 reporting systems.
- Sending all behavioural events to every advertising provider.
- General identity resolution or a long-lived customer identity vault.
- Persisting raw IP addresses in the canonical event plane.
- Production credential entry or live activation without separate operator action.
- Retroactively treating historical form attempts as confirmed conversions.

## 5. Functional requirements

### FR-1 — Explicit consent bridge

The public tag must expose a stable method for a site's CMP to set `tracking`,
`analytics`, and `marketing` choices. It must:

- accept strict booleans and add an ISO `updatedAt` timestamp;
- store the existing `_xf_consent` first-party cookie format;
- make the latest state available to subsequent collection requests;
- emit a provider-neutral data-layer update for GTM integrations;
- never silently convert missing or malformed consent into granted; and
- allow a visitor's later choice to supersede the earlier choice.

The server remains the authority for regional defaults and immutable event
snapshots.

### FR-2 — TikTok browser identity

The browser tag must collect `ttclid` from landing URLs and `_ttp` from the
first-party TikTok cookie when present. The validated collection contract and
tracking event store must retain both as bounded attribution fields. XeroFlow
must report coverage without displaying raw values in user-facing analytics.

### FR-3 — Confirmed web conversions

The browser API must support caller-owned event ids and a confirmed-success event
from native or embedded form providers. A confirmed lead must:

- represent a successful submission or authoritative provider webhook;
- correlate to the original form/browser event where possible;
- create exactly one canonical web conversion;
- preserve safe attribution and event context;
- be excluded from delivery when marketing consent is not granted; and
- avoid placing form fields, messages, raw email, or phone in canonical payloads.

### FR-4 — Canonical signal policy

Each destination has versioned mappings from XeroFlow canonical events to
provider events. Mappings are inactive by default. The initial automotive policy
supports:

| XeroFlow event | TikTok | Meta | Google Ads | GA4 |
|---|---|---|---|---|
| `vehicle_view` | `ViewContent` | `ViewContent` | audience policy only | `view_item` |
| `site_search` | `Search` | `Search` | audience policy only | `view_search_results` |
| `phone_contact` | `Contact` | `Contact` | configured conversion | `generate_lead` |
| `lead_created` | `SubmitForm` | `Lead` | configured conversion | `generate_lead` |
| `test_drive_booked` | `Schedule` | `Schedule` | configured conversion | configured event |
| `lead_qualified` | approved CRM event | Conversion Leads | ECL | funnel event |
| `purchase` | `Purchase` | `Purchase` | approved sale outcome | `purchase` |

Scroll, engagement, dead-click, rage-click, and raw form-attempt events remain
first-party analytics unless a later approved policy explicitly adds them.

### FR-5 — TikTok destination configuration

An authorised operator can create a TikTok destination containing:

- TikTok Pixel/Data Source id;
- purpose-scoped credential reference, never the raw token;
- test/live/paused environment;
- `tiktok_pixel` and `tiktok_events_api` capability states;
- event mappings and safe property allowlists; and
- validation evidence, diagnostic status, and last provider receipt.

The existing optimistic concurrency, tenant scoping, change reason, audit, and
two-person activation controls apply unchanged.

### FR-6 — TikTok Events API 2.0 delivery

The worker must map an eligible canonical event to TikTok Events API 2.0 and
include only available, approved fields:

- Pixel/Data Source id, event name, event time, event id, page URL, and context;
- `ttclid`, `_ttp`, user agent, and approved provider-compatible hashed identity;
- value, currency, and non-sensitive vehicle/content identifiers where relevant;
- test-event markers only in test mode; and
- provider receipt identifiers and redacted diagnostic classes.

Retryable HTTP/network failures use bounded retry. Authentication, mapping, and
payload failures are permanent until configuration changes. At-least-once queue
delivery must not create duplicate conversions.

### FR-7 — Agency Signal Centre

Authorised internal users can view:

- collection volume and freshness by client, site, and canonical event;
- attempted versus confirmed conversions;
- consent-granted, denied, unknown, invalid, and policy-skipped counts;
- provider identifier and match-input coverage percentages;
- browser/server pairing and deduplication health;
- destination status, latency, retries, failures, dead-letter counts, and last
  receipt;
- redacted event lineage from capture to provider outcome;
- configuration and activation history; and
- safe replay for eligible retryable/permanent failures after the cause is fixed.

No page may expose raw identity, tokens, complete provider bodies, or internal
database errors.

### FR-8 — Client portal measurement health

An authenticated, tenant-scoped client user can view:

- tag status and last event received;
- visits, vehicle views, confirmed enquiries, qualified leads, and sales;
- destination connection and last successful delivery;
- plain-language blockers and next actions; and
- historical configuration/health changes appropriate for the client.

Replay, credentials, raw identifiers, internal error details, and agency-only
controls remain unavailable.

### FR-9 — Provider-neutral diagnostics

The control plane normalises provider evidence into stable states:

`not_configured`, `validating`, `ready`, `degraded`, `blocked`, and `paused`.

Provider-specific receipt ids and redacted codes remain available internally.
HTTP success alone is insufficient: provider warnings, asynchronous diagnostics,
and downstream observation must be reconciled where the provider supports it.

### FR-10 — Werribee rollout controls

Werribee cannot be enabled live until all of the following are recorded:

- explicit consent is observable and verified;
- confirmed lead/test-drive events pass controlled end-to-end tests;
- TikTok browser and server events share event ids and do not duplicate;
- provider Test Events and diagnostics are healthy;
- privacy and live approvals are fresh for the current config version; and
- there are no severity-1 or severity-2 blockers.

## 6. Non-functional requirements

| Requirement | Initial target |
|---|---:|
| Collection availability | 99.9% monthly |
| Valid event visible in XeroFlow | p95 under 60 seconds |
| Eligible event accepted by provider | p95 under 5 minutes |
| Delivery success excluding policy skips | at least 99.5% |
| Unexplained duplicate conversions | 0 |
| Destination diagnostic refresh | at least hourly |
| Dead-letter acknowledgement | within one business day |
| Canonical/lifecycle and redacted delivery retention | 395 days |
| Optional encrypted matching envelope | maximum 7 days, separately approved |

The public tag must remain best-effort and non-blocking. Provider calls never
block website collection, lead creation, CRM transitions, or portal writes.

## 7. Security, privacy, and governance

- Validate all public payloads with bounded lengths and strict event names.
- Enforce allowed origin and write-key checks before event processing.
- Store only opaque, purpose-scoped credential references in configuration.
- Resolve credentials at the delivery boundary and redact all error output.
- Treat consent denial as a terminal policy skip, not a retryable failure.
- Do not persist raw email, phone, names, form messages, access tokens, provider
  payloads, or raw IP in canonical events, queues, logs, audit, or diagnostics.
- Derive provider SHA-256 identity only from an authorised source, in memory, and
  discard it after request construction.
- Require a privacy impact assessment and client approval before first live use
  or any future short-lived encrypted identifier envelope.
- Apply tenant scope at service/repository boundaries, not only in UI filters.
- Preserve immutable mapping version, consent snapshot, and delivery lineage.

## 8. Reporting and product analytics

Measure adoption and quality using aggregate, non-PII metrics:

- connected/test/live destinations by platform;
- active mappings by canonical event;
- consent coverage and policy-skip rate;
- confirmed conversion rate versus form-attempt count;
- attribution key coverage by platform;
- browser/server pair rate and duplicate rejection count;
- provider acceptance, retry, permanent failure, and diagnostic-warning rates;
- mean time to acknowledge and resolve destination blockers; and
- agency/client use of Signal Centre and portal health pages.

## 9. Rollout

### Gate 0 — trustworthy collection

Ship the consent bridge, TikTok browser identifiers, and confirmed conversion
contract. Validate each Werribee lead path. No provider delivery is enabled.

### Gate 1 — TikTok test destination

Ship destination contracts, migrations, adapter, worker routing, test delivery,
and Events Manager validation. Remain in test mode.

### Gate 2 — enterprise operations

Ship Signal Centre, event lineage, coverage, alerts, provider diagnostics, and
client portal reporting. Align Meta, Google, and GA4 vocabulary.

### Gate 3 — controlled activation

Complete privacy/live approvals, enable a narrow event allowlist, and operate a
seven-day soak period before qualified-lead or sale outcomes are added.

## 10. Tech stack and project structure

- Nuxt 4, Vue 3, TypeScript, Nuxt UI v4, and Zod.
- Nitro APIs and Neon Serverless Postgres through `server/utils/db.ts`.
- Cloudflare Pages, Worker, Queue, dead-letter queue, KV projection, and
  Hyperdrive/Neon connection path already used by Measurement Signal Hub.
- Vitest 4 with happy-dom for the public tag and focused server/worker tests.

```text
public/track.js                         browser collection and consent bridge
server/utils/tracking/                  validation, consent, persistence, promotion
server/utils/measurement/               canonical configuration/control services
server/api/agency/measurement/          internal measurement APIs
server/api/portal/measurement.get.ts    redacted client measurement API
workers/measurement-delivery/src/       provider delivery and diagnostics
app/components/clients/                 destination configuration and provider tests
app/pages/agency/                        agency Signal Centre entry point
app/pages/portal/measurement.vue        client-facing health
server/database/migrations/             additive schema changes
test/public/                             real tag DOM tests
test/server/utils/measurement/           contract/service/repository tests
test/workers/                            delivery adapter/processor tests
docs/                                   PRD, design, plan, runbook, public feature copy
```

## 11. Commands

```bash
# Focused public-tag tests
pnpm vitest run test/public/track-tag.test.ts test/server/utils/tracking/track-schema.test.ts

# Focused measurement contracts and worker tests
pnpm vitest run test/server/utils/measurement test/workers/measurementDeliveryProviders.test.ts test/workers/measurementDeliveryProcessor.test.ts

# Type check
pnpm run typecheck

# Full tests
pnpm run test:run

# Production build
pnpm run build

# Deployment guard; production deployment remains a separate authorised action
pnpm run deploy:check
```

## 12. Code style

Server inputs use strict Zod contracts and stable machine-readable error classes.
Provider adapters receive dependencies explicitly so external requests are fully
testable.

```ts
export async function deliverTikTokEvent(
  input: TikTokDeliveryInput
): Promise<ProviderDeliveryResult> {
  if (!input.delivery.attribution.browserEventId) {
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'missing_tiktok_event_id',
      redactedDiagnostic: 'TikTok delivery requires a browser event ID'
    }
  }

  return sendTikTokRequest(input)
}
```

Use `~~/server/utils/` for Nitro server imports. UI uses Nuxt UI v4 components,
semantic colours, container-aware form grids, and no native form controls.

## 13. Testing strategy

- **Unit tests:** consent parsing, identifier capture, mapping policy, payload
  construction, redaction, retry classification, and health calculations.
- **Integration tests:** destination mutation, tenant scope, optimistic versioning,
  canonical promotion, worker claims/results, and diagnostics persistence.
- **DOM tests:** public tag cookie/API behaviour, data-layer bridge, same event id,
  form/provider success events, and consent suppression.
- **External test mode:** TikTok Test Events, Meta Test Events, Google
  `validateOnly`, and GA4 validation/debug endpoint.
- **Browser verification:** Werribee consent choices, landing-page identifiers,
  form success signals, network payload shape, data-layer parity, and no console
  errors.
- **Regression:** focused tests per task, then typecheck, full suite, build, and
  deployment guard before release.

## 14. Boundaries

### Always

- Default new configuration to disabled/test.
- Use test-first development for behaviour changes.
- Apply migrations immediately after creation and verify their effects.
- Use the shared outbox/queue/delivery model and existing error taxonomy.
- Redact secrets and personal identifiers from every observable surface.
- Update agency/client product documentation and public feature pages.
- Run the project pre-commit battle test before committing.

### Ask first

- Production credential entry, live destination activation, or deployment.
- Retention of raw IP or a short-lived encrypted matching envelope.
- A new dependency, Cloudflare resource, or destructive schema change.
- Any event/property sharing beyond the approved allowlist.

### Never

- Commit credentials or `.env` data.
- Send an unconfirmed form attempt as a lead conversion.
- Infer granted consent from the absence of a choice.
- place raw PII in canonical events, queues, logs, audit, diagnostics, or UI;
- retry a consent policy skip as though it were a network error; or
- activate a destination solely because an advertising account is connected.

## 15. Acceptance criteria

1. Werribee's explicit consent choices appear consistently in browser tags,
   XeroFlow snapshots, and provider policy decisions.
2. A TikTok campaign landing visit retains `ttclid` and `_ttp` when available and
   reports their aggregate coverage.
3. A successful Werribee lead produces one confirmed canonical conversion; a
   failed or abandoned form produces none.
4. TikTok Pixel and Events API test events share event name/id and appear once in
   Events Manager.
5. TikTok delivery remains disabled/live-ineligible until current privacy and
   live approvals pass.
6. TikTok, Meta, Google Ads, and GA4 destinations expose comparable capture,
   policy, delivery, and diagnostic states in XeroFlow.
7. Agency users can trace a redacted event end-to-end and understand every skip
   or failure reason.
8. Client users can see funnel and connection health without credentials,
   personal identifiers, or internal error details.
9. Focused tests, typecheck, full test suite, production build, and deployment
   guard complete successfully before release.
10. Production activation requires an explicit operator action outside code
    deployment.

## 16. External inputs required before live activation

- Werribee's CMP choice/callback contract or approval to install the XeroFlow
  consent component.
- An inventory of Werribee lead forms and authoritative success mechanisms.
- TikTok Pixel/Data Source id and purpose-scoped Events API access token stored in
  the approved secret boundary.
- Client privacy/data-sharing approval and the internal second approver.

These inputs do not block development in disabled/test mode.
