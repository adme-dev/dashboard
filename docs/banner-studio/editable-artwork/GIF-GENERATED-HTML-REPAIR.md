# Generated HTML GIF repair — 27 October 2026

The failure reproduced in **local workerd using real local Chrome**, and the
shared inflater correction makes that same reproduction pass. No deployment or
hosted-renderer acceptance is claimed by this report.

## Exact input and dependency provenance

- UI-generated synthetic HTML: `test/fixtures/banner/generated-animated-export.html`,
  copied unchanged from `/private/tmp/banner-synthetic-animated-export.html`.
  5,102 bytes; SHA-256 `ac1f54e312d646954d87229b754dc3c11934f784e80f8259322d4be369d8e25e`.
- Exact GSAP 3.12.2: `test/fixtures/banner/gsap-3.12.2.min.js`, 71,520 bytes;
  SHA-256 `efc85c7eb141819717cda0033484a84b1c890d13b02e355a2fec79d424b20e7a`.
  The coordinator explicitly authorized one download of
  `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js` for this offline
  fixture. Its upstream license header remains intact.
- Pinned Source Sans 3 font is read from the existing public font file. The
  production renderer still performs its byte-count and SHA-256 integrity checks.
- Request: GIF, 10 fps, 640×360, scale 1, five-second generated timeline.
- Local environment: Node 24.18.0, Chrome 156.0.8078.48, installed Miniflare/workerd;
  renderer compatibility date `2026-07-15` with the existing compatibility flags.

## Red evidence and root cause

The exact input passed through both the TypeScript source and the renderer's
esbuild bundle under Node. It failed with `RENDER_FAILED` through the same build
pipeline under actual workerd connected to local Chrome over a loopback
WebSocket bridge. GSAP and font requests were fulfilled from local fixture bytes;
unexpected resource requests and Worker outbound requests fail closed.

Temporary instrumentation of the **local test bundle only** exposed:

```text
RangeError: Memory limit exceeded
  at zlibSyncImpl (node-internal:internal_zlib)
  at Object.inflateSync (node-internal:internal_zlib)
  at boundedInflateSync
  at PNG.sync.read
  at Object.frame
  at capture
  at handleBannerRender
```

The first full-size screenshot failed during PNG inflation, before GIF encoding.
The previous tiny image proofs did not exercise native inflate buffer growth.
An isolated workerd experiment compressed 691,560 bytes (the 640×360 RGB scanline
size): an exact `maxOutputLength` of 691,560 failed for chunk sizes 64, 16,384,
65,536 and 691,560, while a limit of 707,944 succeeded with exactly 691,560 output
bytes. A separate 65,536-byte case needed a native limit of 81,920. Changing
`chunkSize` alone did not repair the failure. These are observed runtime results,
not a claim about a stable upstream allocation algorithm.

Before the fix, the new inflater suite had six failures: valid output sizes
65,535, 65,536, 65,537 and 691,560, plus missing rejection of NaN and an overflowing
safe-integer limit. The generated-HTML workerd browser test also failed red.

## Minimal production change

Only `lib/pngjs-sync-inflate.ts` changes production behavior:

1. Validate a supplied `maxLength` as a nonnegative safe integer, with room below
   both the runtime Buffer maximum and the JavaScript safe-integer maximum.
2. Give native inflation fixed **64 KiB allocation headroom**, retaining a finite
   `maxOutputLength` of the requested bound plus that headroom.
3. Reject decoded output exceeding the original exact `maxLength` before any
   decoded bytes reach the PNG parser. One extra byte still fails.

This increases bounded temporary allocation, not accepted image size. CRC
validation, resource restrictions, timeline validation, frame/pixel limits,
deadlines and page/browser cleanup are unchanged. No `render.ts`, codec, Worker
configuration, build policy or size-limit edits were needed. Temporary exception
instrumentation was removed; no production logging was added.

## Regression coverage and verification

The focused renderer/shared-codec command passes **78 tests across eight files**:

```sh
node node_modules/vitest/vitest.mjs run \
  test/workers/bannerRendererBrowser.test.ts \
  test/workers/bannerRendererInflate.test.ts \
  test/workers/bannerRendererContract.test.ts \
  test/workers/bannerRendererIsolation.test.ts \
  test/workers/bannerRendererLifecycle.test.ts \
  test/workers/bannerRendererPolicy.test.ts \
  test/config/pngInterop.test.ts \
  test/server/utils/bannerArtworkPngBounds.test.ts
```

- Real source, bundled Node and bundled workerd render the actual generated HTML
  with exact GSAP 3.12.2 and pinned font bytes.
- Sharp independently decodes the workerd GIF: 50 frames, 640×360, 100 ms per
  frame, infinite loop. Frame 0 versus frame 6 differs in more than 500 pixels;
  this rejects a repeated static image masquerading as animation. The outer
  margin decodes as opaque white. Only Chrome's original blank page remains.
- Inflater tests cover both sides of 16 KiB and 64 KiB boundaries, RGB/RGBA
  full-size lengths, one-byte excess, invalid limits, corrupt compression and an
  8 MiB highly compressed payload against a 64 KiB accepted-output bound.
- Existing PNG interop checks still prove native allocation rejection, CRC
  rejection and shared codec identity. Their bomb fixture is now 128 KiB so it
  exceeds the fixed native headroom; one-byte rejection is independently tested.
- The final Pages artifact gate now exercises a compressible 640×360 RGB PNG
  and compares the SHA-256 of **all** 921,600 decoded RGBA bytes. It also rejects
  one excess inflated byte and a 128 KiB bomb, retaining the prior CRC checks.
- `builtWorkerStartup.test.ts -t 'codec probe harness'`: **4 passed**, two final
  artifact tests deliberately filtered out. The coordinator owns building and
  running the updated gate against the exact release candidate.
- Renderer TypeScript check and scoped ESLint pass. Vitest prints the existing
  Vite `__dirname` configuration deprecation warning.

The browser suite discovers installed macOS Chrome and common Linux
Chrome/Chromium executable paths. It never installs a browser and skips if none
is installed; CI needs one of those installed executables for browser coverage.

## Scope and remaining acceptance

No production logs, credentials, provider calls, hosted renderer requests or
deployment commands were used. The authorized public GSAP fixture download was
the only external diagnostic request. Tests use local Chrome, local workerd and
local resource bytes. The proof is the renderer's esbuild bundle under workerd,
not a deployed Cloudflare Browser Run session or final Wrangler upload artifact.

The coordinator owns release-source integration, the full Pages build/final
artifact gate, deployment and hosted UI/RPC verification. This worker did not
run the broad repository suite or commit the dirty shared checkout. Existing
unrelated work was preserved.
