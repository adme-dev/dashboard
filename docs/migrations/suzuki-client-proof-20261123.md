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
