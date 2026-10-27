# Bounded PNG ingest validation

Implemented 28 October 2026 in the original `banner-editable-artwork` workspace, on `adme-dev/banner-editable-artwork`, with base HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`. These are uncommitted helper/test/report changes in a shared dirty workspace; the base hash does not identify a released artifact.

## Interface and accepted subset

`server/utils/banner/dissectionPngValidation.ts` exports:

```ts
validateDissectionPng(bytes: Buffer): Promise<{ width: number, height: number }>
```

It rejects invalid or unsupported input with a plain `Error` beginning `Invalid PNG:`. The caller owns HTTP error mapping and must await validation before accepting an upload. The caller must not mutate the input buffer while validation is pending. Validation preserves the original bytes and does not produce or retain an RGBA image.

Limits are 10 MiB for the entire PNG file, 4,096 pixels per edge, 10,000,000 pixels, and 10,000 total chunks. The 2,480 × 3,508 raster fits; pHYs values never establish physical A4 size or override IHDR dimensions. The limits are fixed, with no environment override or raised runtime memory limit.

Accepted images use 8-bit samples, no interlace, standard compression/filter methods, and colour types 0, 2, 3, 4 or 6. Palette indices are checked against PLTE after reversing filters. PLTE and tRNS have colour-specific size, placement, duplicate and sample checks. This strict subset also requires zero high bytes in 8-bit grayscale/RGB tRNS samples.

Fixed-size sRGB, gAMA, cHRM and pHYs chunks are accepted with CRC, size, duplicate, order and integer/enum checks. sRGB must agree with accompanying gAMA/cHRM. cHRM validation covers its encoded integer fields and sRGB consistency, not a colour-management engine's interpretation of arbitrary primaries. No colour conversion occurs.

All other chunks are rejected, including APNG, EXIF, ICC profiles, compressed text, ordinary text and unknown ancillary/critical chunks. This is intentionally a supported upload subset, not universal PNG conformance. Valid images carrying unsupported metadata must currently be re-exported into this subset. JPEG/WebP remain legacy and unverified by this work.

## Content and memory boundary

The helper verifies the signature, first/unique IHDR, chunk type bytes, bounded chunk lengths, every accepted chunk CRC, consecutive IDAT, final empty IEND and exact file EOF before decompression. It then walks the validated IDAT region again using offsets; it never concatenates IDAT payloads or builds a per-chunk array.

Inflation uses a static `node:zlib` import, one pending write of at most 8 KiB and 8 KiB output chunks. Each output chunk is consumed immediately. An output byte count must exactly equal `(width * channels + 1) * height`, and each scanline filter must be 0–4. An excess chunk destroys the inflater immediately, bounding bomb output overshoot to one output chunk. Native zlib verifies the stream/checksum and rejects truncation, raw deflate, gzip and missing preset dictionaries.

For grayscale/RGB/RGBA/gray-alpha, every possible 8-bit channel value is legal, so no full unfiltering is needed. Indexed images reverse every filter using one in-place row of at most 4 KiB and one saved upper-left byte, rejecting indices beyond the palette. The runtime also maintains zlib's bounded window and stream machinery. Garbage awaiting collection can exceed the live working set; the measured figures below include that distinction.

Successful decompression additionally requires `inflate.bytesWritten === total IDAT payload length`. This is actual engine input consumption, not a counter of writes submitted by the helper. The runtime test directly observes a shorter consumed count for both an appended junk byte and a concatenated second zlib stream. The rejection suite also covers tails in a separate IDAT and beyond an 8 KiB feed boundary.

## Verification receipt

Environment: Node `v24.18.0`, pngjs `7.0.0`, Miniflare `4.20260708.1`, actual workerd `1.20260708.1`.

```sh
pnpm exec vitest run test/server/utils/bannerDissectionPngValidation.test.ts
pnpm exec tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck server/utils/banner/dissectionPngValidation.ts test/server/utils/bannerDissectionPngValidation.test.ts
```

Result: **124 tests passed**, and the targeted TypeScript command exited zero. The only test-run warning was the existing Vitest configuration's use of `__dirname` with a future Vite config-loader change. No complete application build or full repository test-suite result is claimed.

The focused suite includes:

- Independent pngjs-encoded grayscale, RGB, grayscale-alpha and RGBA images with every filter, plus exact decoded RGBA pixel comparisons.
- Independently constructed indexed fixtures, verified with pngjs, including all filters, first rows, row/output-chunk boundaries, palette overflow and transparency.
- A4 RGB/RGBA with and without all four accepted metadata chunks, exact pixel comparisons and original-byte preservation.
- Pixel/edge/file/chunk limits, metadata placement/duplicates/values, each supported chunk's CRC, IHDR methods, chunk bounds/types, IEND/EOF and palette/transparency corruption.
- Short/excess scanlines, illegal filters, compressed bombs, checksum/truncation failures, dictionary/raw/gzip rejection and strict compressed-tail accounting.
- Thousands of one-byte IDAT writes and empty IDAT chunks.

The test bundles the actual helper using esbuild and executes it inside Miniflare's real workerd. It asserts the application's current `wrangler.toml` settings and runs with compatibility date `2024-12-01` and flags `nodejs_compat` and `no_handle_cross_request_promise_resolution`. A4 with metadata, all indexed boundary filters and fragmented IDAT inputs succeed there; every malformed fixture in the rejection table fails there. The bundle contains no pngjs module. No new dependency, dynamic import, provider call, database mutation or deployment was added.

## Measured Node memory and CPU comparison

Each row below is a separate `node --expose-gc` process. Fixtures were generated beforehand with pngjs using uniform RGBA input bytes of 137, then encoded as the named colour type. After reading the compressed input, the probe forced GC twice to establish its baseline, sampled `process.memoryUsage()` every 1 ms during validation and at completion, then forced GC twice again while retaining the returned result. The baseline excludes the already loaded input/module memory. `pngjs` uses `PNG.sync.read`; `bounded` uses the actual compiled helper.

CPU is process user+system CPU measured with `process.cpuUsage`; wall time covers the operation, excluding the final forced collections. These representative local fixtures do not establish worst-case CPU, concurrent request capacity or hosted Workers memory use. Interval sampling can miss peaks, especially during synchronous pngjs decoding; the immediate post-call sample still demonstrates its large raster allocations. GC timing varies between runs.

| Fixture | Validator | Wall ms | CPU ms | Sampled peak ArrayBuffer delta MiB | ArrayBuffer delta before final GC MiB | ArrayBuffer delta after final GC MiB | Sampled peak RSS delta MiB |
|---|---|---:|---:|---:|---:|---:|---:|
| A4 RGB | bounded | 29 | 36.441 | 6.625 | 6.625 | 0.063 | 14.97 |
| A4 RGB | pngjs | 133 | 145.727 | 82.972 | 82.972 | 33.187 | 117.61 |
| A4 RGBA | bounded | 39 | 48.112 | 6.563 | 0.938 | 0.063 | 15.14 |
| A4 RGBA | pngjs | 161 | 175.547 | 99.565 | 99.565 | 33.187 | 143.47 |
| 10 MP RGBA | bounded | 45 | 54.103 | 7.000 | 5.688 | 0.063 | 15.17 |
| 10 MP RGBA | pngjs | 177 | 191.130 | 114.443 | 114.443 | 38.147 | 160.59 |
| 16 MP RGBA | bounded, rejected at IHDR | <1 | 0.232 | <0.001 | <0.001 | <0.001 | 0.33 |
| 16 MP RGBA | pngjs | 289 | 303.227 | 183.109 | 183.109 | 61.035 | 253.45 |

Raw measurements and the executable probe are retained in `/private/tmp/banner-ingest-png/memory.jsonl` and `memory.cjs`; focused test logs are alongside them. A prior run of A4 RGB showed 107.86 MiB before final GC, illustrating GC variability rather than a fixed decoder reservation. The implementation's proof is that it does not retain image-sized arrays; the sampled peaks are observations, not configured guarantees.

To reconstruct the memory fixtures and compiled helper from the repository root:

```sh
mkdir -p /private/tmp/banner-ingest-png
node - <<'JS'
const fs = require('node:fs');
const { PNG } = require('pngjs');
for (const [w,h,color,name] of [
  [2480,3508,2,'a4-rgb'], [2480,3508,6,'a4-rgba'],
  [4000,2500,6,'10mp-rgba'], [4000,4000,6,'16mp-rgba']
]) {
  const image = new PNG({width:w,height:h}); image.data.fill(137);
  fs.writeFileSync('/private/tmp/banner-ingest-png/'+name+'.png',
    PNG.sync.write(image,{colorType:color}));
}
require('esbuild').buildSync({
  entryPoints:['server/utils/banner/dissectionPngValidation.ts'],
  bundle:true,platform:'node',format:'cjs',
  outfile:'/private/tmp/banner-ingest-png/validator.cjs'
});
JS
# Run each mode in a separate process with the recorded memory.cjs probe.
node --expose-gc /private/tmp/banner-ingest-png/memory.cjs bounded /private/tmp/banner-ingest-png/a4-rgba.png
node --expose-gc /private/tmp/banner-ingest-png/memory.cjs pngjs /private/tmp/banner-ingest-png/a4-rgba.png
```

## Remaining integration and acceptance

This dispatched change owns only the helper, its test and this report. The coordinator owns upload/jobs/pipeline integration, API error mapping and deciding whether existing UI/help text needs to describe the accepted subset. No candidate source, release branch, DB, provider or hosted runtime was changed. Hosted acceptance, actual user-upload behaviour and app-wide release checks remain separate work. Do not infer those outcomes from these local tests or Node memory figures.

The primary references used for implementation are the [W3C PNG specification](https://www.w3.org/TR/png/), [Node zlib stream and bytesWritten documentation](https://nodejs.org/api/zlib.html#zlibbyteswritten), and [Cloudflare node:zlib documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/zlib/). The workerd consumption test supplies the runtime-specific evidence beyond the documentation's general description.
