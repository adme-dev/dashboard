# Hyperframes Render Runtime Rollout And Upgrade

**Date:** 2026-06-25
**Status:** Preview app and audio render runtime deployed
**Related PRD:** `docs/specs/2026-06-25-hyperframes-render-runtime-prd.md`
**Implementation plan:** `docs/superpowers/plans/2026-06-25-hyperframes-render-runtime.md`

## Scope

Roll out the first Hyperframes-inspired render runtime slice for Banner Studio MP4 export and Video Studio Banner overlay rendering.

Included:

- Banner HTML runtime contract via `window.__engagrFrame`.
- Legacy GSAP fallback in container capture.
- Banner render linting before MP4 enqueue.
- Banner Studio export failure toast for blocking lint findings.
- Video Studio Banner overlay linting before render enqueue.
- Browser capture diagnostics and render failure categorization.
- Video Studio render failure labels.

Not included:

- BeginFrame capture.
- Static-frame deduplication.
- Palmier-inspired Video Studio agent-control tools.
- Database schema changes.
- External Hyperframes or Palmier dependencies.

## Deployment Units

Deploy these together:

- Nuxt app / Pages bundle.
- `audio-jobs` worker.
- Render container image used by `workers/audio-jobs/container`.

Reason: generated HTML, enqueue validation, worker failure categorization, and container capture need to agree on the runtime contract and diagnostics shape.

No database migration is required.

## Pre-Rollout Verification

Required local checks:

- [x] `pnpm exec vitest run test/banner test/audio/renderVideoApi.test.ts test/audio/bannerOverlay.test.ts test/audio/videoCompositeRenderWorker.test.ts test/video/renderJobSummary.test.ts test/components/videoStudioRenderJobsPanel.test.ts test/components/videoStudioRenderStatusStrip.test.ts`
- [x] `pnpm exec eslint app/utils/banner-render-runtime.ts app/utils/bannerExportError.ts server/utils/banner/renderLinter.ts server/utils/banner/renderDiagnostics.ts app/utils/video/renderJobSummary.ts`
- [x] `node --check workers/audio-jobs/container/frameRuntime.mjs`
- [x] `node --check workers/audio-jobs/container/bannerCapture.mjs`
- [x] `node --check workers/audio-jobs/container/overlayCapture.mjs`
- [x] `node --check workers/audio-jobs/container/server.mjs`
- [x] `git diff --check`

Known local limitation:

- `pnpm run typecheck` does not currently complete in this workspace. The bounded attempts reached existing Nuxt duplicate-import warnings and then hung without surfacing type errors.

## Deployment Attempt Log

2026-06-25:

- Pages preview deploy succeeded.
  - Preview alias: `https://preview.agency-dashboard-6cm.pages.dev`
  - Deployment URL: `https://5f21b5c4.agency-dashboard-6cm.pages.dev`
- Initial sandboxed Pages deploy failed after a successful build because Wrangler could not write logs under `~/Library/Preferences` and could not resolve `dash.cloudflare.com`; rerunning with normal network/filesystem access succeeded.
- `audio-jobs` deploy was attempted with explicit Wrangler config selection:
  - `pnpm exec wrangler deploy --cwd workers/audio-jobs --config wrangler.toml`
- Wrangler bundling caught a standalone worker import issue: `workers/audio-jobs/src/bannerRenderWorker.ts` imported the Nuxt alias `~~/server/utils/banner/renderDiagnostics`. This was changed to a relative import so the worker package can bundle outside Nuxt.
- Focused regression after that fix passed:
  - `pnpm exec vitest run test/banner/bannerRenderWorker.test.ts test/video/renderJobSummary.test.ts`
- Audio worker/container deploy was initially blocked because Wrangler requires Docker to build the configured container image and Docker Desktop was stuck with unresponsive backend/build processes.
- Docker Desktop was recovered by terminating the stuck Docker backend/build PIDs reported by `docker desktop stop`, then restarting Docker Desktop through `docker desktop start`.
- Docker readiness was confirmed with:
  - `docker version --format '{{json .Server}}'`
- Audio worker/container dry run passed:
  - `pnpm exec wrangler deploy --cwd workers/audio-jobs --config wrangler.toml --dry-run`
  - Docker built `audio-render:worker` and confirmed `frameRuntime.mjs` is copied by the container Dockerfile.
- Live `audio-jobs` worker/container deploy succeeded:
  - Command: `pnpm exec wrangler deploy --cwd workers/audio-jobs --config wrangler.toml`
  - Worker URL: `https://audio-jobs.adme-dev.workers.dev`
  - Current Version ID: `6c4db843-99f4-40a7-893e-900e4ae465e5`
  - Container application: `audio-render`
  - Container image updated from `registry.cloudflare.com/a5b299b3ad15c1b5b895dc66f9357b17/audio-render:a9278bcd` to `registry.cloudflare.com/a5b299b3ad15c1b5b895dc66f9357b17/audio-render:6c4db843`
  - Container digest: `sha256:4e8fb0db8d05ce259a68ba5dce386262cc02f89ff243a728133da350fd245fa9`
  - Consumers deployed: `music-gen`, `timeline-render`, `video-render`, `banner-render`
- Cloudflare deployment verification passed:
  - `pnpm exec wrangler deployments list --cwd workers/audio-jobs --config wrangler.toml`
  - Latest deployment created `2026-06-25T12:32:32.313Z` is at `100%` for Version ID `6c4db843-99f4-40a7-893e-900e4ae465e5`.

## Upgrade Sequence

1. Deploy the app bundle to preview.
2. Deploy the `audio-jobs` worker and render container to preview/staging.
3. Run preview smoke tests below.
4. Deploy the app bundle to production.
5. Deploy the `audio-jobs` worker and render container to production.
6. Run production smoke tests with a small internal Banner Studio project.
7. Monitor render queues and failed jobs for at least one hour before considering the rollout complete.

Do not deploy the app bundle without the updated worker/container for an extended period. The fallback behavior should prevent immediate breakage, but diagnostics and validation are designed to work as a set.

## Smoke Tests

### Banner Studio MP4

1. Open an existing saved Banner Studio project.
2. Export one small MP4 format at 30 FPS, quality 1x.
3. Confirm the export job reaches `done`.
4. Open the MP4 and confirm animation timing is visually correct.
5. Confirm source HTML cleanup occurs after success.

Expected:

- Generated HTML contains `window.__engagrFrame`.
- Capture uses runtime mode.
- No new `banner_render_jobs.error` value.

### Banner Validation Failure

1. Trigger a Banner MP4 export with invalid render input in a non-production-safe test project, or use an API-level test payload without runtime/legacy GSAP HTML.
2. Confirm enqueue returns HTTP 400.
3. Confirm Banner Studio surfaces the blocking lint message in the failure toast.

Expected:

- No queue message is created.
- No source HTML is uploaded for the invalid format.

### Video Studio Overlay

1. Create or use a Video Studio AV project with a Banner overlay clip.
2. Render one format, preferably `reels_9x16`.
3. Confirm the render reaches `done`.
4. Confirm overlay timing and transparency are visually correct.

Expected:

- Overlay HTML is linted before upload.
- Container overlay capture uses runtime mode for new HTML.
- Legacy overlays still render through GSAP fallback if present.

### Failure Diagnostics

1. In staging, test a controlled failed media URL or invalid overlay.
2. Confirm failed job error includes a useful category such as `invalid_composition`, `runtime_not_ready`, `unreachable_media`, `seek_failed`, or `ffmpeg_failed`.
3. Confirm URLs in diagnostics do not include query strings, hashes, credentials, data URLs, or blob URL contents.

## Monitoring

Watch these during rollout:

- `banner_render_jobs.status = failed` rate.
- `media_render_jobs.status = failed` rate for Video Studio renders.
- Queue retries for `banner-render` and `video-render`.
- Container HTTP 500s from `/render-banner` and `/render-composite`.
- Error logs containing:
  - `runtime_not_ready`
  - `seek_failed`
  - `ffmpeg_failed`
  - `missing_runtime_contract`
  - `overlay resolution failed`
- Average and p95 render time for small Banner MP4 exports.

Advance if:

- Failed render rate is within normal baseline.
- No new repeated runtime categories appear.
- Smoke tests pass for Banner MP4 and Video Studio overlay rendering.

Hold if:

- Failures are isolated to invalid creative and lint messages are actionable.
- Render time increases but remains within acceptable export expectations.

Roll back if:

- Valid existing Banner MP4 exports fail repeatedly.
- Video Studio overlay renders fail for valid projects.
- Container crash/retry rate increases materially.
- Diagnostics leak sensitive URL data.

## Rollback

Preferred rollback:

1. Roll back the app bundle to the previous deployment.
2. Roll back the `audio-jobs` worker/container deployment.
3. Re-run Banner MP4 and Video Studio overlay smoke tests.

Compatibility notes:

- New generated HTML includes `window.__engagrFrame`, but the old container path should still be able to seek GSAP timelines through `gsap.globalTimeline`.
- The new container retains legacy GSAP fallback for older HTML.
- No data migration is needed to roll back.
- Failed job errors added during this rollout are stored as text and do not require cleanup.

## Post-Rollout Follow-Ups

- Decide whether to add a dedicated JSON diagnostics column for render jobs.
- Consider a feature flag only if future runtime changes remove fallback behavior.
- Revisit full `pnpm run typecheck` hang separately from this runtime rollout.
- Keep BeginFrame/static-frame dedup deferred until runtime diagnostics are stable in production.
- Keep Palmier-inspired agent-control work as Phase 6 follow-up.
