# Render container qualification — 20 November 2026

Scope: the shared Video, Banner and Audio Studio `audio-jobs` Worker and
`audio-render` Container. This is separate from FilmFlow's browser/WASM editor,
AI model generation, customer projects, and new composer features.

## Findings and corrections

PR947 correctly moved three real-FFmpeg tests off the Ubuntu package mirror.
It did not prove that CI and production ran the same binary: pinning the Node
base does not freeze subsequent apt or npm downloads. Its tests also did not
start the packaged HTTP server or launch Chromium. The Pages deployment did
not update this standalone Worker/Container.

The new service acceptance script runs *inside* the built Linux amd64 image,
with no external network and no application source mounted over `/app`. It
checks readiness, real audio probing, corrupt/playlist rejection, normalization,
audio timeline and video composition, exact-copy acceptance/mismatch, Chromium
overlays, frame-seeked banner MP4 pixels, full output decoding, and recovery
after rejected inputs. It creates only disposable synthetic media.

CI runs that script alongside the three existing real-media tests. Its path
filter now includes shared contracts and verification scripts. All three
manual release paths depend on the media job, which runs on release dispatches
as well as main and relevant PRs.

Production configuration references the exact qualified registry digest in
`workers/audio-jobs/render-image.json`. The checked-in receipt records its
source context hash and prior image. `check-render-image.mjs` rejects another
target, account, mutable tag, changed context or mismatched configuration.
The package deploy command executes that check explicitly. This is a reviewed
qualification receipt, not a cryptographic test attestation.

## Qualification evidence

- Source at build: `8b6d8c04af144f56fed5e11d8eb69e0dbf7687ae`.
- Fresh Docker build: Linux amd64; FFmpeg `5.1.9-0+deb12u1`.
- Exact built/pushed image digest:
  `sha256:c6ddfd8e42e4f98a258517c0835e96eecace0ca2ca485ee23e48b2167caf0f7e`.
- Existing real-media suite: 13 passed, none skipped.
- Packaged HTTP service acceptance: passed, including actual Chromium output.
- Wider audio/banner/video and guard suite: 1,774 passed, one existing skip;
  a final guard case added afterward passed in its six-case focused run.
- Worker bundle dry-run passed before and after registry pinning.
- Independent source review: no blocking/high/medium findings.

CI rebuilds the Dockerfile as a source regression check. A future rebuild may
contain newer Debian packages. It is not evidence that those bytes equal the
currently pinned production image. Qualify each new image independently and
promote the exact tested digest; never deploy a fresh rebuild under an old receipt.

## Requalification and deployment

1. Start from current origin/main. Install the Worker's separate dependencies
   using its frozen lockfile. Preserve other worktrees and running jobs.
2. Build `workers/audio-jobs/container` for `linux/amd64`, record the immutable
   image ID and source revision, and run the real-media suite with ffmpeg and
   ffprobe routed into that image. Mount the same absolute temporary paths;
   on macOS set `TMPDIR=/tmp` or mount the actual OS temp directory too.
3. Run `scripts/verify-render-container.mjs` inside that same image as described
   in the script. Do not mount application source over `/app`.
4. Push the *already tested* image with `wrangler containers push TAG`. Resolve
   its Cloudflare registry digest. Update the configuration and receipt in one
   reviewed change; compute `contextSha256` with `renderContextHash`.
5. Require `node scripts/check-render-image.mjs`, the scoped tests, bundle
   dry-run and CI to pass. Before deploying, fetch and verify the release
   includes current main. Use `pnpm --dir workers/audio-jobs deploy` from the
   correct checkout. This is a standalone Worker deployment, not Pages.
6. Read back the active Worker version and Container image/rollout separately.
   Probe the private service using synthetic local media through a service
   binding. Do not create customer projects or generate billable AI content
   merely to obtain release evidence. Record receipts and outstanding gates.

Retain the previous image for rollback. A Worker upload alone does not prove
Container rollout: Cloudflare documents deployment as non-transactional. Check
both after failures. Do not replay customer jobs to test a release.

## Current production baseline and limits

Pre-change Cloudflare readback: `audio-render` application
`a037cecd-2a4a-4758-a915-205696996d7b`, version14, updated9November;
previous registry image is recorded in the receipt. Worker deployment history
and Container history differ and must not be conflated.

The pinned Containers SDK is0.3.7. Official source tracks in-flight requests
and refreshes activity on completion, so the30-second idle setting alone is
not evidence of a long-render shutdown defect. Real queue retry/capacity,
worst-case ten-minute renders, cancellation, customer exports and provider
generation acceptance are distinct from these bounded service checks.

## Official references checked

- [Cloudflare image management](https://developers.cloudflare.com/containers/guides/image-management/): push tested images and use digest references.
- [Cloudflare deployment guide](https://developers.cloudflare.com/containers/guides/deploy/): Worker/image deployment order, non-transactional rollout and separate verification.
- [Official Containers SDK source](https://github.com/cloudflare/containers/blob/main/src/lib/container.ts) and [changelog](https://github.com/cloudflare/containers/blob/main/CHANGELOG.md): in-flight activity and lifecycle fixes; source checked against locked0.3.7.
- [Cloudflare issue138](https://github.com/cloudflare/containers/issues/138): reported long-FFmpeg termination; an issue report is not proof this application has that failure.

The older `workers/audio-jobs/DEPLOYMENT.md` is historical June activation
context. Its workers.dev URL, pending producer instructions, instance/idle
settings and Dockerfile-at-deploy examples are not current release evidence.
