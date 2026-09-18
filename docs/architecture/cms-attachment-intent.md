# Native CMS attachment intent

18 September 2026 — CMS-ATTACH-2 server service. No HTTP route, UI, resource
allocation or deployment is enabled by this increment.

## Dependencies and scope

This section builds on the main-based contract in Dashboard PR #573 / Studio
PR #81 and the already staged native-login authority work at Dashboard
`35a88e1b71bbeb723b5149c15482585d433e011c`. The intent branch was created from
freshly fetched main, fast-forwarded to that verified descendant, then given
the matching contract commit. These dependencies must be reconciled before a
main release; this is not a release candidate or a substitute for them.

`preparePageStudioContentAttachment` accepts the authenticated native actor,
its H3 event, a selected site, server environment, reviewed artifact configuration,
checkpoint bucket and a strict body containing only `requestId` (UUID) and
`expectedCheckpointId`. Callers must obtain the actor through the existing
agency/portal authentication entry points. The native credential must match the
actor; actor fields alone cannot authorize intent creation. No endpoint accepts
caller-supplied scope, login hash, operation ID, policy or code digests.

The server derives the five-axis scope from the website row, binds the originating
native login and resolves its immutable current checkpoint. It verifies the
canonical R2 key, envelope scope, manifest site and canonical manifest digest
through the existing bounded checkpoint reader. The trusted schema/runtime
digests and policy identity are configuration supplied by server code, not proof
that an artifact exists. The reviewed-artifact catalogue/resolver and its actual
provider bytes remain an executor prerequisite in CMS-ATTACH-3.

## Native authority and policy

The transaction follows the established site `FOR NO KEY UPDATE` → portal native
session `FOR SHARE` → parent-login binding order. It reuses the native login
resolver/binder and provisioning owner SQL, including:

- Current agency edit permission, active staff, writable role and invalidation time.
- Active portal admin/manager, exact editor membership and unexpired native login.
- Active client/site, current trial/active entitlement and effective dates.
- Site allowance, page allowance and `business-content` in the allowed-module
  policy when an explicit module list exists. Portal setup also requires the
  existing `portal_creation_enabled` entitlement.

These are the current trusted CMS setup rules, not new commercial prices,
allowances or arbitrary generated-code permissions. The broader A01 capability
policy primitive and R12 synthesis remain open.

The authority query holds permission, entitlement and login locks until commit.
It uses `clock_timestamp()` and reruns after checkpoint I/O and after the intent
insert, so elapsed transaction time does not extend package/login validity.
Actual native logout is tested in both orders: logout while intent waits on a
site prevents retention; logout after intent owns its login fence waits until
commit and prevents later retries. This proves the local PostgreSQL intent
boundary, not a PostgreSQL-to-D1 revocation fence for later provider effects.

## Durable identity and retries

The existing append-only `page_studio_audit_events` table retains action
`content.attachment.requested`, resource type `content_attachment`, a server UUID
operation ID, the immutable private request, its deterministic identity and the
small validated request body. This follows the existing history transaction's
scoped idempotency convention and needs no new migration.

The idempotency key includes actor role, actor ID and caller request UUID; the
unique index adds tenant/client/site scope. The site lock serializes concurrent
identical requests. A lost response can be retried with the same request UUID.
The retained request cannot be adopted by a newer login or changed to different
artifacts, policy, scope or checkpoint. An exact retry may still use its original
immutable checkpoint after ordinary editing moves the page head forward. It
revalidates the original blob and current authority before returning.

The returned `{ intent, identity }` is private service data, including a login
hash; future HTTP responses must project a safe status/operation receipt. The
hash is not a raw credential or an access grant. Do not copy the private intent
into public responses or browser storage.

Different request UUIDs can retain distinct intents for the same site. Intent
retention is not resource reservation; CMS-ATTACH-3 must reserve the full scope
atomically and reconcile retained operation ownership before allocation.

## Preservation and limits

There are no writes to page checkpoints, version history, manifests, assets,
forms or release pointers. R2 is read-only. Only the existing login binding and
one append-only intent event may be written by a successful transaction.

No HTTP route or UI is added until the coordinator can accept this explicit
operation. Original-login reauthorization before each provider effect, route
activation, reviewed runtime/schema resolution, cross-store revocation and live
acceptance remain CMS-ATTACH-3 through -6. Fantasy storage remains unconnected.

## Verification

The tests run the production SQL and native login/logout helpers against an
explicit disposable localhost PostgreSQL database. Relevant real migrations
402/404/420 create the control tables; no live database or customer content is
used. R2 is represented by a map of immutable checkpoint envelopes; the actual
bounded reader verifies the bytes. Native token issuance and revocation use the
real application code. Tests that inspect locks use separate PG connections and
`pg_blocking_pids`.

Run the focused section with Node 24.18.0:

```sh
PAGE_STUDIO_ATTACHMENT_DATABASE_TEST_URL=postgresql://postgres@127.0.0.1:55443/studio_attachment_intent \
  node node_modules/vitest/vitest.mjs run test/server/utils/pageStudioContentAttachmentIntentPostgres.test.ts
```

The URL must identify an explicitly disposable `studio_attachment_intent*`
localhost database. Each case creates and drops its own schema. Without this
variable the database suite skips; a default full-suite run is not database
acceptance evidence. This section explicitly runs all database cases.

### Recorded results — 18 September 2026

- Full Dashboard suite with the disposable PG connection: **14,120 passed,
  546 skipped**. This includes all 73 attachment database cases; other optional
  database suites remain skipped.
- Final focused database run: **73 passed**, including a sequence assertion that
  proves expiry occurred during the attempted insert before its rollback.
- ESLint for both new TypeScript files and the production build: **passed**.
- Build size guard: raw **25,457,662 / 25,468,928 bytes**; gzip
  **6,623,362 / 9,750,000 bytes**. Only 11,266 raw bytes remain, so later runtime
  integration must rerun the size guard.
- Full typecheck: **913 existing diagnostics** on both this candidate and an
  isolated checkout of its exact prerequisite `350f823ce`; zero added or removed
  diagnostics. The repository typecheck is not green.
- Independent service-scope review: no Critical or Important findings. The final
  changes after review strengthen tests and add an explicit transaction type.
- CI now creates separate disposable `studio_history_authority_ci` and
  `studio_attachment_intent_ci` databases and executes both suites explicitly.
  The first CI run exposed the inherited history suite's rejected database name;
  the workflow correction preserves its safety guard. The combined local run
  passes **90 cases**, and **32 workflow/deployment guard regressions** pass.

The PostgreSQL cases cover current native permissions, expiry and logout races,
changed retry inputs/login/artifacts, concurrent retries, recovery after commit
response loss, checkpoint validation and preservation of page/history/release
state. They do not prove later provider allocation or cross-store revocation.

### Task checkpoint

- [x] CMS-ATTACH-1: shared immutable contract, reviewed in draft PRs.
- [x] CMS-ATTACH-2: native durable intent **server service**, tested and reviewed;
  not merged or exposed through an HTTP endpoint.
- [ ] CMS-ATTACH-3: coordinator/executor allocation and recovery.
- [ ] CMS-ATTACH-4: guarded route activation and cross-store revocation.
- [ ] CMS-ATTACH-5: shared client-admin/Studio setup API and UI.
- [ ] CMS-ATTACH-6: synthetic staging acceptance, then reviewed Fantasy attachment.

The broader A01 policy primitive, R08, R12 and all 26 delivery tasks remain open.
This server increment does not make CMS storage available to customers.
