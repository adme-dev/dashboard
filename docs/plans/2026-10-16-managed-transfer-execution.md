# Managed transfer execution integration — 16 October 2026

This increment connects native retained transfer authority to the private source
runtime upgrade. It is not final graph acceptance, customer activation, or a
production deployment.

The native control plane retains the exact source, freeze, Forms receipt,
predecessor, reviewed upgrade policy and deterministic successor before remote
mutation. Original owner/operator sessions, plan and source heads are rechecked
around each remote call. Status does not create a request or retry an upload;
start and resume remain explicit. Provider identity stays private and ready
progress does not grant publishing authority.

Migration 460 was applied additively to the configured database. Its immutable
request table is empty; site rows, release pointers and resource bindings compare
unchanged before/after. The receipt is retained privately at
`.verification/managed-transfer/execution-migration-receipt.json`.

## Verification

- 30 real PostgreSQL execution tests pass, including competing reservations,
  original-session revocation, changed source heads, malformed physical identity,
  corrupted retained hashes and detached RPC request handling.
- The preceding combined transfer and HTTP regression run passed 168 tests;
  the three subsequent review cases also passed in the 30-test execution run.
- Both private HTTP handlers require machine authentication, production bindings
  and no-store responses. All 10 HTTP tests also passed in the full suite.
- Independent native review found no blocking findings. Review suggestions for
  corrupted hashes and concurrency now have direct tests.
- Server typecheck has the same 155 normalized diagnostic identities as the
  previous baseline; there are no added or removed identities. It is not globally
  clean.
- Changed-file lint passes. The full local suite passed 16,336 tests with 2,575
  conditional skips and one five-second gate-inventory timeout while the build
  competed for resources. That unchanged inventory suite then passed all eight
  tests in 1.51 seconds on its own; no deadline was raised.
- The local production build was stopped when free disk fell below the existing
  8 GiB safety floor. No artifact was uploaded. Exact-commit CI build, full-suite
  and unchanged Worker size checks are required before release.

The paired Studio executor is under review with a permanent write-once upload
admission. An uncertain upload must never be retried blindly. Explicit resume
can inspect an existing exact successor; a claimed but absent upload stays
uncertain until supported reconciliation is available.

## Remaining integration

Complete private source fencing, accepted object/page graph copy, destination
Forms history, and independently verified native graph acceptance. The final
transaction must compare all captured source heads and clocks and retain original
live-release authority. Then connect customer progress/recovery controls and run
hosted two-account editor/forms/email acceptance. Production activation and DNS
switches remain separate from code verification.
