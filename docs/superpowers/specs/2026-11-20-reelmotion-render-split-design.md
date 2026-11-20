# Bounded ReelMotion footage/graphics render split

The user authorized autonomous ReelMotion reproduction, video container improvements
using Astra High, and real native output proof. Whole-artwork capture must wait for
each video decoder seek to preserve picture timing. The candidate must complete
within the existing 600-second request deadline; no larger timeout or further
preset tuning substitutes for correct, bounded output.

Use the existing video brief §4.4 topology for the eligible portrait companion:
FFmpeg decodes footage; Chromium captures upper artwork graphics from the same
loaded layer revision. Preserve the editable banner and the legacy complete HTML.
Unlike a static extraction, this pilot contains 14 paired centered uniform zoom
keyframes that must be compiled with their authored linear timing and cut resets.

## Contract and compatibility

`shared/reelmotionBaseFootage.ts` exports `ReelmotionBaseFootage` with version1,
`graphicsHtmlKey`, `source: {r2Key,etag,size}`, and numeric
`zoom: {timeSec,scale}[]`. ResolvedOverlay adds optional `baseFootage`; existing
`htmlKey` still points to complete artwork, so an old Worker ignores the optional
optimization and remains visually correct. New Workers read the graphics sibling
and the pinned managed source from R2, compare the same object's ETag/size before
reading bytes, and reject this descriptor for pinned storyboard jobs.

The server opts in only for a source:reelmotion banner owned by the Video Studio
project's client, one full-duration portrait overlay at zero, no other visual
tracks, no placement, one full-frame opaque video below all graphics, supported
centered uniform scale tracks and no other video transform, mask, crop, blend,
loop or animation. Resolve the source by exact managed URL and client-scoped DB
asset; accept no request-provided R2 key or arbitrary HTTP source. Unsupported
artwork retains complete-artwork capture. Once split input is pinned, changed or
missing media fails rather than silently changing the render.

Generate graphics HTML from the same loaded layers, omitting only the covered
background, separate audio and chosen footage layer. Keep IDs, timing, fonts and
all upper graphic layers. Compile a numeric-only scale curve in FFmpeg, preserve
source presentation timestamps, media time, centered crop, resets and final frame.
The voice track remains the existing native timeline track.

Acceptance: source authorization and eligibility tests; TS/MJS graph parity;
first-PTS/VFR regression; exact-image real media, packaged service and both signals;
complete real sample under600sec, full decode, 20 source-frame/cut checks and copy
readability. Then current-main CI, standalone Worker/image readbacks, Pages release
for producer support, and one actual native Reels export with downloaded MP4
picture/audio checks. Local success and native acceptance remain separate.
