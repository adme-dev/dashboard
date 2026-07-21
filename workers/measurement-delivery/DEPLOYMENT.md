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
`wrangler.toml`.

Google Data Manager uses the tenant-scoped Google refresh grant in
`social_connections`, and the Worker refreshes a short-lived access token only
after verifying the `https://www.googleapis.com/auth/datamanager` scope.

Meta CAPI does **not** use the linked Facebook OAuth token. Generate a
dataset-specific CAPI access token in Meta Events Manager and provision the same
purpose-scoped binding name in both runtimes that can execute provider traffic:

```sh
# Standalone delivery Worker
pnpm exec wrangler secret put MEASUREMENT_PROVIDER_META_BIG_GARAGE

# Pages provider-test runtime (replace with the production Pages project name)
pnpm exec wrangler pages secret put MEASUREMENT_PROVIDER_META_BIG_GARAGE \
  --project-name agency-dashboard
```

The destination stores only the binding name, for example
`MEASUREMENT_PROVIDER_META_BIG_GARAGE`, in `credential_ref`. Provider references
must match `MEASUREMENT_PROVIDER_[A-Z0-9_]+`; this prevents a destination from
referencing unrelated application secrets. Never paste the token into Zero,
Neon, logs, task comments, or source control. Pages and Worker secret values must
be rotated together until Meta provider tests are routed through a Worker service
binding.

## Deploy order

1. Create the queue and DLQ.
2. Apply migration `261_measurement_delivery_diagnostics.sql` and verify the due
   diagnostics index plus append-only check table.
3. Set the Google Worker secrets and the Meta dataset-token binding in both
   Pages and the delivery Worker.
4. Run `pnpm typecheck` in `workers/measurement-delivery/`.
5. Deploy the consumer/scheduled Worker with `pnpm run deploy` in
   `workers/measurement-delivery/`. Its 15-minute cron only leases rows whose
   `diagnostic_next_check_at` is due.
6. Deploy the Pages app so the producer binding and repair endpoint are active.
7. Deploy `workers/pages-cron/` so the five-minute outbox and retry repair route is called.
8. Reconnect each in-scope Google connection to grant
   `https://www.googleapis.com/auth/datamanager`; existing refresh tokens do not
   gain the new scope automatically.
9. Validate in test mode, record provider request IDs/diagnostics, obtain privacy
   and live approvals, and only then activate one client at a time.

## Verification and rollback

- Confirm Queue messages contain only `schemaVersion`, `clientId`, `eventId`, and
  `enqueuedAt`.
- Confirm the destination contains only the purpose-scoped Meta binding name and
  that neither provider-test nor delivery SQL selects `social_connections.access_token`.
- Confirm `conversion_delivery_attempts` receives immutable, redacted attempt rows.
- Confirm Meta reports received test events and Google returns a `requestId` that
  enters `pending` diagnostics with its first check due after 30 minutes.
- Confirm Google checks append to `conversion_delivery_diagnostic_checks`, back
  off by 1.3 with jitter up to 60 minutes, stop after 24 hours, and move the
  delivery from `accepted` only when terminal status is known.
- Treat `SUCCESS` with warnings as delivered/degraded; treat `PARTIAL_SUCCESS`,
  `FAILED`, credential failure, and 24-hour timeout as terminal failure evidence.
- Confirm retryable deliveries are requeued by the five-minute repair route.
- Roll back delivery immediately by pausing the client Measurement profile or
  destination. Do not delete attempt or event evidence.
