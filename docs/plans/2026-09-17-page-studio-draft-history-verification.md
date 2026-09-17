# Draft history verification

## Behavior

History is available in agency website management and the client portal. It lists
bounded, cursor-paginated saved draft metadata and named versions. A restore
creates a new immutable checkpoint from scoped, digest-verified historical bytes,
clears the draft's selected version, and retains older checkpoints and live release
pointers. Naming a version uses the acknowledged current checkpoint and existing
version summary field. It does not submit or publish the version.

Site, entitlement, active-client and portal membership locks span mutations.
Agency edit permission and client editor membership are required; viewers can
read. Requests use a current-checkpoint precondition and actor-scoped durable
receipts. A lost response can be retried without reapplying an old restore over
newer work. The UI preserves an uncertain request and requires refresh on conflict.
Studio reopen uses its existing authoritative checkpoint hydration; stale open
editor saves fail the existing CAS guard. Preview-only edits are not in history.

## Tests and review

- PostgreSQL: 17 cases on a disposable localhost database, including concurrent
  writer/membership locks, expired/suspended/revoked access, cross-client/site
  denial, corrupted R2 bytes, storage failure, stale base and replay behavior.
- UI/API: 11 cases for auth, body limits, read-only access, confirmation, name save,
  conflict and acknowledgement retry. Related navigation checks also pass.
- Actual restored canonical manifest from the PostgreSQL test loaded through
  Studio f8741e5 R2CheckpointRepository and WorkspaceCoordinator.reconnect:
  digest/schema/scope checks and all 4 rendered pages pass.
- Final full suite: 13,925 tests across 2,060 files pass (280 tests skipped).
- Full typecheck remains red on 486 unique diagnostics; clean main 4c15da690 has
  the exact same normalized diagnostics, with no added or resolved errors.
- Independent review found no blocking history defects. Its suggested Studio
  compatibility proof and parent publication-readiness refresh were added.

## Build-size correction

First build exceeded the immutable Pages raw budget by 11,841 bytes. Added a
conservative case to the existing SQL whitespace compactor: only the initial
untagged template head, only plain unescaped SQL with no quote/comment/dollar-quote
markers or non-ASCII whitespace. Boundary spaces remain; dynamic expressions and
subsequent literal segments are untouched. The initial artifact showed a 20,090-byte opportunity. SQL compaction now also
runs after each minification pass, before the strict shrinking comparison, so
plain template heads exposed by esbuild are compacted in the same build. The fixed release budget remains unchanged. New tests prove
positive compaction and exclusion cases, including an NBSP identifier found in
review. Compaction is committed separately from application behavior.

Final build passed: raw 25,460,570 / 25,468,928 bytes (8,358 remaining); gzip
6,624,792 / 9,750,000 bytes. The 37 focused compaction/size tests pass, and changed
source files pass ESLint.

Build, full suite and deployment results are recorded in the root
execution ledger and `.verification/draft-history-20260917/`. Authenticated production and staging browser access is verified. QR Codes loads
its existing records. Hosted history acceptance awaits deployment; local tests
do not substitute for it. No customer drafts were restored during tests.

## Scoped Overview reads

The existing staging warning came from global domain/subscription permissions.
Overview now uses the existing site-scoped domain API and launch-state plan,
rejects mismatched domain responses, keeps optional history errors local and
continues blocking publication on missing approval/release access. Five added
component cases pass; the full suite and ESLint pass after this follow-up.

Hosted history acceptance passed on staging deployment
`7c34f071-3ce6-4507-8a21-e7a2a4785634`: named baseline, restore-as-new, preserved
older drafts, Studio reopen on desktop/mobile, and restoration of the original
staging baseline. Production content was unchanged. A final staging deployment
will verify the scoped Overview correction before production integration.
