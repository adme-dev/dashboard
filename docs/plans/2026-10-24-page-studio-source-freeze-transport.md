# Private source freeze authority transport

24 October 2026. This closes the missing Control-to-Management callback for the
existing strict freeze authority. It does not acquire a D1 claim, mutate the
source, settle an effect or activate customer access.

The fixed Control path is
`/internal/page-studio/managed-transfers/recovery/source-freeze`. Its only target is
the configured private Management binding at
`https://page-studio-management.internal/transfer-recovery-source-freeze`.
There is no public HTTP fallback, redirect following or retry. Both sides parse
the existing strict `recovery-source-freeze` envelope. The original literal
`claim`, `dispatch`, `inspect` or `settle` command remains part of the full digest;
a readiness or source-execution acknowledgment cannot authorize a freeze step.

Management uses the existing fresh PostgreSQL authority and the trusted
`MANAGED_TRANSFER_RECOVERY_SOURCE_FREEZE_POLICY` descriptor, independently of
caller-provided values. Missing, malformed or mismatched configuration denies.
Release/provisioning flags and policies are captured before reading input and
rechecked after authority. This change adds no live policy value or Wrangler
binding. Successful responses are no-store and return only the exact purpose and
envelope digest; internal SQL/provider errors are redacted.

Request and response streams are bounded to 32,768 bytes to accommodate the
nested original bootstrap, association and retained freeze claim. Oversized,
invalid UTF-8, malformed, extra-field and wrong-purpose messages reject. This
bound is distinct from the smaller read-only readiness envelope limit.

Verification includes all four verbs through actual bundled Control/native
Workerd fetch bindings with a synthetic authority; a separate PostgreSQL test
uses actual retained recovery state and owner expiry. The checked-in native
readiness fixture originated from actual local D1 completed claims with synthetic
provider/authority state; its helper recomputes full readiness and freeze linkage.
It is test input, never a production receipt or authorization.

The Studio executor separately owns claim acquisition, acquired-only dispatch,
physical atomic mutation and inspect/settle crash reconciliation. Those must be
paired, reviewed and tested before hosted activation. Neither this callback nor
a successful readiness acknowledgment proves physical freeze completion.

## Local verification record

- 111 focused contract/transport tests passed. Five real local Workerd binding
  tests passed, including all four freeze verbs and the existing readiness path.
- All 38 real PostgreSQL freeze/authority tests passed in 273.97 seconds, including
  the new actual handler success/owner-expiry case. The owned localhost55471
  database was stopped cleanly after the run; no production database was used.
- Both Worker typechecks and dry-run builds passed. Management measured
  3554.32 KiB raw /622.22 KiB gzip; Control 694.28 KiB /103.43 KiB. Staging remains
  deliberately unconfigured for production private authority.
- All seven scoped new/helper/runtime TS paths passed lint. Full changed-file lint
  also reported 49 pre-existing style issues in the large PG test and 12 in the
  Control entrypoint, reproduced from HEAD via stdin. The two new ternary style
  errors were fixed. These baseline diagnostics were neither suppressed nor
  misreported as a clean full lint run.
- Independent source review found no blocking issue. The retained cross-repository
  fixture hash is 2e4e40cbf8a834e1c4c2325fc66b14d5eb66c6a2c90c3d45ae95d2d9c9dbd051.
  Synthetic settle result digests in transport-only cases are not physical
  completion evidence. Exact physical result verification is a subsequent slice.

Receipts are in `Recovery 2026-10-24/freeze-*` and
`DASHBOARD-FREEZE-TRANSPORT-INDEPENDENT-REVIEW.md/.json`.
