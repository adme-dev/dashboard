# BannerStudio audio controls — 24 November 2026

## Change and validation

Audio layers open an audio-specific inspector with live volume, mute, selected-clip
looping, source trimming, replacement, and adjustable fade-in/out. The waveform
selection can be resized or moved without changing timeline placement. Volume,
mute, loop and fades honor linked-layout scope; source trim stays local to the
layout. Layer and collaboration locks protect edits. Brand kit is the second tab
in Tools & resources, immediately beside Insert.

The playback fix reads the current layer settings on every audio update rather
than retaining the volume captured when playback began. Undo can replace the
board without leaving the player attached to stale settings. Editor playback
and saved HTML share the source/fade clock. The renderer accepts both the legacy
v1 audio manifest and the v2 source-trim/fade fields. No database migration is needed.

Validation on Node 24.18.0: 918 tests passed, one optional test skipped across 134
files, including BannerStudio, QR Codes and deployment checks. Follow-up lock and
video-control checks passed. New and changed audio components/helpers pass lint.
Actual Nuxt UI controls were exercised locally with disposable generated audio:
volume changed from 25% to 24% during uninterrupted playback; precise and dragged
trim selections applied correctly, and Cancel preserved the prior source range.

## Exact image qualification

[Native qualification run 45331230773](https://github.com/adme-dev/dashboard/actions/runs/45331230773)
passed from source `9a94075f929ab3c19cdae2d227cb0c68dd709f07`. The native Ubuntu
amd64 job used the exact archived Docker image for all checks, with no application
source mounted over its packaged `/app`:

- 17 media and clock/contract tests, including the previous 13 and new real
  FFmpeg trim/volume/fade output.
- Packaged HTTP, Chromium, corrupt-input recovery, full decoding and accepted
  audio/Chromium completion under both SIGTERM and SIGINT.
- A synthetic 40.18-second portrait composite at 1080×1920/30 fps: 1,206 frames,
  complete decode, changing source colors, authored zoom, measured readable copy,
  and three audio onsets each offset by five milliseconds. It finished in
  117,945 ms with a four-CPU/12-GiB container cap. The 306,470-byte output SHA-256
  is `08dc8a98c7b6c1045bb9794b1e1aface3f8091e7be1ca378c788da99d7ecffc6`.

The archived full-sample JSON inherited an obsolete emulation environment label;
the run itself used GitHub's native Ubuntu amd64 runner. That label is corrected
in the checked-in qualification receipt and the verifier now reports its actual
platform/architecture. This synthetic benchmark is distinct from the historical
customer portrait export acceptance recorded in the 20 November runbook.

The temporary qualification workflow is removed after its successful run. Its
artifact is downloaded and hash-checked, then the already-tested image is loaded
and promoted without rebuilding. The previous immutable image is retained for
rollback. Worker and Container rollout evidence is recorded separately from Pages.

Qualified and promoted image: `sha256:9506a1196579d35fc37daae78ee25d0c4f0bcf8a09333a10b0d3db45dc66ec34`.
Container context: `2ba43829fb4e256f20e2497a92ba69961059c4e9ff473a2a723c11f86fec0937`.
Downloaded image archive: `b4a0939d7d7bd713a01a60f54ae51ecad14f474514f8ab129e11c30575ac3ea5`.
The loaded image ID matches the native-run provenance. Registry push reports the
same immutable digest pinned in both Worker configuration and `render-image.json`.

## Release ledger — live

- [PR #992](https://github.com/adme-dev/dashboard/pull/992) merged as
  `283e3bfb7feb649fb96401ea096b6c4151c6454f`.
- [Current-head CI 45333151534](https://github.com/adme-dev/dashboard/actions/runs/45333151534)
  passed both media-render and the dashboard job, including the production build,
  database gates and full suite (24,506 passed, 4,445 existing skips).
- Main advanced to `a438fdfcf` during CI. A local combined candidate included its
  navigation and erase-tool fixes and passed 964 focused tests (one optional
  skip). The merged source's complete Git tree exactly matched that tested
  candidate: `f500bce9501c34daf35d461bbd3a5f91327f52aa`.
- Guarded production Pages deployment:
  `17b1d0b9-a4b9-4890-a0d9-a070f946937f`, `agency-dashboard/main`,
  <https://17b1d0b9.agency-dashboard-6cm.pages.dev>. Provider metadata confirms
  the exact merged commit, production environment, successful deployment and clean
  source. Runtime and size guards passed: 15,367,288 bytes raw / 5,334,027 gzip.
- Worker deployed first: version `18ea1e1b-843d-4015-94c8-ce95b4813fe2`,
  100% deployment `4eef565a-fb80-42bf-9d74-ad72fa5b7b0d`.
- Container application `a037cecd-2a4a-4758-a915-205696996d7b` reached version 18
  with the qualified `9506a119…` image. Rollout
  `39ad2762-7942-49bf-8b92-b10209333d4a` reported completed, 5/5 instances updated,
  without health errors. The existing four-CPU/12-GiB class and maximum six
  instances were preserved. Initial readbacks still showed version 17 while
  rollout progressed; no blind re-upload was used.
- After rollout, the private exact-copy Chromium endpoint returned HTTP 200 with
  `{"findings":[]}` through an authenticated local service binding. No customer
  project, queued export, R2 object or AI generation was created. The temporary
  probe and local UI fixture servers were stopped, and fixture symlinks removed.
- Final requested audio battle check on merged source: 42 passed, no skips,
  including real AAC trim/loop/quarter-volume/fade output, live gain/Undo, saved
  HTML clocks, locks, cancellation, waveform bounds and image admission.
- Live browser checks on `app.xeroflow.io`: selecting Audio 40 opened only Audio
  controls; volume, mute, clip loop and fades were available. Trim loaded a real
  waveform, accepted 1–5 seconds, moved it by keyboard to 2–6, and played the
  preview. Cancel retained the saved 0–8-second source range and all media paused.
  Brand kit was immediately beside Insert and opened the existing brand library.
  QR Codes retained 23 codes and 165 scans. The project remained Saved; no customer
  audio values were changed. Local synthetic checks separately exercised live
  volume changes and applying a source trim.
- The completed remote and local `fix/banner-audio-controls` branches were
  retired after verifying the remote had no new work and the local tree exactly
  equalled the merged release. No unrelated branch or worktree was removed.
