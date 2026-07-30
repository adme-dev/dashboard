# CRM Conversations and Email Gateway Design

The approved product specification and live implementation ledger are maintained
in [`docs/prd/crm-conversations-email-gateway-prd.md`](../../prd/crm-conversations-email-gateway-prd.md).

## Design decision

XeroFlow will own the canonical, tenant-scoped conversation and delivery state.
Cloudflare Email Routing receives inbound email, the Workers `send_email`
binding sends native CRM email, and Cloudflare Queue delivery events update the
canonical message. SMTP is an optional compatibility boundary for external
systems and never exposes Cloudflare account tokens to clients.

## First implementation slice

The first slice is additive and unavailable to users:

1. Create canonical conversation, message, event, attachment, route,
   sender-identity, and compatibility-credential tables.
2. Prove table constraints and indexes through a migration contract test and
   live Postgres execution.
3. Add provider-neutral message and delivery-state contracts with unit tests.
4. Keep all sending, receiving, portal UI, and production configuration disabled
   until later slices.

This slice gives subsequent inbound, outbound, UI, and event-consumer work a
stable contract without changing existing lead capture or CRM timelines.

## Safety properties

- Every row is client-scoped.
- Provider events and messages have idempotency constraints.
- Reply route and compatibility secrets are stored only as hashes.
- Message participants use structured JSON rather than provider payloads.
- Current delivery state is constrained to the canonical state machine.
- Existing `crm_communications` data and bridges are untouched.
- No production outbound email is enabled by this slice.

## Verification

- Focused Vitest tests must first fail because the migration/contracts are
  absent, then pass after implementation.
- The migration must execute twice successfully against the configured Neon
  database.
- Catalog queries must prove constraints and indexes exist.
- The existing CRM communication tests must continue to pass.
