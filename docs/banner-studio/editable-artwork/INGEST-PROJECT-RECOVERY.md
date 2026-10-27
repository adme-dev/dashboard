# R1/R3 project recovery — 28 October 2026

The original `banner-editable-artwork` workspace now rejects legacy upload inputs
that could poison a protected canvas, returns content-free restricted list rows,
and permits cleanup with fresh authority over the containing project. Source
reads remain uploader-only. This is local source, endpoint and disposable
PostgreSQL evidence; it is not candidate, browser, hosted or release acceptance.

## Admission before storage

`projects/upload-banners.post.ts` requires `requireWriteAccess` and, when a client
is supplied, the existing `requireSocialClientAccess` validation/permission gate.
Every filename, MIME type and dimension pair is validated before the first
storage call, including later files in a batch. Filenames cannot contain path
separators, query/fragment delimiters, control characters, encoded URL octets,
dot-only paths or protected-reference strings. Dimensions must be positive safe
integers, preventing protected strings from entering generated format keys.

Normal single-segment filenames (including spaces, Unicode and literal percent
signs), personal uploads, all four legacy MIME types (PNG/JPEG/GIF/WebP), original
bytes and duplicate format naming remain supported. This change does not add
image-byte validation or change legacy upload delivery/storage.

## Explicit list projection

The SQL scope and LIMIT/OFFSET behavior are retained. A protected row whose source
check explicitly returns HTTP 403 occupies its original response slot as exactly:

```json
{
  "id": "<project-id>",
  "name": "Restricted artwork",
  "status": "restricted",
  "restricted": true
}
```

No original title, canvas, thumbnail, source locator/key/text, tags, client
identity, creator or timestamps are returned for that row. Rows are never
filtered after LIMIT. Other failures, including authority HTTP 503, propagate;
an infrastructure outage is not disguised as a restricted row. Authorized
protected rows retain their canvas and continue to omit thumbnails.

The coordinator expressly extended ownership to the list page and only the
`BannerProject` status/restricted typing. Existing library helpers and thumbnail
rendering tolerate omitted canvas/tags/dates. Restricted rows now have no editor
link, Edit or Duplicate action; direct handler calls also do nothing. Delete
continues through the existing confirmation modal and fresh server authority.
Restricted rows do not invent client identities/counts. The frontend's existing
local filtering/sorting remains in place; the pagination-slot guarantee applies
to the API response, with no post-LIMIT row filtering on the server.

Other list consumers were inspected: media/audio format enumeration and reusable
style extraction tolerate missing canvases, and TheBrief duplicate matching uses
optional tags. The separate brand-kit picker can still show a generic restricted
row and navigate to the existing detail route, which denies source access; that
picker is outside this change. No browser exercise was performed.

## Target-authorized cleanup

Deletion reads the project snapshot only for the existing revision fence; it
does not parse protected canvas dependencies, read source manifests or fetch
source/asset bytes. In one nonretrying transaction it:

1. Locks the jobs whose `project_id` will be detached, ordered by job ID, before
   actor/project authority locks.
2. Resolves fresh current target-project write authority, including active
   actor, current role permissions and client assignment or personal ownership.
3. Rechecks the project snapshot under its lock.
4. Rejects newly linked imports not in the locked set with HTTP 409, rather than
   acquiring late job locks.
5. Clears only the jobs' mutable import `project_id` and deletes the containing
   project. Immutable source identity, ingestion owner/session marker, delivery
   registry and asset rows are retained unchanged.

Consequently a currently authorized client colleague or the uploader after a
source session invalidation can remove the container without gaining source read
access. Malformed source metadata or canvas locators cannot make it undeletable.
Revoked target assignment, read-only role or inactive actor still denies cleanup.

## Verification

Node `v24.18.0`; 211 passing focused tests across 13 suites:

```sh
node node_modules/vitest/vitest.mjs run \
  test/server/utils/bannerScopedExport.test.ts \
  test/server/utils/bannerScopedCanvasAccess.test.ts \
  test/server/api/bannerScopedFlowExclusions.test.ts \
  test/server/api/bannerScopedCanvasFlows.test.ts \
  test/server/api/bannerScopedProjectDelete.test.ts \
  test/server/api/bannerScopedAssetExclusions.test.ts \
  test/server/api/bannerScopedReviewLinks.test.ts \
  test/server/api/bannerExportsPrivateUrls.test.ts \
  test/server/api/bannerDissectionAssetDelivery.test.ts \
  test/server/api/bannerUploadProjectRecovery.test.ts \
  test/app/bannerRestrictedProjectList.test.ts --maxWorkers=1
# 185 passed
node node_modules/vitest/vitest.mjs run \
  test/server/api/bannerScopedExportRendering.test.ts \
  test/server/api/bannerScopedLists.test.ts --maxWorkers=1
# 26 passed
node /private/tmp/banner-canvas-proof.mjs
# 28 passed; disposable cluster positively stopped and removed
```

The upload regression was first run against the previous route and reproduced
21 failures, including both review filename reproducers and missing client
scope checks. The final suite includes 26 upload cases. UI tests execute the
page's actual projections/actions without a browser. PostgreSQL tests use real
authority tables and two connections for the late-import case: colleague/session/
malformed denial redaction, registry and asset retention during cleanup, target
revocation, project snapshot drift, changed import sets and concurrent PATCH/delete
behavior all passed. The runner verified ownership and confirmed removal of
`/private/tmp/banner-canvas-proof-imt6Fu`; no live database was used.

## Exact changed files

- `server/api/agency/banner-studio/projects/upload-banners.post.ts`
- `server/api/agency/banner-studio/projects/index.get.ts`
- `server/api/agency/banner-studio/projects/[id].delete.ts`
- `app/pages/agency/banner-studio/index.vue` (coordinator-approved extension)
- `app/types/banner-studio.ts` (`BannerProject` status/restricted only)
- `test/server/api/bannerUploadProjectRecovery.test.ts` (new)
- `test/server/api/bannerScopedCanvasFlows.test.ts`
- `test/server/api/bannerScopedProjectDelete.test.ts`
- `test/server/utils/bannerScopedCanvasPostgres.test.ts`
- `test/app/bannerRestrictedProjectList.test.ts` (new)
- `docs/banner-studio/editable-artwork/INGEST-PROJECT-RECOVERY.md` (new)

Root retains import/export helper fixes, candidate integration and release gates.
No Git operations, sibling edits, provider/canary work, live database mutations,
deployments or build-limit changes were performed.
