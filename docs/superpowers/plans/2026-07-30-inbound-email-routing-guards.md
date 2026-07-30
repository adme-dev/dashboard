# Inbound Email Routing Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the live email-to-board path while introducing explicit,
fail-closed lead/CRM route classification and rejecting unsafe inbound
messages before MIME parsing.

**Architecture:** Pure route and safety modules classify the envelope
recipient and validate `rawSize`/attachment metadata. A dependency-injected
Worker orchestrator reads and parses MIME only for an enabled adapter. The
board adapter retains its existing Nitro payload; lead and CRM reply routes
remain recognised but disabled until B4 supplies an authenticated,
idempotent inbound boundary.

**Tech Stack:** Cloudflare Email Workers, TypeScript, PostalMime, Vitest

## Global Constraints

- Preserve generated board addresses: `board-<8..32 URL-safe token>@domain`.
- Recognise future signed routes as `lead+<vN.key.signature>@domain` and
  `reply+<vN.key.signature>@domain`; do not dispatch them yet.
- Reject unknown, empty, malformed, or overlong local parts generically.
- Inspect `message.rawSize` before reading `message.raw`.
- Default application message ceiling: 10 MiB; absolute configurable ceiling:
  25 MiB, matching Cloudflare Email Routing's inbound maximum.
- Parsed attachment ceiling: 10 files, 5 MiB each, 8 MiB combined.
- Never log raw MIME, message bodies, routing tokens, attachment content, or
  downstream response bodies.
- Board failures preserve rejection semantics but expose only the HTTP status.
- No Cloudflare deployment, Email Routing rule change, API endpoint, database
  change, portal UI, or feature enablement is part of this slice.

References:

- [Cloudflare Email Worker API](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/)
- [Cloudflare Email Service limits](https://developers.cloudflare.com/email-service/platform/limits/)
- [Cloudflare subaddressing](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/#subaddressing)

### Task 1: Recipient classification and size policy

**Files:**

- Create: `workers/email-worker/src/routing.ts`
- Create: `workers/email-worker/src/safety.ts`
- Create: `test/workers/emailWorkerRouting.test.ts`

**Interfaces:**

- Produces:
  `classifyInboundEmailRoute(recipient: string): InboundEmailRoute`
- Produces:
  `resolveInboundEmailLimits(value?: string): InboundEmailLimits`
- Produces:
  `validateInboundEmailSize(rawSize: number, limits: InboundEmailLimits):
  InboundEmailSafetyResult`
- Produces:
  `validateInboundAttachments(attachments: AttachmentDescriptor[],
  limits: InboundEmailLimits): InboundEmailSafetyResult`

- [ ] Write failing table-driven tests with literal expected route objects for:
      valid board, lead, and reply addresses; empty tokens; display-name input;
      unknown prefixes; malformed signed tokens; and local parts over 128
      characters.
- [ ] Write failing boundary tests proving 10 MiB is accepted, 10 MiB + 1 byte
      is rejected, invalid configuration uses the default, configuration
      cannot exceed 25 MiB, and attachment count/individual/combined ceilings
      fail closed.
- [ ] Run:
      `pnpm exec vitest run test/workers/emailWorkerRouting.test.ts`.
      Expect missing-module failures.
- [ ] Implement the discriminated union:

```ts
export type InboundEmailRoute
  = { kind: 'board', token: string }
  | { kind: 'lead', token: string }
  | { kind: 'crm_reply', token: string }
  | { kind: 'invalid' }
```

- [ ] Implement `InboundEmailLimits` with byte literals:
      `{ maxMessageBytes: 10 * 1024 * 1024, maxAttachments: 10,
      maxAttachmentBytes: 5 * 1024 * 1024,
      maxCombinedAttachmentBytes: 8 * 1024 * 1024 }`, clamping only the
      message override to `25 * 1024 * 1024`.
- [ ] Run the focused test and ESLint; expect all cases to pass.
- [ ] Re-read the three files and commit:
      `feat(email-worker): classify guarded inbound routes`.

### Task 2: Preserve the board adapter

**Files:**

- Create: `workers/email-worker/src/contracts.ts`
- Create: `workers/email-worker/src/boardAdapter.ts`
- Create: `test/workers/emailWorkerBoardAdapter.test.ts`

**Interfaces:**

- Consumes: a validated board token and normalised parsed email.
- Produces:

```ts
export interface BoardAdapterResult {
  accepted: boolean
  status: number | null
}

export async function deliverBoardEmail(
  input: BoardAdapterInput,
  dependencies: { fetch: typeof fetch }
): Promise<BoardAdapterResult>
```

- [ ] Write a failing test using a complete parsed-email fixture and a local
      fetch fake. Assert the observable request URL, bearer authorization,
      JSON content type, unchanged board token/from/subject/text/html fields,
      and attachment filename/content type/byte size.
- [ ] Write failing cases for blank subject defaulting to `(No Subject)` and
      downstream non-2xx returning `{ accepted: false, status: 503 }`.
- [ ] Run the board-adapter test and observe the missing-module failure.
- [ ] Move the existing board payload construction into `deliverBoardEmail()`.
      Do not add retries or change the Nitro endpoint.
- [ ] Run routing, safety, board-adapter, and existing CRM email tests; run
      focused ESLint.
- [ ] Re-read all changed files and commit:
      `refactor(email-worker): isolate board delivery adapter`.

### Task 3: Guarded Worker orchestration

**Files:**

- Modify: `workers/email-worker/src/index.ts`
- Create: `test/workers/emailWorkerHandler.test.ts`
- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Modify:
  `docs/superpowers/plans/2026-07-30-inbound-email-routing-guards.md`

**Interfaces:**

- Produces:

```ts
export function createInboundEmailWorker(dependencies?: {
  fetch?: typeof fetch
  parse?: (raw: ArrayBuffer) => Promise<ParsedInboundEmail>
}): {
  email(message: InboundEmailMessage, env: Env): Promise<void>
}
```

- [ ] Write failing handler tests proving invalid, lead, CRM-reply, and
      oversized messages never read the raw stream, invoke PostalMime, or call
      Nitro.
- [ ] Write a failing board success test proving the stream is read once,
      parsing occurs once, the board adapter accepts, and `setReject()` is not
      called.
- [ ] Write failing cases for unsafe attachment metadata, parser failure, and
      downstream 4xx/5xx; assert a generic rejection reason and no body/token
      appears in captured logs.
- [ ] Run the handler test and observe failures against the monolithic worker.
- [ ] Implement this order exactly:
      classify route → reject invalid/disabled → resolve limits → check
      `rawSize` → read once → parse once → validate attachments → dispatch
      board adapter.
- [ ] Keep the default export as
      `createInboundEmailWorker() satisfies ExportedHandler<Env>`.
- [ ] Run all Worker/CRM focused tests, focused ESLint,
      `git diff --check`, and `pnpm run typecheck`.
- [ ] Re-read every changed/new file. Record that B2 is complete and B1 is
      partially complete (classification and board extraction only); do not
      check off B1 until lead and CRM adapters reach the authenticated inbound
      boundary.
- [ ] Commit as `feat(email-worker): fail closed before MIME parsing`.

## Live/Deployment Gate

- This slice is verified locally only.
- Do not deploy `email-to-board-worker`.
- Before any later deployment, run Wrangler local email simulations for the
  existing board route and the disabled lead/reply routes, then perform a
  dedicated non-production board-address smoke.
