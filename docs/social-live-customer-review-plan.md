# Customer review for published Facebook changes

Continue the previously approved Wall/customer-portal workflow. Implement one complete extension to the existing feed-caption/removal controls.

1. Add immutable review requests tied to client, post, connected account, provider receipt, current caption, proposed action/caption and post fingerprint. Staff requests require write + management + client access. Replacing a request supersedes previous pending/approved versions; request UUIDs are idempotent. Requests expire after seven days.
2. Show pending/history requests in portal Approvals. Authenticated customer scope and canApproveWork are mandatory. Customers approve, reject or request changes with feedback against the exact immutable request. Customer decisions never contact Facebook. Retain actor/time and mandatory transaction audit.
3. A manager explicitly applies an approved request using the existing durable live-operation pipeline. Under a post lock, check the exact request, expiry, post fingerprint, account, provider ID and captions; consume the request in the same transaction as operation reservation. Re-read Facebook before the write. Changed captions fail without a provider mutation. Ambiguous outcomes retain existing reconciliation/duplicate protections. Original publication remains intact.
4. Extend the existing Wall slideover: customer-required posts can propose a change; show review status/feedback and the separately labelled apply button. Add a portal section with Page identity, linked Facebook post, before/after captions, requester/date, feedback and an explicit removal warning. Use existing sans typography, semantic theme colors, left-aligned text and constrained responsive columns; Nuxt UI controls only. No automatic publication, removal or task completion.
5. Reduce server footprint by moving authenticated interactive portal social review components to client-only rendering, preserving auto-component names. Do not change release budgets. Verify with endpoint/permission tests, PostgreSQL races and provider spies, portal interaction tests, full release guards/build, and read-only live verification. No real provider mutation solely for testing.

Acceptance: customer-governed captions/removals cannot bypass fresh review; stale/cross-client/replayed/replaced/expired requests cannot apply; one concurrent apply produces at most one provider mutation; feedback and all actors remain visible; portal approval alone never changes Facebook.

No email or Slack notification is sent by this implementation. Requests appear in the existing customer portal Approvals area. Notifications can be added through the configured client communication preferences in a later slice.

## Verification — 4 October 2026

- Combined social/publishing/approval regression: 127 files, 873 tests passed.
- Final changed-path regression after defensive row guards: 4 files, 45 tests passed, including real PostgreSQL concurrency and customer/manager UI interactions.
- Focused ESLint and whitespace checks passed. Full repository typecheck remains blocked by existing unrelated errors; no diagnostics remain in the changed workflow files.
- Additive migration 449 applied; primary and both secondary indexes verified.
- Safari QR Codes navigation verified before release. Production verification recorded in the rollout discovery ledger after deployment.
- No real Facebook edits or removals made solely for testing.

Rollback: restore the preceding verified Cloudflare artifact e69c78ba (source 1ac91bb5a); retain additive review tables and their audit records. Existing customer-governed live edits remain blocked in that version.

Follow-up: unify portal approval counters/filters and paginate review history beyond its current latest 50 requests. Client notifications remain a separately scoped follow-up.
