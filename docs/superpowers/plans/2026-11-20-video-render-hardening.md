# Video Render Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bound complete exports and show measured progress while retaining qualified picture/audio/copy output.
**Architecture:** Keep awaited queue dispatch, shared job/format deadlines and authoritative completion. Supervise owned container children and stream completed files; publish advisory stage counters through private execution-scoped status.
**Tech Stack:** Cloudflare Workers/Queues/R2, Node22 container, FFmpeg, Chromium, Nuxt UI4, Vitest.
**Spec:** `docs/superpowers/specs/2026-11-20-video-render-hardening-design.md`.

## Global Constraints
- Work on the active fresh-main research branch and preserve unrelated work.
- Render-work budget720000ms, per-format cap600000ms; cleanup/failure reserve180000ms.
- Optional execution headers and private status contract exactly as the spec.
- Poll interval2500ms/status request2000ms; retain32 status records/60seconds.
- Child termination grace5000ms; keep SIGTERM/SIGINT drain behavior.
- No new GPU/media-engine dependency, altered asset identity, copy override, or early queue ack.
- Container/Pages releases must use existing exact-image/source/target guards.

## Review Focus
- A multi-format job must not acquire a fresh full budget for every format.
- Aborted/hung child processes and late results must not survive as successful jobs.
- Stream failure must clean scratch and never publish a truncated MP4.
- Old/failed progress must not overwrite current/terminal state or cause a render failure.
- The graphics/footage clock, typography and audio must remain identical in native output.

### Task1: Container execution, file streaming and metrics (Astra High)
**Ownership:** workers/audio-jobs/container/server.mjs, overlayCapture.mjs, Dockerfile;
new focused .mjs execution/progress helpers; new container-specific tests. Do not edit Worker/UI files.
**Interfaces:** optional execution headers; GET/render-progress/<UUID>; counters exactly as spec.
- [x] Add failing tests for owned child timeout, bounded diagnostics, disconnect cleanup, streamed output failure/slow reader, status retention/counters and legacy requests.
- [x] Implement supervision and completed-file streaming; instrument actual capture and FFmpeg progress.
- [ ] Pass focused tests and packaged service acceptance with both drain signals.

### Task2: Shared Worker deadline and advisory progress (root)
**Ownership:** shared/video/renderExecution.ts; workers/audio-jobs/src/videoCompositeRender.ts,
videoCompositeContainer.ts, compositeOutputStream.ts, db.ts and index.ts; their tests.
**Interfaces:** renderOne receives job AbortSignal/deadline and advisory stage callback;
container protocol from Task1; keep format done/total and optional measured counters.
- [x] Write failing tests proving shared budget, input timeout, fallback remaining budget, late-result discard, advisory failures, nonce isolation and bounded polling teardown.
- [x] Pass the shared deadline through actual requests and cancel uploads safely; stop late publication and stale telemetry.
- [x] Verify existing source-pinning/publication/streaming/worker regression suites.

### Task3: Measured progress presentation (root)
**Ownership:** app/types/index.ts; app/utils/video/renderJobSummary.ts;
VideoStudioRenderStatusStrip.vue and focused tests; relevant feature/guide copy.
- [x] Add failing tests for measured capture/encode/upload labels and counters, legacy jobs, invalid counters and terminal status.
- [x] Render Nuxt UI progress with actual stage data; preserve format progress and explicit done state.
- [ ] Check desktop/mobile fit and navigation; do not touch forms unnecessarily.

### Task4: Qualification and guarded release
- [ ] Independent deep review; resolve material findings before commits.
- [ ] Full project CI plus real-media and packaged HTTP/Chromium tests without skips.
- [ ] Exact-image full sample with time/disk/memory, decoded frames, source PTS/zooms, narration/copy parity and cancellation probes.
- [ ] Fresh-main integration; guarded Pages deploy FIRST (optional attempt-token callback schema), then qualified Worker/container rollout and image/class readbacks.
- [ ] Authenticated one-format native export and stage/navigation acceptance; download actual MP4.
- [ ] Record receipts, retire owned delivered branches; preserve voice-only music limitation.

### Separately qualified next stage
Native Cloudflare Container API migration: preserve exported class/binding/image,
instance names, concurrent start/port readiness, in-flight lifecycle and outbound
asset behavior. Inventory audio/banner/probe/video users and qualify migration
independently. This is authorized follow-up, not part of the Task1 protocol change.


## Review evidence before image qualification

- 162 focused regression files / 1241 tests passed, including isolated native
  PostgreSQL fences, real workerd/R2 streaming, host process lifecycle and UI.
- Independent review found and fixed stale/tokenless attempt writes and ambiguous
  ordinary DB publication responses. A native PostgreSQL commit followed by an
  injected lost response retains bytes and reconciles done on retry.
- Container review fixed saturated status admission and stalled Puppeteer close.
- Same-attempt progress sequence prevents delayed earlier-format writes from replacing newer counters.
- Work deadline forbids late rendering from initiating publication. An atomic
  publication already issued before expiry can commit during the reserved
  reconciliation window; retain its bytes instead of pretending cancellation
  rolled back a remote transaction. This exception is explicit in the spec.
- Standalone Worker strict typecheck currently reports existing alias/missing-mjs
  declarations and legacy audio/banner typing errors; no newly introduced error
  remains. Baseline comparison and full build/CI remain release checks.
- No migrations required. Attempt ownership/counters use existing progress JSONB.

## Native follow-up: terminal deadline retry classification

The default three-format acceptance job started during the image rollout. Its
old-image attempt failed and retried; the new-image attempt completed portrait
but square uses the supported slower whole-artwork path. A separate portrait-only
job completed and downloaded byte-identical to the prior accepted native output.
Do not claim three-format throughput from that proof.

Review found no per-job cancellation API. Persisted deterministic deadline failures
were being revived by queue redelivery. The bounded correction acknowledges a
deadline only after successful output cleanup and fenced failure persistence;
failed persistence or publication uncertainty remains retryable. Authoritative
redelivery skips persisted deadline failures after verifying job identity. Manual
Retry creates a new job and explicit format selection. No global queue mutation,
synthetic completion or deletion of historical jobs is permitted.

Tests must cover actual queue ack/retry, stale/current native PostgreSQL failure
confirmation, uncertain persistence, cleanup failures, redelivery identity and
transport/publication retry preservation. The container image is unchanged.

## Delivery checkpoint

Tasks1–3 and the initial Task4 hardening release completed in PR955 with exact-image
qualification, full current-head CI, Pages-before-Worker rollout and native
portrait job5622ab1f-7591-4208-b6ec-4528ad53c1e8. Downloaded native bytes match the
prior accepted native output. Live measured capture/encoding/upload and QR Codes
leave/return checks passed. The task's terminal-deadline follow-up remains in PR956;
it changes Worker retry classification, not the qualified container. Native
Container API migration and general large/multi-format throughput remain separate.
