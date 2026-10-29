# Banner Studio change log

## Timeline picker and compact library navigation (30 October 2026)

- Search Clients, Folders and Tags in separate sidebar tabs. All clients and Unassigned stay pinned, names wrap, and each list scrolls within the screen. Active filters remain visible above projects when changing tabs.
- Click native entrance or exit clips for a floating preset picker. Layer icons identify media types; the inspector opens for timing and easing. Words Pop has editable duration and stagger. Imported keyframe tracks open their existing details without replacing source motion.
- Offline conversion now accepts CSS unitless-zero text shadows; combining sizes retains distinct managed font aliases even when source filenames and bytes match.
- Imported four unchanged Chery source images into the shared asset library: background, white logo, red E5 and white E5. See `docs/migrations/thebrief-chery-source-assets-20261030.json` for source checksums and stored IDs. No client project was created. The EV design remains held for `translateZ`/`rotateX` motion; the carousel remains held for custom animation/slide data.

Validation: local browser checks covered client search, no matches, Unassigned, folder search, active filter visibility, long names, light/dark mode, 390px and 1280px layouts, the transition picker and editable word timing. Automated suite: 441 passed, 1 skipped; the unchanged rectangle-gradient test separately fails because installed happy-dom 20.0.11 discards that valid CSS gradient even without application code. Existing full-project typecheck errors remain outside these modified files. Release evidence is recorded in the transition ledger after deployment.


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

## Still needed before retiring TheBrief

- Stock-video background gallery with search, preview and reusable assets.
- Real folder management and remaining project-menu workflows.
- Ordered slides, transitions and familiar animation blocks/builder.
- Linked insertion, duplication and deletion across all sizes.
- MP4 audio mixing and verified exported video/audio files.
- MotorStack brand assets in Banner Studio and the Creative Suite launcher entry.
- Reliable bulk conversion, including more complex Toyota/Gendore/Chery slides and animations. API access requires Enterprise; browser bulk HTML5 export works on Pro Legacy.
- Producer review of representative active jobs and a successful team trial.

TheBrief has not been retired. Video playback support, stock media access and final export verification are separate acceptance checks.
