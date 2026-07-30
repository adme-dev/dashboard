# CRM Email Inbound Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed, Worker-authenticated Nitro boundary that verifies
signed CRM email routes, resolves tenant ownership from Postgres, and hands a
minimal deterministic job to a dedicated Cloudflare Queue.

**Architecture:** The Email Routing Worker will eventually store raw MIME in R2
and call Nitro with an opaque R2 key plus envelope identifiers. Nitro alone
loads versioned HMAC secrets, verifies the domain-bound route token, resolves
the active hashed route, and derives the client/conversation IDs. A dedicated
Queue receives a versioned job with a deterministic idempotency key. B5 will
consume that job to match the sender and write the canonical CRM message.

**Tech Stack:** Nuxt 4/Nitro, H3, Zod, Neon Postgres, Cloudflare Queues, Vitest

## Global Constraints

- Keep `CRM_EMAIL_CONVERSATIONS_ENABLED` off by default.
- Require `x-crm-email-secret` to match `CRM_EMAIL_WORKER_SECRET`; there is no
  development bypass.
- Load versioned HMAC secrets from `CRM_EMAIL_REPLY_SECRETS`, encoded as a JSON
  object such as `{"1":"<at-least-32-byte-secret>"}`.
- Verify the token before any route lookup.
- Resolve `client_id`, `conversation_id`, and route kind only from
  `crm_email_routes`; never accept tenant IDs from the Worker.
- Match only active, unrevoked, unexpired routes with the same token version,
  hash, domain, and route kind.
- Return the same not-found response for an invalid signature and an absent,
  expired, or revoked route.
- Require a dedicated `CRM_EMAIL_INBOUND_QUEUE` binding. Do not fall back to
  inline processing or the general jobs queue.
- Queue only route IDs, tenant IDs, object keys, provider identifiers,
  timestamps, and a deterministic idempotency key. Never queue or log the
  signed token, raw MIME, bodies, or secrets.
- Do not enable Worker lead/reply dispatch, configure Cloudflare bindings,
  consume the job, match CRM people, or deploy in this slice.

### Task 1: Route resolution and runtime configuration

**Files:**

- Create: `server/utils/crm/emailInboundConfig.ts`
- Create: `server/utils/crm/emailRouteRepository.ts`
- Create: `test/server/utils/crm/emailInboundConfig.test.ts`
- Create: `test/server/utils/crm/emailRouteRepository.test.ts`

**Interfaces:**

- Produces:
  `parseCrmEmailReplySecrets(value: string | undefined):
  Readonly<Record<number, string>>`
- Produces:
  `resolveCrmInboundEmailRoute(input, dependencies):
  Promise<CrmInboundEmailRoute | null>`

- [x] Write failing configuration tests for missing JSON, arrays, invalid
      versions, short secrets, and a valid multi-version keyring.
- [x] Write failing resolver tests proving HMAC verification happens before
      Postgres, all route dimensions are queried, invalid tokens do not query,
      and absent/expired/revoked routes return `null`.
- [x] Run the two focused tests and observe missing-module failures.
- [x] Implement strict keyring parsing and a dependency-injected route
      resolver using `verifyCrmEmailReplyToken`.
- [x] Run focused tests and ESLint.
- [x] Re-read the four files and commit:
      `feat(crm-email): resolve signed inbound routes`.

### Task 2: Deterministic dedicated Queue handoff

**Files:**

- Create: `server/utils/crm/emailInboundQueue.ts`
- Create: `test/server/utils/crm/emailInboundQueue.test.ts`

**Interfaces:**

- Produces:
  `createCrmEmailInboundIdempotencyKey(routeTokenHash, providerMessageId):
  Promise<string>`
- Produces:
  `enqueueCrmInboundEmail(event, job): Promise<void>`

- [ ] Write failing tests proving the same route hash/provider message ID
      produces the same opaque key, different inputs produce different keys,
      the dedicated binding is required, and the exact versioned job is sent
      with JSON content type.
- [ ] Run the test and observe the missing-module failure.
- [ ] Implement a SHA-256-based idempotency key and strict dedicated Queue
      lookup from `event.context.cloudflare.env.CRM_EMAIL_INBOUND_QUEUE`.
- [ ] Run focused tests and ESLint.
- [ ] Re-read the two files and commit:
      `feat(crm-email): enqueue deterministic inbound jobs`.

### Task 3: Authenticated internal endpoint

**Files:**

- Create: `server/api/internal/crm-email/inbound.post.ts`
- Create: `test/server/api/crmEmailInboundEndpoint.test.ts`
- Modify: `server/middleware/auth.ts`
- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Modify:
  `docs/superpowers/plans/2026-07-30-crm-email-inbound-boundary.md`

**Request contract:**

```ts
{
  routeKind: 'lead_inbox' | 'conversation_reply'
  routeToken: string
  recipientDomain: string
  providerMessageId: string
  rawMimeR2Key: string
  receivedAt: string
}
```

- [ ] Write failing endpoint tests for missing configuration, wrong secret,
      disabled flag, malformed payload, invalid token, missing route, missing
      Queue binding, successful `202` handoff, and duplicate calls producing
      the same queued idempotency key.
- [ ] Assert failures never enqueue and responses/logs never contain the route
      token or resolved tenant identifiers.
- [ ] Run the endpoint test and observe the missing-module failure.
- [ ] Implement authentication before body parsing, then flag/configuration
      validation, Zod parsing, route resolution, deterministic job creation,
      and Queue handoff.
- [ ] Add only `/api/internal/crm-email/` to the middleware's public-route list;
      the endpoint still enforces its own shared secret.
- [ ] Return `202 { accepted: true }` without returning routing or tenant
      details.
- [ ] Run all CRM email and email Worker focused tests, focused ESLint,
      `git diff --check`, and `pnpm run typecheck`.
- [ ] Re-read every modified/new file. Mark B4 complete, while leaving B1
      partial and Worker lead/reply delivery disabled pending B3 R2 storage and
      the B5 consumer.
- [ ] Commit:
      `feat(crm-email): add authenticated inbound boundary`.

## Live/Deployment Gate

- This slice is locally verified only.
- Do not set `CRM_EMAIL_CONVERSATIONS_ENABLED`.
- Do not configure `CRM_EMAIL_WORKER_SECRET`, `CRM_EMAIL_REPLY_SECRETS`, or
  `CRM_EMAIL_INBOUND_QUEUE` in production yet.
- Do not deploy the Email Routing Worker or Cloudflare Pages.
- Before later activation, B3 must persist raw MIME to the constrained R2 key,
  B5 must consume the Queue idempotently, and a non-production end-to-end
  route test must prove invalid tokens cannot resolve or enqueue.
