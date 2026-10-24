# Retained transfer continuation journal

Status: internal foundation; no customer route, native effect dispatcher or production activation. This does not complete transfer recovery or the Pi rollout.

## Supported identity and causal history

A continuation keeps the original operation, intent, source/destination generations and original native enabled-head digest. It does not rewrite an expired recovery head. A strict v2 review commits current original-principal/plan evidence, full retained progress, descriptor and exact predecessor. Fresh owner and operator consents are required for each new grant, with exact millisecond identities and a deadline of at most one hour.

Migration480 provides one append-only journal per original operation. Grants, native admission receipts, phase records and revocations share one bounded hash chain. Site NOWAIT locks serialize concurrent original-transfer and continuation writes. A partial unique index prevents the same continuation ID being inserted concurrently across different sites. Exact body bytes and the complete entry digest are retained; the reader additionally rejects noncanonical bytes, unknown fields, foreign operations and broken chains.

Migration481 adds version dispatch to the existing review/consent trigger. Its v1 branch is unchanged. V2 reviews retain the original source-freeze/admission lineage while allowing the original head deadline to have elapsed. V2 cannot use legacy approval rows. Grants require the latest review and both exact fresh consent projections; a superseded review, shortened/expired consent or mismatched digest fails. These relational guards are not a substitute for current session/owner/operator/plan checks in the private controller.

## Phase rules and interrupted work

Phase rows bind action, outcome, full request-envelope digest, full continuation-result receipt digest, typed phase-result digest, changed claims and before/after progress. The entry must immediately follow the request's exact journal cursor. Preparation followed by execution, and later inspection of an earlier phase, are valid causal transitions. Duplicate preparation, completed execution replay and no-op/needs-inspection journal rows are rejected.

Inspection can settle existing dispatching claims; it cannot invent new claim keys. A changed verified phase reference must match the result digest. Terminal claims, retained phase results and original identities remain immutable. Newly observed physical keys after a lost reply require the separate current-authority inspection collector and observational renewal validation before a new grant baseline. A new grant is not required to equal an old stale progress hash, but it must be independently verified as continuity of the same operation. This collector/renewal integration remains outstanding.

Completion is an existing PostgreSQL selection CAS with an actual audit/receipt, not an invented native Worker effect. Destination authoring and source retention require their original native physical validators. A journal marker alone never proves either happened.

## Verification boundaries

The local suite covers strict wire linkage, invalid/corrupt retained rows, genuine PostgreSQL owner/operator/plan lifecycle, natural original-head expiry, session revocation, site-plan replacement, source-freeze lineage, append-only history, same-site CAS, cross-site continuation-ID contention, review/consent contention, supersession, millisecond precision and consent/grant deadline bounds. Migrations480/481 are applied twice in disposable test schemas to check idempotency. CI explicitly runs the PostgreSQL cases rather than silently skipping them without the database environment.

The lifecycle fixture uses actual native PostgreSQL signup/workspace/site/plan/transfer/review/consent/admission functions. Provider observations remain an explicitly synthetic test boundary. Planned JSON fixtures prove parsing and linkage only; the historical fixture's unresolved claim deliberately cannot authorize execution. No local test is presented as hosted customer acceptance or capacity evidence.

## Remaining integration

- Strict private native inspection collector and original-head/read-only authority callback, including postcompletion observations.
- Full ordinary phase planner engine and physically verified progress reconstruction.
- Review/consent/grant controllers, native admission and exact-current-authority dispatch.
- Existing completion CAS adaptation, destination authoring, source retention and lost-reply/resume acceptance.
- Same-plan renewal after expiry and supported customer preview approval renewal.
- Authenticated real-account hosted acceptance before exposing transfer controls.

The internal journal persistence helper requires the caller's transaction and final authority/clock fence. It exposes no public or provider operation. Public marketing behavior is unchanged because this foundation is not an enabled customer capability.
