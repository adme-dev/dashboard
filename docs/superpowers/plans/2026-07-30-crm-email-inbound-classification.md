# CRM Email Inbound Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete PRD task B6 by preventing automatic responses, delivery
status reports, mailing-list traffic, and XeroFlow-originated loops from
creating CRM leads or messages.

**Architecture:** PostalMime will expose only the bounded header signals needed
for classification. A pure Worker classifier will apply deterministic
standards-based precedence. The email handler will silently accept and discard
non-human CRM mail before R2 storage, while the Queue consumer repeats the same
classification as defence in depth for already-enqueued or legacy jobs.

**Tech Stack:** TypeScript, Cloudflare Email Workers and Queues, PostalMime,
Vitest, RFC 3834 `Auto-Submitted`, RFC 2919 `List-Id`, RFC 3464
delivery-status MIME.

## Global Constraints

- Existing `board-` email routing behaviour must not change.
- Non-human CRM email must never call Nitro or create a lead, conversation,
  message, event, attachment row, or compatibility communication.
- A deliberate suppression is acknowledged, not retried and not rejected at
  SMTP, because rejection can itself create another automatic response.
- Classification logs may contain only controlled reason codes; never sender,
  recipient, subject, message identifiers, route tokens, or R2 keys.
- HTML, raw MIME, attachment bytes, and unbounded header values must not cross
  the Worker-to-Nitro boundary.
- The production Worker, Queue, DLQ, R2 binding, secrets, and feature flags
  remain unconfigured and disabled.

---

### Task 1: Bounded PostalMime classification signals

**Files:**
- Modify: `workers/email-worker/src/contracts.ts`
- Modify: `workers/email-worker/src/mime.ts`
- Create: `test/workers/emailWorkerMime.test.ts`

**Interfaces:**
- Produces:
  `ParsedInboundAutomationSignals` with nullable `autoSubmitted`,
  `contentType`, `listId`, `precedence`, `xXeroFlowOrigin`, and `returnPath`.
- Extends: `ParsedInboundEmail.automationSignals`.

- [ ] **Step 1: Write the failing parser test**

Create a raw MIME fixture containing:

```text
Auto-Submitted: auto-replied
List-Id: Customer updates <updates.example.com>
Precedence: bulk
X-XeroFlow-Origin: crm-email-gateway
Content-Type: multipart/report; report-type=delivery-status
Return-Path: <>
```

Assert `parseInboundEmail()` returns lower-name, trimmed, maximum-998-character
signal values and does not expose the complete PostalMime header array.

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
pnpm vitest run test/workers/emailWorkerMime.test.ts
```

Expected: FAIL because `automationSignals` does not exist.

- [ ] **Step 3: Implement the bounded extraction**

Add:

```ts
export interface ParsedInboundAutomationSignals {
  autoSubmitted: string | null
  contentType: string | null
  listId: string | null
  precedence: string | null
  xXeroFlowOrigin: string | null
  returnPath: string | null
}
```

Use PostalMime's lowercase `headers` array, take the first matching header,
trim it, and cap each value at 998 characters. Map `email.returnPath` through
the same helper. Do not return `headers` or `headerLines`.

- [ ] **Step 4: Run the parser test**

Run:

```bash
pnpm vitest run test/workers/emailWorkerMime.test.ts
```

Expected: PASS.

### Task 2: Deterministic non-human classifier

**Files:**
- Create: `workers/email-worker/src/inboundClassification.ts`
- Create: `test/workers/emailWorkerInboundClassification.test.ts`

**Interfaces:**
- Consumes: `ParsedInboundEmail`.
- Produces:

```ts
export type CrmInboundEmailClassification =
  | { kind: 'human', reason: 'human' }
  | {
      kind: 'suppressed'
      reason:
        | 'xeroflow_loop'
        | 'delivery_status'
        | 'auto_submitted'
        | 'mailing_list'
    }

export function classifyCrmInboundEmail(
  email: ParsedInboundEmail
): CrmInboundEmailClassification
```

- [ ] **Step 1: Write the failing decision-table tests**

Cover this exact precedence:

1. `X-XeroFlow-Origin: crm-email-gateway` → `xeroflow_loop`.
2. `multipart/report; report-type=delivery-status`,
   `message/delivery-status`, or null return path plus a
   `mailer-daemon`/`postmaster` sender → `delivery_status`.
3. `Auto-Submitted` whose first token is not case-insensitive `no` →
   `auto_submitted`.
4. `List-Id` or legacy `Precedence: list|bulk|junk` → `mailing_list`.
5. Missing/empty signals and `Auto-Submitted: no` → `human`.

Also prove the loop result wins when every signal is present and ordinary
subjects such as “automatic reply” do not classify the message.

- [ ] **Step 2: Run the classifier test and verify failure**

Run:

```bash
pnpm vitest run test/workers/emailWorkerInboundClassification.test.ts
```

Expected: FAIL because the classifier module does not exist.

- [ ] **Step 3: Implement the pure classifier**

Normalise only with `trim().toLowerCase()`. Parse the `Auto-Submitted` first
token before `;`, parse content type case-insensitively, and examine the
already-parsed sender address only for the null-return-path DSN fallback.
Return controlled reason codes only.

- [ ] **Step 4: Run the decision table**

Run:

```bash
pnpm vitest run test/workers/emailWorkerInboundClassification.test.ts
```

Expected: PASS.

### Task 3: Suppress before R2 and repeat at Queue consumption

**Files:**
- Modify: `workers/email-worker/src/index.ts`
- Modify: `workers/email-worker/src/inboundQueue.ts`
- Modify: `test/workers/emailWorkerHandler.test.ts`
- Modify: `test/workers/emailWorkerInboundQueue.test.ts`

**Interfaces:**
- `processCrmInboundQueueJob()` returns:

```ts
export type ProcessCrmInboundQueueJobResult =
  | { status: 'processed', duplicate: boolean }
  | {
      status: 'suppressed'
      reason:
        | 'xeroflow_loop'
        | 'delivery_status'
        | 'auto_submitted'
        | 'mailing_list'
    }
```

- [ ] **Step 1: Write failing email-handler tests**

For every suppression reason, assert an enabled CRM route:

- reads and parses MIME once,
- does not call `setReject`,
- does not write or delete R2 objects,
- does not call the inbound Nitro boundary,
- logs only the controlled reason code.

Add a board-route regression proving an automatic response still follows the
unchanged board adapter path.

- [ ] **Step 2: Write failing Queue defence tests**

Assert an already-enqueued automatic response returns
`{ status: 'suppressed', reason: 'auto_submitted' }`, does not call Nitro, and
is acknowledged by `worker.queue()`. Keep the existing non-2xx retry proof.

- [ ] **Step 3: Run the Worker tests and verify failure**

Run:

```bash
pnpm vitest run \
  test/workers/emailWorkerHandler.test.ts \
  test/workers/emailWorkerInboundQueue.test.ts
```

Expected: FAIL because both paths still hand non-human mail downstream.

- [ ] **Step 4: Implement both suppression gates**

In `email()`, classify only CRM routes after parsing and attachment validation
but before `storeCrmInboundEmailArtifacts()`. Return normally for suppression.
In `processCrmInboundQueueJob()`, classify immediately after retained-MIME
parsing and before envelope normalisation or fetch. Return the discriminated
suppression result. The Queue handler treats either result as success and
acknowledges it.

- [ ] **Step 5: Run the Worker tests**

Run the Task 3 command again.

Expected: PASS.

### Task 4: Review, verification, PRD, and commit

**Files:**
- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Verify: every file modified in Tasks 1–3

**Interfaces:**
- Produces: a checked B6 ledger entry and an evidence-backed progress-log
  checkpoint.

- [ ] **Step 1: Run the focused B1–B6 suite**

Run:

```bash
pnpm vitest run \
  test/workers/emailWorkerMime.test.ts \
  test/workers/emailWorkerInboundClassification.test.ts \
  test/workers/emailWorkerHandler.test.ts \
  test/workers/emailWorkerInboundQueue.test.ts \
  test/workers/emailWorkerR2Artifacts.test.ts \
  test/workers/emailWorkerCrmAdapter.test.ts \
  test/server/api/crmEmailInboundEndpoint.test.ts \
  test/server/api/crmEmailProcessInboundEndpoint.test.ts \
  test/server/utils/crm/emailInboundProcessor.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run scoped ESLint, `git diff --check`, and typecheck comparison**

Confirm no changed B6 file appears in typecheck output. Record the repository
baseline separately if the full command remains red.

- [ ] **Step 3: Run the Worker dry-run**

Run:

```bash
WRANGLER_LOG_PATH=/tmp/crm-email-b6-wrangler.log \
  pnpm exec wrangler deploy --dry-run --config workers/email-worker/wrangler.toml
```

Expected: bundle succeeds, no deployment occurs, and no production R2/Queue
producer binding is introduced.

- [ ] **Step 4: Perform the mandatory deep-dive review**

Re-read every changed file end-to-end. Check classification precedence,
case-insensitive parsing, board-route isolation, retry/ack behaviour, log
redaction, absence of raw headers at the Nitro boundary, and disabled
production configuration.

- [ ] **Step 5: Update the PRD and commit**

Check B6, append exact test/lint/typecheck/dry-run evidence, and state that
production remains disabled. Then:

```bash
git add docs/prd/crm-conversations-email-gateway-prd.md \
  docs/superpowers/plans/2026-07-30-crm-email-inbound-classification.md \
  workers/email-worker/src test/workers
git commit -m "feat(crm-email): suppress non-human inbound mail"
```

