# PNG shared production export repair

Date: 27 October 2026. Work performed only in the original
`banner-editable-artwork` workspace (starting HEAD
`47ec30c3522f6ab660d730776709770c8a22d7c8`). Existing unrelated changes were
preserved. No commit, full application build, deployment, or credential access
was performed.

## Failure and cause

Read-only inspection covered `/private/tmp/banner-renderer-pages-release.log`
and the candidate `../banner-artwork-release-20261027` at
`ea780dbcce476bd9fe6c77ff7a76df0772ef8356`.

The full candidate build completed and its final gate loaded 135 Banner handlers
from 134 route chunks. The PNG decoder marker was present in `chunks/m/0.js`,
but its real PNG class was internal to that module, so the gate found zero
exported codecs and failed. Moving raster exports to the renderer removed an
incidental chunk boundary; route loading and decoder presence alone did not
satisfy the execution proof. The logged artifact digest was
`3dd01d808db0b836ce37421827786e6af2dd7285182fb229de106572dd33875e`.

## Change

`scripts/png-codec-interop.mjs` now emits the existing `lib/pngjs-sync.ts`
module as a Rollup source chunk with `preserveSignature: 'strict'` and output
name `chunks/png-codec.mjs`. Its module ID is exactly the ID returned for all
`pngjs` imports. Rollup therefore retains the real PNG export instead of
depending on the number or layout of consumers. Nitro may use a facade when
its runtime chunk owns the implementation; the strict entry still requires
that implementation to be exported. Post-build filename compaction can rename
the chunk without affecting the existing shape-based gate.

The adapter, decoder, bounded inflater, real Banner call sites, Nuxt
configuration, renderer, and final-artifact startup test were not modified.
There is no new public endpoint, synthetic codec, or post-build byte edit.

## Regression proof

`test/config/pngInterop.test.ts` now builds two small Nitro Pages applications:

- Two routes importing one shared codec consumer, avoiding the accidental export
  caused by duplicating the consumer in separate route chunks.
- The same routes plus a startup plugin importing that shared consumer, covering
  Nitro's runtime grouping as well as lazy route grouping.

Both fixtures import the real production `validateArtworkPng` source. They
prerender in Node and then execute unchanged emitted modules in Miniflare/workerd.
The test locates the decoder marker only within the discovered route's static
import closure and requires exactly one exported codec by shape. An in-memory
probe temporarily counts calls through that codec's real `sync.read`, forwarding
all arguments and results and restoring the method afterwards. Five reads must
occur through the same export: valid decode, the real Banner validator, CRC
rejection, unchecked CRC decode, and excessive-inflation rejection.

The fixture verifies encoding and transparent RGBA round-trip pixels, flips an
IDAT CRC byte rather than a chunk-type byte, and verifies the oversized stream
fails with the bounded zlib allocation error rather than a trailing-data error
after unbounded inflation. It checks import closure and excludes the incompatible
async `ChunkStream` implementation. Network requests are forbidden.

Before adding the production hook, the strengthened fixture failed at the
intended assertion with `{ codecs: 0 }`, although prerender and normal route
execution had passed. Evidence: `/private/tmp/png-chunk-red.log`.

After the hook, both layouts passed. Final commands, using Node 24.18.0:

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec vitest run test/config/pngInterop.test.ts test/server/utils/bannerArtworkPngBounds.test.ts --maxWorkers=1
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm exec eslint scripts/png-codec-interop.mjs test/config/pngInterop.test.ts
```

Results: 2 test files, 11 tests passed; ESLint exit 0 with no findings. Logs:
`/private/tmp/png-chunk-final-tests.log` and `/private/tmp/png-chunk-lint.log`.
Vitest printed its existing warning about `__dirname` in the repository config
and future native config loading. All changed source and test content was reread.

## Handoff and limits

Files changed by this task:

- `scripts/png-codec-interop.mjs`
- `test/config/pngInterop.test.ts`
- `docs/banner-studio/editable-artwork/PNG-CHUNK-REPAIR.md`

The candidate artifact was inspected read-only and remains the failed pre-repair
artifact. The coordinator owns integration onto the current release source,
the full build, exact final-artifact workerd gate, import/size checks, and any
release. The minimal fixtures do not establish full bundle size, hosted startup,
renderer/provider behavior, or production acceptance. Keep
`test/workers/builtWorkerStartup.test.ts` unchanged and require it to pass against
the newly built final artifact before upload.
