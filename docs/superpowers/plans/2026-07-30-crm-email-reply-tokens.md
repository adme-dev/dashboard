# CRM Email Reply Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and verify opaque, domain-bound CRM reply tokens without exposing tenant or record identifiers.

**Architecture:** Web Crypto generates a 192-bit opaque route key and signs a canonical version/key/domain payload with HMAC-SHA256. Neon stores only the SHA-256 route-key hash. Verification supports explicit secret versions for rotation and returns only the version and lookup hash.

**Tech Stack:** TypeScript, Web Crypto API, Vitest, Cloudflare Workers-compatible runtime APIs

## Global constraints

- Tokens contain no client, person, lead, opportunity, conversation, or database IDs.
- Route keys contain 192 bits of cryptographic randomness.
- HMAC secrets contain at least 256 bits of UTF-8 material.
- Domains are canonical lower-case ASCII hostnames and are part of the signature.
- Signature comparison is constant-time for valid-length byte arrays.
- Verification never throws for untrusted token input and returns no detailed failure oracle.
- Secret versions are explicit positive integers to support controlled rotation.
- No Node-only `Buffer` or `crypto` API is used.

### Task 1: Test-first reply token contract

**Files:**

- Create: `test/server/utils/crm/emailReplyToken.test.ts`
- Create: `server/utils/crm/emailReplyToken.ts`

**Interfaces:**

- `createCrmEmailReplyToken(input)` returns
  `Promise<{ token: string, routeTokenHash: string }>`
- `verifyCrmEmailReplyToken(input)` returns
  `Promise<{ valid: true, version: number, routeTokenHash: string } | { valid: false }>`

- [ ] Write tests proving round-trip validation, 64-character hash output,
      key-version rotation, domain binding, tamper rejection, and malformed
      input fail-closed behavior.
- [ ] Run the test and observe module-resolution failure.
- [ ] Implement the minimal Web Crypto token module.
- [ ] Run the token test and existing email-contract test.
- [ ] Re-read both files, check for identifiers/secrets in returned values, and
      run `git diff --check`.
- [ ] Commit as `feat(crm): add secure email reply tokens`.

### Task 2: Ledger update

**Files:**

- Modify: `docs/prd/crm-conversations-email-gateway-prd.md`
- Modify: `docs/superpowers/plans/2026-07-30-crm-email-reply-tokens.md`

- [ ] Check off A3 only after the red/green evidence passes.
- [ ] Record test counts and commit hash.
- [ ] Commit as `docs(crm): record reply token verification`.

