# Designer import recovery — 25 November 2026

Production verification is pending. Designers were asked to pause imports and
client corrections until the live checks pass. This record must not be treated
as permission to resume until the deployment and live results are recorded.

## Changes

Preserve editable text for all four Innisfail Mazda Black Friday sizes, with
checksum-bound row measurements for Uncompressed and High (90%) exports.
Support centered uniformly scaled rotated shapes, sequential translation exits
and the reviewed changing-pivot video entrance. Audible MP4s retain their original
video bytes and gain an editable extracted MP3 soundtrack. Non-looping video clip
ends rounded by at most 100 ms reconcile to verified EOF and retain their authored
presence; loops and larger overruns remain protected.

Client corrections authorize both clients, retain immutable font bytes through
separately scoped metadata and remap project and saved-version references in one
transaction. Imported source canvases remain protected against replacement.
Deleting one scoped font record cannot remove another client's shared backing
file. New-client creation invalidates the client picker caches.

Archive and all six clients on Kristi's checklist were created and confirmed
active. XPeng Deer Park was also created separately following Kristi's approval;
four Ringwood projects and one Deer Park project require live reassignment after
deployment. Existing imports must not be recreated to correct client assignment.

## Validation

- Import, banner playback, project/client/font and navigation/release regression
  suite: 1,218 tests passed, one skipped (153 test files passed).
- Disposable local PostgreSQL: nine real route tests passed, including imported
  project correction with exact font storage keys, unchanged artwork and all
  saved versions preserved.
- Linux/amd64 image under 4 GiB and two CPUs:
  `sha256:c61ec55dd6b49cb44ec42fa20b36749fd9d742e80a647dbbbbdb30af9cbef14e`.
  The original Innisfail (four sizes), Bay City Postcode Sale (three), Spring Saver
  Traffic (two), Arctic Campers (one), Audi Service (one), and High (90%) Innisfail
  variant (four) are qualification fixtures. Every packaged asset/font checksum
  and source archive receipt is checked; malformed ZIPs must return 422.
- The Spring Saver fixture was downloaded directly through the existing TheBrief
  session using Tina's High (90%) settings. Slack's attachment tool cannot fetch
  her 10.7 MB attachment, so byte identity with that attachment is unverified.
- Source exports and detailed results are retained outside Git in the local
  `output/tina-import-blockers-20261125` evidence directory.

## Release and live verification

Base: `origin/main` at `38777479b`, reconciled with the deployed editable-import
changes from `ee26a30f9`. Pages must ship compatible package parsing before the
private Worker enables its new output. Keep the fixed private ingress, account,
pool sizes and byte limits. Use the guarded Pages deployment scripts only.

Pending: registry push, Pages and Worker deployment IDs, live source ZIP imports,
saved draft/playback checks, five XPeng client corrections and QR Codes navigation.
