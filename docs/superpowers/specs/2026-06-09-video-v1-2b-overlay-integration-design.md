# Video V1.2b — Overlay integration design

**Status:** Draft for review — 2026-06-09
**Slice:** V1.2b of the Video V1 roadmap. Completes the render spine: composites the **GSAP overlay layer** onto the V1.2a base. The spike already proved the alpha-overlay-onto-base mechanic; this slice wires it to real Banner Studio compositions.
**Builds on:** V1.2a (`videoCompositeGraph` base/audio render on the `video-render` rails), the composite-render spike (alpha capture + composite), and Banner Studio's `buildBannerHTML`.

---

## 1. The problem & the key constraint (from the V1.2b scope)

An overlay clip references a `gsap_project_id`. Rendering it means: resolve that id → **renderable GSAP HTML** → headless-capture to **transparent PNG frames** → **alpha-composite onto the base** `[vout]`.

The constraint the exploration surfaced: **`buildBannerHTML` is client-only** (`app/utils/banner-html-builder.ts`, 474 lines), and the **render worker/container cannot import Nitro `~~/server` modules** (separate runtimes). So "where the HTML is built" is the central design decision.

Good news from the scope: the builder is **~98% pure string-building** (its only `document`/`window` uses are inside GSAP *script strings* that run in the browser, not at build time); fonts are absolute-HTTPS; and the GSAP output is a single seekable master timeline accessible via `gsap.globalTimeline.getChildren()[0]` — exactly what `export-video.post.ts` already drives. The one asset risk: layer image/video `src`s must be **absolute HTTPS** (relative paths 404 in a headless container).

---

## 2. Decisions to confirm

| # | Decision | Recommendation | Why |
|---|---|---|---|
| **D1 — where HTML is built** | Build overlay HTML **server-side in the Nitro render endpoint at enqueue time**, upload each overlay's HTML to R2, and pass R2 refs in the render message. The worker/container render **provided** HTML (never builds it). | **Server-side at enqueue.** | Avoids a third copy of the 474-line builder in the worker/container `.mjs`; the builder runs where Nitro aliases + the banner gateway already work; the container stays a thin renderer (mirrors how `export-video` already takes provided HTML). |
| **D2 — server builder strategy** | **Copy** the pure builder + `banner-mask` into `server/utils/banner/` and guard it with a **parity test** vs the shipped client `app/utils/banner-html-builder.ts` (share `banner-constants`/types). Do NOT move/refactor the shipped client export paths. | **Server copy + parity test.** | The `.ts`↔`.mjs` precedent: a copy with a parity test is safer than refactoring the live Banner Studio export endpoints. Parity test prevents silent divergence. |
| **D3 — overlay format key** | Map the **video aspect** → a banner **format key** (9:16→`fb_story`/`ig_story`/…, 1:1→`ig_sq`/…, 16:9→`tt_land`). The overlay clip stores the chosen `gsap_format_key` (additive to the contract); error clearly if the banner project lacks that format. | Map aspect→key; require the format authored. | All these keys are already video-shaped (1080×1920 / 1080×1080 / 1280×720). No new banner sizing. |
| **D4 — asset URLs** | Add a `baseUrl` option to the server builder and **require absolute-HTTPS** layer srcs; absolutize relative ones; reject/skip otherwise. | Absolutize + require HTTPS. | A headless container has no app origin — relative srcs 404. |
| **D5 — container Chromium** | Add Chromium to the `RenderContainer` image (the spike's Dockerfile already bakes it) and an overlay-capture + alpha-composite step. | Bake Chromium into the existing container. | The spike proved the capture+composite; this merges it into the production container. |

---

## 3. Components

### 3.1 Server banner HTML builder (`server/utils/banner/`)
- `htmlBuilder.ts` (port of `app/utils/banner-html-builder.ts`) + `mask.ts` (port of `banner-mask.ts`), importing shared `banner-constants`/types. Adds `baseUrl?` to `BuildBannerOptions` and absolutizes layer srcs (D4).
- **Parity test** `test/banner/serverHtmlBuilderParity.test.ts`: server builder output === client builder output for a set of layer fixtures (no divergence).

### 3.2 Overlay resolution + the schema seam
- Add `gsap_format_key: string` to `OverlayClipSchema` (additive; the V1.1 contract bumps within `schema_version 2`, no migration — JSONB).
- A pure `resolveOverlayFormatKey(aspect)` helper + a gateway `loadBannerLayers(projectId, formatKey)` (reuses the banner project fetch) → `{ layers, width, height }`.

### 3.3 Render endpoint (extend `render-video.post.ts`)
- After validating the AV timeline, for each `overlay` clip: `loadBannerLayers(gsap_project_id, gsap_format_key)` → `buildBannerHTML(...)` → upload to `media/{proj}/{job}/overlay-{clipId}.html` in R2. Build a `resolvedOverlays: { clipId, htmlKey, timeline_start_sec, duration_sec }[]` and include it in the `VIDEO_RENDER_QUEUE` message (extends V1.2a's message). Error clearly if a banner project/format is missing. Still flag-gated + av-only.

### 3.4 Composite builder (extend `videoCompositeGraph.ts`)
- Extend `buildCompositePlan` to take the overlay frame inputs (the alpha PNG sequences the container produces per overlay) and add `overlay` filter chains onto `[vout]` — positioned by `enable='between(t,start,end)'`, mirroring the spike's composite. The overlay frames are produced *inside the container* (headless capture), so the builder's overlay step composites image-sequence inputs. (Design: the container captures overlays → PNG dirs, then runs the composite with those dirs as `-framerate fps -i ovl-{clip}/%05d.png` inputs overlaid onto the base.) Update `.mjs` port + parity test.

### 3.5 Container (`workers/audio-jobs/container/`)
- **Dockerfile:** add Chromium + fonts (the spike's image) to the existing `RenderContainer`.
- **`/render-composite`** extended (or a new `/render-composite-av`): body now also carries `overlays: [{ clipId, html, start, duration }]`. The container: (1) for each overlay, headless-loads the HTML, drives `gsap.globalTimeline.getChildren()[0].seek(f/fps)` per frame (the `export-video` mechanism + the spike's `omitBackground` transparent capture + the thenable/`--disable-dev-shm-usage` lessons), writing alpha PNGs; (2) builds the base via the V1.2a args; (3) composites the overlay sequences onto the base; (4) returns the muxed MP4. Reuse the spike's `captureOverlayFrames` mechanics (port into the container).
- **Worker** (`videoCompositeContainer.ts`): also fetch each `resolvedOverlays[].htmlKey` from R2 and pass the HTML to the container.

---

## 4. Scope

**In:** §3.1 server builder + parity, §3.2 schema seam (`gsap_format_key`) + overlay resolution, §3.3 endpoint overlay-HTML resolution + upload, §3.4 composite builder overlay step (+ `.mjs`/parity), §3.5 container Chromium + overlay capture + composite + worker handoff. Unit tests for every pure piece + the builder parity + the worker handoff (mocked).

**Out (later):** the editor UI (V1.3 — where users *pick* the overlay/format); multi-overlay-per-shot transitions (V3); the feed-binding runtime (disable for overlay render — D-note); any real container deploy/live render (operator verify-live). No migration.

**Carried verify-live (operator, on activation):** a real banner overlay composited onto a real base video — alpha correctness, font/asset loading in the container, and seek/frame sync. The arg-shape + parity tests do not prove live render (same caveat as V1.2a).

---

## 5. Success criteria

- Server `buildBannerHTML` is **byte-identical** to the client builder on fixtures (parity test), with `baseUrl` absolutizing relative srcs.
- `OverlayClipSchema` carries `gsap_format_key`; an AV timeline with an overlay clip still validates (zero audio regression; V1.1/V1.2a tests green).
- The render endpoint resolves overlay clips → HTML in R2 → a `resolvedOverlays` message, and errors clearly on a missing banner project/format. Flag-gated + av-only preserved.
- `buildCompositePlan` (extended) composites overlay frame-sequences onto `[vout]`; `.ts`↔`.mjs` parity holds.
- The container route accepts overlays, and the worker passes overlay HTML through (mocked-deps test).
- Full `test/audio/` + new `test/banner/` suites green; no migration.

## 6. Files (indicative)

- `server/utils/banner/htmlBuilder.ts`, `server/utils/banner/mask.ts` + `test/banner/serverHtmlBuilderParity.test.ts`
- `server/utils/audio/timelineSchema.ts` (+`gsap_format_key`) + tests
- `server/utils/audio/bannerOverlay.ts` (`resolveOverlayFormatKey`, `loadBannerLayers`) + tests
- `server/api/agency/audio/projects/[id]/render-video.post.ts` (overlay resolution) + tests
- `server/utils/audio/videoCompositeGraph.ts` (+ overlay step) + `.mjs` + sync test
- `workers/audio-jobs/container/{Dockerfile, server.mjs, overlayCapture.mjs}` + `workers/audio-jobs/src/videoCompositeContainer.ts`

---

## 7. Size note (honest)

This is the **biggest V1 slice** — a 474-line builder port (parity-guarded), a schema seam, endpoint overlay-resolution + R2 staging, the composite overlay step, and the container Chromium+capture+composite merge. Expect a longer plan (≈8–10 tasks) and the most container-side work. It's well-de-risked (the spike proved capture+composite; the builder is ~pure; the rails exist) but it is substantial.
