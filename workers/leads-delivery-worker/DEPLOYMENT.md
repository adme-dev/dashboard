# leads-delivery-worker — Deployment

This Worker is the queue consumer for the leads engine. The Pages app produces
messages on `leads-delivery-queue`; this Worker dequeues and dispatches.

## Prerequisites

- A Cloudflare account with Workers + Queues + Hyperdrive enabled
- The Pages dashboard project deployed
- A Hyperdrive resource pointing at the Neon Postgres DB (note the ID)
- Resend API key

## One-time setup

1. **Create the queue + DLQ**:

   ```bash
   wrangler queues create leads-delivery-queue
   wrangler queues create leads-delivery-dlq
   ```

2. **Set the Hyperdrive ID** in `wrangler.toml`:

   Replace `REPLACE_WITH_HYPERDRIVE_ID` with your actual Hyperdrive resource ID.

3. **Set secrets**:

   ```bash
   cd workers/leads-delivery-worker
   wrangler secret put DATABASE_URL          # Neon connection string (fallback)
   wrangler secret put RESEND_API_KEY        # Same as Pages
   wrangler secret put INTERNAL_CRON_TOKEN   # Optional, only if Worker calls back
   ```

4. **Deploy**:

   ```bash
   pnpm deploy
   ```

   The `predeploy` hook syncs `server/utils/leads/*` into the worker bundle automatically.

5. **Configure the queue consumer in the Cloudflare dashboard**:

   - Workers & Pages → leads-delivery-worker → Queue Consumers → Add
   - Queue: `leads-delivery-queue`
   - Max batch size: 10
   - Max batch timeout: 5
   - Max retries: 0 (the app retries internally)
   - Dead letter queue: `leads-delivery-dlq`

6. **Smoke test**:

   ```bash
   # From the Pages app, fire a synthetic Google lead:
   curl -X POST 'https://<host>/api/leads/webhook/google/<token>' \
     -H 'Content-Type: application/json' \
     -d '{"google_key":"<key>","lead_id":"deploy-smoke","form_id":"smoke",
          "user_column_data":[{"column_name":"EMAIL","string_value":"a@b.co"}]}'

   # Then in dashboard → Queues → leads-delivery-queue → check messages drain.
   # In DB, lead_deliveries should land with status='delivered' or 'cancelled'
   # (depending on whether a rule is configured).
   ```

## Companion: leads-cron Worker

The `workers/leads-cron/` Worker fires HTTP cron triggers at the Pages app's
`/api/leads/_internal/*` endpoints. Deploy separately:

```bash
cd workers/leads-cron
pnpm install
wrangler secret put INTERNAL_CRON_TOKEN
# Edit wrangler.toml: set APP_BASE_URL to your dashboard domain
pnpm deploy
```

## Updates

After any change to `server/utils/leads/*` in the main repo, run `pnpm deploy`
from this directory. The `predeploy` hook re-syncs the shared code automatically.
