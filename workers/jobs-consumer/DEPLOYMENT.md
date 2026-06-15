# jobs-consumer — deployment

Consumes the `agency-jobs` queue (the Pages app's `JOBS_QUEUE` producer). Without
this Worker the queue has **no consumer** — Pages can't run queue consumers and the
Nitro `cloudflare:queue` hook never fires on the deployed Pages worker. Symptom:
the daily ad-spend cron creates a `spend_sync_jobs` row every morning but it stays
`running` with 0 / N accounts processed, because the per-account
`spend.sync.meta.account` messages are never consumed.

It's a thin bridge: each message is POSTed to the Pages route
`/api/internal/process-job`, which runs `processJob()` in a real request context.

## One-time setup

```bash
# 1. Create the queue + its dead-letter queue (skip any that already exist).
npx wrangler queues create agency-jobs
npx wrangler queues create agency-jobs-dlq

# 2. Set the shared secret (must equal the Pages project's CRON_SECRET).
#    Run from this directory (workers/jobs-consumer), NOT the Pages root.
npx wrangler secret put CRON_SECRET --name jobs-consumer

# 3. Deploy.
cd workers/jobs-consumer && npm install && npm run deploy
```

`APP_BASE_URL` defaults to the Pages prod URL in `wrangler.toml`; override there if
the app moves.

## Verify

After the next 06:00 UTC run (or trigger a manual sync from `/agency/social/spend`):

```sql
-- The newest meta job should reach completed with processed = total.
SELECT platform, status, total_accounts, processed_accounts, started_at, finished_at
FROM spend_sync_jobs ORDER BY started_at DESC LIMIT 5;
```

`wrangler tail jobs-consumer` shows `ack`/`retry` activity per message.

## Notes

- `agency-jobs` also carries `board.notify`, `eom.generate`, and `embed.*` jobs —
  this consumer processes all of them, not just spend sync.
- Secondary ad platforms (Google, TikTok, etc.) do **not** use this queue; they run
  via the cron's `waitUntil` background path in `spendSyncKickoff.ts`.
