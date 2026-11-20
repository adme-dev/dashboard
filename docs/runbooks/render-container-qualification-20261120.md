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

## ReelMotion candidate investigation — picture timing rejected

The earlier service checks did not qualify a full portrait reel. The first
40.18-second native pilot on the previous image/one-CPU class timed out after
600 seconds without an output. Its editable drafts remain saved; it is failed
export evidence, not a successful native delivery.

The candidate pauses the authored clock before requiring decoded media, rejects
failed embedded video instead of encoding a blank success, and selects faster
lossless PNG compression. Decoded RGBA and partial alpha match the previous
compression mode. Packaged regression coverage now includes a running media
clock, visible embedded footage and corrupt-media rejection. The old image
returned HTTP 200 for that corrupt-media case; the candidate returns HTTP 500.

- Image source: `28eee42d5842f013141e7d445f3c1425dda2a1e2`.
- Rejected/pushed digest: `sha256:c5680bd2144f143d7daa8b8e4f5e78126ff136caea323dac3d41f32d50519b90`.
- Class: `standard-3` (two vCPUs, 8 GiB memory, 16 GB disk). The release guard
  matches both image and instance class to the qualification receipt.
- Exact-image real-media suite: 13 passed, none skipped. Packaged service,
  Chromium output, corrupt-input recovery and both shutdown-signal checks pass.
  The packaged service also passes under a two-CPU/8-GiB cap.
- Full real-sample composite: 540.953 seconds, 41,090,905 bytes, 1,206 H.264
  frames at 1080×1920/30 fps, AAC audio and 40.200 seconds. Full decode passes.
  This is local Linux AMD64 emulation on an ARM host, not Cloudflare timing.
  The Docker VM has about 7.65 GiB total memory; its observed peak during the
  render was about 3.32 GB. Captured PNGs occupied about 1.98 GB.

Subsequent picture comparison rejected this candidate. Against byte-identical
prepared footage, portions of the captured picture froze while graphics kept
advancing, lagging the authored source by up to 4.6 seconds. Decode and runtime
success are insufficient. The candidate was not deployed. Its receipt was rejected and retained privately;
subsequent candidates must qualify independently.

The class applies to the shared `RenderContainer`: audio, banner, probe and
video workloads, with the existing maximum of six instances. No AI model,
provider generation or customer delivery is enabled by this change. The
90-second ReelMotion package limit remains an input ceiling, not qualified
throughput. The sustainable optimization remains FFmpeg footage plus browser
graphics from the same saved artwork revision; see the corrected
[open-source references](../engagr-ai-media-studio-oss-prior-art.md).

The Worker deploy command now selects `./wrangler.toml` explicitly. A parent
Pages build leaves a generated Wrangler redirect that otherwise changes config
discovery. The guarded explicit-config dry-run passes with the intended Worker,
bindings and candidate image.

Required remaining acceptance: current-main integration, Worker and Container
class/image readbacks, one monitored native Reels export, and its downloaded
MP4 picture/audio checks. Retain the failed first job separately. The pilot is
voice-only; a licensed music bed and client approval are not established.

## Rejected replacement candidates — decoded frames and bounded encoding

The renderer now waits for visible video seeks to finish and have decoded current
data before each capture. The regression uses changing footage and non-monotonic
seeks; a completed JavaScript seek alone does not prove the pixels are ready.
The corrected decoder candidate `3969f064…` produced the intended source frames
at all 20 sampled times on four CPUs, but exceeded 600 seconds during encoding.
It was rejected and was not deployed.

The replacement image is `sha256:39b4e05a9214c2878eb383710d284ad3f8dc3e8c5b3610f606e8e2071c9bf4e0`,
built from `6976586472e5312c64865c7040f8b70f409c5ec8` with context hash
`911947afefa1e67546d2e095e41ffef97e1d05d840050836aac823f21533b0ce`.
It selects H.264 `veryfast` only for `reels_9x16` with captured overlays, retaining
the same bitrate and output dimensions. Other formats and plain Reels keep their
existing profile. A five-second crop comparison measured small SSIM differences;
this is a performance/quality trade, not pixel-identical H.264 output.

The exact final image passes all 13 real-media tests without skips, packaged
HTTP/Chromium acceptance, corrupt-media rejection/recovery, full synthetic output
decode and accepted audio/Chromium drain under both SIGTERM and SIGINT. Tests
used a four-CPU quota with a nominal 12-GiB cap; the local Docker VM itself has
about 7.65 GiB total memory. The configured `standard-4` class has four vCPUs,
12 GiB memory and 20 GB disk. This class applies to all shared RenderContainer
workloads, retaining the maximum of six instances.

At source review, the full 40.18-second benchmark and encoded picture comparison
are pending. The deployment guard rejects a pending receipt: both `qualified-full-sample`
status and the `full-40s-composite-and-picture-timing` check are required.
Core qualification alone does not admit release. Hold
merge until the complete sample returns within the unchanged 600-second deadline,
fully decodes and preserves footage timing and readable copy. Record the result
and any deployment/native acceptance readbacks in the associated release PR and
private job evidence. A local pass does not establish Cloudflare timing or a
successful native queued export.

The first final-image sample stopped partway through capture because Docker
Desktop reported an I/O error writing its local container metadata database;
it was not OOM-killed and returned no MP4. This is an incomplete run, not a
render-budget result. All eleven OCI manifest/config/layer objects were recovered
read-only and SHA-256 checked before restarting Desktop. The same original image
then inspected and ran successfully without rebuilding. The immutable registry
push resolved to the recorded `39b4e05…` digest. A replacement benchmark uses
external scratch storage; its timing/picture acceptance remains pending.

The recovered `39b4e05…` run subsequently reached the unchanged 600-second deadline
after 1,142 of 1,206 captured frames, before encoding. It returned no MP4 and its
receipt is rejected. A separate candidate is implementing the already documented
FFmpeg-footage/Chromium-graphics split, including this pilot's authored zoom curve.
See the bounded split design/plan; no successful native export is claimed.

## Split picture/audio clock correction

The first committed split (`6d09271…`, image`4156fef…`) returned the real MP4 in
167.518 seconds and fully decoded, but picture/audio acceptance rejected it:1,207
video frames instead of 1,206, approximately 67 ms early footage at 18/20 sampled
times, and malformed one-sample AAC packet durations after the first cut.

Frame inspection established Chromium PNG changes from RGBA to RGB24 and back at
opaque transitions. [FFmpeg documents](https://www.ffmpeg.org/ffmpeg.html#Advanced-options)
that input pixel-format changes reinitialize the filter graph, losing counters
and buffered frames. The correction normalizes captured composite PNGs to RGBA8
before decoding. Already-RGBA bytes pass through unchanged; RGB frames are
converted losslessly using pinned MIT `pngjs@7.0.0`. No hidden pixel is inserted
and automatic filter safety is not disabled. The [pngjs API](https://github.com/pngjs/pngjs)
provides explicit output color type and compression settings.

The packaged transparency-transition regression failed on 4156 and passed on the
preliminary correction: exact video frame count, continuous 1024-sample AAC
packets, decoded RGB/partial-alpha equality and retained original RGBA bytes.
Independent review cleared the change, committed as
`df615d09ffe2937282f4ecb6d0a878438db6ff97`. The replacement exact image and full
real-sample picture/audio acceptance remain pending. Neither local decode nor
these source regressions prove a native queued export.

## Qualified split candidate — release still gated

Qualified at **2026-11-20 04:20:04 UTC** from source
`df615d09ffe2937282f4ecb6d0a878438db6ff97`, context
`b01155cba066ee994f8f012521c4ec116a2c2b29b1ea67549e2777a03803c88c`:
image `sha256:de3be03d105a7f9ac918a1495a2f8686a08443e11c41a0f545ea80d85c54fbc6`.
The tested bytes are pushed to the account-scoped registry.

- Four-CPU real sample: 162.250 seconds, 40,674,651 bytes, 1,206 H.264 frames at
  1080×1920/30 fps and 40.200 seconds; AAC audio spans 40.180 seconds. Full
  decode passes; no anomalous one-sample AAC packets. Output SHA-256:
  `b50aa80c98e2f05d13bd1c9a4d0b394f40b42252580e651ceb50d9366f0f618b`.
- All 20 encoded source timestamps match. An ambiguous low-resolution estimate
  at six seconds was resolved independently at 540×960 over 283,204 unoccluded
  pixels.
- All 32 visible zoom controls retain authored crop and motion; the maximum
  fitted scale difference from the browser is 0.004. Occluded transition samples
  are retained separately and are not claimed as measurable footage controls.
- Four narration windows have a constant five-millisecond offset, with normalized
  correlations of 0.99507–0.99874. Title, caption, legal and contact crops remain
  readable.
- Exact-image media tests: 13 passed, none skipped. Focused tests: 53 passed.
  Packaged HTTP/Chromium, source-PTS/end-hold, RGB/RGBA transitions, corrupt-input
  recovery and accepted audio/Chromium drain pass under both SIGTERM and SIGINT.
- Observed container memory: 1,515,270,144 bytes. Captured PNGs: 235,048,618 bytes.
  This remains local Linux AMD64 emulation on ARM, with a four-CPU quota and
  requested 12-GiB cap within a 7.65-GiB Docker VM. It does not establish
  Cloudflare timing or a 90-second throughput guarantee.

The release guard admits only this matching image, context, class and complete
qualification receipt. Source CI, current-main integration, active Worker and
Container readbacks, guarded Pages deployment and actual native queued-export
acceptance are still required. Record final release IDs and readbacks in the
associated combined release PR and private job evidence. The original failed
native job remains historical evidence; the local MP4 does not establish native
success. The pilot remains voice-only and has not received client approval.

## Accepted native baseline and hardening candidate

The split candidate above was subsequently integrated in PR #953 and the
leave-and-return polling repair in PR #954. Production Pages deployment
`05ccc7a2-d203-407c-85be-02ab956be100` serves current main
`3f7a8e36489a836293e5d3f231b5a1a7333cf7a4`. The active audio-jobs Worker version
is `b8953df8-dd22-49cc-a446-ef521c70fd98`; Container version 16 uses the qualified
`de3be03…` image on standard-4. These are the accepted baseline, superseding the
historical pending gates above.

Two real portrait jobs completed through the authenticated native editor in
approximately 173 seconds. Their downloaded MP4s were byte-identical: 40,652,216
bytes, SHA-256 `58e2304741a5b9505d6bc6ccc2fbb0227c522258de1512d840125ba74fa74bb3`.
The first output passed complete decode, 1,206-frame picture timing, 20 source
PTS matches, 32 visible zoom controls, continuous AAC packets and four narration
windows with a constant five-millisecond offset. Returning from QR Codes resumed
polling and displayed the second completed export without refreshing. Historical
failed jobs remain preserved. The sample remains voice-only.

PR #955 now extends that accepted baseline with whole-job budgets, owned child
termination, completed-file streaming, measured progress, attempt fencing and
ordered advisory writes. Reviewed source `7715828edc602df049d0ba13e46b9ed0a772c769`
has 1,241 focused regressions passing plus the matching-token positive callback
check. Native PostgreSQL proves stale/tokenless writes cannot cross a claimed
attempt and delayed earlier-format progress cannot replace newer counters.
A committed UPDATE followed by an injected lost response preserves output bytes
and reconciles completion on retry. Independent source review has no material
blockers. Exact-image qualification and a fresh native export are still pending
for this new stage; the earlier native receipts do not prove it.

Pages must deploy before the new Worker/container because the new callback has
an optional attempt token that the old strict schema rejects. Render work may
not initiate publication after its twelve-minute deadline. An atomic publication
already issued before expiry can still commit during the reserved reconciliation
window; preserve potentially committed bytes and reconcile on retry.

### Hardening image qualified locally

The reviewed source produced immutable Linux amd64 image
`sha256:e345af76da37aca367e1a2f7428dd47bf1160719f3e8465227d0a5df8cecf6ca`,
context `f30ced9f4c160590e1445b79816cfa6097419cbb94965130a0b1be557686b12a`.
The same image passed 13 real-media tests without skips and packaged HTTP,
Chromium, decode/recovery and accepted-request drain under SIGTERM and SIGINT.
Real Chromium deadline and disconnect tests each left zero Chromium processes
and zero scratch directories; a subsequent encode succeeded.

The full portrait sample completed in 161.685 seconds with measured capturing,
encoding and streaming stages. Its 40,674,651 output bytes and SHA-256
`b50aa80c98e2f05d13bd1c9a4d0b394f40b42252580e651ceb50d9366f0f618b`
exactly match the previous qualified local sample. Full decode, 1,206 frames,
source PTS, 32 zoom controls, four narration windows and copy crops passed.
Observed peak cgroup memory was 1,503,023,104 bytes and captured PNGs occupied
235,048,618 bytes. This is local emulation with four CPUs and the existing
standard-4 resource envelope, not native Cloudflare timing. Full CI, production
rollout/readbacks and a new native export remain pending for this stage.

### Hardening production and native acceptance

PR #955 merged as `66a06ab2d7af12acc5f92de3173067fcfbadff23`.
Current-head CI run `44694529273` passed: the broad suite had 24,140 passing
and 4,446 skipped tests, alongside the explicit native PostgreSQL and 13
real-media checks. Pages deployed first as
`eb7ba97b-463f-4f2e-a33f-68d65535b10a`. Worker
`669e9026-173f-426b-aae4-bb3ed6b0de78` then rolled out the qualified image.
Application `audio-render` reached version 17; rollout
`105c87b6-dd49-49b2-a961-3e9846a872a4` reported completed with all five existing
instances at the target version. The four-CPU standard-4 class was preserved.

Native portrait-only job `5622ab1f-7591-4208-b6ec-4528ad53c1e8` completed in
139.7 seconds from creation to publication. Its actual downloaded MP4 fully
decodes, contains 1,206 frames and exactly matches the previous accepted native
SHA-256 `58e2304741a5b9505d6bc6ccc2fbb0227c522258de1512d840125ba74fa74bb3`
(40,652,216 bytes). Byte equality preserves the previous picture, crop, narration
and copy acceptance. Live capture and encoding counters, actual upload-byte
counters and QR Codes leave/return polling were observed. This supersedes the
pending native gate for the hardening image above. The pilot remains voice-only.

The editor's default three-format button also queued QA job
`33db9756-a95b-4d4b-9b82-734063741bc5` during rollout. Its old-image attempt
failed; a new-image retry completed portrait and entered the slower whole-artwork
square path. Preserve this stress history; it does not qualify square/landscape
throughput or establish a bounded cause for every transient failure. A separate
Worker correction in PR #956 stops automatic redelivery of a confirmed persisted
deadline, while keeping transport and publication uncertainty retryable. Its
review and focused native PostgreSQL/queue tests passed; its release is tracked
separately from the accepted #955 portrait result.
