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
6. Save and reload the draft, check fonts and footage during playback, and choose
   the required output formats. Reels uses the native portrait canvas. Square
   and YouTube center the complete unplaced portrait artboard with black side
   bars. Review each downloaded MP4, including captions, closing sentence and
   end card, before delivery. See the qualification runbook for the current
   hosted acceptance of each format.

No client approval, external delivery or publishing occurs during import.
Banner-ad MP4 export remains a separate path with its existing duration limits.

## Contract and evidence

- One `custom_1080x1920` board, explicit matching playback, at most 90 seconds
  and 600 editable layers. Existing TheBrief packages retain their 200-layer cap.
  This is an input ceiling, not a qualified render-time or throughput guarantee.
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
the existing Cloudflare render queue/container. Every dispatch retains a complete
HTML snapshot. For a strictly eligible portrait companion, it also derives
transparent graphics from the same loaded artwork revision and uses FFmpeg for
the client-owned managed footage, including its authored centered zoom curve.
For a single full-length pinned portrait artboard, square and landscape renders
compose the native picture first, then scale and center it in the requested
frame. Formats with their own artboards keep their respective compositions.
An explicit overlay placement keeps its authored positioning.
The Worker verifies the source object's recorded ETag and size. Unsupported
artwork keeps whole-artwork capture; unsupported media profiles receive at most
one bounded fallback using the same verified footage bytes. Saved artwork is
never rewritten for the optimization. This implements a bounded part of the
FFmpeg-footage/graphics split in
[the video brief](../engagr-ai-media-studio-video-brief.md), not a general timeline
compiler or a 90-second throughput guarantee.
Review resource budgets against
[Cloudflare's instance limits](https://developers.cloudflare.com/containers/platform/limits/).
Long render acceptance must test the real queue and lifecycle; historical
[long-running fetch reports](https://github.com/cloudflare/containers/issues/162)
are useful failure cases, not proof of the deployed SDK's behaviour.


## Export progress and time limits

Video Studio reports measured frames while preparing artwork, encoded media time,
and saved bytes when the renderer supplies those counters. Missing measurements
remain indeterminate. Completed formats are separate from within-format progress;
only authoritative publication makes the export downloadable. You can keep
editing or leave and return while the queued job runs.

Composite work shares a twelve-minute budget across source reads and all formats.
Each format has a ten-minute cap within that budget. A confirmed deadline failure
stops automatic retries after cleanup and failure persistence; use Retry to create
a new job with the required formats. Transport and uncertain-publication failures
remain retryable. Disconnects and deadlines
terminate owned rendering children and clean temporary files. Progress is advisory;
a temporary status failure does not fail an otherwise valid export. A lost
publication response retains output bytes until the queue retry reconciles the
persisted job rather than deleting a potentially published video.

Release order: deploy the backwards-compatible Pages callback schema first, then
the qualified Worker/container pair. The Worker sends a private attempt token;
old Pages callback schemas reject that extra field. This stage retains the
qualified media engine; native Container API migration is separately qualified.
