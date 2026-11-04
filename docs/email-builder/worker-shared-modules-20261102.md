# F04/F07 shared modules and registered image authority — 2 November 2026

## Scope and source

Worker task `task_b69f0ef29864`, dispatch `ctx_ed7292c3939a`, in `adme-dev/figflow-designer-authority-20261102`. Started clean at `281f3fa9b` (the prior designer-authority commit), based on freshly fetched `origin/main` `c4798624548704fec493418b53952ad52ddfc3eb`; starting divergence was one owned commit ahead, zero behind. The implementation commit and exact file list are reported in the worker completion receipt.

Implemented server contracts and focused local verification only. No production database, provider, send, upload, deploy, dependency install, Rust build, full Nuxt build, or external message was performed. The parent owns integration, UI, feature marketing pages, runtime/configuration/source pins, CI, actual database application, deployment and native/hosted acceptance.

## Existing owners retained

- `edm_custom_modules` remains the one module library. New publications create a row there; revisions retain the same module ID. The existing list exposes `design_document_id`, `head_revision_id`, and `revision_schema_version` alongside its existing metadata. Unversioned old rows and their IDs remain intact.
- `email_design_documents`, `email_design_revisions`, and `email_design_revision_receipts` own module/draft content and operation receipts. New modules atomically establish the schema-0 baseline required by migration 491 and then append their schema-1 successor; no trigger was weakened.
- Existing `/api/agency/email/assets/upload` and `banner_assets` remain the upload/storage/library path. The registered row's actual `client_id`, `uploaded_by` and uploader-scoped R2 key determine asset ownership. There is no asset-to-project FK to join, so no project ownership is invented from a URL or client assertion.
- Existing send/preflight gates remain untouched. Module validation does not require a subject or footer, so a hero can publish independently; assembled campaign send acceptance remains a separate stage.

## Authority and transaction behavior

Publication requires a freshly validated session and current agency `ADMIN` or `MANAGEMENT` **plus** `CREATIVE`. Ordinary client-scoped `CREATIVE` can operate on authorised drafts but cannot publish modules or register published assets. All scopes are derived from stored source/target rows; JSON carries no actor, role, asset manifest, source document or destination scope authority. Source read access and destination designer/publisher rights are checked independently and again after asynchronous work before revision effects.

Module publication locks the saved source draft/owner and checks the exact expected head and current source projection. Publication and revision preserve source scope; they cannot widen client content into shared scope. Revising a module requires its current immutable head. A selected fragment must be a closed tree and must include every selected linked instance in full. Persisted policy/locks and lineage are retained, and actual local content differences must be explicitly enumerated in `includedOverridePaths` before they can be baked into another publication.

Transactions use `transactionWithoutRetry`. Advisory locks bind an actor/operation identity; a canonical digest binds the complete action, target and metadata to its receipt. After an unknown acknowledgement the caller must reconcile the **same operation ID and payload**, without automatically issuing another effect. Exact duplicates return the original immutable revision even after a head moves; conflicting reuse fails. This is a persistence/publication receipt, not hosted, native, storage-availability-for-life or send acceptance.

## HTTP/API contract

All new routes require the existing `FIGFLOW_EDM_DRAFT_SAVES_ENABLED` and `FIGFLOW_EDM_DESIGNER_ENABLED` gates **and** the separate `FIGFLOW_EDM_LIBRARY_ENABLED === 'true'`. This worker did not enable or add runtime configuration for any gate. Mutations use the existing bounded JSON/origin boundary; replies are private/no-store and unexpected errors are content-free.

`POST /api/email/design/modules` uses strict version-1 envelopes with `operationId`, `draftId` (canonical document ID), and `expectedDraftRevisionId`:

| Command | Additional fields | Effect |
| --- | --- | --- |
| `publish-module` | `name`, `category`, `description` (nullable), `previewTone`, `includedOverridePaths`; optional `rootBlockIds` | Publish saved current draft layout children, or the selected closed subtree, into the existing library |
| `revise-module` | Same publication fields, plus `moduleId`, `expectedModuleRevisionId` | Append a new immutable revision of that scoped library identity |
| `insert-module` | `moduleId`, exact `revisionId`, `parentId`, `index`; optional `columnIndex` | Expand that immutable revision with fresh instance/block/node/field IDs and inherited policy |
| `update-module-instance` | persisted `instanceId`, exact selected `revisionId`, `overrides: 'preserve' \| 'discard'` | Explicitly replace only that instance; retain local changes or intentionally discard them |
| `detach-module-instance` | persisted `instanceId` | Remove provenance/pins while preserving exact content, lineage and restrictions |
| `insert-published-image` | registered `assetId`, `parentId`, `index`; optional `columnIndex` | Verify published scoped bytes and insert the canonical signed image reference |

Draft operations return `{ documentId, revisionId, published: false }`. Publications additionally return `moduleId` and `published: true`. The parent must retain complete requests for unknown-outcome reconciliation.

`GET /api/email/design/modules/:moduleId/:revisionId` selects that exact immutable schema-1 revision and validates its scoped dependency closure. It never substitutes the mutable head.

`POST /api/email/design/assets/publish` accepts only `{ version: 1, operationId, assetId }`. It verifies registered ownership, reads bounded actual storage bytes, sniffs PNG/JPEG/GIF MIME and header dimensions, compares registered byte count/MIME and derives SHA-256. It freezes the descriptor on the existing media row and commits an asset operation receipt. Descriptor/manifest strings supplied by the browser are rejected. This is header inspection and digest verification, not full image decoding or a malware certificate.

## Pins, updates, local overrides and legacy integration

Repeated insertion allocates a separate namespace per instance and checks minted block/node/field identities against the whole destination. Structural insertion into another pinned instance or an explicitly locked parent is refused. Transitive immutable dependencies are retained; an inserted outer module owns its expanded subtree while its immutable source carries nested pin closure. Head publication never loops over referencing documents.

Local overrides are derived from actual persisted field values against the exact old pinned source; stale recorded overrides cannot resurrect content that staff restored to baseline. Preserve-update fails visibly if a local field or its permission disappears. Discard requires explicit intent. Preserved image URL overrides are independently resolved to registered published assets before the new draft is saved; source publication is not authority for an arbitrary later URL. Detach preserves inherited restrictions rather than resetting permissions.

Legacy module metadata PATCH/DELETE rejects versioned entries with `immutable_module_revision_required`; the DB layer also conditionally excludes canonical identities. Old unversioned rows retain their prior CRUD behavior. The parent must route canonical list entries through these explicit operations: old client-only fragment insertion cannot preserve revision pins or inherited policy and is not a canonical insertion acceptance path.

## Additive migration for the parent

Apply `server/database/migrations/495_email_asset_publication.sql` after the existing 491–493 canonical foundation, before serving the updated asset list or enabling library routes. **Not applied by this worker**, as explicitly assigned to the parent.

The existing schema expresses module pins and module receipts already. Standalone image publication cannot use a receipt whose FK requires a design-document revision, so 495 adds one `banner_assets.email_publication` descriptor and a small immutable `email_asset_publication_receipts` table. It protects published media storage/tenancy identity and deletion while allowing ordinary display metadata changes, and prevents a versioned module's projected blocks from diverging from its canonical head. Existing asset deletion deletes the DB row before deleting storage, so this restriction prevents that path removing a published object. Storage can still be changed outside these application contracts; byte hashes are rechecked on image/module admission.

Migration SQL was source-reviewed; its PostgreSQL triggers/locking have not been executed or certified by this worker. The parent should run isolated PostgreSQL migration and concurrency acceptance before hosted enablement.

## Explicit limits and next acceptance

- Uploaded media already has token-public signed delivery before email publication. Registration is **not private staging** and does not change that route's public-read semantics.
- The storage adapter requires actual `MEDIA_BUCKET.get` and signing capability on hosted requests, or configured durable S3/R2 storage locally. It rejects ephemeral local-file fallback. Missing capability fails visibly with storage-unavailable errors; no arbitrary URL is fetched.
- No durable native `.figcraft` blob staging/ownership adapter exists here. A source declaring an opaque native artifact fails `NATIVE_ARTIFACT_STORAGE_UNAVAILABLE`; reconstructible structured module sections use `nativeArtifact: null`. This task does not certify opaque native persistence.
- New publication/image admission supports the explicitly mapped structured blocks. Legacy/custom HTML and background/native image effects without verified reference mapping fail `ASSET_NOT_READY` instead of treating embedded URLs as authority. Existing unrelated draft blocks remain intact during explicit module operations.
- Existing ordinary content handoff still rejects module/asset-bearing sources. The separate designer mode can preserve and lock expanded canonical module subtrees; actual native Rust import/return acceptance remains parent/Kimi-owned and unproven here. No designer endpoint, six-operation `DesignerOperation` vocabulary or existing canonical writer file was changed in this dispatch.
- Legacy rows without a canonical head remain legacy; `revise-module` requires an established current revision, rather than silently converting a mutable row from browser JSON.

Parent next steps: apply/validate 495 in the authorised database workflow; integrate canonical list selection/operation controls and public feature documentation; retain requests across uncertain outcomes; run actual scoped UI/native asset/module flow with unchanged campaign send gates; keep hosted gates disabled until those checks pass.

## Verification evidence

Node `v24.22.1`. Final focused Vitest run: **8 files, 68 tests passed**, including module publication/append and legacy baseline behavior, immutable old revision reads, duplicate and conflicting requests, unknown-commit reconciliation, stale source/target heads, denied/revoked scope, repeated lineage allocation, local preserve/discard/review/detach semantics, source policy inheritance, URL/manifest rejection, registered byte/ownership checks, image insertion, and preserved image-URL override rejection. The transaction adapters exercise the real services and canonical renderer with synthetic state; they do not prove PostgreSQL triggers or hosted concurrency.

```sh
pnpm exec vitest run \
  test/unit/emailDesignModules.test.ts \
  test/unit/emailDesignModulePersistence.test.ts \
  test/unit/emailDesignAssets.test.ts \
  test/unit/emailDesignLibraryHttp.test.ts \
  test/unit/emailDesignAccess.test.ts \
  test/unit/emailDesignDependencies.test.ts \
  test/unit/emailDesignDesignerPersistence.test.ts \
  test/server/edmCustomModules.test.ts
```

Focused ESLint over all 17 touched/new TypeScript sources/tests passed. Scoped TypeScript compiler diagnostics for the nine new/changed library/server source entrypoints, using the existing generated `.nuxt/tsconfig.server.json` compiler options, were zero; this is not a repository-wide typecheck. `git diff --check` passed. Existing Vite emits its configuration warning about future native-loader support for `__dirname`; it did not fail tests.
