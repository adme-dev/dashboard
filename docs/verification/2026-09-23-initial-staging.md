# Initial staging admission

## Scope

S6.1 adds a private management `ensure` operation. The existing authenticated
Update staging API and UI retain their current behavior. Creation/checkpoint/UI
triggers and background originating-login authority remain follow-up work.

The operation checks current editor access, reserves the site's deterministic
address, and selects its current checkpoint in PostgreSQL. The existing site lock
serializes it with manual updates. An active snapshot or any retained deployment
makes ensure return the existing state, including failed or expired work. It
never adopts another actor's request or repeatedly spends build allowance.

An empty site receives only an address reservation. No checkpoint, provider
readiness or working preview is fabricated. Once the first checkpoint exists,
a later ensure can admit its first snapshot. Provider hostname preparation for
empty sites remains part of S6.2.

Admitted work uses the existing claim, provider verification, artifact readback,
fresh access checks and checkpoint comparison before activation. Explicit Update
staging remains the recovery path for failed work. Production release pointers
are unaffected.

## Evidence

- Eight new PostgreSQL behavior tests initially failed because ensure was not
  supported; the existing 40 tests passed.
- After implementation, all 48 PostgreSQL tests passed.
- Added simultaneous independent SQL sessions, membership revocation, explicit
  recovery and strict input coverage. The affected six-suite section passed
  113 tests, including all 51 PostgreSQL cases.
- Management Worker strict typecheck passed.
- Focused lint passed. Independent review read all six changed source/test files
  end-to-end and found no actionable correctness or security issues.

Logs are retained under `/private/tmp/root-initial-staging-*-20260923.log`.
This section does not prove deployment, automatic UI triggers, or hosted previews.

## Remaining steps

- [ ] S6.2 Connect successful agency/client site creation to address/provider
  preparation without converting a committed site into a reported save failure.
- [ ] S6.3 Connect the first setup/editor/managed-graph checkpoint using explicit
  originating-login authority, fresh admission and final revocation checks.
  Existing provisioning authority deliberately rejects completed jobs; do not
  broaden its write grant or replace it with a user ID alone.
- [ ] S6.4 Add bounded authenticated first-use ensure for existing editor/admin
  workspaces, preserving active snapshots and explicit retry behavior.
- [ ] S6.5 Update UI/public documentation and complete browser/hosted acceptance,
  then batch the next CI and release cycle.

## Authenticated ensure endpoints

Agency and portal now have POST `/sites/:siteId/staging/ensure` endpoints. Both
require an empty JSON object and derive actor/scope from native authentication.
GET remains read-only; explicit Update keeps its existing request identity.
The shared handler checks exact operation, site, environment and actor scope in
the Worker response. Oversized/non-JSON bodies retain existing limits.

- HTTP/config section: 17 tests passed, including initial agency/portal requests,
  injected identity/content/destination rejection, authentication and service
  permission denial.
- Focused lint passed. Independent review read all eight source/test files
  end-to-end and found no actionable issues.
- UI, site-creation and checkpoint triggers are still pending. No public behavior
  is advertised as automatically provisioned until those triggers are connected.


## Bounded first-use workspace request

S6.4 implementation now requests authenticated initial ensure when an editor
opens an undeployed site's staging workspace. Empty sites reserve their address;
a first saved checkpoint can then trigger one initial snapshot request. Later
draft changes and status refreshes do not automatically deploy another snapshot.
Existing active, failed, suspended and pending states remain unchanged.

If an initial response is lost, the action becomes Check initial staging. It
checks the idempotent ensure operation before permitting a fresh explicit update.
The UI does not supply a hostname, checkpoint, actor or new build identity.
Responses and notifications are discarded after a site/audience change, loss of
editing permission or component unmount, including after conflict refreshes.

- Two first-use/recovery cases failed before implementation; nine existing or
  preservation cases passed in that initial run.
- Final UI/HTTP/contract/access section: 65 tests passed across four suites.
- Focused lint and diff checks pass.
- Independent end-to-end review identified a stale notification after a deferred
  409 refresh. The additional authority/lifecycle check and regression test fix
  it; review found no remaining actionable issues.
- No dependency installation, production mutation, push or release occurred.

This is local implementation evidence. Browser acceptance, duplicate-tab hosted
proof, full build and public documentation synchronization remain in S6.5.
The first checkpoint/creation triggers in S6.2/S6.3 are still unfinished.


## Site creation connection

Both creation endpoints now request initial staging after the site transaction
returns successfully. The request uses authenticated agency/client authority and
the newly created site ID, and reuses the existing strict management response
validation. The response adds `staging`, containing verified staging state or
`null` when it could not be confirmed. A staging failure never changes the saved
site into a reported creation failure.

The creation response waits at most five seconds. The same sanitized promise is
registered through the established request-background helper, so a late result
remains tracked without retrying or exposing provider exception details. Existing
workspaces recover through idempotent ensure.

- Both connection tests failed before implementation; thirteen existing cases
  passed.
- Final seven-suite UI/site/creation/HTTP/contract/access section: 99 tests passed.
- Tests cover a held creation transaction, rejected creation, trusted actor
  scope, missing bindings, provider rejection, mismatched service identity,
  foreign addresses, the five-second deadline and retained late completion.
- Focused lint/diff checks and independent six-file end-to-end review pass.

This completes the creation-to-reservation connection only. Empty-site provider
hostname preparation still belongs to S6.2; checkpoint authority/triggers remain
in S6.3. No new provider resources or production content were changed during
these tests. Full build, browser and hosted acceptance remain outstanding.

## Checkpoint origin retention — verified locally

The authorized checkpoint transaction retains a bounded `stagingOrigin` inside
its existing `workspace.checkpointed` audit. Setup derives it from the retained
provisioning job; ordinary editor and AI acceptance select the parent login hash
from the exact authorized child session; CMS graph saves use the verified graph
principal. Native history restores reuse their freshly verified login. The audit
includes the release environment and original login hash, plus child nonce or
setup request/revision where applicable. Raw credentials are not accepted or
retained. Exact checkpoint replay leaves the original audit unchanged, including
when a later editor session retries the same checkpoint. Missing release
configuration omits provenance without inventing an environment or failing a save.

This is provenance, **not staging authorization or an activated dispatcher**.
The consumer must load it from the exact scoped checkpoint audit, check the
original login/child/proposal and current permissions/package at admission and
activation, bind the immutable snapshot attempt to that origin, and retain work
across request loss. Completed setup needs its own purpose-specific check;
provisioning write authority must continue rejecting completed jobs.

Verification:

- Eight regression assertions failed before their implementation: agency/client
  setup, agency/client ordinary editor, native-login managed checkpoint, AI
  acceptance, and agency/client native history restore.
- 91 PostgreSQL tests pass across setup, ordinary editor and managed CMS suites.
- 134 related tests pass across history authority, AI acceptance, origin/schema,
  CAS, control store and HTTP endpoint suites. Total: **225 passing tests**.
- These include real PostgreSQL logout/expiry/lock races, rollback, cross-scope
  rejection, immutable replay and managed editor/AI origin assertions.
- Independent review found an audit metadata type mismatch, now corrected.
- The first broad database run failed because the host exhausted disk space.
  The successful reruns above supersede that interrupted result. The isolated
  database on port 55444 was stopped after verification.
- No new migration or production data change. Full application build and hosted
  acceptance are still required before release; the host lacks build space.

Remaining S6.3 work: private origin lookup/revalidation, binding the retained
snapshot to its exact origin, durable initial-staging dispatch, and
logout-between-provider-and-activation tests. Existing manual staging remains
unchanged. S6.3 is not complete.

## Private checkpoint-origin authority — verified locally

`requireCheckpointStagingOrigin` in the management worker now resolves the exact
scoped checkpoint audit, verifies its author/digest/protocol, and selects the
original actor from stored provenance. Caller-supplied actors are rejected.
The shared provenance schema is used by both the native writer and the worker.

Admission holds the site lock, original native/parent login locks and current
permission/package rows. Editor origins also require the exact unrevoked child
and checkpoint capability. Setup origins require the original deterministic setup
request, first checkpoint and latest accepted proposal revision. It does not
change completed setup jobs back into writable provisioning jobs. All paths
check the configured release environment and reject a newer substitute login.
A final locked query re-evaluates expiry after any child/permission/proposal wait.

Evidence: six success-path checks failed before the helper existed; the final
section passes **118 tests** (53 new real-PostgreSQL origin cases, 51 existing
staging lifecycle cases, 14 origin-schema cases). Tests cover agency/client
sources, revoked/expired native and child sessions, original-login substitution,
permission/package removal, changed proposals, malformed immutable audit records,
foreign scope/environment and parent/child expiry during a real row-lock wait.
Strict management-worker TypeScript, lint, diff checks and independent end-to-end
source review pass. The isolated database was stopped afterwards.

This helper is not connected to provider execution yet. Still required: bind the
retained staging snapshot to this exact origin, connect durable dispatch, and
call the verifier again before retaining provider results and final activation.
No push, deployment, migration or production data change in this increment.

## Snapshot origin binding and execution — verified locally

`coordinateCheckpointStaging` resolves the original actor from the immutable
checkpoint audit and copies the validated request identity. Its initial snapshot
retains `originAuditId` in the append-only `staging.requested` audit. Retries must
match that exact origin; an actor-only or different-origin request cannot take
over the operation. Queued or expired building attempts can resume the same
snapshot with a fresh claim token and no second build admission. Failed attempts
remain terminal until an explicit user update creates new work.

The coordinator revalidates the original login/child/proposal at admission,
before retaining hostname results, and before and after final activation writes.
It also checks the claim's expiry after those writes, so expired authority rolls
back the whole transaction. Provider I/O stays outside SQL transactions. The
existing manual update/ensure path and previously active previews are preserved.

Verification: six regression cases failed before implementation. Final **114
real-PostgreSQL tests pass**: 63 origin/execution cases plus 51 existing lifecycle
cases. New execution cases prove one retained origin/admission, rejection after
logout during attach/build/verify, queued recovery, expired-claim recovery,
rollback when login expires inside activation, immutable caller identity, and
an old provider response arriving after a replacement claim has activated.
That overlap produces exactly one build/admission/activation and no stale failure.
Strict worker TypeScript, lint and independent full-file review pass. The local
isolated database was stopped after testing.

Remaining: expose the checked private service RPC and connect durable dispatch
after every checkpoint commit, including lost response/process recovery. The
coordinator is not yet invoked automatically by production saves. No push,
deployment, migration or production data change was made in this section.


## Private checkpoint staging service boundary

The management Worker now exposes `checkpointStaging` exclusively through its
service binding. Its strict request names the immutable audit, checkpoint digest,
exact tenant/client/site scope and environment. It accepts no actor or login
credential. Fresh SQL transport and build/verify service bindings are required
before invoking the origin-bound coordinator; public HTTP remains 404.

The Native `requestCheckpointStaging` client validates the echoed request and
same-site state, rejects malformed/foreign receipts and unknown status/code
pairs, and redacts unexpected transport errors. Neither side retries uncertain
provider outcomes. Manual staging management shares the same provider dependency
construction and keeps its existing behavior.

Verification: all 16 Worker boundary cases failed before the method existed;
the Native client suite initially failed because its module was missing. Final
**100 tests pass** across both boundaries and existing management, staging HTTP
and provider regressions. Strict Worker and focused Native-client TypeScript
and focused lint pass. No production deployment or migration in this increment.

The branch was also rebased onto current main `23665e450`, retaining the live
hostname-ID fix and every prior automatic-staging commit. 87 relevant unit tests
and Worker type checks passed after rebase. The additional PostgreSQL rerun
could not start because this Mac exhausted its shared-memory allocation limit;
no other session's IPC resources were removed. Earlier database test results
remain recorded above, but do not claim a new combined database run.

Remaining: atomic durable dispatch from all checkpoint commit paths, recovery
when the process stops between save and dispatch, hosted acceptance and release.
The private RPC/client alone do not automatically publish saved checkpoints.

## Atomic checkpoint staging intent

Migration 429 records staging intent from the append-only checkpoint audit in
that same database transaction. All five writer paths use this event, including
managed graph variants. Final authorization failure rolls back the checkpoint,
audit and intent together. The outbox stores the exact audit/checkpoint/digest,
site scope and environment, with no additional login credentials. Identity and
terminal tombstones are immutable. Old audits without supported provenance are
left alone, and migration reruns do not backfill historical saves.

Twenty new real-PostgreSQL tests failed on the absent outbox before implementation
and then passed. Existing editor, provisioning, AI, history and managed CMS tests
now inspect their committed intent and include it in rollback/replay snapshots.
The AI concurrency fixture also needed its barrier moved from the preliminary
managed-scope read to the actual checkpoint mutation transaction.

Scheduled dispatch, token-fenced claim/retry/acknowledgement, lost-response
recovery and hosted acceptance remain outstanding. The outbox alone does not
activate previews or run generated customer code.

Final section evidence: **281 real-PostgreSQL tests passed across eight suites**
(outbox, CMS graph, original staging authority, staging lifecycle, provisioning,
editor, history and AI authority). Focused lint and diff checks pass. Independent
review read the migration, every changed test and the configured-database apply
script; no blocking findings remained.

Migration 429 was applied on 2026-09-23 at 04:02:29 UTC. SHA-256:
`268e302e3e4346d9d83fd42854cd261ebe6af9277df05d464b00d1b16790489c`.
Both triggers were read back, pending-intent count was zero, and Fantasy Limo's
checkpoint and production-release pointers were unchanged. Dispatcher remains
disabled. Receipt: `/private/tmp/root-checkpoint-outbox-migration-receipt.json`.
Test log: `/private/tmp/root-checkpoint-outbox-section-final.log`.
The prior combined PostgreSQL rebase gap is now covered by this successful run.

## Durable claim and acknowledgement primitives

The outbox can now claim at most three due records in the configured environment
with `FOR UPDATE SKIP LOCKED`, issuing a two-minute token per attempt. Recovery
keeps the exact audit/checkpoint/digest identity. Eight attempts is the hard cap;
pending/busy/uncertain responses back off from one to fifteen minutes. Terminal
outcomes retain tombstones and never create replacement build identities.

Acknowledgement requires the exact scope, environment, checkpoint, attempt and
claim token. Review found a real expiry race: PostgreSQL can evaluate an UPDATE
predicate before waiting for an unchanged locked row. The regression reproduced
an expired claim being acknowledged. Settlement now locks the exact claim first,
then checks the clock again in a second statement in the same caller-owned
transaction. The expired owner cannot complete or reschedule the work.

**49 PostgreSQL tests pass** (20 atomic-intent tests and 29 recovery cases),
including concurrent bounded claims, scope/environment mismatch, crash before
RPC, expired/superseded acknowledgements, the lock-wait race, backoff, attempt
exhaustion and rollback. Strict focused TypeScript, lint and independent review
pass. No additional migration, push or deployment in this increment.

Remaining: invoke these primitives from the actual dispatcher, prove lost RPC
acknowledgement after activation and pending responses, and connect the scheduled
cron bridge. SQL helper tests alone do not prove automatic staging execution.
