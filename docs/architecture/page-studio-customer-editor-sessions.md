# Native customer editor sessions and draft persistence

RND-22 internal integration, following the native handoff. This increment does not expose Open Studio, mark a site Ready, or grant public trial access. The Sandbox/browser lifecycle and hosted runtime/storage receipts remain required.

## Authority and transaction boundary

Migration 447 records one immutable child session per consumed handoff. Exchange consumes the opaque ticket, writes the session, signs an ES256 JWT and checks current native authority in the same database transaction. Signing or authority failure rolls everything back. A committed exchange is single-use; a lost response requires a new handoff. Tokens and original login credentials are never stored in the child ledger or audit metadata.

The token has type `XEROFLOW-PAGE-STUDIO-CUSTOMER-SESSION`, audience `xeroflow-page-studio-customer`, role `customer` and environment `staging`. Its UUID identity, workspace, business and site are derived from native ownership. Claims include the exact editor origin and dashboard return URL. Lifetime is at most four hours and is clamped to the native login and preview entitlement. Only six workspace capabilities exist: create, reconnect, checkpoint, preview, terminate and status. Source editing, AI/model invocation and publishing are excluded. Existing agency/client JWT acceptance remains unchanged.

A valid signature alone grants no persistent access. Every private authorization/read/save verifies exact immutable stored claims, native login/account/identity, workspace membership, active ownership, preview entitlement and approving staff. Logout/revocation, expiry and suspension deny an otherwise valid child JWT. Native rows are locked before site and child rows; database-clock checks repeat after lock waits. Existing saves retain compare-and-swap and immutable replay semantics, reject managed-CMS graph bypass and audit native customer provenance. A stale expected head is a conflict, never an overwrite.

## Private transport

POST `/internal/page-studio/customer-sessions/` operations:

| Operation | Body | Additional credential | Response |
| --- | --- | --- | --- |
| `exchange` | `{ticket}` | Opaque single-use handoff | Signed token, sessionId, expiresAt, returnUrl |
| `authorize` | `{capability}` | `x-page-studio-customer-session` | Exact session/capability receipt |
| `checkpoint` | `{checkpoint, expectedCheckpointId}` | Customer session header | Existing compare-and-swap receipt |
| `latest-checkpoint` | `{}` | Customer session header | `{checkpoint}` pointer or null |

All operations require private machine authentication, `PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED=true`, `PAGE_STUDIO_PROVISIONING_ENVIRONMENT=staging`, distinct canonical HTTPS `PAGE_STUDIO_CUSTOMER_ORIGIN` / `PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN`, and existing session signing/verification configuration. Configuration origins must match the token. The private gateway forwards the customer token only on the three exact authenticated POST paths. No browser cookies, raw caller-selected read scope, redirects or public exchange route are added. Responses are `private, no-store`; errors retain denial/conflict statuses without exposing provider/signing detail.

The Studio companion adds a distinct verifier and private client that validates signed exchange receipts, exact session/capability admissions, draft actor/scope, returned checkpoint IDs and storage keys. A public fixture produced by the actual Dashboard signer tests compatibility; it includes only an ephemeral public key and expired synthetic token, not a private key.

## Remaining integration and activation gates

These endpoints persist **checkpoint metadata**, not arbitrary editor document bytes. A trusted typed editor must validate the document, store bytes under the exact scoped key and verify the digest before committing metadata. Implement native Sandbox lifecycle, safe customer preview, browser launch/return/reconnect and typed save/reload before wiring these methods to any customer route. Retain/recheck original native authority throughout; do not coerce customer claims into staff or portal roles. Customer-owned CMS binding and managed graph adoption stay mandatory.

Migration 447 is additive and replayable, applied twice only to the owned local database. Production stays disabled. Hosted database/runtime/bucket receipts, browser acceptance, QR/navigation regressions, fresh-main reconciliation, CI builds and target checks remain release gates. Marketing claims and the Ready state must wait for that evidence.

## Verification record

Dashboard full suite: 15,264 passed plus 54 separately scheduled route-scan cases; 1,612 environment-dependent skips. The new PostgreSQL suite includes 20 real-database cases, alongside 22 token and 8 HTTP cases; the gateway suite has 34 cases. Focused lint passes. Server TypeScript matches the unchanged 289-diagnostic baseline. One independent paired review found no Critical, Important or Minor defects. The review explicitly retained the consumer/runtime/browser/hosted rollout gates above; there were no deferred minor findings. Studio's final verification is recorded with its companion PR.
