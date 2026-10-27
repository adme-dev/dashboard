# Saved-canvas protected Dissector exports

Implemented in the original shared worktree on 28 October 2026. This is local
source/unit evidence, not hosted renderer, bucket privacy, browser, release or
complete ingestion acceptance. No Git, deployment, provider, live database or
browser operation was performed by this worker. The coordinator retains release
and admission gates, including the immutable bundle limits and current-main work.

## Interfaces and storage decision

The asset worker confirmed `resolveScopedDissectionAsset(event, actorId,
locator)` returns `{ bytes, mimeType, jobId, sourceSha256 }` after fresh authority
and byte verification. Canonical locators are parsed by
`shared/bannerDissectionDelivery.ts`; broad recognition rejects malformed,
absolute, encoded and private-key aliases rather than treating them as legacy.

This implementation supersedes the design document's JSON companion proposal.
Existing native R2 `put` supports `customMetadata`; the generic local filesystem
adapter discards it and exposes a public local URL, so it is not used. Each
`scoped-banner-exports/{projectId}/{exportId}.{png|jpg|gif}` object receives its
bytes and `customMetadata.provenance` in one native request-binding write.
There is no companion write, migration, S3 fallback or local fallback.

Provenance is strict version 1 JSON, bounded to **1800 UTF-8 bytes**, containing:

- Export ID, project ID, original saved source revision and output SHA-256.
- Frozen target project owner/client, actor and session-invalidated marker.
- At most eight distinct originating job IDs and verified original-source hashes.

The metadata cap is also checked before rendering. Exceeding either bound fails
closed. The asset reader/renderer retain their existing byte limits. Canvas
inspection is bounded to 20,000 nodes, depth 32 and 64 distinct private locators.
Base64 expansion counts repeated occurrences before allocation; generated HTML
must still fit the unchanged 2 MiB/item and 6 MiB/request limits. Custom font
records come from the server catalogue, bounded to 64 faces, and the existing
server HTML builder/pinned-font behavior is reused.

## Authority and export behavior

`prepareScopedExport` classifies the saved server canvas by canonical source
locators and immutable `dissectionSource` markers, including text-only imports.
It requires the exact current `sourceRevision`; requested dimensions, HTML and
resource substitutions never override saved artwork. Selected keys must exist in
the saved canvas. Feed overrides and protected text textures are explicitly
unsupported, preventing silently omitted/substituted source content.

Every source job is authorized before the first private image read. Source and
ingestion schemas must be valid, ownership must be client/project scoped, source
hashes must match, and frozen source/destination clients must match (including
null). Fresh target and source checks use `transactionWithoutRetry`,
`resolveDissectionContext` and `assertDissectionAccess`; all sorted source job
locks precede actor/project locks. Export creation requires write authority;
retained downloads use read authority. No lock spans renderer/storage I/O.

PNG/JPG/GIF receive server-built HTML with authorized PNG bytes embedded as data
URLs. The renderer receives no private URL, cookie or user credential. Source
and target identity/revision are checked again before render, after render before
each write, after storage and before returning results. Scoped INSERTs use a
non-retrying transaction. Lost put/insert acknowledgement returns an error,
logs only the export ID and preserves object/DB evidence: no delete or replay.
The pre-existing legacy raster cleanup behavior is unchanged.

`export-html.post.ts` returns bounded, freshly authorized server-built HTML items
with private/no-store. The modal downloads one item as HTML or packs those exact
returned items into its existing JSZip flow; it never builds scoped export HTML
from client content. Embedded private images require no subsequent protected URL
or session cookie; legacy external font/script requirements remain. HTML/ZIP
bytes already delivered cannot subsequently be recalled.

The modal blocks dirty/saving state, supplies saved revision and format keys,
and detects artwork/project changes during export before initiating a download.
It recognizes encoded custom canvas sizes through the existing format resolver.
Edited export controls use Nuxt UI fields/buttons/sliders and show a clear saved
artwork explanation. Frontend-design guidance was loaded from the installed
Claude marketplace path because the AGENTS.md Codex path was stale.

## Retained download and exclusions

`exportDelivery.ts` distinguishes scoped and legacy keys from the DB row. Scoped
GET and HEAD read strict atomic metadata, reauthorize retained dependencies,
read/hash/size/MIME-check bytes with `readBoundedBannerObjectBody`, re-read export
identity and reauthorize immediately before response. HEAD also validates bytes;
Range/conditional headers cannot bypass checks. Removing source layers from the
current canvas does not remove historical export dependencies. Missing or changed
metadata/bytes, target ownership changes and source revocation deny delivery.
Success is private/no-store with same-origin resource policy; the HTTP boundary
sets no-store before auth/errors. There is no legacy fallback for a scoped key.

Owned server guards reject scoped saved canvases before manual publishing,
opaque ZIP upload and MP4 dispatch; AI image editing rejects protected source
locators before fetching/provider work. Custom-instance publish/export rejects
protected references. The merge and AI-edit composables and publish modal show
clear reasons; merge checks again around asynchronous reads/upload. These guards
protect managed flows, not intentional reupload of bytes already delivered.

The worker initially added protected thumbnail rejection/clearing and source
marker preservation to `projects/[id].patch.ts`, then explicitly handed that file
to the flow worker for transactional source checks and stricter lineage handling.
The flow worker/coordinator own project read/list/create/copy/restore/template,
scheduled/ad publishing, additional AI flows and export-list projection followups.
The asset worker owns public/local private-namespace denial. Those integrations
must be assessed separately; this report does not claim their acceptance.

## Exact owned files

- `shared/bannerScopedCanvas.ts`
- `server/utils/banner/scopedExport.ts`
- `server/utils/banner/exportRendering.ts`
- `server/utils/banner/exportDelivery.ts`
- `server/api/agency/banner-studio/export-html.post.ts`
- `server/api/agency/banner-studio/publish.post.ts`
- `server/api/agency/banner-studio/exports/upload.post.ts`
- `server/api/agency/banner-studio/export-video.post.ts`
- `server/api/agency/banner-studio/ai/edit-layer.post.ts`
- `server/api/agency/banner-studio/custom-instances/[id]/publish.post.ts`
- `server/api/agency/banner-studio/custom-instances/[id]/export.post.ts`
- `app/components/banner/BannerExportModal.client.vue`
- `app/components/banner/BannerPublishModal.vue`
- `app/composables/useAiLayerEdit.ts`
- `app/composables/useMergeLayers.ts`
- `test/server/utils/bannerScopedExport.test.ts`
- `test/server/api/bannerScopedExportRendering.test.ts`
- `test/server/api/bannerScopedFlowExclusions.test.ts`
- `test/banner/scopedFlowUi.test.ts`
- `test/server/api/bannerExportVideoGodMode.test.ts` (mock the added saved-canvas read)
- This report. Shared-edit handoff: `server/api/agency/banner-studio/projects/[id].patch.ts`.

## Verification

Node: `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node`.
The initial focused test run failed because the implementation module did not
exist. Implemented tests then passed; subsequent source-schema, repeated-byte
budget and retained-download race cases are included in the final run below.

**142/142 tests across 11 files passed** (final shared-worktree run, including the
coordinator's concurrent export-list regression).:

```sh
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run \
  test/banner/scopedFlowUi.test.ts \
  test/server/utils/bannerScopedExport.test.ts \
  test/server/api/bannerScopedExportRendering.test.ts \
  test/server/api/bannerScopedFlowExclusions.test.ts \
  test/server/api/bannerImageRendering.test.ts \
  test/server/api/bannerImageRenderingDownload.test.ts \
  test/server/api/bannerExportsPrivateUrls.test.ts \
  test/server/api/bannerExportVideoGodMode.test.ts \
  test/banner/platformQrAiProtection.test.ts \
  test/banner/serverHtmlBuilderParity.test.ts \
  test/banner/rasterExportDownload.test.ts --maxWorkers=1
```

Coverage includes all three raster encodings, HTML plus JSZip roundtrip, ignored
caller HTML/dimensions, stale/missing revision, malformed/foreign references,
text-only lineage, personal/foreign-client forged sources, source revocation
during render (including loss of write permission) and after object read, removal
from current canvas, target changes,
missing/hash/size provenance failures, native binding absence, ambiguous put/DB
acknowledgements, repeat-base64 limits, custom-font lookup, managed flow guards,
legacy rendering/download and QR regressions. Renderer, DB and bucket effects in
these suites are mocked; encoded bytes use real PNG/JPEG/GIF libraries.

Both modified Vue SFCs pass compiler-sfc script/template compilation with Node24.
The repository-wide server `tsc --noEmit -p .nuxt/tsconfig.server.json` does not
pass; its initial captured run emitted 558 diagnostic lines, with none matching
the owned export/guard paths. The final refresh emitted 563 diagnostic lines,
also with no owned export/guard/shared-path matches. This is not a clean repository
typecheck or proof
that every other diagnostic predates this shared run. Logs are in
`/private/tmp/scoped-export-tsc.log` and the final refresh in
`/private/tmp/scoped-export-tsc-final.log`.

Remaining gates: actual DB integration/lock races, full guarded build/raw-budget
and emitted-startup checks, private bucket/direct-host verification, real native
renderer and browser HTML/ZIP behavior, current-main reconciliation and release.
Admission must remain gated until the coordinator establishes those required
acceptance categories. No build guard, deployment target, dependency or migration
was changed here.
