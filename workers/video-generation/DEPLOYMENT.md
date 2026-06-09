# Video Generation Worker Deployment

This worker is the dormant queue consumer for Video Studio V2 AI generation jobs.
It is not required for Video Studio V1 render/export flows.

## What It Consumes

- Queue: `video-generation`
- DLQ: `video-generation-dlq`
- Pages producer binding: `VIDEO_GENERATION_QUEUE -> video-generation`
- Worker: `workers/video-generation`

The Pages app creates `video_generation_jobs` rows and sends queue messages only
when both flags are enabled:

- `VIDEO_STUDIO_ENABLED=true`
- `VIDEO_GENERATION_ENABLED=true`

Tenant policy still defaults disabled in code, so enabling the flags alone does
not expose unmanaged generation.

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

## Current Provider State

The committed provider is a mock adapter and exists to lock the provider
contract and queue orchestration. Do not enable `VIDEO_GENERATION_ENABLED` for
operator use until a real provider adapter has been live-verified and tenant
generation policy is configured.

## Safety Contract

- Vehicle text-to-video is blocked before enqueue.
- Vehicle image-to-video requires an approved source asset.
- Jobs use `(tenant_id, idempotency_key)` to prevent duplicate enqueue/provider
  attempts from creating duplicate billable jobs.
- Generated outputs are represented as `video_assets` and then flow through the
  existing AV timeline/render/distribution path.
