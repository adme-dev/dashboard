# Recovery continuation review and current authority

This private implementation adds strict v2 review and consent commitments and a current-authority reader. It does not expose a route, issue a continuation grant, persist a review, renew a plan, admit an effect, or activate transfers. The existing v1 schema and current-authority helpers are unchanged.

## Contract

The review retains existing relational JSON paths (`evidence.authority` and `evidence.principals`), commits full retained progress, the exact predecessor and descriptor digest, and separately hashes current original-principal/renewed-plan evidence. Original native enabled-head identity is not the mutable PostgreSQL recovery-head snapshot. Both are checked independently. Review and consent windows are at most one hour. Consent projection requires exact canonical UTC millisecond strings and rejects Date values: controllers must select exact timestamps and reject sub-millisecond persisted values before formatting, not silently truncate them.

Existing review/consent tables can be reused with a version-dispatched database guard. A continuation journal grant replaces the legacy approval row for v2; legacy approval paths must reject v2 explicitly. Migrations480/481 now implement the journal and version-dispatched relational guard in this foundation; review/consent/grant controllers and native execution remain outstanding. See the continuation journal plan.

## Current authority and final fence

Within the caller's transaction, `recoveryContinuationCurrentContext` proves the original reserved request/intent, original operator with a current genuine login, original native owner/account/workspace/site authority, original source-freeze/admission lineage, and actual current plan. It accepts only the original epoch's applied/version4 or revoked/version5 recovery head. The historical renewal audit must match the actual current site entitlement and old cancelled entitlement, including original entitlement fingerprint and unchanged semantic plan terms. An expired current plan remains unsupported; an old audit is not a renewal.

The helper uses the existing retained completion reader to distinguish a completed destination selection from a still-valid original source. Progress, physical observations, descriptors, predecessor journal continuity and grant conditions remain mandatory controller checks. A full genuine postcompletion continuation lifecycle test awaits that integration; no completion rows or successful database results were fabricated here.

`finishRecoveryContinuationAuthority` repeats authority reads, compares the exact internal head/plan/selection fence, validates the exact consent login hashes, and uses a final materialized database clock bounded by the proposed deadline, one hour, the actual plan, owner membership and login expiries. The controller must pass both party hashes when granting; individual reviews/consents may fence only their caller. Hold the transaction through the protected write. No original recovery deadline is extended or consulted as current permission.

## Evidence

Ten focused tests pass: four pure schema/commitment/projection cases and six genuine local PostgreSQL lifecycle cases through source-freeze preparation. The latter reuse established native signup, workspace, site, publishing-plan, transfer, review, consent, admission, application and source-freeze-preparation functions with migrations through479. Native physical discovery remains the fixture's explicitly synthetic boundary, not hosted acceptance.

The key regression waits for an actually issued two-second original recovery deadline to expire. The new current-authority/final-clock fence remains valid, while the unchanged v1 helper rejects and the original stored deadline remains unchanged. Other cases reject owner session revocation, inactive staff, changed site plan, foreign native lineage, forged sessions, expired current entitlement and login expiry during awaited work. Scoped lint and scoped dependency-closure TypeScript checks pass. No production mutation or deployment was performed.
