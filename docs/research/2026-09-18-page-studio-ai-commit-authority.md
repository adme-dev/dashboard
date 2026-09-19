# Page Studio AI acceptance transaction authority — 18 September 2026

## Result

AI proposal acceptance now carries the verified editor claims into its database
transaction. It locks the site and all rows that establish current authority,
then checks authority again before returning either a new acceptance or an
idempotent replay. The checkpoint, version, site pointers and audit entries
commit together or roll back together.

If revocation commits before the save obtains authority locks, the save is
denied. If the save obtains those locks first, revocation waits until that save
finishes. Tests cover agency staff and client-portal identities, including the
actual logout function and its foreign-key-backed audit insert.

This closes the AI acceptance path only. Ordinary draft/checkpoint writes still
need signed-session forwarding and the same transaction protection. In-flight
jobs and generated application code remain outside this change.

## Locking and expiry

The site uses `FOR NO KEY UPDATE`, allowing logout's audit foreign key to take
its compatible key-share lock. Native portal login, parent login, then joined
authority rows are locked in an order compatible with logout. Permission,
membership, account, package and session changes cannot commit through those
locks while acceptance completes. Database errors deny the operation.

Transaction checks use `clock_timestamp()` because transaction-start time would
incorrectly extend a session across a lock wait. A final check occurs immediately
before returning to the transaction wrapper. Time can still advance between that
check and PostgreSQL COMMIT; this is not a claim of exact expiry-at-COMMIT timing.

The Worker persists the proposal blob to R2 before the database call. A denied
transaction creates no accepted checkpoint/version or head change, but an
unreferenced R2 blob can remain. This change does not make R2 and PostgreSQL a
single distributed transaction or add orphan garbage collection.

## Verification

- Initial reproductions: five unit/route failures and 20 real PostgreSQL failures.
- Final unit/route subset: 48 passed.
- Disposable PostgreSQL: 167 passed, including 24 new authority/logout race cases
  and 18 existing checkpoint/AI atomicity cases.
- Full Dashboard suite: 13,954 passed; 395 opt-in tests skipped in that command.
  The PostgreSQL suites above were explicitly enabled in their separate run.
- Typecheck: the same 913 existing errors as the baseline, with no added or
  removed diagnostics. This is not a clean repository-wide typecheck.
- Changed production and new test files pass ESLint. The frozen governance
  inventory test retains its eight pre-existing lint findings; baseline and
  current reports match apart from line movement.
- Independent review found no remaining blocker. The frozen governance inventory
  was updated for exactly two previously added staff-identity SQL rows; removing
  those rows reproduces its prior digest. Scanner and classification unchanged.

Evidence: `.verification/page-studio-builder-rnd-20260917/ai-commit-*` and
`ai-authority-postgres*.log`. The first restricted full-suite attempt could not
start browser/Worker runtimes; the successful complete run used the required
runtime permissions.

## Source and release

- Dashboard source: `fa6f33d0fbc93f8ef7595ee9a79b3f95cc12b59d`.
- Fresh main included: `a917386dde67f06921843fd6e3a1ed1b4b984c6f`.
- Guarded clean build and size check pass: 25,462,146 raw bytes against the
  unchanged 25,468,928-byte ceiling; 6,621,603 gzip bytes.
- Staging Pages deployment: `a5af17d9-6a9d-448a-afe4-f93699dad546`, branch `preview`,
  clean source verified by Cloudflare metadata.
- Production remains `8798c363-6e9c-472a-a78f-47d8ce780ef4`.
- Provider readback confirms Studio Worker, control gateway, container and their
  bindings are unchanged. No migration is added; production promotion remains separate.

## Live staging acceptance

Four live cases pass through the real public Studio acceptance route:

1. Synthetic staff login and Studio launch work; permitted QR Codes API returns 200.
2. The request passes initial admission and is observed waiting on the held site
   row inside the actual acceptance transaction.
3. Real logout returns 200 and revokes the editor grant before the site lock is
   released; the waiting acceptance is denied.
4. No checkpoint, version, site head or AI audit commits. Exactly the legitimate
   logout audit is added.

The Worker currently maps the private authority denial to public 502
`CONTROL_PLANE_UNAVAILABLE`; this change does not improve that error mapping.
The live race covers an agency identity. Both actor types, the save-first order,
expiry during waits and authorized replay are covered by the PostgreSQL suite.

The exact newly created unreferenced R2 blob was verified against the synthetic
actor/checkpoint/digest, removed and confirmed absent. Synthetic identities from
both attempts are retired. The initial attempt stopped before the proposal at
an editor-shell fixture lookup; the corrected probe reads the authenticated
canvas frame and its canonical manifest. Both reports are retained. Independent
cleanup readback confirms zero active grants, logins, actors or writable roles
for both attempts; the temporary database credential file was removed.

A fresh authenticated client-admin launch after deployment renders desktop and
mobile previews, page tree and save status. QR Codes renders for the existing
restricted browser login and correctly denies its API request; the permitted
synthetic-role API check above returns 200. No browser page edit was performed.

## Remaining work

R06 remains partial: ordinary save transaction authority, in-flight jobs,
preview script isolation, CPU containment, the full two-customer browser matrix
and production integration. The 38 top-level research/delivery tasks retain
R01–R05 complete, R06 partial, R07–R12 pending and all 26 delivery tasks pending.
CMS authoring in Studio with client-admin links and shared data authority remains
the agreed delivery direction. Generated customer code stays disabled.
