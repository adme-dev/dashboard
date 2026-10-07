# Native customer editor handoff foundation

RND-22 prerequisite, stacked on the customer overview. This provides internal issuance and single-use exchange of customer handoff tickets. It does **not** open Studio, issue an editor JWT, grant editing or prove runtime readiness. No route, service binding or UI button exposes these functions yet.

## Why a separate handoff

Existing editor claims, sessions and commit authority are for agency staff or invited portal clients. Native customer identities must not be converted to those roles or given invented portal/agency records. The handoff keeps the native identity/workspace/site association intact for the future customer-aware Studio session adapter.

`issueCustomerEditorHandoff(nativeCookie, trustedConfiguration)` derives the saved workspace and approved preview site from current native account/session authority. The browser cannot select the identity, workspace, site or return destination. Tickets contain 48 random bytes encoded as a 64-character URL-safe string; only SHA-256 digests are retained. Lifetime is at most two minutes, capped by the native login and approved preview policy expiry.

`redeemCustomerEditorHandoff(ticket, trustedConfiguration)` is intended only for an authenticated private Studio adapter. The configuration requires explicit enablement and distinct canonical HTTPS dashboard/editor origins; paths, credentials, queries and fragments are rejected. Both origins must match the retained receipt. An origin string is routing policy, **not authentication**. A future adapter must authenticate its caller, enforce browser origin/rate limits and verify readiness before invoking these internal services.

Successful redemption returns `kind: customer-editor-handoff`, receipt ID, native identity/workspace, exact staging scope and the fixed `<dashboardOrigin>/studio/dashboard` return URL. It contains no capabilities, original login secret/digest, editor token or Ready flag. The legacy editor claims parser rejects it. Treat it only as an exchange result, never as request admission or a reusable editing credential.

## Fresh authority and concurrency

Issue and consume require active verified native identity/account, current login, active workspace owner membership, no legacy agency binding, active approving staff and the exact retained unpublished preview entitlement/site. Scope is compared with the native receipt; opaque IDs from unrelated customers cannot widen access.

Redemption reads immutable routing data without a row lock, then locks native account/identity/session → workspace/site → handoff. Issuance rechecks preview authority after acquiring site/entitlement locks. Once the ticket lock is obtained it checks current native and preview authority again using the database clock, so a lock wait cannot extend a membership deadline. A conditional update permits exactly one consumption. Logout or revocation committed before admission denies it. A consumed context does not authorize later requests: the future Studio session must retain the native parent relationship and recheck it on every operation and durable commit.

Issue/consume audit events are committed atomically with their receipt changes, with role `customer` and receipt ID only. Tickets and login digests are excluded from audit metadata. A failed transaction leaves no partial issued/consumed result. A lost successful exchange response requires a new ticket; never reset `consumed_at` or extend a retained expiry to retry.

## Storage and rollout

Migration 446 adds `page_studio_customer_editor_handoffs` and its immutable-scope/monotonic-consumption trigger after migrations 402 and 442–445. It is additive and replayable. Local verification applies it twice to the owned disposable PostgreSQL database. No production database change occurs in this slice.

Keep the internal producer unexposed until the paired consumer exists. Rollback can leave the additive table in place; do not reset consumed rows. Expired receipt retention/cleanup must preserve the audit history and will be defined with public activation and abuse limits.

## Required follow-on integration

1. Verify scoped customer database/content/runtime readbacks and retain their receipts; coordinator `complete` alone cannot enable editing.
2. Implement a distinct customer editor session protocol and private exchange adapter, with its own native authority, expiry/logout, typed draft operations and commit fencing. Source editing, AI credit consumption and publication need separate explicit capabilities.
3. Add an origin-checked, rate-limited customer producer and dashboard launch action only after readiness and consumer admission are established. Use POST transport; never put a ticket in a URL, logs or browser storage.
4. Browser-test launch, save/reload, return to the fixed dashboard, wrong-origin/cross-customer rejection and logout expiry on two hosted customers. No standalone editor launch is claimed by this prerequisite.

## Verification

Real PostgreSQL tests exercise hash-only storage, bounded expiry, migration replay, scope immutability, canonical origins, no-allocation issuance, cross-customer setup denial, concurrent redemption, replay, native/account/identity/workspace/membership/approver/entitlement/site revocation, fixed return destination and legacy claims rejection. Deterministic lock tests cover logout during admission and membership expiry while awaiting consumption. Both issuance and consumption expiry races failed before their final fresh-authority checks and passed afterwards. Final independent review identified the issuance gap; it was fixed in one regression-driven pass.

Final verification: 27 handoff PostgreSQL cases and 33 native provisioning cases pass. Full repository suite: 15,211 passed, 1,612 environment-dependent skips; separately scheduled CRM route-scan suite: 54 passed. Focused ESLint and whitespace checks pass. Server TypeScript exactly matches the existing 289-diagnostic baseline; this is not a clean project typecheck. No browser flow changed or was claimed tested here. Remote CI/build remains a merge gate.
