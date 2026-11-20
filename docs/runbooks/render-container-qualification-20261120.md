# Render container qualification — 20 November 2026

Scope: the shared Video, Banner and Audio Studio `audio-jobs` Worker and
`audio-render` Container. This is separate from FilmFlow's browser/WASM editor,
AI model generation, customer projects, and new composer features.

## Findings and corrections

PR #947 correctly moved three real-FFmpeg tests off the Ubuntu package mirror.
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

The added rollout test exposed a real defect: SIGTERM immediately terminated
an accepted HTTP render request (ECONNRESET). The server now closes its listener
and lets accepted requests, child processes and temporary-file cleanup finish.
The original image failed the test; the repaired image completes the request
and exits cleanly. Independent review then found Puppeteer's own signal
handlers still closed Chromium. The regression was reproduced with Chromium
actively rendering. All three launch sites now defer SIGTERM/SIGINT to the
server. Both signal cases pass with concurrent accepted audio and Chromium
jobs. Cloudflare retains its platform termination deadline.

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

- Source at build: `525a7d9942e0f24a70e98b536442d1f198221d40`.
- Fresh Docker build: Linux amd64; FFmpeg `5.1.9-0+deb12u1`.
- Exact built/pushed image digest:
  `sha256:2cdb9b603af1c4b01afcd20eaff09d74b4d607b7db213916ddb61bc21a4597e6`.
- Existing real-media suite: 13 passed, none skipped.
- Packaged HTTP service acceptance: passed, including actual Chromium output
  and accepted audio/Chromium completion after SIGTERM and SIGINT.
- Final wider audio/banner/video and release-guard suite: 1,779 passed, one
  existing skip (two workers). A preceding highly parallel run hit a five-second
  timeout in one brand-kit reference test; its focused rerun and the final
  bounded suite passed. The real-media tests were run separately against the image.
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
   includes current main. Use `pnpm --dir workers/audio-jobs run deploy` from the
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
`a037cecd-2a4a-4758-a915-205696996d7b`, version 14, updated 9 November;
previous registry image is recorded in the receipt. The active Worker baseline
was `dee29c29-ef86-459b-a349-09f2185d0e78`, deployment
`a76e6a3a-5b63-4358-9a78-d2f3a953b4ba`. Its private exact-copy measurement
endpoint returned 200 with zero findings through a local authenticated remote
service binding. No queue/customer job or R2 object was created. Worker deployment history
and Container history differ and must not be conflated.

The pinned Containers SDK is 0.3.7. Official source tracks in-flight requests
and refreshes activity on completion, so the 30-second idle setting alone is
not evidence of a long-render shutdown defect. Real queue retry/capacity,
worst-case ten-minute renders, cancellation, customer exports and provider
generation acceptance are distinct from these bounded service checks.

## Official references checked

- [Cloudflare image management](https://developers.cloudflare.com/containers/guides/image-management/): push tested images and use digest references.
- [Cloudflare rollouts](https://developers.cloudflare.com/containers/configuration/rollouts/): SIGTERM, draining and separate rollout status.
- [Cloudflare deployment guide](https://developers.cloudflare.com/containers/guides/deploy/): Worker/image deployment order, non-transactional rollout and separate verification.
- [Official Containers SDK source](https://github.com/cloudflare/containers/blob/main/src/lib/container.ts) and [changelog](https://github.com/cloudflare/containers/blob/main/CHANGELOG.md): in-flight activity and lifecycle fixes; source checked against locked 0.3.7.
- [Cloudflare issue 138](https://github.com/cloudflare/containers/issues/138): reported long-FFmpeg termination; an issue report is not proof this application has that failure.

The older `workers/audio-jobs/DEPLOYMENT.md` is historical June activation
context. Its workers.dev URL, pending producer instructions, instance/idle
settings and Dockerfile-at-deploy examples are not current release evidence.


## Release and operator follow-up

PR #949 merged as `007d15a793b5770ae4991dc67740138b802140e7` after full
[CI 44634537694](https://github.com/adme-dev/dashboard/actions/runs/44634537694)
passed. The broad CI pool reported 24,040 passed/4,440 skipped, plus the separate
70-test serial gate and named database/social/deployment gates. The media job
passed all 13 real-media tests and packaged-service acceptance for both signals.

Use **`pnpm --dir workers/audio-jobs run deploy`**. `pnpm deploy` selects pnpm's
built-in workspace deployment command, even when the package defines a deploy
script; the missing `run` stopped the first release invocation before any
provider change.

Wrangler 4.156 then encountered Cloudflare error 100146 reading a just-uploaded
Worker version. Production readbacks were reconciled after failures: the
uploaded version eventually became visible and active while the Container
still referenced its old image. Do not infer rollback or successful image
promotion from a failed CLI command.

The installed CLI has five read-back attempts 500 ms apart. A session-only
workaround widened those existing waits to 20 seconds, retaining its error 100146
filter and exact uploaded version ID. A one-off probe confirmed unrelated
waits were unchanged. No installed dependency or application source was
patched. The bounded lookup succeeded on the final attempt and the same
qualified image was applied; it did not rebuild or change the image.
This follows the diagnosis in
[Cloudflare workers-sdk #16717](https://github.com/cloudflare/workers-sdk/issues/16717),
which remains an upstream deployment-tool limitation rather than a renderer
failure. For future occurrences, first read back both live targets and the
specific uploaded version, then use a bounded read-back recovery; avoid blind
re-upload loops. Reconcile future Wrangler fixes before changing the toolchain.

The active Worker readback is 100% `d6492140-33ba-41d6-886c-78a02729429d`,
deployment `72d89080-54cf-41a9-99de-d7b3ac1f3474`. Binding destinations,
secret declarations, migration tag, compatibility date/flags and usage model
match the baseline. Newer Wrangler also explicitly records the existing
`audio-render` container name in Worker metadata.
Container rollout and post-deploy private probe are recorded separately below.

Post-deployment readback confirms Container application version 15 with the
qualified `2cdb9b6…` image and no health errors or failed instances. The private
exact-copy endpoint returned HTTP 200 with `{ "findings": [] }` through a freshly
started authenticated service-binding proxy. The last capacity sample had
four healthy instances and one spare still starting; image selection/live
endpoint acceptance is established separately from every spare becoming warm.
No customer project, queue job, R2 object or AI generation was created.
