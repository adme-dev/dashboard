# Video platform rendering R&D — 20 November 2026

Status: source review complete; hardening recommendations are not implemented by
this document. XeroFlow baseline: `3f7a8e36489a836293e5d3f231b5a1a7333cf7a4`.

## Decision

Retain XeroFlow's qualified FFmpeg-footage/Chromium-graphics export path. The
closest batch-export reference is HeyGen's HyperFrames Cloudflare template.
Cloudflare Streamline contributes process supervision, session identity and
live-preview patterns. Freefield contributes generation-workflow and job-status
patterns. Neither supplies a replacement for XeroFlow's editable, client-scoped
ReelMotion contract.

The next engineering work should address whole-job budgets and process cleanup,
then output streaming and honest stage progress. A browser-export rewrite or a
GPU deployment is not a prerequisite for those improvements.

## Method and scope

Seven public repositories were downloaded at the exact revisions below. Review
covered the listed implementation files and root licence texts, with current
Cloudflare documentation checked separately. Search snippets were discovery
material only. No upstream application, dependency installer, GPU workflow or
benchmark was executed. Upstream performance claims remain unverified here.

| Repository | Reviewed revision | Root licence | Source inspected and relevance |
|---|---|---|---|
| Cloudflare Containers SDK | `a17055ca4f64b8f7fea6dfaa62dfb2c06a954a2b` | MIT / Apache-2.0 | [README][sdk-readme] and [lifecycle implementation][sdk]. Existing helper behavior; see the documentation change below. |
| Cloudflare Streamline | `0b101163d0febf6af405b99de6eae680601b5e7e` | Apache-2.0 | [FFmpeg supervisor][streamline-process], [session coordinator][streamline-session], [bounded request reader][streamline-body] and [output relay][streamline-output]. |
| Cloudflare Streamline Demo | `bc059dc6c872cbf15b4c2111aee47c2f30a4c356` | Apache-2.0 | [Principal handling][demo-auth] and [container routing][demo-routing]. Application policy remains outside the media engine. |
| HeyGen HyperFrames Cloudflare template | `c6dae931fd6c247a870c2a8a0f37eee52da14092` | Apache-2.0 | [Container server][hyperframes-server], [Worker render route][hyperframes-worker] and [instance configuration][hyperframes-config]. Closest completed-MP4 topology. |
| Freefield | `e29b7c913149efe7739d19d3b1c608e32e27e6d7` | MIT | [Workflow runner][freefield-runner] and [job history][freefield-history]. Community Higgsfield-style implementation; not Higgsfield's proprietary backend. |
| Rough Cut | `f23db3fecec05b6ad735868c94f0ba68b50ec8b8` | MIT | [Browser export][rough-export], [frame selection][rough-frames] and [versioned commands][rough-commands]. Current source differs from older cloud-render descriptions. |
| Video Tools | `6d1b5983477bd496bf0e58df14ea89239ec9f7f7` | MIT | [Job/progress runner][videotools-jobs], [proxy/render arguments][videotools-ffmpeg] and [grading implementation][videotools-grade]. Server-side originals, lightweight editing proxies. |

Root licences describe these repositories, not blanket rights to every model,
font, music asset, codec build or dependency. No upstream code or media was
vendored in this review.

## What the implementations actually do

### Cloudflare: live sessions and the current API direction

Streamline runs FFmpeg in a Go container and coordinates a live session through
a Worker/Durable Object package. It produces fragmented-MP4 preview or RTMPS
output. Its control flow fences stale process callbacks by session identity;
FFmpeg progress is parsed as structured fields, and output buffering has explicit
limits. Those are useful patterns for a future render-attempt supervisor. Its
live ingest and preview relay do not implement an editable ReelMotion timeline
or a finished MP4 delivery workflow. See [the session contract][streamline-contract].

The Demo validates application identity and replaces caller-provided principal
headers. XeroFlow must retain its own tenant/client/project permissions and
approved-copy authority; the Demo's owner/playground policies are not agency RBAC.

**New documentation finding:** Cloudflare's [migration guide][native-migration],
updated 9 November 2026, calls `@cloudflare/containers` deprecated and directs
applications toward `this.ctx.container` in a Durable Object. The pinned SDK
README still shows installation and helper examples. The older README alone is
therefore insufficient evidence for the current recommended API.

Plan this migration separately from rendering changes. Preserve the Worker name,
exported class, binding, image and migration history, and retain every existing
instance-name convention. Reimplement port readiness, shared concurrent startup,
in-flight lifecycle handling and inactivity policy. Internet access defaults
differ: preserve the required asset-loading behavior explicitly. Do not add a new
Durable Object migration merely because the TypeScript base class changes.
Cloudflare also documents [explicit instance routing][scaling]; routing,
application admission and queue retries are separate responsibilities.

### HyperFrames: a directly comparable batch exporter

The template renders an HTML composition to a temporary MP4. A ten-minute child
deadline sends SIGTERM, followed by SIGKILL after a five-second grace period.
After encoding completes, the server reads the file size and streams the file;
the Worker writes the response body to R2. Its configuration selects
`standard-4`.

Use this as a reference for completed-file streaming and bounded child lifetime.
Do not describe it as encoding directly into R2 or as a 202/callback system. Its
example buffers the incoming composition and accumulates renderer stderr, so it
is not a complete resource-control policy to copy unchanged.

### Freefield: generation and status semantics

Freefield derives generation inputs from per-app manifests, prepares GPU memory
when the model set changes, and submits ComfyUI workflows. Its runner reads
progress events with reconnection handling; history retains a separate terminal
job state. The source documents an upstream progress stream that can initially
report 100%, which is a useful reason not to equate a progress fraction with
successful output publication.

Apply the manifest/status separation to future AI shot generation. Keep it
separate from deterministic export of supplied dealer footage. This review does
not establish how Higgsfield's private infrastructure works.

### Rough Cut: one composition and explicit export failure handling

At the reviewed revision, normal export uses Mediabunny/WebCodecs in a browser
worker; the README identifies the Container-rendering path as disabled. Older
search descriptions calling FFmpeg its normal exporter are stale.

The inspected exporter uses a fixed frame clock, bounded output chunks, AAC
timing correction and cancellation through final file commit. Frame selection
accounts for adjacent decoded timestamps and exclusive trim ends. Its edit
commands require a project version. These are useful parity and recovery
references; adopting its browser exporter would require separate codec, font,
GSAP, device-memory and output-ownership qualification in XeroFlow.

### Video Tools: proxies and measured encoding progress

The source creates a short-GOP editing proxy and separate preview audio, while
retaining original media for final encoding. Its FFmpeg runner reads machine
progress and derives fraction, speed and ETA. Its grading path evaluates a
combined LUT rather than repeatedly applying independent grading passes.

Proxies and reusable analysis artifacts are useful for larger uploads. They do
not solve XeroFlow's current Worker-side base64 transport of original inputs;
that transfer needs a separate bounded design before raising input limits.

## XeroFlow source comparison

These observations describe the reviewed source, not hypothetical failures of
the already accepted portrait sample.

| Area | Existing behavior | R&D finding |
|---|---|---|
| Frame correctness | [Frame runtime][xf-frame] waits for decoded media; [capture][xf-capture] normalizes PNG pixel format. | Retain. The source-clock and RGB/RGBA defects already have fixes and qualification. |
| Export plan | [Container caller][xf-caller] verifies managed source ETag/size and permits one eligible fallback on the same request deadline. | Retain immutable source identity and same-revision graphics. A new renderer must not silently substitute media. |
| Whole-job time | [Job runner][xf-job] renders formats sequentially; [caller][xf-caller] creates a fresh 600-second signal per format. [Defaults][xf-formats] include three formats. | Three maximum-length calls can require 1,800 seconds before input/storage overhead. [Queue consumers have a 900-second wall limit][queue-limits]. There is no shared job deadline in this orchestration. The arithmetic is a source-backed capacity gap, not an observed failure of the single-format pilot. |
| Child lifetime | [Server][xf-server] spawns FFmpeg and accumulates stderr without its own process deadline; capture has individual readiness timeouts. SIGTERM/SIGINT drain accepted requests. | A Worker fetch timeout does not itself implement a container-side child kill/cleanup policy. Add and test explicit supervision; retain rollout draining. |
| Input memory | [Caller][xf-caller] reads inputs into arrays/base64; [server][xf-server] buffers the request. Storyboard inputs and the eligible ReelMotion source have existing bounds. | Do not remove those bounds to accept large clips. Audit aggregate limits for legacy/composite paths and design authenticated streaming input separately. |
| Output memory | [Server][xf-server] reads the completed MP4 using `readFileSync`. [Worker upload][xf-output] already uses a known-length stream with cancellation and a 512-MiB output ceiling. | The remaining whole-MP4 buffer is inside the container. Stream the completed file from disk; retain the Worker's validated-length upload. |
| Progress | [Job runner][xf-job] reports stage and completed format count. [Capture][xf-capture] knows frame count; FFmpeg progress is not exposed to that job contract. | A single long format can legitimately show 0 of 1 until complete. Expose capture, encode and storage stages with measured counters. |
| Navigation | [Editor][xf-editor] now resumes active-job polling after refresh and stops after terminal status/unmount. | Completed in #954; do not reopen as missing work. Stage telemetry is a separate improvement. |
| SDK | [Worker][xf-worker] extends `Container` and uses SDK helpers. | Working qualified behavior remains evidence. Plan native-API migration against the current guide rather than treating the old SDK README as the long-term recommendation. |

## Ordered engineering follow-up

Owner for the following work: Video Studio/renderer engineering. These items are
proposed implementation work, not claims of completed functionality.

1. **Whole-job budget and container supervision.** Choose a shared deadline
   comfortably below the queue wall limit, including loading, storage, callbacks
   and cleanup, or move per-format work into independently bounded work units.
   Test multiple slow formats, hung FFmpeg, hung capture, consumer disconnect and
   SIGTERM/SIGINT. Require child exit and temporary-file cleanup, preserve normal
   rollout draining, and reject stale completion/progress from an earlier attempt.
   Do not acknowledge a queue message early unless durable dispatch, retries and
   authenticated completion have been designed and tested.
2. **Stream completed composite outputs.** Replace the container's whole-file
   read with an awaited file-to-response stream and known content length. Remove
   the temporary directory only after finish/error/close handling settles. Test
   slow consumers, interrupted bodies, failed R2 writes, cleanup and measured
   memory on the same image/class. This saves an output-sized buffer; it does not
   remove capture PNG disk usage or guarantee faster encoding.
3. **Measured progress.** Report capture frames, FFmpeg output time and upload
   stage at a bounded cadence. Keep telemetry content-free and advisory. Reset
   counters per stage/format/attempt; publish `done` only after complete storage
   and authoritative job completion. Test regressing/early-100% events and
   reopening during every stage. ETA must remain an estimate.
4. **Native Cloudflare API migration.** Inventory all audio, banner, probe and
   composite call sites sharing the Container. Preserve their existing names and
   readiness/activity behavior; compare old/new lifecycle under concurrency and
   failures. Qualify and release this independently, with exact image/Worker
   readbacks and a rollback record. A media-library dependency swap does not
   perform this migration.
5. **Larger media and preview parity.** Define original/proxy/analysis identities
   and a shared composition contract before raising limits. Keep source PTS,
   trim bounds, aspect/crop, font metrics, legal copy and audio clock in parity
   tests across portrait/square/landscape. Browser export is a later capability
   assessment, not an automatic fallback that silently uploads or rerenders.

## Completed release evidence and limits

Release [#953](https://github.com/adme-dev/dashboard/pull/953) records the qualified
image, source-clock repair and editable footage/graphics split. Release
[#954](https://github.com/adme-dev/dashboard/pull/954) records live leave-and-return
polling acceptance. Two actual portrait exports of the same 40.18-second project
completed in approximately 173 seconds and produced identical bytes. The first
output passed full decode, source-time/zoom checks, narration alignment and
full-resolution copy review. These receipts are not new benchmarks of the
upstream projects reviewed here.

That evidence is for one voice-only prepared portrait project. It does not prove
licensed-music delivery, all three formats at their maximum duration, large-input
support, general preview/export parity or a 90-second rendering SLA. Preserve the
existing completion; the engineering follow-up above extends its tested scope.

See [the prepared-package guide](../guides/reelmotion-prepared-packages.md),
[container qualification](../runbooks/render-container-qualification-20261120.md)
and [the broader prior-art inventory](../engagr-ai-media-studio-oss-prior-art.md).

[sdk]: https://github.com/cloudflare/containers/blob/a17055ca4f64b8f7fea6dfaa62dfb2c06a954a2b/src/lib/container.ts
[sdk-readme]: https://github.com/cloudflare/containers/blob/a17055ca4f64b8f7fea6dfaa62dfb2c06a954a2b/README.md
[streamline-process]: https://github.com/cloudflare/streamline/blob/0b101163d0febf6af405b99de6eae680601b5e7e/container/http_ffmpeg.go
[streamline-session]: https://github.com/cloudflare/streamline/blob/0b101163d0febf6af405b99de6eae680601b5e7e/packages/cloudflare/src/session-do.ts
[streamline-body]: https://github.com/cloudflare/streamline/blob/0b101163d0febf6af405b99de6eae680601b5e7e/packages/cloudflare/src/request-body.ts
[streamline-output]: https://github.com/cloudflare/streamline/blob/0b101163d0febf6af405b99de6eae680601b5e7e/container/http_output.go
[streamline-contract]: https://github.com/cloudflare/streamline/blob/0b101163d0febf6af405b99de6eae680601b5e7e/docs/SESSION_API_CONTRACT.md
[demo-auth]: https://github.com/cloudflare/streamline-demo/blob/bc059dc6c872cbf15b4c2111aee47c2f30a4c356/src/lib/access-auth.ts
[demo-routing]: https://github.com/cloudflare/streamline-demo/blob/bc059dc6c872cbf15b4c2111aee47c2f30a4c356/src/lib/container-proxy.ts
[hyperframes-server]: https://github.com/heygen-com/hyperframes-cloudflare-template/blob/c6dae931fd6c247a870c2a8a0f37eee52da14092/container/server.mjs
[hyperframes-worker]: https://github.com/heygen-com/hyperframes-cloudflare-template/blob/c6dae931fd6c247a870c2a8a0f37eee52da14092/src/routes/api/render.ts
[hyperframes-config]: https://github.com/heygen-com/hyperframes-cloudflare-template/blob/c6dae931fd6c247a870c2a8a0f37eee52da14092/wrangler.jsonc
[freefield-runner]: https://github.com/neuregex/freefield/blob/e29b7c913149efe7739d19d3b1c608e32e27e6d7/server/runner.ts
[freefield-history]: https://github.com/neuregex/freefield/blob/e29b7c913149efe7739d19d3b1c608e32e27e6d7/server/history.ts
[rough-export]: https://github.com/awesamarth/rough-cut/blob/f23db3fecec05b6ad735868c94f0ba68b50ec8b8/src/lib/browser-export.ts
[rough-frames]: https://github.com/awesamarth/rough-cut/blob/f23db3fecec05b6ad735868c94f0ba68b50ec8b8/src/lib/video-frame-selection.ts
[rough-commands]: https://github.com/awesamarth/rough-cut/blob/f23db3fecec05b6ad735868c94f0ba68b50ec8b8/src/lib/editor.ts
[videotools-jobs]: https://github.com/David-Raffo/Videotools/blob/6d1b5983477bd496bf0e58df14ea89239ec9f7f7/app/main.py
[videotools-ffmpeg]: https://github.com/David-Raffo/Videotools/blob/6d1b5983477bd496bf0e58df14ea89239ec9f7f7/app/ff.py
[videotools-grade]: https://github.com/David-Raffo/Videotools/blob/6d1b5983477bd496bf0e58df14ea89239ec9f7f7/app/grade.py
[native-migration]: https://developers.cloudflare.com/containers/guides/migrate-to-durable-object-container-api/
[scaling]: https://developers.cloudflare.com/containers/configuration/scaling-and-routing/
[queue-limits]: https://developers.cloudflare.com/queues/platform/limits/
[xf-frame]: ../../workers/audio-jobs/container/frameRuntime.mjs
[xf-capture]: ../../workers/audio-jobs/container/overlayCapture.mjs
[xf-caller]: ../../workers/audio-jobs/src/videoCompositeContainer.ts
[xf-job]: ../../workers/audio-jobs/src/videoCompositeRender.ts
[xf-server]: ../../workers/audio-jobs/container/server.mjs
[xf-output]: ../../workers/audio-jobs/src/compositeOutputStream.ts
[xf-formats]: ../../app/utils/video/renderFormats.ts
[xf-editor]: ../../app/composables/useMediaProjectEditor.ts
[xf-worker]: ../../workers/audio-jobs/src/index.ts
