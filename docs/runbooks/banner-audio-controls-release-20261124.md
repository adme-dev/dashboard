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

- 17 real-FFmpeg tests, including the previous 13 and new trim/volume/fade output.
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

## Release ledger

Pending integration and production readback. No customer project or audio values
were changed by the local verification fixture.
