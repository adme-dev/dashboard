# CRM Communications and Webhook Architecture

## Decision

Keep canonical leads, people, opportunities, and lifecycle events inside
ZeroFlow. Treat CRM, voice, SMS, email, and AI receptionist systems as signed,
idempotent adapters around that core.

The website submission-intent bridge is attribution reconciliation only. It
must never create a canonical lead. A provider-confirmed webhook remains the
authority for lead creation.

## Canonical identity

- `providerLeadId`: provider-owned idempotency key for lead creation.
- `leadId`: ZeroFlow canonical lead ID.
- `personId`: reusable normalized customer identity.
- `opportunityId`: one commercial enquiry or sales process.
- `browserEventId`: website attribution identity when available.
- `conversationId`: one channel-neutral customer conversation.
- `providerMessageId` or `providerCallId`: provider delivery idempotency key.

## Inbound webhook boundary

Route shape:

`POST /api/integrations/crm/webhooks/:provider/:connectionId`

Requirements:

- Resolve tenant only from the server-owned connection.
- Verify provider signature before parsing business data.
- Enforce timestamp tolerance and replay protection.
- Persist an immutable webhook receipt before processing.
- Deduplicate by `(connection_id, provider_event_id)`.
- Return provider-appropriate retryable and terminal status codes.
- Process receipts asynchronously through a queue.
- Store sanitized error classes, never credentials or raw PII in logs.

Supported canonical events:

- `lead.accepted`
- `lead.contacted`
- `lead.qualified`
- `lead.won`
- `lead.lost`
- `conversation.started`
- `message.received`
- `message.delivered`
- `message.failed`
- `call.started`
- `call.completed`
- `call.transcript_ready`
- `handoff.requested`
- `handoff.completed`

Lifecycle events update the existing canonical lead/opportunity service and
measurement outbox. They do not write campaign analytics directly.

## Outbound webhook boundary

Agency-controlled subscriptions select canonical event types and a destination.
Each delivery contains:

- webhook ID and schema version
- event ID and event type
- occurred-at timestamp
- client and canonical entity IDs
- provider references
- attribution references without unrelated PII

Sign each request with HMAC-SHA256 over the raw body and timestamp. Deliver via
an outbox with exponential backoff, jitter, attempt history, dead-letter state,
manual replay, and endpoint circuit breaking.

## Communications layer

Voice, SMS, and email share a channel-neutral conversation timeline:

- Twilio and future telephony providers map calls/messages into canonical
  conversation events.
- SMTP/API email ingestion parses threading headers and provider delivery IDs.
- AI receptionist sessions append summaries, intents, consent evidence, and
  handoff state; they do not mutate opportunities without an explicit command.
- Human handoff preserves the same conversation and customer identity.
- Provider cost records remain separate from customer-visible message content.

## Consent and suppression

- Store consent purpose, source, timestamp, and evidence separately from a
  provider contact record.
- Enforce SMS opt-out, email unsubscribe, quiet hours, and call recording
  consent before provider dispatch.
- A provider webhook cannot override a canonical suppression state.
- Record every automated decision and human override.

## Delivery phases

1. Submission-intent reconciliation and canonical attribution.
2. Generic signed inbound CRM lifecycle webhook.
3. Canonical outbound webhook subscriptions and delivery outbox.
4. Channel-neutral conversations with Twilio SMS and voice.
5. Email ingestion/threading and outbound SMTP/API adapters.
6. AI receptionist orchestration, summaries, and human handoff.
7. Customer-facing configuration, health, replay, and audit tooling.
