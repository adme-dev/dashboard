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
conversation path should be enabled only after the repaired Worker is deployed.
Agency and portal CRM inbox onboarding are available through the guarded route
management APIs described below.

## Required secrets

Configure these without writing values to source control or command history:

- Pages and `email-to-board-worker`: identical `CRM_EMAIL_WORKER_SECRET`
- Pages and `email-to-board-worker`: identical `CRM_EMAIL_REPLY_SECRETS`, a
  JSON object mapping positive integer versions to at least 32 bytes of secret
  material
- Pages and `email-to-board-worker`: identical
  `CRM_EMAIL_REPLY_CURRENT_VERSION`, a positive integer that already exists in
  `CRM_EMAIL_REPLY_SECRETS`; this explicit value is the signing version for
  new CRM inbox addresses and must never be inferred from the highest keyring
  version
- Pages: `CRM_EMAIL_LEAD_ROUTE_DOMAIN`, the server-owned recipient domain for
  newly issued CRM inbox addresses

Do not replace or remove the Worker's existing `INTERNAL_API_KEY`; board email
ingestion depends on it.

## CRM inbox lifecycle

Use the **CRM inbox** panel in Agency Leads → Email addresses for agency work,
or Portal CRM → Data Sources for a client-managed setup. The portal lets all
CRM viewers read safe status and guidance, but only the primary contact or a
user with `canAdminCrm` can create, rotate, or revoke. These actions use the
same tenant-scoped route-management service; portal requests derive client
scope from the authenticated session.

### Create and copy once

1. Confirm CRM email conversations are enabled for the client and no active
   CRM inbox is already present.
2. Create the route with a meaningful label. The service signs it with the
   explicit current version, stores only a route-token hash, and records a
   safe lifecycle audit event.
3. Copy the complete address immediately from the creation result. It is shown
   once and cannot be retrieved later from the route list, audits, logs, or
   database views.
4. Place the address only in the approved website, marketplace, or forwarding
   integration. Never put it in tickets, support chat, screenshots, or
   operational logs.

### Rotate or revoke

- **Rotate:** confirm every forwarding source can be changed now. Rotation
  creates the replacement, revokes the old route in the same transaction, and
  shows the replacement address once. There is no grace period: the old
  address stops accepting mail as soon as rotation commits.
- **Revoke:** use the route's revoke control when the address is no longer
  needed or may have been exposed. Revocation is a soft lifecycle change with
  a safe audit record; it does not reveal an address, route token, hash, or
  signing version.

## Signing-key rollover

1. Generate and configure a new secret under a new positive key version in
   `CRM_EMAIL_REPLY_SECRETS` on both Pages and `email-to-board-worker`; retain
   the existing versions.
2. Deploy and verify both runtimes can read the same expanded keyring.
3. Set `CRM_EMAIL_REPLY_CURRENT_VERSION` to the new existing key version on
   both runtimes and deploy again.
4. Create or rotate routes so new addresses use the new explicit version.
5. Keep prior versions available until every route signed with each prior
   version has been revoked or retired and the inbound Queue has drained. Only
   then remove those versions from both keyrings.

Never remove an old version before retiring its routes and draining the inbound
Queue: it would turn their delivery into a configuration failure instead of an
auditable revocation.

## Activation order

1. Verify migration 288 and confirm there are no unintended active routes.
2. Verify the Queue, DLQ, private R2 bucket, Hyperdrive binding, and lifecycle
   rules.
3. Configure matching versioned reply secrets on Pages and the Worker while
   both feature gates remain disabled.
4. Merge and deploy Pages using `pnpm deploy:production`.
5. Deploy the standalone Worker using its checked-in Wrangler configuration.
6. Verify the Worker consumer, Hyperdrive, Queue, and R2 bindings.
7. Create one clearly labelled `lead_inbox` smoke route for an allowlisted
   client. It does not expire automatically; explicitly revoke it after the
   verification and approved synthetic-record cleanup are complete.
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

## Production smoke for route onboarding

Run this only for an allowlisted test client after the activation prerequisites
above are healthy:

1. Create a labelled CRM inbox route and copy its address from the one-time
   result. Confirm a subsequent list/status request exposes no address,
   token, hash, secret, or signing version.
2. Send one controlled, non-sensitive test message after the 60-second routing
   propagation window.
3. Verify exactly one tenant-scoped lead/conversation/message path and route
   last-used timestamp, plus healthy Queue/DLQ metrics. Inspect only safe
   lifecycle metadata and bounded stage logs.
4. Revoke the smoke route, verify a new route can be created if needed, and
   soft-delete the synthetic CRM records under the approved cleanup procedure.
   The smoke route does not expire automatically.

Do not record the issued address, message content, recipient, route token,
route hash, signing secret, or R2 key in the smoke evidence.

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

1. Immediately set `CRM_EMAIL_CONVERSATIONS_ENABLED` to `false` and redeploy
   Pages; set `CRM_EMAIL_INBOUND_ENABLED` to `false` and redeploy the
   standalone Worker if a broader stop is required.
2. Disable the literal CRM Email Routing rule. This stops new delivery without
   affecting XeroFlow's existing catch-all or board routes.
3. Revoke the affected CRM inbox routes through the management service (or,
   when the service is unavailable, perform the approved audited soft revoke).
   Do not leave a bearer address active while investigating exposure.
4. Leave the Queue, DLQ, database migration, and private R2 bucket in place for
   incident analysis. Their existence does not enable traffic.

Never purge the Queue, DLQ, or R2 evidence during an incident unless the
incident owner explicitly approves destructive cleanup.
