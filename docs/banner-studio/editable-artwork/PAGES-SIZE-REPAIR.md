# Pages size repair — 27 October 2026

Status: narrow source correction implemented and locally verified; coordinator owns candidate integration, complete build, immutable size acceptance, and release. No candidate files, deployment, commits, size limits, authentication guards, or PNG validation were changed by this worker.

## Evidence and cause

Read-only candidate: `/Users/paulgiurin/orca/workspaces/dashboard/banner-artwork-release-20261027`, coordinator-provided HEAD `d45326265`. The retained `/private/tmp/banner-resumed-build-20261027.log` ends with raw **25,720,161 / 25,468,928** bytes (**251,233 over**) and gzip **7,492,133 / 9,750,000**. This is the red complete-build evidence; it is not replaced by a smaller test budget.

Two concrete contributions were identified:

1. `openai@6.46.0` eagerly constructs all resource families in its root client (including admin, assistants, realtime, evals, containers, etc.). Artwork only uses non-streaming image generation, image edits, and chat completion POSTs. The entire resource tree survived ordinary bundling. Zod was already baseline functionality and was retained.
2. The generated Nuxt virtual entry contains a 193,122-character JSON string containing two icon collections and 621 icons. Existing static-data compaction did not scan that boundary. The complete icon data is retained and now uses the existing lossless Brotli decoder pattern.

Measured in-memory, without editing candidate artifacts:

| Boundary | Before bytes | After bytes | Saved bytes |
| --- | ---: | ---: | ---: |
| Artwork provider, minified esbuild ESM, `h3` external | 528,922 | 388,630 | 140,292 |
| Same provider, function names retained | 549,152 | 400,723 | 148,429 |
| Retained icon entry, conservative name-preserving re-minification | 643,542 | 477,042 | 166,500 |

The first and third measurements total 306,792 bytes, more than the original overflow by 55,559 bytes. This is a measured component estimate, **not proof of the final Pages artifact size**: Rollup partitioning, shared dependencies, and concurrent reviewed changes can affect the complete build. The immutable guard still decides release acceptance.

## Correction and preserved contracts

`artworkTransport.ts` replaces the SDK runtime import with three explicit POST operations at the fixed official `https://api.openai.com/v1` origin. It sends the existing JSON fields and multipart `image[]` filenames, MIME types, and bytes, reads `x-request-id`, makes no retries, and keeps the 120-second deadline active through body consumption. Image response bodies are capped at 13 MiB; native-style response bodies at 64 KiB. Both declared lengths and actual streamed bytes are bounded. Non-2xx, malformed JSON, timeouts and oversized bodies produce a sanitized error. Workerd requires `redirect: 'manual'`; every 3xx is rejected without following it.

The coordinator's Cloudflare-authoritative credential resolution and its five new regressions remain intact. Local credential fallback still requires absence of Cloudflare context. Existing image validation, output dimensions, transparency, copy protection, revision checks and model selection are unchanged.

Earlier descriptions of a production SDK-based image adapter are superseded by this correction: production uses the bounded transport. The pinned SDK remains useful as a development-only wire-parity oracle and for erased TypeScript types; no OpenAI SDK runtime inputs remain in the production provider bundle. The coordinator owns any dependency classification change.

Icon encoding only replaces recognized static collection JSON within the generated virtual entry. Registration calls, all icons, named functions, unrelated JSON, tags, property keys and dynamic templates are preserved. Repeated compaction is byte-stable. No broad function-name removal was added.

## Verification

Red tests observed before implementation:

- Provider dependency regression failed at 528,922 bytes against a local 420,000-byte regression threshold, independently of the unchanged release guard.
- Icon compaction capability tests failed before the helper existed.
- Explicit response-limit/error tests failed before bounded reading and sanitization.
- Real workerd multipart test rejected `redirect: 'error'`; corrected to manual/no-follow and rerun successfully.

Final focused run: **182 tests passed in 17 files**:

```sh
pnpm exec vitest run \
  test/config/workerIconDataCompaction.test.ts \
  test/config/workerStaticDataCompaction.test.ts \
  test/config/workerSqlDataCompaction.test.ts \
  test/config/workerSqlTemplateCompaction.test.ts \
  test/config/workerSharedCandidateCompaction.test.ts \
  test/config/workerPostbuildCompaction.test.ts \
  test/config/workerSizeGuard.test.ts \
  test/config/workerDispatcher.test.ts \
  test/workers/workerCompactModuleRuntime.test.ts \
  test/workers/workerStaticDataRuntime.test.ts \
  test/workers/workerSqlDataRuntime.test.ts \
  test/workers/workerSqlTemplateRuntime.test.ts \
  test/server/utils/bannerArtworkTransport.test.ts \
  test/server/utils/bannerArtworkProvider.test.ts \
  test/server/api/bannerArtwork.test.ts \
  test/server/api/bannerLetteringRepair.test.ts \
  test/banner/letteringRepairImage.test.ts
```

Coverage includes actual Request serialization against the pinned SDK for all three POSTs; mixed PNG/JPEG multipart in workerd; failures at 401/429/500; hung connection and response stream; declared/streamed oversized responses; malformed JSON; no redirects; immutable size-guard tests; and existing SQL/SSR compaction runtime regressions. A separate in-memory corpus check round-tripped all **621 actual retained icons in two collections** with deep equality. The automated workerd icon fixture also verifies all data and repeated registration after minification and filename rewriting.

Scoped ESLint passed for all seven code/test files below. A standalone TypeScript check of `artworkTransport.ts` passed (`--noEmit --skipLibCheck --target es2022 --module nodenext --moduleResolution nodenext --types node`). Scoped `git diff --check` passed. Vitest prints the existing native-config `__dirname` warning. No full build or hosted/provider invocation was performed by this worker.

## Coordinator copy manifest

Copy these seven files plus this report from the original writable worktree; do not overwrite the separately owned `artwork.ts` or API test changes.

```text
512a1de86ba35711b9c4f63845b18ae173742e8793422f829da2d0bf08c7e3a5  scripts/compact-worker-static-data.mjs
8502ba11dee361a4741532da2d8d4281db2085dc379da8a1634532853e8eec98  scripts/wrap-worker.mjs
8445d7d9ebe04cd7626fde6ef01639bbc039ae2bcf2599f842854ead8b0d00bb  server/utils/banner/artworkTransport.ts
0c1c9c07d41768fdac08c65a8afa368b46a6473226166e1eb743ff51865045c4  server/utils/banner/artworkProvider.ts
dd744d43b2d2bbffeb57c64ef49b44d1eb6c565e93c4bcdf1544ff68e6a01756  test/config/workerIconDataCompaction.test.ts
c49100a8ad1466828f7d350a85a6da12255c8055c8fea889015cb023fb3a6410  test/server/utils/bannerArtworkTransport.test.ts
c89d61c4e9609734776460335f1dd3aec97d119e2bf6b91bdb6431d57ab7317a  test/server/utils/bannerArtworkProvider.test.ts
```

Remaining acceptance: coordinator copies the reviewed sources, runs the full build and immutable raw/gzip check, then performs its release/authenticated preview/provider acceptance. These local transport tests do not establish hosted OpenAI delivery or creative fidelity.
