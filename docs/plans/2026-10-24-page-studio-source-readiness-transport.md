# Private transfer recovery readiness transport

24 October 2026. Paired with the Studio recovery readiness implementation. This
adds the missing private read-only callback; it does not freeze, transfer,
publish, acquire a claim, or activate a customer.

## Routing and trust

The existing private Control Worker recognizes only
`/internal/page-studio/managed-transfers/recovery/source-ready` and sends the
bounded strict request through its configured Management service binding to
`https://page-studio-management.internal/transfer-recovery-source-ready`.
Missing bindings, a non-production Dashboard origin, query parameters and
invalid methods are rejected; this operation has no public HTTP fallback.

Management independently parses the strict `recovery-source-freeze-ready`
envelope and reads the trusted `MANAGED_TRANSFER_RECOVERY_SOURCE_FREEZE_POLICY`
JSON configuration. Its schema is exactly `{formatVersion: 1,
kind: "managed-transfer-recovery-source-freeze-v1", layoutDigest: <sha256>}`.
Absence, invalid fields or a different requested descriptor deny the request.
The caller cannot establish the accepted descriptor. This change sets no value
in any deployed or checked-in environment configuration.

The existing PostgreSQL authority checks current owner/operator permission,
retained source execution, recovery admission and freeze association. Config is
captured before asynchronous input parsing and checked again after authority.
Only the matching purpose and full-envelope digest may return to Studio. The
caller separately proves actual current D1 claims, physical layout and deployed
runtime support; a schema digest alone is not deployed capability evidence.
Request and response streams are bounded to 16,384 bytes. Invalid acknowledgments,
redirects, private errors, changed service methods and unexpected fields fail
closed without retry. Each successful response is no-store.

## Verification

- Initial RED: new callback module absent. GREEN: 107 focused tests across the
  new transport, existing source-effect transport and freeze contract.
- All 37 real PostgreSQL freeze/authority tests passed in an owned disposable
  localhost database. The new test invokes the actual HTTP handler with real
  authority, observes success, expires the real fixture owner session, verifies
  403, and confirms no transfer records/effects changed. This is local acceptance,
  not a hosted account or deployed D1 result.
- Control and Management strict typechecks passed; scoped lint and diff checks
  passed. Independent seven-file source review found no blocking issue and
  captured exact hashes before commit.
- Actual staging dry-run builds passed: Management 3,537.67 KiB raw /620.01 KiB
  gzip; Control 691.09 KiB raw /103.26 KiB gzip. Staging intentionally lacks the
  production private authority binding; its Wrangler warning does not establish
  hosted activation or a working staging recovery path.
- The actual Studio local D1 readiness result passed Dashboard's strict schema
  and full result verifier; a tampered envelope was rejected. The two-repository
  fixture uses synthetic authority/provider state, not hosted customer accounts.
- A bundled Control Worker successfully calls a synthetic authority through an
  actual workerd service binding, with matching digest and no public outbound
  request. This checks native built-in fetch behavior; PostgreSQL authorization
  is separately covered above. The local harness uses Management's compatibility
  date, 2026-07-15, supported by the locked Dashboard workerd binary.

## CI execution allowance

Run40060185479 spent35m44s on the required sequential checks before its build.
Three recent successful runs took up to8m29s for build and6m31s for the full test
suite, so the former45-minute job allowance cannot accommodate this expanded
pipeline. The overall CI job limit is now90 minutes; every individual step limit,
assertion, required test, concurrency setting and deployment gate is unchanged.
This configuration change does not make an interrupted older run a passing gate.

## Remaining release gates

Pair the Studio ready runtime/client/forwarding methods with this exact path and
wire schema; test actual built service RPC. Freeze acquisition/dispatch/atomic
mutation/settlement remains a subsequent separately reviewed implementation.
Reconcile current main, pass exact-candidate CI, verify deployed artifacts and
complete authorized hosted owner/operator/second-account tests before activation.
This private safety plumbing changes no public feature catalogue or customer UI.

Receipts: `Recovery 2026-10-24/ready-*` and
`DASHBOARD-READY-INDEPENDENT-REVIEW.md/.json`. The old localhost55439 test service
was absent; its connection failure is retained separately. The successful suite
used a newly initialized isolated localhost55471 database, with no production
connection or migration involved.
