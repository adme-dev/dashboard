# Asset Intelligence Worker Deployment

This Worker is the standalone queue consumer for Video Asset Intelligence. The
Pages app produces messages through `ASSET_INTELLIGENCE_QUEUE`; this Worker
consumes the `asset-intelligence` queue and writes derived assets to DB/R2.

`pnpm deploy:production` deploys the Pages app only. `scripts/deploy-workers.mjs`
intentionally excludes queue-consumer Workers, so this Worker must be deployed
with the commands below.

## What It Consumes

- Queue: `asset-intelligence`
- DLQ: `asset-intelligence-dlq`
- Pages producer binding: `ASSET_INTELLIGENCE_QUEUE -> asset-intelligence`
- Worker: `xeroflow-asset-intelligence`
- Worker directory: `workers/asset-intelligence`

## Activation Order

1. **Create the queues**

   ```bash
   pnpm exec wrangler queues create asset-intelligence
   pnpm exec wrangler queues create asset-intelligence-dlq
   ```

2. **Apply the DB migrations before live traffic**

   Production needs the video asset migrations in order before this queue is
   enabled: metadata columns, asset-intelligence harness tables, then the
   derivative bucket unique index. The unique index is required before relying
   on race-safe derivative bucket reuse.

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/176_video_assets_metadata.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/177_video_asset_harness.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/178_video_derivative_bucket_item_unique_index.sql
   ```

   If the production database also missed the duplicate-numbered source-asset
   migration, apply `server/database/migrations/176_video_gen_source_assets.sql`
   before `177_video_asset_harness.sql`.

3. **Deploy the standalone queue consumer Worker**

   ```bash
   pnpm --dir workers/asset-intelligence deploy
   ```

   Confirm the deploy output names `xeroflow-asset-intelligence` and registers
   the `asset-intelligence` queue consumer.

4. **Deploy the Pages producer binding**

   ```bash
   pnpm deploy:production
   ```

   Confirm the deployed Pages environment has producer binding
   `ASSET_INTELLIGENCE_QUEUE -> asset-intelligence`.

5. **Smoke test extraction**

   Trigger one Video Asset Intelligence extraction from the production app, then
   verify the message drains from `asset-intelligence`, the job row leaves
   `queued`/`running`, and the derivative asset is written to `MEDIA_BUCKET` and
   linked in the database.

## Required Bindings

The Worker `wrangler.toml` declares:

- `[[queues.consumers]]` for `asset-intelligence`
- `dead_letter_queue = "asset-intelligence-dlq"`
- `HYPERDRIVE` for production database access
- `MEDIA_BUCKET` for source and derivative assets
- `AI` for Workers AI model execution

For local or fallback database access, provide `DATABASE_URL`.
