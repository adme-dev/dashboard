# Video Generation Worker Deployment

This worker is the dormant queue consumer for Video Studio V2 AI generation jobs.
It is not required for Video Studio V1 render/export flows.

## What It Consumes

- Queue: `video-generation`
- DLQ: `video-generation-dlq`
- Pages producer binding: `VIDEO_GENERATION_QUEUE -> video-generation`
- Worker: `workers/video-generation`

The Pages app creates `video_generation_jobs` rows and sends queue messages only
when generation is enabled:

- `VIDEO_GENERATION_ENABLED=true`
- `VIDEO_GENERATION_TEST_TENANT_ENABLED=true`
- `VIDEO_GENERATION_TEST_TENANT_ID=<client id or agency>`

`VIDEO_STUDIO_ENABLED` gates the separate composite render/export path; it is
not required for AI generation jobs to enqueue.

Tenant policy still defaults disabled in code. The test-tenant flag is
fail-closed unless `VIDEO_GENERATION_TEST_TENANT_ID` exactly matches the AV
project `clientId` (or `agency` for internal projects).

## One-Time Cloudflare Setup

```bash
pnpm exec wrangler queues create video-generation
pnpm exec wrangler queues create video-generation-dlq
```

The Pages `wrangler.toml` must include:

```toml
[[queues.producers]]
binding = "VIDEO_GENERATION_QUEUE"
queue = "video-generation"
```

The worker `wrangler.toml` declares the consumer and Hyperdrive binding.

## Deploy

```bash
pnpm --dir workers/video-generation deploy
```

If a prior Pages deploy created `.wrangler/deploy/config.json`, move it aside
before deploying this nested Worker and restore it afterwards:

```bash
mv .wrangler/deploy/config.json /tmp/dashboard-wrangler-pages-config.json
pnpm --dir workers/video-generation exec wrangler deploy
mv /tmp/dashboard-wrangler-pages-config.json .wrangler/deploy/config.json
```

## Current Provider State

The worker registers the mock adapter for test/local flows and the Cloudflare AI
Gateway adapter for production generation. Do not expose tenant generation until
the selected AI Gateway model IDs have been live-verified against the current
Cloudflare account and tenant generation policy is configured.

## Safety Contract

- Vehicle text-to-video is blocked before enqueue.
- Vehicle image-to-video requires an approved source asset.
- Jobs use `(tenant_id, idempotency_key)` to prevent duplicate enqueue/provider
  attempts from creating duplicate billable jobs.
- Generated outputs are represented as `video_assets` and then flow through the
  existing AV timeline/render/distribution path.

## Liability/claim cutover (migrations 506–508)

This release changes the submission claim protocol. Do not roll the new consumer
out alongside the old consumer: an old invocation can read a queued job before
another invocation claims it. The compatibility trigger preserves historical
liability; it does not make an already-running old invocation safe.

1. Record the current Pages source, consumer version, queue configuration and
   delivery state. Coordinate with the active publisher and retain that receipt.
2. Pause delivery for **only** `video-generation` using
   `pnpm exec wrangler queues pause-delivery video-generation`. Verify provider
   readback. Pausing preserves queued messages but does not establish that an
   already-running invocation has finished; verify consumer telemetry and wait
   for existing invocations to settle before schema/consumer cutover. Do not
   purge the queue or manufacture a provider request to test it.
3. Check the production schema and preflight duplicate `(project_id,
   idempotency_key)` identities before migration 506. If duplicates exist, stop
   and reconcile their provenance; never delete financial history to force the
   new unique index through. Apply 506, 507 and 508 using the configured database
   connection without printing it, and verify constraints/triggers afterwards.
4. Deploy the reviewed current-source consumer, preserving bindings and secrets;
   verify the deployed version is the claim-aware implementation. Deploy the
   same merged Pages source through `pnpm deploy:check` followed by
   `pnpm deploy:production`, retaining enabled public video/search flags. Keep
   `VIDEO_STORYBOARD_PRODUCTION_ENABLED` absent/false: held-attempt APIs are not
   provider acceptance or authorization to spend.
5. Confirm the new consumer uses an atomic queued-to-running claim and that
   claimed/unknown jobs retain liability. Only then restore the queue's original
   delivery state using `pnpm exec wrangler queues resume-delivery
   video-generation` if it was originally running. Record exact source,
   deployment versions, schema evidence and the pause/resume times.

If cutover fails, keep delivery paused and report the precise gate. Do not
resume an old consumer against new held attempts or silently release uncertain
liability. A held cancellation sets the job to failed before releasing its
reservation; cancellation of a claimed job cannot establish a zero provider cost.
Historical queued jobs conservatively migrated to uncertain require an explicit
provider-outcome reconciliation rather than automatic resubmission.

Cloudflare's [pause/resume documentation](https://developers.cloudflare.com/queues/configuration/pause-purge/)
describes delivery suspension and message retention; it is not a guarantee that
in-flight application work has drained.
