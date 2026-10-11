# Native CMS setup bridge (staging only)

Provisioning completes before managed CMS adoption. The current editor producer
requires adoption first, so it cannot produce the child authority needed to
prepare storage. Add a genuine persisted setup purpose; preserve editor readiness.

Persist handoff purpose (`editor` default, or `cms-setup`) with the existing
immutable trigger. Exchange derives an exact static capability set from purpose.
Editor claims remain unchanged, with six workspace capabilities and four-hour
maximum. Setup children receive only `cms:prepare` and `cms:adopt`, at most fifteen
minutes, clamped to current parent, package and setup approval deadlines. Setup
claims stay inside Dashboard and never reach Studio or a browser response.

An additive empty approval table provides revocable admission for exact native
identity/workspace/site tuples, with the full tenant/business/identity/workspace/site tuple, an environment fixed
to staging and a fixed expiry. The original preview policy is retained and must
match on every check. Approval insertion and withdrawal are audited; the only
permitted update is withdrawal and deletion is refused to retain tombstones. Controlled acceptance configuration will insert only A and B, bounded by
their existing immutable preview approvals. Issuance, exchange and each subsequent
setup authority check read this table using the database clock. HTTP requires the
separate staging setup flag, exact trusted origin, genuine native cookie and rate
limit. No request selects identity, scope, SQL, database or runtime pins.

Before explicit issuance/reuse, read the retained provisioning job, verify its
actual complete provider result outside native SQL locks, then recheck parent,
owner, scope, approval and checkpoint under locks. Serialize active-child reuse
on the native parent so concurrent tabs cannot replace retained operation claims.
GET/status never creates a child. An expired child requires explicit resume;
existing retained schema/adoption recovery remains a separate explicit operation.

Select schema preparation capability independently for every original/recovered
claim fence. Permit setup adoption only for customer-adoption, never checkpoint.
Reuse existing schema and adoption coordinators, including private worker callbacks,
remote-I/O separation and before/after SQL fences. Return only redacted progress.
Do not publish, activate Forms capability or enable browser/editor flags here.

Validate real local PostgreSQL purpose immutability, exact capability sets, mixed
claims, old editor behavior, current-parent/owner/approval expiry and revocation,
concurrent reuse, retained recovery and final adoption fences. Review all changes
and run local QA before the guarded staging release. Production remains untouched.
