# Universal Email Lead Ingestion — PRD and Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Approved direction; ready for implementation

**Date:** 2026-07-29

**Owner:** XeroFlow Agency

**Goal:** Let every client receive leads through multiple dedicated email addresses and route those leads through the existing XeroFlow Leads, CRM, measurement, and destination pipeline without requiring a website integration or Zapier.

**Architecture:** Cloudflare Email Routing receives mail for a dedicated intake domain and invokes a catch-all Worker. After a signed policy lookup, the Worker normalises the transport into a shared bounded parser, applies deterministic ADF/XML/provider extraction, obtains a durable stage reservation, encrypts the raw MIME in R2, and sends a signed safe envelope to Nitro. Nitro re-resolves policy before `acceptLead()`; a five-minute recovery path consumes the same parser and identity if the Worker stops between staging and a terminal outcome.

**Tech Stack:** Nuxt 4, Nitro, Nuxt UI v4, Neon Postgres, Cloudflare Email Routing, Cloudflare Workers, R2 for short-lived quarantine evidence, `postal-mime`, Zod, Workers AI as an optional extraction fallback, Vitest.

**Related documents:**

- `docs/superpowers/specs/2026-04-30-leads-engine-design.md`
- `docs/superpowers/plans/2026-04-30-leads-engine-phase-1a-backend.md`
- `docs/superpowers/plans/2026-04-30-leads-engine-phase-1b-ui.md`
- `docs/superpowers/plans/2026-04-30-leads-engine-phase-1c-ops.md`
- Toyota reference: `/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt/docs/superpowers/specs/2026-07-08-email-lead-ingest-design.md`
- Knox reference: `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval`
- Knox Graphify sources: `graphify-out/wiki/MULTI_TENANT_LEAD_EMAILS_EXPLAINED.md.md`, `graphify-out/wiki/UNIFIED_LEAD_EMAIL_DOMAIN.md.md`, `graphify-out/wiki/2026-04-01-flow-event-dispatcher-design.md.md`, `graphify-out/wiki/identity-resolution.test.ts.md`, and `graphify-out/wiki/20260129_webhook_dead_letter_queue.sql.md`
- Dashboard Graphify sources: `server/utils/leads/intake.ts`, `server/utils/leads/acceptance.ts`, `server/utils/leads/dispatch.ts`, `server/utils/leads/crmPromotion.ts`, `lead_crm_links`, and the saved universal-dealer-adapter query in `graphify-out/memory/`

---

## 1. Executive summary

XeroFlow already replaces the lead-handling portion of Zapier for Google Ads, Meta, generic webhooks, CSV imports, website forms, Podium, and manual entry. It does not yet support providers that can only deliver leads by email, nor clients that prefer forwarding enquiries to an inbox rather than connecting their website.

This product adds a universal email adapter to the existing Leads engine. An agency operator can create several addresses for a client, for example:

```text
carsales-f7k2p9@leads.xeroflow.io
website-q4m8rx@leads.xeroflow.io
facebook-x9r3dk@leads.xeroflow.io
general-n2v6ct@leads.xeroflow.io
```

Each address maps to one client and one stable XeroFlow form identity. Messages sent to that address become canonical leads and run through the same per-form conditions and destinations as native webhook leads.

The first release is an ingestion and extraction product. It may use AI to extract structured data when deterministic parsing is incomplete, but it does not autonomously contact the customer. AI concierge replies, mailbox threading, and two-way Gmail or Outlook synchronisation are separate future products.

---

## 2. Problem

### 2.1 User problem

Some lead providers:

- have no webhook;
- charge for API access;
- only send notification emails;
- send automotive ADF/XML as an attachment;
- expose an API that is impractical for a small client;
- or are used by clients who do not want to install a website tracking/form integration.

Today those leads are copied manually, forwarded through Zapier/Make, or left in a shared inbox. This creates slow response times, duplicate contacts, incomplete attribution, and no reliable audit trail.

### 2.2 Product gap

The Leads page currently promises a Zapier replacement but has no dedicated inbound email source. CRM communications can record email activity, but that is not the same as turning a new-provider notification into a canonical lead.

### 2.3 Why this belongs in Leads

Email is an adapter into the Leads engine, not a second inbox or CRM:

```text
Provider email
  → email endpoint/form identity
  → canonical lead
  → existing lead rules
  → CRM promotion and measurement
  → Slack, email, webhook, Sheets, portal, assignment
```

---

## 3. Goals and non-goals

### 3.1 Goals

- Give each client multiple independently managed inbound lead addresses.
- Support direct customer emails, marketplace notification emails, and ADF/XML attachments.
- Parse common providers deterministically before invoking AI.
- Make parsing provider-extensible through a tested adapter registry rather than a growing conditional handler.
- Preserve phone-only leads without inventing an email address.
- Resolve the client from an opaque recipient token, never from sender claims or a fallback tenant.
- Reuse `acceptLead()` for every successfully extracted lead.
- Preserve per-form routing conditions and destinations.
- Guarantee tenant-safe and retry-safe idempotency.
- Detect likely cross-channel duplicates as reviewable relationships without suppressing a legitimate new enquiry.
- Quarantine ambiguous messages instead of silently creating poor CRM records.
- Expose endpoint health, parse outcomes, failures, and replay actions to agency operators.
- Recover encrypted messages stranded between R2 staging and a terminal ingestion outcome.
- Keep the parsing and canonical-envelope boundary transport-independent so a future trusted Postmark, SendGrid, Mailgun, or other ingress adapter can reuse it without changing lead or CRM logic.
- Avoid retaining raw customer content longer than operationally necessary.
- Document and test production Cloudflare Email Routing setup.

### 3.2 Non-goals

- Running an SMTP server.
- Replacing Gmail, Outlook, or a shared support inbox.
- Two-way mailbox synchronisation or conversation threading.
- Autonomous customer replies.
- AI-generated or inferred contact details.
- General-purpose workflow automation beyond the Leads rules engine.
- Client-managed email endpoints in the first release.
- Parsing arbitrary binary attachments, executing macros, or rendering HTML.
- Migrating the existing board email Worker in the same change.

---

## 4. Users and primary stories

### Agency operator

- As an operator, I can create several email addresses for a client and label each by provider or purpose.
- As an operator, I can copy an address into Carsales, a form plugin, or a forwarding rule.
- As an operator, I can map an address to a stable form identity and configure the existing destinations and filters.
- As an operator, I can apply an optional routing preset that configures existing lead destinations while CRM ownership continues to follow the client's established governance.
- As an operator, I can disable or rotate an address without deleting its history.
- As an operator, I can see whether messages were accepted, duplicated, quarantined, or failed.
- As an operator, I can set an expected message cadence and distinguish a genuinely silent endpoint from a naturally low-volume one.
- As an operator, I can see when a lead may match a recent lead from another channel without either lead being discarded.
- As an operator, I can safely replay a quarantined message after correcting its endpoint configuration.

### Client sales user

- As a client user, I see email-originated leads in the same portal Leads and CRM experience as other leads.
- As a client user, I can identify the original provider and enquiry type.
- As a client user, I am not shown raw transport details or another client's data.

### Platform operator

- As a platform operator, I can detect unusual failure rates and disabled or misconfigured addresses.
- As a platform operator, I can automatically recover or surface any staged message that never reached a terminal state.
- As a platform operator, I can trace one message through Worker receipt, extraction, canonical lead creation, routing, and CRM promotion without logging raw PII.

---

## 5. Product decisions

| Decision | Selected approach | Reason |
|---|---|---|
| Mail transport | Cloudflare Email Routing → catch-all Worker | No SMTP infrastructure; already on Cloudflare |
| Transport boundary | Normalised inbound-message adapter → shared parser → versioned canonical envelope | Cloudflare is the v1 transport, while future trusted transports reuse the same parsing and business boundary |
| Address routing | Readable label plus opaque random token | Operator-friendly without trusting a client slug |
| Tenant authority | Database endpoint record resolved by opaque token | No environment fallback or sender-controlled tenant |
| Persistence boundary | Worker calls a signed internal Nitro endpoint | The Worker never opens Neon or duplicates business logic |
| Parsing order | ADF/XML → registered provider adapter → generic labels → optional AI | Deterministic, explainable, extensible, lower cost |
| Canonical ingestion | Existing `acceptLead()` | Retains rules, CRM, measurement, consent, notifications |
| Deduplication | Endpoint-scoped SHA-256 of provider ID, then Message-ID, then stable content identity | Safe across clients and provider retries without persisting raw identifiers |
| Cross-channel similarity | Link a possible duplicate after canonical acceptance; never suppress it | A person can legitimately enquire through several channels while operators still need one reviewable identity trail |
| Assignment | Endpoint presets configure existing lead-rule destinations; CRM promotion continues to use existing assignment governance | Avoids an inconsistent email-only owner engine |
| Uncertain results | Quarantine | Prevents fabricated or misrouted CRM records |
| Raw content | Stage encrypted MIME immediately before canonical ingestion; delete on accepted/duplicate, retain failed/quarantined MIME for at most 7 days | Prevents loss on downstream failure while minimising privacy exposure |
| Stranded handoff | Scheduled recovery scans non-terminal staged ingestions and retries the same canonical identity | Prevents unexplained loss when Worker execution ends after R2 staging |
| AI | Opt-in fallback; schema constrained; extraction only | No autonomous decisions or customer communication |
| Reply automation | Deferred | Requires consent, suppression, threading, and human-control design |

---

## 6. User experience

### 6.1 Leads navigation

The agency Leads page gains an `Email addresses` tab:

```text
Leads
├── Inbox
├── Form rules
└── Email addresses
```

The tab contains:

- client filter;
- status filter;
- address, label, provider, form, last message, and health columns;
- `Create address` action;
- copy-address action;
- enable/disable action;
- details slideover with recent ingestion outcomes;
- link to edit the associated form rule.

### 6.2 Create/edit address form

Before implementing this form, the implementer must invoke the project-required `frontend-design` skill.

Fields:

- Client — required `USelectMenu`.
- Label — required `UInput`, e.g. `Carsales`.
- Address prefix — optional `UInput`, normalised to lowercase ASCII; random token is generated server-side.
- Expected provider — optional `USelectMenu`.
- Form name — required `UInput`.
- Form ID — server-generated as `email_endpoint:<endpoint-uuid>`, immutable, and shown only in advanced details.
- Parser mode — `Auto`, `ADF/XML`, or `Generic labelled fields`.
- AI fallback — off by default; available only when platform configuration permits it.
- Allowed sender domains — optional tag input. Empty means any sender.
- Expected cadence — `No expectation`, `Hourly`, `Daily`, `Weekly`, or a custom maximum-silence duration; used only for health alerts.
- First-response SLA — optional duration used to alert on accepted, uncontacted leads; it does not change lead status automatically.
- Routing preset — optional `USelectMenu` that can add existing portal/notification/assignment destinations to the associated form rule; it never stores owners on the email endpoint.
- Raw quarantine retention — fixed at seven days in v1 and explained as help text.

Paired fields use `grid grid-cols-2 gap-4`; every field uses `UFormField`; mobile collapses to one column.

### 6.3 Address format

```text
<normalised-label>-<opaque-token>@leads.xeroflow.io
```

Constraints:

- label portion: 1–32 characters after normalisation;
- token: 10 lowercase Crockford Base32 characters generated from cryptographic randomness;
- full local part: no more than 64 characters;
- uniqueness is enforced on the opaque token and complete address;
- renaming a label does not mutate an address that has already received mail;
- address rotation creates a new token and retires the old address after a configurable 24-hour grace period.

The token, not the readable prefix, is authoritative.

### 6.4 Inbox and CRM presentation

Email-originated leads display:

- source badge: `Email`;
- provider badge when known;
- endpoint/form name;
- received timestamp;
- extracted customer contact data;
- original enquiry/message as a sanitised text field;
- extraction mode and confidence in agency-only detail;
- a non-blocking `Possible duplicate` indicator when the same tenant identity has a recent lead from another channel;
- no raw HTML;
- no raw transport headers in the client portal.

---

## 7. Functional requirements

### 7.1 Endpoint management

- **FR-001:** Owners and users with `MEDIA_BUYING` permission can list email endpoints.
- **FR-002:** Endpoint API responses are tenant/client scoped and never expose another client's opaque token to portal users.
- **FR-003:** Operators can create multiple active endpoints per client.
- **FR-004:** Creating an endpoint also creates/upserts `lead_form_metadata` for source `email` using immutable form ID `email_endpoint:<endpoint-uuid>`, preventing cross-client collisions under the existing global `(source, form_id)` uniqueness rule.
- **FR-005:** An endpoint can be disabled without deleting its history.
- **FR-006:** An address can be rotated with a 24-hour grace period.
- **FR-007:** Deletion is soft retirement; previously accepted leads and audits remain.
- **FR-008:** A client in `analytics_only` mode cannot create canonical leads.
- **FR-008A:** Operators can configure an expected maximum-silence duration per endpoint. A null value means the endpoint is intentionally unmonitored for inactivity.
- **FR-008B:** Endpoint creation can optionally apply an idempotent routing preset to the associated `lead_form_rules` and `lead_rule_destinations`; endpoint rows never become a second assignment authority.

### 7.2 Message receipt

- **FR-009:** The Worker rejects messages larger than 2 MiB before parsing.
- **FR-010:** MIME parsing caps header size at 64 KiB and nesting depth at 20.
- **FR-011:** Only plain text, HTML-to-text, and XML/ADF attachments participate in extraction.
- **FR-012:** XML/ADF attachments are individually capped at 256 KiB.
- **FR-013:** Scripts, styles, remote resources, and active attachment content are never executed or fetched.
- **FR-014:** Unknown or disabled endpoint tokens are rejected and counted through safe aggregate metrics without revealing whether a client exists or retaining their raw MIME.
- **FR-015:** Optional sender-domain restrictions are applied after normalising the RFC address domain.
- **FR-015A:** Cloudflare Email Routing is the only enabled v1 ingress transport, but it must normalise into a transport-neutral `NormalizedInboundEmail` contract before MIME/provider parsing.
- **FR-015B:** Adding a future ingress transport requires its own authenticated adapter and conformance tests; it cannot bypass endpoint policy resolution, content limits, HMAC-protected canonical ingestion, idempotency, or `acceptLead()`.

### 7.3 Extraction

- **FR-016:** ADF/XML parsing has priority over all other parsers.
- **FR-017:** Known-provider classification supports at minimum Carsales, AutoTrader, CarsGuide, Drive, Gumtree, Meta/Facebook, Instagram, TikTok, Google, and a generic provider.
- **FR-017A:** Each known provider implements a side-effect-free `EmailProviderAdapter` contract with stable ID, deterministic match evidence, extraction, confidence, and field provenance. The registry owns priority and rejects duplicate adapter IDs.
- **FR-017B:** Provider adapters cannot perform network requests, select a tenant, mutate persistence, invoke AI, or overwrite an already accepted higher-priority deterministic field.
- **FR-018:** Generic extraction recognises labelled name, first name, last name, email, phone/mobile, message/comments, lead/enquiry ID, vehicle year/make/model/stock, campaign, and form fields.
- **FR-019:** Provider relay `From` addresses are never used as the customer's email unless the message is classified as a direct-customer email.
- **FR-020:** A lead is acceptable with a truthful phone number and no email address.
- **FR-021:** Extraction must not invent missing values.
- **FR-022:** Reply chains and common signatures are removed from the customer message without changing structured fields.
- **FR-023:** Every extracted field records provenance (`subject`, `body`, `adf`, `attachment`, or `ai`) and confidence.

### 7.4 AI fallback

- **FR-024:** AI is disabled by default per endpoint.
- **FR-025:** AI runs only after deterministic extraction and only when required fields remain ambiguous or missing.
- **FR-026:** Email content is untrusted data in the AI prompt and cannot issue tools or instructions.
- **FR-027:** Output is accepted only through a strict Zod schema.
- **FR-028:** AI cannot replace a deterministic value with a conflicting value unless the result is quarantined for review.
- **FR-029:** AI output containing an email or phone absent from the source evidence is rejected.
- **FR-030:** Model/provider, prompt version, latency, confidence, and outcome are logged without raw content.
- **FR-031:** AI timeouts fall back to deterministic output or quarantine; they never drop the message.

### 7.5 Canonical lead creation

- **FR-032:** Successful extraction calls `acceptLead()` exactly once per unique endpoint/provider event.
- **FR-033:** `source` is `email`.
- **FR-034:** `form_id` and `form_name` come from the endpoint, not the sender.
- **FR-035:** `field_data` uses existing canonical keys such as `first_name`, `last_name`, `full_name`, `email`, `phone`, `message`, and vehicle fields.
- **FR-036:** Attribution records `utm_source`, `utm_medium`, provider, endpoint ID, parser, confidence band, and transport `email`.
- **FR-037:** `utm_medium` is `classifieds` for recognised automotive marketplaces, `paid-social` for social lead notifications, `cpc` for Google lead notifications, and `lead_ingest` for generic email.
- **FR-038:** Consent is `unknown` unless the deterministic source payload explicitly supplies a supported consent signal.
- **FR-039:** Existing lead capture modes govern CRM promotion exactly as they do for webhook leads.
- **FR-040:** Existing form rules, filters, delays, destinations, notifications, measurement events, and client portal visibility execute unchanged.
- **FR-040A:** CRM activity and opportunity fallback copy is source-aware. Email leads use `Email lead received` or a provider-specific equivalent and must never be labelled as a website lead unless the endpoint is explicitly a website-email endpoint.
- **FR-040B:** Email setup presets may create or update existing form-rule destinations, including `assign_user`; lightweight/full CRM assignment continues to use existing CRM governance (`single`, `round_robin`, `priority`, or `load_balanced`) rather than an email-specific assignment index.
- **FR-040C:** Applying the same routing preset twice produces no duplicate destinations and never overwrites operator-customised conditions without explicit confirmation.

### 7.6 Idempotency

- **FR-041:** External identity priority is provider lead/enquiry ID → normalised Message-ID → stable content fingerprint; the selected identity is SHA-256 hashed before it leaves the Worker.
- **FR-042:** Idempotency scope includes the endpoint ID so identical provider IDs in different clients remain independent.
- **FR-043:** Canonical `source_lead_id` is `email:<endpoint-id>:<external-id-hash>`; raw provider IDs and Message-IDs are not persisted.
- **FR-044:** Worker retries and Nitro retries return an accepted duplicate outcome without creating another lead or delivery.
- **FR-045:** Rotation grace does not produce duplicates when old and new addresses receive the same Message-ID.
- **FR-045A:** Transport idempotency and cross-channel similarity are separate decisions: an identical endpoint event is suppressed, while a newly accepted event matching an existing tenant identity is retained and marked as a possible duplicate.
- **FR-045B:** After acceptance, the service uses existing HMAC identity fingerprints and `crm_lead_identity_links` to find recent same-client leads by email and/or phone. It persists only the related lead ID, match basis, confidence, and window—never the raw identity value.
- **FR-045C:** Possible-duplicate detection is advisory and non-fatal. Failure to calculate it never rolls back an accepted lead, and no cross-client candidate may be returned.

### 7.7 Quarantine and replay

- **FR-046:** Messages for a resolved endpoint are quarantined for no contact information, conflicting deterministic fields, unsafe payload, low AI confidence, or transient downstream failure. Unknown recipients are rejected without raw retention.
- **FR-047:** Raw MIME is encrypted and staged in R2 immediately before the canonical ingestion request, then deleted as soon as Nitro returns an accepted or duplicate outcome.
- **FR-047A:** Before writing R2 bytes, the Worker obtains a signed stage reservation for the endpoint-scoped external identity. A retry of a non-terminal reservation reuses its ingestion ID and object key; a terminal duplicate never creates another object.
- **FR-048:** Failed or quarantined staged MIME remains encrypted in R2 and expires after seven days.
- **FR-049:** The database stores only the R2 object key, expiry, safe metadata, field-presence flags, hashes, and failure reason.
- **FR-050:** Replay is owner/admin only, audited, and reuses the original idempotency identity.
- **FR-051:** Replay cannot bypass a disabled endpoint or sender-domain restriction.
- **FR-051A:** Every staged object has a corresponding ingestion row before canonical handoff, with an attempt count, next-attempt time, and terminal timestamp.
- **FR-051B:** A scheduled recovery job claims retryable `received` or `failed` ingestions using database locking, rechecks endpoint policy, and replays the same external identity with bounded exponential backoff.
- **FR-051C:** Recovery gives up after five canonical handoff attempts or seven days, whichever occurs first, then leaves the message quarantined for operator review until lifecycle deletion.
- **FR-051D:** Recovery, manual replay, and the original Worker delivery share one idempotency identity and can never create multiple canonical leads or duplicate downstream deliveries.
- **FR-051E:** Cleanup deletes any residual staged object for an already-terminal accepted or duplicate ingestion, covering a Worker termination after Nitro commits but before the immediate R2 delete.

### 7.8 Operations

- **FR-052:** Structured logs contain correlation ID, endpoint ID, client ID after resolution, provider, parser, status, duration, and error class.
- **FR-053:** Logs never contain raw bodies, subjects, customer email addresses, phone numbers, names, or attachment contents.
- **FR-054:** Health reports include accepted, duplicate, quarantined, and failed counts plus p50/p95 processing latency.
- **FR-055:** Alert when a previously healthy endpoint has five consecutive failures or a 15-minute failure rate above 20% with at least ten messages.
- **FR-056:** Alert on a sudden unknown-recipient spike, signature failures, R2 retention failures, or AI schema rejection spikes.
- **FR-057:** Alert on endpoint silence only when `expected_max_silence_hours` is configured and the elapsed time since activation or last receipt exceeds it; never treat every seven-day gap as unhealthy.
- **FR-058:** Health reports include unassigned accepted leads, leads past the configured first-response SLA, possible-duplicate counts, orphan-recovery attempts, oldest non-terminal ingestion age, and exhausted recoveries.
- **FR-059:** Stage-reservation reconciliation includes every reserved message exactly once and proves `reserved_total = accepted + duplicate + quarantined + terminal_failed + non_terminal` for the selected window. Pre-policy and policy-denied receipts remain separate aggregate transport metrics.

---

## 8. Success metrics and service levels

### Launch acceptance

- 100% of supported fixture emails produce the expected canonical fields.
- 100% of registered provider adapters pass the shared conformance suite.
- 0 cross-client routing results across tenant isolation tests.
- 0 duplicate leads across retry and replay tests.
- 0 legitimate cross-channel submissions suppressed by similarity detection.
- 100% of intentionally orphaned staged-message fixtures reach a terminal state through recovery.
- 0 raw PII matches in structured logs and ingestion evidence tests.
- Existing Google, Meta, webhook, CSV, website, Podium, and manual intake tests remain green.

### Production targets

| Metric | Target |
|---|---:|
| Worker receipt → canonical lead p95, deterministic | < 5 seconds |
| Worker receipt → canonical lead p95, AI fallback | < 15 seconds |
| Deterministic extraction success for configured providers | ≥ 95% |
| Duplicate canonical lead rate | < 0.1% |
| Non-terminal staged message age | < 15 minutes p95 |
| Exhausted recovery without operator alert | 0 |
| Cross-channel duplicate false suppression | 0 |
| Cross-client incidents | 0 |
| Unexplained message loss | 0 |
| Raw quarantine retention | ≤ 7 days |
| Ingestion availability, excluding upstream email delivery | 99.9% monthly |

---

## 9. Architecture

```text
Provider / customer
        │ SMTP
        ▼
Cloudflare Email Routing
  catch-all: *@leads.xeroflow.io
        │ ForwardableEmailMessage
        ▼
email-lead-intake Worker
  ├─ extract opaque recipient token
  ├─ signed policy lookup
  ├─ enforce endpoint/sender policy
  ├─ enforce raw/MIME limits
  ├─ Cloudflare transport adapter → NormalizedInboundEmail
  ├─ parse MIME once through transport-neutral boundary
  ├─ ADF/XML parser
  ├─ registered provider adapter / generic parser
  ├─ optional Workers AI fallback
  ├─ reserve staged ingestion through signed Nitro call
  ├─ encrypt and stage raw MIME in R2
  └─ sign canonical envelope
        │ HTTPS + HMAC timestamp/nonce/body digest
        ▼
POST /api/internal/leads/email-policy
  ├─ verify signature and replay window
  ├─ resolve active opaque endpoint token
  └─ return minimal parser/AI/sender policy
        │
        ▼
POST /api/internal/leads/email-stage
  ├─ verify signature and replay window
  ├─ re-resolve endpoint and reserve idempotency identity
  ├─ create received ingestion before R2 write
  └─ return opaque ingestion ID and random object key
        │
        ▼
POST /api/internal/leads/email-ingest
  ├─ verify signature and replay window
  ├─ re-resolve opaque endpoint token
  ├─ re-enforce enabled/sender policy
  ├─ claim the reserved endpoint-scoped ingestion
  ├─ map to InsertLeadInput
  ├─ acceptLead()
  ├─ link advisory cross-channel duplicate signal
  └─ mark ingestion terminal
        │
        ├─ leadIntakeService.ingest()
        ├─ measurement outbox
        ├─ rules.evaluate
        ├─ crm.promote
        └─ notifyOnNewLead

scheduled leads-cron recovery
  └─ claim stale non-terminal ingestion
       ├─ recheck endpoint policy
       ├─ load/decrypt staged MIME
       ├─ retry the same canonical identity
       └─ quarantine after attempt/age limit
```

### 9.1 Trust boundaries

1. Sender, headers, subject, body, HTML, attachments, ADF/XML, and AI prompt content are untrusted.
2. Recipient token is untrusted until resolved against an active endpoint.
3. The Worker-to-Nitro envelope is trusted only after HMAC, timestamp, nonce, and digest verification.
4. The endpoint record is the sole client and form authority.
5. Canonical lead acceptance remains the sole business-logic boundary.
6. A transport adapter may normalise delivery metadata but cannot select a tenant, relax endpoint policy, or create a lead.
7. Cross-channel similarity is advisory and executes only after transport idempotency and canonical acceptance.

### 9.2 Transport-neutral parsing and Worker-to-Nitro contracts

```ts
export type EmailParserKind = 'adf' | 'provider' | 'generic' | 'ai_fallback'
export type EmailIngestionStatus = 'received' | 'accepted' | 'duplicate' | 'quarantined' | 'failed'
export type EmailIngressTransport = 'cloudflare_email_routing'

export interface NormalizedInboundEmail {
  transport: EmailIngressTransport
  envelopeRecipient: string
  envelopeSender: string | null
  headerFrom: string | null
  subject: string
  text: string | null
  html: string | null
  messageId: string | null
  attachments: Array<{
    filename: string
    contentType: string
    content: Uint8Array
  }>
  receivedAt: string
  rawSize: number
}

export interface EmailProviderAdapter {
  id: string
  priority: number
  matches(input: NormalizedInboundEmail, expectedProvider: string | null): {
    matched: boolean
    evidence: string[]
  }
  extract(input: NormalizedInboundEmail): EmailLeadExtraction | null
}

export interface EmailEndpointPolicy {
  schemaVersion: 1
  parserMode: 'auto' | 'adf' | 'generic'
  aiExtractionMode: 'disabled' | 'fallback'
  expectedProvider: string | null
  allowedSenderDomains: string[]
  maxRawBytes: number
  maxAdfAttachmentBytes: number
}

export interface ExtractedEmailField {
  value: string
  confidence: number
  provenance: 'subject' | 'body' | 'adf' | 'attachment' | 'ai'
}

export interface EmailLeadExtraction {
  provider: string
  externalIdHash: string
  sourceName: string
  medium: 'classifieds' | 'paid-social' | 'cpc' | 'lead_ingest'
  parser: EmailParserKind
  fields: Record<string, ExtractedEmailField>
  vehicle?: {
    year?: ExtractedEmailField
    make?: ExtractedEmailField
    model?: ExtractedEmailField
    stock_number?: ExtractedEmailField
  }
  message?: ExtractedEmailField
  overallConfidence: number
  needsReview: boolean
  reviewReasons: string[]
}

export interface EmailIngestEnvelope {
  schemaVersion: 1
  correlationId: string
  ingestionId: string
  transport: EmailIngressTransport
  recipientToken: string
  recipientAddressHash: string
  envelopeSenderDomain: string | null
  headerFromDomain: string | null
  messageIdHash: string | null
  externalIdHash: string
  receivedAt: string
  rawSize: number
  attachmentCount: number
  extraction: EmailLeadExtraction | null
  safeEvidence: {
    hasText: boolean
    hasHtml: boolean
    hasAdf: boolean
    fieldKeys: string[]
  }
  quarantine?: {
    reason: string
    encryptedObjectKey: string
    expiresAt: string
  }
}

export interface EmailStageRequest {
  schemaVersion: 1
  correlationId: string
  transport: EmailIngressTransport
  recipientToken: string
  externalIdHash: string
  messageIdHash: string | null
  provider: string
  receivedAt: string
  rawSize: number
  safeEvidence: {
    hasText: boolean
    hasHtml: boolean
    hasAdf: boolean
    fieldKeys: string[]
  }
  quarantineExpiresAt: string
}

export interface EmailStageResponse {
  schemaVersion: 1
  outcome: 'reserved' | 'duplicate'
  ingestionId: string
  encryptedObjectKey: string | null
}

export interface PossibleDuplicateSignal {
  possibleDuplicateOfLeadId: string
  matchBasis: 'email_hmac' | 'phone_hmac' | 'email_phone_hmac'
  confidence: number
  windowHours: number
}
```

Required request headers:

```text
x-xeroflow-email-timestamp: Unix seconds
x-xeroflow-email-nonce: cryptographically random UUID
x-xeroflow-email-signature: v1=<hex HMAC-SHA256>
content-type: application/json
```

Signing input:

```text
v1\n<timestamp>\n<nonce>\n<SHA-256(body)>
```

All three internal requests use the same signing format but distinct nonces. Nitro
accepts timestamps within five minutes and records each nonce for ten minutes.
The policy response contains no client ID, form ID, endpoint ID, address token,
or other tenant-identifying data. The ingestion endpoint performs a fresh
endpoint lookup and policy check; the Worker policy lookup never grants durable
authority.

`NormalizedInboundEmail` is an in-process parsing boundary, not the
Worker-to-Nitro payload. Raw addresses, subject, content, and attachment bytes
must never be serialised into the canonical envelope. A future transport adds a
new authenticated normaliser and extends `EmailIngressTransport`; it still
produces the same safe extraction envelope and uses the same policy, signing,
idempotency, and acceptance path.

The normalised type, bounded MIME parser, provider adapters, and deterministic
orchestrator live in `shared/leads/email/` as a pure Cloudflare-compatible
module. Both the Email Worker and Nitro recovery consume it, which makes replay
use the same parser rather than a second implementation. Sharing the type does
not authorise serialising raw content: only the policy, stage, extraction, and
ingestion schemas cross the Worker/Nitro network boundary. AI execution,
transport I/O, persistence, and tenant resolution remain injected outer-layer
concerns and are forbidden inside the shared parser.

The stage endpoint is the durability handshake. It creates or returns the
endpoint-scoped ingestion reservation before the Worker writes the encrypted
object. If it reports `duplicate`, the Worker does not retain another MIME
object. If it reports `reserved`, the Worker writes only to the returned random
object key and then calls the canonical ingestion endpoint. Recovery can
therefore reconcile missing-object, staged-object, and completed-handoff states
without listing or interpreting tenant information from R2 keys.

---

## 10. Data model

The next migration number must be resolved immediately before implementation because migrations are being added concurrently. The implementation must not assume a number from this PRD.

### 10.1 `lead_email_endpoints`

```sql
CREATE TABLE lead_email_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  address_prefix TEXT NOT NULL,
  address_token TEXT NOT NULL UNIQUE,
  email_address TEXT NOT NULL UNIQUE,
  expected_provider TEXT,
  parser_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (parser_mode IN ('auto', 'adf', 'generic')),
  ai_extraction_mode TEXT NOT NULL DEFAULT 'disabled'
    CHECK (ai_extraction_mode IN ('disabled', 'fallback')),
  allowed_sender_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_max_silence_hours INTEGER
    CHECK (expected_max_silence_hours IS NULL OR expected_max_silence_hours BETWEEN 1 AND 8760),
  first_response_sla_minutes INTEGER
    CHECK (first_response_sla_minutes IS NULL OR first_response_sla_minutes BETWEEN 1 AND 43200),
  form_id TEXT NOT NULL,
  form_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  previous_address_token TEXT,
  previous_token_grace_until TIMESTAMPTZ,
  last_received_at TIMESTAMPTZ,
  last_accepted_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(allowed_sender_domains) = 'array')
);

CREATE INDEX idx_lead_email_endpoints_client
  ON lead_email_endpoints(client_id, enabled, created_at DESC);

CREATE UNIQUE INDEX uq_lead_email_endpoints_previous_token
  ON lead_email_endpoints(previous_address_token)
  WHERE previous_address_token IS NOT NULL;
```

### 10.2 `lead_email_ingestions`

```sql
CREATE TABLE lead_email_ingestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES lead_email_endpoints(id) ON DELETE RESTRICT,
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  correlation_id UUID NOT NULL UNIQUE,
  transport TEXT NOT NULL
    CHECK (transport IN ('cloudflare_email_routing')),
  external_id_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  parser TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('received', 'accepted', 'duplicate', 'quarantined', 'failed')),
  confidence NUMERIC(5,4),
  sender_domain TEXT,
  message_id_hash TEXT,
  safe_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  staged_object_key TEXT,
  staged_expires_at TIMESTAMPTZ,
  error_class TEXT,
  processing_ms INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  possible_duplicate_of_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  duplicate_match_basis TEXT
    CHECK (duplicate_match_basis IS NULL OR duplicate_match_basis IN ('email_hmac', 'phone_hmac', 'email_phone_hmac')),
  duplicate_confidence NUMERIC(5,4),
  duplicate_window_hours INTEGER,
  replayed_from UUID REFERENCES lead_email_ingestions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(endpoint_id, external_id_hash)
);

CREATE INDEX idx_lead_email_ingestions_endpoint_created
  ON lead_email_ingestions(endpoint_id, created_at DESC);

CREATE INDEX idx_lead_email_ingestions_attention
  ON lead_email_ingestions(status, created_at DESC)
  WHERE status IN ('quarantined', 'failed');

CREATE INDEX idx_lead_email_ingestions_recovery
  ON lead_email_ingestions(next_attempt_at, created_at)
  WHERE terminal_at IS NULL;

CREATE INDEX idx_lead_email_ingestions_possible_duplicate
  ON lead_email_ingestions(possible_duplicate_of_lead_id)
  WHERE possible_duplicate_of_lead_id IS NOT NULL;
```

### 10.3 `lead_email_ingest_nonces`

```sql
CREATE TABLE lead_email_ingest_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_lead_email_ingest_nonces_expiry
  ON lead_email_ingest_nonces(expires_at);
```

Nonce and expired staged-object metadata cleanup extend
`server/api/leads/_internal/purge-ingestion-errors.post.ts`, which is already
invoked daily by `workers/leads-cron`. R2 object expiry remains enforced by
the bucket's seven-day lifecycle rule rather than application-only deletion.
The existing five-minute stuck-claim cron tick also calls the focused email
recovery endpoint; recovery eligibility is driven by `next_attempt_at`, not by
adding a second independent Cloudflare cron schedule.

Application invariants enforce that `accepted`, `duplicate`, and `quarantined`
rows have `terminal_at`; `received` rows do not; and `failed` rows are
non-terminal only while another bounded attempt is scheduled. The stage
response may reserve an object key before bytes exist, so recovery explicitly
distinguishes a missing object from a corrupt or undecryptable object.

---

## 11. Security, privacy, and abuse controls

- Generate address tokens and rotation tokens only on the server with cryptographic randomness.
- Never use client slug, display name, sender, subject, or email body to select a tenant.
- Use separate secrets for Worker-to-Nitro HMAC and R2 envelope encryption.
- Require every future transport adapter to use its own authenticated ingress boundary before it can produce the shared canonical envelope.
- Verify HMAC with constant-time comparison.
- Reject stale timestamps and reused nonces.
- Use Zod limits on every string, array, field count, and nested object.
- Limit extracted fields to 100 and each value to 4,000 characters.
- Limit the sanitised message to 20,000 characters.
- Strip NUL and unsafe control characters.
- Do not fetch URLs or remote images found in email content.
- Do not render raw HTML.
- Defend XML parsing against entities, DTDs, and external references.
- Do not log raw subject lines because subjects frequently contain customer names and phone numbers.
- Hash Message-ID and provider identity inside the Worker before constructing the signed envelope; only hashes may reach Nitro, persistence, or operational logs.
- AI receives only the minimum text needed for extraction and no unrelated attachments.
- AI extraction is client/endpoint opt-in and must be auditable.
- R2 staged MIME objects use random keys, application-layer envelope encryption, private bucket access, and lifecycle deletion at seven days.
- Replay and endpoint mutation use existing agency RBAC and produce audit events.
- Portal APIs cannot list endpoint tokens, quarantined MIME, sender domains, or extraction diagnostics.
- Cross-channel duplicate matching uses existing tenant-scoped HMAC identity fingerprints; raw email and phone values are never added to similarity evidence.
- Recovery claims are tenant-safe, lock-protected, bounded to five attempts, and reuse the original endpoint-scoped identity.

---

## 12. Failure handling

| Failure | Behaviour |
|---|---|
| Unknown recipient | Generic accept/reject behaviour; safe metric only; no tenant disclosure |
| Disabled endpoint | Quarantine metadata; no lead |
| Sender not allowed | Quarantine metadata; no lead |
| Oversized raw message | Reject before MIME parsing; record size/error when possible |
| Malformed MIME | Quarantine encrypted raw message; safe parse error |
| Unsafe XML | Reject XML parser result; continue generic parser only if safe |
| No email but valid phone | Accept |
| No truthful contact information | Quarantine |
| Provider relay mistaken for customer | Never use relay address; quarantine if no other contact |
| AI unavailable | Accept deterministic result if sufficient; otherwise quarantine |
| Invalid AI schema | Quarantine and increment schema-rejection metric |
| HMAC failure | Return 401; no endpoint lookup or lead mutation |
| Reused nonce | Return 409; no mutation |
| Duplicate external ID | Return 200 duplicate; no new lead/rules |
| Duplicate stage reservation | Return existing duplicate/ingestion outcome; do not write another R2 object |
| Worker ends before R2 write | Recovery detects reserved row with missing object; a transport retry may fill it, otherwise mark failed/quarantined with no invented lead |
| Worker ends after R2 write | Recovery decrypts and retries the same canonical identity |
| Worker ends after Nitro accepts but before R2 delete | Scheduled cleanup deletes the residual terminal object without replaying the lead |
| Recovery collision | `FOR UPDATE SKIP LOCKED` permits one claimant; idempotency remains the final guard |
| Recovery exhausted | Mark terminal quarantined, alert operator, retain encrypted evidence only until the seven-day expiry |
| `acceptLead()` transient failure | Mark failed, leave the already-staged encrypted MIME for up to seven days, allow replay |
| Cross-channel identity match | Accept the new lead, link an advisory possible-duplicate signal, and continue routing |
| Similarity service unavailable | Keep the accepted lead; record a safe metric and retry similarity enrichment separately if appropriate |
| Rules/destination failure | Existing delivery retry/audit behaviour |
| CRM unavailable/not entitled | Existing CRM promotion state behaviour |

---

## 13. Rollout

### Phase A — dark foundation

- Deploy schema, contracts, parser fixtures, Worker, and internal endpoint.
- Do not configure the Email Routing catch-all.
- Create endpoints for test clients only.
- Verify synthetic fixtures through preview infrastructure.
- Kill the Worker at pre-stage, post-reservation, and post-R2-write checkpoints and prove recovery reaches the expected terminal state.
- Run every provider adapter through the shared conformance suite.

### Phase B — South Morang pilot

- Create separate `Carsales`, `Website`, and `General` addresses.
- Configure realistic expected cadence and first-response SLA values for each endpoint rather than a universal inactivity threshold.
- Apply routing presets through the existing form rules, then verify client-specific overrides remain intact.
- Forward copies while leaving the existing delivery path active.
- Compare provider inbox count against XeroFlow accepted + duplicate + quarantined + terminal-failed + non-terminal reservations daily, with policy-denied receipts reported separately.
- Keep AI disabled for the first deterministic-parsing week.
- Enable AI fallback only for the `General` endpoint after privacy approval.

### Phase C — controlled client rollout

- Add clients in batches of three.
- Require a test message and canonical lead proof for every endpoint.
- Require destination and CRM proof before declaring an endpoint ready.
- Review possible-duplicate precision without suppressing or merging any lead automatically.
- Review oldest non-terminal ingestion age and recovery outcomes daily.
- Monitor failure and quarantine rates for seven days per batch.

### Phase D — general availability

- Add the feature to onboarding and marketing.
- Permit standard endpoint creation for authorised agency operators.
- Keep autonomous replies out of scope until a separate approved PRD.

### Rollback

- Disable the Email Routing catch-all to stop new receipts.
- Disable individual endpoints to stop one client/provider.
- Keep endpoint and ingestion records for audit.
- Let recovery finish or explicitly quarantine every staged non-terminal ingestion before removing the Worker route.
- Do not roll back additive tables while accepted leads reference ingestion rows.
- Confirm remaining quarantine objects are removed by explicit cleanup or the R2 seven-day lifecycle backstop.

---

## 14. File map

| Path | Action | Responsibility |
|---|---|---|
| `docs/prd/universal-email-lead-ingestion-prd.md` | create | Product contract and implementation ledger |
| `shared/leads/email/contracts.ts` | create | Safe Worker/Nitro network contract types and Zod schemas |
| `shared/leads/email/types.ts` | create | In-process normalised email, MIME, and provider adapter types |
| `shared/leads/email/mime.ts` | create | Bounded Cloudflare-compatible RFC 822 parsing and HTML-to-text |
| `shared/leads/email/parser.ts` | create | ADF, provider-registry, generic extraction orchestration |
| `shared/leads/email/providers/types.ts` | create | Side-effect-free provider adapter contract |
| `shared/leads/email/providers/registry.ts` | create | Stable provider priority, duplicate-ID checks, and adapter selection |
| `shared/leads/email/providers/*.ts` | create | Carsales, AutoTrader, CarsGuide, Drive, Gumtree, Meta, Instagram, TikTok, and Google deterministic adapters |
| `shared/leads/email/ai.ts` | create | Shared prompt, schema validation, evidence checks, and deterministic merge policy |
| `server/database/migrations/<next>_universal_email_lead_ingestion.sql` | create | Endpoint, ingestion, nonce, source constraints, indexes |
| `workers/email-lead-intake/package.json` | create | Worker package and scripts |
| `workers/email-lead-intake/wrangler.toml` | create | Email, R2, AI, vars, observability bindings |
| `workers/email-lead-intake/tsconfig.json` | create | Worker TypeScript config |
| `workers/email-lead-intake/src/transport.ts` | create | Cloudflare event/raw-stream normaliser into the shared in-process contract |
| `workers/email-lead-intake/src/aiRuntime.ts` | create | Worker binding adapter for optional schema-constrained AI fallback |
| `workers/email-lead-intake/src/signing.ts` | create | HMAC request signing |
| `workers/email-lead-intake/src/quarantine.ts` | create | Encrypt/store/delete short-lived R2 evidence |
| `workers/email-lead-intake/src/index.ts` | create | Email handler orchestration |
| `server/utils/leads/emailEndpoint.ts` | create | Endpoint CRUD, token generation, sender policy |
| `server/utils/leads/emailIngestion.ts` | create | Signature verification, nonce, idempotency, lead mapping |
| `server/utils/leads/emailDuplicateSignal.ts` | create | Tenant-scoped advisory cross-channel similarity using existing identity links |
| `server/utils/leads/emailAiRuntime.ts` | create | Nitro binding adapter used only for opt-in recovery parity |
| `server/utils/leads/emailRecovery.ts` | create | Lock, decrypt, retry, exhaust, and reconcile staged ingestions |
| `server/utils/leads/emailRoutingPreset.ts` | create | Idempotent setup presets over existing form rules/destinations |
| `server/utils/leads/crmPromotion.ts` | modify | Source/provider-aware CRM activity and opportunity fallback copy |
| `server/api/internal/leads/email-policy.post.ts` | create | Signed minimal endpoint-policy lookup |
| `server/api/internal/leads/email-stage.post.ts` | create | Signed durable ingestion reservation and random R2 object-key issue |
| `server/api/internal/leads/email-ingest.post.ts` | create | Private signed ingress endpoint |
| `server/api/leads/email-endpoints/index.get.ts` | create | Authorised endpoint list |
| `server/api/leads/email-endpoints/index.post.ts` | create | Create endpoint |
| `server/api/leads/email-endpoints/[id].patch.ts` | create | Edit/enable/disable endpoint |
| `server/api/leads/email-endpoints/[id]/rotate.post.ts` | create | Rotate address token |
| `server/api/leads/email-endpoints/[id]/ingestions.get.ts` | create | Safe endpoint history |
| `server/api/leads/email-ingestions/[id]/replay.post.ts` | create | Audited replay |
| `server/api/leads/_internal/recover-email-ingestions.post.ts` | create | Cron-authenticated bounded orphan recovery |
| `server/api/leads/_internal/purge-ingestion-errors.post.ts` | modify | Nonce and expired staged-object metadata cleanup |
| `workers/leads-cron/src/index.ts` | modify | Invoke recovery on the existing schedule before daily cleanup |
| `wrangler.toml` | modify | Bind the same private quarantine R2 bucket to Pages recovery under a dedicated binding |
| `app/types/index.ts` | modify | Add `email` source and endpoint/ingestion types |
| `app/pages/agency/leads/index.vue` | modify | Add Email addresses tab |
| `app/components/leads/EmailEndpointsTab.vue` | create | Endpoint table and filters |
| `app/components/leads/EmailEndpointSlideover.vue` | create | Create/edit form and history |
| `app/components/leads/EmailIngestionStatusBadge.vue` | create | Safe status rendering |
| `app/components/leads/FormRulesTab.vue` | modify | Add email source/rule creation |
| `app/components/leads/InboxFilters.vue` | modify | Add email source filter |
| `app/components/leads/SourceIcon.vue` | modify | Add local Lucide mail icon |
| `app/components/leads/SetupGuide.vue` | modify | Add email setup and troubleshooting |
| `app/pages/portal/leads.vue` | modify | Present email/provider source without exposing transport diagnostics |
| `app/pages/features/index.vue` | modify | Mention email lead ingestion |
| `app/pages/features/[slug].vue` | modify | Add detailed email adapter section |
| `app/components/MarketingNav.vue` | modify | Update Lead Capture navigation subtitle to include email |
| `docs/runbooks/email-lead-ingestion.md` | create | Cloudflare setup, deploy, smoke, rollback |
| `test/workers/email-lead-mime.test.ts` | create | MIME safety fixtures |
| `test/workers/email-lead-parser.test.ts` | create | ADF/provider/generic parsing |
| `test/workers/email-provider-conformance.test.ts` | create | Shared deterministic adapter contract and fixture suite |
| `test/workers/email-transport-conformance.test.ts` | create | Cloudflare normalisation and future-adapter boundary contract |
| `test/workers/email-lead-ai.test.ts` | create | AI policy and schema tests |
| `test/workers/email-lead-worker.test.ts` | create | Worker policy, transport, retry, and signing tests |
| `test/server/utils/leads/emailIngestion.test.ts` | create | Signature/idempotency/tenant tests |
| `test/server/utils/leads/emailDuplicateSignal.test.ts` | create | Cross-channel advisory match and isolation tests |
| `test/server/utils/leads/emailRecovery.test.ts` | create | Stage/recovery/exhaustion/concurrency tests |
| `test/server/utils/leads/emailRoutingPreset.test.ts` | create | Idempotent preset and customised-condition preservation tests |
| `test/server/api/leads/email-endpoints.test.ts` | create | CRUD/RBAC tests |
| `test/server/api/leads/email-stage.test.ts` | create | Signed staging reservation and duplicate tests |
| `test/server/api/leads/email-ingest.test.ts` | create | Internal endpoint contract tests |
| `test/server/api/leads/emailRetention.test.ts` | create | Nonce/staged-object metadata cleanup tests |
| `test/server/utils/leads/emailPrivacy.test.ts` | create | PII evidence/log canary tests |
| `test/server/utils/leads/emailHealth.test.ts` | create | Health counters and alert threshold tests |
| `test/app/leadsEmailEndpoints.test.ts` | create | UI structure and source integration |
| `test/fixtures/email-leads/*` | create | Sanitised provider fixture corpus |

---

## 15. Dependency order

```text
Task 1 contracts/schema
  ├─ Task 2 transport-neutral MIME/provider adapters
  └─ Task 3 endpoint domain service/API + routing presets
       └─ Task 4 signed policy/stage/ingestion + duplicate signal
            └─ Task 5 Cloudflare transport (also depends on Task 2)
                 └─ Task 6 AI fallback

Task 3 ──→ Task 7 agency endpoint UI
Task 4 ──→ Task 8 rules/inbox/CRM integration
Task 4 + Task 5 + Task 7 ──→ Task 9 quarantine/recovery/replay
Tasks 1–9 ──→ Task 10 observability/retention
Tasks 1–10 ──→ Task 11 documentation/marketing
Tasks 1–11 ──→ Task 12 production rollout
```

Tasks 2 and 3 may proceed in parallel after Task 1. Task 6 must not block
deterministic pilot delivery, but Task 9's AI recovery-parity step must be
complete before AI fallback is enabled for any endpoint.

---

## 16. Master implementation checklist

- [ ] **Task 1:** Add shared contracts and database foundation.
- [ ] **Task 2:** Build and battle-test transport-neutral MIME and provider-adapter parsing.
- [ ] **Task 3:** Build endpoint domain service, routing presets, and authorised CRUD APIs.
- [ ] **Task 4:** Build signed staging/ingestion, canonical `acceptLead()` bridge, and duplicate signalling.
- [ ] **Task 5:** Build the Cloudflare Email Routing transport adapter and Worker.
- [ ] **Task 6:** Add opt-in, schema-constrained AI extraction fallback.
- [ ] **Task 7:** Add the agency Email addresses management UI.
- [ ] **Task 8:** Integrate email into rules, inbox, source filters, CRM, and portal contracts.
- [ ] **Task 9:** Add quarantine history, encrypted retention, orphan recovery, and audited replay.
- [ ] **Task 10:** Add cadence/SLA observability, health alerts, cleanup, and privacy tests.
- [ ] **Task 11:** Update setup guidance, runbook, AGENTS context, and marketing pages.
- [ ] **Task 12:** Run full verification, migrate, deploy, and execute the pilot.

---

## 17. Detailed implementation tasks

### Task 1: Shared contracts and database foundation

**Files:**

- Create: `shared/leads/email/contracts.ts`
- Create: `server/database/migrations/<next>_universal_email_lead_ingestion.sql`
- Modify: `app/types/index.ts`
- Test: `test/server/utils/leads/emailIngestion.test.ts`

**Produces:**

- `EmailIngestEnvelopeSchema`
- `EmailStageRequestSchema`
- `EmailStageResponseSchema`
- `EmailLeadExtractionSchema`
- `EmailEndpointPolicySchema`
- `EmailLeadEndpoint`
- `EmailLeadIngestion`
- source value `email`

- [ ] Resolve the next migration number from current `origin/main`; do not reuse the placeholder.
- [ ] Write failing contract tests for valid policy/stage/ingest envelopes, matching envelope/extraction external-ID hashes, `cloudflare_email_routing`, oversized values, invalid confidence, unsafe field counts, unknown enum values, and accidental raw-content fields.
- [ ] Add the shared Zod schemas and inferred TypeScript types exactly matching section 9.2.
- [ ] Write migration assertions covering all three tables, transport and terminal-state constraints, cadence/SLA bounds, recovery indexes, duplicate-signal foreign keys, and tenant-scoped uniqueness.
- [ ] Extend the `leads.source` constraint and `LeadSource` type with `email`.
- [ ] Extend `lead_form_rules` source validation to allow `email`.
- [ ] Apply the migration automatically using `DATABASE_URL` as required by `AGENTS.md`.
- [ ] Query Postgres to prove tables, constraints, and indexes exist.
- [ ] Run the focused contract/migration tests.
- [ ] Commit: `feat(leads): add email ingestion contracts and schema`

**Acceptance evidence:**

```bash
pnpm vitest run test/server/utils/leads/emailIngestion.test.ts
psql "$DATABASE_URL" -c "\d lead_email_endpoints"
psql "$DATABASE_URL" -c "\d lead_email_ingestions"
```

### Task 2: Transport-neutral MIME and provider-adapter parsing

**Files:**

- Create: `shared/leads/email/types.ts`
- Create: `shared/leads/email/mime.ts`
- Create: `shared/leads/email/parser.ts`
- Create: `shared/leads/email/providers/types.ts`
- Create: `shared/leads/email/providers/registry.ts`
- Create: `shared/leads/email/providers/*.ts`
- Create: `test/workers/email-lead-mime.test.ts`
- Create: `test/workers/email-lead-parser.test.ts`
- Create: `test/workers/email-provider-conformance.test.ts`
- Create: `test/fixtures/email-leads/`

**Consumes:** Safe network types from `shared/leads/email/contracts.ts`.

**Produces:**

```ts
interface NormalizedInboundEmail
interface EmailProviderAdapter
parseMimeContent(raw: Uint8Array): Promise<ParsedMimeContent>
emailLeadBody(email: NormalizedInboundEmail): string
registerProviderAdapters(adapters: EmailProviderAdapter[]): EmailProviderRegistry
parseEmailLead(input: NormalizedInboundEmail, policy: EmailEndpointPolicy): EmailLeadExtraction | null
```

- [ ] Add sanitised fixtures for Carsales ADF body, ADF attachment, AutoTrader, CarsGuide, Drive, Gumtree, Meta, Instagram, TikTok, Google, generic labelled email, direct customer email, HTML-only email, forwarded/replied email, phone-only lead, malformed MIME, hostile HTML, entity-expansion XML, and relay-without-customer-contact.
- [ ] Write failing raw-size, header-size, MIME-depth, attachment-size, HTML-to-text, script removal, and no-remote-fetch tests.
- [ ] Implement bounded `postal-mime` parsing with constants from FR-009 through FR-013.
- [ ] Write failing ADF tests for contact, comments, provider, vehicle, stock number, request date, and provider ID.
- [ ] Implement an entity/DTD-disabled ADF parser; never use regex alone to establish XML safety.
- [ ] Write the shared provider-adapter conformance suite: stable non-empty ID, unique priority, deterministic matching, no mutation, no network access, field provenance, confidence bounds, expected-provider hint behaviour, and no overwrite of accepted higher-priority fields.
- [ ] Write failing registry tests for duplicate IDs, duplicate priorities, stable ordering, no match, and multiple-match resolution.
- [ ] Implement `EmailProviderAdapter` and the side-effect-free registry.
- [ ] Implement one adapter per provider in FR-017 and run every adapter against the same conformance suite.
- [ ] Write failing provider classification and attribution tests for every provider, including sender/subject spoofing that must not outrank stronger body/ADF evidence.
- [ ] Write failing generic label, direct-customer, relay sender, phone-only, reply-chain, signature, provenance, and confidence tests.
- [ ] Implement the transport-neutral deterministic parser in ADF → registered provider → generic priority order.
- [ ] Prove the shared parser imports no database, Nitro event, Cloudflare email event, AI binding, network client, or persistence module and runs identically from Worker and Nitro test harnesses.
- [ ] Write failing external-ID priority and stable-hash tests.
- [ ] Implement provider ID → Message-ID → stable fingerprint selection and hash it before constructing the signed envelope.
- [ ] Run parser tests twice to prove fingerprint stability.
- [ ] Commit: `feat(leads): add deterministic email lead parser`

**Acceptance evidence:**

```bash
pnpm vitest run test/workers/email-lead-mime.test.ts test/workers/email-lead-parser.test.ts test/workers/email-provider-conformance.test.ts
```

### Task 3: Endpoint service, routing presets, and authorised CRUD APIs

**Files:**

- Create: `server/utils/leads/emailEndpoint.ts`
- Create: `server/utils/leads/emailRoutingPreset.ts`
- Create: `server/api/leads/email-endpoints/index.get.ts`
- Create: `server/api/leads/email-endpoints/index.post.ts`
- Create: `server/api/leads/email-endpoints/[id].patch.ts`
- Create: `server/api/leads/email-endpoints/[id]/rotate.post.ts`
- Create: `server/api/leads/email-endpoints/[id]/ingestions.get.ts`
- Test: `test/server/api/leads/email-endpoints.test.ts`
- Test: `test/server/utils/leads/emailRoutingPreset.test.ts`

**Produces:**

```ts
createEmailEndpoint(input, actorId): Promise<EmailLeadEndpoint>
updateEmailEndpoint(id, input, actorId): Promise<EmailLeadEndpoint>
rotateEmailEndpoint(id, actorId): Promise<EmailLeadEndpoint>
resolveEmailEndpointToken(token): Promise<EmailLeadEndpoint | null>
applyEmailRoutingPreset(input, actorId): Promise<{ ruleId: string, destinationIds: string[] }>
```

- [ ] Write failing tests for RBAC, multiple endpoints per client, token entropy/format, label normalisation, duplicate address rejection, immutable endpoint-scoped form IDs, form metadata creation, cadence/SLA bounds, enable/disable, immutable used address, rotation grace, soft retirement, and client-scoped history.
- [ ] Implement address-token generation using cryptographic randomness.
- [ ] Implement prefix normalisation and full-address length validation.
- [ ] Implement endpoint creation and `lead_form_metadata` upsert in one transaction using `email_endpoint:<endpoint-uuid>` as the immutable form ID.
- [ ] Write failing routing-preset tests for no preset, portal/notification preset, single-user assignment, invalid tenant user, idempotent reapply, customised-condition preservation, and rollback when endpoint/form-rule creation fails.
- [ ] Implement presets by creating/updating existing `lead_form_rules` and `lead_rule_destinations`; use `assign_user` for direct lead ownership and leave round-robin/priority/load-balanced CRM ownership to existing CRM governance.
- [ ] Implement update, disable, retirement, and rotation service methods.
- [ ] Implement list/detail/history queries that expose only safe metadata.
- [ ] Add API handlers with `requireRole(event, PERMISSIONS.MEDIA_BUYING)` and Zod bodies.
- [ ] Verify portal sessions receive 403 and cannot enumerate endpoints.
- [ ] Run focused endpoint and routing-preset tests.
- [ ] Commit: `feat(leads): add email endpoint management APIs`

### Task 4: Signed staging, canonical bridge, and duplicate signalling

**Files:**

- Create: `server/utils/leads/emailIngestion.ts`
- Create: `server/utils/leads/emailDuplicateSignal.ts`
- Create: `server/api/internal/leads/email-policy.post.ts`
- Create: `server/api/internal/leads/email-stage.post.ts`
- Create: `server/api/internal/leads/email-ingest.post.ts`
- Modify: `server/utils/leads/db.ts`
- Test: `test/server/utils/leads/emailIngestion.test.ts`
- Test: `test/server/utils/leads/emailDuplicateSignal.test.ts`
- Test: `test/server/api/leads/email-stage.test.ts`
- Test: `test/server/api/leads/email-ingest.test.ts`

**Produces:**

```ts
verifyEmailIngestSignature(request): Promise<void>
resolveEmailEndpointPolicy(request): Promise<EmailEndpointPolicy>
reserveEmailIngestionStage(request: EmailStageRequest): Promise<EmailStageResponse>
acceptEmailEnvelope(event, ingestionId, envelope): Promise<EmailIngestResult>
findEmailLeadDuplicateSignal(db, input): Promise<PossibleDuplicateSignal | null>
```

- [ ] Write failing HMAC tests for valid signature, altered body, wrong secret, stale timestamp, reused nonce, missing headers, and constant-time comparison path.
- [ ] Implement signature verification and atomic nonce reservation.
- [ ] Implement the signed minimal policy endpoint; prove its response contains no client, form, endpoint, or token identifiers.
- [ ] Write failing endpoint resolution tests for active, previous-token grace, expired token, disabled endpoint, retired endpoint, and sender-domain restriction.
- [ ] Implement the endpoint-authoritative policy lookup and ingestion-time recheck; never accept client/form IDs from the envelope.
- [ ] Write failing stage-reservation tests for valid reservation, terminal duplicate identity, retry of a non-terminal reservation reusing ingestion/object key, cross-endpoint identity, random object key, stale signature, endpoint disabled between policy and stage, and no raw-content persistence.
- [ ] Implement the signed stage endpoint so the ingestion row and endpoint-scoped identity exist before R2 bytes are written; return only opaque ingestion ID, duplicate outcome, and random object key.
- [ ] Write failing field mapping tests for names, truthful phone-only lead, message, vehicle, attribution, consent `unknown`, form identity, and provider relay exclusion.
- [ ] Implement `EmailLeadExtraction` → `InsertLeadInput`.
- [ ] Write failing idempotency tests across same endpoint retry, different endpoints with the same Message-ID hash, rotated endpoint retry, provider ID hash, and fingerprint fallback.
- [ ] Write failing ingest-claim tests for unknown ingestion ID, mismatched token, mismatched external-ID hash, mismatched correlation ID, already-terminal reservation, and concurrent claims.
- [ ] Implement `email:<endpoint-id>:<external-id-hash>` canonical identity during stage reservation; prove raw provider IDs and Message-IDs are absent from persisted rows and logs.
- [ ] Call `resolveLeadCaptureMode()` and `acceptLead()`; do not insert directly into `leads`.
- [ ] Persist accepted/duplicate/quarantined/failed ingestion outcomes.
- [ ] Write failing advisory similarity tests for email-only, phone-only, matching both, outside window, same lead, cross-client candidate, identity conflict, and similarity-service failure.
- [ ] Implement possible-duplicate lookup through existing `crm_lead_identity_links` and HMAC identity keys only after canonical acceptance; persist safe relationship evidence without suppressing, merging, or rolling back the lead.
- [ ] Prove a created lead enqueues existing rules and CRM promotion through mocked boundary assertions.
- [ ] Run existing generic, Google, Meta, Podium, acceptance, and intake regression tests.
- [ ] Commit: `feat(leads): bridge signed email intake to canonical leads`

### Task 5: Cloudflare transport adapter and Email Routing Worker

**Files:**

- Create: `workers/email-lead-intake/package.json`
- Create: `workers/email-lead-intake/tsconfig.json`
- Create: `workers/email-lead-intake/wrangler.toml`
- Create: `workers/email-lead-intake/src/transport.ts`
- Create: `workers/email-lead-intake/src/signing.ts`
- Create: `workers/email-lead-intake/src/quarantine.ts`
- Create: `workers/email-lead-intake/src/index.ts`
- Test: `test/workers/email-lead-worker.test.ts`
- Test: `test/workers/email-transport-conformance.test.ts`

**Consumes:** Task 1 contracts and Task 2 parser.

- [ ] Write the transport conformance suite for envelope/header normalisation, address extraction, raw-size accounting, attachment bytes, absent optional headers, deterministic timestamps, no tenant selection, and no persistence/network side effects beyond the supplied raw stream.
- [ ] Implement the Cloudflare `ForwardableEmailMessage` normaliser into `NormalizedInboundEmail`; keep provider parsing unaware of Cloudflare event types.
- [ ] Write failing Worker tests for recipient token extraction, signed policy lookup, policy denial before raw read, raw-size rejection, signed stage reservation, duplicate reservation without R2 write, deterministic success, signed ingestion headers/body, unknown recipient, Nitro retryable failure, and correlation ID preservation.
- [ ] Implement token extraction from the recipient local part; treat the readable prefix as display-only.
- [ ] Resolve the minimal endpoint policy with a separately signed request before reading MIME; do not cache policy in v1.
- [ ] Enforce envelope-sender domain policy before reading MIME and pass both envelope and parsed-header domains for Nitro revalidation.
- [ ] Read the raw stream once and enforce limits before MIME parsing.
- [ ] Normalise through the transport adapter, run deterministic parsing, and construct the versioned safe envelope.
- [ ] Call the signed stage endpoint after hashing/extraction and before any R2 write; stop without storing raw MIME when the stage outcome is `duplicate`.
- [ ] For a reserved stage, encrypt and write raw MIME to the issued random object key immediately before canonical ingestion; delete it on accepted/duplicate and retain it only on failed/quarantined outcomes.
- [ ] Implement Web Crypto HMAC signing over the exact section 9.2 canonical input.
- [ ] Use `ctx.waitUntil()` only for non-critical metrics; await the canonical intake response.
- [ ] Define explicit immediate retry policy with bounded exponential backoff and the same correlation/external ID; hand remaining work to durable recovery rather than relying on `message.setReject()` alone.
- [ ] Add Worker bindings for secret, application origin, R2 quarantine bucket, optional AI, and observability.
- [ ] Add package scripts for test, typecheck, dry-run, and deploy.
- [ ] Run Worker, provider-conformance, transport-conformance, typecheck, and Wrangler dry-run checks.
- [ ] Commit: `feat(leads): add Cloudflare email intake worker`

### Task 6: Opt-in AI extraction fallback

**Files:**

- Create: `shared/leads/email/ai.ts`
- Create: `workers/email-lead-intake/src/aiRuntime.ts`
- Create: `server/utils/leads/emailAiRuntime.ts`
- Modify: `workers/email-lead-intake/src/index.ts`
- Test: `test/workers/email-lead-ai.test.ts`

**Produces:**

```ts
extractEmailLeadWithAi(input, deterministic, runtime): Promise<EmailLeadExtraction>
```

- [ ] Write failing tests proving AI is skipped when disabled or deterministic extraction is sufficient.
- [ ] Write a prompt that declares email content untrusted, prohibits instruction-following/tool use, and requests only schema fields with source evidence.
- [ ] Use strict JSON/schema output and validate with `EmailLeadExtractionSchema`.
- [ ] Write failing tests for timeout, malformed JSON, unknown fields, invented email/phone, deterministic conflict, low confidence, and prompt-injection content.
- [ ] Implement evidence membership checks for AI-produced email and phone values.
- [ ] Merge only missing non-conflicting fields; quarantine conflicts.
- [ ] Keep prompt construction, schema/evidence validation, and merge policy shared; implement small Worker and Nitro runtime adapters so recovery has identical opt-in behaviour.
- [ ] Run the same fake-runtime corpus through Worker and Nitro harnesses and assert byte-equivalent safe extraction envelopes.
- [ ] Record model, prompt version, duration, and outcome without content.
- [ ] Run AI tests using a fake binding—no paid/live inference in unit tests.
- [ ] Commit: `feat(leads): add guarded AI email extraction fallback`

### Task 7: Agency Email addresses UI

**Files:**

- Modify: `app/pages/agency/leads/index.vue`
- Create: `app/components/leads/EmailEndpointsTab.vue`
- Create: `app/components/leads/EmailEndpointSlideover.vue`
- Create: `app/components/leads/EmailIngestionStatusBadge.vue`
- Test: `test/app/leadsEmailEndpoints.test.ts`

- [ ] Invoke the mandatory `frontend-design` skill before editing form UI.
- [ ] Write failing structure tests for tab presence, Nuxt UI controls, `UFormField` labels, two-column grid, mobile collapse, cadence/SLA controls, routing preset, no raw input/select/button elements, and local icons.
- [ ] Add the `Email addresses` tab without changing Inbox/Form rules behaviour.
- [ ] Build the endpoint table with client/status filters, cadence-aware health, last receipt, oldest non-terminal age, recovery state, copy, edit, disable, rotate, and rule link actions.
- [ ] Build the create/edit slideover exactly from section 6.2.
- [ ] Preview the destinations a routing preset will create and require explicit confirmation before changing a customised existing form rule.
- [ ] Use `UModal` confirmation for rotation and retirement.
- [ ] Keep opaque token and diagnostics agency-only.
- [ ] Add loading, empty, forbidden, error, and success states.
- [ ] Verify keyboard, focus, labels, contrast, and narrow viewport composition.
- [ ] Run UI tests and a browser smoke test.
- [ ] Commit: `feat(leads): add email endpoint management UI`

### Task 8: Rules, inbox, CRM, and portal integration

**Files:**

- Modify: `app/components/leads/FormRulesTab.vue`
- Modify: `app/components/leads/InboxFilters.vue`
- Modify: `app/components/leads/SourceIcon.vue`
- Modify: `app/components/leads/SetupGuide.vue`
- Modify: `app/pages/portal/leads.vue`
- Modify: `app/types/index.ts`
- Test: `test/app/leadsEmailEndpoints.test.ts`
- Test: existing Leads and CRM promotion suites

- [ ] Add failing tests for `email` source creation, source filtering, local icon rendering, form-rule lookup, preset-created destinations, advisory possible-duplicate rendering, client portal visibility, and CRM promotion modes.
- [ ] Add failing CRM promotion tests proving email/provider activity titles and opportunity fallback names are not hard-coded as website leads.
- [ ] Add `email` to rule creation source options and explanatory copy.
- [ ] Add `email` to inbox filters and source labels.
- [ ] Render a bundled Lucide mail icon; no remote icon lookup.
- [ ] Show provider and endpoint/form metadata without exposing transport secrets.
- [ ] Show a non-blocking possible-duplicate badge linked only to a same-client lead the viewer is authorised to open; never expose identity hashes or cross-client candidates.
- [ ] Replace hard-coded `Website lead received`, `Created from website lead`, and `Website enquiry` CRM copy with source/provider-aware helpers while preserving existing website wording for genuine website endpoints.
- [ ] Confirm field picker samples redact name, email, phone, mobile, address, and postcode values.
- [ ] Verify `capture_only`, `lightweight_crm`, `full_crm`, `external_crm`, and `analytics_only` behaviours.
- [ ] Verify destination filters can address extracted fields and attribution.
- [ ] Verify a preset-created `assign_user` destination updates canonical lead ownership and that lightweight/full CRM promotion continues to use existing single/round-robin/priority/load-balanced governance.
- [ ] Run Leads, CRM promotion, portal, and measurement regression tests.
- [ ] Commit: `feat(leads): integrate email source across rules and CRM`

### Task 9: Quarantine, durable recovery, retention, and replay

**Files:**

- Modify: `workers/email-lead-intake/src/quarantine.ts`
- Create: `server/utils/leads/emailRecovery.ts`
- Create: `server/api/leads/_internal/recover-email-ingestions.post.ts`
- Modify: `workers/leads-cron/src/index.ts`
- Modify: `wrangler.toml`
- Create: `server/api/leads/email-ingestions/[id]/replay.post.ts`
- Modify: `app/components/leads/EmailEndpointSlideover.vue`
- Test: `test/server/api/leads/email-ingest.test.ts`
- Test: `test/server/utils/leads/emailRecovery.test.ts`
- Test: `test/workers/email-lead-worker.test.ts`

- [ ] Write failing encryption round-trip tests and prove stored R2 bytes do not contain fixture plaintext.
- [ ] Implement per-object random nonce encryption and private random object keys.
- [ ] Bind the private quarantine bucket and encryption secret to both the Email Worker and Pages recovery runtime with least-privilege, environment-specific configuration.
- [ ] Stage encrypted raw MIME only after a durable reservation; delete it immediately for accepted/duplicate outcomes and retain it only for failed/quarantined/non-terminal recovery outcomes with seven-day expiry metadata.
- [ ] Write failing recovery tests for reserved row with missing object, staged object after Worker termination, transient Nitro failure, endpoint disabled before retry, five-attempt exhaustion, seven-day exhaustion, corrupt ciphertext, two concurrent claimers, partial R2/DB failure, and successful idempotent recovery.
- [ ] Implement `FOR UPDATE SKIP LOCKED` recovery claims, policy recheck, decryption, the shared deterministic parser, the same opt-in AI policy/runtime contract, same-identity canonical retry, bounded exponential backoff, terminal quarantine, and safe recovery audit events.
- [ ] Add the cron-authenticated recovery endpoint and fan it out from the existing five-minute `recover-stuck-claims` cron tick without introducing a second cron schedule.
- [ ] Write failing replay tests for RBAC, audit actor, disabled endpoint, expired object, sender restriction, same idempotency identity, and successful recovery.
- [ ] Implement replay through the same parsing/internal ingestion boundaries.
- [ ] Add safe history and replay controls to the endpoint slideover.
- [ ] Ensure successful processing deletes its staged object immediately and scheduled cleanup removes residual objects for terminal accepted/duplicate rows after a crash-before-delete.
- [ ] Reconcile R2 keys to ingestion rows without deriving or exposing tenant identity from object names.
- [ ] Commit: `feat(leads): add durable email recovery and audited replay`

### Task 10: Observability, alerts, retention, and privacy

**Files:**

- Modify: `server/api/leads/_internal/purge-ingestion-errors.post.ts`
- Create: `server/utils/leads/emailHealth.ts`
- Test: `test/server/utils/leads/emailPrivacy.test.ts`
- Test: `test/server/utils/leads/emailHealth.test.ts`
- Test: `test/server/api/leads/emailRetention.test.ts`

- [ ] Write a PII canary test using names, subjects, emails, phones, messages, HTML, and attachment contents; assert none appear in logs/evidence.
- [ ] Add structured event names for receipt, policy, stage reservation, R2 write/delete, parse, AI, canonical acceptance, transport duplicate, possible cross-channel duplicate, recovery claim/outcome, quarantine, replay, and failure.
- [ ] Add endpoint counters, first-response SLA aggregation, possible-duplicate counts, oldest non-terminal age, recovery attempts/exhaustions, and latency aggregation.
- [ ] Implement the failure/security thresholds from FR-055 and FR-056 using existing notification conventions.
- [ ] Implement silence alerts only for endpoints with `expected_max_silence_hours`; test never-used endpoints, naturally low-volume endpoints, newly activated grace, and recovered receipt timestamps.
- [ ] Implement unassigned-lead and first-response-SLA alerts without hard-coding a universal lead volume or response interval.
- [ ] Extend the existing internal ingestion-error purge endpoint for expired nonces and staged-object metadata; retain the existing `leads-cron` schedule.
- [ ] Configure and verify the R2 bucket lifecycle rule as the independent seven-day deletion backstop.
- [ ] Make cleanup idempotent and test partial R2/DB failure recovery plus residual staged-object deletion for terminal accepted/duplicate rows.
- [ ] Add a health query that reconciles `reserved_total = accepted + duplicate + quarantined + terminal_failed + non_terminal`, reports oldest non-terminal age, and keeps pre-policy/policy-denied transport counters separate.
- [ ] Commit: `feat(leads): add email ingestion health and privacy controls`

### Task 11: Runbook, agent context, setup guidance, and marketing

**Files:**

- Create: `docs/runbooks/email-lead-ingestion.md`
- Modify: `AGENTS.md`
- Modify: `app/components/leads/SetupGuide.vue`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue` if top-level copy changes

- [ ] Document Cloudflare zone/subdomain prerequisites, catch-all route, Worker secrets, R2 lifecycle, AI binding, transport boundary, and deployment command.
- [ ] Document address creation, routing presets, expected cadence/SLA, provider forwarding, adapter fixtures, smoke tests, audit queries, recovery, alerts, replay, rotation, retention, and rollback.
- [ ] Add the email source architecture and safety invariants to `AGENTS.md`.
- [ ] Update in-product setup guidance with copyable addresses, provider-neutral instructions, and an explanation that future authenticated transports reuse the same canonical envelope rather than creating another CRM pipeline.
- [ ] Update the public Lead Capture & Routing feature from “five ways in” to include dedicated email ingestion.
- [ ] Describe deterministic ADF/provider parsing and optional AI extraction without claiming autonomous customer replies.
- [ ] Document the provider-adapter authoring contract and require the shared conformance suite for every new adapter.
- [ ] Run a documentation link/path scan and marketing route test.
- [ ] Commit: `docs(leads): document universal email ingestion`

### Task 12: Full verification, migration, deployment, and pilot

**Files:**

- No new product files expected; fixes discovered by verification remain in their owning task area.

- [ ] Re-read every modified/new file end-to-end and complete the `AGENTS.md` deep-dive review.
- [ ] Verify server aliases use `~~/`, USelect values are non-empty, no duplicate UI sections/imports exist, and no remote icons were introduced.
- [ ] Run focused Worker, transport/provider conformance, parser, stage/recovery, duplicate-signal, routing-preset, API, UI, CRM, measurement, portal, and privacy suites.
- [ ] Run the full test suite and record the exact pass/fail baseline.
- [ ] Run `pnpm typecheck` and separate new failures from known baseline errors.
- [ ] Run `pnpm build`.
- [ ] Apply the migration to the target database and verify schema with read-only queries.
- [ ] Deploy the Worker using its scoped package script.
- [ ] Configure Cloudflare Email Routing catch-all only after Worker deploy succeeds.
- [ ] Run `pnpm deploy:check`.
- [ ] Deploy Pages only with `pnpm deploy:production`.
- [ ] Create South Morang `Carsales`, `Website`, and `General` endpoints.
- [ ] Send deterministic ADF, generic labelled, HTML-only, phone-only, duplicate, malformed, and wrong-recipient smoke messages.
- [ ] Terminate a smoke delivery after reservation and after R2 write; prove cron recovery reaches one terminal outcome with one canonical lead.
- [ ] Prove each accepted message appears in Leads, CRM when entitled, measurement outbox, expected destinations, and portal visibility.
- [ ] Prove duplicates create no second lead or delivery.
- [ ] Submit the same customer through email and a second channel; prove both leads remain and only a same-client advisory possible-duplicate relationship is shown.
- [ ] Prove cadence silence, unassigned-lead, first-response-SLA, oldest non-terminal, and exhausted-recovery alerts fire only at their configured thresholds.
- [ ] Prove quarantined raw MIME expires/deletes and does not appear in logs.
- [ ] Record production evidence and remaining provider-specific parser gaps in the PR/rollout notes.
- [ ] Commit any verification-only corrections atomically.

**Final verification commands:**

```bash
pnpm vitest run
pnpm typecheck
pnpm build
pnpm deploy:check
pnpm --dir workers/email-lead-intake run typecheck
pnpm --dir workers/email-lead-intake run test
pnpm --dir workers/email-lead-intake run deploy
pnpm deploy:production
```

---

## 18. Definition of done

The feature is done only when:

- [ ] At least three independent addresses can be active for one client.
- [ ] ADF/XML, generic labelled, direct-customer, HTML-only, and phone-only fixtures work.
- [ ] Every registered provider adapter passes the shared conformance suite and can be added without changing canonical ingestion.
- [ ] The Cloudflare delivery path normalises through the transport-neutral contract; provider parsers do not import Cloudflare event types.
- [ ] Every accepted email travels through `acceptLead()`.
- [ ] Rules, CRM promotion, measurement, notifications, destinations, and portal visibility are proven.
- [ ] Retries and replay produce no duplicates.
- [ ] A staged message orphaned before canonical handoff is recovered or terminally quarantined within the bounded policy.
- [ ] Cross-channel similarity never suppresses a legitimate lead and never returns a cross-client candidate.
- [ ] Routing presets are idempotent, preserve customised conditions, and reuse existing lead/CRM assignment authorities.
- [ ] Silence and first-response alerts honour endpoint-specific cadence/SLA configuration.
- [ ] Cross-client token/idempotency tests pass.
- [ ] Provider relay addresses are never stored as customer addresses.
- [ ] AI remains optional, evidence-bound, and extraction-only.
- [ ] Quarantine raw content is encrypted and deleted within seven days.
- [ ] Logs and audits pass PII canary tests.
- [ ] Operator endpoint management is accessible, responsive, and built entirely with Nuxt UI v4.
- [ ] Setup/runbook/marketing documentation is current.
- [ ] Production pilot evidence is recorded.

---

## 19. Deferred follow-ons

These require separate discovery and approval:

- AI concierge reply drafting with mandatory human approval.
- Autonomous responses with consent, suppression, quiet-hours, and escalation policy.
- Gmail/Outlook OAuth mailbox synchronisation and conversation threading.
- Client self-service endpoint management.
- Custom no-code parser templates.
- Additional authenticated ingress transports such as Postmark, SendGrid, or Mailgun webhooks.
- Provider-native API adapters that supersede email compatibility paths.
- Attachment/document classification beyond ADF/XML.
- Historical mailbox backfill.

---

## 20. Implementation notes from the Toyota reference

Reuse:

- `postal-mime` and bounded raw parsing.
- ADF/XML-first extraction.
- provider-aware attribution;
- phone-only lead acceptance;
- provider ID → Message-ID → stable hash identity;
- ingestion evidence that excludes customer content.

Do not copy:

- direct Worker-to-Neon writes;
- environment-variable dealer fallback;
- readable slug as tenant authority;
- ten-minute customer-email deduplication;
- treating marketplace `From` as the customer;
- raw database payload logging;
- one-address-per-dealer configuration.

---

## 21. Implementation notes from the Knox reference

The Knox Graphify Wiki was queried first for its multi-tenant lead-email,
marketplace-parser, flow-dispatcher, identity-resolution, and dead-letter
communities. Current raw source, migrations, tests, and relevant git history
were then inspected before incorporating any pattern.

Reuse:

- one canonical CRM pipeline for several independent lead-ingestion paths;
- an ordered ADF → provider → generic → optional AI parser chain;
- field-level parser provenance and confidence;
- source-aware automation context after canonical acceptance;
- advisory cross-channel duplicate detection that does not suppress a new enquiry;
- assignment choices expressed through shared platform governance;
- endpoint performance, unassigned-lead, and response-SLA monitoring;
- dead-letter/replay concepts with explicit attempts and safe operator recovery.

Improve before reuse:

- replace the monolithic provider router with a tested, side-effect-free adapter registry;
- replace a universal “no leads for seven days” warning with configurable expected cadence;
- replace reliance on transport rejection/retry with a durable stage reservation, encrypted R2 evidence, and scheduled orphan recovery;
- keep AI before final canonical mapping when needed, evidence-bound, and unable to silently overwrite deterministic fields.

Do not copy:

- readable dealer/category/source addresses as tenant authority;
- parsing tenant identity from hyphen-delimited aliases;
- a shared webhook secret in a query string;
- reading and forwarding complete MIME before endpoint policy authorisation;
- regex-only ADF/XML safety;
- raw Message-IDs, subjects, bodies, headers, or customer values in metadata/logs;
- asynchronous AI enrichment that leaves the canonical lead/contact incomplete;
- an email-only assignment counter or direct enquiry insert;
- provider parsing without focused fixture and conformance tests.

---

## 22. Graphify architecture validation

The dashboard's existing Graphify graph was queried before finalising this PRD. The graph's saved universal-adapter investigations identify `server/utils/leads/intake.ts`, `lead_crm_links`, and the CRM opportunity transition/promotion path as the established seam for turning provider-specific input into CRM records. A second saved investigation confirms that provider-specific behaviour should remain at the signed edge while universal lead intake and CRM promotion remain shared.

The graph also preserves an important distinction: browser form tracking and measurement-only `generate_lead` events do not create canonical `leads`, `crm_people`, `crm_opportunities`, or `lead_crm_links`. Email ingestion must therefore enter through `acceptLead()` and must not be implemented as another tracking-only event.

Raw-source verification of graph nodes found:

- `acceptLead()` invokes `leadIntakeService.ingest()`, publishes the measurement outbox, enqueues `rules.evaluate`, conditionally enqueues `crm.promote`, and sends new-lead notifications.
- `server/utils/leads/dispatch.ts` is the queue bridge for both rule delivery and CRM promotion.
- `crmPromotion.ts` already provides tenant-scoped person matching, opportunity creation, and `lead_crm_links` idempotency.
- `crmPromotion.ts` currently contains website-specific activity and fallback copy, which Task 8 must make source-aware.
- `FormRulesTab.vue`, the lead source constraints, and `LeadSource` are explicit extension points for the new `email` source.

The installed Graphify CLI is older than the available skill and its structural graph does not connect every aliased TypeScript import/call edge. Consequently, Graphify was used for dependency discovery and prior architectural context; every architectural claim above was verified against current raw source before inclusion.
