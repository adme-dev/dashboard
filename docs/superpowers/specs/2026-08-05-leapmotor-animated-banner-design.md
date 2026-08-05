# Leapmotor Uploaded-Image Animation Design

## Goal

Prove that an active XeroFlow owner can upload the supplied Leapmotor C10 JPEG, turn it into an editable animated Banner Studio project, preview the animation, and produce a downloadable test artifact without publishing it to an advertising platform.

The first project will be named `Leapmotor C10 Hybrid EV — Animated MRec` and use the 300×250 MRec format. The supplied 296×296 artwork must remain intact: the Leapmotor logo, vehicle, dog, and existing text cannot be regenerated, rewritten, or cropped out.

## Creative Design

The animation is a five-second loop with layered depth:

1. A full-bleed copy of the supplied image fills the 300×250 frame and provides subtle Ken Burns movement. Cropping is acceptable on this decorative layer because it is not the readable artwork.
2. The original square image sits above it with `contain` sizing so every branded element remains visible. It fades and gently rises into place.
3. A separate `Book a Test Drive` CTA enters near the end of the reveal, using a restrained upward slide. The CTA remains an editable Banner Studio layer and does not alter the source artwork.
4. The layers fade cleanly at the end of the five-second timeline so the loop does not jump.

The project remains a draft. This workflow does not publish, launch an ad, spend money, or send the creative to an external advertising account.

## Production Upload Flow

The permanent solution will use Banner Studio's asset library rather than embedding a base64 data URI in project JSON.

The upload route will accept one authenticated multipart `file` field, validate the real file signature as JPEG, PNG, WebP, GIF, or supported video, enforce a bounded file size, normalise the filename, and store the object under the authenticated user's R2 namespace. The database asset row will be created only after storage succeeds. If the database write or mandatory God Mode audit fails, the uploaded object will be deleted as compensation so no orphan remains.

For active Owner God Mode, the upload mutation will use an exact registered mutation family with a stable `Idempotency-Key`, request digest, transaction-bound audit/ledger state, completed replay, and fail-closed handling for ambiguous retries. Ordinary authenticated users retain the existing upload behaviour and permissions.

The asset-list response contract will be made consistent with its Banner Studio consumers so an uploaded asset remains visible after refresh.

## Project Creation and Animation Data

After upload returns the stored asset URL, the client will submit the complete MRec canvas through the already-coordinated project creation route. Creating the full canvas in one request avoids relying on an uncoordinated PATCH for this test.

The canvas contains two image layers and one button layer. Each layer has explicit position, dimensions, opacity, start/end times, entrance animation, exit animation, easing, and z-index. The server persists these as normal editable Banner Studio layer data; the existing editor and renderer remain the source of truth for playback.

Saving later edits is a separate mutation family. It is not required to prove initial upload-and-animate creation, but the editor must clearly report if a subsequent save is unavailable rather than silently losing work.

## Error Handling and Security

- Reject missing, empty, oversized, unsupported, or signature-mismatched files before R2 upload.
- Never trust the browser-provided MIME type or raw filename.
- Bind the upload to the authenticated owner and exact mutation identity.
- Preserve authentication, active-owner revalidation, tenant/user isolation, mandatory audit, emergency disable, SSRF protections, and storage secret boundaries.
- Reuse the same idempotency key after an ambiguous connection failure; rotate it only after an authoritative HTTP failure.
- Delete a newly stored object if the coordinated database/audit transaction cannot complete.
- Never publish or invoke an advertising-platform mutation during the test.

## Verification

Focused automated coverage will prove:

- file signature, size, and filename validation;
- owner God Mode coordination, replay, request-digest mismatch rejection, and audit failure behaviour;
- R2 compensation after database or audit failure;
- asset-list response compatibility;
- exact animation layer schema and five-second timeline;
- ordinary-user behaviour remains unchanged;
- no publish/render/ad-spend side effect occurs during creation.

The production battle test will then:

1. Upload the supplied JPEG through Paul's authenticated session.
2. Confirm the asset persists and reappears after an asset-list refresh.
3. Create the animated MRec draft through the coordinated route.
4. Open the exact project in Banner Studio and verify God Mode, image fidelity, timing, loop playback, and draft status.
5. Capture a preview for the user and provide a download link.
6. Leave publishing disabled and close the authenticated browser session when testing finishes.

## Public-Facing Documentation

The Banner Studio marketing entry will state that uploaded artwork can be converted into editable animated banner drafts. It will not imply automatic publishing or unsupported generative video behaviour.
