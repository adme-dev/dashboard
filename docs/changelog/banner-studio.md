# Banner Studio change log

## Creative team library access — live (23 November 2026)

An active, current Creative permission grants automatic access to all Banner Studio
clients, folder contents, projects, assets, brand kits, saved viewers and downloads.
Individual client assignments are no longer required for that creative workspace;
new client artwork becomes available automatically. This covers the Creative and
Producer system roles and custom roles explicitly granted Creative permission.

The grant is specific to Banner Studio. It does not add client assignments or change
finance, billing, social account or publishing permissions. Other roles keep their
existing scope, and the marketing-management protected-artwork rules remain in place.
The new full-library authority is checked against the current active member and
selected database role; a stale Creative session cannot retain it after revocation.

Validation with locked dependencies on Node 24.18.0: 850 tests passed and one
optional browser test skipped across Banner Studio, creative access, finance,
social, QR, deployment guards and imported-motion coverage. The new creative
access helper and regression suite pass lint, with no new lint findings across
edited files.

Released in [PR #965](https://github.com/adme-dev/dashboard/pull/965), source
`833242f2264423104dcbc4ca8af02ce611f5a4ce`, production deployment
`d8a6b2b5-b3e1-4c0e-a1c5-2c91000bce63` on `agency-dashboard/main`.
The production build, worker runtime guards and size budgets pass (15.33 MB raw,
5.32 MB gzip). Cloudflare production metadata identifies the merged source.
Live browser checks in the admin session retained 408 projects, the folder tree,
20 projects in Northern Motor Group and the existing QR library (23 codes).
The affected staff accounts remain active with the Creative role. No individual
client assignment, role upgrade or finance grant was made. The regression suite
exercises a Creative user without client assignments; an affected user's own
signed-in browser confirmation remains separate from the admin smoke check.

## 23 November 2026 — Editable RAM and Nissan entrances

- Added reviewed word/letter effects, soft wipes and TV shape reveals with native timing and removal controls across the editor, saved viewer and client video renderer. Text and packaged fonts remain editable.
- Preserved the RAM top video fade and allowed verified clips up to 24 MiB within bounded packages. Unknown source effects remain review holds.
- Added regression coverage for reverse seeking, typewriter step-end timing, irregular delays, safe runtime metadata, and strict mask/glow recipes. Live migration acceptance is tracked in the Northern campaign ledger.

## Migration readiness reconciliation — 23 November 2026

This checkpoint supersedes the October outstanding-feature list below. It reconciles recent implementation history with current `main` (`52f84ef95`); historical entries retain the state at their original date.

| Area | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Designer workflow | Linked layouts, native text/font controls, image/video/audio insertion, replacement/crop controls and brand button presets are implemented. Insert opens first in both editor routes. | A producer/designer trial using active campaign files, including revision, undo, save/reopen and delivery. |
| MotorStack | Media search/import, readable brand kits and automatic kit selection are live; the GEELY work recorded 986 targeted passing checks and live font verification in PR #780. | Scheduled MotorStack refresh remains outstanding. Applying a kit is an explicit edit; retain exact imported campaign faces. |
| Client videos | Native compiled H.264/AAC proofs, phone layout fixes, initial-page completed-video capabilities, bounded status requests and safe stale-queue recovery shipped through PRs #880–883. | Actual Safari/iPhone playback remains unverified in the recorded history. Chrome/mobile layout checks do not certify Safari. |
| Current four campaigns | Leapmotor and GAC are saved as three-size editable drafts. Corrected packages bind every text layer to a managed font (32/32 and 35/35); save/reopen edits, six-second soundtrack transport and 18 corrected-font source-CSS/native comparisons were checked. | Producer review remains open. RAM and Nissan remain held for unsupported mask/text/reveal motion; RAM also exceeds the bounded video inspection limit. |
| Posters | Released in PR #962: the selected size's saved-artwork still appears before playback and during preparation. All six live poster JPEGs and client videos were verified; 390px Chrome layout and fallback regressions pass. | Actual Safari/iPhone and producer acceptance remain separate. |

PR #962 also fixes export-only custom-font family aliases, reconciles internally consistent audio clip duration against stale generic element duration, and preserves uniform solid bordered shapes as editable native button layers with empty text. Unsupported borders and ambiguous font aliases still hold conversion. Original files and client capabilities stay outside Git. Production source `ba26c0405`, deployment `237f294f-2587-4208-b2ae-fa3298ea8474`, target `agency-dashboard/main`. See the [current campaign acceptance ledger](../migrations/banner-studio-northern-20261123.md) for build, media and colleague-work preservation evidence.

## Recents import compatibility — release candidate (31 October 2026)

Offline preparation now retains centered horizontal image reflections, transparent shapes and full normal/italic Google font faces. Static image opacity and bounded filter chains preserve source brightness, hue and shadows in the editor and exports. Supported intermediate pulse and bounce effects preserve exact cycle/reset timestamps and clipped easing curves. Native playback and both HTML exporters handle ordered keyframes at the same timestamp, including forward and backward seeks after saving. Larger outer design-set ZIPs have a separate bounded inspection profile; child archives retain the standard limits.

Animated blur, unsupported 3D/custom animation and source-video imports remain held. The private Recents ledger distinguishes prepared packages, existing drafts and conversion holds; preparation is not proof of a completed library migration or production artwork approval. The first Blood Hyundai comparison identified missing image opacity and filters; its corrected packages require renewed visual review and a guarded refresh of the existing drafts. These changes are a local release candidate until deployment and live acceptance are recorded. See the [import runbook](../runbooks/thebrief-banner-import.md).

## Timeline picker and compact library navigation (30 October 2026)

- Search Clients, Folders and Tags in separate sidebar tabs. All clients and Unassigned stay pinned, names wrap, and each list scrolls within the screen. Active filters remain visible above projects when changing tabs.
- Click native entrance or exit clips for a floating preset picker. Layer icons identify media types; the inspector opens for timing and easing. Words Pop has editable duration and stagger. Imported keyframe tracks open their existing details without replacing source motion.
- Offline conversion now accepts CSS unitless-zero text shadows; combining sizes retains distinct managed font aliases even when source filenames and bytes match.
- Imported four unchanged Chery source images into the shared asset library: background, white logo, red E5 and white E5. See `docs/migrations/thebrief-chery-source-assets-20261030.json` for source checksums and stored IDs. No client project was created. The EV design remains held for `translateZ`/`rotateX` motion; the carousel remains held for custom animation/slide data.

Validation: local browser checks covered client search, no matches, Unassigned, folder search, active filter visibility, long names, light/dark mode, 390px and 1280px layouts, the transition picker and editable word timing. With exact frozen-lockfile dependencies installed, 595 checks passed and 1 was skipped across Banner Studio, imports, QR and deployment guards. The earlier gradient failure came from a stale shared dependency directory and is resolved. Changed Vue components compile successfully. Live deployment `09a8ad85-d13c-4497-bce6-35ecfb94a3af` serves source `6c8b27f7bced4b0706d04cb7fcb5613ab97db002` on `agency-dashboard/main`. Verified live: all 194 projects, client/folder filters and retained filter chips, native transition pop-up, and all 21 QR codes. The PostgreSQL marketing write CI stage passes after repairing its stale folder fixture. Full typecheck with locked dependencies was stopped after five minutes without completion; no full-project type-clean claim is made.


This is the team's change log for the move from TheBrief. Entries distinguish released features from work still in progress. Detailed evidence and migration acceptance are in the [transition ledger](../plans/2026-10-29-banner-studio-transition.md).

## Light and dark workspace — live (30 October 2026)

- Banner Studio opens in light mode, with a sun/moon control in the library, editor and saved viewer.
- The choice persists across agency and full-screen Banner Studio routes, independently of the agency-wide preference.
- Toolbar, size list, inspector fields, layer effects and timeline labels follow the selected theme. Saved artwork colours and export content retain their existing values.

Validated locally with the three-size JAC set: both themes, reload persistence, text and animation inspectors, a smaller desktop viewport, and 51 rendered layers with unchanged inline styles, backgrounds and explicit text colours. Theme switches did not dirty the project. Focused automated checks: 659 passed, one skipped. Released in [PR #749](https://github.com/adme-dev/dashboard/pull/749), source `1f76a877d7d909141cd452efe092a94d90a8185a`, production deployment `7c4b5006-1fb9-4680-a13d-1e35859f71a5`. Verified the live library and JAC editor, both themes, reload persistence and 51 unchanged artwork layers. The saved acceptance preview loads with its theme control. An older project without a stored snapshot still correctly asks for its first save.

## Bulk migration update (30 October 2026)

TheBrief support confirmed that general API access requires a full Enterprise plan change; there is no API-only add-on. They recommend folder/workspace bulk selection with batches of about 50 designs, depending on complexity and browser download limits. No plan change has been made.

A two-design Chery bulk HTML5 export completed on Pro Legacy: one 5.5 MB outer ZIP with four size-specific ZIPs. Local images, fonts and MP3 files were retained. The current converter held the EV set for unsupported text shadows, and the larger carousel for unsupported slide/custom animations. No native projects were created from this test. Download capability and editable migration acceptance remain separate. A second test preserved full project names by turning off the 50-character filename limit. Returning from that naming panel reset custom-font conversion to SVG, so the final recipe rechecks that option and turns it off immediately before download. The verified full-name archive contains 18 font-file entries and two MP3 entries across four layouts. Extracted and verified 8 unique original TTF files (Aero, HarmonyOS Sans and two Tactic Sans faces) into a separate ZIP with family/weight/style metadata and checksums. This archive is ready for reuse; it has not been bulk-registered in the Banner Studio font catalog. MotorStack's current Chery kit lists Helvetica, so it must not silently substitute for these original campaign fonts.

**Export recipe:** select designs in the folder → Download → HTML5 / General usage → Exported file names: keep Design name, Size and Unit; turn off the 50-character limit → return and recheck **Convert custom fonts to SVG is off** → Local download. Start small, validate the archive, then use batches up to the support-recommended 50 designs. Keep original ZIPs and a folder/source manifest. The current browser importer accepts up to 10 prepared native packages; an unconverted bulk HTML5 ZIP is not a native import package.

## Matching TheBrief folders — live (30 October 2026)

- Captured the complete expanded source tree: 101 folders, with 88 roots and 13 nested folders.
- Preserves exact source names, including `Citreon`, and treats `FNQ / Brighton Motor Group` as one folder name.
- Adds stored folder identities and parent links, empty-folder browsing, nested folder search and breadcrumbs.
- Matches existing imported projects only to a single exact recorded source path. Client access and artwork stay under their existing rules.
- New banners created from a folder retain that folder on first save; duplicates retain their folder.

**Live:** [PR #748](https://github.com/adme-dev/dashboard/pull/748), source `9ead46fb4d9286e6226ed06848ee4d3a27e66191`, deployment `6db94af5-ca83-4c07-8662-a1936652a83c`. The live library retained all 194 projects. Verified JAC thumbnails, nested Archived Templates/Updates with 25 projects, empty ADME/Temporary, breadcrumbs and existing QR navigation. Verified all 101 paths and parent links against the captured source, with no missing or extra folders. Automated checks: 655 passed, one skipped. Migration 490 was applied through the verified production Hyperdrive binding after the stale local connection failed. It created 101 folders and placed 144 projects by an exact source-path match. Folder creation, renaming, moving and pinning controls remain separate follow-up work.

## Project overview — release #746

Release status and deployment evidence: [PR #746](https://github.com/adme-dev/dashboard/pull/746).

- The full-screen app and agency dashboard share the same project overview.
- Browse visual project thumbnails in grid or list view, with client and imported-folder filters.
- Find projects by name, client, folder/tag or dimensions; sort by name or last modified.
- Native thumbnails reflect the saved canvas rather than an older imported thumbnail. Open a project in the same editor mode used to browse it.
- Keep existing import, duplicate and delete actions and paginated browsing.

Validated with 605 passing checks (1 skipped), plus local browser checks for thumbnails, search, folder/client filtering, pagination and opening the editor.

The later folder release adds stored parent links and empty folders. Creating, renaming, moving and pinning folders through the UI remain follow-up work.

## 29 October 2026 — autosave and saved viewer (live)

- Text, title and canvas changes save after a short editing pause. No manual Save click is needed for those edits.
- Saved status confirms both project storage and the versioned bucket copy. Failures stay visible, retry automatically and protect unsaved edits when leaving the editor.
- Open **Saved viewer** to see the latest saved layouts. It refreshes automatically.
- New drafts retain their own identity, including after opening another project in the same session.

Verified live: two text edits without Save, viewer refresh, editor reload, banner library and QR Codes navigation. Automated validation: 830 passed, 10 skipped. Video-background save, reopen and playback were checked locally; this does not certify TheBrief video imports or MP4 exports.

Release: [PR #745](https://github.com/adme-dev/dashboard/pull/745), source `67c45b33803c9f8f58a3d4e90a3dc0dea3e30501`, production deployment `79eea1d8-066a-4c94-a758-88ea6fe2e125`.

## 29 October 2026 — layouts and timeline (live)

- Full-screen overview with named sizes, **All layouts**, **Single edit**, **Edit size** and Fit all layouts.
- Linked text and media edits update corresponding layers across sizes. Single edit keeps changes local to a size.
- Full-width timeline with pinned layer labels and ruler.
- JAC pilot imported as a separate, editable three-size draft. Producer approval remains required.

Release: [PR #739](https://github.com/adme-dev/dashboard/pull/739), source `349bd7138a057a8116154b59a0f6805c83a646ba`, deployment `7d895063-9090-47f9-a434-4ddf76c370d3`.

## 29 October 2026 — audio controls (live)

- Pause stops editor audio; Play resumes from the current position.
- Switching previews or closing the editor releases playback. Play All uses one selected layout's soundtrack.
- Sound-bearing MP4 exports are explicitly blocked until audio mixing is ready, avoiding silently delivered files.

Play All follow-up: [PR #737](https://github.com/adme-dev/dashboard/pull/737). See the transition ledger for earlier pilot and audio evidence.

## Cutover gates still open — reconciled 23 November 2026

- Resolve active RAM/Nissan import holds with native editable equivalents that match the source, then verify every size and transition.
- Finish representative source/native comparisons and delivered-file checks, including legal copy, exact font faces, audio, seek, loop and still posters.
- Complete an actual Safari/iPhone check on the current compiled client proof path.
- Complete a designer/producer trial and reconcile active-job counts, exceptions and retained source archives before retiring TheBrief.
- Treat complex legacy/bulk conversion and scheduled MotorStack refresh as separate workstreams; do not infer completion from the current two campaign drafts.

TheBrief has not been retired. Existing features are not listed as missing solely because an October note predates their release.

## 23 November 2026 — Interrupted large-video imports

Large video packages upload sequentially and use request-owned byte views through validation and native R2 storage. An active owner can check stored receipts and expired, reclaimable upload claims before resuming the same import keys. Uncertain, foreign, failed and active claims remain held. Recovery never resets the execution ledger or creates another project blindly.

## 23 November 2026 — Staff import receipts and chosen proof posters

- Staff with existing Banner Studio write access can check interrupted imports after a 15-minute hold. Matching private files are verified by content hash and reused, with bounded reads and no permission changes. Owner ledger recovery remains separate.
- Designers can save a chosen client-poster time from Actions for all layouts or a single layout, use the playhead, restore the automatic frame, and undo the choice. Animated proof output keeps its original timeline.

## 23 November 2026 — Binary multipart upload parsing

The large-video upload path now parses multipart boundaries with byte views. The former h3 parser expanded payload bytes into JavaScript number arrays and copied them again; an isolated 22 MiB control exhausted a 128 MiB heap. The replacement parsed the same body with approximately 12 MiB of JavaScript heap and retained the original binary buffer. File signatures, client scope, duplicate-file checks, digest validation and native R2 persistence checks remain enforced. Malformed, duplicate-header and oversized forms are rejected. Live RAM transfer verification is recorded separately in the migration ledger.

## 23 November 2026 — Full-timeline proof poster frames

The internal poster renderer accepts chosen frames through the supported 300-second
banner timeline. Frames after three seconds previously failed with a 503 because
the renderer retained the old automatic-midpoint limit. Regression coverage sends
5.9 and 299.9 seconds through the complete Pages-to-renderer path and retains
negative, nonnumeric and over-limit input rejection.
