# Video V1.2b — Overlay integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Composite the GSAP overlay layer onto the V1.2a base — resolve `gsap_project_id` → server-built banner HTML → headless transparent-PNG capture in the container → alpha-composite onto `[vout]`. Flag-gated/dormant. No migration.

**Architecture:** Server-side HTML build at enqueue (D1) → R2-staged → container renders provided HTML. Server copy of the banner builder, parity-guarded vs the shipped client builder (D2). Container gains Chromium + the spike's capture mechanic.

**Tech Stack:** TypeScript, Zod, Vitest, ffmpeg, headless Chromium, Cloudflare Containers. Tests under `test/audio/` + new `test/banner/` (repo default vitest config collects `test/**`).

**Spec:** `docs/superpowers/specs/2026-06-09-video-v1-2b-overlay-integration-design.md`
**Worktree:** branch `worktree-video-studio-v1`.

**Verify-live (operator, on activation):** real banner overlay composited onto real base video — alpha, font/asset loading in the container, seek/frame sync. Pure tests pin structure + parity, NOT live render correctness (same caveat as V1.2a). State this in the completion report.

---

## Task 1: Schema seam — `gsap_format_key` on overlay clips (TDD)

**Files:** Modify `server/utils/audio/timelineSchema.ts`, Test `test/audio/timelineSchema.test.ts`

- [ ] **Step 1: Failing test** — append:
```ts
describe('OverlayClip gsap_format_key', () => {
  it('parses an overlay clip with a gsap_format_key and defaults it when absent', () => {
    const s = TimelineStateSchema.parse({ schema_version: 2, media_type: 'av', tracks: [
      { id: 'ovl', name: 'O', kind: 'overlay', clips: [
        { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 5, gsap_project_id: 'b1', gsap_format_key: 'fb_story' },
        { type: 'overlay', id: 'o2', timeline_start_sec: 5, duration_sec: 5, gsap_project_id: 'b1' }
      ] }
    ] })
    expect((s.tracks[0].clips[0] as any).gsap_format_key).toBe('fb_story')
    expect((s.tracks[0].clips[1] as any).gsap_format_key).toBeNull()  // default null → resolver picks by aspect
  })
})
```

- [ ] **Step 2: Run → fail** — `pnpm exec vitest run test/audio/timelineSchema.test.ts`

- [ ] **Step 3: Implement** — in `OverlayClipSchema`, add: `gsap_format_key: z.string().nullable().default(null)`.

- [ ] **Step 4: Run → pass + full suite** — `pnpm exec vitest run test/audio/`
- [ ] **Step 5: Commit** — `feat(video): overlay clip gsap_format_key seam`

---

## Task 2: Server banner HTML builder (port via copy + parity guard)

**Files:** Create `server/utils/banner/mask.ts`, `server/utils/banner/htmlBuilder.ts`, Test `test/banner/serverHtmlBuilderParity.test.ts`

This is a **copy-and-adapt** of the shipped client builder — do NOT hand-rewrite it. The parity test guarantees no divergence.

- [ ] **Step 1: Copy the mask** — `cp app/utils/banner-mask.ts server/utils/banner/mask.ts`. It's pure math; fix any `~/` import to a relative/`~~/app` path if present (check its top). 

- [ ] **Step 2: Copy + adapt the builder** —
```bash
mkdir -p server/utils/banner
cp app/utils/banner-html-builder.ts server/utils/banner/htmlBuilder.ts
```
Then in `server/utils/banner/htmlBuilder.ts` change the 3 imports (currently `~/utils/banner-constants`, `~/types/banner-studio`, `~/utils/banner-mask`) to server-resolvable forms:
```ts
import { FORMATS, ANIM_IN, ANIM_OUT } from '~~/app/utils/banner-constants'
import type { Layer, KeyframeProperty, Keyframe } from '~~/app/types/banner-studio'
import { computeClipPathPx } from './mask'
```
Add `baseUrl?: string` to `BuildBannerOptions` (around line 139). Add a tiny absolutizer and apply it to every `l.src` embed (lines ~173, 179, 207, 211, 215, 236 — the `escapeHtml(l.src...)` sites):
```ts
function absSrc(src: string | undefined, baseUrl?: string): string {
  if (!src) return ''
  if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/${src.replace(/^\//, '')}` : src
}
```
Replace each `escapeHtml(l.src)` / `escapeHtml(l.src || '')` used for an asset URL with `escapeHtml(absSrc(l.src, options.baseUrl))`. (Do NOT change non-src escapes.)

- [ ] **Step 3: Parity test** — `test/banner/serverHtmlBuilderParity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildBannerHTML as client } from '~~/app/utils/banner-html-builder'
import { buildBannerHTML as server } from '~~/server/utils/banner/htmlBuilder'

// representative layers covering text/image/video/shape; absolute srcs so baseUrl is a no-op → identical output
const layers: any[] = [
  { id: 'l1', type: 'text', text: 'Hi', x: 10, y: 10, w: 200, h: 50, fontFamily: 'Arial', fontSize: 24, color: '#fff' },
  { id: 'l2', type: 'image', src: 'https://cdn.example.com/a.jpg', x: 0, y: 0, w: 1080, h: 1920, fit: 'cover' }
]

describe('server banner builder parity', () => {
  it('matches the client builder byte-for-byte (absolute srcs)', () => {
    expect(server('fb_story', layers as any)).toBe(client('fb_story', layers as any))
  })
  it('absolutizes a relative src only when baseUrl is given', () => {
    const rel: any[] = [{ id: 'l', type: 'image', src: '/img/x.jpg', x: 0, y: 0, w: 10, h: 10 }]
    expect(server('fb_story', rel as any, { baseUrl: 'https://app.test' })).toContain('https://app.test/img/x.jpg')
  })
})
```

- [ ] **Step 4: Run → pass** — `pnpm exec vitest run test/banner/serverHtmlBuilderParity.test.ts`. If the first parity test fails, the only legitimate diffs are the `absSrc` wrapping (which is a no-op for absolute srcs) — reconcile until byte-identical for absolute-src input.
- [ ] **Step 5: Commit** — `feat(video): server-side banner HTML builder (copy + parity guard)`

---

## Task 3: Overlay resolution — `bannerOverlay.ts` (TDD)

**Files:** Create `server/utils/audio/bannerOverlay.ts`, Test `test/audio/bannerOverlay.test.ts`

- [ ] **Step 1: Failing test**:
```ts
import { describe, it, expect, vi } from 'vitest'
const queryOneMock = vi.fn()
vi.mock('~~/server/utils/db', () => ({ queryOne: (...a: any[]) => queryOneMock(...a) }))
import { resolveOverlayFormatKey, loadBannerLayers } from '~~/server/utils/audio/bannerOverlay'

describe('resolveOverlayFormatKey', () => {
  it('maps aspect → a default banner format key', () => {
    expect(resolveOverlayFormatKey(1080, 1920)).toBe('fb_story')   // 9:16
    expect(resolveOverlayFormatKey(1080, 1080)).toBe('ig_sq')      // 1:1
    expect(resolveOverlayFormatKey(1920, 1080)).toBe('tt_land')    // 16:9
  })
})
describe('loadBannerLayers', () => {
  it('returns layers + size for a project/format', async () => {
    queryOneMock.mockResolvedValue({ canvasData: { fb_story: { layers: [{ id: 'l1' }] } } })
    const r = await loadBannerLayers('proj', 'fb_story')
    expect(r.layers).toEqual([{ id: 'l1' }]); expect(r.width).toBe(1080); expect(r.height).toBe(1920)
  })
  it('throws when the project or format is missing', async () => {
    queryOneMock.mockResolvedValue(null)
    await expect(loadBannerLayers('nope', 'fb_story')).rejects.toThrow()
    queryOneMock.mockResolvedValue({ canvasData: {} })
    await expect(loadBannerLayers('proj', 'fb_story')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement** — `server/utils/audio/bannerOverlay.ts`:
```ts
import { queryOne } from '~~/server/utils/db'
import { FORMATS } from '~~/app/utils/banner-constants'

/** Default banner format key for a video canvas aspect. Overlay clips may override via gsap_format_key. */
export function resolveOverlayFormatKey(width: number, height: number): string {
  const r = width / height
  if (r < 0.85) return 'fb_story'      // ~9:16 portrait
  if (r > 1.2) return 'tt_land'        // ~16:9 landscape
  return 'ig_sq'                       // ~1:1
}

export async function loadBannerLayers(projectId: string, formatKey: string): Promise<{ layers: any[]; width: number; height: number }> {
  const row = await queryOne(`SELECT canvas_data AS "canvasData" FROM banner_projects WHERE id = $1`, [projectId])
  if (!row) throw new Error(`banner project not found: ${projectId}`)
  const artboard = (row as any).canvasData?.[formatKey]
  if (!artboard?.layers) throw new Error(`banner project ${projectId} has no format "${formatKey}"`)
  const fmt = (FORMATS as any)[formatKey]
  if (!fmt) throw new Error(`unknown banner format: ${formatKey}`)
  return { layers: artboard.layers, width: fmt.w, height: fmt.h }
}
```

- [ ] **Step 4: Run → pass** — `pnpm exec vitest run test/audio/bannerOverlay.test.ts`
- [ ] **Step 5: Commit** — `feat(video): overlay format resolution + banner layer loader`

---

## Task 4: Composite builder overlay step (TDD) + `.mjs` sync

**Files:** Modify `server/utils/audio/videoCompositeGraph.ts` + `workers/audio-jobs/container/videoCompositeGraph.mjs`, Test `test/audio/videoCompositeGraph.test.ts` + `videoCompositeGraphSync.test.ts`

The container captures each overlay to a PNG dir; the composite adds those as image-sequence inputs overlaid onto `[vout]`. `buildCompositePlan` gains an optional `overlays` arg describing the overlay frame inputs.

- [ ] **Step 1: Failing test** — append to `test/audio/videoCompositeGraph.test.ts`:
```ts
describe('buildCompositePlan with overlays', () => {
  it('appends overlay frame-sequence inputs and composites them onto [vout]', () => {
    const overlays = [{ clipId: 'o1', framesPattern: 'ovl_o1/%05d.png', fps: 30, timeline_start_sec: 0, duration_sec: 10 }]
    const p = buildCompositePlan(avState(), profile, overlays)
    // overlay frames become an extra image input; composited via overlay=enable
    expect(p.overlayInputs.map(o => o.framesPattern)).toEqual(['ovl_o1/%05d.png'])
    expect(p.filterComplex).toContain("overlay=enable='between(t,0.000,10.000)'")
    expect(p.vLabel).toBe('[vout]')
  })
  it('without overlays behaves exactly as V1.2a (base only)', () => {
    const a = buildCompositePlan(avState(), profile)
    const b = buildCompositePlan(avState(), profile, [])
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run → fail**

- [ ] **Step 3: Implement** — extend `buildCompositePlan(state, profile, overlays: OverlayFrameInput[] = [])`. After building the base to `[vbaseFinal]` (BEFORE the `format=yuv420p[vout]`), insert overlay chains: each overlay frame-sequence is a video input (tracked separately in `plan.overlayInputs` so the worker/container adds `-framerate fps -i framesPattern`), labeled `[ovN]`, composited `[base][ovN]overlay=enable='between(t,start,end)'[baseNext]`; then `format=yuv420p[vout]`. Add `OverlayFrameInput` type `{ clipId, framesPattern, fps, timeline_start_sec, duration_sec }` and `overlayInputs: OverlayFrameInput[]` to `CompositePlan`. `buildCompositeRenderArgs` adds `-framerate {fps} -i {framesPattern}` for each overlay input (after the regular `-i` inputs, matching the input-index order the filtergraph expects — IMPORTANT: overlay frame inputs must come after video+audio inputs and the filtergraph overlay labels must reference the right input indices; compute indices = videoInputs.length + audioInputs.length + overlayIdx). Mirror the exact ordering in the test assertions.

- [ ] **Step 4: Update `.mjs` port** to match + run the sync/parity test (`test/audio/videoCompositeGraphSync.test.ts` — add an overlays case).
- [ ] **Step 5: Run → pass + full suite** — `pnpm exec vitest run test/audio/`
- [ ] **Step 6: Commit** — `feat(video): composite builder overlay step (+ .mjs parity)`

---

## Task 5: Container — Chromium + overlay capture + composite

**Files:** Modify `workers/audio-jobs/container/Dockerfile`, `workers/audio-jobs/container/server.mjs`, Create `workers/audio-jobs/container/overlayCapture.mjs`

Reference: the spike's container (`.worktrees/video-composite-render-spike/spike/composite-render/container/`) — its `server.mjs` capture loop + Dockerfile bake Chromium. Port the capture mechanic (transparent PNG via `omitBackground`, block-body seek, `--disable-dev-shm-usage`), but drive the GSAP timeline via the banner builder's master timeline: `gsap.globalTimeline.getChildren(false)[0].seek(t)` (the `export-video.post.ts` mechanism — read it), NOT the spike's `window.__seek`.

- [ ] **Step 1: `overlayCapture.mjs`** — `export async function captureOverlay(browser, { html, width, height, fps, durationSec, outDir })`: `page.setContent(html, { waitUntil: 'networkidle0' })`; get duration via `gsap.globalTimeline.getChildren(false)[0].duration()` (fallback to `durationSec`); for each frame seek via a **block-body** `page.evaluate((t)=>{ const g=window.gsap; const c=g&&g.globalTimeline.getChildren(false); if(c&&c[0]) c[0].seek(t) }, f/fps)`, one rAF settle, `page.screenshot({ omitBackground:true, type:'png', clip:{x:0,y:0,width,height} })` → `ovl_%05d.png`. Returns `{ frames }`.

- [ ] **Step 2: Dockerfile** — add Chromium + fonts (mirror the spike's Dockerfile lines: `apt-get install -y chromium fonts-liberation ca-certificates`, `ENV PUPPETEER_SKIP_DOWNLOAD=1`) and ensure `@cloudflare/puppeteer` (or `puppeteer`) is available. COPY `overlayCapture.mjs` + `videoCompositeGraph.mjs`.

- [ ] **Step 3: Extend `/render-composite`** — body now `{ plan, files, overlays: [{ clipId, html, start, duration, framesPattern }] }`. For each overlay: launch the browser (reuse one instance), `captureOverlay(...)` into `/tmp/{framesPattern dir}`. Then run `buildCompositeRenderArgs(plan, paths, out)` where `plan` already has the `overlayInputs` and the args include the `-framerate -i framesDir/%05d.png` per overlay (Task 4 produced the args). Return the MP4.

- [ ] **Step 4: Sanity** — `node --check` on `overlayCapture.mjs` + `server.mjs`. (Container is not unit-tested here; the capture mechanic is verify-live — reuses the spike's proven approach.)
- [ ] **Step 5: Commit** — `feat(video): container Chromium + overlay capture + composite`

---

## Task 6: Endpoint overlay resolution + worker handoff (TDD)

**Files:** Modify `server/api/agency/audio/projects/[id]/render-video.post.ts`, `server/utils/audio/renderQueue.ts` (extend `VideoRenderMessage`), `workers/audio-jobs/src/videoCompositeContainer.ts`, Test `test/audio/renderVideoApi.test.ts`

- [ ] **Step 1: Failing test** — extend `test/audio/renderVideoApi.test.ts`: with an av project whose timeline has an overlay clip (`gsap_project_id`, `gsap_format_key`), the endpoint calls `loadBannerLayers` + the server `buildBannerHTML`, uploads the HTML to R2 (mock the R2/storage util), and the `enqueueVideoRender` message includes a `resolvedOverlays: [{ clipId, htmlKey, timeline_start_sec, duration_sec }]`. Mock `~~/server/utils/audio/bannerOverlay`, `~~/server/utils/banner/htmlBuilder`, and the storage util. (Mirror the existing harness.)

- [ ] **Step 2: Implement** — in `render-video.post.ts`, after validating the timeline: collect overlay clips from the timeline; for each, `const fmtKey = clip.gsap_format_key ?? resolveOverlayFormatKey(profileW, profileH)` (use the first requested format's W/H), `loadBannerLayers`, `buildBannerHTML(fmtKey, layers, { baseUrl: <app origin/runtime config> })`, `uploadFile(html, 'media/{proj}/{job}/overlay-{clipId}.html', 'text/html')`. Build `resolvedOverlays` and pass it in the `enqueueVideoRender` message (extend `VideoRenderMessage` with `resolvedOverlays?`). Error clearly (400) on a missing project/format. In `videoCompositeContainer.ts`, fetch each `resolvedOverlays[].htmlKey` from R2 and include `overlays: [{ clipId, html, start, duration, framesPattern }]` in the container POST; build the `overlays` arg to `buildCompositePlan`.

- [ ] **Step 3: Run → pass** — `pnpm exec vitest run test/audio/renderVideoApi.test.ts`
- [ ] **Step 4: Commit** — `feat(video): endpoint resolves overlays → R2 HTML + worker handoff`

---

## Task 7: Full regression + parity + typecheck gate

- [ ] **Step 1** — `pnpm exec vitest run test/audio/ test/banner/` → all green; report counts.
- [ ] **Step 2** — `pnpm exec nuxt typecheck 2>&1 | grep -E "banner/htmlBuilder|bannerOverlay|videoCompositeGraph|render-video|timelineSchema" || echo "no new errors in changed files"`. Handle any NEW errors only.
- [ ] **Step 3** — `node --check workers/audio-jobs/container/server.mjs workers/audio-jobs/container/overlayCapture.mjs`.
- [ ] **Step 4: Commit** any fixups — `chore(video): V1.2b regression + typecheck gate`.

---

## Done criteria (V1.2b)

- [ ] Server banner builder parity with the client builder (byte-identical for absolute srcs); `baseUrl` absolutizes relative srcs.
- [ ] `OverlayClipSchema` carries `gsap_format_key`; AV timelines + all V1.1/V1.2a tests stay green.
- [ ] `resolveOverlayFormatKey` + `loadBannerLayers` correct (incl. missing-format error).
- [ ] `buildCompositePlan(state, profile, overlays)` composites overlay frame-sequences onto `[vout]`; empty/absent overlays == V1.2a behavior; `.ts`↔`.mjs` parity holds.
- [ ] The endpoint resolves overlays → R2 HTML → message; worker passes overlay HTML through (mocked).
- [ ] Container has Chromium + `captureOverlay` + the extended composite (node --check clean; capture mechanic = verify-live).
- [ ] Full `test/audio/` + `test/banner/` green; no migration; no new typecheck errors in changed files.
- [ ] **Verify-live flagged** (operator): real overlay-on-base render.
