# FigFlow revision persistence — F03 foundation

Status: local persistence and gated draft HTTP save implemented; not deployed or enabled.
Base: `4794ae06d07d25ac68e840d2f5339cd109e95104`, current main verified 31 October.

## Implemented

Migration `491_email_design_revisions.sql` adds document identities referencing
existing template/module/campaign IDs; immutable revisions; and payload-bound
operation receipts. Foreign keys restrict deletion of referenced owners/history.
Head/parent foreign keys require revisions to belong to the same document.
Database triggers reject identity reassignment and revision/receipt mutation.
Heads can only advance to their direct successor; unique parent edges and a
deferred commit check reject forks and unlinked revisions. Every document must
start with a legacy baseline. Versioned owners cannot change client scope:
changing the audience requires an explicit copy workflow, still to be integrated.

Compact source JSON is stored in `payload_text`; `payload` is generated JSONB.
The UTF-8 byte limit applies to the compact source rather than PostgreSQL's
expanded JSONB text representation. Legacy SQL snapshots retain their original
numeric precision and are exempt from new-authoring size limits.

`appendDesignRevision` validates the version-1 source contract, checks actual
owner scope and campaign state under database locks, obtains fresh caller
permission, checks expected head, and atomically saves payload, head and receipt.
The entire canonical/native-reference/mapping/policy envelope is one immutable
payload. It is a source-save receipt, not a publication/readiness certificate.

Actor and operation identity serialize retries, including a reused operation
against a different document. The same complete request (document, original expected revision and design)
returns the durable receipt; changing any of these conflicts. Concurrent writers on one head cannot both succeed. An
unknown commit acknowledgement requires reconciliation with the same operation
identity; this service uses the existing non-retrying transaction utility.

`ensureLegacyDesignDocument` snapshots a legacy database record once, preserving
its actual source and frozen HTML with schema version 0 / origin `legacy`.
The SQL copy avoids JavaScript round trips and their numeric precision loss.
It neither re-renders nor rewrites the source. Legacy records keep their stored
IDs. New authoring limits are not imposed on this archival copy. Existing
clientless campaigns require scope resolution before entering this new path.

## Authority and integration requirements

Both functions require a caller-provided fresh authorisation check. Routes must
supply it from existing authenticated staff/client access utilities and derive
actor ID from authentication. Never expose these functions as unguarded routes
or let browser input select the authoriser or transaction implementation.
Staff updates use `appendStaffDesignRevision`, which reads the locked persisted
head and enforces `assertStaffDesignEdit` within the same transaction. It rejects
legacy-to-structured conversion with `STRUCTURED_REVISION_REQUIRED`; conversion
requires the structural designer path. The structural `appendDesignRevision`
callback must grant designer authority, not ordinary staff write access. Library
publication still requires separate permission and readiness checks. The draft HTTP route is gated off by default; existing template PATCH/DELETE
translate owned database conflicts to 409. No live enforcement is claimed.

Source rows lock before document rows in both operations. Operation advisory
locks serialize only conflicting requests; hash collisions add contention and
never confer authority. New revisions cannot be appended to a non-draft
campaign. Existing receipts can still be reconciled after scheduling, subject
to current access/scope checks, without modifying campaign content.

## Verification

Run against the private local socket from the integration inventory:

```sh
FIGFLOW_DESIGN_PG_SOCKET=/private/tmp/figflow-postgres-rZeu9V3y pnpm exec vitest run test/integration/emailDesignRevisions.database.test.ts
```

The test refuses sockets outside the dedicated temporary-cluster prefix. It
creates a private schema with synthetic owner tables, applies migration 491
twice, exercises real PostgreSQL constraints and independent transactions, and
drops only that schema afterward. No production connection is used. Application
`.env` remains unchanged. These are PostgreSQL 14.19 tests, not hosted Neon or
Hyperdrive acceptance and not the complete historical migration chain.

The dedicated database is `figflow_design_test`, created from template0 with
UTF8 encoding. The fixture asserts encoding before running. The previous temporary cluster
was absent on this continuation; a new UTF8 cluster was created at the socket
above using the installed PostgreSQL 14.19 binaries, with TCP disabled.

Database cases cover retries, concurrent writers, immutable history, revoked
access, scope mismatch, scheduled campaigns, lost commit receipt, concurrent
duplicates, receipt rollback, legacy precision, head/parent guards, mandatory
baselines, original-CAS replay, and exact 2 MiB multibyte source round trips.
Stored module resolution also checks old pinned versions, fresh read authority,
wrong-owner revisions and legacy rejection. See the plan ledger for the latest
combined test count. Vite emits the existing future config-loader warning.

`resolveStoredDesignDependencies` now reads exact module revisions using the
caller's database transaction and module-read authoriser. It checks stored owner,
source scope, version and the complete transitive closure without substituting
mutable heads. The caller must authorise the root and recheck write authority at
commit; both append functions now require an explicit `authorizeModuleRead` callback
when dependencies or instances exist and invoke this helper within their write
transaction, including receipt reconciliation. Missing authority fails with
`DEPENDENCY_AUTHORITY_REQUIRED`. No published source or rendered HTML is changed
by the source-only append functions. The gated draft HTTP boundary is described below; publication integration remains open.

## Remaining F03 work

- Reconcile final F02 actions, dependency closure and draft/proposal lifecycles.
- Route existing create/update/archive operations through revision-aware atomic
  writes without breaking old clients or creating stale mutable heads.
- Bind full module revision closure and asset retention to immutable snapshots.
- Add independently resumable designer working drafts and explicit update/
  conflict workflows; protect instance overrides through library changes.
- Complete legacy migration rollout/backfill and rollback-readability tests with
  representative existing schemas. No production migration has been applied.
- Recheck migration number against current main immediately before integration.

The SQL file and source are local/uncommitted. No publication or public product
claim should be enabled from this foundation alone.


## Atomic template-draft projection

`saveTemplateDesignDraft` (designer authority) and
`saveStaffTemplateDesignDraft` (persisted content policy) additionally update the
existing `edm_templates` draft source and HTML in the same transaction as the
canonical revision/head and operation receipt. They accept only an existing
`template_kind = draft` owner and reject library templates, modules and campaigns
with `TEMPLATE_DRAFT_REQUIRED`. This is draft persistence, not publication or
send readiness. They do not create an independent template library.

Conversion uses `designToRendererDocument` and the existing private renderer
client, with subject/preheader read from the locked owner. After rendering, write
and module-read authority are checked again. Any render, projection or receipt
failure rolls back the entire write. Confirmed retries return the old receipt
without rendering again or overwriting subsequent edits. Operation digests bind
the persistence target (`source` versus `template-draft`) so a source-only receipt
cannot masquerade as a projected save. This pre-release contract has no deployed
receipts to migrate.

The asynchronous renderer runs while the owner/head locks are held to avoid
metadata or head drift. This deliberately trades lock duration for atomicity;
a 15-second save-specific render deadline rolls back on `RENDER_TIMEOUT`. The
underlying RPC is read-only and is not cancelled or retried; a late response
cannot resume the rolled-back save. HTTP activation still needs a fresh
server authoriser, version-aware legacy mutation handling and UI revision tokens.
The existing `getAssignedClientIds` uses a five-minute KV cache, and `requireAuth`
may reuse request context; simply calling the current template route's helpers
again would not prove fresh revocation checks. Do not expose these functions via
that shortcut. Publication/asset readiness remains a separate gate.


## Gated HTTP save and legacy-editor compatibility

`PATCH /api/email/design/drafts/:id` consumes the strict F02 `save-draft` action.
For this template-draft slice, both the path and `draftId` identify an existing
`email_design_documents.id`, not the mutable template ID. The document must
already have its legacy baseline and reference an existing template draft. This
endpoint neither creates identities nor backfills on read. It returns the F02
unpublished receipt with the persisted revision timestamp, including on retries.

The Cloudflare binding `FIGFLOW_EDM_DRAFT_SAVES_ENABLED` must equal the string
`true`; default is 404. No binding was configured. The request stream is bounded
before JSON parsing. Session cookies take precedence over Authorization, and
actor, access mode and renderer are all server-derived. Fresh session validation
and uncached role/assignment queries repeat at the transactional checks. CREATIVE
grants structural editing; other non-read-only assigned staff use persisted
content policy. ADMIN/MANAGEMENT grant agency scope; explicit MARKETING_MANAGEMENT
grants active-client access but not shared scope or structural editing by itself.
Missing custom roles and database failures fail closed. This maps existing
permissions only and grants no publication capability.

Migration 491 adds `edm_templates.email_design_revision_id` and a projection
guard. Once the canonical head is structured, source/HTML changes must advance
the projection marker to that head and match its canonical blocks. Legacy writes
cannot silently replace versioned content or promote a draft into a template.
The existing PATCH/DELETE routes translate the owned constraints to a content-free
409 response. Unversioned records retain their current behavior. Versioned subject
and preheader changes still require a future atomic metadata operation; the old
editor must show a conflict rather than lose either copy. Referenced templates
cannot be deleted; archive UX remains unfinished.

Local tests separate mocked HTTP/permission checks from real PostgreSQL guards
and the actual renderer fixture. Production migration, hosted role/session tests,
version-aware read/open/UI, full legacy rollout, proposals and publication remain
open. Do not enable the route on production from these local tests alone.


## Read/open boundary

Kimi implemented `getTemplateDesignDraft(documentId, authorize, db)` with one
joined read of the actual owner, current canonical head and projection. The gated
`GET /api/email/design/drafts/:id` supplies fresh session/scope authorization and
sets `Cache-Control: no-store`. Reads never create a baseline, mutate source,
render HTML or fetch native artifact bytes. Missing identity is 404; a missing
head is 409 and requires a separate explicit initialization operation.

Structured results contain validated canonical source and projection state:
`current`, `stale`, or `unprojected`. Legacy results contain raw snapshot JSON
text to preserve numeric precision and report `unverified`, plus
`ownerChangedSinceSnapshot` from a SQL comparison with the live owner row. None of these states
certifies send readiness. The GET does not return projected HTML. Consumers must
branch on `state` and must not parse a legacy snapshot as canonical design input.
HTTP role/session tests use mocks; PostgreSQL integration tests exercise actual
joins and legacy-to-canonical/current-to-stale transitions without mutations on
read. Working-draft initialization, metadata editing and composer UI remain open.


## Review remediation: legacy conversion

Before the first structured append, the save now compares the locked live owner
row to its immutable schema-0 snapshot entirely inside PostgreSQL. A legacy edit
after the snapshot causes `LEGACY_CONTENT_CHANGED` (HTTP 409), preserving both
live content and history. This also applies to source-only appends so they cannot
bypass the check before a later projection. The comparison includes metadata;
renames or timestamp changes conservatively conflict too. Explicit initialization/
refresh/copy recovery remains necessary before activation; the service does not
silently replace an old baseline. The GET reports legacy drift before a save.

The [Grok review snapshot](reviews/2026-10-31-grok-save-review.md) predates this
fix. Its late-renderer-rejection concern was tested against the actual save:
Promise.race already observes input promise rejections after its deadline wins.
The regression produces a late renderer failure, records no unhandled rejection,
and verifies rollback plus safe retry. No extra renderer retry was introduced.

## Explicit initialization (31 October continuation)

`POST /api/email/design/drafts/initialize` is gated by the same disabled-by-default
flag. It accepts only `{ version: 1, templateId, scope: { clientId } }`, with UUID
identities, no caller-supplied actor, and a 4096-byte streaming JSON limit. It
requires fresh designer authority initially and inside the owner-locked
transaction. Staff content-edit permission alone cannot initialize history.
JSON content type is required; supplied Origin must equal `FIGFLOW_EDM_APP_ORIGIN`
(default `https://app.xeroflow.io`). Staging/local hosts need an explicit origin
configuration. This is an app-origin endpoint, not a cross-origin FigFlow bridge.

Kimi's initializer locks an existing template draft and snapshots it through the
existing legacy helper in one transaction. Concurrent/repeated calls reuse the
identity and current head; they do not replace stale baselines, change template
content, convert native source or publish. The response is a current draft/head
locator, not an immutable operation receipt. GET remains read-only.

Grok's remaining minor review findings are resolved: owner scope changes carry a
named constraint mapped to a copy-required 409; save scope mismatches are masked
as NOT_FOUND. Reads authorize before exposing kind/head state and mask access
denials as NOT_FOUND. Recovery, metadata editing, UI wiring and hosted acceptance
remain open.

Local verification: 232 tests across 16 files pass, including 42 PostgreSQL cases.
New actual database cases cover concurrent initialization, unchanged template
content, current-head preservation and rollback without a partial identity.
HTTP authentication/origin/role tests are mocked. Migration 491 is applied twice
in each synthetic schema; no production database migration or flag activation.

## Shared mutation request guard

Draft initialization and versioned PATCH both use `assertDesignMutationRequest`.
They require UTF-8 JSON, compare any supplied browser Origin with the explicitly
configured app origin, and reject cross-site Fetch Metadata even when Origin is
absent. Server callers may omit Origin, but still need session/Bearer authority.
The guard never derives trust from Host or forwarded headers. Invalid origin
configuration fails closed; HTTP is allowed only for explicitly configured
localhost development. Both routes return `Cache-Control: no-store`, including
errors and disabled-feature responses. Neither endpoint is a cross-origin
FigFlow bridge or a substitute for the planned short-lived bridge grants.

The gate runs before session, body parsing and storage work. Request bodies still
use the bounded streaming reader; initialization is limited to 4096 bytes, while
save retains the F02 envelope byte limit. Byte accounting and fatal UTF-8 decoding
apply across chunks, and oversized streams are cancelled. These local request
checks do not establish browser integration or hosted authorization acceptance.

## Initialization review follow-through

Grok's [initialization review](reviews/2026-10-31-grok-initialization-review.md)
identified that repeating initialize after a legacy edit returned its original
locator without surfacing drift. The initializer now checks the schema-0 snapshot
against the locked live row in SQL and returns `LEGACY_CONTENT_CHANGED` (409).
It never replaces the baseline. Unit and PostgreSQL regressions failed before
this fix and pass afterward. Structured-head repeats remain unchanged.

Final local checkpoint: 273 tests across 17 files, including 43 PostgreSQL cases,
and lint pass. Remaining minor review items are explicit schema/origin fields on
the locator and authorizing before template-kind classification under lock.
The route's admission authority still applies, and GET returns typed source state.
These are tracked before activation in the plan. Subject/preheader atomic revision
editing is the next independent slice; the review contains its proposed contract.

## 1 November metadata implementation

Added migration 492 for immutable revision subject/preview fields and a matching
projection guard. `saveTemplateDraftMetadata` requires a structured template draft,
full nullable subject/preview values (maximum 300 characters each), expected head,
operation ID and declared scope. It copies the canonical payload text verbatim,
renders with the requested metadata and atomically advances revision, owner
metadata/HTML/projection and receipt. It retains null versus empty string.

The distinct `template-metadata` receipt target is independent of ordinary design
save hashing. Replays recheck current authority, including module access, and
return the original receipt without rendering or moving the head. Renderer or
post-render authority failure rolls back. Ordinary design saves now snapshot the
locked owner metadata on their revisions, so the new trigger and saver must ship
together. Old PATCH cannot bypass the projection marker. Earlier schema-1 rows
are not rewritten to fabricate historical metadata.

`PATCH /api/email/design/drafts/:id/metadata` uses the same disabled flag, JSON/
origin gate, 4096-byte stream cap and no-store headers. It derives the actor from
the session, allows fresh scoped staff write authority, and accepts no replacement
design. No composer controls are wired yet. Migrations 491 and 492 were applied
twice to each synthetic PostgreSQL schema; production migrations remain pending.

Kimi closed both initialization review findings: authorization precedes kind
classification and the result includes schemaVersion/origin from the exact locked
head. PostgreSQL verifies both legacy and structured initialization results.
Combined local checkpoint: 18 files / 287 tests, including 49 PostgreSQL cases,
on repository Node 24.18.0. The metadata slice is awaiting independent review.
