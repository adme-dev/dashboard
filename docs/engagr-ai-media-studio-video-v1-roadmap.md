# engagr AI Media Studio — Video V1 (Assembly) Roadmap

**Status:** Draft for review — 2026-06-09
**Scope of this doc:** decompose **V1 only** (assembly, no AI generation) into buildable slices with dependencies, success criteria, and the gray-area decisions to settle before code. V2 (generation + compliance) and V3 (presenter + scale) are named but not detailed here.
**Inputs:** `engagr-ai-media-studio-video-brief.md` (§4 render, §6 phasing, §9 next artefacts), `engagr-ai-media-studio-master-brief.md` (§3 build state), `engagr-ai-media-studio-oss-prior-art.md`, and the **composite-render spike** (`docs/superpowers/specs/2026-06-08-video-composite-render-spike-design.md` → `FINDINGS.md`), which already proved the render path: alpha ✓, determinism ✓ (SSIM 1.000), render cost negligible (~$0.001/30s ad).
**Build model:** each slice is its own spec → plan → subagent-driven execution + review cycle (the cadence used for the spike and the whole audio Media Studio). Everything ships **behind a flag, dormant** until the operator activates queue/bindings/container — the project's established pattern.

---

## 0. What V1 is (and is deliberately not)

**V1 = a user assembles *approved, real* media into a finished, platform-ready video ad — with zero AI generation.** Compliant by construction (no model can hallucinate a vehicle because no model runs). It exercises the full composite render the spike de-risked, and it's the lowest-risk way to prove the end-to-end pipeline before the expensive/risky generation layer.

**A V1 video is a composite of:**
1. **Base layer** — uploaded dealer/OEM footage **and/or** approved still images animated with **ffmpeg motion** (Ken Burns / pan / zoom via `zoompan`). Real pixels only.
2. **Overlay layer** — GSAP compositions (price callout, finance disclaimer, logo, lower-third) — **reuse Banner Studio** comps (`useBannerTimeline` is already seekable; `banner-studio/export-video` already frame-steps GSAP).
3. **Audio bed** — music + voiceover from the **shipped audio Media Studio** (Audio Studio gen + the multitrack editor).

**Explicitly OUT of V1 (deferred):**
- ❌ Text-to-video and **model-based image-to-video** → V2 (these are the dollars-per-clip, compliance-risk paths)
- ❌ AI presenter / talking avatar → V3
- ❌ Compliance gate, generation provenance, per-tenant spend caps → V2 (nothing to gate/meter when no model runs)
- ❌ Transitions library, OEM brand-kit templated scenes, batch render → V3

> **Note on the brief:** §6 of the video brief lists "image-to-video of approved stills" inside V1. This roadmap recommends a tighter boundary (Decision **D1** below): V1 animates stills with **ffmpeg**, not a model — keeping V1 genuinely "no generation," with no model/spend/compliance infra. Model-based image-to-video moves to V2.

---

## 1. Decisions to confirm before building (gray areas)

These shape the slices. My recommendation is first; flag any you want changed during review.

| # | Decision | Recommendation | Why |
|---|---|---|---|
| **D1** | Does V1 include **image-to-video of stills**? | **No model — animate stills with ffmpeg `zoompan` (Ken Burns/parallax).** Defer model-based image-to-video to V2. | Keeps V1 truly "no generation": no Proxied-model call, no spend caps, no compliance gate, no AI-Gateway billing. Still real pixels, still motion, still compliant. Cheaper + faster to ship. |
| **D2** | **One editor** (extend the shipped audio Media Studio editor with video+overlay tracks) or a **separate** video editor? | **Extend the existing editor.** | The brief's "one timeline" principle; SP0 schema already has a `schema_version` seam + `media_type` `'av'`. Reuse SP2's Web-Audio clock + timeline geometry. |
| **D3** | **Overlay source** for V1 | **Reuse Banner Studio GSAP compositions** as the overlay layer (pick a Banner project per shot). | The brief's reuse seed; `export-video`'s frame-step path + `useBannerTimeline.seekTo` already exist. No new overlay-authoring tool in V1. |
| **D4** | **Render host** | **Productionize the spike's Container** as a new `video-render` Queue + Container on the existing **audio-jobs** worker rails (or a sibling `video-jobs` worker). | The spike's container already builds + renders; reuses the proven Queue→Container→R2→Neon topology + heartbeat/idempotency. |
| **D5** | **Clock for AV preview** | **`AudioContext.currentTime` stays master**; video `<video>` playback + the GSAP overlay both slave to it (frame-accurate seek on scrub). | Unchanged from the audio brief §4 clock rule; SP2's engine already implements the master clock. |

---

## 2. The V1 slices

Four slices + one cross-cutting rollout track. Each is one spec→plan→build cycle, flag-gated and dormant.

### Slice V1.1 — Scenes→shots data model  *(foundation — no deps)*
**Goal:** an AV timeline (video + overlay + audio tracks, structured as scenes→shots) validates, persists, and round-trips; audio projects are untouched.
- **Migration 173** (next free number; verify at build time): additive extension of the SP0 `media_projects` / `media_timelines` tables for AV — video & overlay track kinds, a shot structure (base source = `uploaded_footage` | `still_kenburns` | `gsap_composition`, ordered overlay stack, per-shot audio mode), **OTIO-shaped rational time** (no float-frame drift). Bump `schema_version`; audio projects read as the degenerate "one scene, audio-only" case. `IF NOT EXISTS` guards.
- Extend the pure Zod contract `server/utils/audio/timelineSchema.ts` (add video/overlay track kinds + shot schema + `migrateTimeline` seam) — **pure, unit-tested**, dual-importable (Nitro + container).
- Extend the gateway (`server/utils/audio/projects.ts` or a new `video/` module) + endpoints (extend `server/api/agency/audio/projects/**` or a new `agency/video/**`).
- **Success:** an AV timeline JSON validates + persists + round-trips through the gateway; `computeDuration` handles video shots; existing audio projects/tests unaffected (0 regressions).
- **Risk:** low. Pure schema extension on a seam SP0 designed for this.

### Slice V1.2 — Composite render spine on `main`  *(deps: V1.1; de-risked by the spike)*
**Goal:** a stored AV timeline renders to a platform MP4 in R2 — overlays composited onto the base, audio muxed — deterministically, with job status in `media_render_jobs`.
- Promote the spike's pure `buildCompositeArgs` into a production composite-args builder generalized to: N sequenced base clips (footage) + **`zoompan` still-motion** (D1) + the alpha GSAP overlay sequence + multi-input audio mux + per-platform profile. **Pure, unit-tested**, with a `.mjs` container port + parity test (the spike's pattern).
- New **`video-render` Queue + DLQ** + a `RenderVideoContainer` (bake Chromium + ffmpeg, per the spike's Dockerfile) on the **audio-jobs** worker (or sibling `video-jobs`): headless overlay capture → ffmpeg composite → R2 → Neon status, with `renewActivityTimeout` heartbeat + idempotency key (carry over the audio render spine's lifecycle).
- Render endpoint: AV timeline → snapshot-on-render → enqueue → job row.
- **Success:** a stored AV timeline (footage + still + Banner overlay + audio) renders to a real composited MP4 in R2; `media_render_jobs` tracks queued→done; re-render is deterministic. Behind `VIDEO_STUDIO_ENABLED`, dormant.
- **Risk:** low-medium. The spike proved the mechanics + cost; this is productionizing onto live rails (the harder, invisible parts are done).

### Slice V1.3 — AV timeline editor UI  *(deps: V1.1 + V1.2; the biggest lift)*
**Goal:** a user assembles footage + stills + a Banner overlay + audio on a multitrack timeline and renders a finished video.
- Extend `app/components/media/MediaTimeline` + the editor (`useMediaProjectEditor`) with **video tracks + overlay tracks** alongside the audio lanes: place/trim/move video clips, add stills with a motion preset (D1), add an overlay by picking a **Banner Studio composition** (D3), audio lanes from the audio studio.
- **AV preview** on the SP2 master clock (D5): `<video>` + GSAP overlay slaved to `AudioContext.currentTime`, frame-accurate seek on scrub.
- Asset pickers: footage/still upload → R2; Banner comp picker; audio from the audio Media Studio.
- "Render" action → the V1.2 endpoint; job progress surfaced.
- **Success:** end-to-end in the browser — assemble the four input types, preview, hit render, get the V1.2 MP4 back. Behind the flag.
- **Risk:** medium-high (UI surface + preview clock). Mitigated by reusing SP2's shipped engine/geometry.

### Slice V1.4 — Multi-platform export + distribution handoff  *(deps: V1.2; mostly wiring)*
**Goal:** a rendered video exports in a chosen platform profile and can be scheduled/published through the existing Social Suite.
- V1.2 render emits **destination-correct profiles** (9:16 / 1:1 / 16:9; per-platform codec/bitrate/duration cap + LUFS via `profiles.ts`).
- Hand the R2 key to the existing **Social Suite providers** (`server/utils/social-providers/`) — YouTube/TikTok/Reels/etc. — for scheduled publish (the existing scheduler owns timing).
- **Success:** a finished video is exported in a target aspect/profile and scheduled via the existing social distribution. Behind the flag.
- **Risk:** low. Distribution is a wiring job onto shipped infra (per the audio brief "distribution handoff").

### Cross-cutting — Rollout & front-facing sync  *(spans all slices)*
- **Flag-gated + dormant:** all V1 behind `VIDEO_STUDIO_ENABLED` (off); operator activates the queue + bindings + container deploy. Matches every prior module.
- **Front-facing sync (CLAUDE.md mandate):** add **"AI Video Creation"** to the marketing features page (`features/index.vue` + `[slug].vue`, Creative Production category) — **coming-soon** treatment during V1 build, **upgraded to live** when V1.3+V1.4 ship. *(This captures the earlier "add the video extension to the marketing features page" ask; I can do the coming-soon entry immediately as a pre-announcement, or hold it to launch — your call.)*
- **Tests per slice** (vitest), pure render/edit cores unit-tested; **no live model calls anywhere in V1.**

---

## 3. Sequencing & dependency graph

```
V1.1 (schema)  ──►  V1.2 (render spine)  ──►  V1.4 (export + distribution)
      │                     │
      └─────────────────────┴──►  V1.3 (editor UI)
```

- **V1.1 first** (everything renders from / edits the AV schema).
- **V1.2 next** — the de-risked spine; can start as soon as the schema lands. Highest value, lowest remaining risk.
- **V1.3** — the big UI lift; needs both schema (to edit) and render (to invoke).
- **V1.4** — mostly wiring; needs the render to emit profiles. Can overlap V1.3.
- Recommended order: **V1.1 → V1.2 → V1.3 → V1.4** (V1.4 can interleave with late V1.3).

---

## 4. V1 milestone success criteria (the "done" bar)

An agency user can, **behind the flag**, in the browser:
1. Create an AV project, upload approved footage and/or stills, add a Banner Studio overlay and an audio bed,
2. Assemble them on a multitrack timeline and preview,
3. Render a finished, deterministic composite video to R2, and
4. Export it in a platform profile and schedule it via the existing Social Suite —

…with **zero AI generation**, compliant by construction, on the existing Cloudflare rails. That proves the whole pipeline and sets up V2 (generation + compliance) to grow on the same spine.

---

## 5. After V1 (named, not detailed here)

- **V2 — Generation in the loop:** Proxied video models (Veo/Seedance/…), model-based image-to-video, **automotive compliance gate** (image-to-video default for vehicles, text-to-video gated, approval + provenance), per-tenant spend caps + AI-Gateway tagging, native-audio reconciliation.
- **V3 — Scale & polish:** AI presenter (talking-avatar clip type), transitions library, OEM brand-kit templated scenes, batch render across the dealer portfolio.

---

## 6. Open question for review

Beyond Decisions D1–D5 above, the one scoping call worth your explicit sign-off: **is the D1 boundary right** — V1 animates stills with ffmpeg (no model) and defers *all* model calls to V2? That's what makes V1 "no generation, no spend, no compliance gate." If you'd rather V1 include model-based image-to-video, V1 absorbs a slice of the V2 generation/governance infra (spend caps + compliance gate become V1 blockers) — a meaningfully bigger V1. My recommendation is to hold the tighter boundary.
