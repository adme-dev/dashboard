# GIF inflate fix — independent review

Reviewed 27 October 2026 under Node **24.18.0**, Miniflare **4.20260708.1**, workerd **1.20260708.1**, and pngjs **7.0.0**.

**Verdict: no source/security blocker found for the scoped private renderer fix.** The original failure is independently reproduced, the fixed generated-animation path passes in actual local workerd plus Chrome, and both native and decoded-size rejection remain effective. This is a local code/runtime review, not hosted acceptance or authorization to bypass release gates. The exact final Pages artifact was unavailable in this checkout; its acceptance remains pending the release owner's full build and gate.

Only this report was changed by the reviewer. Source and tests were read but not modified; candidate builds remained with their owner. No deployment was performed, and production logs and credentials were not accessed. Tests created and removed private temporary fixtures. Existing dirty work was preserved.

## Reviewed identity

The original review checkout is `banner-editable-artwork`, branch `adme-dev/banner-editable-artwork`, HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`. This is the shared implementation checkout, not a release candidate. Root owns reconciliation with current main and release integrity.

| File | Reviewed SHA-256 |
| --- | --- |
| `lib/pngjs-sync-inflate.ts` | `713a0dcfea07bc37ffea181726ec463e5371299d5ea3ba0c6bfe8a1d01a00db0` |
| `test/workers/bannerRendererInflate.test.ts` | `c6879bff3413ab8016d07a91bcc5bdddda3649433df70f4344d45066fe653a5a` |
| `test/workers/bannerRendererBrowser.test.ts` | `3fc9ab3145db250d8812e04c86e207b8a8307fbaa27209031724171d70b80b15` |
| `test/workers/builtWorkerStartup.test.ts` | `c73f1eb72a9b8a2ff233f53dccc5d0fd56cdd92928df31336ed171f17dc9776d` |
| `test/fixtures/banner/generated-animated-export.html` | `ac1f54e312d646954d87229b754dc3c11934f784e80f8259322d4be369d8e25e` |
| `test/fixtures/banner/gsap-3.12.2.min.js` | `efc85c7eb141819717cda0033484a84b1c890d13b02e355a2fec79d424b20e7a` |

The browser file was refreshed during review to discover Linux Chrome/Chromium paths and format the WebSocket/cleanup blocks; the final 30-test run used the hash above. Supporting inspection covered the bundle resolver, renderer codec/capture path, pngjs parser, PNG input validation, local workerd entry fixture, and interop regression tests.

## Necessity and sufficiency

An independent temporary probe compressed 691,560 identical bytes and supplied `chunkSize: 691560, maxOutputLength: 691560` directly to native `inflateSync`. Node returned exactly 691,560 bytes; installed workerd threw `RangeError: Memory limit exceeded`. The adapter with headroom accepted those exact bytes. No production source was mutated to obtain the red baseline.

The pinned runtime's [native implementation](https://github.com/cloudflare/workerd/blob/v1.20260708.1/src/workerd/api/node/zlib-util.c%2B%2B) grows its output buffer by reserving current size plus an internal chunk, and rejects a reserve exceeding the configured capacity. It uses the internal chunk rather than the supplied chunk size for this buffer. Its [header](https://github.com/cloudflare/workerd/blob/v1.20260708.1/src/workerd/api/node/zlib-util.h) defines that chunk as 40 KiB. Therefore 64 KiB of fixed headroom exceeds a growth step: while decoded output is within the requested limit, a next reserve can fit. This explains the workaround for this pinned runtime; it is not a universal promise about future allocation implementations.

For a supplied limit `L`, the patch sets native output capacity to `L + 65536`, then throws before returning whenever decoded length exceeds `L`. It does not truncate malformed output. At the reported RGB boundary, native capacity is **757,096 bytes**, while accepted decoded output remains **691,560 bytes**. A one-byte excess reaches the explicit post-inflate rejection; much larger expansion reaches the native cap.

## Security and compatibility assessment

- **Finite bounded path:** no retry with an unlimited inflater and no input-dependent headroom multiplier. The addition is protected by safe-integer, nonnegative, and buffer-maximum checks. Native zlib can apply a narrower maximum and reject first; this is fail-closed. The installed workerd native maximum is 128 MiB, narrower than its exposed Buffer maximum. Supported GIF frame sizes are well below it.
- **Not a total process-memory cap:** the native output capacity does not include compressed input, transient old/new buffer copies, the final returned buffer, PNG unfiltering/RGBA storage, palette work, or accumulated GIF output. Existing dimensions, frame count, total pixels, and output budgets remain necessary. This review did not measure peak hosted isolate memory or concurrent load.
- **Missing limit behavior:** omitted or null `maxLength` omits `maxOutputLength` and skips the post-check, preserving native defaults. It does not provide an application-sized security cap. Independent Node and workerd probes both accepted 100,000 bytes with absent/null limits. pngjs's noninterlaced call supplies the computed image size, so the repaired path remains bounded.
- **Interlaced caveat:** pngjs's Adam7 branch invokes bare native inflate and bypasses this adapter. Existing `validateArtworkPng` rejects interlaced/unhandled encodings before decoding; renderer input to the codec is a browser screenshot. This patch must not be represented as bounding every arbitrary PNG decoding call.
- **Invalid limits:** fractions, negatives, nonfinite values, unsafe integers, and limits overflowing the permitted headroom addition fail. Zero is well-defined: empty decoded data is accepted by the adapter, a one-byte result is rejected; pngjs separately rejects invalid image content. Tests do not attempt enormous allocations at upper numeric limits.
- **CRC and corruption:** CRC remains owned by pngjs and enabled in the renderer call. The interop test independently passed CRC-corrupt rejection with `checkCRC: true` and acceptance of the same image with checking disabled. Invalid zlib bytes and large compressed bombs still fail.

## Gate and proof quality

`bannerRendererInflate.test.ts` exercises actual bundled adapter code in workerd, checking byte equality at eight sizes and rejection at each size plus one. The 8 MiB bomb and corrupt-data cases reject. Node checks six invalid limits. These tests provide meaningful protection against removing either layer of the bound.

`builtWorkerStartup.test.ts` pins `dist/_worker.js`, reads emitted module contents without rebundling, hashes the module set, discovers real Banner route chunks, and locates the codec in their static import closure. It adds a test-only entry in memory, not a replacement codec. The added 640×360 RGB PNG is constructed without pngjs and compares the full decoded RGBA digest. A CRC control, one-byte overflow with the adapter-specific error, and 128 KiB expansion with the native-limit error distinguish correct bounds from late parser rejection. Missing artifacts and missing codec exports fail. Four harness tests passed, including a lazy-module failure that auth-only startup would miss.

That gate directly exercises the emitted shared codec but does not invoke authenticated application routes or prove that every route uses it. Its module digest identifies the tested artifact; the release owner must additionally bind source commit, final configuration, deployment target, and deployed artifact. A passing source or fixture test cannot replace that gate.

`bannerRendererBrowser.test.ts` runs source/Node-bundle checks and, crucially, the generated HTML through a freshly bundled renderer in actual workerd, bridged to local Chrome. The real checked-in GSAP 3.12.2 and pinned font bytes are supplied through local services; unexpected Worker outbound requests throw. Sharp independently decodes GIF metadata and two frames, asserting motion and a known background pixel. Browser cleanup leaves only the harness's initial page.

The workerd/Chrome result was **574,671 bytes**, SHA-256 **`b68c2264c5e5a16c707aae2b9255d45c3be412b6ad777b0970bcb2a088e82be7`**, **640×360**, **50 frames**, **100 ms** for every frame, infinite loop, and **23,630 changed pixels** between frames 0 and 6. This is meaningful rendering/animation proof, not merely a GIF signature check.

Limitations: the suite skips if no recognized browser exists; a release gate must inspect skips or provision Chrome. It uses a local entry and services, not the deployed private Worker entry/auth/binding. The HTML is a saved generated fixture rather than newly generated by the current UI. Sampling two frames proves motion, not a visual golden comparison of all content/frames. No real Cloudflare Browser Rendering, authenticated download, saved export, R2, database, provider delivery, or hosted capacity acceptance was performed.

## Verification executed independently

```text
node --version
v24.18.0

pnpm exec vitest run test/workers/bannerRendererInflate.test.ts \
  test/workers/bannerRendererBrowser.test.ts test/workers/builtWorkerStartup.test.ts
34 passed; 2 failed (both final Pages tests: missing dist/_worker.js/wrangler.json)

pnpm exec vitest run test/workers/bannerRendererBrowser.test.ts \
  -t 'actual bundled workerd' --reporter=verbose
1 passed; 14 excluded by the explicit name filter

pnpm exec vitest run test/workers/bannerRendererInflate.test.ts \
  test/workers/bannerRendererBrowser.test.ts --reporter=verbose
30 passed; no skips (final browser revision)

pnpm exec vitest run test/config/pngInterop.test.ts --maxWorkers=1
4 passed

pnpm exec eslint lib/pngjs-sync-inflate.ts \
  test/workers/bannerRendererInflate.test.ts \
  test/workers/bannerRendererBrowser.test.ts test/workers/builtWorkerStartup.test.ts
exit 0
```

Additional temporary Node/workerd probe: **58 successful case checks**, with exact and one-byte-overflow pairs at `0, 1, 63, 64, 65, 16383, 16384, 16385, 65535, 65536, 65537, 691560, 921960, 1048575, 1048576, 1048577, 12002000, 16002000`; native red baseline; absent/null limits; 8 MiB expansion against limit 39; Node zero/one/exact-size bounds; and nine invalid numeric/type/overflow limits. The temporary worker imported the reviewed adapter, blocked outbound requests, and was disposed and removed. This extra probe is execution evidence, not a new committed regression suite.

Nonblocking test follow-up: add persistent absent/null/zero-limit cases and boundaries around the pinned 40 KiB growth increment, plus invalid limits inside workerd rather than Node alone. The current repair is already covered at the actual failing size and large valid frame sizes.

## Remaining release work

The two final Pages tests failed because the original checkout has no built artifact, not because an emitted codec was observed failing. Coordinator message `msg_78ce7d5dcb13` confirms the root-owned full build is running in `banner-artwork-release-20261027`; message `msg_bd47cbe3a7aa` separates private renderer deployment from subsequent Pages release. The coordinator may attach that build's exact artifact digest and final gate result to its release record. Until then this report does **not** claim final Pages acceptance. No source/security blocker was found for the independently tested renderer fix; hosted verification and release integrity remain with the coordinator.
