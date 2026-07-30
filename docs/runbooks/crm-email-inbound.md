# CRM inbound email runbook

## Scope

This runbook activates inbound-only CRM email. It does not enable outbound
sending, delivery-event processing, SMTP compatibility credentials, or
autonomous AI replies.

## Production resources

- Pages project: `agency-dashboard`
- Email Routing Worker: `email-to-board-worker`
- Queue: `crm-email-inbound-queue`
- Dead-letter queue: `crm-email-inbound-dlq`
- Private R2 bucket: `crm-email-inbound`
- Retention: objects expire after 30 days; incomplete multipart uploads expire
  after one day
- Recipient domain: `xeroflow.io`

The existing XeroFlow universal lead-intake catch-all must remain assigned to
`email-lead-intake`. CRM routes use Cloudflare subaddressing: the higher
priority literal base addresses `lead@xeroflow.io` and `reply@xeroflow.io`
are assigned to `email-to-board-worker`, while the signed token remains in the
full recipient delivered to the Worker.

## Current status

The HTTP handoff blocker was removed in PR #338. Email Routing now stores the
retained MIME in R2 and enqueues a provider-neutral job. The dedicated Queue
consumer verifies the signed route and retained object, parses the message, and
performs canonical tenant-scoped Neon writes through Hyperdrive.

Production proof on 2026-07-31 completed the entire inbound path for the
allowlisted South Morang client. One controlled message created one canonical
lead, conversation, message, received event, and compatibility communication.
The route-use timestamp advanced and the Queue invocation completed without a
retry. The smoke route was then revoked and all temporary routing gates were
returned to fail-closed state.

The proof also caught a dependency-composition defect that mocked database
tests had hidden. `createLeadIntakeService()` treated a partial dependency
override as the complete adapter set, leaving the default browser-confirmation
adapter undefined in the live Queue consumer. The factory now merges partial
overrides over its defaults, and privacy-safe stage names identify future
failures without logging recipients, tokens, content, or exception text.

South Morang already has three enabled permanent lead-email endpoints in the
agency Leads screen. Do not create a duplicate hidden route. The Queue-backed
conversation path should be enabled only after the repaired Worker is deployed;
client-visible route issuance remains part of the portal onboarding work.

## Required secrets

Configure these without writing values to source control or command history:

- Pages and `email-to-board-worker`: identical `CRM_EMAIL_WORKER_SECRET`
- Pages and `email-to-board-worker`: identical `CRM_EMAIL_REPLY_SECRETS`, a
  JSON object mapping positive integer versions to at least 32 bytes of secret
  material, for example version `1`

Do not replace or remove the Worker's existing `INTERNAL_API_KEY`; board email
ingestion depends on it.

## Activation order

1. Verify migration 288 and confirm there are no unintended active routes.
2. Verify the Queue, DLQ, private R2 bucket, Hyperdrive binding, and lifecycle
   rules.
3. Configure matching versioned reply secrets on Pages and the Worker while
   both feature gates remain disabled.
4. Merge and deploy Pages using `pnpm deploy:production`.
5. Deploy the standalone Worker using its checked-in Wrangler configuration.
6. Verify the Worker consumer, Hyperdrive, Queue, and R2 bindings.
7. Create one 24-hour `lead_inbox` smoke route for an allowlisted client.
8. Enable Email Routing subaddressing and the `lead@xeroflow.io` and
   `reply@xeroflow.io` base rules assigned to `email-to-board-worker`. Do not
   alter the catch-all.
9. Wait at least 60 seconds for Email Routing configuration propagation. A
   message sent immediately after enabling can still match the previous
   catch-all configuration.
10. Send a controlled message, then verify the route timestamp, canonical CRM
   message, compatibility communication, Queue metrics, and R2 cleanup policy.
11. Revoke the smoke route and disable its base routing rule after
    proof is captured.

## Safe diagnostics

- Workers Observability is enabled for custom logs on the standalone Worker,
  but automatic invocation logs are disabled because Email invocations include
  the full recipient and therefore the signed route token.
- Queue failures log only the last bounded processing stage, for example
  `canonical_ingest_lead_append_browser_confirmation`.
- Never add a raw exception, recipient, subject, route token, body, attachment,
  or R2 object key to these logs.
- Inspect retained DLQ jobs read-only before deciding whether to replay them.
  Never purge the Queue or DLQ merely to make backlog metrics look healthy.

## Rollback

1. Disable the literal CRM Email Routing rule. This stops new delivery without
   affecting XeroFlow's existing catch-all or board routes.
2. Set `CRM_EMAIL_INBOUND_ENABLED` to `false` and redeploy the standalone
   Worker if a broader stop is required.
3. Set `CRM_EMAIL_CONVERSATIONS_ENABLED` to `false` and redeploy Pages to stop
   enqueueing.
4. Leave the Queue, DLQ, database migration, and private R2 bucket in place for
   incident analysis. Their existence does not enable traffic.
5. Revoke affected database routes by setting `is_active = FALSE` and
   `revoked_at = NOW()`.

Never purge the Queue, DLQ, or R2 evidence during an incident unless the
incident owner explicitly approves destructive cleanup.
