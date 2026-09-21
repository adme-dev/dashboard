# Collection upgrades — native intent and authority

20 September 2026. Local increment after Dashboard `3ce5cc63f`, based on main
`b9e791937b3c761516ef98ac62ef22a6b760b8f1`. Not deployed.

## Delivered boundary

The private preparation service accepts a retry UUID from the browser and derives
scope and actor from the authenticated site and actual native login. A trusted
database resolver selects the ready database identity outside native database
transactions. Preparation then reacquires the site, original login and current
permission locks, rechecks expiry after lock waits, and appends the exact intent
and identity to the existing immutable audit history. It rechecks authority after
the insert so a package expiring during that statement rolls the intent back.

Concurrent retries retain one first-generation request per site/environment.
Changing the retry ID, native login, actor, database or approved catalogue cannot
adopt the retained operation. Audit cancellation is a separate append-only event,
not an update or deletion of the original intent. Lost acknowledgements reconcile
to the same persisted request.

The native policy requires all existing provisioning owner checks: current staff
edit permission or a portal admin/manager with exact editor membership, plus a
live login, active client/site and current package capacity. In addition,
`plan_metadata.builder.collectionSchemas` must be exactly `true`. Its absence,
false value or malformed value denies access. If `allowedModules` is specified,
it must include `business-content`. No existing package is enabled by this code;
commercial tier configuration and authoring quotas remain later integration.

The machine-authenticated internal authorization endpoint returns only an exact
saved request after a fresh native snapshot. It verifies the original audit actor,
intent and identity and denies duplicate or cancelled intents. Caller-provided
identity is never sufficient. Hashing happens before the final native read.

Dashboard and Studio have the same golden request/identity fixture. The operation
pins the reviewed bootstrap and collection catalogue digests and policy version;
it accepts no arbitrary SQL, grants, runtime source or browser-selected target.

## Verification

The focused suite passes 61 cases: 50 on actual local PostgreSQL plus eight
contract/admission and three endpoint tests. PostgreSQL fixtures execute the real
control-plane and login migrations with UUID identities and append-only audit
triggers. They test concurrent retries, expired/revoked login, role downgrade,
package loss, changed target/scope, duplicate intent, cancellation, lost response,
and expiry during audit insertion. A separate Studio test verifies the same
fixture against the executor's own schema and identity implementation.

Initial runs failed on the absent new modules/endpoints. The first PostgreSQL
run passed 44/46: two tests incorrectly tried to update append-only audit history.
Those fixtures were corrected to append cancellation separately; no production
audit constraint was relaxed. Independent review found no blocking issues.

- Full Dashboard suite: **14,171 passed**, 639 environment-gated skips; 2,075
  passing files and 27 skipped files. The collection and existing CMS PostgreSQL
  suites were enabled, not skipped.
- Typecheck reports exactly the same **913 existing diagnostics** as the prior
  CMS authority baseline, with no added or removed diagnostics.
- All seven new source/test TypeScript files pass ESLint. Studio's golden test
  and fixture pass Biome. No permission inventory changes were necessary.
- The disposable `studio_collection_upgrade_20260920` database was dropped after
  the successful full suite; the existing server and its other databases remain.

- Build passes: 169 prerendered routes, 25,463,862 raw Worker bytes (5,066
  remaining under the unchanged guard), 6,626,384 gzip bytes. Future endpoint
  integration must continue respecting that guard rather than widening it.

Logs:
`/private/tmp/collection-native-{focused,full-test,typecheck,lint-fix2}.log` and
`/private/tmp/collection-native-studio-contract.log`.

## Still required

This supplies native request persistence and reauthorization, not the whole
customer upgrade path. The production ready-database resolver, executor callback
binding, runtime compatibility/route attestation, public schema/record APIs and
generated admin remain unconnected. No page, customer database or route changes
occur here; the private preparation service has no public HTTP entry point.

Native locks end before any remote effect. Repeated admission is not an atomic
PostgreSQL/D1 revocation fence. The Studio coordinator must continue checking its
lease, exact database reservation and tombstones. In-flight effects after
revocation still need explicit reconciliation. No generated code execution or
runtime containment claim is introduced.

Existing worktrees and dependencies are reused, with one disposable database on
the already-running local PostgreSQL server. No new server, dependency copy,
push, Actions run, hosted migration or deployment is needed. No public feature
claim is added to marketing pages while the customer path remains unconnected.
