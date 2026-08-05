# Leapmotor Uploaded-Image Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an active XeroFlow owner securely upload the supplied Leapmotor JPEG and create, preview, and download an editable five-second animated 300×250 Banner Studio draft without publishing it.

**Architecture:** Add a focused asset validator and a transaction/audit-bound God Mode upload coordinator around the existing R2-plus-Neon upload route. Keep project creation on the already-coordinated project POST, supplying the complete animated canvas in one request so the test does not depend on an uncoordinated PATCH. Centralise browser upload identity/digest handling, repair the asset-list contract, then deploy and exercise the entire flow through Paul's authenticated production session.

**Tech Stack:** Nuxt 4/Nitro, Vue 3, Nuxt UI v4, Neon Postgres, Cloudflare R2/Pages, Vitest, Web Crypto SHA-256, Kimi WebBridge, existing MCP banner renderer.

## Global Constraints

- Preserve the supplied 296×296 Leapmotor artwork exactly; do not regenerate, rewrite, or crop the readable foreground.
- The first project name is `Leapmotor C10 Hybrid EV — Animated MRec`; format is `mrec` at exactly 300×250.
- The timeline is five seconds and remains editable as ordinary Banner Studio layer data.
- The result remains a draft; never publish, launch an ad, or invoke an advertising-platform money mover.
- Owner God Mode still enforces authentication/session validity, exact active-owner authority, isolation, immutable audit, emergency disable, provider/secret boundaries, and SSRF protection.
- God Mode upload retries reuse one stable idempotency key after ambiguous network failure and rotate only after an authoritative HTTP response.
- Validate actual magic bytes, bounded size, canonical MIME, filename, and caller digest before storage.
- Compensate any newly uploaded R2 object if its database/audit transaction cannot commit.
- Ordinary authenticated-user upload behaviour and permission checks remain available.
- Any form-touching frontend work must first apply the mandatory project `frontend-design` skill and continue using Nuxt UI v4 components.
- Update the relevant public feature pages in the same implementation.

---

### Task 1: Banner Asset Validation Boundary

**Files:**
- Create: `server/utils/banner/assetUploadValidation.ts`
- Test: `test/server/utils/bannerAssetUploadValidation.test.ts`

**Interfaces:**
- Consumes: multipart file shape `{ filename?: string, type?: string, data: Uint8Array | Buffer }`.
- Produces: `validateBannerAssetUpload(file): ValidatedBannerAssetUpload` and `digestBannerAssetUpload(input): string`.
- Produces type: `ValidatedBannerAssetUpload = { buffer: Buffer, fileName: string, mimeType: SupportedBannerAssetMime, size: number, requestDigest: string }`.

- [ ] **Step 1: Write failing validation tests**

Cover valid JPEG/PNG/GIF/WebP/MP4/WebM signatures, empty files, image files over 20 MiB, video files over 100 MiB, claimed MIME/signature mismatch, unsupported SVG/audio/executable content, path-bearing filenames, control characters, and deterministic SHA-256 request digests.

```ts
it('normalises and validates the supplied JPEG from magic bytes', () => {
  const data = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  expect(validateBannerAssetUpload({ filename: '../Leap Motor C10.JPG', type: 'image/jpeg', data }))
    .toMatchObject({ fileName: 'Leap-Motor-C10.jpg', mimeType: 'image/jpeg', size: 6 })
})

it('rejects a MIME/signature mismatch', () => {
  expect(() => validateBannerAssetUpload({
    filename: 'car.jpg', type: 'image/jpeg', data: Buffer.from('GIF89a')
  })).toThrowError(/does not match/i)
})
```

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run test/server/utils/bannerAssetUploadValidation.test.ts
```

Expected: FAIL because `assetUploadValidation.ts` and its exports do not exist.

- [ ] **Step 3: Implement the validator**

Implement exact signature detection and limits without trusting the extension or browser MIME:

```ts
export const MAX_BANNER_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_BANNER_VIDEO_BYTES = 100 * 1024 * 1024

export type SupportedBannerAssetMime =
  | 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  | 'video/mp4' | 'video/webm'

export interface ValidatedBannerAssetUpload {
  buffer: Buffer
  fileName: string
  mimeType: SupportedBannerAssetMime
  size: number
  requestDigest: string
}
```

Use a six-character-or-longer safe basename, replace whitespace/unsafe runs with `-`, cap the stem at 96 characters, and force the extension derived from detected MIME. Compute the request digest over canonical JSON containing `{ fileName, mimeType, size, contentSha256 }`.

- [ ] **Step 4: Run focused tests and static checks**

Run the Task 1 Vitest file, targeted ESLint, and `git diff --check`. Expected: all green.

- [ ] **Step 5: Commit Task 1**

```bash
git add server/utils/banner/assetUploadValidation.ts test/server/utils/bannerAssetUploadValidation.test.ts
git commit -m "feat(banner): validate uploaded asset content"
```

---

### Task 2: Transaction-Bound Owner Upload Coordination

**Files:**
- Create: `server/utils/banner/godModeAssetUpload.ts`
- Modify: `server/api/agency/banner-studio/assets/upload.post.ts`
- Modify: `server/plugins/godModeExecution.ts`
- Test: `test/server/utils/bannerAssetGodModeMutation.test.ts`
- Test: `test/server/api/bannerAssetUpload.test.ts`

**Interfaces:**
- Consumes: stable `Idempotency-Key` and `X-Banner-Upload-Digest` headers.
- Consumes: Task 1 `ValidatedBannerAssetUpload`.
- Produces: `prepareGodModeBannerAssetUpload(event, deps)` for `POST /api/agency/banner-studio/assets/upload`.
- Produces: `executeGodModeBannerAssetUpload(event, upload)` returning a replayable `BannerAsset`.
- Produces: `registerGodModeBannerAssetUploadFamily()`.

- [ ] **Step 1: Write failing coordinator tests**

Model the existing banner-project coordinator but test the storage/database split explicitly:

```ts
it('binds one upload digest to one stable owner key and replays the stored asset', async () => {
  // First call uploads once and commits asset row + terminal audit.
  // Second call with the same actor/key/digest loads the original asset row.
  expect(uploadFile).toHaveBeenCalledTimes(1)
  expect(replayed.id).toBe(created.id)
})

it('deletes the new R2 object when terminal audit cannot commit', async () => {
  appendAudit.mockRejectedValueOnce(new Error('audit unavailable'))
  await expect(runUpload()).rejects.toThrow('audit unavailable')
  expect(deleteBannerFile).toHaveBeenCalledWith('banner-assets/owner/object/car.jpg')
})
```

Also cover missing/invalid key (428), missing/malformed digest (428), digest mismatch (409), key reused for another route/digest (409), in-progress/failed replay rejection (409), replay row missing (409), upload failure before DB write, DB failure after R2 upload, and ordinary non-God-Mode execution.

- [ ] **Step 2: Run the focused coordinator/API tests and observe RED**

Run both new test files. Expected: FAIL because the coordinator and header-bound route behaviour do not exist.

- [ ] **Step 3: Implement the upload coordinator**

Use the existing `god_mode_execution_ledger` with `executor_class = 'local-transactional'`, `channel = 'application'`, and the header digest stored as `execution_metadata.requestDigest`. Use one savepoint for the asset-row insert. Persist `result_reference = banner_assets.id` and audit `entityType = 'banner_asset'`.

Track a newly uploaded R2 key only in execute mode. If the transaction, terminal audit, or route mutation fails, await `deleteBannerFile(r2Key)` before surfacing the bounded failure. Never delete on completed replay.

```ts
export interface BannerAssetUploadResult {
  id: string
  name: string
  mimeType: string
  fileSize: number
  r2Key: string
  url: string
  thumbnailUrl: string | null
  tags: string[]
  uploadedBy: string
  createdAt: string
}
```

- [ ] **Step 4: Integrate validation, digest verification, R2 storage, and DB insert**

The route must:

1. `requireAuth(event)`.
2. Read exactly one multipart `file` field.
3. Call `validateBannerAssetUpload(file)`.
4. Compare `validated.requestDigest` with `X-Banner-Upload-Digest` using a timing-safe comparison for active coordinated God Mode requests.
5. Upload the validated bytes using the canonical filename/MIME.
6. Insert/replay through `executeGodModeBannerAssetUpload`.
7. Return the existing `BannerAsset` response shape.

Register the exact route family in `server/plugins/godModeExecution.ts`; do not broaden it to asset deletion, project PATCH, exports, or AI image routes.

- [ ] **Step 5: Run regression and security tests**

Run the two new test files plus:

```bash
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run \
  test/server/middleware/godMode.test.ts \
  test/config/godModeGateInventory.test.ts \
  test/config/godModeIsolationInventory.test.ts \
  test/server/utils/bannerProjectGodModeMutation.test.ts
```

Expected: all pass, no route-family broadening, and `git diff --check` clean.

- [ ] **Step 6: Commit Task 2**

```bash
git add server/utils/banner/godModeAssetUpload.ts \
  server/api/agency/banner-studio/assets/upload.post.ts \
  server/plugins/godModeExecution.ts \
  test/server/utils/bannerAssetGodModeMutation.test.ts \
  test/server/api/bannerAssetUpload.test.ts
git commit -m "feat(banner): coordinate owner asset uploads"
```

---

### Task 3: Stable Browser Upload Identity and Asset Library Contract

**Files:**
- Create: `app/utils/bannerUpload.ts`
- Modify: `app/components/banner/AssetsPanel.client.vue`
- Modify: `app/components/banner/inspector/Background.vue`
- Modify: `app/components/banner/BrandKitManager.vue`
- Modify: `server/api/agency/banner-studio/assets/index.get.ts`
- Test: `test/app/bannerUpload.test.ts`
- Test: `test/server/api/bannerAssetList.test.ts`

**Interfaces:**
- Consumes: a browser `File` and a caller-retained idempotency key.
- Produces: `prepareBannerUploadRequest(file, key): Promise<{ body: FormData, headers: Record<string,string> }>`.
- Produces: `nextBannerUploadKey(): string` and reuses `isAmbiguousApiFailure(error)` from `app/utils/apiError.ts`.
- Asset GET response is consistently `{ assets: BannerAsset[] }`.

- [ ] **Step 1: Invoke and apply the mandatory frontend-design skill**

Read the project-mandated frontend-design skill before modifying any upload/form caller. Preserve the existing layout and hidden native file-control boundary; do not introduce a second upload surface, generic AI styling, raw dialog, or browser alert.

- [ ] **Step 2: Write failing browser-helper and API-contract tests**

```ts
it('hashes the canonical validated upload identity and sends stable headers', async () => {
  const file = new File([jpegBytes], 'Leap Motor.jpg', { type: 'image/jpeg' })
  const request = await prepareBannerUploadRequest(file, 'banner-upload:fixed-key')
  expect(request.headers['Idempotency-Key']).toBe('banner-upload:fixed-key')
  expect(request.headers['X-Banner-Upload-Digest']).toMatch(/^[a-f0-9]{64}$/)
  expect(request.body.get('file')).toBe(file)
})

it('returns the asset wrapper expected by every picker', async () => {
  expect(await handler(event)).toEqual({ assets: [expect.objectContaining({ id: 'asset-1' })] })
})
```

- [ ] **Step 3: Run tests and observe RED**

Run the two new test files. Expected: FAIL because the shared helper does not exist and GET still returns a bare array.

- [ ] **Step 4: Implement the shared upload helper**

Compute the same canonical digest as the server using Web Crypto: canonicalised filename, MIME, byte length, and lowercase content SHA-256. Return headers plus `FormData`; never include the digest in a query string.

Each component retains one key per selected file/upload attempt. On ambiguous connection failure retain the key; after a success or authoritative HTTP failure rotate it. Continue using `useToast()` for visible success/failure feedback.

- [ ] **Step 5: Repair the asset-list response contract**

Change the GET route to:

```ts
const assets = await queryRows(sql, params)
return { assets }
```

Keep both existing consumers typed as `{ assets: BannerAsset[] }`; do not introduce dual array/object parsing.

- [ ] **Step 6: Run component/API regressions and quality checks**

Run the Task 3 tests, any existing banner component tests found by `rg`, targeted ESLint, and `git diff --check`. Re-read every modified Vue file end to end and verify no duplicate upload controls or broken reactive custom states were introduced.

- [ ] **Step 7: Commit Task 3**

```bash
git add app/utils/bannerUpload.ts \
  app/components/banner/AssetsPanel.client.vue \
  app/components/banner/inspector/Background.vue \
  app/components/banner/BrandKitManager.vue \
  server/api/agency/banner-studio/assets/index.get.ts \
  test/app/bannerUpload.test.ts test/server/api/bannerAssetList.test.ts
git commit -m "fix(banner): preserve uploaded assets and retries"
```

---

### Task 4: Animated Canvas Contract and Public Feature Copy

**Files:**
- Modify: `test/server/utils/bannerProjectGodModeMutation.test.ts`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`

**Interfaces:**
- Consumes: uploaded asset URL from Task 2.
- Produces: verified full `canvasData.mrec.layers` accepted by the coordinated project POST.
- Produces animation: decorative cover image, intact contained foreground, editable CTA, five-second exits.

- [ ] **Step 1: Add a failing full-canvas project test**

Use this exact structural contract in the route/coordinator test:

```ts
const canvasData = {
  mrec: {
    bgColor: '#7fbfba',
    layers: [
      { id: 1, type: 'image', name: 'Ambient Fill', src: assetUrl, srcType: 'image', fit: 'cover', x: 0, y: 0, w: 300, h: 250, zIndex: 0, opacity: 0.5, animIn: 'kenBurns', animInDur: 0.4, startTime: 0, endTime: 5, ease: 'none', animOut: 'fadeOut', animOutEase: 'power1.in', outDur: 0.35 },
      { id: 2, type: 'image', name: 'Leapmotor Artwork', src: assetUrl, srcType: 'image', fit: 'contain', x: 25, y: 0, w: 250, h: 250, zIndex: 2, opacity: 1, animIn: 'slideU', animInDur: 0.7, startTime: 0.15, endTime: 5, ease: 'power2.out', animOut: 'fadeOut', animOutEase: 'power1.in', outDur: 0.35 },
      { id: 3, type: 'button', name: 'Test Drive CTA', text: 'BOOK A TEST DRIVE', x: 76, y: 216, w: 148, h: 24, zIndex: 4, opacity: 1, bgColor: '#34e52e', textColor: '#083e35', borderRadius: 12, fontSize: 12, fontWeight: 800, animIn: 'slideU', animInDur: 0.55, startTime: 1.6, endTime: 4.65, ease: 'back.out(1.7)', animOut: 'fadeOut', animOutEase: 'power1.in', outDur: 0.35 }
    ]
  }
}
```

Assert the project remains `draft`, both image layers retain the same uploaded URL, the foreground uses `contain`, the CTA is editable text, and no render/publish call occurs.

- [ ] **Step 2: Run the test and confirm the existing route supports the complete canvas**

If the test passes without route changes, keep production code unchanged. If it exposes bounded validation loss, add only the smallest schema-preserving fix to the existing project POST and cover it in the same test.

- [ ] **Step 3: Update public feature copy**

Add one concise Banner Studio capability statement to the existing feature-list category and detailed Banner Studio entry: uploaded artwork can become editable animated banner drafts. State neither automatic publishing nor generative video.

- [ ] **Step 4: Run focused tests and marketing-page checks**

Run the project mutation test, `git diff --check`, and targeted lint for the two feature pages.

- [ ] **Step 5: Commit Task 4**

```bash
git add test/server/utils/bannerProjectGodModeMutation.test.ts \
  app/pages/features/index.vue 'app/pages/features/[slug].vue'
git commit -m "docs(banner): surface uploaded artwork animation"
```

---

### Task 5: Battle Test, Deploy, Create, Animate, and Download

**Files:**
- Verify all files changed by Tasks 1–4.
- Temporary local-only scripts under `/private/tmp`; do not commit credentials, cookies, image data, or production tokens.

**Interfaces:**
- Consumes: supplied JPEG at `/Users/paulgiurin/Documents/DESKTOP/720039360_122116267058983239_3455519779598236259_n.jpg`.
- Consumes: production app `https://app.xeroflow.io`, standalone MCP Worker, Cloudflare R2, Banner Render Queue.
- Produces: live draft project ID, asset ID, live preview, render job ID, and downloadable completed animation URL/file.

- [ ] **Step 1: Perform the mandatory pre-commit battle review**

Re-read every modified/new file end to end. Check aliases, idempotency replay, digest equality, transaction/audit binding, R2 compensation, MIME/size/magic-byte validation, filename sanitation, ordinary-user behaviour, asset response typing, reactivity, duplicate UI, and absence of publish calls.

- [ ] **Step 2: Run the combined focused suite**

Run all new tests plus existing God Mode, banner project, MCP banner, isolation inventory, and API-error tests under Node 24. Expected: zero failures.

- [ ] **Step 3: Run build and deploy guards**

Run:

```bash
pnpm deploy:check
pnpm build
pnpm deploy:production
```

Use only the guarded project scripts. Confirm the worker-size guard passes and capture the Cloudflare Pages deployment URL.

- [ ] **Step 4: Upload the supplied image through Paul's real session**

Use Kimi WebBridge session `god-mode-prod-verify`. Compute the same request digest as the browser helper, send multipart upload with one stable key, verify the returned canonical JPEG asset, then GET the asset library and confirm the same asset persists after refresh. Do not log cookies or secrets.

- [ ] **Step 5: Create the animated project through the coordinated production POST**

Submit project name, tags `['leapmotor', 'automotive', 'animated', 'mrec']`, and the exact Task 4 canvas using a separate stable project idempotency key. Reissue once with the same key/body to prove replay returns the same project ID rather than duplicating it.

- [ ] **Step 6: Verify live playback and fidelity**

Open the exact project in Banner Studio. Confirm Paul's God Mode indicator is active, project status is draft, MRec is 300×250, foreground shows the intact Leapmotor logo/car/dog/copy, CTA is a separate editable layer, and playback reaches five seconds and loops. Capture a static artboard preview and a timeline/editor evidence screenshot.

- [ ] **Step 7: Render the animation through audited MCP**

Call `propose_banner_render` with `{ project: projectId, format: 'mrec', fps: 30, quality: 1 }`, then `confirm_action` for the returned proposal. Poll `get_banner_render_status` using the job ID until `completed` or a bounded failure. Never call Publish or an advertising-platform route.

- [ ] **Step 8: Download and inspect the completed artifact**

Download the returned animation to `/private/tmp/Leapmotor-C10-Animated-MRec.mp4`, verify its container, 300×250 dimensions, approximately five-second duration, nonzero frames, and playable output. Show the preview in the conversation and provide an absolute local download link.

- [ ] **Step 9: Production and repository final checks**

Verify the live app health through an authenticated session, the MCP catalog, the upload audit/ledger success, the project draft row, and the render job completion. Confirm `git status`, `HEAD`, and `origin/main`; push the final commits if not already pushed.

- [ ] **Step 10: Close browser session and report**

Close `god-mode-prod-verify`. Report asset/project/render IDs, deployment URL, test/build totals, email status for the earlier CP artifact, and explicitly state that neither creative was published.
