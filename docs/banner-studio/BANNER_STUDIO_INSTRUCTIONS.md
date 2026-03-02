# Banner Studio — Integration Instructions

> **Stack:** Nuxt 3 · Cloudflare Workers · Neon PostgreSQL · Qdrant  
> **File:** `banner_studio.html` — self-contained HTML5 application, no build step required  
> **Last updated:** February 2026

---

## Overview

Banner Studio is a self-contained HTML5 banner design tool. It ships as a single `.html` file with zero external dependencies beyond CDN-loaded GSAP and JSZip. It can be embedded into the Nuxt app as an `<iframe>`, served directly from Cloudflare, or split into a Nuxt page component.

### What it does

- Multi-artboard workspace — all banner sizes visible and editable simultaneously
- 23 ad formats across Google Display, Facebook, Instagram, TikTok, and LinkedIn
- Layer-based editor with GSAP animation timeline (presence bars, anim-in/out, Ken Burns)
- Banner Sets — load a preset group of sizes (Google Standard, Full Campaign, Social All, etc.)
- Asset Library — IndexedDB-persisted, categorised (Vehicles, Backgrounds, Logos, Misc), drag-to-canvas
- Push to All Sizes — propagates an image layer proportionally to every artboard in the set
- Play All — fires animations on every artboard simultaneously for live preview
- ZIP export — generates standalone HTML5 files per size, organised into platform folders

---

## File Reference

| File | Purpose |
|------|---------|
| `banner_studio.html` | Main application — include or serve directly |
| `BANNER_STUDIO_INSTRUCTIONS.md` | This file |

### CDN dependencies (loaded inside the HTML)

```
https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:wght@400;600;700&display=swap
https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js
https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
```

No other external dependencies. All logic is inline JavaScript.

---

## Integration Options

### Option 1 — Serve as a static asset (simplest)

Place `banner_studio.html` in your Nuxt `public/` directory and link to it directly.

```
public/
  tools/
    banner_studio.html
```

Accessible at: `https://yourdomain.com/tools/banner_studio.html`

**Cloudflare:** Will be served automatically as a static asset. No Worker routing needed.

---

### Option 2 — Embed as an iframe in a Nuxt page (recommended)

Create a Nuxt page that wraps the tool in a full-screen iframe. This keeps the tool isolated and avoids CSS/JS conflicts with the parent app.

```
pages/
  studio/
    index.vue
```

**`pages/studio/index.vue`**

```vue
<template>
  <div class="studio-host">
    <iframe
      ref="studioFrame"
      src="/tools/banner_studio.html"
      frameborder="0"
      allow="clipboard-write"
      @load="onFrameLoad"
    />
  </div>
</template>

<script setup>
const studioFrame = ref(null)

function onFrameLoad() {
  // Optional: post a message to pre-load dealer data
  studioFrame.value?.contentWindow?.postMessage({
    type: 'INIT_DEALER',
    payload: {
      name: 'Horizon Toyota',
      accentColor: '#e8c84a',
      bgColor: '#0a0a10'
    }
  }, '*')
}
</script>

<style scoped>
.studio-host {
  position: fixed;
  inset: 0;
  background: #08080e;
}
iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
</style>
```

**`nuxt.config.ts`** — disable Nuxt layout for the studio page:

```ts
export default defineNuxtConfig({
  routeRules: {
    '/studio/**': { ssr: false }
  }
})
```

---

### Option 3 — Cloudflare Worker route

If you want the tool served from a Worker (e.g., for auth gating or query-string pre-configuration):

**`workers/studio.ts`**

```ts
import { readFileSync } from 'fs'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Optional: verify session / KV auth token here
    const html = await env.ASSETS.get('banner_studio.html', 'text')
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
}
```

**`wrangler.toml`**

```toml
[[rules]]
type = "Text"
globs = ["public/tools/*.html"]
```

---

## postMessage API

The studio listens for `postMessage` events so the parent Nuxt app can drive it programmatically.

### Sending to the studio

```ts
const frame = document.querySelector('iframe')

// Pre-load dealer branding
frame.contentWindow.postMessage({
  type: 'INIT_DEALER',
  payload: {
    name: 'Horizon Toyota',
    accentColor: '#e8c84a',
    bgColor: '#0a0a10',
    headline: 'Drive Away Today',
    cta: 'Book Test Drive'
  }
}, '*')

// Switch to a specific banner set
frame.contentWindow.postMessage({
  type: 'LOAD_SET',
  payload: { setId: 'google_standard' } // see Banner Sets section
}, '*')

// Trigger export
frame.contentWindow.postMessage({ type: 'EXPORT_ZIP' }, '*')
```

### Receiving from the studio

```ts
window.addEventListener('message', (e) => {
  if (e.data?.type === 'EXPORT_READY') {
    // e.data.payload = { blob: Blob, filename: string }
    // Save to cloud storage, send to dealer, etc.
  }
  if (e.data?.type === 'LAYER_SELECT') {
    // e.data.payload = { layerId, layerName, format }
  }
})
```

> **Note:** The postMessage handlers need to be added to `banner_studio.html` as part of the AI/backend integration sprint. The API shape above is the intended contract — implement the `window.addEventListener('message', ...)` listener inside the `<script>` block.

---

## Asset Library

Assets are stored in **IndexedDB** (`BannerStudioAssets`, version 1) in the browser that runs the studio. This means:

- Assets persist across sessions **per browser / per device**
- They are **not** synced to your Neon database automatically
- For multi-device / multi-user scenarios, a cloud sync layer is needed (see Roadmap below)

### IndexedDB schema

```
Database: BannerStudioAssets (v1)
Store:     assets
  id        — autoincrement integer (keyPath)
  name      — string
  src       — string (base64 dataURL or remote URL)
  type      — 'image' | 'video'
  cat       — 'vehicles' | 'backgrounds' | 'logos' | 'misc'
  pinned    — boolean
  addedAt   — Unix timestamp (ms)
  size      — number (bytes, 0 for URL imports)
  Index: cat
  Index: pinned
```

### Cloud sync (Neon integration — planned)

The intended pattern is:

1. User uploads an asset → saved to IndexedDB immediately (fast, offline-capable)
2. Background worker posts the asset to a Cloudflare Worker endpoint
3. Worker stores metadata in Neon and uploads the file to R2 / Cloudflare Images
4. On next session load, studio fetches the asset list from the API and hydrates IndexedDB

**Neon table (suggested)**

```sql
CREATE TABLE studio_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id   UUID REFERENCES dealers(id),
  name        TEXT NOT NULL,
  src         TEXT NOT NULL,        -- R2 or Cloudflare Images URL
  type        TEXT NOT NULL,        -- 'image' | 'video'
  cat         TEXT NOT NULL,        -- 'vehicles' | 'backgrounds' | 'logos' | 'misc'
  pinned      BOOLEAN DEFAULT false,
  added_at    TIMESTAMPTZ DEFAULT now(),
  file_size   INTEGER
);

CREATE INDEX idx_assets_dealer ON studio_assets(dealer_id);
CREATE INDEX idx_assets_cat    ON studio_assets(dealer_id, cat);
```

---

## Banner Sets

Sets are defined in the `BANNER_SETS` constant inside `banner_studio.html`. Each set is a named group of format keys.

### Built-in sets

| Set ID | Name | Formats |
|--------|------|---------|
| `google_standard` | Google Standard | MRec, Leaderboard, Half Page, Wide Skyscraper |
| `google_all` | Google All | All 7 Google Display sizes |
| `facebook` | Facebook | Feed, Square, Story |
| `instagram` | Instagram | Square, Portrait, Story, Landscape |
| `social_all` | Social All | FB + IG + TikTok + LinkedIn (10 sizes) |
| `full_campaign` | Full Campaign | Google + Facebook + Instagram (8 sizes) |

### Format keys reference

```
Google Display:   mrec · leader · half · wsky · billboard · mob_ban · mob_lg
Facebook:         fb_feed · fb_sq · fb_story · fb_cover
Instagram:        ig_sq · ig_port · ig_story · ig_land
TikTok:           tt_feed · tt_sq · tt_land
LinkedIn:         li_feed · li_sq · li_story · li_carousel
```

### Adding a custom set

Inside `banner_studio.html`, locate the `BANNER_SETS` array and add an entry:

```js
{ id: 'my_set', name: 'My Custom Set', keys: ['mrec', 'fb_feed', 'ig_sq'], desc: 'MRec · FB Feed · IG Square' }
```

---

## Export

### Single file

Exports the active artboard as a standalone HTML5 file with GSAP inline. Click **↓ Export → ↓ Current Size**.

### ZIP export

Exports all selected sizes as individual HTML5 files, organised into platform folders:

```
banners_export_[timestamp].zip
├── Google/
│   ├── mrec_300x250.html
│   └── leaderboard_728x90.html
├── Facebook/
│   └── feed_1200x628.html
└── Instagram/
    └── story-reel_1080x1920.html
```

Each exported file is a fully standalone HTML5 banner — no external dependencies, GSAP bundled inline, click-to-replay, correct `<meta name="ad.size">` tag for ad servers.

### Exporting to cloud storage (planned)

Wire the **Export ZIP** button to post the blob to a Cloudflare Worker:

```ts
// In banner_studio.html — replace the download trigger with a postMessage
window.parent.postMessage({ type: 'EXPORT_READY', payload: { blob, filename } }, '*')

// In the Nuxt parent — intercept and upload
window.addEventListener('message', async (e) => {
  if (e.data?.type !== 'EXPORT_READY') return
  const { blob, filename } = e.data.payload
  const form = new FormData()
  form.append('file', blob, filename)
  await fetch('/api/studio/export', { method: 'POST', body: form })
})
```

---

## AI Integration (Planned)

See the conversation notes for full architecture. Summary of the three planned phases:

### Phase 1 — Background Generator

- UI: "AI" tab in left panel — text prompt + accent colour → generate background
- API: Replicate `black-forest-labs/flux-schnell` via a Cloudflare Worker (keeps API key server-side)
- Output: image URL → `alSetBackground()` → drops into BG layer with Ken Burns
- Multi-size strategy: generate once per aspect ratio group (landscape / portrait / square), reuse across formats
- Estimated cost: ~$0.003 per generation

### Phase 2 — AI Layout Generator

- UI: "Generate Layout" button in the Set panel
- Flow: current content fields + active format dimensions → Anthropic Claude API → JSON layer array → `migrateLayer()` render loop
- Uses Claude Sonnet for layout logic and copy; image models only for photography
- API call goes through an existing Cloudflare Worker (Anthropic API key already configured in stack)

### Phase 3 — Vehicle Photo → Campaign Set

- UI: Upload vehicle photo in Assets panel → "Generate Campaign"
- Flow:
  1. Background removal — `lucataco/rembg` on Replicate (~$0.001/image)
  2. Background generation — Fal.ai `flux-pro` with image conditioning (describe showroom scene)
  3. Car PNG + generated BG → layer stack → push to all sizes in set
- Produces a full multi-format campaign from a single product shot

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Space` | Play All (all artboards simultaneously) |
| `Space` | Play / pause active artboard timeline |
| `Delete` / `Backspace` | Delete selected layer |
| `Cmd/Ctrl + D` | Duplicate selected layer |
| `[` / `]` | Move layer down / up in z-order |
| `Escape` | Deselect |
| Double-click text | Inline text edit |

---

## State Architecture

The studio uses a JavaScript `Proxy` object (`S`) to provide a transparent getter/setter over the underlying multi-artboard state (`_S`). All legacy code using `S.layers` and `S.format` continues to work unchanged — they automatically read/write the active artboard's data.

```
_S.activeKey          → currently active format key (e.g. 'mrec')
_S.setKeys[]          → ordered list of format keys in the current set
_S.set[key].layers[]  → independent layer array per format

S.layers   → getter/setter → _S.set[_S.activeKey].layers
S.format   → getter/setter → _S.activeKey
S.scale    → getter/setter → wsScale (workspace zoom level)
```

### Adding a new property to state

Add it directly to `_S`:

```js
_S.myNewProp = 'value'
```

If it needs a custom getter/setter, extend the Proxy handler at the top of the script.

---

## Roadmap

| Feature | Priority | Notes |
|---------|----------|-------|
| AI background generator | High | Phase 1 — Replicate Flux |
| AI layout generator | High | Phase 2 — Claude API |
| Vehicle photo → campaign | High | Phase 3 — rembg + Fal.ai |
| Asset cloud sync (Neon + R2) | High | Required for multi-user / multi-device |
| postMessage API implementation | High | Required for Nuxt integration |
| Workspace scale — auto-fit large formats | Medium | 9:16 artboards currently dominate workspace |
| Undo / redo stack | Medium | Currently no undo |
| Smart guides / snap to edge | Medium | |
| Animation curves editor | Low | Bezier UI for custom easing |
| Keyframe system | Low | Multiple animations per layer |
| Export to video | Low | MiniMax or FFmpeg via Worker |
| Blend modes | Low | multiply / screen / overlay |

---

## Development Notes

### Editing `banner_studio.html`

The entire application is in a single `<script>` block at the bottom of the file. Key sections in order:

1. `FORMATS` — all 23 ad format definitions
2. `BANNER_SETS` — preset size groups
3. `_S` / `S` Proxy — state object
4. `TEMPLATES` — 4 starter templates (Auto Sale, Lifestyle, Minimal, Price Hero)
5. `ELEMENTS` — 23 pre-styled component definitions (Headlines, CTAs, Badges, Shapes)
6. `renderWorkspace()` — main render loop for all artboards
7. `buildLayerEl()` — renders a single layer as a DOM element
8. `buildTimeline()` / `playTimeline()` — GSAP animation engine
9. `buildTimelineForKey()` / `playAll()` — multi-artboard simultaneous preview
10. Asset Library — `alOpen()`, `alPut()`, `alRender()`, `alPushToAll()` etc.
11. Export — `buildExportHTML()`, `exportAllZip()`

### Running locally

No build step. Open directly in browser:

```bash
open public/tools/banner_studio.html
```

Or serve with any static server:

```bash
npx serve public/tools
```

### Deploying with Nuxt / Cloudflare Pages

```bash
# Place in public directory
cp banner_studio.html public/tools/banner_studio.html

# Deploy as normal
npm run build
npx wrangler pages deploy dist
```

The file will be served as a static asset at `/tools/banner_studio.html` with no additional configuration.

---

## Support & Context

This tool was built across multiple sessions. For full implementation history, development decisions, and feature context see the session transcripts stored in `/mnt/transcripts/`.

Key transcripts:
- `2026-02-27-23-28-01` — Timeline presence bars, layer reordering
- `2026-02-27-23-43-40` — Elements library, multi-platform export, ZIP system
- `2026-02-28` — Multi-artboard workspace, Banner Sets, Play All, Asset Library
