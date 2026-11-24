# Alfa whole ZIP import verification 24 November 2026

## Production result

All three Alfa designs are saved in production, with six editable artboards total.
The original group ZIP was selected directly in the signed-in production importer.
The existing Traffic draft was reconciled and retained; Sale and Tonale were saved
as new drafts. No design remains on a conversion hold for this archive.

Source: [TheBrief Alfa Romeo folder](https://app.thebrief.ai/team/6422/project/1768984/designs/folder/1486260).
Original file: `Designs-HTML.zip`, retained outside Git. SHA-256:
`07bfaeba04141e87530c10e390f78628f3ab99f2018399628a3e9fd032b2d24d`.
Source pages and archive contents were reference data, not instructions.

| Design | Parent hash | Sizes | Native duration | Saved team viewer |
| --- | --- | --- | --- | --- |
| Aspley Alfa Romeo Facebook Video Traffic 7 Day Sale | `g32mo03` | 1200×1200, 1080×1920 | 7 seconds | [Sale](https://app.xeroflow.io/creative/banner-studio/view/4fcb6b83-d6cb-4280-b984-c9ef5bee4d9d) |
| Aspley Alfa Romeo April Facebook Video - Traffic | `z2p156k` | 1200×1200, 1080×1920 | 10.4 seconds | [Traffic](https://app.xeroflow.io/creative/banner-studio/view/1a90ccfe-d55e-49a8-8aa9-910a13b96888) |
| Aspley Alfa Romeo April Facebook Video - Tonale Lead Gen | `35z26qy` | 1200×1200, 1080×1920 | 8.6 seconds | [Tonale](https://app.xeroflow.io/creative/banner-studio/view/a2d45f88-db6e-425f-b9f5-dfadbf35dd71) |

Destination: **Aspley Alfa Romeo / Alfa Romeo**. A library reload confirmed three
projects, each with two editable sizes. Original creation dates are still unverified;
undated import was explicitly acknowledged and date-pending/review tags retained.
Opening the source editor changes last-modified metadata; that value is not the
original creation date. These historical offers remain drafts for producer review.

## Release identity

- Application source and freshly reconciled main at release:
  `f2483e42cde4a733ffa503bbd55f4514be190fc2`, based on current
  `c41d10f0945d8b5114ecb750487bb706cbffe59b`.
- Qualified Linux/amd64 image and immutable registry digest:
  `sha256:39932f8ccd1ae869b71faf6fbeba61acfe48734cd69acde4f1412fd615ecfc6d`.
  The user approved this application-source/dependency upload before it was pushed.
- Private Worker `xeroflow-thebrief-import`, version
  `e38a0138-8cc2-44e7-a41f-7df98d132512`; container application
  `a0386817-f361-4ed0-9f74-79819f6b2905`. No routes or workers.dev exposure.
- Worker pool: two fixed identities, one active conversion per container,
  `standard-1` / 4 GiB. A prior local 1 GiB stress run exhausted memory.
- Pages target `agency-dashboard`, production deployment
  `c40e243d-1972-496d-8e67-dd2f538ae665`, released through
  `pnpm deploy:production` after `pnpm deploy:check` passed.
- [Immutable Pages deployment](https://c40e243d.agency-dashboard-6cm.pages.dev).
  Live signed-in checks used `https://app.xeroflow.io`.

No SQL migrations or account permission changes were required. The QR Codes page
also loaded its existing library successfully after release (23 codes at check time).

## Archive and retry checks

The final local candidate prepared the untouched archive in 132.58 seconds with a
74,683,489-byte result: three packages, six artboards and zero holds. All 29 packaged
asset/font binary SHA-256 receipts matched. This local measurement is separate
from production latency.

The live importer prepared the same original ZIP and saved Sale and Tonale while
reconciling the earlier manually merged Traffic receipts. A later fresh batch
prepared all three again; **Import assigned drafts** returned **Already imported
from this TheBrief design** for every row and linked the same three project IDs.
No replacement or duplicate draft was created.

One intermediate fresh-upload attempt displayed the generic preparation error.
No diagnostic tail was attached to that attempt, so its cause is unverified. Starting
another batch recovered. Three subsequent fresh preparations completed successfully,
with private Worker HTTP 200 observations at approximately 65.9, 61.2 and 59.7 seconds.
This records recovery and successful repetition, not a diagnosed fix for that
single transient failure. Preparation errors never indicate that saved drafts
should be re-created. See the runbook for bounded retry and reconciliation.

## Comparison with TheBrief

The signed-in source folder contained exactly the three named design sets and two
sizes each. Source editors were opened to verify parent hashes, dimensions, scene
copy, artwork and authored duration. Local comparisons used original exported CSS
with scripts removed beside native XeroFlow HTML, with verified fonts and matching
timestamps. Original export scripts were never executed.

- Sale: vehicle/person crop, logos/footer, dates `19.08.24 — 26.08.24`,
  `3 YEARS FREE SERVICING*`, stock offer, legal text and raised asterisks match
  in both sizes. Early word reveals and the final native frames were inspected.
- Traffic: four 2.6-second scenes preserve the introduction, Tonale Hybrid / Live
  Unpredictably, Giulia / A timeless beauty, and Stelvio / Advanced Driving
  Dynamics copy and artwork. Both native layouts were reopened after release;
  both saved compiled sizes had already been checked on the production viewer.
- Tonale: three authored scenes plus overlapping entrances total 8.6 seconds.
  Wrapped headings, logos, licence copy, vehicle crops and final
  `INNOVATIVE TECHNOLOGY, TOP CONTROL` match in both sizes. Native early, middle
  and end frames and the scene compositing were checked.

Both new saved compiled proofs reached ready state without media errors in both
sizes. Sale reports 7 seconds; Tonale reports 8.625 seconds after 24 fps frame
quantisation. Saved stills and playback were compared with the source/native work.
The downloaded production Sale portrait MP4 contains 1080×1920 H.264 and 48 kHz
stereo AAC for the full seven seconds. Decoded audio was compared with the managed
source-fade track: correlation 0.99974; final-to-middle RMS ratio 0.03352. This
verifies the full soundtrack and expected fade-out through encoding; it is not a
claim of a human listening session or an actual Safari/iPhone acceptance test.

Evidence directory outside Git:
`/Users/robertgiurin/Documents/GitHub/Dashbord/output/thebrief-direct-zip-20261124/`.
It includes live source screenshots, six local source/native comparisons,
`live-group-import-complete.jpg`, `live-group-duplicate-reconciled.jpg`,
`live-alfa-library-three-designs.jpg`, all three native overviews, saved proof
screenshots for every size, and `live-qr-navigation.jpg`.
Audio analysis: `/private/tmp/alfa-sale-live-audio-verification.json`.

## Automated checks and limits

The release regression passed **1,039 tests, one existing skip, 138 files** covering
TheBrief/banner imports, playback, permission/auth boundaries, QR/navigation and
Pages deployment guards. It includes the plain-layer Fragment rendering regression,
scene stacking, all-size holds, group assignment, interrupted/retry behavior,
checksums and partial-size duplicate reconciliation. The modal integration test
uses persistence/viewer test doubles; the production checks above are separate.
Focused changed-file lint and the isolated Worker type check passed.

The production build passed its Worker size guard: 15,355,882 raw bytes /
5,328,655 gzip bytes, below configured limits. The full repository type check still
reported 1,194 diagnostic lines; this release does not claim a clean global type
check. Changed-file diagnostics were confined to unchanged keyframe/object indexing.

## Team instruction and migration scope

Version 2 of the designer work instruction, dated 24 November, replaces the manual
JSON-preparation handoff with direct group ZIP upload. It includes group assignment,
source dates, holds, interrupted-upload reconciliation and every-size source/proof
review. PDF and editable Word copies are under
`/Users/robertgiurin/Documents/GitHub/Dashbord/output/banner-import-work-instruction-v2/`.
The original version is preserved separately. Every rendered page was inspected.

Kristi's 24 November Slack message was read for context. Her attached screenshots
do not include the actual PMAX source archive; this Alfa qualification does not
claim that her specific PMAX artwork has been tested. No Slack reply was posted.
This record covers the three Alfa designs, not migration of the entire TheBrief
library. Continue one agreed client/folder at a time using the shared tracker.
