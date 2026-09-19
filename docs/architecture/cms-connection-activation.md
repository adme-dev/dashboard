# CMS connection and activation

19 September 2026. Synthetic staging acceptance passed; Fantasy production connection remains pending.

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
read-only status. Full Studio build, typecheck, tests and lint pass. Dashboard
passes 14,182 tests and retains the exact 913-diagnostic baseline. Synthetic staging
connection, CMS save/reopen and unsaved-edit protection pass; original page and
history fingerprints match. Fantasy is a production website and remains unconnected.
See [acceptance and release record](../research/2026-09-19-page-studio-cms-connection.md).

## Staging timing correction

The staging control gateway uses `global_fetch_strictly_public` so native callbacks
reach the public Pages endpoint. The initial 522 is resolved. Read-only authority
now uses one uncached SQL snapshot per check; native completion retains its locking
transaction. The executor reads the exact lease row, checks native authority once
and evaluates expiry after the awaited check. It does not cache permission results
or extend a lease. A real D1/R2 regression exercises full setup and route preparation
with a simulated 500 ms cost for each native check. Live staging subsequently completed setup and saved/reopened revision 2. The
simulated envelope is not a general latency guarantee.
