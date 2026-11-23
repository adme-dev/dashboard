# Peter Davey Suzuki editor playback

## Report and cause

The editable Peter Davey Suzuki Jimny project is Banner Studio
`9e05430a-e458-4424-bcf2-eab1a031f126`; its Video Studio companion is
`cb30213e-4fed-5f1f-a734-6a4996c6a0ce`. Audio played correctly but video jittered.
The Banner Studio timeline paused footage and assigned `currentTime` on every
GSAP update. The Video Studio companion also used the paused capture seek on
every audio-clock update. Decoder seeks are asynchronous, so this repeatedly
interrupted footage rather than letting it decode normally.

## Previous developer's work reviewed

Reviewed #874–879, #883, #949 and #953, and the qualified-container runbook,
ReelMotion render-split specification and the chat “Check shared video playback”.
The qualified image is pinned at digest
`e345af76da37aca367e1a2f7428dd47bf1160719f3e8465227d0a5df8cecf6ca`, standard-4.
The Video Studio render queue uses the existing composite endpoint; Banner Studio
uses its existing banner endpoint on the same audio-jobs render container. These
are distinct job contracts, not interchangeable payloads. This patch changes
neither encoder, worker, image, capture readiness, native footage/graphics split,
audio scheduling nor source-video presentation timestamp handling.

## Interactive change

Both editors use one video transport that lets the browser decode continuously,
with bounded drift correction. Pause and scrub keep the latest requested frame;
an in-flight seek is allowed to finish before another seek. Trim points, loop
boundaries, delayed presence and final media holds are retained. Pending play
requests cannot outlive pause, disposal or a replacement timeline owner.
Native audio remains the existing transport. Video stays muted to avoid doubling
voiceover. Editable layers, fonts, authored zoom keyframes, masks and cuts remain
in the existing GSAP timeline. Inactive artboards silently follow the playhead;
Play All owns its own video timelines and explicit pause/disposal lifecycle.

Only interactive AV HTML opts out of per-frame video seeking. Export and capture
HTML retain their deterministic seek callbacks. The actual Suzuki capture HTML
is byte-identical before/after (171600 bytes, SHA-256
`d5b17001ffa57a653ce5dcdacc8c2bb6d24baeff8d6e7831cb1be42f211008d8`).
No saved creative or timeline was modified for this fix.

## Verification

810 targeted tests pass, one optional test skipped: Banner Studio, audio/video
transport and native motion, Video Studio preview/workbench, render API and
ReelMotion split/graph parity. Regression tests cover continuous frames without
per-frame seeks, pause, newest scrub target, trim/loop/presence, delayed play
cancellation, replacement ownership, real editor zoom motion, and capture-mode
preservation. New transport/helper/test lint passes. Existing legacy component
lint findings are tracked separately from new lines; full repository typecheck
is not claimed clean.

A local browser fixture uses the actual saved Suzuki artwork, managed fonts and
source footage with the new bundled preview helper. At 12.075s it showed390 decoded
frames, zero dropped frames, readyState4 and no seek in progress. Seek count stayed
at6 from startup through that 12-second playback interval. Pause landed on the
requested frame. This is measured on the connected Chrome instance; it does not
establish performance on every device.

Production merge/deploy and live editor checks follow before release completion.
