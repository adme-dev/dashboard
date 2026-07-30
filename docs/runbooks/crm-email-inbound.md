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
`email-lead-intake`. CRM routes are higher-priority literal-address rules
assigned to `email-to-board-worker`.

## Required secrets

Configure these without writing values to source control or command history:

- Pages and `email-to-board-worker`: identical `CRM_EMAIL_WORKER_SECRET`
- Pages only: `CRM_EMAIL_REPLY_SECRETS`, a JSON object mapping positive integer
  versions to at least 32 bytes of secret material, for example version `1`

Do not replace or remove the Worker's existing `INTERNAL_API_KEY`; board email
ingestion depends on it.

## Activation order

1. Verify migration 288 and confirm there are no unintended active routes.
2. Create the Queue, DLQ, private R2 bucket, and lifecycle rules.
3. Configure the two secrets while both feature gates remain absent.
4. Merge and deploy Pages using `pnpm deploy:production`.
5. Deploy the standalone Worker using its checked-in Wrangler configuration.
6. Verify the Pages producer and Worker consumer/R2 bindings.
7. Create one 24-hour `lead_inbox` smoke route for an allowlisted client.
8. Add one enabled, literal Email Routing rule for that exact address and the
   `email-to-board-worker` action. Do not alter the catch-all.
9. Send a controlled message, then verify the route timestamp, canonical CRM
   message, compatibility communication, Queue metrics, and R2 cleanup policy.
10. Revoke the smoke route and disable/delete its literal routing rule after
    proof is captured.

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
