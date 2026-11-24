# Banner Studio change log

## 25 November 2026 — Preserve TheBrief layer groups on import

The HTML5 converter now carries exported artwork group membership into prepared packages. FI Pro’s four logo letters share **Group 13** in the square, both landscape and social layouts. The editor keeps each member’s original placement and animation independently editable.

The live Banner Studio import dialog prepared the original FI Pro ZIP as one design with four sizes. The production importer returned exactly Artwork 5, 6, 7 and 8 in Group 13 at 1000×1000, 800×300, 600×300 and 1200×644. Verification stopped at the import preview to preserve the existing draft.

[PR #1006](https://github.com/adme-dev/dashboard/pull/1006) shipped as main commit `eb59c949d8a787df83a742e73fc4154a0f55ec18` on `agency-dashboard/main`, deployment `4d63b3d9-a771-4040-9e7f-aacad8e8c0db`. The private importer used Worker version `cfc626fe-6769-43e1-9f86-13640ab15a90` and container version 13.

## 25 November 2026 — Folder recovery and canvas groups

Deleting a folder keeps its designs available in their original client libraries. The folder tree can be restored for 30 days. Deleting a design individually sends that design to the recycling bin with its own recovery period.

Dragging any member of a canvas group moves its members together. Layer and group names support inline editing in the timeline and Properties panel. The [folder and group guide](../banner-studio/folders-and-groups.md) covers filing, recovery, selection and renaming.

Folder creation, pins, moving, renaming, breadcrumb navigation and recovery of an old folder URL after a move were verified on the production release of [PR #1002](https://github.com/adme-dev/dashboard/pull/1002), deployment `36f75216-9cfc-4568-87b1-27c84957b70c`.

Production deployment `f012d826-8a4b-4712-81a8-123f32846a5a` served main `a8e7a3920dda5fb3b7a8d0fa03ff13ce690bad18`. On a copy of FI Pro, dragging one grouped letter moved all four 40 pixels left and 24 pixels up. The group name edited in the timeline and the layer name edited in the inspector both survived reload. Deleting the test folder kept its design in the ADME client library. Restoring the folder recovered its filing, and deleting and restoring the design separately recovered the same project. A follow-up check found both test items in the live bin with separate Restore actions. [Release record](https://github.com/adme-dev/dashboard/pull/1003)

In the earlier folder-and-canvas release, the HTML converter produced 11, 9, 11 and 11 editable layers respectively from the archived FI Pro layouts at 1000 × 1000, 800 × 300, 600 × 300 and 1200 × 644. Each converted layout had zero group memberships. This check exercised offline layer conversion. The end-to-end ZIP preparation for this archive also requires external fonts. Across the TheBrief import and editor grouping suites, 405 automated tests passed.

## 24 November 2026 — Still posters for the project gallery

Each project card displays a JPEG of its saved artwork. The poster follows the
designer’s chosen frame or the automatic frame for the preferred layout.
The gallery requests up to four images at a time near the viewport, retains
loaded images when scrolling back, and loads the editor on interaction.
Existing proof JPEGs can be reused. New gallery JPEGs are at most 480 pixels
on their longest side and are stored by artwork and font revision after the
first successful render. A first visit to new artwork can take longer.
Access checks run before serving stored images. Templates keep their existing previews.

Production verification for [PR #1000](https://github.com/adme-dev/dashboard/pull/1000)
used main `2615244c0c02228ec043f6eb045e88e1bd10e8fd` on `agency-dashboard/main`.
Cloudflare deployment `05a8edc1-7b86-4ae2-8691-ab336aa31b54` replaced
`b2523d8f-a89f-4874-9fde-27ccc7140df2`. [CI](https://github.com/adme-dev/dashboard/actions/runs/45383729333)
passed 24,808 tests with 4,445 skipped. A further 1,219 tests passed on the
combined release tree with one skip.

In signed-in desktop Chrome, all 15 near-viewport posters loaded on each of two
gallery pages. Both pages had 36 project cards and zero embedded HTML frames,
canvases or video players. Search, grid/list switching, opening a two-layout
editor and the QR Codes library passed. A signed-out poster request returned 401.

| Time from reload in one browser profile | Before, median of three | After, median of three |
| --- | ---: | ---: |
| First project card visible | 3.41 s | 3.61 s |
| First HTML frame attached | 5.77 s | — |
| First poster image loaded | — | 5.05 s |
| Four poster images loaded | — | 7.22 s |

The first navigation immediately after deployment took 12.97 s to show cards
and 14.81 s to load an image. Four initial proof images had been requested
during pre-release checks. Repeat runs used stored posters. These measurements
include browser automation overhead. Frame attachment does not measure artwork
paint, and none of these timings measure field LCP. Three direct signed-in
requests returned 461 project summaries in 1.38–1.76 s and 101 folders in
0.69–2.97 s, including browser navigation and reading the JSON response.

## 24 November 2026 — Faster project library loading — live

The agency and full-screen libraries load project summaries first. Search, client
counts, folder and tag filters, dimensions, sorting and pagination still cover
all accessible projects. As a tile approaches the viewport it requests one
populated layout for its preview, preferring square artwork. Scrolling away
releases the preview frame. Returning to the tile on the same page can reuse
that layout. Opening the editor or duplicating a project uses the full artwork.
Import, sharing and download tools load when opened.

The library opts into `GET /api/agency/banner-studio/projects?view=library`.
The project detail endpoint accepts `previewFormat` for a single layout. Both
reads retain their existing access checks and private, no-store responses.
Existing callers that omit these options receive full project data. This change
requires no schema migration.

The median time from a signed-in Chrome reload to the first project link fell
from 9.27 s to 3.37 s (64% faster). Three reloads in the same browser profile
took 7.83, 9.27 and 9.57 s before release and 4.05, 3.37 and 3.27 s after.
These timings cover one browser session and include browser automation overhead.

Production checks covered the 461-project library, its 36-card first page,
on-demand artwork frames, pagination, client filtering, search, grid and list
views, and opening a two-layout project in the editor. The import, sharing and
MP4 dialogs opened successfully. The QR Codes library retained its baseline
counts. Live checks used existing records and made no project edits.

[PR #997](https://github.com/adme-dev/dashboard/pull/997) shipped from current
main `eca0b9de8210a318488d49e415acc3cd9f5b3d7e` to `agency-dashboard/main` as
Cloudflare Pages deployment `b2523d8f-a89f-4874-9fde-27ccc7140df2`.
[CI](https://github.com/adme-dev/dashboard/actions/runs/45378213335) passed
24,756 tests with 4,445 skipped. The production build and worker size checks passed.
The previous production deployment was `ff2f3241-69b7-4d7a-8301-bf3008f178bb`.

## 24 November 2026 — Audio controls, trim and fades — live

Selecting an audio layer opens an audio-only inspector. Volume changes reach
playing tracks immediately, including zero and mute; Undo remains supported.
Choose a source interval with the waveform selection or precise start/end
fields, preview it, and apply or cancel. Looping repeats the selected interval.
Fade-in and fade-out have adjustable durations. Replacement keeps the timeline
placement and clears the old source trim. Trim applies to the current layout;
volume, mute, loop and fades follow linked-layout editing scope and locks.

Brand kit now sits immediately beside the + Insert tab in Tools & resources.
Saved HTML previews share the editor audio clock; the versioned MP4 soundtrack
contract includes source trim and fades while retaining legacy audio exports.

Released in [PR #992](https://github.com/adme-dev/dashboard/pull/992), source
`283e3bfb7feb649fb96401ea096b6c4151c6454f` (current main at release), production
deployment `17b1d0b9-a4b9-4890-a0d9-a070f946937f` on `agency-dashboard/main`.
The audio Worker and qualified Container image deployed first; private Chromium
acceptance passed after the Container rollout. CI passed 24,506 tests; the
current-main integration passed 964 focused tests and the final audio/export
check passed 42 tests. Live checks confirmed the audio-only inspector, movable
trim selection, preview and cancellation without changing saved audio, Brand kit
beside Insert, and the existing QR Codes library. See the
[qualification and release ledger](../runbooks/banner-audio-controls-release-20261124.md).

## 24 November 2026 — Audio timeline waveform — live

Audio tracks show normalized waveform bars beneath transparent Sound controls.
The preview redraws when the timeline or clip resizes, repeats for looped audio,
and leaves the remainder empty when a non-looping source finishes. Linked
layouts share decoded peak data; failed previews leave audio controls usable.

Released in [PR #990](https://github.com/adme-dev/dashboard/pull/990), source
`64c31893be05e7cf4cc88e5b8384a36400844618` (current main at release), production
deployment `7ec5de36-3dc3-46c3-ace5-d0c203a351a7` on `agency-dashboard/main`.
Cloudflare production metadata confirms the source. The guarded production build
and worker budgets passed (15,356,834 bytes raw; 5,329,412 bytes gzip).

Validation on Node 24.18.0: 894 tests passed and one optional test skipped across
BannerStudio, QR Codes and deployment guards; new waveform files pass lint.
Live browser checks on `app.xeroflow.io` confirmed waveform bars for Audio 40 in
an existing RAM project and redraw on timeline zoom (canvas width 1920 → 2240).
The editor remained saved, and QR Codes retained 23 codes and 165 scans.

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

Chosen proof frames now resynchronize embedded video as well as native layers.
The capture seeks away from the initially pre-rendered timeline position before
seeking the saved frame, ensuring GSAP media callbacks execute. The poster cache
revision changes so earlier first-video-frame captures are regenerated.


## 23 November 2026 — Automatic posters and consistent video previews

Client proofs choose a still automatically from visible copy, imagery and settled
timeline holds. Designers can choose another time or restore Automatic frame;
existing overrides remain saved. The cache includes the selector revision.
Timeline selection does not optically assess blur inside video footage.

Team saved viewers now use the same rendered MP4 player and jobs as client links.
They are labelled **Team preview · Sign-in required**, with **Share with client**
for creating/copying the external link. Team media routes check existing project
and client access before returning status, posters or bytes; no public capability
is created just by viewing internally. Earlier render-worker, queue/retry, audio
and HTML5 playback implementations remain intact.

## 23 November 2026 — continuous editor video playback

Banner Studio and linked Video Studio artwork now let embedded video decode
continuously during playback. Pause/scrub, trim points, looping and editable motion
remain synchronized with the existing timeline. Audio and the qualified render
container remain unchanged. See the Suzuki playback verification ledger.

## 23 November 2026 — full-length Video Studio client proofs

A producer can attach a completed Video Studio MP4 to a matching 30–90-second
Banner Studio artboard from Share with client. This preserves the qualified
rendered output, full duration, native playback and poster without editing the
source artwork or changing the30-second capture limit. Attachments are tied to
the saved artwork/font revision, and unchecked long proofs cannot create a new
client link from the sharing dialog.
