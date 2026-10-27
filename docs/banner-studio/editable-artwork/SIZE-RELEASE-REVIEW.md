# Independent size release review — 27 October 2026

## Disposition

**No new P1/P2/P3 source defect established in the reviewed correction.** The two P2 binding findings and the P3 constants handoff discrepancy in `RESUMED-RELEASE-REVIEW.md` are corrected in the exact bytes reviewed here. This is approval of the narrow source correction, not release acceptance: the coordinator owns the active full build, immutable artifact-size acceptance, current-main/release provenance, authenticated live checks and provider acceptance.

The reviewer changed only this report in the original `banner-editable-artwork` workspace. The candidate `banner-artwork-release-20261027` remained read-only; no source fix, full build, commit, fetch, deployment, migration or live provider call was performed.

## Scope and source identity

Read `PAGES-SIZE-REPAIR.md` and `RESUMED-RELEASE-REVIEW.md`, then all ten code/test files in the table below end-to-end: the seven size manifest files plus `artwork.ts`, its API test and `banner-constants.ts`. Supporting reads included the complete PNG validator, immutable size guard and pinned SDK client defaults. The original and candidate copies match every `after` hash in the 12-entry size integration receipt, both before testing and again immediately before writing this report.

Candidate branch: `adme-dev/banner-artwork-release-20261027`, upstream `origin/main`. Local HEAD and local `origin/main` both equal `d45326265f0dec387bd6ae3deb465b616a8f2b68`, divergence `0 0`. Source changes are uncommitted, so these hashes, not HEAD alone, identify the review. Remote freshness was not fetched or certified.

## Findings and examined boundaries

- **Provider capability: prior P2 closed.** `artworkProvider.ts:10-12` treats a present Cloudflare context as authoritative. Missing env, missing/empty/non-string key fails with 503 before transport construction; the local-only fallback remains. The tests assert no constructor invocation for the negative hosted cases.
- **Reference storage: prior P2 closed.** `artwork.ts:143-151` requires a callable request bucket `get` for hosted access. Missing or malformed hosted storage fails before ambient read, provider invocation or rate-limit consumption. Both generation and native lettering negative cases and a positive native bucket read pass. The shared helper also serves repair. Asset client equality, unscoped ownership checks, selected saved URL matching and streamed byte budgets remain in place; there is no client-supplied URL fetch or hosted ambient fallback.
- **Transport: no new finding.** The origin and three endpoint paths are fixed, bearer credentials are explicit, redirects are manual and rejected, and there is one POST without retries. The timeout covers fetch and stream consumption. Both declared size and consumed bytes are bounded; failures discard upstream error text. Image generation and mixed PNG/JPEG edit fields, names, MIME and bytes, native chat JSON and request IDs match the pinned SDK in the tested configuration. This is the application's three-operation wire contract, not universal SDK parity: ambient SDK base URL, organization/project defaults, telemetry and SDK error classes are not implemented. No application configuration using those organization/project overrides was found in the inspected server/config sources.
- **PNG validation: no weakening.** The validator is byte-identical to the prior reviewed correction (`10799763c545c681f7f52f47e530f2cc636b0d3ffcc56e0b5bf0775b4b196368`) in both workspaces. Provider output still passes base64/byte/pixel gates before PNG validation, including noninterlaced supported IHDR encoding, chunk bounds, duplicate IHDR/APNG rejection, final IEND, CRC decode, dimensions, visible pixels and requested transparency/clear edges. Existing generation reference header inspection remains distinct from decoded provider-output validation.
- **Icon compaction: no new finding.** The change reuses the existing AST literal encoder and lazy Brotli string decoder only at the generated virtual entry boundary, before deployed minification and filename rewriting. It preserves full collection JSON and registration code, excludes dynamic/tagged templates/property keys, checks actual byte savings and is idempotent. Real workerd tests preserve all fixture data, function names and repeated registration after minification and renaming. Existing SQL, SSR, dispatcher and shared-decoder runtime suites pass. This reviewer did not repeat the prior worker's separate 621-icon real-corpus measurement.
- **Constants handoff: prior P3 closed.** The candidate now matches the requested constants hash and retains the direct `#shared/bannerFormats` re-export without the unused local import. No new functional change was introduced by that correction.

## Independent verification

On explicit Node **24.18.0**, in the ORIGINAL workspace, **195 tests passed across 19 files**, exit 0 (Vitest duration 2.35 seconds):

```sh
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run \
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
  test/banner/letteringRepairImage.test.ts \
  test/server/utils/bannerArtworkPngBounds.test.ts \
  test/server/utils/bannerArtwork.test.ts
```

An additional in-memory esbuild/Miniflare probe bundled the real transport with a synthetic key and a 100ms deadline at compatibility date `2024-12-01`. Four independent outbound-service fixtures passed: 307 redirect to a different origin, chat Content-Length 65,537, actual chat body 65,537 bytes, and a response stream that emits `{` then stalls indefinitely. Each asserted exactly one request to the fixed chat endpoint with the synthetic bearer key and exactly the sanitized failure message; each worker was disposed. No request reached OpenAI. These four probes are additional checks, not included in the 195 Vitest total.

ESLint passes with zero warnings for the nine server/script/test files. **The full ten-file lint command exits 1** because `app/utils/banner-constants.ts` has 162 existing stylistic errors. To isolate the correction, reconstructed its exact receipt-before bytes in memory by reinserting the removed import at line 7; SHA-256 matched `1c8c288ee141f54c593300ec957921208c94d22248e0747bbfa2ce645f6469ee`. That exact prior file has 164 errors: the same 162 stylistic errors plus `import/first` and `@typescript-eslint/no-unused-vars`. Thus this correction removes two lint errors and introduces none; this report does not claim the entire scope is lint-clean. No lint autofix ran.

Scoped tracked `git diff --check` passed. Vitest emitted the existing native-config `__dirname` warning. The immutable size guard is unchanged in both workspaces, SHA-256 `6f67d9bd19db9b35e86dd1204a1df3f3c65afe5ccd22a857a8c11cafdfdb72b7`; its tests pass. A passing guard test is not a passing complete release artifact.

## Remaining acceptance

Root must obtain the complete build and immutable raw/gzip artifact result, re-establish current remote ancestry before integration/release, and record the source commit, deployment target and ID. Authenticated preview/save/reopen, real asset delivery, QR/navigation and shared video/realtime checks remain release work. Hosted OpenAI/storage/queue/Neon delivery, scheduler behavior, paid cost, image fidelity and full reconstruction are not established by these local tests. No new source correction is requested by this review; the existing lint debt is explicitly recorded above.

## Exact integration hashes

Receipt SHA-256: `3dab1f2f03141c84edb33e8b71748b187e8369e7d0606e6a83b0deed89dff74d`.

Snapshot UTC: `2026-10-27T08:05:12.161532+00:00`. All entries match in original and candidate.

| File | SHA-256 |
| --- | --- |
| `scripts/compact-worker-static-data.mjs` | `512a1de86ba35711b9c4f63845b18ae173742e8793422f829da2d0bf08c7e3a5` |
| `scripts/wrap-worker.mjs` | `8502ba11dee361a4741532da2d8d4281db2085dc379da8a1634532853e8eec98` |
| `server/utils/banner/artworkTransport.ts` | `8445d7d9ebe04cd7626fde6ef01639bbc039ae2bcf2599f842854ead8b0d00bb` |
| `server/utils/banner/artworkProvider.ts` | `0c1c9c07d41768fdac08c65a8afa368b46a6473226166e1eb743ff51865045c4` |
| `test/config/workerIconDataCompaction.test.ts` | `dd744d43b2d2bbffeb57c64ef49b44d1eb6c565e93c4bcdf1544ff68e6a01756` |
| `test/server/utils/bannerArtworkTransport.test.ts` | `c49100a8ad1466828f7d350a85a6da12255c8055c8fea889015cb023fb3a6410` |
| `test/server/utils/bannerArtworkProvider.test.ts` | `c89d61c4e9609734776460335f1dd3aec97d119e2bf6b91bdb6431d57ab7317a` |
| `server/utils/banner/artwork.ts` | `7e0cfbadd06bdff3ef442fc80dbbf1bf3290c7605e6141a05dab4dbb14a9aaa4` |
| `test/server/api/bannerArtwork.test.ts` | `55646bcbe15f9a6b3f81e08a0bca9043d0d9d636902a007d6691a93d07742c02` |
| `app/utils/banner-constants.ts` | `047a1eba35fa25f157865e66de5ccac58279b001c5e02ef03e813fbd0de1312d` |
| `docs/banner-studio/editable-artwork/PAGES-SIZE-REPAIR.md` | `e30228d1c1266fc54d1d307ca84e29076005851322d13d5beaaaaa1a45ae87e9` |
| `docs/banner-studio/editable-artwork/RESUMED-RELEASE-REVIEW.md` | `9f840c01609c5d40195672e8c435d8c2938272990d40a743d7bdd291edd3d84c` |
