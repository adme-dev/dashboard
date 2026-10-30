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

## Organizing and sharing

Use the project menu’s **Move to folder** action to change an existing design’s location, including **Unfiled**. The source-folder tag remains as provenance. **Share** opens the signed-in team viewer and can create a view-only client link. Client links can be opened by anyone who has the URL, expire after 7, 30 or 90 days, and can be revoked. Creating a client link does not send it to anyone automatically.

Review/comment links and view-only client links use separate token formats. The public client endpoint returns current artwork and only the fonts needed to render it; it does not return comments or reviewer identities.
