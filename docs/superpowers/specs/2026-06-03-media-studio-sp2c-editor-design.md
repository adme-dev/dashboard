# Media Studio SP2c — audio timeline EDITOR (design)

**Status:** Design for review · 2026-06-03
**Phase:** Media Studio Phase 1b. Turns the SP2b **read-only** timeline player into the **full pro multitrack editor**.
**Builds on:** SP0 (timeline contract + endpoints), SP1 (render spine), SP2a (audio engine), SP2b (read-only preview page + `MediaTimeline.client.vue` + pure `timelineGeometry.ts` + `useMediaProjectEditor.ts`).
**Companion:** `engagr-ai-media-studio-master-brief.md` §5 (the editor is the surface), competitive-patterns §5 (editor UX).

## 0. Goal & scope

**Goal:** a usable, single-editor pro multitrack audio editor — create a project, populate it from the audio library, arrange/trim/slice clips with snapping, with real undo/redo, autosave, named version snapshots, zoom, and per-clip waveforms. No more UUID-pasting: a projects list + nav + create flow.

**In scope (one slice — operator chose "full prior scope in one"):**
- Create-project flow + projects list + nav.
- Asset picker (add clips from `audio_assets`).
- Edit: move (incl. across tracks), trim, slice, delete; snapping; zoom.
- Persistence: in-memory undo/redo + debounced autosave + named version snapshots.
- Per-clip waveforms (client-side `wavesurfer.js`).

**Out of scope (deferred, unchanged):**
- Transcript-driven VO editing, per-track lock/mute/hide UI, duck-amount UI → **SP3**.
- Real-time collaboration (banner-rooms port), multi-editor conflict resolution → **SP2d**.
- Direct audio file upload as a clip source (assets only for SP2c).
- Multi-select / group operations (single-select in SP2c) → SP3.
- Server-side `audiowaveform` peak precompute (see §7) → later optimization, not SP2c.

## 1. Backend — no new endpoints

SP0/SP1 already expose everything; SP2c is a frontend slice + one dep (`wavesurfer.js`). Endpoints used:
- `GET /agency/audio/projects` (`index.get`) — projects list.
- `POST /agency/audio/projects` (`index.post`) — create project (+ empty timeline).
- `GET /agency/audio/projects/[id]` — project + current timeline (the `MediaTimeline` wrapper; `TimelineState` lives in `.state` — narrow via `TimelineStateSchema.safeParse`, the SP2b lesson).
- `PUT /agency/audio/projects/[id]/timeline` (`timeline.put`) — autosave the working timeline.
- `GET/POST .../versions` — list / snapshot named versions.
- `GET .../clip-sources` — presign timeline clip keys (drives both playback and waveform decode).
- `GET /agency/audio/assets` (existing Audio Studio list) — the asset-picker source (`audio_assets`: `id, kind, title, r2_key_master, duration_sec, status, client_id`).

⚠️ Verify during planning that no SP0 endpoint rejects the larger mutated timelines (it accepts SP0-schema-valid state — our edits stay schema-valid by construction, see §2).

## 2. Editing core — pure, TDD'd (`app/utils/audio/timelineEdit.ts`)

All editing logic is **pure** `(TimelineState, args) → TimelineState`, no I/O — the component/composable call these; tests cover them directly (mirrors SP0's `timelineSchema.ts`/`computeDuration` pattern). Every result is re-run through `validateTimeline` (SP0) and `computeDuration` so the state the editor holds is always SP0-valid.

- `addClip(state, { trackId, asset, startSec })` → appends a `Clip` to `trackId`: generated `id`, `r2_key = asset.r2_key_master`, `asset_id = asset.id`, `timeline_start_sec = max(0, startSec)`, `source_in_sec = 0`, `source_out_sec = null` (play to end), default gains/fades. Recompute duration.
- `moveClip(state, { clipId, toTrackId, newStartSec })` → moves the clip (possibly to a **different track, any kind**) to `max(0, newStartSec)`. Recompute.
- `trimClip(state, { clipId, edge: 'start'|'end', newTimeSec, sourceDurationSec })` → adjusts `source_in_sec`/`source_out_sec` (+ `timeline_start_sec` for the start edge), clamped: `source_in_sec ≥ 0`, `source_out_sec > source_in_sec`, `source_out_sec ≤ sourceDurationSec`. `sourceDurationSec` comes from the engine's decoded buffer (passed in — keeps the fn pure).
- `sliceClipAt(state, { clipId, timeSec })` → splits one clip into two at timeline `timeSec`: left keeps `[source_in, source_in + (timeSec − timeline_start)]` + the original `fade_in`; right starts at `timeSec` with adjusted `source_in` + the original `fade_out`; the cut edges get `0` fade. New ids. No-op if `timeSec` outside the clip. Recompute.
- `deleteClip(state, { clipId })` → removes it (and any ducking rule that becomes invalid? No — ducking references tracks, not clips, so unaffected). Recompute.
- `snapTime(t, targets, pxPerSec, thresholdPx = 8)` → snaps `t` to the nearest of `targets` (grid ticks, other clip start/end, playhead, 0) within `thresholdPx / pxPerSec` seconds; pure.

## 3. Persistence & undo — the three-part model

1. **In-memory undo/redo stack** of `TimelineState` snapshots (structural-clone), bounded ~100 entries, in `useMediaProjectEditor`. Every *committed* edit (drag-end, trim-end, slice, add, delete) pushes the prior state. `Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Shift+Z` redo. Transient drag previews do **not** push history.
2. **Debounced autosave** — ~800 ms after the last committed edit, `PUT timeline.put` with the working `TimelineState`. A subtle status pill: `Saving…` → `Saved ✓` → `Save failed ↺ retry`. Autosave failures never lose local state (kept in memory + undo stack); retry on next edit or manual.
3. **Named version snapshots** — explicit "Save version" → `versions.post { label, state }`; a version panel (`versions.get`) lists snapshots; "Restore" loads a version's state into the working timeline (pushes undo, triggers autosave). Distinct from autosave (which mutates the single working timeline).

**Conflict policy (SP2c = single editor):** last-write-wins on autosave; no server-version-changed detection. Multi-editor conflict handling is **SP2d** (explicitly deferred — note it so SP2d doesn't surprise us).

## 4. Editing interactions (extend `MediaTimeline.client.vue`)

Keep SP2b's read-only render path (lanes, ruler, clip blocks via `timelineGeometry`, single playhead); **add** an interaction layer on top:
- **Select** — click a clip → selected (ring highlight); click empty → deselect.
- **Move** — drag a clip horizontally (time) and vertically (onto **any** track lane). Live preview follows the cursor; on drop, `snapTime` against grid / other clip edges / playhead / 0, then `moveClip` + push history + autosave.
- **Trim** — drag left/right edge handles; live preview; clamp via decoded `sourceDurationSec`; on release `trimClip`.
- **Slice** — "Split at playhead" toolbar button + `S`; `sliceClipAt` on the selected clip (or the clip under the playhead).
- **Delete** — `Delete`/`Backspace` on selection; `deleteClip`.
- **Zoom** — `pxPerSec` slider + `+`/`−` + "fit to window"; geometry already parameterised on `pxPerSec`.
- **Playhead/seek** — reuse SP2b (rAF read of `engine.currentTime()`); click ruler to seek.

Accessibility/UX: Nuxt UI v4 components, semantic colours, dark-mode safe; drag handles have hit-padding; keyboard shortcuts documented in a small "?" popover.

## 5. Asset picker (`USlideover`)

"Add clip" opens a slideover listing the org's `audio_assets` (filter by `kind` = voiceover/music/sfx; search by title; inline `<audio>` preview from the asset's presigned URL). Selecting an asset → `addClip` onto the target track (the currently-selected track, else the kind-matching track, else a new track) at the playhead. Direct upload is **out of scope** (assets only).

## 6. Waveforms — client-side `wavesurfer.js` (decision)

Each clip block renders a waveform via **`wavesurfer.js`** decoding the clip's **presigned R2 audio** (from `clip-sources`), peaks cached per `r2_key` in memory (decode once, reuse across re-renders/zoom). **Rationale:** ad-length clips (<5 min) decode fine client-side; this avoids standing up the server `audiowaveform`→R2 peak pipeline (oss-prior-art §1), which is only worth it for long files. The server peak-cache is noted as a **later optimization**, explicitly not SP2c. `wavesurfer.js` is **render-only here** — the SP2a/SP2b engine stays the authoritative clock (never let wavesurfer own playback; oss-prior-art §1 trap).

## 7. Create-flow + projects list + nav

- **`/agency/audio/projects`** (new page) — `UTable` of the org's projects (title, media_type, updated_at; actions: open · duplicate · delete) via `index.get`. "New project" button → `index.post` (title prompt, `media_type: 'audio'`) → creates project + empty timeline → routes to `/agency/audio/projects/[id]`.
- **Nav** — an entry under the audio area ("Projects" / "Editor") so the editor is reachable without pasting UUIDs. `/agency/audio` stays the *generate* studio; `/agency/audio/projects` is the editor surface.
- **Front-facing sync** (per repo CLAUDE.md): note the editor on the relevant `features/*` page when it ships.

## 8. Files

**New:**
- `app/utils/audio/timelineEdit.ts` — pure edit fns (§2) + tests.
- `app/pages/agency/audio/projects/index.vue` — projects list + create.
- `app/components/media/AssetPickerSlideover.vue` (or `MediaAssetPicker`) — §5.
- (optional) `app/composables/useTimelineUndo.ts` — the bounded undo/redo stack, if cleaner than inlining in the editor composable.

**Extended:**
- `app/composables/useMediaProjectEditor.ts` — edit actions (call `timelineEdit`), undo/redo stack, debounced autosave, version actions, decoded-duration lookup for trim clamping.
- `app/components/media/MediaTimeline.client.vue` — interaction layer (move/trim/slice/select), per-clip waveforms, zoom; keep the read-only render path.

**Dependency:** add `wavesurfer.js`.

## 9. Testing

- **`timelineEdit.ts`** — full unit coverage (TDD): add/move/trim (clamp cases)/slice (boundary + outside)/delete; `snapTime` thresholds; every output passes `validateTimeline`; `computeDuration` correctness.
- **Undo/redo reducer** — push/undo/redo/bounded-eviction; transient-vs-committed distinction.
- **Autosave** — debounce coalescing; failure keeps state; status transitions (with injected fetch).
- **Component** — interaction smoke tests where happy-dom allows (selection, slice-at-playhead, delete); geometry already covered by SP2b's `timelineGeometry` tests.

## 10. Decisions & deferrals

| Decision | Choice | Why |
|---|---|---|
| Save/undo model | In-memory undo/redo **+** debounced autosave **+** named version snapshots | Operator chose full/enterprise capability; uses both existing endpoints correctly |
| Cross-track move | Clips can move to **any** track | Simpler + more flexible; kind is metadata, not a hard constraint |
| Waveforms | Client-side `wavesurfer.js` (render-only) | Right for ad-length audio; avoids server peak pipeline; engine stays clock-authoritative |
| Conflict handling | Single-editor last-write-wins | Collab is **SP2d** |
| Upload as clip source | Deferred | `audio_assets` only in SP2c |
| transcript-edit / lock-mute / duck-UI | Deferred | **SP3** |

## 11. Acceptance (verify-live)

- Create a project from `/agency/audio/projects`, land in the editor on an empty timeline.
- Add a VO + a music clip from the asset picker; both render with waveforms.
- Move (incl. across tracks), trim (edges clamp to source length), and slice-at-playhead all work and snap.
- `Cmd+Z`/`Cmd+Shift+Z` undo/redo a burst of edits correctly.
- Edits autosave (status pill), survive reload; a named version snapshots and restores.
- Play: the engine renders the edited timeline (ducking/fades correct over the new arrangement) — the **carried SP1/SP2 ear-check** lands here on a real edited multitrack.
- Dormant-in-prod posture unchanged (render spine still operator-gated).
