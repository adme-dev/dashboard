# Importing TheBrief designs into Banner Studio

## Current route

In **Banner Studio → Import creative packages**, expand **Import work instruction** above the upload box for the current designer steps. It covers the TheBrief export settings, group assignment, source dates, stalled uploads and review of every saved size.

**24 November release status:** direct group ZIP import is deployed. The original Alfa archive was uploaded in production and all three designs are saved with two sizes each. Fresh preparation and duplicate reconciliation were also exercised. See the [Alfa ZIP verification record](../migrations/alfa-direct-zip-import-20261124.md) for the saved projects, source comparisons, release IDs and test limitations. The designer work instruction is version 2, dated 24 November; it replaces the earlier manual package-preparation handoff.

Download **HTML5** from TheBrief with **All sizes**, **General usage**, and **Convert custom fonts to SVG** off. In **Banner Studio → Import creative packages**, choose the original ZIP, including a group download such as `Designs-HTML.zip`. The private conversion service inspects the complete archive before extraction and never executes its scripts. Each design becomes one editable draft containing all its sizes. Prepared `.xeroflow.json` packages remain supported.

Choose a client and folder under **Assign the group**, apply them to the unimported designs, then review each row and select **Import assigned drafts**. A ZIP does not contain a verified original creation date or its TheBrief folder. Choose the destination explicitly and use **Import undated drafts and backfill the date later** when needed; the download date is never substituted. A compatible design is retained only when every size converts. Unsupported designs appear as named review holds while the other designs remain available.

Source ZIPs are capped at 64 MiB, 50 designs and 20 sizes per design. TheBrief exports with distinct layouts that share dimensions stay together and are labelled as variants. The importer checks distinct source layout IDs and accepts up to 200 assets per prepared design, within the existing byte limits. The original playback duration and repeat count are kept per layout when layouts in one design use different timing. Prepared selections remain capped at 128 MiB. Child archives retain independent path, symlink, CRC, entry, image, media and expansion limits. Conversion is bounded to three minutes and uses a private, stateless container with no database or storage credentials. Request and result bodies stream through Pages. Assets and fonts are saved only after client assignment, through the existing authenticated upload and draft-creation paths. Re-selecting the same file in the dialog reuses its verified preparation without losing assignments or saved rows. Exact child-export receipts reconcile earlier manually merged drafts; design names alone never establish duplicate identity.

TheBrief design URLs remain references rather than upload files. MP4 is useful for visual reference but does not carry editable layers.

TheBrief API documents a credential-based design list and export flow: authenticate with a client ID and secret, find the design hash, request an export, poll it, then download the ZIP. The signed-in account previously showed no available API scopes, so direct design-URL import has not been verified. Do not put browser session credentials into XeroFlow or imply that an iframe is a native import. See [transition evidence](../plans/2026-10-29-banner-studio-transition.md) and TheBrief's [authentication](https://docs.thebrief.ai/public-api/rest-api/auth), [designs](https://docs.thebrief.ai/public-api/rest-api/designs), and [exports](https://docs.thebrief.ai/public-api/rest-api/exports) references.

## Preparing another design

The following offline tools remain available for diagnosing a conversion hold. They are no longer required for supported direct ZIP imports.

1. Keep the original download outside Git. Inspect the outer ZIP and each nested size ZIP before extraction. Record the design URL/hash, source folder, size count, playback duration, fonts, asset hashes, and conversion warnings. Do not execute the exported JavaScript.
2. Extract each size into a separate private directory. Run the strict converter and package builder for each size. Any unsupported animation holds the import for review rather than silently flattening it.
3. Merge the verified size packages into one design-set package. The merge preserves each artboard, deduplicates identical assets and fonts, and remaps the font aliases used by the layers.
4. Open **Banner Studio → Import creative packages**, select the prepared package, confirm the client and folder, and import as a draft. The source folder suggests a destination only when it matches one unique folder exactly. The selected client determines access; folder placement does not.
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

Reviewed scene fade-ins preserve the source overlap as composited scene groups, with independent editable child layers. A scene group fades once; individual layer opacity is not used as a substitute for group compositing. Word fades and animated raised footnotes retain their shared word timing and inline typography. Supported text runs preserve colour changes within a line in the editor and exports. Edits retain managed weight and italic faces within the same font family. Mixed families or missing source faces still require review. A uniquely identifiable wrapped row expands its line box and shifts the rows below it. If more than one wrap fits, the offline package command accepts an optional JSON file after the creation date. It records the ZIP SHA-256, the source layout ID and the line counts observed in the original preview, for example `{"sha256":"<64 hex characters>","designHash":"<layout ID>","rowLines":{"element-35":[2,2,1,1]}}`. The measured counts must reconcile with the source box height. Unverified wrapping and unknown transition recipes remain holds. Bounded soundtrack fades are baked into managed MP3 bytes after verifying the exported clip duration against the authored stages; original bytes remain in the source ZIP, and the conversion note records the transformation. When the authored loop ends before the clip, the full verified soundtrack and its fade positions are retained; playback stops at the loop boundary without squeezing a later fade into the shorter loop. Native, exported and saved-proof HTML use the same scene and word recipes.

The conversion worker lives in `workers/thebrief-import/`; deploy and test it before releasing the Pages caller's `THEBRIEF_IMPORT` binding. It is internal-only (`workers_dev = false`, no routes) and has a bounded pool of two idle-sleeping containers. Keep its Docker context allowlist in place so source downloads, credentials and unrelated project files never enter the image.

Follow the [worker release procedure](../../workers/thebrief-import/README.md). The qualified target uses `standard-1` (4 GiB); the full Alfa archive exceeded a 1 GiB stress-test container. A locally successful preparation is separate from a saved production import and its compiled proof.

Muted video imports retain the original MP4. Cover crops use the source focal point, and zoomed footage in a supported rectangular viewport keeps its source crop in the **Crop video** control for that layout. A centred mirror becomes the editable horizontal or vertical flip. Check every size in the live preview. Unsupported rotation, zoom combined with masks, and crops that expose space outside the clip remain on hold.

The converter retains supported hard-cut slide timing as editable layers. It does not create a Slides editor. Bounded intermediate pulse and bounce effects preserve cycle boundaries, fractional endings and instantaneous resets; these packages require the matching native and HTML playback release that handles equal-time keyframes. Do not validate their playback against an older deployment.

Centered horizontal image reflections are baked into managed image bytes, leaving original assets in the archive. Static image opacity and bounded CSS filter chains retain source brightness, contrast, hue rotation and drop-shadow geometry in both the editor and exports; filters are not rasterized. Transparent shapes remain transparent. Full static Google font faces, including normal and italic variants, can be snapshotted through the allowlisted preparation resolver with checksums. Bounded muted local H.264 video layers are supported; unsupported video settings, font subsets, animated blur, unrecognized 3D transforms and custom animation data remain review holds. A successful package conversion still requires visual, audio and final-output checks for every size.

Centered TheBrief image flips with a fixed perspective retain an editable **X-axis rotation** track in Banner Studio. The original image and its in-plane rotation stay editable. The GSAP editor and HTML output apply the same projection and easing. Compare the first visible, mid-flip and settled frames. Unsupported axes, off-center projection or overlapping 3D transforms remain on hold.

The export may use a temporary `Family file-...` alias followed by its declared family. Preparation normalizes that alias only when exactly one packaged face matches family, weight and style, so the existing package builder binds the actual uploaded font. Ambiguous lists hold conversion. Uniform solid bordered shapes use native editable button geometry with empty text; validated visual filters remain attached to the border-box geometry in the editor and both HTML exporters; asymmetric borders remain held. For audio, consistent authored clip duration can correct a stale generic element duration; confirm timing against the source playback and retain the conversion warning for review.

## Organizing and sharing

### Correcting an existing imported draft

Use **Update imported draft** when a corrected package comes from the same source checksum and client. Review the sizes that will be replaced before confirming. The operation creates a mandatory version backup, retains the existing project identity, client and folder, and rejects published, reviewed or concurrently changed drafts. A package from a different source export is not an in-place repair. Reopen every replaced size and repeat its visual/playback review after the update.

Use the project menu’s **Move to folder** action to change an existing design’s location, including **Unfiled**. The source-folder tag remains as provenance. **Share** opens the signed-in team viewer and can create a view-only client link. Client links can be opened by anyone who has the URL, expire after 7, 30 or 90 days, and can be revoked. Creating a client link does not send it to anyone automatically.

Review/comment links and view-only client links use separate token formats. The public client endpoint returns current artwork and only the fonts needed to render it; it does not return comments or reviewer identities.

Client proofs use a compiled native video with embedded audio. Prepare every required size before delivery, then verify playback, seeking and sound without an agency login. The player uses a saved-artwork still for the selected size before Play and while the video prepares. It chooses a settled frame from the saved timeline by default, respects any designer override, caches by canvas/font/size/selector revision, and still checks live link authorization before serving cached bytes. A failed poster must leave video controls and retry status usable. Client links expire or can be revoked; creating one does not email it to a client. Browser/mobile layout evidence is separate from an actual Safari/iPhone playback check.

## Reusing an imported design

Once the imported draft has passed artwork review, use **Actions → Save as template** in the editor to capture all its layouts as one reusable set. The [template gallery](banner-template-gallery.md) can copy all layouts or a selected subset into a new draft, with a client and folder chosen before creation. Starting-format presets in the gallery are blank canvases; they do not import stock artwork from TheBrief.

## Timeline review

Selecting artwork highlights the matching timeline label and row and brings the row into view. Animation blocks show entry, continuing motion, hold and exit intervals. Click a block to inspect its relevant keyframes; expand the row for individual property tracks. Imported effects are labelled as keyframes unless a native preset identity is known. These labels describe the preserved timing, not proof of source playback fidelity.

### Groups, scenes and nested animation

The timeline has three distinct concepts. A **design set** keeps all sizes in one draft. A **scene** owns a playback interval and its child layers; supported overlapping scene fades are composited once on the scene wrapper. An editable **timeline group** lets a designer collapse related rows and move their presence and keyframes together, clamped to each member’s scene boundaries. Grouping does not flatten artwork or change stacking order. Xeroflow currently stores one timeline-group membership per layer; it does not represent an arbitrary nested group tree.

HTML5 ZIPs are playback exports, not native TheBrief project files. Do not promise to restore editor-only group names or nesting when that metadata is absent. Alan Mance folder 1498836 was audited across all **224 layouts and 340 scenes** on 24 November 2026: 22 layouts have multiple scenes; none contains nested element ownership, nested timing groups, editor-group metadata, or nonzero scene-fade durations. This establishes the structure of these exports only, not the original editor’s grouping hierarchy. Element entrance/middle/exit wrappers are animation composition, not designer groups. The converter preserves supported sequential effects and holds overlapping or unsettled nested transforms that it cannot reproduce.

For every size, scrub forward and backward through entrances, scene boundaries, exits and the loop restart. Check child ordering, shared fades, masks, media trims and audio against the source. Do not extend the loop merely to reveal layers scheduled after its end. The pending Static Update adapter retains such source content as hidden editable layers and records its original schedule; deliberately unhiding it changes the authored playback. Pending inline-gradient support keeps the gradient on the original text run, not the whole row.

Verification: 59 focused tests passed for timeline grouping/movement/undo/locks, timing edits and phase labels, composited scene fades, intermediate effects, editor playback, inactive layers and inline gradients. The durable audit is `output/alan-mance-import-20261124/group-timeline-audit.json` in the evidence workspace. These checks do not imply the final three designs are saved: current production is 40/43 source designs, 218/224 layouts. The private ZIP worker still needs the new adapters released; preparation-only successes are not production-import receipts.

TheBrief's `shouldPlay` field is playback retry state, not an authored mute setting. Audio review must compare the source editor's mute, volume, trim and fade settings with the actual exported media. Exported audio may already be trimmed; applying the original-track offset again can discard the clip. Unsupported or unreconciled audio settings hold the conversion for review.

## Imported font identity

The importer matches uploaded fonts by checksum, family, exact weight and authorized client/shared scope. A family name alone is not proof that two files are the same face. New imported text layers retain the managed font asset ID; selecting a client does not change the artwork or automatically create or apply a brand kit. Legacy fonts without a stored checksum remain shared legacy assets and are not reassigned during import. Keep any needed font files available in the client’s brand kit, with explicit heading/body defaults.

## Brand-kit typography and website drafts

Brand-kit typography stores exact uploaded face references and a default weight for each role. The client picker filters owned and shared faces; moving a kit to another client requires replacing incompatible references or returning to the original client. Applying a kit updates face and weight together as one undo step. Used fonts cannot be deleted while current designs, kits or retained versions reference them. Legacy family-only artwork remains supported through scoped face resolution.

**From a website** reads a public homepage and a bounded set of linked/imported stylesheets, then presents colours, detected families and validated logo candidates as a draft. It does not save a kit automatically or download custom font binaries. Warnings distinguish incomplete extraction and unavailable font files; upload the licensed faces or choose an available font before applying those roles. Every document, stylesheet and logo request uses the public URL policy and bounded redirects/body limits.

## RAM and Nissan native motion support — 23 November 2026

Reviewed word entrances support pop, blur from left/below, zoom out and typewriter characters. Native text retains source fonts and irregular letter delays. Adding copy extends the final delay spacing; editing stagger deliberately replaces source irregular delays with uniform timing. Duration, easing, timeline movement, removal and animation clipboard remain editable. Soft-wipe and TV reveals retain native shape geometry. TV mask height, brightness/saturation and glow use one reviewed recipe; unknown source recipes still hold conversion. The video inspector exposes the supported top fade.

Verified MP4 entries may be up to 24 MiB each, with the existing 64 MiB archive/video aggregate bounds. Prepared video packages allow 80 MiB of base64 assets, an 85 MiB JSON file and a 128 MiB selection before decoding. Non-video package and font bounds are unchanged. A rounded source clip end may reconcile to probed file duration only when the entire visible interval fits before the actual boundary; it never extends media or transcodes the source.

Compare early reveals as well as settled/end frames in every size. The offline comparison waits for media seeking and CSS paint; retain screenshots and inspect the visible result, since compositing can lag an acknowledgement. Client proof generation uses the same native HTML animation builder as the saved viewer. Keep producer and actual Safari/iPhone acceptance distinct from automated checks.

### Interrupted upload recovery

Large-video packages upload one asset at a time to bound edge memory. An uncertain upload response still pauses that package. An active owner can select **Check interrupted upload receipts**: the server checks existing same-actor upload ledger keys, stored asset/client identity and expired reclaimable leases. It does not reset failed rows, remove assets or issue a new upload identity. Missing, foreign, active or unreconciled evidence keeps the package held. After a safe check, **Import assigned drafts** reuses the original per-asset keys and the project deduplication check. Fonts and acknowledged uploads are reused. The recovery control is read-only until that explicit resume.

Staff accounts with existing Banner Studio write/client access can reconcile a paused package after 15 minutes. The check reads only that staff member's matching client assets, streams private R2 bytes through SHA-256, bounds the scan to 150 files / 64 MiB, and reuses verified receipts. Missing, corrupt or unsafe receipts keep recovery held. No role change is required. Pending package files upload sequentially after the check; project/source deduplication still runs. Read-only recovery is rate limited.

### Choosing a clear client poster

In the editor, choose **Actions → Client proof poster**, enter a settled frame time or use the playhead, then **Save poster**. All layouts / Single edit determines the scope. The choice saves with the artwork and supports undo. **Automatic frame** restores the default midpoint. The image route clamps a saved choice to the animation duration and includes it in the cached image revision. Selecting a clear frame is particularly useful when a midpoint falls on an animated-video zoom or blur.

The Banner Studio asset route uses bounded multipart headers and byte views for binary bodies; it does not use the h3 per-byte-array multipart parser. A 22 MiB / 128 MiB heap regression control records the original parser failure and the replacement's intact payload. Archive/package bounds still apply before upload. An upload failure should display the server's short status message when available, with the durable attempt held for reconciliation.

The internal `banner-share-images` renderer must be released alongside chosen-frame
support: it accepts finite frame times from 0 through 300 seconds. The saved frame
is clamped to the project duration before capture; the old 3-second renderer cap
caused late-frame poster requests to fail. Verify an actual late-frame JPEG after
releasing the worker.

When checking a chosen still, compare the video background as well as native text.
A valid JPEG can still show an unseeked video frame. The capture must move away
from the initially pre-rendered position before seeking the requested time.


## Automatic proof posters and live footage — 23 November 2026

Client links generate a still automatically; a separate manual poster-preparation
step is not required. Selection evaluates a bounded set of timeline frames,
favouring visible native copy and substantial imagery, stable holds and distance
from entrances, exits and scene boundaries. It is a deterministic timeline
heuristic, not an optical-quality or semantic guarantee for text embedded in video.
Every saved layout is evaluated independently. A finite `posterTime` is a designer
override and is never replaced by automatic selection. **Automatic frame** clears
that override; later artwork edits cause the choice and cached JPEG to refresh.

Saved team viewers use the same rendered MP4 player, poster selector, content-addressed
jobs and private delivery pipeline as client links. They require the existing
signed-in project/client access; opening one does not create a public token.
**Team preview · Sign-in required** identifies the internal page. Choose **Share
with client** to create or copy the expiring external client link. Public client
links remain view-only and do not require sign-in. Both routes show preparation
status and retry rather than falling back to HTML5 animation.

The earlier container-readiness, queue/retry, FFmpeg/Chromium and native-video
player work is retained. This change does not rewrite HTML5 animation/audio clocks
or the renderer worker. A local HTML playback experiment was discarded before
release after confirming the requested surface should use the compiled video.

### Editor footage checks

Video layers decode continuously during interactive playback. Check moving footage,
scene cuts and authored zooms alongside narration; then pause, scrub forward/back,
resume, and change layout. The existing audio clock owns sound. Rendered client
proofs continue to use the existing MP4 renderer. If an editor jitters while the
rendered MP4 is smooth, inspect interactive video transport before changing the
qualified encoder. See `docs/migrations/suzuki-editor-video-playback-20261123.md`.

### Client proofs longer than 30 seconds

Automatic banner capture remains limited to 30 seconds. For a 30–90-second saved
artboard, open Share with client and use a completed full-frame render from its
linked Video Studio project. Review video opens the original rendered MP4;
Use rendered video attaches that completed file to the saved artwork revision.
The client link uses the existing native MP4 player and automatic/designer poster.
There is no re-encoding, silent truncation or HTML5 fallback. The original layers
and fonts remain editable. Saving new artwork or changing managed font content
invalidates the attachment; review/select a render for the new saved revision.

Candidates must share the client, reference exactly this artboard as their only
full-frame visual, match its size/duration, and have the same timeline input as
the current Video Studio edit. Selecting a completed render is a producer review
step: timeline equality does not independently prove that a linked banner was
unchanged since that render. Check headline, fonts, footage, cuts and end card.
Only the matching native output variant can be attached; contained square or
landscape variants cannot stand in for a portrait artboard.

### Circular image masks

The importer preserves a full circular SVG mask on a square original image as an editable corner radius. The editor, saved viewer and HTML export retain the original image asset and animation. Partial circles, translucent or composite masks, padded mask geometry and spatial filters inside the mask remain on hold rather than being approximated. Compare every layout and scene before saving a review draft.

Single-run source animations that cross a slide boundary retain the original visible curve up to that boundary. The adapter clips cubic easing algebraically; it does not shorten the full tween to fit. Reverse playback is preserved. Repeated unsupported compositions still remain held.

TheBrief can suffix duplicate dimensions with either `-1` or ` (1)` in a group ZIP. Both forms retain separate editable variants inside the same design draft; duplicate source layout identities still hold the entire set.

### Positioned original logo images

Fixed-pixel background images retain source size, position and repeat behavior as editable image layers, including circular logo masks. A glow or blur outside the source mask stays outside its native clipping wrapper; ambiguous filter order remains held. Opaque RGB text outlines retain their exact color as native hex outlines.

For historical stacked text, an operator may supply line counts measured in the original preview. The recipe must match the exact child ZIP SHA-256 and source layout ID, and the measured line heights must match the source box. Never guess ambiguous wrapping or ask designers to use an online JSON converter. These reviewed packages can be imported together using the normal client/folder assignment.

Bounded image depth entrances retain separate native GSAP depth and rotation tracks under the source perspective. The importer accepts centered, backward depth movement followed by sequential 2D effects; mixed 3D axes, forward-plane movement and unverified transform origins remain held. Depth remains adjustable in the existing keyframe controls.
