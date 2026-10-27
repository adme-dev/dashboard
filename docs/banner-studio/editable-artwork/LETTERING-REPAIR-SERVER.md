# Flat lettering repair — server implementation

27 October 2026. Local backend complete; provider quality, hosted execution and full product acceptance remain unverified. This is the bounded background-repair continuation of [LETTERING-WORKFLOW.md](LETTERING-WORKFLOW.md), not automatic poster reconstruction.

## Contract

`POST /api/agency/banner-studio/ai/repair-lettering` delegates to `proposeLetteringRepair` in `server/utils/banner/artwork.ts`.

`shared/bannerLetteringRepair.ts` exports:

- `letteringRepairRegionSchema`, `letteringRepairRequestSchema`.
- `LetteringRepairRegion`, `LetteringRepairRequest`, `LetteringRepairProposal`.
- `letteringRepairEligibilityIssue(layer, layers, region?, sourceDimensions?)`, shared by server and UI.

Request: `projectId`, saved `sourceRevision`, `formatKey`, saved image `layerId`, `region: {x,y,w,h}`, `sourceWording`, exact replacement `wording`, and `regionReviewed: true`. `instruction`, `referenceAssetId`, and expected `sourceImageHash` are optional. Coordinates are fractions of the full source image; every value is finite and within 0–1, dimensions are positive, and the rectangle must remain inside the source. Strict schemas reject additional input properties. Wording is not trimmed or rewritten; blank wording is rejected.

Response: `proposalId`, `projectId`, `sourceRevision`, `formatKey`, `layerId`, original normalized `region`, integer `pixelRegion`, exact `sourceWording` and `wording`, `sourceAssetId`, original-byte SHA-256 `sourceImageHash`, `backgroundAsset: {id,url,width,height,sha256}`, `evidence: {provider,model,requestId,cost:null}`, `warnings`, and `verification: 'review-required'`.

The background is a new private full-source-size PNG. No project/canvas mutation occurs. The UI must preview the complete repair, create native text from exact wording and editable style, fence the saved revision and local snapshot, and apply background plus native text atomically with undo. The existing native AI panel can refine the resulting text separately.

## Enforced boundaries

1. Require write access, current project ownership/client access, and an exact saved revision before looking up the owned selected asset. Asset client scope and uploader rules match existing artwork proposals. The asset URL must equal the saved layer source; arbitrary remote source fetches are not accepted.
2. Reject selected locked/hidden, managed QR, logo, protected copy, masks/mask targets, crop, transforms, active animation, feed bindings, filters/blending, partial layer opacity and rounded/bordered source layers. Detected commercial/legal source wording is also excluded, even for an identical replacement. Creative wording cannot introduce protected facts or change detected offer brands.
3. Reject region overlap with separate managed QR, locked, logo or protected-copy layers, including commercial words retained in raster lettering recipes. Unknown or transformed/animated protected geometry fails closed. The region must map directly through `fit: fill`, or source/layer aspect ratios must agree for cover/contain.
4. Reject APNG and PNG orientation metadata, and conservatively reject EXIF-bearing JPEGs because browser orientation is not implemented by the JPEG decoder. Accept static owned PNG/JPEG within existing 8 MiB source/normalized byte and 4,194,304 decoded-pixel limits, with no dimension over 4096. No resizing silently reduces the source. Larger print sources remain unsupported by this bounded path.
5. Reuse catalogue feature `banner_lettering_raster`, existing supported OpenAI image models, fail-closed provider credentials/private delivery, and the shared per-user artwork admission limit of 12 requests/hour. This is an invocation/size bound, not a verified monetary ceiling. Actual cost stays unknown.
6. Send exactly one cropped reference and make one provider image edit call. The existing adapter disables SDK retries and bounds output bytes/pixels. No native-style call, OCR call or fallback inference is performed. User instructions are data within the background-only prompt.
7. Crop inward to complete pixels: start is `ceil(x * width), ceil(y * height)` and end is `floor((x+w) * width), floor((y+h) * height)`. Reject empty pixel rectangles. Deterministically resize provider repair pixels using nearest-neighbour sampling and replace RGBA only inside `pixelRegion`. Outside decoded pixels, including transparent RGB and alpha channels, remain identical. JPEG comparisons use the decoded original JPEG; this does not claim encoded-byte identity, ICC preservation or print fidelity.
8. Recheck saved revision, artboard content and client identity before dispatch, after provider completion, after upload and after asset insertion. Re-read and hash owned source bytes after inference and during persistence. Stale or changed source results are never returned. Upload/asset cleanup is attempted on failure; cleanup uses existing best-effort storage behavior and is not a distributed transaction. A project change after the final read still requires the client's apply-time fence.
9. Persist only the private review-required output asset; original source and other layer records remain untouched. Invocation evidence uses `mode: lettering-repair`, actual request ID when available, no customer wording in ledger metadata, and unknown cost.

## Verification

Fresh local run after the final source changes:

```sh
pnpm exec vitest run test/server/api/bannerLetteringRepair.test.ts test/server/utils/bannerLetteringRepair.test.ts test/server/api/bannerArtwork.test.ts test/server/utils/bannerArtwork.test.ts test/server/utils/bannerArtworkProvider.test.ts
```

Result: **5 files, 83 tests passed**, including **61 repair-specific tests**. Real PNG/JPEG CPU decoding, cropping and compositing run against deterministic fixtures; external auth/database/storage/provider dependencies are test doubles. Tests cover invalid bounds, reviewed confirmation, exact wording, write/client ownership, cross-client references, source URL/hash mismatch, saved wording mismatch, stale revisions before/after inference and during upload/insertion, changed source bytes, source replacement with unchanged revision, post-call client reassignment, provider error/invalid output, one cropped provider call, no document write, outside-region RGBA preservation, JPEG dimensions/pixels, protected overlap, unsafe rendering state, APNG/EXIF exclusion, unavailable private delivery/credentials/model/budget and late-output cleanup.

Scoped ESLint passed for all six changed/new source and test files. A standalone TypeScript check passed for the shared contract and pixel utilities:

```sh
pnpm exec tsc --noEmit --skipLibCheck --esModuleInterop --moduleResolution bundler --module esnext --target es2022 shared/bannerLetteringRepair.ts server/utils/banner/artworkValidation.ts
```

This is not a full-repository typecheck/build or hosted acceptance. The existing Vite `__dirname` migration advisory appeared during Vitest and did not fail the run. No live provider invocation, live asset write, database migration, commit or deployment was performed. Coordinator owns actual Nuxt browser proof and final integration review.

## Source checkpoint and resume

Worktree: `/Users/paulgiurin/orca/workspaces/dashboard/banner-editable-artwork`; branch: `adme-dev/banner-editable-artwork`. Existing dirty work was preserved. The worker verified `d4560047` is an ancestor of HEAD and `HEAD...origin/main` is `1 0` at the local checkpoint; no release freshness claim is made.

Owned changes:

- `shared/bannerLetteringRepair.ts` (new).
- `server/utils/banner/artwork.ts` (repair orchestration and optional persistence validation).
- `server/utils/banner/artworkValidation.ts` (static source screening and pixel helpers).
- `server/api/agency/banner-studio/ai/repair-lettering.post.ts` (new).
- `test/server/api/bannerLetteringRepair.test.ts` (new).
- `test/server/utils/bannerLetteringRepair.test.ts` (new).
- This report.

No changes to existing `shared/bannerArtwork.ts`, UI/store, provider adapter or model registry were made by this worker.

Stable source hashes delivered to coordinator:

```text
fe3336d69fedf2cd3ebc82275ae75091fcb11cd92bcb598f3456ed07768aa263  shared/bannerLetteringRepair.ts
97c1273c72fb08e6cf7f1dcfb8610dc1abbdb17487c828e3cf8abf2253bfad55  server/utils/banner/artwork.ts
8772aa4dea0431f69f58e210e2eccccb8237952502464cff7944648a97447ffb  server/utils/banner/artworkValidation.ts
```

Next: coordinator validates preview/apply/undo/save/reopen and source-hash fencing in the real editor using explicit fixtures; then separately arrange an authorised real-provider visual review. Review residual/ghost text, background seams, damage to adjacent artwork, editable native wording and style before acceptance. Neither fixture pixels nor a successful provider response proves clean background recovery or visual fidelity.
