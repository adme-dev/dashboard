# CMS connection and activation

19 September 2026. Implementation; live acceptance remains pending.

The selected website's Business content screen has an explicit Connect CMS action.
GET only reads status. POST derives website/customer scope, artifact digests and
originating native login on the server before recording the immutable intent.
Retries reuse that intent; a new login cannot adopt it automatically.

## Completion boundary

The private coordinator leases the operation. Its executor checks native authority
and the current lease around allocation, schema installation, reviewed Worker
installation and empty-content initialization. Imported page checkpoints, versions,
assets, forms and release pointers are never rewritten.

The D1 route retains the exact resource/seed proof under the lease. Its local
`active` state means prepared only: the `attach-existing-content` payload requires
an exact native completion receipt before the route can resolve. The native
transaction locks the site and original native login, checks current permissions,
entitlement and immutable checkpoint, writes an append-only completion audit and
checks expiry again. Provider calls finish before this transaction starts.

Every attachment route resolution checks that native receipt and then rereads the
local route/resource state. Disabled routes remain disabled. Completed connections
survive the initiating user signing out; ordinary CMS access still requires the
current viewer's website permissions. In-flight provider effects cannot be undone
by revocation; retries reconcile retained ownership and never transfer authority.

## Client admin

Agency and eligible portal editors use the same selected-site CMS backend. Status
polling never starts setup. Connection refreshes existing CMS data without replacing
the mounted editor; dirty drafts remain protected by the draft composable. CMS
records remain drafts and publication still follows the existing release workflow.

## Verification and release

Local checks cover native completion/logout and expiry races, immutable resource
proof, disabled routes, retry ownership, permission denial, scope substitution and
read-only status. The combined Studio release (including the previously staged authority fixes) passes
3,414 tests, 23 build tasks, 37 typecheck tasks plus security, and lint on 882 files.
Dashboard passes 14,175 tests (544 configured skips), including 103 disposable
PostgreSQL attachment cases. Typechecking matches the existing 913 diagnostics
exactly, with none in this change. Changed-file lint passes except four unchanged
`no-explicit-any` findings in the existing God-mode inventory test.

The clean Dashboard build passes the unchanged size guard at 25,460,579 raw bytes
(8,349 remaining). A reviewed SQL-template whitespace compaction correction
preserves closed quoted values, open quotes and PostgreSQL newline concatenation,
including the unknown interpolation boundary; 38 packaging tests pass.

Studio source `248b9ee60e060dd8f06e70b2a86411df86816a84` is deployed privately to
staging: executor version `db54362b-b4b9-44f4-8478-5f0b5a642d29`, coordinator version
`1b7454eb-6b33-4e4c-af84-6f99e7831191`. Additive D1 migrations 0005/0006 are applied.
Dashboard deployment and authenticated synthetic/Fantasy acceptance remain pending.
[Studio integration PR #88](https://github.com/adme-dev/xeroflow-page-studio/pull/88).
Before release, reconcile the earlier staged session-authority commits, verify
current main, preserve staging bindings and record exact source/deployment IDs.
