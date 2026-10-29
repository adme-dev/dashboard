# Banner Studio change log

This is the team's change log for the move from TheBrief. Entries distinguish released features from work still in progress. Detailed evidence and migration acceptance are in the [transition ledger](../plans/2026-10-29-banner-studio-transition.md).

## Unreleased — project overview

- The full-screen app and agency dashboard share the same project overview.
- Browse visual project thumbnails in grid or list view, with client and imported-folder filters.
- Find projects by name, client, folder/tag or dimensions; sort by name or last modified.
- Native thumbnails reflect the saved canvas rather than an older imported thumbnail. Open a project in the same editor mode used to browse it.
- Keep existing import, duplicate and delete actions and paginated browsing.

Folder filters use recorded import labels. Creating, renaming, moving and nesting folders is still outstanding.

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
- Supported bulk migration/API entitlement and conversion of more complex Toyota/Gendore animations.
- Producer review of representative active jobs and a successful team trial.

TheBrief has not been retired. Video playback support, stock media access and final export verification are separate acceptance checks.
