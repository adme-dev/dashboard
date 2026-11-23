# Suzuki rendered client proof

The requested Banner Studio project is 9e05430a-e458-4424-bcf2-eab1a031f126,
linked to Video Studio project cb30213e-4fed-5f1f-a734-6a4996c6a0ce.
Initial live checks found no client links and no saved viewer snapshot. Saving
from a fresh editor created the snapshot; accepted canvas data remained identical.
The 40.18-second artboard was then rejected by the existing 30-second preview cap.
The underlying banner capture also clamps to 30 seconds, so merely raising the
public limit would silently truncate the proof.

## Change and preserved work

Share with client can attach an already completed full-frame Video Studio render
for a matching 30–90-second artboard. The qualified encoder, render container,
frame readiness, audio transport and editable motion/font data remain unchanged.
The selected MP4 is copied as a native R2 stream to project-scoped proof storage;
no HTTP source, caller R2 key, new render or re-encoding is accepted. The completed
artifact participates in the existing content-addressed banner job lookup and
capability/range-delivery path. Ordinary banner compilation retains its 30-second
limit and original revision profile.

The write requires existing write/client authorization. Candidates have the same
client, an immutable completed job matching the current AV edit, one full-frame
linked banner overlay, exact artwork dimensions/duration and a native profile.
R2 source ETag/size/type are checked before copy; the destination size is checked
before publication. Artwork/font revision and source eligibility are re-read
before publication. Audit metadata records actor, source job, format, key, ETag,
size and saved revision in an immutable fingerprint-named private manifest.
A new banner/font revision cannot serve a previous attachment. Public delivery
still authorizes the share token on every request and uses private/no-store ranges.

A producer must review the rendered MP4 before selection. Current AV timeline
input does not independently establish that every linked banner/font was unchanged
since rendering; this is explicit selection, not automatic visual equivalence.
No billing/Xero association is needed to deliver this creative proof.

## Verification

730 focused tests passed with one optional skip before final release review.
Coverage includes normal sharing, readiness failure, long-proof gating, source
client/key/format/duration/placement rejection, denied writes, ETag mutation,
artwork changes during copy, full-length public delivery and unchanged capture
limits. New and changed source/tests lint clean. Production publication and
actual full-MP4/poster/playback verification follow before completion.

XeroFlow already has the project assigned to Peter Davey Suzuki, client
bbb6bc08-ecc0-45b7-99f3-349fadfe1333. Its Xero contact binding was null at check.
The user says it trades under another name; that name was requested before any
accounting contact or binding change, to avoid an incorrect duplicate.

## Production acceptance

PR #977 merged as `0bef28b9cc48259647314141adb7574856d0f928`. Guarded source and
target checks, production build and upload passed. Production deployment
`e09f786c-ba57-40e7-976f-75ca6f1616f9` uses that source on agency-dashboard/main.
Fresh main readback matched the deployed application commit.

The live sharing dialog offered the expected 22 November Video Studio render,
job 234d1798-3bb9-4b89-8957-b501acaf6006, native reels_9x16. Attaching it streamed
the actual stored MP4 into project-scoped proof storage. The team viewer updated
to its native player, and the dialog enabled client link creation only after the
attachment was ready. A seven-day client link was created, expiring 30 November
2026 Melbourne time; its capability token is kept in private evidence, not Git.

The actual anonymously delivered client MP4 is 40652216 bytes, SHA-256
`58e2304741a5b9505d6bc6ccc2fbb0227c522258de1512d840125ba74fa74bb3`.
This exactly matches both the downloaded source and the earlier qualified native
ReelMotion output in the render-container qualification ledger. Full FFmpeg decode
passed. The file contains 40.2 seconds, 1206 H.264 frames at 30 fps, 1080×1920, and AAC
audio. Prefix/suffix ranges returned 206; an invalid range returned 416. The public
page uses a native MP4 player and zero HTML5 iframes. Playback was observed
advancing to 38.446 seconds at readyState 4, beyond the old 30-second cutoff.
QR Codes navigation loaded, and the accepted saved canvas remained JSON-identical
to its pre-check snapshot. Its JPEG poster returned 200, 675×1200,
140449 bytes, with the readable Suzuki/Rhino scene shown before playing.

The user subsequently instructed that the Xero/contact setup be left for the
moment because the earlier work may have been testing. No Xero contact was created
or linked. That accounting task is paused; it does not block the creative proof.
No client message was sent. The original creative remains editable, and the
colleague's unrelated analytics edits remain untouched.
