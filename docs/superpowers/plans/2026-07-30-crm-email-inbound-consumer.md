# CRM Email Inbound Consumer (B5) Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Use superpowers:test-driven-development for every
> behavior change.

**Goal:** Consume the dedicated CRM email Queue safely, turn a retained MIME
message into one tenant-scoped lead/conversation/message, and reuse the existing
CRM lead identity policy without enabling production traffic.

**Architecture:** The existing Email Routing Worker also consumes the dedicated
Queue because it already has the private R2 binding and PostalMime. It retrieves
the raw MIME by the server-issued object key, verifies its bytes against the
queued SHA-256 digest, normalizes a bounded plain-text envelope, and calls a
second Worker-authenticated Nitro endpoint. Nitro revalidates the active route
and performs lead intake, CRM promotion, conversation/message/event creation,
attachment metadata writes, and route usage update in one Postgres transaction
protected by an idempotency-key advisory lock. No HTML or attachment bytes cross
the Worker-to-Nitro boundary.

**Tech Stack:** Cloudflare Email Workers, Queues, R2, PostalMime, Nuxt 4/Nitro,
Neon Postgres, Zod, Vitest.

---

## Safety decisions

- Keep both `CRM_EMAIL_INBOUND_ENABLED` and
  `CRM_EMAIL_CONVERSATIONS_ENABLED` default-off.
- Use the existing `CRM_EMAIL_WORKER_SECRET`; do not add a client-visible
  credential.
- Treat the Queue as at-least-once. A Postgres transaction-scoped advisory lock
  plus canonical message idempotency prevents duplicate lead conversations.
- Revalidate `crm_email_routes` by route ID, client ID, kind, conversation, active
  state, revocation, and expiry at consume time. A route revoked after B4
  acceptance must not mutate CRM data.
- Use the MIME `From` mailbox for CRM identity and preserve the Cloudflare
  provider message ID only for correlation. Ambiguous/missing identities remain
  lead-only rather than linking an arbitrary person.
- Store only plain text in `crm_messages.body_text` for B5. HTML display remains
  null until a dedicated sanitizer is implemented.
- Store attachment metadata as `scan_status = 'pending'`; never expose bytes or
  mark an attachment clean in this slice.
- Use `consentDecision = 'unknown'` for email-originated leads. An inbound email
  is not proof of advertising consent.
- Do not log message bodies, addresses, subjects, route tokens, R2 keys, or
  attachment names.

## Task 1: Add email as a canonical lead source

**Files:**

- Create:
  `server/database/migrations/289-crm-email-lead-source.sql`
- Modify: `app/types/index.ts`
- Modify: `server/utils/leads/crmPromotion.ts`
- Test:
  `test/config/crmEmailLeadSourceMigration.test.ts`
- Test: `test/server/utils/leads/crmPromotion.test.ts`

1. Write a failing migration contract test proving `email` is accepted by the
   `leads` and `lead_form_rules` source constraints without weakening other
   values.
2. Write a failing promotion test proving an email lead produces an
   `Email enquiry — <name>` opportunity title.
3. Run both tests and confirm each fails for the missing behavior.
4. Add an additive, idempotent migration that replaces the two named check
   constraints with the existing allowlists plus `email`.
5. Extend `LeadSource` and update the promotion title without changing titles
   for existing providers.
6. Run the focused tests and confirm green.
7. Execute the migration against the configured Neon database as required by
   `AGENTS.md`, then run a rollback-only insert proof for an `email` lead.
8. Commit:

   ```bash
   git add server/database/migrations/289-crm-email-lead-source.sql \
     app/types/index.ts server/utils/leads/crmPromotion.ts \
     test/config/crmEmailLeadSourceMigration.test.ts \
     test/server/utils/leads/crmPromotion.test.ts
   git commit -m "feat(crm-email): add canonical email lead source"
   ```

## Task 2: Normalize and verify queued MIME in the Email Worker

**Files:**

- Modify: `workers/email-worker/src/contracts.ts`
- Create: `workers/email-worker/src/inboundQueue.ts`
- Test: `test/workers/emailWorkerInboundQueue.test.ts`

1. Write failing tests for:
   - fail-closed behavior when the feature flag, R2 binding, Worker secret, or
     API URL is missing;
   - retrieving only the exact queued raw MIME key;
   - rejecting missing objects, size mismatches, checksum mismatches, malformed
     mailboxes, excessive recipients, and oversized text;
   - producing a strict plain-text canonical envelope with bounded headers;
   - not including HTML, raw MIME, attachment bytes, or R2 metadata in the Nitro
     payload;
   - retrying a network/non-2xx Nitro result and acknowledging a successful
     idempotent result.
2. Run the test and confirm module-resolution/behavior failures.
3. Extend the minimal R2 binding with `get()` for raw-object reads.
4. Implement a dependency-injected Queue message handler:
   - validate the versioned job structure before R2 access;
   - read at most the approved inbound limit;
   - compute SHA-256 and compare it in constant time;
   - parse with PostalMime and flatten only valid mailbox addresses;
   - bound subject, text, address lists, threading headers, and names;
   - send `{ job, email }` to
     `/api/internal/crm-email/process-inbound`;
   - return only after the response is successful.
5. Run the test and confirm green.

## Task 3: Add the authenticated processing boundary

**Files:**

- Create:
  `server/api/internal/crm-email/process-inbound.post.ts`
- Create:
  `server/utils/crm/emailInboundProcessingContracts.ts`
- Test:
  `test/server/api/crmEmailProcessInboundEndpoint.test.ts`
- Test:
  `test/server/utils/crm/emailInboundProcessingContracts.test.ts`

1. Write failing tests proving:
   - secret and feature flag checks happen before body access;
   - unknown fields, HTML, raw bytes, invalid IDs, invalid R2 keys, mismatched
     attachment prefixes, excessive addresses, and excessive text are rejected;
   - valid input calls the processor once and returns a minimal
     `{ accepted: true, duplicate: boolean }` response;
   - no tenant ID, message content, or address appears in the response.
2. Run the tests and confirm expected failures.
3. Create one shared strict Zod contract for the Queue job and normalized email
   payload so the Worker and endpoint enforce the same boundary.
4. Implement constant-time Worker-secret authentication, the
   `CRM_EMAIL_CONVERSATIONS_ENABLED` gate, strict body validation, and the
   processor call.
5. Map permanent invalid/revoked route outcomes to a generic 409 response and
   transient failures to errors so Queue retries remain available.
6. Run the tests and confirm green.

## Task 4: Persist one inbound message transactionally

**Files:**

- Create: `server/utils/crm/emailInboundProcessor.ts`
- Modify: `server/utils/crm/emailRepository.ts`
- Test: `test/server/utils/crm/emailInboundProcessor.test.ts`
- Test: `test/server/utils/crm/emailRepository.test.ts`

1. Write failing processor tests for:
   - consume-time route revalidation including tenant and conversation
     ownership;
   - a conversation reply appending to the pre-resolved conversation without
     creating a lead;
   - a lead-inbox message creating/recovering an email lead with unknown consent
     and calling the existing promotion policy;
   - promoted/existing person and opportunity links flowing to the new
     conversation;
   - identity conflict or insufficient identity remaining lead-only;
   - a repeated idempotency key returning the existing message and not creating
     a second conversation;
   - the received event, route `last_used_at`, raw MIME retention metadata, and
     pending attachment rows being committed atomically;
   - body HTML always remaining null.
2. Write failing repository tests for raw MIME fields and idempotent attachment
   metadata writes on newly-created messages.
3. Run the tests and confirm expected failures.
4. Extend `CreateCrmEmailMessageInput` with raw MIME metadata and attachment
   manifests. Insert attachment metadata only after a message is newly created,
   with `scan_status = 'pending'` and `ON CONFLICT DO NOTHING`.
5. Implement the processor using one injected Postgres transaction:
   - acquire `pg_advisory_xact_lock(hashtextextended(idempotency_key, 0))`;
   - recover an existing message before any conversation creation;
   - lock/revalidate the active route;
   - for lead routes, invoke `createLeadIntakeService` and
     `createCrmLeadPromotionService` using the same transaction client;
   - create the conversation, inbound message, and received event through the
     canonical repository using that same transaction;
   - update route usage only after the canonical write succeeds.
6. Do not publish the measurement outbox inline; its durable pending row follows
   the existing outbox delivery path.
7. Run tests and confirm green.

## Task 5: Register the dedicated Queue consumer

**Files:**

- Modify: `workers/email-worker/src/index.ts`
- Modify: `workers/email-worker/wrangler.toml`
- Test: `test/workers/emailWorkerInboundQueue.test.ts`
- Test: `test/workers/emailWorkerHandler.test.ts`

1. Add a failing integration test proving the exported Worker acknowledges each
   successful message and retries each thrown/transient message independently.
2. Run it and confirm the Worker has no Queue handler.
3. Add the `queue()` export beside the existing `email()` export and process
   messages sequentially with explicit `ack()`/`retry()`.
4. Add the versioned consumer stanza, producer/bucket comments, retry count, and
   DLQ to `wrangler.toml`. Do not add production IDs or secrets.
5. Keep deployment blocked until the queue, DLQ, R2 binding, secrets, and R2
   lifecycle rule are explicitly configured.
6. Run Worker tests and confirm the existing board path is unchanged.

## Task 6: Verify, document, and commit B5

**Files:**

- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`

1. Re-read every changed/new file end-to-end and apply the `AGENTS.md`
   pre-commit checks.
2. Run all focused CRM email, lead promotion/intake, and Email Worker tests.
3. Run focused ESLint and `git diff --check`.
4. Run `pnpm run typecheck`, compare against the known repository baseline, and
   require zero errors in changed files.
5. Run the Email Worker Wrangler dry-run without deploying.
6. Run a rollback-only live Neon smoke proving:
   - one email lead, lead/CRM link, conversation, message, received event,
     communication projection, and pending attachment are created;
   - a retry returns the same message and creates no second conversation;
   - a cross-tenant/revoked route cannot mutate CRM data;
   - the rollback leaves no smoke rows.
7. Mark B5 complete in the PRD only after all proofs pass. Record that production
   bindings, flags, lifecycle rules, and deployment remain off.
8. Commit:

   ```bash
   git add workers/email-worker server/api/internal/crm-email \
     server/utils/crm app/types/index.ts server/database/migrations \
     test/workers test/server docs/prd/crm-conversations-email-gateway-prd.md \
     docs/superpowers/plans/2026-07-30-crm-email-inbound-consumer.md
   git commit -m "feat(crm-email): consume inbound email into CRM"
   ```

## Completion gate

B5 is complete only when one retained inbound MIME object produces exactly one
correctly tenant-scoped canonical message under live Postgres constraints, and a
retry proves no duplicate conversation. The feature remains unavailable in
production until the Phase H activation gates are approved.
