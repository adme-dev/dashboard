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

## Erase and heal

Erase runs entirely in this Worker and on Workers AI. No extra bindings or secrets.

1. Loads the picture. A picture asset is used as it is. For a video, a still frame
   is used and the result is a still; the video is never edited. The frame is the
   one the editor painted on, which Prepare captures in the browser and the masks
   endpoint stores beside the mask (`<mask key>.frame.jpg`). Without one, the
   asset's preview frame (`thumbnail_key`) is used. A video with neither fails
   with a message saying what to do.
2. Reads the painted mask from R2 (`brush_mask_key`). It must be a PNG with the
   same shape as the picture.
3. Asks `@cf/mistralai/mistral-small-3.1-24b-instruct` what is under the painted
   area (a crop of the clean picture) and gets back a short name such as
   "sailboats in a bay". If that call fails the erase still runs and says
   "the object".
4. Sends the picture, with the painted area tinted green, to
   `@cf/black-forest-labs/flux-2-klein-4b` at about one megapixel, with an
   instruction that names the object. Naming it is what makes erase reliable with
   no instruction from the editor: measured on six pictures, the model removed the
   object in 17 of 19 runs when it was named, 12 of 19 with a strongly worded
   generic instruction and 9 of 19 with the editor's old default text. Hiding the
   object behind a solid patch was worse than all of these.
5. Pastes only the painted region of the model's result, with a soft edge and a
   tone correction, onto the original at full resolution, and stores a lossless PNG.

Limits: PNG and JPEG sources up to 9 megapixels (4K UHD fits). An 8.6 megapixel
picture with a full-size mask ran on the deployed Worker in 14 seconds using 3.4
seconds of CPU, with no memory or CPU limit reached. `wrangler.toml` raises the CPU
limit to 5 minutes for decoding and encoding large pictures; this needs a paid
Workers plan.

Lift highlighted area, Remove background and Separate layers have no provider
runtime. The app lists them as "Not available yet" and the extract endpoint
refuses them with HTTP 409 instead of saving a blocked job. Wiring them to
Replicate needs a Replicate API token on this Worker and cost approval; no
Replicate call exists in this repository today.

Deploying this Worker is a separate step from deploying Pages (see above).

## Database connections and stranded jobs

Every query opens its own `pg` connection through Hyperdrive and closes it. Do not
cache a client in module scope: the isolate outlives a queue delivery, the cached
socket belongs to the delivery that opened it, and the next delivery's query never
settles. The runtime then kills each invocation with no error, the message uses up
its retries and the job row is left `queued` or `running`. This happened on
2026-11-24 with both the old and the new version.

A job that is `running` for more than 10 minutes, or `queued` for more than 15, is
marked failed with a message telling the editor to run it again. This is done by
the Pages app whenever it lists a project's jobs (the editor polls that list) and
by this Worker at the start of each delivery. The rule lives in
`shared/video/assetIntelligenceStaleJobs.ts`.

After deploying, run at least two jobs back to back. One job on a fresh isolate
proves nothing about connection handling.
