# Page Studio CMS — current native login and role authority

20 September 2026. Local implementation on `feat/page-studio-cms-authority`,
based on Dashboard main `b9e791937b3c761516ef98ac62ef22a6b760b8f1`.

## Behavior

CMS HTTP requests now bind their actual native browser login using the existing
Page Studio login resolver. Request JSON cannot supply that identity. Binding
preserves logout tombstones; PUT bodies finish reading before login resolution.

Content admission checks the matching live login, active native account and
current permissions alongside website, client, entitlement and membership.
Portal requests also require their native client session and current client
association. Agency requests resolve the current system/custom role and its
view/edit permissions, including session invalidation and read-only roles.
The query uses wall-clock expiry rather than the transaction start time.

Successful reads repeat admission after the remote content call and compare
the complete original/current scope. Logout, expiry and removed viewing rights
withhold the response. An editing downgrade can retain reads with `canEdit:
false`. Connection status also repeats native login admission after its remote
read. Existing attachment intent/receipt validation remains in place.

This adds a login-binding transaction to CMS requests. It adds no migration,
public feature, UI control, generated execution, or marketing capability.

## Verification

- Final full Dashboard suite: **14,106 passed**, 643 environment-gated skips;
  2,071 passing files and 28 skipped files. The content PostgreSQL suite was
  enabled during this run, not skipped.
- **29 real PostgreSQL cases** cover current permissions, native logout,
  disabled accounts, moved clients, expiry, session invalidation and retained
  read-only access. A second connection commits logout during the remote read.
  H3 cookie tests exercise the real login resolver/binder against PostgreSQL and
  prove native-session deletion and existing logout tombstones deny reuse.
- Unit/HTTP tests cover missing or mismatched server login, caller-supplied
  identity, pre-call write denial and connection-status revocation during RPC.
- Baseline reproduction produced five new behavioral failures and one changed
  query-argument assertion against the original content implementation. The
  initial test launch failed in package-manager setup; that launcher failure
  is not counted as regression evidence.
- Independent review caught a UUID/text query mismatch masked by text fixture
  IDs. Correcting fixture types reproduced 17 failures/12 passes. Membership
  now joins the native owner's UUID directly; all 29 cases pass. Follow-up
  review found no remaining issues.
- The permission inventory records exactly two additional identity-boundary
  SQL predicates. No governance bypass was introduced. The first full run's
  sole failure was the inventory snapshot; its reviewed update passes.
- All ten changed/new CMS source and test files pass lint. The inventory test
  retains four pre-existing `no-explicit-any` violations, reproduced from HEAD.
- Typecheck still fails with **913 existing diagnostics**. The complete error
  multiset matches the recorded CMS baseline after worktree path normalization;
  there are no additions or removals.
- Build passes: 169 prerendered routes, 25,459,474 raw Worker bytes (9,454
  remaining under the unchanged guard), 6,625,152 gzip bytes. The first attempt
  hit local disk exhaustion during output writing. Removing only ignored build
  outputs from the completed acceptance worktree and failed candidate freed
  space; the full retry passed. No source or customer data was removed.
- The disposable `cms_authority_20260920` database was dropped after testing;
  the pre-existing local PostgreSQL server and its other databases were retained.

Local logs: `/private/tmp/cms-authority-full-final.log`,
`cms-authority-uuid-red.log`, `cms-authority-uuid-green.log`,
`cms-authority-typecheck.log`, `cms-authority-source-lint.log` and
`cms-authority-inventory-lint-base.log`, plus `cms-authority-build-retry.log`
(all under `/private/tmp`).

## Remaining boundaries

Writes check current authority before dispatch. This does **not** provide an
atomic PostgreSQL/D1 revocation fence: access can change after the final check.
The new binding transaction ends before remote execution. Local H3/PostgreSQL
tests are not signed-in staging or live Hyperdrive acceptance.

The Studio collection storage foundation remains in local commits `9833a7b`
and `ce8790a`. Next work must connect it through an explicit, attested database
upgrade and authenticated schema/record APIs, then generated admin and component
authoring. Preserve legacy content and the existing attachment schema digest.
The broader builder tasks and generated-worker CPU containment remain open.

No push, GitHub Actions run, hosted migration, deployment or customer content
mutation is included in this increment. Batch integration after the next
coherent section and reverify current main before release.
