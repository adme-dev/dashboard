# PNG / Nitro interoperability repair

## Scope

This repair keeps the real `pngjs` synchronous PNG codec inside the Cloudflare Pages server bundle. It does not externalize or stub PNG handling, weaken image validation or byte limits, suppress startup errors, or change the worker import/size/startup guards.

The immediate failure was reproducible on Node 24.18.0 by loading the candidate prerender artifact. Inlining the package root bundled its streaming API; CommonJS `require("stream")` became an ESM namespace, so `util.inherits(ChunkStream, Stream)` received a namespace rather than the `Stream` constructor.

Two further compatibility boundaries were exposed by real runtime tests:

- The sync inflater expected CommonJS zlib constants and legacy `zlib.Inflate.call()` inheritance. WorkerD exposes `Inflate` as a class, which cannot be invoked that way.
- Native ESM zlib does not export `Z_MIN_CHUNK` as a named binding. The replacement uses the default builtin module, matching CommonJS access to that constant.

## Server codec contract

All server PNG call sites were inspected before narrowing the API. They use only:

- `PNG.sync.read(buffer, { checkCRC: true })`
- `PNG.sync.write(image)`
- `new PNG({ width, height })` with RGBA `Buffer` storage

No server code uses streaming `pack`/`parse`, `bitblt`, or gamma adjustment. The call sites are `server/utils/banner/artworkValidation.ts`, `server/utils/banner/engineResult.ts`, `server/utils/bannerDissector.ts`, and `server/api/agency/banner-studio/export-gif.post.ts`.

## Implementation

- `scripts/png-codec-interop.mjs` resolves only the exact bare `pngjs` import to the local synchronous adapter. It also pins the real sync codec submodule and the single `parser-sync.js` inflater dependency so Nitro cannot leave them as unresolved package imports.
- `lib/pngjs-sync.ts` preserves the used constructor and `PNG.sync` call contract while excluding the package's streaming entry.
- `lib/pngjs-sync-inflate.ts` replaces only pngjs's legacy custom sync inflater with native `inflateSync`. `maxLength` maps to `maxOutputLength`, retaining the existing decompression bound; `chunkSize` is normalized to zlib's minimum just as pngjs intended.
- `lib/pngjs-sync.d.ts` describes the untyped upstream sync entry.
- `nuxt.config.ts` installs the codec plugin while retaining `pngjs` in `externals.inline` and keeping it out of `external`.

## Regression proof

`test/config/pngInterop.test.ts` builds an actual minimal installed Nitro `cloudflare_pages` project. Before the repair it reproduced both the Node prerender `util.inherits` failure and workerd startup failure.

The repaired test verifies:

1. Real Node prerender encodes and decodes a transparent/opaque 2 x 1 RGBA image.
2. CRC-corrupt input is rejected with `checkCRC: true`.
3. A CRC-valid PNG with an oversized inflated IDAT is rejected by the output bound.
4. The final Pages module graph passes `checkWorkerImports` and contains no `ChunkStream` streaming implementation.
5. The exact emitted Pages modules start in Miniflare/workerd and perform the same decode, encode, CRC rejection, and excess-inflation rejection through a dynamic route with outbound requests forbidden.
6. A direct inflater test confirms that output at the bound succeeds and output beyond it fails.

Validation on Node 24.18.0:

```text
pnpm exec vitest run test/config/pngInterop.test.ts --maxWorkers=1
3 tests passed
```

Related guards and codec consumers:

```text
pnpm exec vitest run \
  test/config/workerImportClosure.test.ts \
  test/banner/enginePagesGuard.test.ts \
  test/server/utils/bannerArtwork.test.ts \
  test/server/utils/bannerArtworkPngBounds.test.ts \
  test/server/utils/bannerEngineResult.test.ts \
  test/server/utils/bannerLetteringRepair.test.ts \
  test/banner/dissectorPipeline.test.ts \
  --maxWorkers=1
7 files, 131 tests passed
```

Focused ESLint also passes. The existing `scripts/check-worker-imports.mjs` and `test/workers/builtWorkerStartup.test.ts` were not edited.

## Integration boundary

This worker did not run a full dashboard build, alter the release candidate, commit, or deploy. The release owner must integrate all runtime files, including the declaration file, then run the normal full build and its immutable import, size, and final-artifact workerd startup gates. A successful minimal fixture is targeted interoperability evidence, not a substitute for that full-artifact verification.
