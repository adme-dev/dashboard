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
