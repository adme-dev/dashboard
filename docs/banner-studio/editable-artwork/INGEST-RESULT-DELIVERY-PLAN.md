# Scoped Dissector result delivery and export plan

Status: design prerequisite only; no application implementation or release acceptance. Coordinator accepted the no-DDL private-namespace approach on 28 October 2026 (local time). This worker owns only this document. The coordinator owns ingestion, the jobs wrapper, pipeline, import and UI context integration; proposed delivery/export ownership below is for a subsequent dispatch.

## Decision and security boundary

Use the existing `banner_assets` row, a new server-owned append-only `banner_dissections.manifest.delivery` registry, and distinct private object keys for **new client/project-scoped Dissector outputs**. No database migration is required. Serve those objects through an authenticated job-bound route that checks current authority. Preserve legacy `banner-assets/...` signed capabilities and managed QR behavior exactly; neither a populated `client_id` nor a changed URL establishes protection.

For scoped PNG/JPG/GIF/HTML exports, load the saved canvas at an explicit revision, authorize every source job, and embed privately read image bytes in server-generated HTML. Use the existing renderer binding without giving it user cookies, storage credentials or new public capabilities. Persist raster source dependencies beside each new scoped export in private R2, then reauthorize those dependencies on every download. HTML is generated and returned by the same authorized server path.

This prevents **new server-mediated reads/exports after revocation**. It cannot erase images already decoded in an open tab, bytes already delivered to a caller, previously downloaded PNG/GIF files, or an offline HTML export. An authorized offline export is a disclosure of its embedded bytes. Revocation takes effect at the final fresh authorization boundary before a response/renderer/storage effect; it cannot retroactively cancel bytes already sent. Do not advertise DRM or instantaneous removal from existing browsers.

Scope admission stays disabled until delivery, saved-canvas export, retained-export authorization, and storage bypass gates below pass together. An explicit rejected/unsupported scoped operation is acceptable for nonessential transformation/publishing paths; silently making a public copy is not.

## Evidence and current behavior

Read-only inspection of the original shared `banner-editable-artwork` workspace on 28 October 2026. Read `AGENTS.md`, `CLAUDE.md` and [OWNED-INGEST-PLAN.md](OWNED-INGEST-PLAN.md), including its PNG-only correction. No Git commands, tests, database operations, provider calls, browser requests or sibling edits were performed. The workspace is actively shared; hashes below identify inspected files, not an isolated release candidate. No claim about current remote main or hosted bucket privacy is made.

| Source | Observed behavior and implication |
|---|---|
| `server/utils/bannerDissectorPipeline.ts:183` (`persistLayer`) | Generates an asset UUID and ordinary `banner-assets/{uploader}/{randomUUID}/...png` key; calls `bannerAssetDeliveryUrl`, uploads, inserts `banner_assets` with uploader/tags, then writes key/URL into the model artwork. No job FK, `client_id`, immutable output registry or scoped delivery policy. Attempt checks protect execution generation, not subsequent asset access. |
| `server/utils/bannerStorage.ts:72–180` | v1 signed token contains only asset UUID and has no expiry/session/client. Native `uploadBannerAsset` explicitly requires a public signed URL and the legacy storage-key shape. Do not relax its allowlist to accept private keys. Add a scoped writer separately. |
| `server/api/public/banner-assets/[token].get.ts:172–285` | Validates token, cached asset-row lookup, uploader/key shape; no actor/job/assignment check. Returns HEAD/ranges/304 as well as bytes, with `private, max-age=300, must-revalidate` and wildcard CORS. New scoped keys already fail the current legacy key validator; preserve that rejection explicitly. |
| `server/database/migrations/026-banner-studio.sql`, `034-banner-dissector.sql`, `167-email-client-scoped-assets.sql` | Asset row has key/URL/uploader and nullable client; dissection row has immutable original locator, user, JSONB manifest, and an import-destination `project_id`. There is no generic banner-asset metadata column. `176_video_assets_metadata.sql` applies to video assets only. |
| `server/utils/banner/dissectionJobs.ts:95–108,235–271` | Retry replaces root metadata except `source`; progress replacement merges `source` from persisted row; model artwork is allowlisted. New `ingestion` and `delivery` need preservation on every whole-root replacement, not just upload. |
| `server/api/agency/banner-studio/dissect/[jobId]/import.post.ts:60–120,168,259` | Existing destination authorization/revision/QR checks; copies `dl.r2_url` into canvas `src`. It writes import receipt into the job. Source job ownership and output provenance must survive this transaction and later imports/reloads. Import destination is not source ownership. |
| `app/composables/useBannerStudio.ts:559,586,650`; `app/components/banner/Artboard.client.vue`; `layers/Image.client.vue:14–25`, `layers/Bg.client.vue:11–40` | Saved JSON is restored directly; image/background components render `src` in `<img>`, with optional feed overrides. A same-origin authenticated image URL works without renderer changes. Saved raw/public URLs would remain a bypass. |
| `server/api/agency/banner-studio/projects/[id].get.ts`, `[id].patch.ts`, `[id]/duplicate.post.ts`; `versions/restore.post.ts` | Current target-project checks do not establish source-job access. Canvas snapshots/copies/restoration preserve sources and must not reset provenance. Destination client changes are allowed today; source ownership must stay frozen. |
| `server/utils/social/clientAccess.ts`; `roleResolver.ts:14–75`; `auth.ts:82–113,200–237` | Existing social policy combines CREATIVE/CLIENTS/MEDIA_BUYING permission with assignment and ADMIN/MANAGEMENT all-client behavior; user-private project access uses creator/all-client policy. Assignment queries and role resolution have caches; role resolution falls back on failure. Reuse the intended policy with fresh DB reads and fail closed for scoped results. `requireAuth` remains session authentication, not sufficient authority evidence by itself. |
| `app/components/banner/BannerExportModal.client.vue:151–195,229–240,310–325` | HTML is downloaded locally or zipped from browser-generated HTML. Raster/GIF endpoints receive caller-generated HTML. Merely changing imported `src` breaks unauthenticated export fetching and leaves local HTML export without a fresh server gate. |
| `server/utils/banner/exportRendering.ts:229–297`; image/GIF API wrappers | Authorizes destination project, renders caller HTML, writes `banner-raster-exports/{project}/{id}.{type}`, records private download URL. No immutable source dependency list or recheck after renderer completion. |
| `workers/banner-renderer/src/resourcePolicy.ts:38–64`, `render.ts:126–151` | Only approved resources, signed public asset routes and data images/fonts are accepted. Fetch uses `credentials: 'omit'`, redirects are rejected, and cookies/caller headers are not forwarded. Private-byte embedding is compatible with current policy. |
| `server/utils/banner/htmlBuilder.ts:198–283`; `app/utils/banner-html-builder.ts:221–283` | Parallel builders interpolate image/background sources. Server builder supports absolute source resolution. Use it on a cloned authorized saved canvas; never globally rewrite the app builder or all legacy URLs. |
| `server/utils/banner/exportDelivery.ts:42–91` | Private no-store raster download joins current project and validates exact raster key/type/size. It knows nothing about originating jobs; losing source access while retaining destination access currently would not revoke an exported raster. |
| `server/utils/storage.ts:63–88,194–253,463–498` | Existing native/S3 storage supports custom metadata and HEAD metadata. Local filesystem upload discards metadata and emits `/api/_uploads/...`; generic metadata getter cannot prove local metadata. A new DB column is not forced by absence of asset metadata. |
| `server/api/_uploads/[...path].get.ts` | Public local read serves arbitrary stored keys with public caching. New scoped namespaces must be denied here, including provenance companions. Do not use its URL as a scoped fallback. |
| `wrangler.toml:180–181`; `storage.ts:255–258,507–509` | MEDIA_BUCKET is `agency-files`; storage supports `R2_PUBLIC_URL`. Source does not prove the bucket lacks an r2.dev/custom-domain read path. A private key prefix is not an ACL on a public bucket. |
| `app/composables/useMergeLayers.ts:63–101`; `ai/edit-layer.post.ts:65–111`; `exports/upload.post.ts`; `publish.post.ts` | Merge flattens browser pixels and reuploads ordinary assets; AI edit fetches a supplied URL and writes ordinary assets; opaque ZIP upload and publish accept caller bytes/HTML. These must not become supported laundering paths for scoped content. |
| `server/utils/banner/platformQrCanvas.ts:88–119` | QR verification compares exact asset URL, `banner-assets/` key, client and signed attestation tags. QR `client_id` does not mean scoped Dissector provenance. Existing QR checks, identity, URL, metadata and tags must remain intact. |

Inspected SHA-256 anchors:

```text
bannerDissectorPipeline.ts       d0f6530a3bf679b4173891a6d1444ee279d61c1e90670e834a208660a22f2900
banner/dissectionJobs.ts        eae831a8e2077eb7a9be65643051fff6a0b5fb3f86dbb53a5bfce031cd0c957d
public/banner-assets route      8884e812a6cd1e5ff66855849c6d9f1cbb143607a74591422ae4e8de23e77078
banner/exportRendering.ts       68fd95797b9042c263c8d97b346ade1fe92cc8b6cf2a1331d121da64e78b79d3
banner/exportDelivery.ts        545d2f0dc3720fb84748fc46db926e4e87040678969ab540eb7f94e034a8cb9d
storage.ts                     05a591475c288a53f000c01f54395309421a16ed5a27302cecb06f9fcafa45dc
```

## Storage/provenance choice: zero DDL

Three existing locations were considered:

1. **Job manifest JSONB:** chosen for immutable source ownership plus append-only output identity. It already survives job lifetime in the same database. New scoped keys encode the job UUID for an indexed `job_id` lookup; no scan of every manifest or new JSON index is needed.
2. **R2 metadata:** available and suitable for small fixed lineage records, but not currently implemented consistently by the local adapter; an unbounded list cannot be put there. No need to add `banner_assets.metadata` just to copy facts already held by the job. The coordinator selected a bounded private JSON companion for export lineage, avoiding a metadata-adapter dependency in this increment.
3. **New asset FK/export provenance table:** valid future optimization for independent relational retention/queries, but unnecessary for this bounded design. A nullable asset FK alone does not protect derived raster/HTML copies. Do not allocate a migration number or speculate historical ownership from today's client or old URLs.

The immutability contract is server-enforced, like existing `manifest.source`: callers/models cannot supply or replace these facts; all known write paths must preserve them. This is not a claim that arbitrary database administrators or bucket credentials cannot mutate them. Content identity checks catch accidental/wrong-object replacement.

New keys and outward locator:

```text
scoped-dissection-assets/{jobId}/{attemptId}/{assetId}.png
/api/agency/banner-studio/dissect/{jobId}/assets/{assetId}

scoped-banner-exports/{projectId}/{exportId}.{png|jpg|gif}
scoped-banner-exports/{projectId}/{exportId}.provenance.json
/api/agency/banner-studio/exports/{exportId}/download
```

All IDs are normalized UUIDs generated/validated server-side. No filename, URL, queue payload or layer ID chooses authority. Asset DB `r2_key` and the job registry must agree exactly. Scope selection is `manifest.ingestion.owner.kind === 'client' || 'project'`, with valid authoritative source/ingestion records, not `client_id != null`. Legacy/unbound verified-source jobs stay on their existing compatibility path; present malformed/unknown ingestion metadata fails closed.

Proposed types, in `shared/bannerDissectionDelivery.ts` (pure schemas/types only):

```ts
type ScopedDissectionAsset = {
  assetId: string; attemptId: string; key: string;
  mimeType: 'image/png'; byteLength: number; sha256: string;
}
type DissectionDelivery = {
  version: 1;
  assets: Record<string, ScopedDissectionAsset>; // key must equal assetId
}
type ScopedExportProvenance = {
  version: 1;
  exportId: string; projectId: string;
  projectOwnerId: string; clientId: string | null;
  sourceRevision: string;
  key: string; mimeType: 'image/png' | 'image/jpeg' | 'image/gif';
  byteLength: number; sha256: string;
  sources: Array<{ jobId: string; sourceSha256: string }>;
}
```

Bound registry entries to 300 per job across all attempts and the companion to 16 KiB/32 distinct source jobs. These are proposed conservative implementation limits, not existing product guarantees; validate the registry cap against admission's layer limit before enabling scoped jobs. Never evict old entries to make room. Exceeding a limit rejects the operation. Deduplicate source job IDs server-side. Retain registry entries through retry/cancel/import and through asset deletion as non-readable tombstones; the asset row/object must still exist for a read. Removing a dependency from today's canvas must not erase it from yesterday's raster provenance.

Source job deletion or missing/malformed metadata denies dependent reads. Existing expiry must not remove ownership/registry. Do not require a historical registered asset to match the job's *current* attempt: saved canvases may reference prior registered outputs. Active-generation checks govern creation, whereas frozen provenance/current access govern later reads.

## Exact interfaces and implementation slices

### A. Coordinator: register scoped output atomically

Files: `bannerDissectorPipeline.ts`, `banner/dissectionJobs.ts`, shared source/ingestion types, `dissect/[jobId]/import.post.ts`, and the ingestion authority helper from OWNED-INGEST-PLAN.

- Extend the existing authoritative job type with `delivery?: DissectionDelivery`. Preserve `source`, `ingestion`, `delivery` from the DB row during retry/progress/import root writes; never merge these from a model/caller manifest. Keep public snapshots narrowly projected rather than returning the internal registry.
- Add `registerScopedDissectionAsset(db, jobId, expectedAttemptId, asset)` under job row lock. Freshly reauthorize the stored uploader and frozen ownership, require the active attempt, then atomically insert the asset row and append the registry entry. Reject redefinition of an existing asset ID/key/hash. Set catalogue `client_id` from frozen ingestion for usability only.
- Persist bytes at the unique private key before registering, with bounded put/head/size/hash evidence; never mint a signed URL. Commit row+registry before publishing the asset reference. A registered output's registry/row/key identity must be complete even if later progress acknowledgement is lost.
- Introduce a scoped writer in `server/utils/banner/dissectionDelivery.ts`; do not broaden `uploadBannerAsset` or the public key validator. Reuse request-owned native storage. Storage/SQL uncertainty requires fresh read-only reconciliation; do not delete a possibly committed registered object or retry a put/insert blindly.
- Return `{ key, url, size, assetId }`; `url` is the relative authenticated route. Import preserves that URL and an optional typed `dissectionAsset: { version: 1, jobId, assetId }` layer reference. The typed field improves validation but is not authority: the asset row plus registry are authoritative even if a caller removes/forges the field.
- Retain import's expected revision, result/receipt replay and QR guards. No rebinding to destination project/client. A cross-client destination is rejected; a source project owner/client reassignment invalidates historical source access even if the target remains accessible.

### B. Delivery worker: byte authority and catalogue projection

New `server/utils/banner/dissectionDelivery.ts`:

```ts
resolveScopedDissectionAsset(event, actor, { jobId, assetId }, mode)
  // => validated asset row + registry entry + frozen ingestion
readScopedDissectionAsset(event, actor, ref, { maxBytes })
  // => verified PNG bytes; no URL fetch
assertScopedCanvasSources(event, actor, savedCanvas, targetScope)
  // => canonical refs/dependencies, or deny; does not mutate saved canvas
```

Use the coordinator's `assertDissectionAccess` fresh policy, not a second authorization implementation. Preserve uploader-only job/result access plus existing permission/assignment requirements; client membership does not grant every colleague another user's dissection. Any later sharing policy is separate authorization work. Re-read active user, session revocation, configured role permissions, current assignments, source project creator/client and client existence. Match frozen scope. No cached authorization fallback on SQL error or custom-role lookup failure. Respect established read/write policy rather than inventing a new role list; exports require write access, image reads require read access.

New `server/api/agency/banner-studio/dissect/[jobId]/assets/[assetId].get.ts` and explicit HEAD route sharing one handler:

1. Authenticate and validate IDs; fresh-load row/registry and authorize before object metadata/bytes or conditional responses.
2. Exact equality: route IDs, row ID/uploader/key, key-derived job/attempt/asset IDs, registry entry and immutable source metadata. Do not accept caller `r2Key`, `clientId`, URL, signature, or target-project access as a substitute.
3. Bounded private read (10 MiB maximum derived PNG); check MIME/size/hash against registry. Fresh authority check immediately before release. Return whole object for GET, metadata only for HEAD; ignore Range/conditionals as existing private raster delivery does, and never return unauthorized 304/206.
4. Set `Cache-Control: private, no-store`, `Vary: Cookie, Authorization`, `Cross-Origin-Resource-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. No wildcard/credentialed CORS. Apply no-store to errors too. Generic 404/403 and content-free errors; DB/storage uncertainty gives 503 without fallback.

Existing boundaries to amend/test:

- `server/api/public/banner-assets/[token].get.ts`: retain legacy behavior; explicitly reject scoped storage keys even when a valid legacy token is manufactured for a scoped asset ID. Never sign/redirect private objects into the public path. Use fresh classification lookup where needed.
- `server/api/_uploads/[...path].get.ts`: reject both scoped namespaces after canonical path parsing, including encoded/slash/traversal aliases, before filesystem read. Do not rely on `replace(/\.\./g, '')` for this new exclusion. No local public fallback.
- `assets/index.get.ts`, `[id].patch.ts`, `[id].delete.ts`: retain legacy semantics, but identify scoped rows by DB-owned key and enforce source-job policy for scoped catalogue reads/mutations. Scope filtering must happen before pagination, not after loading a page. Return only the private URL, no private raw key, and preserve registry identity when editing name/tags. Public deletion is not permission to erase provenance.
- Project read/save/copy/version restore and template reuse: canonicalize/validate scoped refs against DB identity, including private locator aliases. A saved `src` remains a locator; no authorization bit is trusted from JSON. Reassignment cannot convert private assets to legacy ones. Missing asset/job/registry fails closed. Preserve QR validation independently.
- `layers/Image.client.vue`, `layers/Bg.client.vue`: keep direct same-origin `src` loading. Show a clear inaccessible-result state on failed reads; no retry to signed/public/raw URL. Never persist a loaded data/blob URL into saved scoped layers. Scope/session changes clear temporary preview/object URLs where the application owns them.

### C. Export worker: saved-canvas server construction

New `server/utils/banner/scopedExport.ts`, reused by `exportRendering.ts` and new `export-html.post.ts`:

```ts
type SavedScopedExportRequest = {
  projectId: string; sourceRevision: string;
  formatKeys: string[];
  // existing validated output options: format/quality/jpgQuality/fps
}
prepareScopedBannerExport(event, actor, request)
  // => server HTML items + immutable dependencies + frozen target scope
assertScopedExportStillAuthorized(event, actor, prepared)
```

1. Fresh-load saved target canvas and scope; require current target write access and exact `sourceRevision` equality. Reject missing/changed revision with 409. No automatic silent save. Format dimensions, layers, playback, and renderable content come from that saved snapshot; accept only enumerated output options and keys from the request. Do not accept HTML, base URL, dependency list, layer data or arbitrary asset substitutions in scoped mode.
2. Walk every supported resource-bearing field in the selected formats, including image/background source, text textures, nested/grouped content and feed overrides. Resolve private refs via DB row+registry even if typed layer metadata was removed. Preserve legacy public/QR resource URLs. Reject unsupported dynamic source replacement or script/custom-HTML surfaces in scoped mode rather than pretending a regex over HTML finds all sources. Validate saved field shapes before feeding the builder.
3. Authorize **all** scoped sources before the first private byte read or renderer call. Enforce frozen source/destination client compatibility; no target-only authorization. Bounded-read/hash-check private PNGs directly from the request bucket; replace their sources in a cloned canvas with `data:image/png;base64,...`. Do not store embedded bytes into project JSON, versions or shared templates.
4. Call `server/utils/banner/htmlBuilder.ts::buildBannerHTML` with canonical application base URL and saved playback. Preserve existing QR identity, layout, animation, crop, text and pinned-font behavior. Server/app builder parity tests apply. No user credentials go to the renderer, and its resource policy remains unchanged.
5. Existing renderer limits still apply after base64 expansion: 2 MiB HTML/item, 6 MiB/request, four items/RPC, plus existing side/pixel/GIF limits. Precompute expanded size before allocating full base64; reject with a clear size/unsupported error. A 10 MiB source allowance does **not** establish exportability. Do not raise memory/renderer limits to force acceptance.
6. After rendering/HTML building, recheck fresh source and target authority plus the captured project revision before first output persistence/response. A mid-render revocation discards results and returns no download. Recheck before each independent batch's effects; no DB lock held through long renderer work.

`export-image.post.ts` / `export-gif.post.ts` and `exportRendering.ts`: add the saved-canvas request branch. Existing HTML requests for a project whose saved canvas contains scoped refs must be rejected, including attempts to omit/remove an optional caller scope flag. Legacy projects retain their old request contract. Arbitrary caller HTML on a legacy project cannot retrieve scoped bytes because renderer fetches remain unauthenticated and public delivery rejects private keys.

`BannerExportModal.client.vue`: for scoped projects require saved revision and send only canonical saved-canvas request; apply to single/bulk PNG/JPG/GIF and HTML/ZIP. Use a server-derived scope signal for UI routing, but server independently classifies saved content. A missing/stale signal cannot bypass checks. Reject unsaved edits with Save first/Save changes guidance. Remove the local HTML-build/download path for scoped outputs; keep it for legacy projects.

New `export-html.post.ts`: same saved-canvas preparation, dependencies and final fresh checks; return attachment HTML or bounded ZIP generated server-side with no-store. Scoped image bytes are embedded, so the downloaded file makes no private asset requests and requires no session cookie. Never persist or auto-publish this HTML to a public bucket. Legacy external fonts/GSAP behavior remains; embedded private images do not imply a fully offline font/script package.

### D. Retained raster download must retain original dependency scope

In `exportRendering.ts`, write scoped output to `scoped-banner-exports/...` with an immutable `ScopedExportProvenance` companion, unique per generated export ID. Write both private objects and verify their existence before recording `banner_exports`; the existing `r2_key`, URL, type, size, project and exporter columns suffice. Store only source identities/scope/hash in provenance, never credentials or image content. Do not reuse a key to rewrite bytes or change provenance. If either object is missing or persistence acknowledgement is uncertain, return no success and reconcile using exact IDs; no blind replay or destructive cleanup of possibly recorded output.

`exportDelivery.ts`: classify by DB-owned key; legacy raster keys keep existing path. Scoped keys require exact companion path/schema/size, matching export ID/project/key/type/size and frozen project creator/client. Reauthorize every companion source job against its immutable source SHA and current authority even if today's canvas has removed it. Match current destination scope to frozen export scope as well. Reject absent/malformed/oversized/unknown-version provenance; never downgrade to legacy or target-only authorization.

Read the bounded companion without exposing it, then authorize before reading output body. Validate whole output size/hash against provenance within existing 20 MiB maximum, then recheck authority before returning. HEAD checks provenance/authority too; it returns no body. Do not return 304/206 shortcuts. Reuse private no-store download URLs and list projections (`exports/index.get.ts`) without raw keys/companions. Revocation of a source job must invalidate a still-saved export even when its target project remains accessible.

## Necessary bypass closures and bounded exclusions

- **Hosted bucket privacy:** prove scoped originals, derived PNGs, export bytes and companions cannot be obtained from r2.dev/custom domains/other generic download handlers. MEDIA_BUCKET source configuration alone cannot prove this. If `agency-files` is public, a prefix is insufficient: select a dedicated private request binding for scoped storage before admission. Do not disable public access globally and break legacy/QR assets. Binding policy must fail closed; never choose a fallback bucket based on absence. No provider/bucket change is authorized by this document.
- **Local storage:** simplest first slice supports a real private native/S3 adapter and fails closed without it. Do not route scoped data through `uploadFile`'s public local-filesystem fallback. If local disk support is implemented, it needs dedicated private reads plus the generic-route denial, including provenance records.
- **Transformations:** Merge Layers, AI edit/decompose, lettering repairs, thumbnail flattening and similar pixel-to-new-asset operations must either carry immutable source dependencies and use protected output storage or be explicitly unsupported for scoped layers in this increment. Disable the UI operation and reject identifiable scoped source/project inputs server-side. Client-side disable alone is not an authorization boundary. A user deliberately reuploading bytes already delivered to them cannot be prevented by this design and is outside its revocation promise.
- **Publishing/opaque uploads/video:** `publish.post.ts`, `exports/upload.post.ts`, `variants/upload.post.ts`, ad-publish routes, MP4 export and custom-template/export flows must not be offered as scoped result paths until they carry provenance. Reject scoped project inputs before accepting caller HTML/files or making provider/storage effects; continue legacy paths. Public publishing of protected content needs a distinct disclosure policy. No provider work in this slice.
- **Snapshots and previews:** no public flattened thumbnails for scoped canvas. Use a placeholder initially or a separately authorized derived-preview path. Copies/templates/version restore retain canonical scoped locators and source access requirements; they do not mint new public assets. All browser-visible previews remain session-bound until explicitly exported.
- **Content already disclosed:** old signed assets remain signed assets; do not retroactively infer their client ownership, rotate their tokens, or promise revocation for historical exports. No backfill from names/tags/URL shape alone.

## Negative tests and compatibility evidence

These are future tests, not tests run by this planning worker. Extend existing suites rather than replacing their assertions.

| Boundary | Required assertions |
|---|---|
| Registry lifecycle | Real PostgreSQL tests in `test/server/utils/dissectionJobsPostgres.test.ts`: concurrent stage writes/registration cannot drop entries; retry/cancel/expiry/import preserve entries and frozen ingestion; model-supplied registry/owner/hash rejected; attempt race cannot register another generation; lost acknowledgements reconcile without replay/deletion. |
| Output creation | Extend `test/banner/dissectorPipeline.test.ts`: scoped output never calls public signer/upload helper, DB row and registry agree, correct derived client set, unauthorized source produces zero new output/registry, registration rollback leaves no readable asset; prior registered output survives later retry. |
| Private bytes | New `test/server/api/bannerDissectionAssetDelivery.test.ts`: owner success; no session, another client colleague, removed assignment, role/custom-permission loss, disabled user, invalidated session, source project reassignment/deletion all deny; missing/malformed ingestion never falls back; no private R2 read on denial. GET/HEAD/Range/If-None-Match/If-Modified-Since all reauthorize; no unauthorized 304/206. |
| Provenance forgery | Swap job/asset/attempt/row key, forge client ID or model registry, change bytes/hash/size/MIME, delete registry/source, and supply a valid legacy token for a scoped asset: all deny. Removing the optional typed layer field must not bypass source checks; a valid canonical locator still resolves for an authorized actor. Public route and `_uploads` tests prove protected namespaces and encoded aliases cannot return data/companions. |
| Saved canvas | Import → save → reload renders same authorized image. Revocation before reload blocks it. Copy/restore and client reassignment do not detach source restrictions. Accessible target with revoked source is denied. Source project/creator equality remains frozen. Feed override/texture/nested reference handling tested. |
| Export admission | Extend `bannerImageRendering.test.ts` and add `bannerScopedDissectionExport.test.ts`: missing/stale revision, foreign project, foreign source, caller HTML/dependencies/overrides, malformed refs all rejected before renderer/storage. Multi-format request authorizes all sources before first effect. Unsaved edits cannot silently export a different canvas. |
| Export parity | PNG/JPG/GIF receive server-built HTML with correct embedded image hashes; renderer receives no private URL/cookie; animation/text/crop/QR retained. Single HTML and ZIP use server route and have no scoped network URLs. Size checks count base64 expansion and reject before excessive allocation; existing renderer caps unchanged. |
| Revocation race | Revoke while renderer is pending; no successful storage/result response. Create stored export, remove source from current canvas, revoke source access while retaining target access; GET/HEAD download still deny from retained dependencies. Reassign target client/creator also denies. Restore permissions follows existing source policy, never regenerates tokens. |
| Export lineage/storage | Missing/truncated/oversized/unknown companion, wrong export/project/source SHA, changed output bytes, dependency limit breach, absent request binding, metadata/DB failure: deny without public fallback. Put/insert acknowledgement loss preserves durable evidence; incomplete object pair never becomes downloadable. |
| Legacy/QR | Existing `bannerAssetDeliveryRoute.test.ts`, `bannerAssetDelivery.test.ts`, `bannerExportsPrivateUrls.test.ts`, `bannerImageRenderingDownload.test.ts`, `bannerProjectManagedQr.test.ts`, `bannerPlatformQr.test.ts`, `test/banner/platformQrAiProtection.test.ts`, `serverHtmlBuilderParity.test.ts`, renderer policy tests remain green. Explicit legacy asset with non-null client and managed QR retains public signed URL/range/HEAD behavior. QR metadata/attestation/client checks unchanged. |
| Excluded paths | Scoped merge/edit/publish/opaque upload/MP4/thumbnail paths reject before public write/provider call; legacy operations continue. No assertion that client-side detection can stop intentional copying of already downloaded bytes. |

Browser/runtime acceptance later: actual cookie-bearing same-origin `<img>` loads after import/reload; fresh revoked read cannot use HTTP cache; scoped HTML file/ZIP opens with embedded images; PNG/JPG/GIF complete through the real renderer binding within existing memory/request limits. A mock codec or source assertion is not this evidence.

## Dispatch ownership and release gates

1. **Coordinator prerequisite:** finish fresh ingestion authority and metadata preservation, then add atomic registry/key/private-locator handling in pipeline/import. Keep scoped admission off. Coordinator retains upload/jobs/pipeline/import/UI context ownership.
2. **Delivery dispatch:** own new `shared/bannerDissectionDelivery.ts`, `server/utils/banner/dissectionDelivery.ts`, new private GET/HEAD routes, public/local route rejection, and delivery tests. Agree shared function signatures with coordinator before application changes. Coordinate catalogue/project guards explicitly; do not edit coordinator-owned files concurrently.
3. **Export dispatch:** own `server/utils/banner/scopedExport.ts`, raster generation/download integration, new HTML endpoint and focused tests. Use coordinator's fresh authority and delivery helpers. UI export modal changes require separately assigned ownership; do not let both workers edit shared helpers implicitly.
4. **Admission gate:** real local PostgreSQL/race tests, source/model forgery tests, revocation across every byte/download boundary, saved rendering, all four requested export formats, bypass closures/exclusions and legacy/QR regressions pass. Bounded large-image export failure is reported honestly; no claim that all admitted images fit embedded export limits.
5. **Storage/runtime gate:** prove private bucket/direct-host behavior, generic route exclusion, correct request binding, companion retrieval, actual Pages + renderer behavior, no-store and authenticated rendering. This investigation leaves all hosted/privacy facts unverified. If a public bucket or unsupported transformation remains, scoped admission remains off even if local tests pass.
6. **Release gate:** coordinator reconciles candidate onto fresh main, preserves immutable build/deploy guards, runs full guarded build/startup and `pnpm deploy:check`, records exact source/deployment IDs, verifies legacy QR/navigation and scoped acceptance against that artifact. No direct Wrangler deployment and no claim of release from unit tests.
7. Update R01/R12/A05 evidence and public feature descriptions only to the proven scope. This plan completes the design prerequisite; full owned ingestion and result delivery remain pending implementation and the gates above.
