# Designer import recovery — 25 November 2026

The production importer prepares all five reported designs without technical
holds (11 layouts). Four assigned designs have been saved and reopened with all
ten layouts intact. Audi also prepares, but its owning client is awaiting Tina's
confirmation. Designer visual review and source creation-date backfill remain
required; these drafts have not been approved or published.

## Changes

Preserve editable text for all four Innisfail Mazda Black Friday sizes, with
checksum-bound row measurements for Uncompressed and High (90%) exports. Exact
validated file-content digests also recognize identical exports with different
ZIP timestamps, ordering or compression; every filename and byte remains bound
to the review and the actual uploaded archive SHA is retained as provenance.
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
active. XPeng Deer Park was also created separately following Kristi's approval.
Four Ringwood projects and one Deer Park project have been corrected live.
Stored canvas comparison confirms that only scoped font IDs changed: artwork,
timing, text and provenance stayed unchanged. Source/destination font metadata
checks confirm identical storage keys, checksums, sizes, family and MIME type.

## Validation

- Import, banner playback, project/client/font and navigation/release regression
  suite: 1,218 tests passed, one skipped (153 test files passed).
- Disposable local PostgreSQL: nine real route tests passed, including imported
  project correction with exact font storage keys, unchanged artwork and all
  saved versions preserved.
- Linux/amd64 image under 4 GiB and two CPUs:
  `sha256:56fa0b4178b00641aac8c2ef8db1110f08f0cef564d2ba55e6a64a1e237fcc1f`.
  The original Innisfail (four sizes), Bay City Postcode Sale (three), Spring Saver
  Traffic (two), Arctic Campers (one), Audi Service (one), and High (90%) Innisfail
  variant (four), plus an identically sourced repacked variant (four), are
  qualification fixtures. Every packaged asset/font checksum and source archive
  receipt is checked; malformed ZIPs must return 422.
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

- Pages source: `7b7ef1f207e983b90ca38514ec77d07c05b4ce31`.
  Production deployment: `aae416cf.agency-dashboard-6cm.pages.dev`.
- Private Worker source: `b153dbcf1d8a745a22af98191327f5a5df62be78`.
  Worker version: `55a2c201-d1b3-4964-9f5b-0b20547e7180`.
  Container application version 14, healthy with no reported errors, reads back
  the exact qualified `56fa0b…fcc1f` image above. Private ingress and pool bounds
  are unchanged.
- Integrated via PR #1008, merge `b59a70f9cac93b1f9d3d788c19f5eaa9cba1d7c4`.
- The first live batch encountered version 13 during rolling replacement and
  reproduced old holds. The batch was discarded, the old instance retired,
  version 14/digest was confirmed, and a fresh dialog prepared all five originals
  successfully. Reopening the dialog avoids reusing earlier cached preparations.
- Saved draft projects (all remain `import:needs-review`, creation date unverified):
  - Innisfail Mazda, four sizes: `69c428be-8301-4799-962c-94c65dd42b98`,
    Innisfail Motor Group / Mazda.
  - Bay City Postcode Sale, three sizes: `596f8471-ca11-40ea-9e2b-a6800fb62106`,
    Bay City Auto Group / Bay City Auto Group.
  - Spring Saver Traffic, two sizes: `5bffba1e-3df8-42d9-9954-385388f638ac`,
    Bay City Auto Group / Bay City Auto Group.
  - Arctic Campers video, one size: `9a5d4803-bf1e-4646-8a71-e76d4669842d`,
    Arctic Campers / Arctic Campers.
- All ten saved layouts were reopened in the editor and inspected at settled
  frames. Innisfail's four wrapped-text layouts, Bay City's three rotated-shape
  layouts and Spring Saver's two layouts render with editable layers. Arctic's
  Video 23 entrance/exit and its separate 5.50–10.50 second soundtrack are editable;
  actual video/audio playback decodes without errors and follows the same clock.
  The original MP4 remains muted in the editor so its extracted soundtrack is not
  doubled. Innisfail's saved wide-layout MP4 viewer also decodes at 1920×580,
  six seconds, without media errors. Arctic's saved MP4 render completed and
  plays at 1920×1080 for exactly 15 seconds with no media error; downloaded-output
  ffprobe confirms H.264 video and an AAC audio stream.
- All four imports report saved viewers ready. QR Codes navigation loads correctly.
- Audi client ownership is the only outstanding import assignment; no guessed
  client or original creation date has been supplied. Its video/audio adapter is
  verified in both the exact image qualification and live preparation.
- Tina and Kristi received the [confirmed resume message in design-team](https://adme-da.slack.com/archives/C0590CBA1PG/p1795570981865999).
  The Monday checklist has completion update `5752373142`. Eleven completed task
  tabs were closed; the live import results were retained.

Evidence: `live-import-results.txt`, the four `*-live.png` editor screenshots,
`xpeng-before.json`, `xpeng-after.json`, `xpeng-fonts.json`,
`final-linux-qualification.json`, `container-active.json` and release logs in the
local evidence directory above. One local qualification attempt had a child IPC
startup failure (`EPIPE`), with no memory-limit/OOM events; an isolated retry and
the full seven-archive repeat passed. Live preparation passed after rollout.
