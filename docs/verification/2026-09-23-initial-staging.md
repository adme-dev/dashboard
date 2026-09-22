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
