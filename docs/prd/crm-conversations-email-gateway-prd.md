# CRM Conversations and Email Gateway PRD

Status: Approved for incremental implementation
Owner: XeroFlow Agency
Created: 2026-07-30
Last updated: 2026-07-30
Implementation ledger: This document

## 1. Objective

Build a tenant-safe, two-way transactional email channel inside the XeroFlow
CRM. A client operator must be able to receive an email-originated lead, reply
from the CRM, see the complete threaded conversation, and know whether each
outbound message was delivered, deferred, bounced, rejected, or complained
about.

The feature must also provide a compatibility path for external systems that
can send only through SMTP or a simple HTTP API. It is not a general-purpose
mailbox, an IMAP replacement, or a bulk marketing platform.

## 2. Users and jobs to be done

### Client CRM operator

- Receive email leads in the same CRM used for web, Meta, Google, phone, and
  manually entered leads.
- Reply without opening a separate mailbox.
- See inbound and outbound messages in one chronological conversation.
- Know whether the recipient received the message.
- Respect contact preferences without relying on human memory.

### Agency operator

- Configure sending and reply domains for a client.
- Diagnose inbound routing, sending, bounce, and complaint failures.
- Reprocess safe failed events without duplicating messages.
- Audit which human or system sent every message.

### Integration operator

- Connect a website, DMS, legacy CRM, form plugin, or other provider that can
  submit through SMTP or HTTP.
- Receive a tenant-specific credential that cannot impersonate another client.
- Correlate accepted submissions with XeroFlow message identifiers.

## 3. Product decisions

### 3.1 Cloudflare responsibilities

- Email Routing and an Email Worker receive inbound messages.
- The Workers `send_email` binding sends XeroFlow-native transactional email.
- Email Sending event subscriptions publish outbound delivery events to a
  Cloudflare Queue.
- R2 stores encrypted or access-controlled raw MIME and attachments when
  retention policy permits.
- SMTP on `smtp.mx.cloudflare.net:465` is a compatibility transport for systems
  that already speak SMTP.

References:

- [Cloudflare SMTP sending](https://developers.cloudflare.com/email-service/api/send-emails/smtp/)
- [Cloudflare SMTP concepts](https://www.cloudflare.com/learning/email-security/what-is-smtp/)
- [Email Workers handler](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/)
- [Email event subscriptions](https://developers.cloudflare.com/email-service/platform/event-subscriptions/)
- [Email headers](https://developers.cloudflare.com/email-service/reference/headers/)
- [Email Service limits](https://developers.cloudflare.com/email-service/platform/limits/)

### 3.2 XeroFlow responsibilities

- Neon remains the canonical CRM, conversation, message, audit, consent, and
  delivery-state store.
- XeroFlow resolves tenants from server-owned routing configuration. It never
  trusts a client ID supplied in an inbound email.
- XeroFlow generates and validates opaque HMAC-signed reply addresses.
- XeroFlow enforces `do_not_contact`, `do_not_email`, suppression, permission,
  sender-identity, and rate-limit policy before sending.
- XeroFlow maps Cloudflare lifecycle events to canonical delivery states
  idempotently.

### 3.3 Transport boundaries

- SMTP sends email; it does not provide mailbox retrieval or mailbox sync.
- XeroFlow-native CRM email uses the Workers binding rather than SMTP.
- Direct Cloudflare API tokens are never distributed to clients. Cloudflare
  account tokens can address multiple onboarded domains and have an
  unacceptable cross-tenant blast radius.
- External integrations authenticate to a future XeroFlow-owned compatibility
  gateway. That gateway authorizes a tenant and sender before dispatch.
- Existing Resend-backed bulk email marketing remains separate. Cloudflare
  Email Service is used for transactional CRM communication.

## 4. Scope

### In scope

- Provider-neutral conversations and messages.
- Inbound email reply routing and lead-to-conversation promotion.
- Outbound human-authored transactional CRM email.
- Message threading through `Message-ID`, `In-Reply-To`, and `References`.
- Delivery, bounce, rejection, failure, deferral, and complaint updates.
- Contact-preference and suppression enforcement.
- Safe attachment metadata and R2 object references.
- Agency and client-portal conversation UI.
- Tenant configuration, operational health, replay, and audit.
- Tenant-scoped SMTP/HTTP compatibility credentials.
- AI extraction and human-reviewed reply drafts after deterministic delivery is
  production-proven.

### Out of scope

- IMAP, POP, or synchronising a user's existing mailbox.
- Calendar invitation management.
- Bulk campaigns, newsletters, or marketing automation migration from Resend.
- Autonomous AI sales conversations in the initial release.
- Allowing clients to bring or view raw Cloudflare account API tokens.
- Storing raw MIME indefinitely.

## 5. Architecture

### 5.1 Canonical entities

`crm_conversations` represents one channel-neutral customer thread. It belongs
to exactly one client and may link to a CRM person, company, lead, and
opportunity.

`crm_messages` represents one inbound or outbound message. It stores canonical
content, participants, provider correlation identifiers, threading headers,
delivery state, and audit metadata.

`crm_message_events` is an append-only, idempotent lifecycle ledger. The
current status on `crm_messages` is a projection of accepted events.

`crm_email_routes` maps an opaque inbound local-part to a client and optionally
a conversation. Tokens are stored as hashes, not plaintext.

`crm_email_credentials` stores metadata and one-way hashes for XeroFlow-issued
SMTP/API compatibility credentials. Secret material is shown only at creation.

The existing `crm_communications` table remains the unified lightweight
timeline. During migration, each canonical message projects one communication
row using a stable external ID. Existing manual communication rows are not
rewritten.

### 5.2 Inbound flow

1. Cloudflare Email Routing invokes the email Worker.
2. The Worker validates recipient format and a signed routing token.
3. It rejects messages over configured limits before loading large bodies.
4. Postal MIME parsing extracts safe headers, text, HTML, and attachment
   metadata.
5. Raw MIME and permitted attachments are stored in R2 before asynchronous
   processing.
6. A signed internal request or Queue message carries only canonical routing
   identifiers and object keys.
7. Nitro resolves the route, deduplicates the provider message ID, matches or
   creates the CRM identity under existing lead policy, and appends the message.
8. The message projects into `crm_communications` and notifies the assigned
   operator.

Unknown or invalid routing tokens never disclose whether a client or
conversation exists.

### 5.3 Outbound flow

1. An authenticated agency or portal user submits a message draft.
2. Nitro derives the client from the authenticated session and checks CRM
   permissions.
3. Recipient ownership, contact preferences, canonical suppressions,
   sender identity, attachment policy, and rate limits are enforced.
4. A pending message and immutable audit event are committed before dispatch.
5. A Queue consumer renders the final MIME and sends through a `send_email`
   binding.
6. The Cloudflare message identifier and Internet `Message-ID` are persisted.
7. Delivery events update the message projection idempotently.

An accepted API request means queued, not delivered.

### 5.4 Reply addressing and threading

Reply addresses use an opaque versioned token:

`reply+<version>.<opaque-id>.<signature>@reply.<configured-domain>`

The signature is HMAC-SHA256 over the version, opaque identifier, and intended
domain. Validation uses constant-time comparison. Database IDs, client names,
email addresses, and opportunity IDs never appear in the address.

Outbound replies persist and emit `Message-ID`, `In-Reply-To`, and
`References`. Subject-line matching is a fallback diagnostic only and never
the authoritative thread key.

### 5.5 Delivery state

Canonical states:

- `draft`
- `queued`
- `sending`
- `sent`
- `delivered`
- `deferred`
- `bounced`
- `failed`
- `rejected`
- `complained`
- `cancelled`

Terminal negative states are `bounced`, `failed`, `rejected`, `complained`, and
`cancelled`. A duplicated or older provider event must not move a message
backward from a terminal state. Every provider event is retained in
`crm_message_events`, even when it does not change the projection.

`delivered` rejects stale deferral, bounce, or transport-failure events, but a
later recipient complaint supersedes delivery and triggers suppression.

### 5.6 Attachments and content safety

- Attachment bytes live in R2; Postgres stores metadata and object keys.
- Downloads use authenticated, short-lived signed URLs.
- Executable and dangerous archive types are rejected.
- Malware scanning must complete before an outbound attachment is sent or an
  inbound attachment becomes downloadable.
- HTML is sanitised for CRM display. Scripts, remote embeds, forms, and event
  handlers are removed.
- Raw MIME retention defaults to 30 days and is configurable only within the
  platform retention policy.
- Operational logs never contain raw bodies, tokens, or attachment contents.

### 5.7 AI boundary

AI initially performs:

- structured field extraction,
- intent and urgency classification,
- duplicate and spam signals,
- conversation summary,
- a suggested reply requiring human approval.

Email content is untrusted input. AI cannot choose arbitrary recipients,
change consent, expose tools, send autonomously, or obey instructions embedded
in a received message that conflict with system policy.

## 6. API contracts

Initial internal contracts:

- `POST /api/crm/conversations/:id/messages` queues an outbound message.
- `GET /api/crm/conversations/:id/messages` returns a tenant-scoped thread.
- `POST /api/internal/crm-email/inbound` accepts a Worker-authenticated inbound
  envelope.
- `POST /api/internal/crm-email/events` accepts Queue-normalised delivery
  events when direct Queue consumption is unavailable.
- Portal equivalents derive the client exclusively from `requireClientAuth`.

All mutation endpoints accept or generate an idempotency key. Provider payloads
are normalised at the boundary and do not leak into frontend contracts.

## 7. Configuration

Feature flags default off:

- `CRM_EMAIL_CONVERSATIONS_ENABLED`
- `CRM_EMAIL_OUTBOUND_ENABLED`
- `CRM_EMAIL_AI_DRAFTS_ENABLED`
- `CRM_EMAIL_COMPAT_GATEWAY_ENABLED`

Required production configuration will include:

- a versioned HMAC reply-routing secret,
- Worker-to-Nitro authentication,
- a Cloudflare Queue binding,
- a `send_email` binding,
- R2 bindings for retained MIME and attachments,
- per-environment sending and reply domains.

No secret is committed or returned by a read endpoint.

## 8. User experience

The existing communications panel becomes a thread-aware conversation view:

- message cards distinguish inbound and outbound,
- delivery state and failure reason are visible,
- replies quote or reference the selected message,
- attachments show scanning state,
- contact preference blocks have an actionable explanation,
- retry is available only for safe retryable failures,
- manual calls, meetings, SMS, and notes remain in the combined activity
  timeline.

All form work must use Nuxt UI v4 and the project's mandatory form layout
conventions. The UI remains hidden until the end-to-end backend path is proven.

## 9. Observability and privacy

Record:

- accepted, rejected, deduplicated, and processing counts,
- queue latency and age,
- delivery-state counts and transition latency,
- bounce and complaint rates by sending domain,
- invalid reply-token counts without logging the token,
- send blocks by policy category,
- replay and administrative actions.

Cloudflare event/log data can contain sender, recipient, subject, and message
identifiers. XeroFlow stores only data necessary for the CRM purpose and applies
tenant access control and retention to it.

## 10. Testing strategy

- Vitest unit tests for token signing, state transitions, MIME normalisation,
  consent decisions, and idempotency.
- Database contract tests for migration constraints and indexes.
- API tests for agency and portal tenant isolation.
- Worker tests for valid routes, invalid signatures, oversized messages,
  duplicate delivery, and auto-reply/loop handling.
- Integration tests with fake Cloudflare binding and Queue implementations.
- A production smoke test using a dedicated test client and destination.
- No release decision may rely only on mocked Postgres. Database constraints
  must be verified against the configured Neon database.

## 11. Commands

```bash
# Focused tests
pnpm exec vitest run test/crm test/server/utils/crm

# Type check (known baseline errors must be compared, not silently attributed)
pnpm run typecheck

# Production build
pnpm run build

# Apply a migration; DATABASE_URL is production in this repository
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/<migration>.sql

# Safe deployment path only
pnpm deploy:check
pnpm deploy:production
```

## 12. Boundaries

### Always

- Derive client scope from authenticated server-owned context.
- Test first and observe the expected failure.
- Keep migrations additive and idempotent.
- Verify every migration against live Postgres constraints.
- Enforce contact preferences and suppression before queuing.
- Store provider event receipts idempotently.
- Keep incomplete behavior disabled by default.
- Update this ledger after every completed slice.

### Ask first

- Enabling outbound production sending.
- Adding or changing a production sending domain.
- Changing retention beyond the approved default.
- Enabling AI-generated automatic responses.
- Migrating bulk email away from Resend.

### Never

- Give a client a Cloudflare account API token.
- Trust a client ID from an inbound recipient, header, or payload.
- Send before recording an auditable pending message.
- Use a subject line as the authoritative thread identifier.
- Log raw MIME, message bodies, credentials, or signed reply tokens.
- Expose unscanned attachments.

## 13. Acceptance criteria

- [ ] An inbound reply with a valid route is appended exactly once to the
      correct client's conversation.
- [ ] An invalid or cross-tenant route cannot reveal or mutate CRM data.
- [ ] An authorised portal user can queue a compliant email to a person in
      their own client account.
- [ ] A user cannot send to a contact with `do_not_contact` or `do_not_email`.
- [ ] Outbound mail contains persistent threading headers and a secure reply
      address.
- [ ] Cloudflare delivery events update the correct message idempotently.
- [ ] Bounce, complaint, and rejection states are visible in the CRM.
- [ ] External SMTP/API credentials are tenant-scoped and revocable.
- [ ] Marketing campaigns continue through the existing provider unchanged.
- [ ] Attachment downloads require authorisation and a completed clean scan.
- [ ] Feature flags prevent incomplete paths from appearing in production.
- [ ] Production smoke proof covers database constraints, inbound routing,
      outbound sending, reply capture, and delivery events.

## 14. Implementation task ledger

### Phase A — Foundation

- [x] A1. Add additive conversation, message, message-event, attachment, route,
      sender-identity, and compatibility-credential tables.
- [x] A2. Add provider-neutral TypeScript contracts and delivery-state rules.
- [x] A3. Add secure reply-token generation and validation with key versioning.
- [x] A4. Add tenant-scoped repositories and idempotent message/event writes.
- [x] A5. Project canonical messages into `crm_communications` without
      duplicating existing bridge rows.

### Phase B — Inbound email

- [x] B1. Refactor the existing Email Routing Worker into board, lead, and CRM
      reply adapters without changing existing board ingestion.
- [x] B2. Reject invalid routes and enforce MIME/attachment size limits.
- [x] B3. Store raw MIME and attachment objects in R2 with retention metadata.
      Writes are awaited, checksummed, private/no-store, scan-pending, and
      rolled back on partial storage or rejected Nitro handoff. Production
      binding and lifecycle activation remain gated.
- [x] B4. Add the authenticated inbound boundary and idempotent Queue workflow.
      The fail-closed Nitro endpoint verifies Worker authentication and
      domain-bound route tokens, resolves tenant ownership from Postgres, and
      emits a minimal deterministic job to the dedicated B5 Queue consumer.
- [x] B5. Match inbound senders to CRM people and promote lead context safely.
      The dedicated Queue consumer verifies retained MIME integrity, passes a
      bounded plain-text envelope to Nitro, then transactionally creates or
      recovers the lead, CRM promotion, conversation, message, attachment
      manifests, received event, compatibility communication, and route-use
      timestamp. Production bindings and feature flags remain disabled.
- [x] B6. Detect auto-replies, bounces, mailing lists, and mail loops.
      The Email Worker applies RFC-based, bounded-header classification before
      R2 storage and repeats it at Queue consumption. Non-human CRM mail is
      silently acknowledged without creating leads or messages, preventing
      rejection-driven response loops.

### Phase C — Outbound transactional email

- [x] C1. Add a provider-neutral transactional email interface.
      Canonical prepared-message, attachment, provider, and controlled outcome
      contracts do not depend on Cloudflare and accept future SMTP/providers.
- [x] C2. Implement the Cloudflare `send_email` binding adapter.
      The dormant Worker adapter uses official Cloudflare types and maps
      documented failures without exposing provider diagnostics. No sending
      domain or deployable binding is configured.
- [x] C3. Add sender identity, recipient, permission, preference, suppression,
      and rate-limit policy. The provider-neutral, fail-closed boundary accepts
      only server-derived actor authority, resolves canonical tenant-owned
      people and ready tenant sender identities, enforces contact preferences
      and global suppressions, and atomically consumes hashed per-actor
      minute/day Postgres buckets before granting dispatch.
- [ ] C4. Add the Queue-backed outbound service and durable audit transition.
- [ ] C5. Generate MIME with persistent threading, secure reply headers, and
      the `X-XeroFlow-Origin: crm-email-gateway` loop marker consumed by B6.
- [ ] C6. Add attachment scan gating.

### Phase D — Delivery lifecycle

- [ ] D1. Configure Cloudflare Email Sending event subscription to a Queue.
- [ ] D2. Normalise delivered, deferred, bounced, failed, rejected, and
      complained events.
- [ ] D3. Persist event receipts and enforce monotonic state projection.
- [ ] D4. Add suppression updates for hard bounces and complaints.
- [ ] D5. Add operational metrics, alerts, replay, and dead-letter inspection.

### Phase E — CRM and portal experience

- [ ] E1. Add tenant-scoped conversation list and message APIs.
- [ ] E2. Replace email logging with a real Nuxt UI composer behind the feature
      flag while preserving manual logging for other channels.
- [ ] E3. Add threaded message cards, delivery badges, failure details, and
      reply actions.
- [ ] E4. Add attachment scan/download UI.
- [ ] E5. Add agency configuration and health screens.
- [ ] E6. Add client portal permissions and onboarding guidance.
- [ ] E7. Update feature and marketing pages when the feature becomes
      customer-visible.

### Phase F — Compatibility gateway

- [ ] F1. Define tenant-scoped SMTP/HTTP credential issuance and rotation.
- [ ] F2. Implement an HTTP submission gateway and provider-neutral result.
- [ ] F3. Evaluate or implement an SMTP listener/proxy only where HTTP cannot
      satisfy the client integration.
- [ ] F4. Add per-credential sender, recipient, rate, and network policies.
- [ ] F5. Add credential audit, revocation, and integration health.

### Phase G — AI assistance

- [ ] G1. Add deterministic extraction and classification evaluation data.
- [ ] G2. Add sanitised AI summaries and structured lead-field suggestions.
- [ ] G3. Add human-reviewed reply drafts behind a separate feature flag.
- [ ] G4. Add prompt-injection, data-exfiltration, and unsafe-recipient
      guardrail evaluations.
- [ ] G5. Define a separately approved rollout before any autonomous response.

### Phase H — Production readiness

- [ ] H1. Run full suite, typecheck baseline comparison, and production build.
- [ ] H2. Apply and verify every database migration against Neon.
- [ ] H3. Configure SPF, DKIM, DMARC, bounce, sending, and reply domains.
- [ ] H4. Run an end-to-end test across inbound, outbound, reply, delivery,
      bounce, complaint, suppression, and tenant isolation.
- [ ] H5. Document rollback, incident response, retention, and credential
      rotation runbooks.
- [ ] H6. Enable for one allowlisted test client, observe, then expand.

## 15. Progress log

### 2026-07-30

- Cloudflare SMTP, Email Routing, Email Sending, event subscription, limits,
  threading-header, logging, and subdomain guidance reviewed.
- Existing email-to-board Worker, CRM communication log, contact preferences,
  Resend marketing boundary, and lead-ingestion paths inspected. No deployed
  lead-email adapter existed; that remains part of Phase B.
- Architecture approved: Email Routing inbound, Workers binding outbound,
  XeroFlow-owned tenant compatibility gateway, Neon canonical store.
- Isolated implementation branch created from `b932c302`.
- PRD, approved design, and first-slice implementation plan committed as
  `542fa3d8`.
- Migration 288 followed a failing-then-passing three-test contract cycle and
  was committed as `da38c3c5`.
- Migration 288 executed successfully twice against the configured Neon
  database. Live catalog proof confirmed all seven tables, tenant/provider
  message and event idempotency indexes, and
  `crm_messages_delivery_status_check` in the `public` schema.
- Provider-neutral envelope and delivery projection followed a
  failing-then-passing test cycle and were committed as `2bfcb8e8`.
- Lifecycle review added explicit proof that `delivered` cannot regress on a
  stale deferral or bounce, while a later complaint supersedes delivery.
- Focused slice verification passed: 3 files and 13 tests.
- The final broader repository suite completed with 1,116 files and 6,305 tests
  passing, 2 files and 4 tests skipped, and 17 files / 36 tests failing. All
  reported failures are outside the files changed by this slice and include
  existing component harness, role-permission, Groq mock, social-spend, and
  deployment-contract failures. No CRM email foundation test failed.
- Versioned reply tokens now use a 192-bit opaque route key, domain-bound
  HMAC-SHA256, a 256-bit minimum secret, constant-time signature comparison,
  and a SHA-256 lookup hash. No tenant or CRM record identifier appears in the
  token or verification result.
- Reply-token tests cover rotation, domain binding, tampering, malformed input,
  fresh randomness, and canonical base64url encoding. The canonical-encoding
  test caught and closed an alternate-padding representation edge case before
  commit `0f8e0bc6`.
- Final focused verification for A1-A3 passed: 4 files and 18 tests. All five
  changed TypeScript/test files also pass the repository ESLint rules; lint-only
  alignment was committed as `c994fe93`.
- A4 added a dependency-injected Postgres repository with tenant scope on every
  lookup and mutation. Conversation/message creation, idempotency-key recovery,
  provider-identifier race recovery, locked event append, cross-message event
  conflict reporting, and monotonic delivery projection were implemented in
  commits `4d22421a` and `ce07bd73`.
- A4 followed failing-then-passing test cycles: the repository initially failed
  module resolution, then seven event cases failed because
  `appendMessageEvent()` did not exist. The final focused repository, token,
  contract, migration, and legacy CRM communications run passed 5 files and 29
  tests; focused ESLint and `git diff --check` passed; `pnpm run typecheck`
  completed with no reported errors.
- A rollback-only live Neon smoke used two existing tenant records and the
  production repository code. It created exactly one conversation, message,
  and event; repeated keys returned `existing` and `duplicate`; delivery
  advanced from `queued` to `sent`; and a second tenant's attempt to reference
  the first tenant's conversation was rejected by PostgreSQL with a foreign-key
  violation. A separate post-rollback query confirmed zero retained
  conversations, messages, or events for the smoke identifiers.
- A5 projects each newly-created canonical email into the existing
  `crm_communications` timeline inside the same transaction when its
  conversation is linked to a CRM person or company. The bridge uses
  `source = 'email_bridge'`, a stable `crm_message:<uuid>` external ID, plain
  text only, and canonical-ID-only metadata. Projection and atomic repository
  integration were committed as `2f901623` and `a3325dcb`.
- A5 followed a failing-then-passing test cycle: the projection helper first
  failed module resolution, then repository integration failed on the missing
  fourth in-transaction query. Final focused verification passed 7 files and
  41 tests; focused ESLint and `git diff --check` passed; Nuxt typecheck
  completed without reported errors.
- A rollback-only live Neon A5 smoke used an existing CRM person. One canonical
  inbound message created exactly one correctly tenant/person-mapped
  `email_bridge` row; both message retry and explicit projection retry were
  idempotent; the legacy body contained plain text rather than HTML; and
  metadata contained only canonical type, message ID, and conversation ID.
  Post-rollback counts confirmed zero retained conversations, messages, or
  communications.
- Current Cloudflare Email Worker API, inbound limits, and subaddressing
  documentation were rechecked before starting Phase B. Cloudflare exposes
  `rawSize` before stream consumption and rejects inbound messages above
  25 MiB; XeroFlow now applies a lower 10 MiB default ceiling before reading
  MIME, with a hard 25 MiB configuration cap.
- B2 is complete. Pure guards recognise existing `board-` routes and future
  signed `lead+` / `reply+` routes, reject malformed or disabled routes before
  reading the stream, and enforce 10-attachment, 5 MiB-per-file, and
  8 MiB-combined parsed attachment limits.
- B1 is partially complete only: the board delivery path was extracted without
  changing its Nitro request contract, while lead and CRM reply routes remain
  deliberately disabled. B1 stays unchecked until B4 provides the
  authenticated, idempotent inbound boundary and both adapters reach it.
- Route/safety and board-adapter checkpoints were committed as `f11d0bec` and
  `6d0a356c`. The guarded handler followed an eight-failure TDD cycle. Final
  Worker-focused verification passed 3 files and 26 tests. The final combined
  Worker/CRM verification passed 10 files and 67 tests; focused ESLint,
  `git diff --check`, and Nuxt typecheck passed. A Wrangler dry-run
  successfully bundled the Worker at 112.45 KiB (27.06 KiB gzip) without
  deploying it.
- Migration 289 added `email` to the canonical lead and lead-rule source
  constraints. It was applied to the configured Neon database, both live
  constraints were read back successfully, and its rollback-only smoke
  retained zero rows.
- B5 is complete behind disabled production bindings and flags. The Email
  Worker Queue consumer reads the exact retained MIME object, enforces the
  10 MiB ceiling, verifies its SHA-256 digest, parses with PostalMime, and
  sends only a strict bounded plain-text envelope to the authenticated Nitro
  processing endpoint. HTML, raw MIME bytes, and attachment bytes never cross
  that boundary.
- The Nitro processor revalidates the route and tenant under a row lock, uses
  transaction-scoped advisory locks for message idempotency, ingests an
  `email` lead, invokes the existing CRM promotion policy, and atomically
  persists the canonical conversation, message, pending attachment manifests,
  received event, compatibility communication, and monotonic route-use time.
  Reply routes attach directly to their pre-authorised conversation.
- Final B5 verification passed 13 focused files and 99 tests, scoped ESLint,
  and `git diff --check`. Repository-wide Nuxt typecheck still reports its
  existing broad baseline (807 diagnostics in the current checkout), but none
  reference a B5 file. A Wrangler dry-run bundled the Worker at 682.26 KiB
  (112.44 KiB gzip) without deploying it and reported only the existing
  `API_URL` binding.
- A rollback-only live Neon B5 smoke created exactly one lead, CRM link,
  conversation, message, received event, pending attachment, and compatibility
  communication; repeated delivery returned `duplicate`; cross-tenant and
  revoked routes returned `route_unavailable`; and route use was recorded.
  A post-rollback query confirmed zero retained smoke rows.
- The production Queue, DLQ, Queue producer, private R2 binding and lifecycle,
  Worker secret, feature flags, and deployment remain deliberately
  unconfigured. No production activation occurred during B5.
- B6 is complete. PostalMime now exposes only six bounded classification
  signals rather than forwarding the complete header set. The pure decision
  table prioritises XeroFlow-origin loops, then RFC 3464 delivery-status MIME,
  RFC 3834 `Auto-Submitted`, and RFC 2919 `List-Id` with legacy
  `Precedence: list|bulk|junk` fallback.
- Automatic responses, delivery reports, mailing-list traffic, and marked
  XeroFlow loops on CRM routes are silently acknowledged before attachment
  rejection or R2 storage, so the Worker does not generate rejection-driven
  response loops. Existing board ingestion is unchanged. The Queue repeats
  classification for already-retained jobs, acknowledges deterministic
  suppressions only after deleting their exact R2 objects, retries deletion
  failures, and logs only controlled reason codes.
- B6 verification passed 10 focused files and 96 tests, scoped ESLint, and
  `git diff --check`. Repository-wide Nuxt typecheck remains at the same
  807-diagnostic baseline with no B6 file referenced. A Wrangler dry-run
  bundled the Worker at 685.75 KiB (113.35 KiB gzip), reported only the
  existing `API_URL` binding, and did not deploy.
- Production remains disabled and unconfigured. C5 must emit the
  `X-XeroFlow-Origin: crm-email-gateway` header on future outbound MIME so the
  B6 loop marker becomes active end to end.
- Cloudflare Email Service Workers API, send-binding restrictions, supported
  headers, limits, and error contracts were rechecked from current official
  documentation before Phase C. The read-only account prerequisite check
  returned `No sending subdomains found in this account`.
- C1 is complete. `PreparedCrmTransactionalEmail` models participants,
  threading/loop headers, required plain text, optional HTML, and
  inline/regular attachments without Cloudflare naming. Provider outcomes are
  canonical `accepted`, `retryable`, or `permanent_failure`, and the provider
  identifier remains open for tenant SMTP and future adapters.
- C2 is code-complete but dormant. The Cloudflare adapter uses the official
  `SendEmail` overload-derived builder, translates named/unnamed participants
  and attachments without mutation, preserves exact bounded message IDs, maps
  documented retryable/permanent `E_*` codes, and reduces unknown failures to
  a controlled retryable class without logging provider messages.
- The new strict Email Worker TypeScript configuration passes. Adding it also
  closed two latent strictness gaps in the existing Worker: the Queue message
  generic is now explicit and PostalMime group narrowing is null-safe.
- C1–C2 verification passed 5 focused files and 70 tests, scoped ESLint,
  strict Worker typecheck, and `git diff --check`. A Wrangler dry-run bundled
  at 685.75 KiB (113.34 KiB gzip), reported only `API_URL`, and did not deploy.
- No `send_email` binding, sender address, domain, credential, Queue producer,
  feature flag, or public/marketing surface was added.
- C3 is complete. Outbound policy accepts only a server-derived `canSend`
  decision and a person/address pair, then resolves the non-deleted person and
  ready sender inside the same client. Missing and cross-tenant resources use
  indistinguishable controlled denials. `do_not_contact`, `do_not_email`, and
  every canonical suppression reason block before rate consumption.
- C3 rate limits are fail-closed and atomically capped at 30 messages per
  actor/client minute and 500 per actor/client day. Bucket keys namespace and
  hash the client/actor tuple rather than storing actor IDs in operational
  keys. Repository errors are reduced to `policy_unavailable` without logging
  contact or database diagnostics.
- C3 verification passed 5 focused files and 59 tests, scoped ESLint, strict
  Worker typecheck, and `git diff --check`. Repository-wide Nuxt typecheck
  remains at the existing 807-diagnostic baseline with no C3 file referenced.
  A Wrangler dry-run remained 685.75 KiB (113.34 KiB gzip), reported only
  `API_URL`, and did not deploy.
- A rollback-only live Neon proof verified the atomic limiter: the first slot
  was allowed, the second was denied at the limit without incrementing beyond
  one, and rollback retained zero rows.
- C4–C6 remain the activation-blocking durable dispatch, MIME/threading, and
  attachment-scan work. C3 adds no endpoint or path capable of sending email.
