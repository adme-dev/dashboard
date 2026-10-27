# Banner raster exports — Pages repair

Implemented 27 October 2026 within the dispatched Pages ownership boundary. No commits, migrations, deployment, provider calls, root configuration, shared-contract edits or frontend edits were made by this worker.

## Behavior

- Existing `export-image` and `export-gif` HTTP request/response shapes remain intact. Caller HTML represents the current unsaved editor state. Image requests still accept `format: png|jpg`, `quality: 1|2`, and optional JPEG quality; GIF accepts optional fps. Responses remain `{ formatKey, url, fileSize }[]`.
- `requireWriteAccess` authenticates and rejects read-only mutations. A fresh project read then enforces the same client assignment or agency creator/all-client policy as `exports/index.get` before RPC or object writes.
- All formats are validated before any rendering. No invalid format is silently skipped. Sizes, quality and fps require finite integers. The complete HTTP payload's decoded HTML is capped at 6 MiB, each item at the shared 2 MiB cap, and requests at 25 formats. Persisted format keys are capped at the existing database's 50 characters. Shared static/GIF dimension, pixel and output caps apply.
- Pages uses the pure shared contract and calls the named renderer's `render(request)` method in sequential batches of at most four. Only one response batch is retained at a time; accumulated results contain URLs and sizes, not image buffers.
- The final coordinator-approved binding names are **`BANNER_RENDERER_PRODUCTION`** and **`BANNER_RENDERER_STAGING`**, replacing the original plan's single binding plus environment text variable. Exactly one must be present in `event.context.cloudflare.env`; its name sets `expectedEnvironment`. Both present, neither present, malformed binding, or missing native `MEDIA_BUCKET` returns 503. There is no process environment, local browser, public HTTP renderer or storage fallback.
- Pages independently verifies response version, item count/order/keys, output/MIME, CSS and encoded pixel dimensions, byte limits, SHA-256, and PNG/JPEG/GIF magic/header/block structure. GIF checks include frame count, duration consistency, pixel-frame budget, and actual centisecond delays (`round(100/fps)*10`). An entire RPC response is validated before its first storage write. Browser execution and codec decompression remain in the renderer Worker.
- Verified bytes are written using native `MEDIA_BUCKET.put` with checksum and private cache metadata at `banner-raster-exports/<project UUID>/<export UUID>.<png|jpg|gif>`. The same UUID is explicitly inserted into `banner_exports`; saved and returned URLs point to `/api/agency/banner-studio/exports/<export UUID>/download`. Private exports are not sent for external AI captioning.
- Failed or ambiguous object puts are cleaned before any database insert. If an insert fails or returns no matching record, a fresh export-ID lookup distinguishes a confirmed absent row from a committed insert whose acknowledgement was lost. Only a confirmed absent row permits object deletion. An existing row or failed lookup preserves the bytes and returns 503; lookup/cleanup failures emit content-free export-ID diagnostics.
- Authenticated GET/HEAD download routes use a fresh export/project join, recheck current client/agency access, require exact project/export UUID namespace and suffix/type matching, and access only the native bucket. GET streams the object; HEAD reads metadata only. Responses use the verified MIME, safe UUID attachment filename, `private, no-store` and `nosniff`. Missing objects return 404; unavailable storage or incompatible object metadata returns 503. Legacy saved public URLs are never a fallback.

## Local evidence

Node **24.18.0** was selected using:

```sh
export PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH
pnpm exec vitest run \
  test/server/api/bannerImageRendering.test.ts \
  test/server/api/bannerImageRenderingDownload.test.ts \
  test/server/api/bannerExportsPrivateUrls.test.ts \
  test/server/api/bannerRenderPrivateDownloadRoute.test.ts \
  test/workers/bannerRendererContract.test.ts
```

Result: **85 tests passed across five files**, including **58 new Pages tests**. The initial route implementation produced 25 failures across the first 30 rendering checks; the missing downloads produced 15 failures. The ambiguous-insert review regression separately produced two meaningful failures before the cleanup repair, then passed.

The tests cover cross-client/read-only rejection before rendering/storage, fresh download authorization, agency ownership, missing/conflicting bindings, every-batch preflight, 25-format batching, metadata/hash/magic/dimension corruption, real encoded JPEG and two-frame GIF fixtures at 5/10/12/15 fps, @2x PNG dimensions, native storage and exact-byte authenticated download, unrecorded object cleanup, and retained bytes after ambiguous database commit/lookup failures.

Scoped ESLint passes for both POST routes, both utility files, both download routes and both new test files. A TypeScript compiler-API check using `.nuxt/tsconfig.server.json` with diagnostics filtered to those eight owned TypeScript files reports **zero owned-file diagnostics**; this is not a claim of a clean repository-wide typecheck. Every owned source/test file was reread. Existing Vitest configuration emits an unrelated `__dirname`/future-native-config-loader warning.

## Remaining acceptance and operational limits

This evidence uses mocked RPC, R2 and database boundaries with real image encoders in test fixtures. It does **not** prove deployed named RPC connectivity, hosted Browser Rendering, live database inserts, provider rendering, complete creative reconstruction, or live download transport. Deployment/configuration and final UI checks belong to the coordinator.

The coordinator independently read Cloudflare configuration at approximately 11:21 UTC on 27 October: the `agency-files` bucket has managed `r2.dev` access disabled and no custom domains. This worker inspected the sanitized local evidence file `/private/tmp/banner-media-bucket-public-readback.json`. That is bucket configuration evidence; synthetic unauthorized/direct download and authorized hosted delivery are separate acceptance checks. A private object prefix and cache header alone would not protect a publicly exposed bucket.

Validation is complete before rendering, and renderer failures are atomic per RPC batch. Successful recorded exports from earlier batches remain available if a later batch or insert fails; the overall multi-batch HTTP request is not a transaction across R2 and Postgres. If both an insert and its fresh outcome lookup fail, bytes are deliberately retained rather than risking deletion of a committed export; an operator may need to reconcile an orphan after service recovery. No background orphan sweeper was introduced.

The 6 MiB HTML limit is enforced after H3 parses JSON, not as a streaming HTTP request-body limit. The overall request remains subject to the platform's HTTP-body controls. Header/block and SHA verification detects transport/metadata mismatches but does not re-decode compressed pixels on Pages.

## Owned files

- `server/api/agency/banner-studio/export-image.post.ts`
- `server/api/agency/banner-studio/export-gif.post.ts`
- `server/utils/banner/exportRendering.ts`
- `server/utils/banner/exportDelivery.ts`
- `server/api/agency/banner-studio/exports/[id]/download.get.ts`
- `server/api/agency/banner-studio/exports/[id]/download.head.ts`
- `test/server/api/bannerImageRendering.test.ts`
- `test/server/api/bannerImageRenderingDownload.test.ts`
- `docs/banner-studio/editable-artwork/EXPORT-PAGES-REPAIR.md`
