# CRM Email Outbound Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task.

**Goal:** Complete PRD task C3 with a tenant-safe, fail-closed policy boundary
that authorises a CRM email recipient and sender identity before C4 can queue
any outbound work.

**Architecture:** A provider-neutral policy service receives only
server-derived actor authority plus a client/person/recipient request. Its
Postgres repository resolves the CRM person and ready sender identity within
the same client, checks the canonical suppression list, and atomically consumes
namespaced minute/day rate buckets only after every static policy gate passes.
It returns either a prepared policy grant or a controlled denial code; raw
database/provider diagnostics and contact data never appear in errors.

**Tech Stack:** TypeScript, Neon/Postgres through `server/utils/db.ts`, Zod,
Vitest.

## Global Constraints

- The caller must derive `clientId`, `actorId`, and `canSend` from authenticated
  server-owned context. Caller-supplied tenant or permission claims are never
  accepted at an HTTP boundary.
- A recipient must be the canonical email of a non-deleted CRM person in the
  same client. C3 does not allow arbitrary `to`, `cc`, or `bcc` recipients.
- `do_not_contact`, `do_not_email`, and any canonical `suppression_list` row
  block sending.
- The selected sender identity must belong to the same client and have
  `status = 'ready'`. With no explicit selection, use that client's ready
  default identity.
- Rate limiting is fail-closed for outbound email. Do not reuse the generic
  LLM limiter's fail-open wrapper.
- Rate keys must be namespaced and hash the actor identifier so operational
  tables do not expose user IDs.
- Denials expose only stable reason codes. They must not reveal whether a
  person, sender identity, or suppressed address exists in another tenant.
- No message row, Queue job, provider call, binding, feature flag, endpoint,
  UI, production sender, or deployment is added in C3.

---

### Task 1: Define and test the provider-neutral policy contract

**Files:**
- Create: `server/utils/crm/emailOutboundPolicy.ts`
- Create: `test/server/utils/crm/emailOutboundPolicy.test.ts`

- [x] **Step 1: Write the failing contract and decision-table tests**

Cover:

- authorised human recipient + ready tenant sender → grant;
- denied actor → `permission_denied`;
- malformed or non-canonical requested address → `recipient_unavailable`;
- missing/cross-tenant/deleted person → `recipient_unavailable`;
- `do_not_contact` and `do_not_email` → `recipient_opted_out`;
- any suppression reason → `recipient_suppressed`;
- missing/pending/degraded/disabled/cross-tenant sender →
  `sender_unavailable`;
- minute/day exhaustion → `rate_limited`;
- repository failure → `policy_unavailable`;
- static policy denials do not consume rate capacity;
- results never include suppression reasons, database errors, or unrelated
  tenant data.

- [x] **Step 2: Run the test and verify the red state**

```bash
pnpm vitest run test/server/utils/crm/emailOutboundPolicy.test.ts
```

Expected: FAIL because the policy module does not exist.

- [x] **Step 3: Add the minimal contract and evaluator**

Expose:

```ts
export type CrmEmailOutboundPolicyCode =
  | 'allowed'
  | 'permission_denied'
  | 'recipient_unavailable'
  | 'recipient_opted_out'
  | 'recipient_suppressed'
  | 'sender_unavailable'
  | 'rate_limited'
  | 'policy_unavailable'

export async function authorizeCrmEmailOutbound(
  request: CrmEmailOutboundPolicyRequest,
  repository?: CrmEmailOutboundPolicyRepository
): Promise<CrmEmailOutboundPolicyResult>
```

The granted result contains the canonical person ID, canonical recipient
address, sender identity ID/address/display name, and controlled rate reset.
Denied results contain only `allowed: false`, `code`, and (only for rate
limits) a reset timestamp.

- [x] **Step 4: Run the contract tests**

Expected: PASS.

### Task 2: Implement tenant-scoped Postgres resolution and rate consumption

**Files:**
- Modify: `server/utils/crm/emailOutboundPolicy.ts`
- Create: `test/server/utils/crm/emailOutboundPolicyRepository.test.ts`

- [x] **Step 1: Write failing repository SQL tests**

Assert:

- person lookup includes `client_id`, `id`, `deleted_at IS NULL`, and canonical
  email equality;
- sender lookup includes `client_id`, optional identity ID/default selection,
  and `status = 'ready'`;
- suppression lookup uses the canonical case-insensitive list;
- rate consumption uses `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE`,
  never increments beyond its limit, and uses parameterised window/limit;
- no raw actor ID appears in the rate key.

- [x] **Step 2: Implement the Postgres repository**

Use `queryOne()` for all reads and atomic bucket consumption. The default
limits are 30 messages per actor/client minute and 500 per actor/client day.
Limits remain injectable for deterministic tests and later tenant policy.

- [x] **Step 3: Run both policy test files**

```bash
pnpm vitest run \
  test/server/utils/crm/emailOutboundPolicy.test.ts \
  test/server/utils/crm/emailOutboundPolicyRepository.test.ts
```

Expected: PASS.

### Task 3: Verify, update the PRD ledger, and commit

**Files:**
- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Modify: this plan
- Verify: all Task 1–2 files

- [x] **Step 1: Run the focused CRM email suite**

```bash
pnpm vitest run \
  test/server/utils/crm/emailOutboundPolicy.test.ts \
  test/server/utils/crm/emailOutboundPolicyRepository.test.ts \
  test/server/utils/crm/transactionalEmail.test.ts \
  test/workers/emailWorkerCloudflareTransactionalEmail.test.ts \
  test/server/utils/crm/emailRepository.test.ts
```

- [x] **Step 2: Run quality gates**

```bash
pnpm exec eslint \
  server/utils/crm/emailOutboundPolicy.ts \
  test/server/utils/crm/emailOutboundPolicy.test.ts \
  test/server/utils/crm/emailOutboundPolicyRepository.test.ts
pnpm exec tsc --noEmit -p workers/email-worker/tsconfig.json
git diff --check
```

- [x] **Step 3: Perform the mandatory deep-dive review**

Re-read every changed file end-to-end. Confirm server imports use `~~/`,
queries are parameterised and tenant-scoped, address comparisons are
canonical, rate limits fail closed, no PII is logged, and no deployment
configuration or production activation was introduced.

- [x] **Step 4: Update PRD C3 and progress evidence**

Mark C3 complete only after all focused tests and quality gates pass. State
that C4 remains required before any outbound request can be queued.

- [x] **Step 5: Commit**

```bash
git add \
  docs/prd/crm-conversations-email-gateway-prd.md \
  docs/superpowers/plans/2026-07-30-crm-email-outbound-policy.md \
  server/utils/crm/emailOutboundPolicy.ts \
  test/server/utils/crm/emailOutboundPolicy.test.ts \
  test/server/utils/crm/emailOutboundPolicyRepository.test.ts
git commit -m "feat(crm-email): enforce outbound policy"
```
