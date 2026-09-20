# Collection upgrade database discovery

21 September 2026. Local Dashboard increment after `1948667b5`, paired with
Studio private bridge `bb87185`. No deployment or hosted upgrade.

## Connected behavior

The private preparation service now defaults to the deployed
`PAGE_STUDIO_PROVISIONER.readCollectionUpgradeDatabase` RPC. It selects that
binding from the native request's Cloudflare environment and requires the
configured provisioning environment to match the authorized site scope. It
rejects missing provisioning configuration or a missing discovery method.

The existing first native transaction still authenticates the original login and
checks current site, role and explicit collection-schema package allowance before
contacting the Worker. Discovery runs outside native locks. The exact response
must pass the reviewed database contract and match every scope field. The second
transaction still locks and rechecks native authority before retaining immutable
intent, including another check after its insert. Logout during discovery denies
the request without retaining an upgrade intent.

The RPC is invoked directly on its binding, preserving the remote receiver. No
JavaScript `.bind()` or extracted remote method is used. Explicit resolver and
transaction injection remain available for existing isolated tests.

## Verification

Twenty new real PostgreSQL cases exercise both staff and client actors through
the default resolver with a controlled service-binding stand-in. They cover exact
scope, admitted login before discovery, repeat discovery on retry, no provisioning
mutation, absent/mismatched configuration, missing/foreign/error results, package
denial before discovery and logout while discovery is in flight. The red run
failed 18 cases because the default resolver was missing; the two early-denial
cases already passed. The focused green run passes 70 PostgreSQL cases and three
existing endpoint cases. Both modified TypeScript files pass ESLint.

Independent review found no concrete blockers. These Dashboard tests exercise
real native transactions, not an actual deployed Worker binding. Studio's paired
bridge tests exercise real local Worker RPC/D1 with a native-authority stand-in;
combined deployed acceptance remains outstanding.

Full regression passes **14,191 tests**, with 639 existing environment-gated
skips (2,075 passing files and 27 skipped). Both collection and existing CMS
PostgreSQL suites ran. Typecheck reports the same **913 existing diagnostics** as
the preceding native-authority increment, with no added or removed diagnostics.
Build passes with 169 prerendered routes and 25,463,862 raw Worker bytes (5,066
below the unchanged guard); gzip is 6,626,286 bytes. Local logs use
`/private/tmp/collection-resolver-`.

## Remaining work

No public request route, upgrade runner RPC, route activation or customer schema
mutation is exposed here. Runtime and route compatibility must be attested before
guarded execution is connected. Preserve original bootstrap receipts and legacy
content through that integration. Schema/record APIs and generated client-admin
forms follow it; generated code remains disabled pending containment checks.

Fresh native admission and remote state checks are not an atomic PostgreSQL/D1
revocation fence. In-flight provider outcomes and revoked-origin-login recovery
still require explicit reconciliation.

The existing worktree, dependencies and local PostgreSQL server are reused. The
owned disposable database `studio_collection_upgrade_20260921` was dropped after
the successful full suite. The final disk check shows 8.8 GiB free. No push,
Actions run, hosted migration, customer change or deployment is part of this
increment. Marketing claims remain unchanged because this private connection
does not yet enable customer collection authoring.
