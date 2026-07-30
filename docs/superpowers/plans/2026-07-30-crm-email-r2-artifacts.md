# CRM Email R2 Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist validated lead/reply raw MIME and attachment bytes to a
private R2 binding with deterministic metadata, cleanup guarantees, and a
minimal manifest that the authenticated Nitro boundary can enqueue.

**Architecture:** The Email Routing Worker continues to reject invalid and
oversized messages before reading the stream. When the new Worker-side flag is
enabled for a syntactically valid lead/reply route, it reads and parses once,
validates attachment limits, writes raw MIME and attachment objects through an
in-process R2 binding, then calls the B4 Nitro boundary. Every Promise is
awaited. Partial writes and rejected downstream handoffs are deleted. The live
board adapter remains unchanged.

**Tech Stack:** Cloudflare Email Workers, R2 Workers API, PostalMime,
TypeScript, Vitest

References:

- [R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [R2 object lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)

## Global Constraints

- Use `CRM_EMAIL_BUCKET` as a direct R2 binding; never use the Cloudflare REST
  API or an account API token inside the Worker.
- Keep `CRM_EMAIL_INBOUND_ENABLED` off by default and require all CRM bindings
  before reading MIME for lead/reply routes.
- Preserve the existing board route, request shape, secret, and failure
  behavior exactly.
- Generate opaque keys below `crm-email/inbound/YYYY/MM/DD/<uuid>/`.
- Store raw MIME as `message.eml` with `message/rfc822` HTTP metadata.
- Store attachment bytes separately with content type, SHA-256 integrity, scan
  state `pending`, and retention expiry in custom metadata.
- Default retention is 30 days and cannot exceed 30 days in this slice.
- Custom metadata must not contain sender, recipient, subject, body, routing
  token, or original attachment filename.
- If any write fails, delete every object already written for that message.
- If Nitro does not accept the manifest, delete every object written for that
  attempt before rejecting the SMTP transaction.
- Queue and request payloads contain object keys and safe attachment metadata,
  never attachment bytes or raw MIME.
- Do not configure the R2 binding, lifecycle rule, secrets, feature flags,
  Email Routing rules, or deploy in this slice.

### Task 1: R2 artifact storage and rollback

**Files:**

- Create: `workers/email-worker/src/r2Artifacts.ts`
- Create: `test/workers/emailWorkerR2Artifacts.test.ts`
- Modify: `workers/email-worker/src/contracts.ts`

**Interfaces:**

- Produces:
  `resolveCrmEmailRetentionDays(value?: string): number`
- Produces:
  `storeCrmInboundEmailArtifacts(input, dependencies):
  Promise<CrmInboundArtifactManifest>`
- Produces:
  `deleteCrmInboundEmailArtifacts(bucket, manifest): Promise<void>`

- [x] Write failing tests for the 30-day default, invalid values, a valid
      shorter retention, and clamping above 30 days.
- [x] Write failing storage tests asserting opaque date-prefixed keys, raw MIME
      and attachment content types, SHA-256 integrity, safe custom metadata,
      and a returned manifest without bytes or sensitive envelope data.
- [x] Write failing rollback tests proving the first write is deleted when a
      later write fails and cleanup deletes all manifest keys.
- [x] Run the focused test and observe the missing-module failure.
- [x] Implement awaited R2 `put`/`delete` operations using a dependency-injected
      clock and UUID generator.
- [x] Run focused tests and ESLint.
- [x] Re-read the changed files and commit:
      `feat(email-worker): store guarded CRM email artifacts`.

### Task 2: Extend the authenticated manifest contract

**Files:**

- Modify: `server/api/internal/crm-email/inbound.post.ts`
- Modify: `server/utils/crm/emailInboundQueue.ts`
- Modify: `test/server/api/crmEmailInboundEndpoint.test.ts`
- Modify: `test/server/utils/crm/emailInboundQueue.test.ts`

**Contract addition:**

```ts
rawMimeSha256: string
rawMimeExpiresAt: string
attachments: Array<{
  r2ObjectKey: string
  filename: string
  contentType: string
  byteSize: number
  sha256: string
  contentId: string | null
}>
```

- [x] Add failing endpoint cases for path traversal, foreign prefixes, invalid
      hashes/sizes, too many attachments, and unknown fields.
- [x] Add a failing success case proving safe attachment metadata reaches the
      versioned Queue job without bytes.
- [x] Run the focused tests and observe the contract failures.
- [x] Extend the strict Zod boundary and Queue job type with the safe manifest.
- [x] Run focused tests, ESLint, and `git diff --check`.
- [x] Re-read the changed files and commit:
      `feat(crm-email): accept safe R2 artifact manifests`.

### Task 3: Flag-gated lead/reply adapter

**Files:**

- Create: `workers/email-worker/src/crmAdapter.ts`
- Create: `test/workers/emailWorkerCrmAdapter.test.ts`
- Modify: `workers/email-worker/src/index.ts`
- Modify: `workers/email-worker/src/contracts.ts`
- Modify: `test/workers/emailWorkerHandler.test.ts`
- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Modify:
  `docs/superpowers/plans/2026-07-30-crm-email-r2-artifacts.md`

- [ ] Write failing adapter tests proving the B4 URL, dedicated shared-secret
      header, route/domain mapping, provider ID fallback to raw SHA-256,
      received timestamp, and exact artifact manifest.
- [ ] Write failing handler tests proving lead/reply remain unread while the
      Worker flag is off or required bindings are absent.
- [ ] Write failing enabled-path tests proving one read/parse/store/deliver
      sequence, unsafe attachments never store, and rejected Nitro handoffs
      delete every stored object.
- [ ] Run focused tests and observe failures against the disabled route branch.
- [ ] Parse PostalMime attachments as array buffers, retaining content only
      inside the Worker until R2 persistence completes.
- [ ] Implement the flag-gated CRM adapter without changing the board branch.
- [ ] Run all Worker/CRM focused tests, focused ESLint, Wrangler dry-run,
      `git diff --check`, and typecheck baseline comparison.
- [ ] Re-read every changed/new file. Mark B3 and B1 complete; keep production
      flags, bindings, Queue consumer, and deployment disabled.
- [ ] Commit:
      `feat(email-worker): stage CRM inbound email in R2`.

## Live/Deployment Gate

- This slice is locally verified only.
- Do not add or activate a production R2 binding until the bucket lifecycle
  rule is verified to delete the `crm-email/inbound/` prefix after 30 days.
- Do not set `CRM_EMAIL_INBOUND_ENABLED` or deploy the Email Routing Worker.
- Before activation, B5 must consume and deduplicate the Queue job, persist
  attachment rows, and delete or quarantine rejected artifacts.
