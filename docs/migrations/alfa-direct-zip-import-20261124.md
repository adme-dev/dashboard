# Alfa whole-ZIP import verification — 24 November 2026

## Status and source

Local implementation and original-archive preparation are qualified. The new
service and Pages caller have **not** been deployed. Only the earlier April
Traffic draft is saved in production; Sale and Tonale remain pending release.

Source branch: `fix/banner-group-import`, based on `c41d10f09`. Source folder:
[TheBrief / Alfa Romeo](https://app.thebrief.ai/team/6422/project/1768984/designs/folder/1486260).
Original file: `Designs-HTML.zip`, kept outside Git. SHA-256:
`07bfaeba04141e87530c10e390f78628f3ab99f2018399628a3e9fd032b2d24d`.
Source pages and ZIP contents were treated as reference data, not instructions.

| Design | Live parent hash | Sizes | Prepared duration | Production state |
| --- | --- | --- | --- | --- |
| Aspley Alfa Romeo Facebook Video Traffic 7 Day Sale | `g32mo03` | 1200×1200, 1080×1920 | 7 seconds | Pending release/import |
| Aspley Alfa Romeo April Facebook Video - Traffic | `z2p156k` | 1200×1200, 1080×1920 | 10.4 seconds | Existing draft, exact export receipts reconciled |
| Aspley Alfa Romeo April Facebook Video - Tonale Lead Gen | `35z26qy` | 1200×1200, 1080×1920 | 8.6 seconds | Pending release/import |

Existing Traffic project: `1a90ccfe-d55e-49a8-8aa9-910a13b96888`.
[Saved team viewer](https://app.xeroflow.io/creative/banner-studio/view/1a90ccfe-d55e-49a8-8aa9-910a13b96888).
Destination: Aspley Alfa Romeo / Alfa Romeo. Original creation dates remain
unverified; import as explicitly acknowledged undated drafts, retaining review tags.
The source editor updates its last-modified metadata when opened, so that value
is not evidence of the original creation date.

## Original ZIP and import checks

The final Docker candidate returned HTTP 200 for the untouched archive in
132.58 seconds, with a 74,683,489-byte response: three packages, six artboards,
zero design holds. All 29 packaged asset/font binary SHA-256 receipts matched.
The earlier manually merged Traffic package reconciled by its exact child-export
checksums; it must be skipped rather than creating a second production draft.

The Linux/amd64 container ran locally under a 4 GiB cap with two emulated CPUs.
Qualified local image: `thebrief-import:qualified`, image ID
`sha256:39932f8ccd1ae869b71faf6fbeba61acfe48734cd69acde4f1412fd615ecfc6d`.
An earlier 1 GiB stress run exhausted memory. The Worker therefore uses
`standard-1` / 4 GiB with a fixed two-instance pool. These are local measurements,
not Cloudflare production latency or capacity claims.

The real modal/real batch reader/real preparation integration test exercised
three designs with two sizes each, group assignment, undated acknowledgement,
two saved drafts, one reconciled duplicate, viewer checks, and cached retry
without duplicate writes. Persistence and viewer transports in that test are
test doubles; this is separate from a real production import.

## Comparison against TheBrief

The signed-in live folder contained exactly the three named design sets, each
with two layouts. Each live source editor was opened to verify names, parent
hashes, dimensions, scene copy, artwork and authored duration. Local side-by-side
comparisons used the original exported CSS with scripts removed and native
XeroFlow HTML, with the same verified fonts and timestamp in both views.

- Sale: vehicle/person crop, dealership/logo/footer, dates `19.08.24 — 26.08.24`,
  `3 YEARS FREE SERVICING*`, stock offer, legal text and raised asterisks match in
  both sizes. The live source timeline shows the soundtrack fade; a managed MP3
  reproduces its one-second fade-out while preserving the source ZIP.
- Traffic: four 2.6-second scenes retain the introduction, Tonale Hybrid / Live
  Unpredictably, Giulia / A timeless beauty, and Stelvio / Advanced Driving
  Dynamics copy and their vehicle artwork in both sizes.
- Tonale: three authored scenes of 2, 2 and 2.6 seconds plus the two one-second
  entrances total 8.6 seconds. Wrapped headings, logo, licence text, vehicle crops
  and final `INNOVATIVE TECHNOLOGY, TOP CONTROL` copy match in both sizes.
  Scene overlap uses one composited group per scene; group stacking contexts and
  the delayed child entrance poses are preserved in native and exported playback.

Evidence screenshots are outside the repository at
`/Users/robertgiurin/Documents/GitHub/Dashbord/output/thebrief-direct-zip-20261124/`:
`sale-square-end.jpg`, `sale-portrait-end.jpg`, `traffic-square-end.jpg`,
`traffic-portrait-end.jpg`, `tonale-square-end.jpg`, `tonale-portrait-end.jpg`,
and live source screenshots. These are local conversion comparisons, not proof
that all three designs have been saved in production. Final production playback,
audible sound and saved compiled-proof checks for Sale and Tonale remain pending
release/import. The existing Traffic team viewer was reopened in both sizes;
both compiled previews reached ready state and displayed the saved native artwork.
`traffic-saved-square.jpg` and `traffic-saved-portrait.jpg` record that separate
production check.

## Automated verification

The final banner/TheBrief/QR/deployment guard regression suite passed: 1,039 tests,
one existing skip, across 138 files. It includes the plain-layer Fragment rendering
regression, scene stacking and a partial-size duplicate that must not skip the
rest of the design. Focused changed-file lint and the isolated Worker type check
passed. `pnpm deploy:check` passed against freshly fetched `origin/main`; both
source/base and main remained `c41d10f0945d8b5114ecb750487bb706cbffe59b`.
The final Nuxt production build passed, including the Worker size guard:
15,355,784 raw bytes / 5,328,619 gzip bytes, below both configured limits.
No deployment was performed by the build or check commands.

The full repository type check reported 1,194 diagnostic lines. Diagnostics in
modified files are confined to unchanged existing keyframe indexing and
`sameImportedCanvas` object indexing; the remaining diagnostics are elsewhere in
the repository. This release does not claim a clean repository-wide type check.

## Release progress

The user explicitly approved the source/dependency image upload and deployment
on 24 November. The exact qualified image was pushed to the existing Cloudflare
account registry and pinned in the Worker configuration:
`registry.cloudflare.com/a5b299b3ad15c1b5b895dc66f9357b17/thebrief-import@sha256:39932f8ccd1ae869b71faf6fbeba61acfe48734cd69acde4f1412fd615ecfc6d`.
Worker and Pages deployment, production ZIP preparation and the remaining saved
projects are being verified following the [release procedure](../../workers/thebrief-import/README.md).
