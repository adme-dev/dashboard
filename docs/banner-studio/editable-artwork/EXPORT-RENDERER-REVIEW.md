# Private Banner raster renderer review

Reviewed 27 October 2026 against the working tree at HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8` (the reviewed implementation is uncommitted). Scope: `workers/banner-renderer/` source/config/build/proof files, shared RPC contract, Pages export rendering/delivery, image/GIF and download routes, and their focused tests. No application code edited, commits, deployments, remote browser sessions, or provider calls performed.

## Verdict

**No outstanding correctness/security release blockers identified within the reviewed scope.** The confirmed P2 font-fallback issue and the first repair's valid-font regression were corrected by the renderer implementer and independently rechecked below. Acceptance of generated client HTML for unsaved state and intentionally untrusted GIF scripts is an explicit coordinator decision; this review does not require a layer-schema redesign. Hosted acceptance remains outside this local review.

## Finding

### Resolved P2 — Font decode failure silently changes exported typography

Corrected locations: `workers/banner-renderer/src/render.ts:137–143` (pinned bytes) and `:177–185` (`prepare` / `settle`, line numbers at review completion).

`document.fonts.ready` resolves when font loading finishes, including failed FontFace decoding. HTTP success and the `requestfailed` listener do not catch a font that downloads successfully but fails the browser font parser. The original settle check permitted a screenshot using fallback typography, despite the resource-failure policy.

Independent local Chrome reproduction used a visible text node with `font-family: Bad` and an `@font-face` URL equal to the permitted production pinned-font URL. Injected `fetchResource` returned HTTP 200, `Content-Type: font/ttf`, and the literal body `NOT A FONT`; no external network was used. `handleBannerRender` returned `ok: true`, one PNG frame, 2,460 bytes. This is a demonstrated wrong-success result, not a hypothetical failed request.

Implemented correction: after waiting for fonts, inspect the FontFaceSet with `for ... of document.fonts.values()` and reject error status; preserve this check on per-frame settle. The pinned font also requires exactly 428,176 bytes and the expected SHA-256 before fulfillment. Real Chrome regressions cover HTTP-success/font-decode-failure and a successful valid pinned-font control. The renderer implementer and coordinator received the reproduction directly.

The first repair added `document.fonts.forEach` and pinned byte/hash verification. Its malformed-font regression passed, but an independent valid pinned-font control failed: Chrome throws `Failed to execute 'forEach' on 'FontFaceSet': The provided callback is no longer runnable` under static JavaScript-disabled mode. The implementer replaced that callback with native iteration and added the positive control. Both controls now pass in the independent rerun, resolving this regression as well.

## Independent verification

Ran:

```sh
pnpm exec vitest run \
  test/workers/bannerRendererContract.test.ts \
  test/workers/bannerRendererPolicy.test.ts \
  test/workers/bannerRendererLifecycle.test.ts \
  test/workers/bannerRendererIsolation.test.ts \
  test/workers/bannerRendererBrowser.test.ts \
  test/server/api/bannerImageRendering.test.ts \
  test/server/api/bannerImageRenderingDownload.test.ts
```

Result: **7 files, 99 tests passed**. Local Chrome cases executed, including independently decoded PNG/JPEG at 2×, static script suppression, blocked resources, redirects, and synthetic GIF frames. Lifecycle tests cover failed capture/navigation, late browser launch cleanup, and encoded dimension mismatch. Pages tests cover write/client authority, exclusive environment bindings, batching, response corruption, private delivery and ambiguous insert replies.

The first font repair passed **26 tests in 3 files** (browser/lifecycle/policy), but the separate valid-font control above failed, so that green suite was insufficient for acceptance. After the corrected repair, independently reran those same three files: **27 tests passed**, including valid pinned-font loading with JavaScript disabled and rejection of malformed HTTP-200 font bytes. Final strict package TypeScript also passed: `pnpm exec tsc --noEmit -p workers/banner-renderer/tsconfig.json`.

Additionally exercised the actual client `buildBannerHTML` output through `handleBannerRender` in local Chrome using an in-memory esbuild bundle. A 300×250 `mrec` with a red rectangle and x-position keyframes from 0 to 200 over one second returned a successful **five-frame GIF, 3,186 bytes at 5 fps**. GSAP requests were fulfilled from the installed local package; this proves generated runtime integration with that fixture, not deployed CDN 3.12.2 identity or hosted rendering. No test/source file was added for this ad hoc proof.

## Reviewed boundaries

- **Authority and delivery:** both mutation routes require write access; a fresh project lookup precedes client/creator access and rendering. Download GET/HEAD authenticate and freshly join export/project scope before private R2 reads; storage keys are derived and checked, not taken from a supplied URL. Responses are private, no-store attachments with fixed MIME and nosniff.
- **RPC:** strict request shape, finite integer dimensions, modes, duplicate keys and byte/pixel/frame limits; Pages verifies item order/key, output/MIME, dimensions, byte length, SHA-256, encoded headers/blocks and GIF frame delays before writing a batch. No Puppeteer or codec import enters Pages through these modules.
- **Scale:** CSS viewport stays at requested width/height and uses `deviceScaleFactor` for 2×. Real decoded-image tests verify the resulting dimensions and pixels.
- **Isolation:** private named entrypoint, default/named fetch return 404; renderer has no DB/R2 credential bindings. Static JS is disabled. GIF scripts are untrusted but confined by response CSP, interception, no cookies/caller headers on resource fetches, redirect rejection, disabled workers/non-HTTP channel APIs, and bounded browser lifecycle. Current source also disables DNS prefetch via response header. No claim of a formal proof against every Chromium egress mechanism is made.
- **Resources:** exact app font/signed asset paths, reviewed asset origins, Google font endpoints, and pinned GSAP script URLs; unexpected resource requests fail. Staging origin lists are empty, so staging images/fonts requiring app or asset origins are intentionally unavailable until configured. Font decode errors now fail, and pinned-font bytes are checked before delivery to the browser.
- **Limits/cleanup:** request wall deadline, bounded navigation/settle, bounded close, late launch/page cleanup, 100 intercepted requests, 10 MiB per fetched resource, 32 MiB fetched per item, 60 million GIF pixel-frames, 20 MiB per output and 28 MiB response; configured Worker CPU ceiling is 60 seconds. These bounds were reviewed, not benchmarked at their maxima or proven against hosted memory exhaustion.
- **Persistence ambiguity:** final Pages catch performs a fresh export-ID lookup after an insert exception; bytes survive a committed-row or failed-lookup result and deletion occurs only for a null lookup. Tests demonstrate those modeled outcomes. No live DB transport/commit-race proof was performed. Earlier successfully persisted items survive a later-item/batch failure; unresolved storage orphans have no sweeper in this change.
- **Production storage:** the coordinator supplied verification that MEDIA_BUCKET has no r2.dev or custom-domain public access. This reviewer did not independently repeat a production configuration call.

## Evidence limits

No hosted Browser Rendering, actual production/staging RPC binding, live private download, production font/CDN response, maximum-load memory/CPU or deployment verification was performed. The renderer implementer's bundled-workerd codec/private-RPC evidence was communicated separately and is not counted as an independently rerun check here. Root owns a clean candidate containing freshly fetched main and deployment acceptance; this dirty branch itself is not release evidence.
