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
