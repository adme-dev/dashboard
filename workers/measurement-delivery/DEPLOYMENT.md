# Measurement delivery Worker deployment

This Worker consumes opaque conversion event identities from Cloudflare Queue,
loads canonical delivery state through Hyperdrive, and delivers independently to
Meta Conversions API and Google Data Manager API. It must remain dormant until a
client Measurement profile, destination, mapping, consent policy, and live
approval are all explicitly enabled in XeroFlow.

## One-time infrastructure

```sh
pnpm exec wrangler queues create measurement-delivery
pnpm exec wrangler queues create measurement-delivery-dlq
```

The Pages producer binding is `MEASUREMENT_DELIVERY_QUEUE` in the root
`wrangler.toml`. The consumer and production Hyperdrive binding are declared in
`workers/measurement-delivery/wrangler.toml`.

## Worker secrets

From `workers/measurement-delivery/`:

```sh
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
```

Do not place OAuth tokens, refresh tokens, app secrets, or database URLs in
`wrangler.toml`. Provider connection tokens are loaded from the tenant-scoped
`social_connections` row at delivery time.

## Deploy order

1. Create the queue and DLQ.
2. Set the Worker secrets.
3. Run `pnpm typecheck` in `workers/measurement-delivery/`.
4. Deploy the consumer with `pnpm deploy` in `workers/measurement-delivery/`.
5. Deploy the Pages app so the producer binding and repair endpoint are active.
6. Deploy `workers/pages-cron/` so the five-minute outbox and retry repair route is called.
7. Reconnect each in-scope Google connection to grant
   `https://www.googleapis.com/auth/datamanager`; existing refresh tokens do not
   gain the new scope automatically.
8. Validate in test mode, record provider request IDs/diagnostics, obtain privacy
   and live approvals, and only then activate one client at a time.

## Verification and rollback

- Confirm Queue messages contain only `schemaVersion`, `clientId`, `eventId`, and
  `enqueuedAt`.
- Confirm `conversion_delivery_attempts` receives immutable, redacted attempt rows.
- Confirm Meta reports received test events and Google returns a `requestId` that
  can be checked through Data Manager diagnostics.
- Confirm retryable deliveries are requeued by the five-minute repair route.
- Roll back delivery immediately by pausing the client Measurement profile or
  destination. Do not delete attempt or event evidence.
