# Video V1.3 — AV editor UI design

**Status:** Draft for review — 2026-06-09
**Slice:** V1.3 of the Video V1 roadmap. The user-facing editor: extend the **shipped audio Media Studio editor** with video + overlay tracks so an operator assembles footage + stills + a Banner overlay + audio on a timeline and renders.
**Builds on:** V1.1 AV schema (`video`/`overlay` track kinds, `gsap_format_key`), V1.2 render spine (`render-video.post.ts`, flag-gated), and the shipped SP2 audio editor.
**Note:** written at session-context limit as a design checkpoint; the implementation (plan + build) runs in a fresh session.

---

## 1. What's reused vs new (from the editor map)

**Reuse as-is — already generic over track kind:**
- `app/utils/audio/timelineEdit.ts` — pure edit core (`moveClip`/`trimClip`/`sliceClipAt`/`deleteClip`/`addClip`/`addTrack`/`snapTime`), immutable, kind-agnostic.
- `app/utils/audio/timelineGeometry.ts` — pixel math (`clipRect`/`playheadX`/`timeAtX`), track-agnostic.
- `useMediaProjectEditor.ts` undo/redo + debounced autosave (`PUT /timeline`) + version snapshots — generic.
- `app/components/media/MediaTimeline.client.vue` — generic lane/clip rendering + drag/trim/slice/select/snap interactions.

**New in V1.3:**
- Video + overlay **lane rendering** in `MediaTimeline` (video clips show a poster/thumbnail strip; overlay clips show a label/badge — not a wavesurfer waveform).
- **Preview** of video + overlay slaved to the existing audio clock (see §2 — the central decision).
- **Footage/stills upload** + an **overlay (Banner) picker**; extend the asset picker.
- Wire the **"Render" action** to `render-video.post.ts` + job-status polling.
- An **AV editor entry** (create/open `media_type:'av'` projects; the create endpoint already seeds `emptyAvTimeline`).

---

## 2. The central decision — preview approach (confirm before building)

The audio engine (`useAudioEngine`, Web Audio) is the master clock and is audio-only. A full frame-accurate composite preview (a canvas compositor unifying video + GSAP + audio) is large and **the render is already authoritative**. So:

**Recommendation — "preview-lite", media-elements slaved to the audio clock:**
- **Audio** keeps playing through the existing Web Audio engine (unchanged) — it stays the master clock (`currentTime`).
- **Video tracks:** one `<video>` element per active video clip; the rAF loop already mirroring `engine.currentTime()` also **seeks each `<video>` to `currentTime - clip.timeline_start_sec`** (and play/pause follows transport). The browser decodes; we only keep it synced. Stills (`still_kenburns`) preview as a static `<img>` (the ken-burns motion is a render-time effect — preview shows the still).
- **Overlay tracks:** an `<iframe>`/container loading the resolved Banner HTML, with the rAF loop driving `gsap.globalTimeline.getChildren()[0].seek(currentTime - clip.timeline_start_sec)` — the same mechanism the container uses.
- Stacking order in the preview pane mirrors the composite (base video → overlay on top).

This is **dramatically simpler** than a unified compositor, sufficient for an *assembly* editor (position/trim/time things correctly), and reuses the shipped clock untouched. **Deferred:** a true frame-accurate WYSIWYG compositor (only if assembly-by-slaved-elements proves inadequate in UAT).

*(Alternative considered: decouple the scheduler into a generic event bus + build a canvas compositor — rejected for V1.3 as over-scoped; the render is the source of truth.)*

---

## 3. Components / files (indicative)

- `app/pages/agency/audio/projects/[id].vue` — add a **preview pane** (video/img/overlay-iframe stack) above/beside the timeline; add video/overlay/footage toolbar affordances; a **"Render video"** button (av projects) → `render-video` + a jobs panel.
- `app/composables/useMediaProjectEditor.ts` — extend: track the AV `sources`/preview state; a `previewTick` that seeks `<video>`/overlay to `currentTime`; `addFootageAction`/`addStillAction`/`addOverlayAction` (reusing `addClipToKindTrackAction`); `renderVideoAction(formats)` + `renderJobs` polling.
- `app/components/media/MediaTimeline.client.vue` — per-track-kind clip rendering (video poster strip, overlay badge) behind the existing generic lane layout.
- `app/components/media/MediaAvPreview.client.vue` (new) — the slaved preview pane (`<video>`/`<img>`/overlay-`<iframe>`, all driven by a `currentTime` prop).
- `app/components/media/MediaOverlayPicker.vue` (new) — pick a Banner Studio project + `gsap_format_key` for an overlay clip (lists banner projects; sets `gsap_project_id`/`gsap_format_key`).
- Extend `MediaAssetPicker.vue` — footage/stills (uploaded) + the overlay picker entry.
- **Upload endpoint(s):** `server/api/agency/audio/projects/[id]/upload-media.post.ts` (multipart → `uploadFile()` → R2 → returns the `r2_key`); reuse the `tasks/[id]/attachments.post.ts` multipart pattern. Footage/stills land in R2; the clip's `r2_key` points at them.
- Marketing: per CLAUDE.md front-facing sync — flip the **coming-soon** "AI Video Creation" feature entry toward live when V1.3 + V1.4 ship (still unbuilt; see roadmap).

---

## 4. Scope

**In:** AV project create/open; video + overlay lanes in the timeline (reusing the generic edit core); preview-lite (§2); footage/stills upload + overlay (Banner) picker; "Render video" wiring + job-status polling. Behind `VIDEO_STUDIO_ENABLED` (the render is gated; the editor UI itself can render but the render call 404s when the flag is off — decide in the plan whether to gate the whole AV editor or just the render button).

**Out (later):** a true frame-accurate composite preview/compositor; per-format overlay aspect (the V1.2b deferred item); transitions/scene grouping (V3); V1.4 export/distribution UI; AI generation (V2).

---

## 5. Success criteria

- An operator creates an AV project, uploads footage + a still, adds a Banner overlay (picks project + format) and an audio bed, arranges them on the multitrack timeline (move/trim/slice/snap/undo/redo/autosave — all reused), scrubs and sees the preview-lite stay roughly in sync, and hits "Render video" → a `render-video` job is enqueued and its status shows.
- Zero regression to the shipped **audio** editor (audio projects behave identically; the editor branches on `media_type`/track kind).
- Pure-logic additions unit-tested; component logic tested where feasible (the editor map shows the edit core + geometry are already pure/tested — keep new pure helpers that way).

## 6. Biggest risks (for the plan to mitigate)

1. **Preview sync** — `<video>`/overlay seek-to-clock can drift/jank; the plan should define the rAF seek cadence + a tolerance, and accept "assembly-grade" (not frame-perfect) sync for V1.3.
2. **Not regressing the shipped audio editor** — the editor is live for audio; every change must branch cleanly so audio projects are untouched. A strong audio-editor regression pass is mandatory.
3. **Upload security** — the new media-upload endpoint needs auth + type/size limits + R2 key scoping (reuse the attachments pattern's guards).
