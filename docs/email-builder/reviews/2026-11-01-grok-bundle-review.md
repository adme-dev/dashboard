# FigFlow Pages worker size

Read-only inspection of the already built workers. No source, dist, or size-script edits. No rebuild, no deploy.

## Verdict

The release worker misses the immutable raw budget by 34722 bytes because the FigFlow server graph was added to a Pages worker that had 2078 bytes of headroom. Gzip is not the failure. The 2078-byte baseline margin is existing headroom. It is not evidence for raising `RAW_RELEASE_BUDGET_BYTES`, shrinking the 128 KiB guard, or dropping the check.

`wrap-worker` had already compacted both artifacts (`/* XEROFLOW_COMPACT_WORKER_MODULE */`). Another minify pass on those modules is not a correction.

The smallest change that can clear 34722 bytes is to keep the four FigFlow design routes, and the server modules only those routes import, out of the Pages worker. Put that server functionality on a standalone Worker, which is the failure text already thrown by `scripts/check-worker-size.mjs`. Splitting unused action schemas saves about 4 KB and cannot pass.

## Exact comparison

| | Raw bytes | Versus 25468928 | Gzip bytes | Versus 9750000 |
| --- | ---: | --- | ---: | --- |
| Unmodified `ec0dcd39e` baseline | 25466850 | 2078 remaining | 7338033 | 2411967 remaining |
| FigFlow release candidate | 25503650 | 34722 over | 7349357 | 2400643 remaining |
| Delta (release − baseline) | 36800 | 34722 + 2078 | 11324 | |

`25468928` is `25_600_000 - 128 * 1024` in `scripts/check-worker-size.mjs`. The script sums every non-`.map`, non-`wrangler.*` file under `dist/_worker.js`, then gzip at `Z_BEST_COMPRESSION`. Lazy route chunks are included in the raw total. Splitting them does not reduce the measured size.

Logs and trees match those totals:

- Release log `/private/tmp/figflow-release-build.log` line 5162. Dist `chunks/m/0.js` mtime 2026-11-01 09:43:40. Counted files 3030, raw 25503650. `chunks/m/0.js` is 8408098 bytes.
- Baseline log `/private/tmp/figflow-baseline-build.log` line 5147. Dist mtime 2026-11-01 09:49:34. Checkout `ec0dcd39ebea98b45b9976bf297de96575841dd2`, clean. Counted files 3026, raw 25466850. `chunks/m/0.js` is 8377711 bytes (30387 larger in the release).
- `index.js` is 1317 bytes in both trees and byte-identical.

The release worktree HEAD is now `2cfbdab98` (`feat(banner): add video trim…`, 2026-11-01 09:49:46), which is after this dist was written. That commit does not touch `server/`, `shared/`, `scripts/`, or `workers/`. It is not in the measured artifact. The candidate dist is the FigFlow tree built on `ec0dcd39e`.

## Where the 36800 bytes are

In the baseline shared module, `deleteSubscriber` is immediately followed by `normalizeSubscriberEmail`. In the release module those two functions are separated by 32344 bytes (`async function` for `assertFreshDesignAccess` at offset 5997860 through the byte before `function qte` / `normalizeSubscriberEmail` at 6030204).

That window is not all new code. It contains one relocated copy of the pre-existing render-bounds block:

- Release: `const POe=16777216` at 5999151 through `s(oJt,"validateDocumentGraph");` ending at 6001936. Length 2785.
- Baseline: the same block (`RenderBoundaryError`, `snapshotRenderInput`, `validateDocumentGraph`) is 2788 bytes and sits later, after `normalizeSubscriberEmail`.
- Each worker has one `RenderBoundaryError` and one `snapshotRenderInput`. The release copy moved next to the design schema because `shared/emailRendering/designContract.ts` imports `RenderBoundaryError` and `snapshotRenderInput` from `./bounds`. The message strings also still appear in the pre-existing `failure$4` mapper. Baseline already had that pair. This is not a second renderer.

New bytes inside the splice: 1291 before the bounds block (`assertFreshDesignAccess`, `rethrowLegacyDesignConflict`) plus 28268 after it (design Zod schema through `readBoundedJson` / `design_request_too_large`). New total inside `m/0.js` content: 29559.

The design schema is absent from the baseline. `schemaVersion:D(1),kind:q(["module","template","campaign-draft"])` is at release offset 6002596, and the only `figflow` string in the worker is at 6002745. `campaign-draft`, `email_design_documents`, `LEGACY_CONTENT_CHANGED`, `save-draft`, `create-template`, and `design_request_too_large` occur only in the release worker. Migration SQL (`491_email_design`, `CREATE TABLE email_design`) and `.figcraft` occur in neither worker.

Route table, present only in the release, immediately before `/api/email/lists/:id`: 493 bytes at offset 8247789–8248282.

```text
/api/email/design/drafts/:id                  GET     -> ./1v9.js
/api/email/design/drafts/:id                  PATCH   -> ./1va.js
/api/email/design/drafts/:id/metadata         PATCH   -> ./1v8.js
/api/email/design/drafts/initialize           POST    -> ./1vb.js
```

Those four chunks exist only as FigFlow handlers in the release worker (`FIGFLOW_EDM_DRAFT_SAVES_ENABLED` is absent from the baseline tree):

| Chunk | Bytes | Route |
| --- | ---: | --- |
| `chunks/m/1v9.js` | 1186 | draft GET |
| `chunks/m/1va.js` | 2115 | draft PATCH |
| `chunks/m/1v8.js` | 1619 | metadata PATCH |
| `chunks/m/1vb.js` | 1399 | initialize POST |
| Total | 6319 | |

Each chunk imports `./0.js` and returns 404 unless the flag is the string `true`. The flag does not keep the bytes out of the upload. The same short names in the baseline are unrelated handlers (159, 978, 279, and 520 bytes) with no design strings.

Accounted FigFlow bytes: 29559 + 493 + 6319 = 36371. Worker delta is 36800. The other 429 bytes are minify-identifier drift in the shared module (stable anchors before `deleteSubscriber` already sit about 401 bytes later in the release, while the first differing bytes of `m/0.js` are renamed locals such as `Mfn` versus `bhn`). No second feature is in the delta.

`m/0.js` itself grew by only 30387 because the 2785-byte bounds block moved rather than being copied. Filename diffs across the other chunks are wrap-worker short-name reshuffles. Chunks that exist under a new short name, including a brotli payload, are not FigFlow source.

## What cannot close 34722 bytes

The unused action union is real and small. `designActions.ts` publishes `save-draft`, `create-template`, `update-template`, `create-module`, `update-module`, `propose-return`, `apply-return`, `cancel-return`, and `save-proposal-as-new-draft`. The live save route accepts the draft save. In `m/0.js` the span from the `save-draft` literal at 6024624 through `design_origin_unavailable` at 6028733 is 4109 bytes. `designRequest.ts` imports `DESIGN_ACTION_LIMITS` from `designActions.ts`, so the save and metadata paths keep that module. Deleting the unused names does not remove the contract, revisions, reads, or metadata code. 34722 − 4109 is still about 30 KB over.

`server/api/email/templates/[id].patch.ts` and `[id].delete.ts` import only `rethrowLegacyDesignConflict` from `designConflict.ts` (that file imports `h3` and nothing else). They are why the ~1291-byte access/conflict prelude stays on Pages even if the four design routes leave. They do not import `designRevisions`, `designActions`, or `designContract`.

Also ruled out by the same trees:

- Gzip tuning. The gzip budget has 2400643 bytes left. The check failed on raw size.
- Raising the raw budget or removing the 128 KiB margin. Baseline headroom is 2078 bytes on the unmodified worker.
- Treating lazy Nitro chunks as savings. The checker sums them.
- Migration files, tests, docs, and the `.figcraft` fixture. They are not in `dist/_worker.js`.
- A new HTML renderer or `.fig` asset. `<!DOCTYPE html>` counts match across the two workers (12 each). `designRevisions.ts` imports `EmailRendererClient` as a type only.

## Correction

Exclude `server/api/email/design/**` from the Pages Nitro graph and serve those four routes from a standalone Worker, together with the modules only they pull in:

- `server/utils/email-marketing/designReads.ts`, `designRevisions.ts`, `designMetadata.ts`, `designInitialization.ts`, `designDependencies.ts`, `designRequest.ts`
- `shared/emailRendering/designContract.ts`, `designActions.ts`, `designAdapter.ts`, `designCapabilities.ts`

On this artifact that is the 28268-byte schema/actions/revisions tail, the 493-byte route-table entries, and the 6319-byte route chunks: 35080 bytes. The raw miss is 34722, so that cut is the one that can pass. The arithmetic margin is 35080 − 34722 = 358 bytes, which is the same order as the 429-byte identifier residual. This review did not rebuild, so it does not claim a fresh `check-worker-size` pass. It does claim that no smaller cut inside the already minified modules reaches 34722 bytes.

Leaving the template conflict helper on Pages keeps the legacy template patch/delete translation and costs the ~1291-byte prelude, not the design document implementation. Shipping migration 492 still belongs with the savers that write `subject` and `preview_text`. That deploy constraint is separate from this raw-size miss. This review does not say the native editor or the Pages UI is ready to ship.
