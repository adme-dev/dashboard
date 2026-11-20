# Prepared ReelMotion edits

The pilot imports a prepared edit into Banner Studio and links it to a Video
Studio draft. It does not select takes, transcribe footage, detect faces or
license music inside the hosted editor. Those steps happen during preparation.

## Operator workflow

1. Read the source job, script and every revision. Preserve the historical
   delivery; create a separately named reproduction or new production draft.
2. Prepare 1080×1920 footage, original presenter audio, licensed music when
   available, OEM fonts/logo, editable captions and motion. Keep the complete
   final spoken line before the end card. Review actual frames and audio.
3. Package the edit as `xeroflow-reelmotion-import`, version 1, in a
   `.xeroflow.json` file. Use local packaged asset paths and SHA-256 checksums,
   never arbitrary HTML, external URLs, credentials or server object keys.
4. In Banner Studio choose **Import creative packages**. Confirm the client and
   source edit's creation date. Import the draft and inspect its saved viewer.
5. Choose **Open in Video Studio**. This creates or recovers the same companion
   for the current operator, client and banner. It references the editable banner
   artwork and resolves audio from managed assets belonging to that client.
   A retry retains saved video edits instead of replacing them.
6. Save/reload, inspect fonts and footage during playback, and queue only the
   Reels/TikTok output for this portrait pilot. Download and inspect the actual
   MP4, including the opening, closing sentence and end card, before delivery.

No client approval, external delivery or publishing occurs during import.
Banner-ad MP4 export remains a separate path with its existing duration limits.

## Contract and evidence

- One `custom_1080x1920` board, explicit matching playback, at most 90 seconds
  and 600 editable layers. Existing TheBrief packages retain their 200-layer cap.
- Existing package limits, MIME validation, checksum checks, scoped font/media
  uploads and saved-canvas readback apply.
- Provenance uses `source:reelmotion`; it is never labelled as a TheBrief export.
  Source identities are isolated by provider and client at project creation.
- `reelmotion` metadata records `lastSpokenWordEndSec`, `endCardStartSec`,
  `headClashes: 0` and `faceSampleFps` (at least 6). The end card must have at
  least 2.8 seconds and start at least 0.1 seconds after the recorded last word.
- These metadata are preparation assertions, not server-run computer vision.
  Keep the source checksums, face samples, frame review and speech timing
  evidence with the private job bundle. Review again after native import or edits.
- An import is editable configuration. A successful local render is local
  evidence. Native export is proven only by the saved project, queued render job
  and its downloaded output. Keep these evidence stages separate.
- A missing licensed music bed must be stated explicitly; do not substitute an
  unlicensed track or claim a voice-only pilot is the completed client delivery.

## Runtime basis

The implementation reuses scoped Banner Studio storage, native AV timelines and
the existing Cloudflare render queue/container. Review resource budgets against
[Cloudflare's instance limits](https://developers.cloudflare.com/containers/platform/limits/).
Long render acceptance must test the real queue and lifecycle; historical
[long-running fetch reports](https://github.com/cloudflare/containers/issues/162)
are useful failure cases, not proof of the deployed SDK's behaviour.
