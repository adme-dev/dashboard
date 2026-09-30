# Native customer CMS adoption

This RND-22 increment permits an approved native customer staging session to run
the existing resumable CMS adoption flow against an already verified storage
target. It follows customer page-save PR609 and Studio typed-storage PR112.

## Authority and flow

The private customer-session dispatcher adds POST `cms-adoption`, using the same
strict status/start/advance/recover request as existing CMS setup. The service
requires machine authentication, the dedicated customer JWT, exact configured
origins, the existing staging enablement flags and server-owned CMS bindings.
The gateway forwards the customer credential only on this exact POST path. The
Studio control client validates its token, `workspace:create` capability,
request and bounded response. Callers cannot choose scope, actor or storage.

CMS authority adds the internal `customer-adoption` mutation. It requires
`workspace:create`; ordinary saves continue to require `workspace:checkpoint`.
Original native login, immutable child session, owner membership, customer-owned
site, operator-approved preview policy and entitlement are rechecked before and
after bounded SQL using the existing native lock order. Setup authority does not
permit ordinary save, schema/record/content mutations, action execution, billing,
AI or publication. No token capability, trial policy or role is added.

Start retains one immutable intent before remote writes. The existing storage
adapter checks the retained target, freezes source content, imports bounded
inventory pages and verifies the durable checkpoint/component graph. All remote
reads/writes occur outside native transaction locks. Each acceptance reacquires
current native authority. Activation commits the initial application, pointers
and customer audit atomically. Failure retains the previous visible state;
retries inspect the same operation instead of inventing another storage target.
The existing setup fence pauses ordinary saves until adoption completes.

## Identity, recovery and compatibility

Customer setup uses `customer-user` provenance with the actual identity and
original login hash. Only freeze/adoption/recovery schemas accept that actor;
generic content/schema preparations and attachment grants remain unchanged.
Studio's stored freeze receipt retains this exact provenance across retries.
Activation/recovery audits use the `customer` role and original operation IDs.

A new login may read authorized redacted progress but cannot silently continue an
old login's setup. Explicit recovery compares the retained predecessor and binds
the new current principal while preserving original actor, target, generation,
freeze and inventory. Revoked original sessions cannot read, advance or replay.
No login hash or raw storage target is exposed by the status projection.

Native agency/portal status preserves `{ content, record, schema }` counts for
its existing Dashboard component. Private Studio/customer status sums these
counts into the number required by the Studio protocol. Tests cover both views.

## Deployment boundaries and remaining work

No schema migration, provider allocation, browser route or public activation is
introduced. Deploy matching protocol/storage consumers before enabling the new
private caller. Existing disabled staging controls remain in force. No production
deployment is performed by this increment.

Adoption requires a verified managed storage route with retained database,
collection, workflow, CMS-storage/runtime and staging receipts. It does not
supply native customer authorization for missing prerequisite upgrades, repair
provider provisioning after the original provisioning login is revoked, or
prove hosted isolation. Those adapters and two-customer hosted readback remain
rollout work. Never bypass receipt checks or create replacement resources merely
because discovery fails. Browser/Sandbox lifecycle, dashboard launch/save/reload/
return, truthful Ready status and release/QR navigation acceptance remain open.

## Verification

Eighteen new PostgreSQL cases cover adoption followed by a real managed graph
save, component retention, immutable/concurrent start, explicit new-login
recovery, logout during target discovery/freeze, scope/environment denials,
changed targets/checkpoints, activation rollback and six forbidden mutations.
Existing agency/portal coordinator and CMS-preparation component regressions
verify the original progress shape. Private HTTP and gateway tests cover the
new operation. Studio protocol/client tests and the actual local D1 runtime
exercise freeze provenance, durable retry/readback and preparation denial.

Provider routing and R2 in Dashboard tests remain scoped fixtures. Local D1 and
PostgreSQL evidence does not establish hosted customer isolation. Full-suite,
build, typecheck, review and CI receipts are recorded with the paired PRs and
canonical PRD. Marketing claims await the complete hosted customer journey.
