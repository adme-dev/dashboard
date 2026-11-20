# ReelMotion native pilot implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, then request independent code review.

**Goal:** Reproduce a real dealer reel as editable Banner Studio artwork linked to a native Video Studio draft and prove a queued MP4 export.

**Architecture:** Extend the existing prepared-package importer with explicit ReelMotion provenance. Store fonts/media through existing scoped upload APIs, then create an AV timeline using the saved banner as an overlay and its audio assets as native audio tracks. Use the existing Video Studio queue; the separate banner-ad exporter retains its limits.

**Tech stack:** Nuxt 4, Nuxt UI 4, Zod, existing Banner/Video Studio APIs and Cloudflare render container.

**Spec:** Supplied `reelmotion-skill-handover/reelmotion/SKILL.md`; reference Monday job 13499445665 and its latest delivered Jimny video. Raw clips and private artifacts stay outside git.

## Constraints

- Historical job and delivered files remain untouched; all new projects are drafts.
- Exact client ownership must survive every upload/create/readback.
- Output is 1080×1920, 30 fps; preserve final speech before a 2.8-second end card.
- No graphics over detected heads; retain face/timing QA evidence alongside the private package.
- Original fonts/logo, editable text/keyframes, no arbitrary HTML/external package fetches.
- No silent truncation, synthetic presenter speech, invented approval or local-only claim of native export.
- First sample may carry an explicit missing-music note until a licensed bed is supplied or sourced.

## Review focus

- Forged/oversized package identity cannot relax existing TheBrief bounds.
- Missing speech/face QA or end-card overlap blocks ReelMotion import.
- Managed audio must belong to the selected client; failed companion creation must not lose the banner draft.
- Overlay preview must seek embedded footage and resolve its actual fonts, matching export.
- Retrying companion creation must reuse the same idempotency identity and verify saved state.

## Tasks

### 1. Prepare the real comparison

- [x] Download latest delivered V1, all seven original clips, script and Monday revisions.
- [x] Record checksums, source rotation/colour and reference duration (38.4 seconds).
- [x] Transcribe locally with word timestamps; record the opening repair's actual source word.
- [x] Build a voice-only draft through the supplied native canvas builder, inspect frames and run head/timing checks.

### 2. Extend the bounded importer

Files: `app/utils/thebrief-import.ts`, `app/utils/video/reelmotionImport.ts`, `app/components/banner/TheBriefImportModal.client.vue`, `app/components/banner/ProjectLibrary.client.vue`; tests under `test/video/reelmotionImport.test.ts`.

- [x] Write failing tests for explicit ReelMotion provenance, QA/timing gates, independent layer budget, and native companion timeline/audio ownership.
- [x] Support `xeroflow-reelmotion-import` v1, one portrait board, maximum 90 seconds/600 layers, validated prepared QA metadata. Keep existing TheBrief maximum 200 layers and source tags unchanged.
- [x] Retain the current scoped upload/create/readback workflow; add a Video Studio draft action only for ReelMotion. Companion timeline references the saved banner and managed audio, excluding duplicate iframe audio playback.
- [x] Verify companion create/readback and retain a retryable error without replacing the banner draft.
- [x] Run the new tests and existing importer tests.

### 3. Match native overlay preview to export

Files: `app/utils/video/bannerPreview.ts`, `app/components/media/MediaAvPreview.client.vue`; tests under `test/video/bannerPreview.test.ts`.

- [x] Write failing tests for font resolution, missing-font rejection, audio exclusion and modern runtime seeking with legacy fallback.
- [x] Resolve scoped fonts and seek `__engagrFrame` for overlays containing video; display actionable preview failure.
- [x] Run related preview tests and a real local media render.

### 4. Integrate and prove

- [x] Update public feature copy with bounded prepared-package support, not hosted automatic editing claims.
- [ ] Re-read changed files; obtain independent review, fix findings, run required checks.
- [ ] Fetch current main again, integrate the reviewed current candidate, guarded Pages release and record source/deployment IDs.
- [ ] Import the real package through authenticated native UI; save/reload both drafts and inspect fonts, video and timings.
- [ ] Queue Reels-only native export; retain the actual downloadable MP4, hashes, duration, full decode, audio measurements and comparison frames.
- [ ] Report local preparation, deployed support and authenticated/native proof separately. Keep unresolved music or QA differences visible.

## Checkpoint before release

- Local pilot: 40.18-second prepared canvas, 176 editable layers, 241 frames sampled at 6 fps with zero detected head overlaps. Corrected intro head clearance, model/spec numbering, Rhino/XL stack order and canonical Suzuki colours. Actual local MP4 fully decoded; voice-only limitation retained.
- Regression suite: 1,572 passed, one existing skip across 215 files (Video, TheBrief, Banner). One initial concurrent timeout passed in isolation and the bounded four-worker rerun.
- Independent review found and fixed server import-provider admission, ordinary-staff companion retry duplication and missing playback admission; each has RED-to-GREEN coverage. Companion identity is now resolved under the existing create transaction from canonical saved source/assets.
- Ruling: use the existing Video Studio overlay path for the portrait draft instead of changing banner-ad duration limits; this preserves the existing ad policy and avoids a new renderer release. Cost if wrong: native queued acceptance will fail and the sample must remain labelled local.
- Full application typecheck is still running; no success claimed. Native import, production release and queued output acceptance remain open.
