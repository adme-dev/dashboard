# Dissector ingestion authority foundation

Status: locally implemented and tested on 28 October 2026 in the original
`banner-editable-artwork` worktree. This is the bounded Task 2 authority foundation
from [OWNED-INGEST-PLAN.md](OWNED-INGEST-PLAN.md), not acceptance of scoped upload,
protected result delivery, full R01/R12/A05, or a deployment. The coordinator owns
routes, job lifecycle, pipeline and release integration. No Git operation was
performed by this worker; a worktree/branch label is not a release revision.

## Contract and exact exports

`shared/bannerDissectionIngestion.ts` exports:

- `dissectionSourceSchema` / `DissectionSource`: strict PNG-only version 1 source
  identity, maximum 10 MiB compressed, 4096 pixels per edge and 10,000,000 pixels.
  This matches the coordinator's PNG source-only contract. The schema validates
  metadata; the coordinator's original-byte validator establishes image validity
  and SHA-256. Never accept source metadata supplied by a browser or model.
- `dissectionOwnerSchema` / `DissectionOwner`: `user`, `client`, or `project` with
  uploader `userId`; project scope also freezes `projectId`, `projectOwnerId` and
  nullable `clientId` from the current project row.
- `dissectionPhysicalSchema` / `DissectionPhysical`: explicit A4 orientation,
  millimetres and matching 210-by-297 or 297-by-210 dimensions. No DPI inference.
- `dissectionIngestionSchema` / `DissectionIngestion`: version 1, owner, nullable
  physical intent, canonical UTC `ingestedAt`, nullable canonical UTC
  `sessionsInvalidatedAt`. Unknown fields and versions fail closed.

`server/utils/banner/dissectionAccess.ts` exports:

```ts
interface DissectionAccessDb {
  query<T = Record<string, unknown>>(
    sql: string, params?: unknown[]
  ): Promise<{ rows: T[] }>
}
type DissectionAccessMode = 'read' | 'write' | 'execute'
interface DissectionAccessRecord { user_id: string; manifest?: unknown }
interface DissectionOwnerInput {
  projectId?: string; clientId?: string; source?: unknown
}
interface DissectionResolvedOwner {
  owner: DissectionOwner; sessionsInvalidatedAt: string | null
}
interface DissectionHistoryOptions {
  alias?: string; parameterOffset?: number; projectId?: string; clientId?: string
}
interface DissectionHistorySql { sql: string; params: unknown[] }

resolveDissectionOwner(db, actorId, input, mode = 'write')
  // Promise<DissectionResolvedOwner>
assertDissectionAccess(db, actorId, record, mode)
  // Promise<void>
dissectionHistoryScope(db, actorId, options = {})
  // Promise<DissectionHistorySql>
```

Invalid input returns 400, denied/missing authority returns a generic 403, and
query errors return a sanitized 503. These helpers do not mutate jobs, perform
expiry, open transactions, retry queries, access storage, or call providers.

## Current authoritative schema and policy

The inspected sources are `server/utils/auth.ts`, `roleResolver.ts`,
`permissions.ts`, `social/clientAccess.ts`, `godMode/authority.ts`,
`godMode/featureGate.ts`, `banner/engineJobs.ts`, `server/database/schema.sql`,
`schema-auth.sql`, and migrations 026, 034, 061, 062, 064 and 191.

| Fact | Authoritative source |
|---|---|
| Active uploader, legacy role, configured role, revocation marker | `team_members.id`, `is_active`, `user_role`, `custom_role_id`, `sessions_invalidated_at` |
| Configured policy | `custom_roles.id`, `slug`, `is_system`, `is_read_only` |
| Permission grants | `role_permission_groups.role_id`, `permission_group` |
| Project ownership | `banner_projects.id`, `client_id`, `created_by` |
| Client existence | `agency_clients.id` |
| Current assignment | `client_team_assignments.client_id`, `team_member_id` |
| Job uploader and immutable ingestion | `banner_dissections.user_id`, `manifest` |

Every call reads and locks current authority using the supplied transaction
client. A configured `custom_role_id` resolves only that role. With no configured
ID, the helper resolves the current `user_role` against a system role row by
slug. Missing role policy denies; database failures never fall back to static
grants. The helper does not union the legacy role's permissions into a custom
role and does not use KV, `queryOne`, request `permissionGroups` or environment
variables.

The policy agreed with the coordinator is:

| Boundary | Requirements |
|---|---|
| Every job read/write/execute | Exact uploader equality; fresh active user; existing configured/system role policy |
| Personal read, including legacy jobs | Above requirements; read-only roles may read their own jobs |
| Personal write/execute | Above requirements; role is not read-only and legacy role is neither viewer nor guest |
| Client scope, including a client-owned project | Current CLIENTS, CREATIVE or MEDIA_BUYING permission; existing client; current assignment unless the configured role also has ADMIN or MANAGEMENT |
| Project with no client | Current creator equality or current ADMIN/MANAGEMENT grant, plus uploader restriction |
| Stored project scope | Current project creator and client must equal the frozen values, even for an administrator who can access both old and new clients |
| Metadata-bearing job | Valid source and ingestion metadata, owner uploader equality and unchanged revocation marker |

Both Banner Studio pages use `role-creative` UI middleware, while the existing
Dissector upload/process APIs use `requireWriteAccess`. This increment preserves
that existing personal API compatibility rather than introducing a new CREATIVE
requirement for personal jobs. Removal of a client capability revokes scoped
jobs; personal access is not contingent on an unrelated capability grant.

There is no implicit god-mode bypass. Existing god-mode authority requires a
fresh active `team_members.user_role = 'owner'`, the emergency setting and exact
audited route/mutation coordination. The Dissector helper is not such a
coordinator. Owner status, an incoming god-mode claim or `GOD_MODE_DISABLED`
from process environment therefore never elevates these checks. Current explicit
ADMIN/MANAGEMENT grants have only the narrow scope effects in the table above;
they never expose another uploader's jobs.

No ingestion means legacy uploader-private ownership, even when a verified
`source` exists or `project_id` names an eventual import destination. Present
null/malformed/unknown ingestion denies instead of becoming legacy. Both SQL
NULL and JSON null root manifests retain historical private compatibility.
Malformed present source metadata also denies. Legacy jobs have no captured
session marker, so historical session-revocation continuity cannot be inferred;
their active user and current role checks still apply. New ingestion compares
the captured marker on every read/write/execute boundary.

## Transaction and integration requirements

1. Pass the connection from `transactionWithoutRetry`, not a pool performing
   unrelated autocommit queries or a cached query adapter. Existing-job mutations
   load that job `FOR UPDATE`, derive execution actor from its persisted `user_id`,
   call `assertDissectionAccess`, then perform the existing generation/lease SQL
   on that same connection. Do this before expiry or other incidental writes.
2. Lock order inside the helper is user, configured role, permission rows ordered
   by ID, project if any, client if any, and assignment if required. Callers must
   consistently take their single job lock first. Multiple target/project locks
   need a consistent caller-defined order; import's separate target authorization
   remains an integration boundary. Do not acquire a job lock after locking its
   scope in one mutation and reverse that order elsewhere.
3. Admission resolves ownership before slow work and rechecks after parsing/R2
   storage immediately before durable insert. Compare frozen scope and the
   revocation marker across those calls. Never silently bind to a newly changed
   project, downgrade a denied scope to personal, or retry an uncertain insertion.
   Only verified PNG metadata may enter a scoped admission; the source-byte
   validator must run before the helper receives the server-owned source object.
4. Keep authority transactions short. Do not hold locks across R2, provider or
   native execution. Reauthorize before each external effect and after it before
   accepting or publishing output. Authority lost during a provider request
   prevents later effects/publication; it cannot recall transmitted bytes.
5. History calls `dissectionHistoryScope` in a transaction, places the returned
   predicate in `WHERE` before `ORDER BY`/`LIMIT`, then calls
   `assertDissectionAccess` on every selected row before projecting any response.
   The SQL predicate checks uploader, role-derived scope, project/client current
   ownership and session marker. The second check validates the full metadata
   schema and locks selected scope rows. If authority changes between selection
   and the lock, the request denies; do not return the earlier selected data.
   Malformed metadata may deny the page; this helper does not silently skip it or
   promise a full page after concurrent changes. Never cache/reuse the returned
   SQL parameters or derived grants across transactions.
6. History aliases are validated identifiers and filters are UUID parameters.
   `parameterOffset` supports a caller's preceding parameters; prepend those
   parameters before the returned `params`. Project/client filters refer to
   immutable ingestion ownership, never the import destination `project_id`.
7. Preserve server source/ingestion through retry/progress/failure/cancel and
   exclude model-supplied metadata. Project/client import restrictions and target
   authority must run before receipt replay under the coordinator's job/project
   transaction. The helper intentionally does not enforce target import policy.
8. Project/client ingestion stays gated until source and derived result delivery
   recheck current ownership. Existing public bearer asset URLs do not become
   revocable merely by adding these helpers or `client_id` to assets. Browser
   projections must omit source object keys and the session marker and use
   `private, no-store`.

## Verification and remaining acceptance

Node version: `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node`.

The initial module-absent run failed, then the empty helper implementation
produced **32 failing behavioral tests**. Implementing current authority made
the **34 focused cases pass**. Actual PostgreSQL history testing subsequently
produced **four failing cases** for JSON-null legacy manifests; the SQL predicate
was corrected and the final local proof passed **50/50 cases**, comprising 34
focused cases and 16 real PostgreSQL cases.

The database cases execute repository schema definitions and migrations in a
new private loopback PostgreSQL 17 cluster. They cover history filtering before
LIMIT, frozen ownership/assignment/session changes, permission removal, custom
role precedence, current system role lookup, parameter offsets and malformed
metadata before projection. Six two-connection tests prove uploader/role/group/
project/client/assignment revocations hit PostgreSQL lock timeout while the
authorized transaction is open, then succeed after it ends, after which the
next execution check denies. These are helper-level transaction proofs, not
route, provider, queue, storage or hosted acceptance.

Commands used:

```sh
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run test/server/utils/bannerDissectionAccess.test.ts --maxWorkers=1
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node /private/tmp/dissection-authority-proof.mjs
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target es2022 --esModuleInterop --types node shared/bannerDissectionIngestion.ts server/utils/banner/dissectionAccess.ts test/server/utils/bannerDissectionAccess.test.ts
```

The temporary runner is an explicitly authorized local evidence artifact, not a
repository deliverable. It sets only the dedicated proof variables, never loads
`.env`, validates the private cluster identity, and positively verifies shutdown
before removing its cluster directory. The test suite skips its database cases
without that owned-cluster opt-in. The final proof cluster
`/private/tmp/dissection-authority-Tv2iBi` was stopped and removed. The targeted
TypeScript check passed. Vitest emits the existing Vite `__dirname` configuration
warning; no test failure remains in the reported focused/local proof runs.

The full project suite, hosted database, providers, native engine, deployment and
browser acceptance were not run. The coordinator still owns lifecycle and route
integration tests, metadata preservation, source revalidation, authenticated
result delivery, import target/replay enforcement, current-main reconciliation
and release evidence. These helpers alone do not enable scoped ingestion.
