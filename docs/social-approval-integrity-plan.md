# Approval integrity follow-up

Scope: close the approval race and published-record mutation paths discovered while preparing versioned customer revisions.

1. Reproduce terminal-record rejection/re-request bugs and stale review decisions. Add real PostgreSQL race tests, with no live provider mutations.
2. Return an opaque SHA-256 review fingerprint in staff and portal review projections. Staff/customer decisions must carry that fingerprint; compare it atomically to the current row. Keep client/role checks and require write access for staff mutations. A changed row requires reloading and reviewing again.
3. Restrict request/reject actions to drafts, and compare the fresh row fingerprint in ordinary edits so they cannot overwrite a concurrent approval/dispatch. Reset any existing customer decision when payload changes. Recheck the customer gate in the provider dispatch claim.
4. Send review fingerprints from the current staff/customer UI. On conflict, reload the preview and require a new decision. Hide terminal posts from the pending queue/count.
5. Run focused endpoint, portal, component and PostgreSQL integration tests; lint; guarded production build/deploy; read-only Safari verification. Keep customer-approved live revisions locked until their complete versioned request/decision/apply flow is implemented.

No migration is required. PostgreSQL native sha256/encode functions are documented at https://www.postgresql.org/docs/14/functions-binarystring.html. Hashes are concurrency tokens, never authorization credentials. The whole current social_posts row is covered, including payload, accounts, schedule and approval state; conservative invalidation is intentional.

## Verification and limits — 2026-10-04

- Reproduced stale-decision/terminal-reset failures before implementation.
- 801 social, endpoint, portal and component tests passed; 15 isolated PostgreSQL 14 integration cases passed, including concurrent reviewers, approval/edit races and dispatch customer gates.
- 26 navigation and deployment-guard tests passed. Navigation badge uses the same draft-only predicate as the approval queue.
- Changed focused files pass ESLint. Shared types/composable retain their existing lint debt; baseline comparison checks no new diagnostics. No dependencies or migrations added.
- Approval audit metadata records the reviewed fingerprint. Existing staff audit writes remain best-effort; portal decisions/audits remain transactional.
- Customer-approved live caption/removal revisions remain locked until the separate request/review/apply workflow is complete. No live provider mutation was used for testing.
- Follow-up: review write-access consistency across other publishing mutations (manual publish/schedule), broaden staff component conflict-recovery coverage, and complete customer-governed live revisions.
