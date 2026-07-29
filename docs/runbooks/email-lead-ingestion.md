# Universal email lead ingestion runbook

## Purpose and ownership

Universal email ingestion turns provider notification emails into the same
canonical lead pipeline used by webhooks, CSV imports, and manual capture. It
does not create a second CRM path and it does not reply to, message, or draft
responses for customers.

Primary implementation paths:

- Email Routing Worker: `workers/email-lead-intake/`
- Shared contracts, MIME parsing, adapters, and telemetry:
  `shared/leads/email/`
- Signed Nitro boundary: `server/api/internal/leads/email-*.post.ts`
- Endpoint and replay APIs: `server/api/leads/email-endpoints/` and
  `server/api/leads/email-ingestions/`
- Canonical ingestion, recovery, and health:
  `server/utils/leads/emailIngestion.ts`,
  `server/utils/leads/emailRecovery.ts`, and
  `server/utils/leads/emailHealth.ts`
- Scheduled fan-out: `workers/leads-cron/`
- Schema: migrations 315–324

## Safety invariants

- Endpoint and client identity come from the server-side recipient token, never
  from message content, headers, an AI result, or a provider hint.
- Provider identity, Message-ID, and fallback external identity are hashed
  before the Worker sends the canonical envelope.
- Deterministic parsing is the default. AI extraction is optional fallback
  capability only when the platform binding and endpoint privacy approval are
  enabled; it is not a customer-reply feature and is not currently exposed as a
  general setup-guide toggle.
- Raw MIME is read once, encrypted before storage, and retained only when
  canonical handling cannot safely finish. R2 is private and has a seven-day
  lifecycle backstop.
- The Worker, recovery job, and manual replay reuse one endpoint-scoped
  idempotency identity. Cross-channel similarity is advisory; it never silently
  suppresses or merges a newly accepted lead.
- Logs, alerts, audits, portal views, and health responses contain only bounded
  identifiers, enums, counts, and timings—not subjects, bodies, names, contact
  details, attachments, raw exceptions, or storage keys.
- Future authenticated transports must produce the shared canonical envelope
  and call the existing canonical boundary. Do not insert leads directly or
  create another routing/CRM pipeline.

## 1. Cloudflare prerequisites

### DNS and Email Routing

The generated addresses use the exact receiving domain
`leads.xeroflow.io`. Before enabling traffic:

1. Confirm the receiving domain is served by Cloudflare DNS.
2. In **Compute → Email Service → Email Routing**, onboard the receiving
   domain and accept Cloudflare's managed MX and authentication records.
3. Wait for Email Routing to report the domain enabled. Inspect DNS rather than
   copying MX/TXT values from another zone.
4. Deploy the `email-lead-intake` Worker.
5. Under **Email Routing → Routing Rules**, enable the
   `*@leads.xeroflow.io` catch-all and set its action to
   **Send to a Worker → email-lead-intake**.
6. Send an unknown-recipient test. It must be rejected without an endpoint
   lookup or retained raw object.

Cloudflare requires its DNS for Email Routing and manages the receiving
MX/authentication records during onboarding. See the official
[Email Routing setup](https://developers.cloudflare.com/email-service/get-started/route-emails/)
and [routing-rule/catch-all guide](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/).

Do not enable the catch-all during a dark deployment. It is the global intake
switch and the first rollback control.

### Private R2

The exact buckets and binding are:

| Environment | Bucket | Binding |
|---|---|---|
| Production | `email-lead-quarantine` | `EMAIL_QUARANTINE_BUCKET` |
| Preview | `email-lead-quarantine-preview` | `EMAIL_QUARANTINE_BUCKET` |

For both buckets verify:

- `r2.dev` public access is disabled;
- no custom domain is attached;
- lifecycle rule `delete-email-ingestion-evidence-after-7-days` expires
  objects seven days after upload;
- Wrangler's unrelated default multipart-abort rule remains present.

```bash
pnpm exec wrangler r2 bucket lifecycle list email-lead-quarantine
pnpm exec wrangler r2 bucket lifecycle list email-lead-quarantine-preview
pnpm exec wrangler r2 bucket dev-url get email-lead-quarantine
pnpm exec wrangler r2 bucket dev-url get email-lead-quarantine-preview
pnpm exec wrangler r2 bucket domain list email-lead-quarantine
pnpm exec wrangler r2 bucket domain list email-lead-quarantine-preview
```

R2 lifecycle is an independent deletion backstop, not a substitute for
delete-before-database-clear cleanup.

## 2. Runtime bindings and secrets

`workers/email-lead-intake/wrangler.jsonc` supplies:

- `APPLICATION_ORIGIN`
- `EMAIL_QUARANTINE_BUCKET`
- optional Workers AI binding `AI`
- required secrets `EMAIL_INGEST_HMAC_SECRET` and
  `EMAIL_QUARANTINE_ENCRYPTION_SECRET`

Configure secrets without printing them:

```bash
cd workers/email-lead-intake
pnpm exec wrangler secret put EMAIL_INGEST_HMAC_SECRET --config wrangler.jsonc
pnpm exec wrangler secret put EMAIL_QUARANTINE_ENCRYPTION_SECRET --config wrangler.jsonc
```

Configure the same HMAC secret as the Pages runtime binding
`EMAIL_INGEST_HMAC_SECRET`. Configure the same encryption secret as
`EMAIL_QUARANTINE_ENCRYPTION_SECRET` on Pages so recovery can decrypt Worker
evidence. Pages also requires `EMAIL_QUARANTINE_BUCKET`, `AI`, and
`RATE_LIMITER` bindings. The two secrets must differ from each other.

Configure `INTERNAL_CRON_TOKEN` as the same secret on Pages and
`workers/leads-cron`. Optional alert settings are:

- `EMAIL_INGESTION_NOTIFY_ALLOWLIST` (falls back to
  `ANOMALY_NOTIFY_ALLOWLIST`);
- `EMAIL_INGESTION_UNKNOWN_RECIPIENT_THRESHOLD`;
- `EMAIL_INGESTION_SIGNATURE_FAILURE_THRESHOLD`;
- `EMAIL_INGESTION_R2_FAILURE_THRESHOLD`;
- `EMAIL_INGESTION_AI_REJECTION_THRESHOLD`.

Pages uses compatibility date `2024-12-01`. Do not assume runtime bindings are
copied into `process.env`; Nitro handlers must read
`event.context.cloudflare.env`, with `process.env` only as a local/test
fallback. The signed boundary, recovery encryption, cron authentication,
alert thresholds, and notification allowlist all follow this rule.

Signature failures are rate-gated before Neon and stored with a deterministic
minute key. A 15-minute signature-alert threshold therefore counts bounded
active minute buckets, not raw forged-request volume.

## 3. Signed Worker → Nitro boundary

For each message the Worker:

1. extracts the exact Crockford token suffix from the recipient;
2. normalises the one-shot MIME transport into `NormalizedInboundEmail`;
3. signs and calls `/api/internal/leads/email-policy`;
4. parses bounded MIME in ADF → registered provider → generic order and signs a reservation call to
   `/api/internal/leads/email-stage`;
5. encrypts/stages raw MIME in R2 and signs
   `/api/internal/leads/email-stage-confirm`;
6. signs the canonical envelope to `/api/internal/leads/email-ingest`, where
   `acceptLead()` enters the existing routing/CRM pipeline;
7. deletes staged evidence after an accepted or duplicate terminal result.

Transport telemetry uses the separately signed
`/api/internal/leads/email-telemetry` endpoint. HMAC headers include a
timestamp and single-use nonce. Nitro performs endpoint/client resolution; the
Worker cannot assert tenant scope.

## 4. Build and deployment

Validate before changing live routing:

```bash
pnpm --dir workers/email-lead-intake run test
pnpm --dir workers/email-lead-intake run typecheck
pnpm --dir workers/email-lead-intake run types:check
pnpm --dir workers/email-lead-intake run deploy:dry-run
pnpm vitest run test/workers/email-provider-conformance.test.ts
```

Deploy the Email Worker:

```bash
pnpm --dir workers/email-lead-intake run deploy
```

Validate and deploy Pages only through the repository guard:

```bash
pnpm deploy:check
pnpm deploy:production
```

Deploy the scheduler through the repository worker guard:

```bash
pnpm deploy:workers leads-cron
```

After deploy, confirm the Email Routing rule still targets
`email-lead-intake`; renaming a Worker removes that association.

## 5. Scheduler

`workers/leads-cron/wrangler.toml` defines:

- every five minutes:
  `/api/leads/_internal/recover-stuck-claims` and
  `/api/leads/_internal/recover-email-ingestions`;
- 03:10 UTC daily: `/api/leads/_internal/purge-ingestion-errors`;
- 03:30 UTC daily: `/api/leads/_internal/purge-retention`.

The five-minute email route runs recovery and the email health/alert scan.
The 03:10 route removes old ingestion errors, expired signature nonces, and
bounded residual email evidence. Verify every configured internal route reads
the request-scoped Cloudflare token before declaring the complete scheduler
ready; a successful Worker deployment alone is insufficient.

## 6. Create and configure an address

1. Open **Agency → Leads → Email addresses**.
2. Select **Create address** and choose the client.
3. Set a human label and optional address prefix. The server generates the
   opaque token and returns the full copyable
   `<prefix>-<token>@leads.xeroflow.io` address.
4. Select deterministic parser mode and an expected provider only as a hint.
5. Keep AI fallback disabled unless the platform AI capability and privacy
   approval are explicitly enabled. The current endpoint form intentionally
   exposes deterministic extraction only; do not promise a self-service AI
   toggle.
6. Configure allowed sender domains where the provider has stable relay
   domains.
7. Set expected maximum silence only when the provider has a real expected
   cadence. Set first-response SLA to the client's operational commitment;
   neither field is a universal lead-volume promise.
8. Apply the existing `portal`, `portal_notification`, or `assign_user`
   routing preset, or open **Form rules** using the endpoint's server-generated
   `email_endpoint:<uuid>` form ID.
9. Verify destinations, assignment governance, CRM promotion, and portal
   visibility as you would for webhook leads.

Copy the full address from the endpoint table; do not construct, expose, or
store the token separately. The readable prefix locks after the first receipt.

## 7. Provider forwarding and pilot smoke

In the provider/website notification settings:

1. add the copied client-scoped address as a recipient;
2. keep the existing delivery path active during the pilot;
3. send a provider test lead;
4. in the inbox enable **Show test leads** where applicable;
5. confirm client, provider, endpoint label, canonical contact/vehicle fields,
   and `source = email`;
6. confirm the intended rule destinations and CRM/portal result;
7. redeliver the same provider event and prove it returns duplicate without a
   second lead or downstream delivery;
8. inspect safe delivery history for recovery/replay availability.

For Meta email notifications, use the relevant client-scoped Email address if
the copy is meant to enter XeroFlow. An agency human inbox is only a manual
backup and is not automatically ingested. Meta Webhooks API ingestion remains
separately gated by App Review; after approval, reconnect each Meta account to
obtain the expanded scope before live verification.

## 8. Fixtures and provider adapter contract

Sanitised fixtures live in `test/fixtures/email-leads/`. Parser, provider, MIME,
AI, and transport tests live under `test/workers/email-*.test.ts`.

Every new adapter must:

- implement `shared/leads/email/providers/types.ts` and register through
  `shared/leads/email/providers/registry.ts`;
- preserve the parser order and boundary in `shared/leads/email/parser.ts`;
- match exact trusted evidence and avoid display-name/sender-substring spoofing;
- be deterministic, synchronous, bounded, and non-mutating;
- make no remote fetches, persistence calls, or AI calls;
- emit only canonical allowlisted fields with bounded confidence/provenance;
- never select a tenant, endpoint, form, or client from content;
- never persist raw provider external identity;
- reuse the shared canonical envelope and endpoint-scoped idempotency boundary;
- add sanitised positive/adversarial fixtures; and
- pass `test/workers/email-provider-conformance.test.ts` and
  `test/workers/email-transport-conformance.test.ts` plus the parser, Worker,
  and privacy suites.

Do not register an adapter that passes its own fixture but fails shared
conformance.

## 9. Audit and health checks

Use content-free queries only. Never select raw MIME, extracted identity,
subject/body fields, ciphertext, or object keys into tickets or chat.

Reservation reconciliation for a bounded window:

```sql
SELECT
  COUNT(*) AS reserved_total,
  COUNT(*) FILTER (WHERE terminal_at IS NOT NULL AND status = 'accepted') AS accepted,
  COUNT(*) FILTER (WHERE terminal_at IS NOT NULL AND status = 'duplicate') AS duplicate,
  COUNT(*) FILTER (WHERE terminal_at IS NOT NULL AND status = 'quarantined') AS quarantined,
  COUNT(*) FILTER (
    WHERE terminal_at IS NOT NULL AND status = 'failed'
  ) AS terminal_failed,
  COUNT(*) FILTER (WHERE terminal_at IS NULL) AS non_terminal
FROM lead_email_ingestions
WHERE client_id = :'client_id'
  AND endpoint_id = :'endpoint_id'
  AND created_at >= :'from'
  AND created_at < :'to';
```

The result must satisfy:

```text
reserved_total =
  accepted + duplicate + quarantined + terminal_failed + non_terminal
```

Transport events are separate:

```sql
SELECT event_class, COUNT(*)
FROM lead_email_transport_events
WHERE created_at >= NOW() - INTERVAL '15 minutes'
GROUP BY event_class
ORDER BY event_class;
```

Safe endpoint and recovery audit:

```sql
SELECT action, actor_type, created_at
FROM lead_email_endpoint_audits
WHERE endpoint_id = :'endpoint_id'
ORDER BY created_at DESC
LIMIT 50;

SELECT action, outcome, reason, attempt_count, created_at
FROM lead_email_ingestion_audits
WHERE ingestion_id = :'ingestion_id'
ORDER BY created_at DESC
LIMIT 50;
```

Review accepted/duplicate/quarantined/failed counts, processing and
first-response p50/p95, possible duplicates, unassigned accepted leads,
configured SLA breaches, recovery attempts/exhaustions, and oldest non-terminal
age. Silence is unhealthy only when that endpoint has
`expected_max_silence_hours` configured.

The scheduled alert scan raises five-consecutive-failure alerts only for a
previously healthy endpoint. Failure-rate alerts require more than 20% failure
across at least ten messages in 15 minutes. Unknown-recipient, signature, R2,
and AI-schema alerts require their explicit runtime thresholds; allowlist
recipients during pilot.

## 10. Recovery, replay, rotation, and retention

- Recovery uses short database leases, `FOR UPDATE SKIP LOCKED`, bounded
  backoff, the original identity, and a maximum of five canonical attempts or
  seven days.
- Manual replay is owner/admin only, audited, and cannot bypass a disabled
  endpoint, sender policy, live lease, expiry, or idempotency.
- Rotate an address from the Email addresses tab. The old address remains valid
  for 24 hours and maps to the same endpoint identity; update the provider
  during that grace period.
- Retire rather than delete an address when it must never receive again.
  Endpoint and safe ingestion audit remain.
- Accepted/duplicate evidence is deleted immediately or by residual cleanup.
  Failed/quarantined evidence remains encrypted only until expiry. R2 lifecycle
  deletion is the independent seven-day backstop.

## 11. Pilot safety and rollback

Start dark, then pilot one client:

1. apply migrations 315–324 and verify catalog state;
2. validate Worker/Pipeline tests and bindings without enabling catch-all;
3. create distinct provider, website, and general addresses;
4. keep AI disabled for the deterministic-parsing week;
5. keep the incumbent provider delivery path active;
6. reconcile provider inbox totals daily against reserved terminal and
   non-terminal buckets, with policy-denied transport separate;
7. verify destination/CRM/portal evidence for every endpoint;
8. review recovery age/outcomes and possible-duplicate precision daily;
9. expand in batches only after seven healthy days.

Rollback in this order:

1. disable the Email Routing catch-all to stop all new receipts;
2. disable an individual endpoint for client/provider-specific rollback;
3. keep endpoint/ingestion/audit rows;
4. let recovery finish, or explicitly quarantine every staged non-terminal
   ingestion, before removing the Worker route;
5. verify residual objects are deleted explicitly or by the R2 lifecycle;
6. do not roll back additive migrations while accepted leads reference
   ingestion rows.

Autonomous customer replies remain out of scope and require a separate approved
design and safety review.
