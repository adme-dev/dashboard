# Raster download independent review

Reviewed 27 October 2026 in the original `banner-editable-artwork` workspace. Verdict: **no remaining blocking finding in the reviewed download change** after the coordinator corrected the scoped lint failure. This is a local source and mocked-flow review, not release or real-browser download acceptance.

## Scope and source identity

Read the entire `app/components/banner/BannerExportModal.client.vue`, the new `app/utils/bannerRasterExportDownload.ts`, and `test/banner/rasterExportDownload.test.ts`. Also inspected the private delivery route and renderer response validation to check the frontend contract, and ran their focused tests. Reviewer changed only this report.

The worktree is substantially dirty. Local HEAD is `47ec30c3522f6ab660d730776709770c8a22d7c8` on `adme-dev/banner-editable-artwork`, with no configured upstream. The cached `origin/main` is `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958` (HEAD is 1 ahead / 11 behind that cached ref). No remote fetch, branch reconciliation, candidate modification, authentication, or deployment was performed; these refs do not establish current release readiness.

Final reviewed SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `app/components/banner/BannerExportModal.client.vue` | `1393c9006293f2a2b6fb7876139d5054ac0338cfc75de778c0db516224686e41` |
| `app/utils/bannerRasterExportDownload.ts` | `eaf56dc737aac2c2626e8d9247bce91de0cd9fc322660973ae0c70cbd86017e2` |
| `test/banner/rasterExportDownload.test.ts` | `258bc5b96b610ddd1fc04b388acd68f93a24c419bc06a606312caafd8e639c16` |

## Findings and resolution

1. **Resolved quality blocker:** initial ESLint failed at component line 143 with `@stylistic/max-statements-per-line` for the inline `try { a.click() } finally` block. Reported immediately through Orca escalation; the coordinator expanded the block. Final scoped ESLint passes.
2. **Nonblocking coverage gap:** the committed helper tests do not execute the component's single-file/ZIP orchestration, busy guards, missing-result count, captured settings, or anchor lifecycle. A separate in-memory component probe exercised those paths successfully during this review, but it is not a persisted regression test. Persisting component-level tests would protect the wiring as well as the helper.

No additional functional regression was identified in the changed paths. Existing raw controls and dimension-based ZIP filenames predate this change and were not changed or certified by this review.

## Behavior checked

- Single PNG/JPG/GIF exports fetch validated bytes and use the Blob anchor download path; they no longer depend on an asynchronous `window.open` call.
- Both raster ZIP loops use the same validation helper. An HTTP error, wrong media type, or byte-length mismatch exits before ZIP generation/download, displays an error, leaves the modal open, and clears busy/progress state through `finally`.
- The helper permits only the relative private export download route, sends same-origin credentials, rejects redirects, rejects unsuccessful HTTP responses, compares the media type, and requires the downloaded Blob length to match a positive safe-integer declared size no greater than 20 MiB. This matches the inspected server's current per-item limit. It validates transport metadata/length, not image decoding; encoded-image validation occurs in the inspected renderer boundary.
- Returned result count must equal requested count before downloading. Server-side response validation also checks requested item keys and order. The client count check alone does not validate result identity.
- Image format, image quality, GIF fps, and project filename are captured before async work. Changing controls while a request is pending does not relabel its completed output.
- Raster entry points guard duplicate calls while busy. Export buttons are disabled during work. Shared HTML/ZIP Blob downloads now append and remove the anchor and defer URL revocation by one second; MP4 queue code is unchanged.

## Verification evidence

Runtime: Node `24.18.0` from `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin`.

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH node node_modules/vitest/vitest.mjs run test/banner/rasterExportDownload.test.ts test/server/api/bannerImageRenderingDownload.test.ts test/server/api/bannerImageRendering.test.ts --maxWorkers=1
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH node node_modules/eslint/bin/eslint.js app/components/banner/BannerExportModal.client.vue app/utils/bannerRasterExportDownload.ts test/banner/rasterExportDownload.test.ts
```

Final results: **67 tests passed across 3 files**, exit 0; **scoped ESLint passed**, exit 0. Vitest emitted the existing Vite native-config-loader warning about `__dirname`; it did not fail the run.

An additional inline Node probe transpiled the current component script with TypeScript and executed it in a VM with Vue refs/computed, mocked API/DOM/ZIP dependencies, and the real download helper. All seven scenarios passed: PNG, JPG, GIF, HTTP failure, missing results, ZIP fetch failure, and ZIP success. Assertions checked duplicate request suppression; captured names/options; expected download, toast, and close behavior; busy/progress reset; and scheduled 1000 ms URL revocation. This probe created no repository test or product file and does not prove browser DOM behavior or real ZIP encoding.

## Limits

No browser session, provider request, live authentication, hosted storage/renderer verification, build, deployment, or full-suite run was performed. Passing mocks prove local control flow and the inspected contract; they do not prove an actual browser saved the file, validate browser download policies across engines, or establish hosted creative correctness. The review applies only to the source hashes above.
