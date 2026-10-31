# Importing TheBrief designs into Banner Studio

## Current route

TheBrief design URLs are references, not a file format accepted by Banner Studio. For an editable import, download **HTML5** from TheBrief with **All sizes**, **General usage**, and **Convert custom fonts to SVG** off. MP4 is useful for visual reference but does not carry editable layers. The XeroFlow import dialog currently accepts prepared `.xeroflow.json` packages, not the original ZIP.

TheBrief API documents a credential-based design list and export flow: authenticate with a client ID and secret, find the design hash, request an export, poll it, then download the ZIP. The signed-in account previously showed no available API scopes, so direct design-URL import has not been verified. Do not put browser session credentials into XeroFlow or imply that an iframe is a native import. See [transition evidence](../plans/2026-10-29-banner-studio-transition.md) and TheBrief's [authentication](https://docs.thebrief.ai/public-api/rest-api/auth), [designs](https://docs.thebrief.ai/public-api/rest-api/designs), and [exports](https://docs.thebrief.ai/public-api/rest-api/exports) references.

## Preparing another design

1. Keep the original download outside Git. Inspect the outer ZIP and each nested size ZIP before extraction. Record the design URL/hash, source folder, size count, playback duration, fonts, asset hashes, and conversion warnings. Do not execute the exported JavaScript.
2. Extract each size into a separate private directory. Run the strict converter and package builder for each size. Any unsupported animation holds the import for review rather than silently flattening it.
3. Merge the verified size packages into one design-set package. The merge preserves each artboard, deduplicates identical assets and fonts, and remaps the font aliases used by the layers.
4. Open **Banner Studio → Import from TheBrief**, select the prepared package, confirm the client and folder, and import as a draft. The source folder suggests a destination only when it matches one unique folder exactly. The selected client determines access; folder placement does not.
5. Open all sizes in the editor. Check first, middle and final frames, font faces, rounded corners, vehicle artwork, legal copy, sound and loop behavior against TheBrief. Keep `import:needs-review` until a producer approves the result.

After safely extracting a child size ZIP, the preparation commands are:

```bash
node scripts/thebrief/inspect.mjs /private/tmp/design/1200x1200.zip
TSX_TSCONFIG_PATH=scripts/thebrief/tsconfig.json node --import tsx scripts/thebrief/package-import.mjs /private/tmp/design/1200x1200 /private/tmp/design/1200x1200.zip "Design name" /private/tmp/design/1200x1200.xeroflow.json "Source folder"
TSX_TSCONFIG_PATH=scripts/thebrief/tsconfig.json node --import tsx scripts/thebrief/merge-packages.mjs source-design-hash "Design name" /private/tmp/design/combined.xeroflow.json /private/tmp/design/1200x1200.xeroflow.json /private/tmp/design/1080x1920.xeroflow.json
```

Use every verified child package in the final merge. The source design hash must come from the design URL, and the source folder must match the actual TheBrief location.

The Recents thumbnail and HTML export can identify an individual size rather than its parent design. Record the parent hash from the editor URL and use it for the final package, including single-size designs. Compare existing `source-design` tags before downloading again; retry deduplication uses the selected client and `source-sha256`, so a fresh export with different bytes is not automatically the same import. Leave an unverified destination folder unfiled.

For an outer design-set archive above 20 MB, use `node scripts/thebrief/inspect.mjs /private/tmp/design/set.zip --design-set`. This profile accepts only a container of child ZIPs, capped at 64 MB compressed, 128 MB total expansion, 1,500 entries and one nesting level. Each child is independently checked with the standard 20 MB archive, 10 MB file, 40 MB expansion and 500-entry limits. Literal offer percentages in child ZIP filenames are permitted; encoded paths, traversal, symlinks and unsafe asset paths remain rejected. Keep the original archive and its checksum.

## Conversion and review boundaries

The converter retains supported hard-cut slide timing as editable layers. It does not create a Slides editor. Bounded intermediate pulse and bounce effects preserve cycle boundaries, fractional endings and instantaneous resets; these packages require the matching native and HTML playback release that handles equal-time keyframes. Do not validate their playback against an older deployment.

Centered horizontal image reflections are baked into managed image bytes, leaving original assets in the archive. Static image opacity and bounded CSS filter chains retain source brightness, contrast, hue rotation and drop-shadow geometry in both the editor and exports; filters are not rasterized. Transparent shapes remain transparent. Full static Google font faces, including normal and italic variants, can be snapshotted through the allowlisted preparation resolver with checksums. Font subsets, animated blur, unsupported 3D motion, video layers and custom animation data remain review holds. A successful package conversion still requires visual, audio and final-output checks for every size.

## Organizing and sharing

### Correcting an existing imported draft

Use **Update imported draft** when a corrected package comes from the same source checksum and client. Review the sizes that will be replaced before confirming. The operation creates a mandatory version backup, retains the existing project identity, client and folder, and rejects published, reviewed or concurrently changed drafts. A package from a different source export is not an in-place repair. Reopen every replaced size and repeat its visual/playback review after the update.

Use the project menu’s **Move to folder** action to change an existing design’s location, including **Unfiled**. The source-folder tag remains as provenance. **Share** opens the signed-in team viewer and can create a view-only client link. Client links can be opened by anyone who has the URL, expire after 7, 30 or 90 days, and can be revoked. Creating a client link does not send it to anyone automatically.

Review/comment links and view-only client links use separate token formats. The public client endpoint returns current artwork and only the fonts needed to render it; it does not return comments or reviewer identities.

## Reusing an imported design

Once the imported draft has passed artwork review, use **Actions → Save as template** in the editor to capture all its layouts as one reusable set. The [template gallery](banner-template-gallery.md) can copy all layouts or a selected subset into a new draft, with a client and folder chosen before creation. Starting-format presets in the gallery are blank canvases; they do not import stock artwork from TheBrief.

## Timeline review

Selecting artwork highlights the matching timeline label and row and brings the row into view. Animation blocks show entry, continuing motion, hold and exit intervals. Click a block to inspect its relevant keyframes; expand the row for individual property tracks. Imported effects are labelled as keyframes unless a native preset identity is known. These labels describe the preserved timing, not proof of source playback fidelity.

TheBrief's `shouldPlay` field is playback retry state, not an authored mute setting. Audio review must compare the source editor's mute, volume, trim and fade settings with the actual exported media. Exported audio may already be trimmed; applying the original-track offset again can discard the clip. Unsupported or unreconciled audio settings hold the conversion for review.
