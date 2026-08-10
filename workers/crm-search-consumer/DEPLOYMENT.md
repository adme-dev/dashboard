# CRM Search Consumer Deployment Contract

This package is a standalone Cloudflare Queue Worker. It consumes only
`agency-crm-search-index` and `agency-crm-search-index-dlq`; it has no producer,
Vectorize, AI, provider, or generic jobs binding.

Task 10 is configuration and code only. It must not create Cloudflare resources
or perform a production deployment. The only executable deployment command in
this package is a guarded local build:

```sh
pnpm deploy:dry-run
```

The wrapper fixes the Worker name, config path, Pages origin, queue names, retry
policy, batching, and concurrency, then invokes Wrangler with `--dry-run`.

## Resource preparation and readback

An authorized operator provisions both queues outside this task and sets an
exact retention period of 1,209,600 seconds (14 days):

- primary: `agency-crm-search-index`
- dead letter: `agency-crm-search-index-dlq`

Use the Cloudflare API or Wrangler `queues info` to read both resources back.
Release automation must derive `CRM_SEARCH_RESOURCE_MANIFEST` from that
readback, not from intended configuration. The Worker accepts only revision
`crm-search-resource-readback-v1`, source `cloudflare_api`, plan `workers_paid`,
the exact queue names, and 1,209,600-second retention for both queues. Missing,
unknown, shorter, or plan-incompatible evidence makes health unready and
prevents consumption.

The remaining required secrets are frozen release evidence and the service
keyring. The keyring contains only the active/previous service-auth keys defined
by the shared signing contract; only the currently valid active key signs Worker
requests. Never place a CRM source record or provider payload in a binding.

## Release order

1. Verify queue/API readback and assemble the frozen manifest and digests.
2. Deploy Pages before the Worker. Confirm Pages health advertises the Worker
   SHA, artifact digest, binding-manifest digest, and emitted protocol version.
3. Run `pnpm deploy:dry-run`, then use the separately approved production
   release workflow to deploy the immutable Worker artifact.
4. Confirm Worker health is ready before allowing queued traffic to proceed.

Pages accepts only the current and immediately previous protocol versions. Both
the primary and DLQ paths use exact HMAC-signed Pages endpoints.

## Rollback

Pause the queue consumer before rolling Pages back to an incompatible release.
Restore a Pages release that accepts the deployed Worker protocol and frozen
release evidence, validate both health endpoints, then resume the consumer.
Never redirect these queues to the generic jobs consumer as a rollback shortcut.
