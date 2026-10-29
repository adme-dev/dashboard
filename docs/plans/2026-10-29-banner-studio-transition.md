# Banner Studio transition — 29 October 2026

## Source and workflow checked

- TheBrief design: `1nz5y6q`, “Northern JAC Meta Traffic - Hunter Ute”, under the ADME SUPPORT team. Its signed-in editor shows a single 8 second loop with 1200 × 1200, 1080 × 1920 and 1920 × 1080 layouts. The HTML5 download contains three separate size ZIPs, two MP3 files per size and local Futura Md BT faces. Original export SHA-256: `297b8d943797edbc13dd5e3e13318eb2a58cf231bb0af53e46dd5f5fbd7ec8e4`. Keep the export outside Git.
- The matching Monday marketing job is item `13391053476` on board `13392458`. Its brief requests 9:16, 1:1 and 16:9 video plus a thumbnail; the creative handoff is three MP4s. This pilot must be reviewed as a draft before any campaign use.
- A review of the latest 60 Marketing board items and four representative creative threads shows the production pattern: brief and copy, three-size video and thumbnail handoff, approval, revisions, final files, media launch and QA. GWS Kia Seltos (`13342167067`) required changing the car colour and making the offer visible in the first 1–2 seconds rather than at 4.7 seconds. Mornington Nissan service (`13271213174`) required updated copy and all three final MP4s after an end-date change. Werribee Toyota TikTok (`13353729186`) was still awaiting its ReelMotion source asset. The transition therefore needs timing review, versioned replacements and a clear “awaiting assets” state, not just successful file conversion.
- TheBrief account has an API credentials page, but no existing key was listed. Creating a key grants direct account API access and requires separate operator approval. An existing browser login is sufficient for a manual HTML5 download, but is not a server credential for a URL importer. The documented API has design listing and exports; it does not expose the browser session to XeroFlow.
- The Creative Suite currently runs from `origin/adme-dev/craft-hosted-rollout-20261028` rather than current `origin/main`. The live six-app Worker has a guarded MotorStack proxy and a Nuxt UI asset panel for PhotoFlow and VectorFlow. The proxy key is a Worker secret and is not available to Banner Studio on Pages. Reconcile this source onto current main before changing or redeploying the Creative Suite Worker.
- MotorStack JAC brand assets include Montserrat faces, logos, colour and Hunter media. The source banner uses Futura Md BT, so its exact font must be retained for an import review.

## Implemented on the isolated branch

- Full-screen `/creative/banner-studio` library and `/creative/banner-studio/:id` editor routes preserve the existing `/agency/banner-studio` routes and creative role gate. Multi-size projects open fitted to every artboard, with an explicit Fit all layouts control.
- Imported layers carry a `linkId`. Content edits propagate to corresponding layers on other sizes as one undoable canvas change. Geometry and timeline placement remain per size. Duplicates lose the link.
- The native package parser accepts up to 20 reviewed sizes in one design. `scripts/thebrief/merge-packages.mjs` combines independently validated size packages under one source identity. The import dialog displays all dimensions.
- The converter identifies the JAC audio layers, retains italic text and compares leaf text runs. MP3 upload identity and managed asset validation accept ID3-tagged MP3 files.
- HTML5 audio playback no longer resets `currentTime` on every playing frame; paused timeline seeks still update the audio position. The MP4 renderer does not mux sound, so both UI and server reject audio-bearing MP4 renders instead of delivering a silent file.

## Acceptance still open

1. Convert the JAC design’s repeated/fractional intermediate animations on source elements `433`, `443` and `203`, and its staggered word animation on `436`. The package builder intentionally holds all three sizes until these effects can be represented and visually compared at several timeline positions.
2. Render and review all three sizes with exact fonts, image placement and 8 second loop. Compare both audio tracks, HTML5 playback and native preview. Check video source frames when a design contains video.
3. Add proper audio mixing to the MP4 container render, with duration, volume, mute and loop handling. Verify the decoded MP4 has an audio stream and samples at the intended time. Remove the audio guard only after this passes.
4. Reconcile the Creative Suite Worker source with current main, add a Banner Studio launcher card and dock option pointing to the full-screen app route, build the Worker package, deploy the correct Worker target and verify the live link. Preserve PhotoFlow/VectorFlow MotorStack behavior and their browser storage.
5. Expose the existing guarded MotorStack catalog to Banner Studio through an authorized server integration and private asset delivery. Do not copy the Worker secret into frontend code or assume the two hosts share a session or secret.
6. Implement direct design URL import only after choosing and configuring the TheBrief API credential flow and a bounded conversion worker. Keep source HTML/JS out of the studio runtime. Do not create an API key from a signed-in browser merely to bypass this step.
7. Review a bounded set of recent TheBrief jobs and Monday handoffs with producers, then migrate supported designs as drafts with client ownership, deduplication and visual acceptance. Do not claim a full library migration from this one pilot.

## Release gate

This branch has not been merged, deployed or used to create a production JAC project. The source conversion hold, MP4 audio gap, absent Creative Suite host integration and absent MotorStack Pages credential are material blockers to claiming the requested transition complete. Fetch `origin/main` again before integration; run guarded Pages checks and verify the exact deployment source and live host.

Local verification: the focused Banner Studio and TheBrief suite passed 162 tests across 22 files. Nuxt typecheck still reports baseline repository errors, with no diagnostics in the changed files. The new full-screen routes and JAC audio have not been verified in a signed-in browser.
