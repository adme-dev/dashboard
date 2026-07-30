# CRM Email Cloudflare Send Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete PRD tasks C1–C2 with a provider-neutral transactional-email
interface and a dormant Cloudflare Email Sending Workers-binding adapter.

**Architecture:** The canonical interface lives in server CRM utilities and
contains no Cloudflare field names. A Worker-local adapter translates a fully
prepared transactional message into the official `SendEmail` builder and maps
documented provider errors into controlled durable outcomes. No live binding
is added because the connected Cloudflare account currently has no onboarded
Email Sending subdomain.

**Tech Stack:** TypeScript, `@cloudflare/workers-types`, Cloudflare Email
Service `send_email` binding, Vitest, Wrangler dry-run.

## Global Constraints

- Cloudflare Email Service is transactional-only; existing Resend marketing
  delivery must remain unchanged.
- Use the official `SendEmail` Worker type; do not hand-author a provider
  binding interface.
- Always send a plain-text body; HTML is optional.
- Maximum combined `to` + `cc` + `bcc` recipients is 50.
- Provider error messages may contain PII and must never be returned or logged.
  Only controlled provider error codes may leave the adapter.
- Unknown provider failures are retryable to prevent silent message loss and
  eventually terminate in the future C4 DLQ.
- Do not add `[[send_email]]`, a sender address, domain, secret, Queue producer,
  feature flag, or deployment in this slice.
- Production remains fail-closed until domain onboarding and C3–C6 complete.

---

### Task 1: Provider-neutral transactional contract

**Files:**
- Create: `server/utils/crm/transactionalEmail.ts`
- Create: `test/server/utils/crm/transactionalEmail.test.ts`

**Interfaces:**
- Produces:

```ts
export interface CrmTransactionalEmailAddress {
  address: string
  name: string | null
}

export type CrmTransactionalEmailAttachment =
  | {
      disposition: 'attachment'
      contentId?: never
      filename: string
      contentType: string
      content: string | ArrayBuffer | ArrayBufferView
    }
  | {
      disposition: 'inline'
      contentId: string
      filename: string
      contentType: string
      content: string | ArrayBuffer | ArrayBufferView
    }

export interface PreparedCrmTransactionalEmail {
  from: CrmTransactionalEmailAddress
  to: CrmTransactionalEmailAddress[]
  cc: CrmTransactionalEmailAddress[]
  bcc: CrmTransactionalEmailAddress[]
  replyTo: CrmTransactionalEmailAddress | null
  subject: string
  text: string
  html: string | null
  headers: Record<string, string>
  attachments: CrmTransactionalEmailAttachment[]
}

export type CrmTransactionalEmailSendResult = {
  outcome: 'accepted' | 'retryable' | 'permanent_failure'
  provider: 'cloudflare_email'
  providerMessageId: string | null
  errorClass: string | null
}

export interface CrmTransactionalEmailProvider {
  send(
    email: PreparedCrmTransactionalEmail
  ): Promise<CrmTransactionalEmailSendResult>
}
```

- [ ] **Step 1: Write the failing contract test**

Create a fake provider implementing `CrmTransactionalEmailProvider`, send a
message with named and unnamed participants, plain text, optional HTML,
threading/loop headers, and an inline attachment. Assert the result contains
only the canonical provider outcome fields and the request contains no
`reply_to`, Cloudflare binding, API token, tenant ID, or Queue field.

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
pnpm vitest run test/server/utils/crm/transactionalEmail.test.ts
```

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Add the minimal provider-neutral types**

Create the exact interfaces above. Do not add runtime sending, policy, storage,
or Cloudflare imports.

- [ ] **Step 4: Run the contract test**

Run the Task 1 command again.

Expected: PASS.

### Task 2: Cloudflare Workers binding adapter

**Files:**
- Create: `workers/email-worker/tsconfig.json`
- Create: `workers/email-worker/src/cloudflareTransactionalEmail.ts`
- Create: `test/workers/emailWorkerCloudflareTransactionalEmail.test.ts`

**Interfaces:**
- Consumes: `PreparedCrmTransactionalEmail`,
  `CrmTransactionalEmailProvider`, and the official global `SendEmail` type
  from `@cloudflare/workers-types/latest`.
- Produces:

```ts
export function createCloudflareTransactionalEmailProvider(
  binding: SendEmail
): CrmTransactionalEmailProvider
```

- [ ] **Step 1: Write the failing translation test**

Use a typed fake binding. Assert translation to:

```ts
{
  from: { email: 'sales@example.com', name: 'Sales' },
  to: ['customer@example.net'],
  cc: [{ email: 'manager@example.net', name: 'Manager' }],
  bcc: [],
  replyTo: 'reply+opaque@reply.example.com',
  subject: 'Re: Vehicle enquiry',
  text: 'Thanks for your enquiry.',
  html: '<p>Thanks for your enquiry.</p>',
  headers: {
    'In-Reply-To': '<incoming@example.net>',
    'References': '<root@example.net> <incoming@example.net>',
    'X-XeroFlow-Origin': 'crm-email-gateway'
  },
  attachments: [{
    disposition: 'inline',
    contentId: 'photo-1',
    filename: 'vehicle.jpg',
    type: 'image/jpeg',
    content: expect.any(ArrayBuffer)
  }]
}
```

Assert `messageId` is trimmed and bounded to 500 characters in the accepted
canonical result.

- [ ] **Step 2: Write the failing error decision table**

Assert:

- `E_RATE_LIMIT_EXCEEDED`, `E_DAILY_LIMIT_EXCEEDED`,
  `E_DELIVERY_FAILED`, and `E_INTERNAL_SERVER_ERROR` → `retryable`.
- documented validation, sender, recipient, content, and header `E_*` codes →
  `permanent_failure`.
- an unknown error or malformed success result → `retryable`.
- no provider exception message appears in the returned result or logs.

- [ ] **Step 3: Run the adapter test and verify failure**

Run:

```bash
pnpm vitest run test/workers/emailWorkerCloudflareTransactionalEmail.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Add the official Worker type configuration**

Create:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types/latest"]
  },
  "include": ["src/**/*.ts"]
}
```

Do not add a `send_email` Wrangler binding.

- [ ] **Step 5: Implement translation and controlled error mapping**

Translate a participant with a non-empty name to `{ email, name }`; otherwise
send the address string. Copy recipient arrays, headers, text/HTML, and
attachments without mutation. Catch provider exceptions, read only a
string-valued `code`, and map it through explicit retryable/permanent sets.
Use `cloudflare_email_unknown` for unrecognised exceptions and
`cloudflare_email_invalid_response` when `messageId` is absent or blank.

- [ ] **Step 6: Run the adapter tests**

Run the Task 2 command again.

Expected: PASS.

### Task 3: Verification, PRD, and commit

**Files:**
- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Modify: `docs/superpowers/plans/2026-07-30-crm-email-cloudflare-send-adapter.md`
- Verify: every file changed by Tasks 1–2

**Interfaces:**
- Produces: checked C1–C2 ledger entries that explicitly distinguish code
  readiness from domain/binding activation.

- [ ] **Step 1: Run the focused CRM email contract/Worker suite**

Run:

```bash
pnpm vitest run \
  test/server/utils/crm/transactionalEmail.test.ts \
  test/server/utils/crm/emailContracts.test.ts \
  test/workers/emailWorkerCloudflareTransactionalEmail.test.ts \
  test/workers/emailWorkerHandler.test.ts \
  test/workers/emailWorkerInboundQueue.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run strict Worker typecheck**

Run:

```bash
pnpm exec tsc --noEmit -p workers/email-worker/tsconfig.json
```

Expected: PASS using the official Cloudflare types.

- [ ] **Step 3: Run scoped ESLint and `git diff --check`**

Expected: PASS.

- [ ] **Step 4: Run the Worker dry-run**

Run:

```bash
WRANGLER_LOG_PATH=/tmp/crm-email-c2-wrangler.log \
  pnpm exec wrangler deploy --dry-run --config workers/email-worker/wrangler.toml
```

Expected: bundle succeeds, no deployment occurs, and only `API_URL` appears;
no `send_email` binding is present.

- [ ] **Step 5: Perform the mandatory deep-dive review**

Re-read every changed file. Check provider-neutral naming, official type use,
recipient and attachment translation, no mutation, controlled error mapping,
no error-message leakage, no committed sender/domain/secret/binding, and no
changes to Resend marketing.

- [ ] **Step 6: Update the PRD and commit**

Record the live prerequisite result (“No sending subdomains found in this
account”), check C1–C2 as code-complete/dormant, record exact verification
evidence, and keep C3–C6 open. Then:

```bash
git add docs/prd/crm-conversations-email-gateway-prd.md \
  docs/superpowers/plans/2026-07-30-crm-email-cloudflare-send-adapter.md \
  server/utils/crm/transactionalEmail.ts \
  workers/email-worker/tsconfig.json \
  workers/email-worker/src/cloudflareTransactionalEmail.ts \
  test/server/utils/crm/transactionalEmail.test.ts \
  test/workers/emailWorkerCloudflareTransactionalEmail.test.ts
git commit -m "feat(crm-email): add Cloudflare send adapter"
```

