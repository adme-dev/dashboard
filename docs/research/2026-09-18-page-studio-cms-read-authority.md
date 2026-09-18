# Page Studio — CMS read authority

18 September 2026. R06 child increment; local implementation, not deployed.

## Problem and change

The shared agency/client content adapter checked website access before calling the
content router. If membership, entitlement, client activity or site ownership
changed while that RPC was running, the response could still return the old
content and editing permission.

`readPageStudioBusinessContent` now checks website authority again after a
successful router response. It compares the complete original and current scope
(tenant, client, business, site and environment), withholds content when access
has been lost or scope changed, and returns current portal editing permission.
A downgrade from editor to viewer therefore still permits a read with
`canEdit: false`. Empty content receives the same protection. Failure of the
second database query withholds the response; the HTTP adapter hides database
error details.

This adds one fresh database query per successful content read. It does not add a
migration, public feature, binding or customer-facing control.

## Verification

- Eight new regression cases failed against the original adapter and pass after
  the change. The focused adapter, endpoint and shared-schema suites pass 44 tests.
- Fourteen disposable PostgreSQL cases pass, including actual membership,
  entitlement, client and site changes during the mocked RPC. One case uses a
  separate connection to commit membership revocation before the RPC returns;
  the second authority query observes that revocation and rejects the response.
  Other mutation cases use the fixture transaction. These are local database
  checks, not live Hyperdrive or native-login acceptance.
- Changed-file lint passes. Initial test SQL quote-style violations were fixed.
- Independent review found no Critical or Important issues. The separate-connection
  regression strengthens the original review's noted database-evidence limitation.
- Typecheck reports the same 913 diagnostics as the recorded baseline, with no
  additions or removals. It remains a failing baseline, not a clean typecheck.
- Build passes, including 169 prerendered routes and the immutable Cloudflare
  bundle guard: 25,465,394 raw bytes (3,534 bytes remaining); 6,622,537 gzip bytes.
- The initial sandbox full-suite run could not start browser/local Worker
  fixtures and was stopped. The approved run passed 13,985 tests but two source
  inventory scans exceeded their time limits. An intermediate run overlapped
  generated Nuxt build files and was stopped. A focused retry still timed out
  on the CRM scan during the build. The final full run executes after the build,
  with four workers and the existing test deadlines unchanged.
- Final full suite passes: 13,987 tests across 2,065 passing files; 542 tests
  and 27 files skipped by their configured environment gates. The affected
  PostgreSQL suite was separately enabled and its 14 cases passed.

## Boundaries and remaining work

This is a response-time website-authority check, not an atomic revocation fence.
Access can still change after the last query. The actor was authenticated before
entering the adapter: native session expiry/logout and fresh agency role checks
across the RPC are not established by this change. Writes and their commit
boundaries are unchanged and require separate work.

R06 remains partial. A01's common policy primitive and all 26 delivery tasks remain
open. Client admin linked to Page Studio and shared CMS records remains the first
delivery priority; generated customer execution remains disabled. CPU containment
research for generated workers does not itself gate trusted CMS authoring, but
the controlled CMS implementation contract still needs its authority and lifecycle
requirements resolved.

Source base: Dashboard `004524e12`, including fetched main
`a917386dde67f06921843fd6e3a1ed1b4b984c6f`. The isolated implementation worktree
preserves the root checkout's unrelated work. No Studio source changes, merge,
deployment or live customer data mutations occurred in this increment.

Evidence: `.verification/page-studio-builder-rnd-20260917/cms-read-*`.
