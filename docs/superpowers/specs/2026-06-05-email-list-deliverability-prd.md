# PRD - Email Lists, Consent, Suppression, Scheduled Sends, and Tracking

**Status:** Active
**Date:** 2026-06-05
**Owner:** Paul / XeroFlow Agency
**Surface:** `/agency/email`
**Related specs:** `docs/superpowers/specs/2026-05-31-email-marketing-module-design.md`, `docs/superpowers/specs/2026-06-04-edm-enterprise-prd.md`

## 1. Vision

Build the email marketing layer as an owned agency platform, not a thin wrapper around an ESP audience product. The app owns contacts, lists, consent proof, opt-outs, bounces, suppression, scheduled campaign state, and attribution. Resend remains the delivery provider and webhook source.

The goal is a safe sender workflow: users can import and manage lists, book campaigns, run preflight checks, send tests, send scheduled campaigns, honor opt-outs immediately, suppress bounces and complaints, and connect email clicks to the broader tracking system.

## 2. Current State

Already implemented in the repo:

- `email_subscribers`, `email_lists`, and `subscriber_lists` for contacts, lists, and per-list membership.
- `campaigns`, `campaign_lists`, `campaign_recipients`, `email_events`, and `suppression_list`.
- Campaign materialization that excludes unsubscribed, disabled, blocklisted, and suppressed recipients.
- Resumable recipient queue with claimed rows and Resend batch sending.
- Resend webhook ingestion for delivered, opened, clicked, bounced, and complained events.
- Signed unsubscribe flow and RFC 8058 headers on campaign sends.
- Sendability/test-send gate that checks unsubscribe presence, HTML size, and sendable media URLs.

Main gaps:

- No consent/provenance audit history.
- No suppression history beyond the current `suppression_list` row.
- No soft-bounce model.
- No first-party click redirect or site-tracking join.
- Limited scheduled-send observability and no locked send snapshot.
- No list-management UI for suppression/consent history.
- Client/tenant ownership is additive but needs policy enforcement before client-scoped sending.

## 3. Goals

- Give every subscriber a clear, auditable lifecycle: imported, manually added, form-submitted, confirmed, unsubscribed, resubscribed, suppressed, and lifted where allowed.
- Prevent unsafe sends by enforcing suppression, consent, bounce, complaint, one-click unsubscribe, and sender-auth readiness before a campaign can leave the system.
- Support booked campaign sends with a durable snapshot and recoverable execution.
- Track delivery and engagement with realistic interpretation: delivered, bounced, complained, clicked, opened, unsubscribed, and downstream site events.
- Support agency-wide media/list ownership now and client-scoped restrictions later.
- Keep provider choice flexible: Resend first, but the data model should not make a future SendGrid/Mailchimp/provider bridge difficult.

## 4. Non-Goals For This Epic

- Full A/B testing.
- Full SQL segmentation builder.
- Dedicated IP warm-up automation.
- Replacing Resend delivery.
- Automatically importing provider-owned Resend Audiences into our source of truth.
- Building a Litmus-equivalent inbox rendering lab in-app.

## 5. Users And Use Cases

- **Agency marketer:** imports or selects a clean list, builds an EDM, schedules it, sends a test, and reviews delivery/click results.
- **Agency admin:** sees suppression and consent history, manages manual suppressions, and resolves list ownership issues.
- **Client-scoped future user:** can only use their own media, lists, and verified sending domain.
- **Recipient:** can unsubscribe globally or from selected topics/lists without friction.

## 6. Product Requirements

### 6.1 Subscriber And List Lifecycle

- Global subscriber records remain deduped by case-insensitive email.
- List membership remains per-list with `confirmed`, `unconfirmed`, and `unsubscribed`.
- Imports must record source, file/import metadata, and user who imported.
- Public forms must record form submission and confirmation separately.
- Re-subscribe can only lift a prior `global_unsubscribe` when there is proven consent. It must never auto-lift hard bounce or complaint suppression.
- Every status-affecting action must be auditable.

### 6.2 Suppression And Bounce Lifecycle

- `hard_bounce` and `complaint` are global hard stops.
- `global_unsubscribe` is a global marketing hard stop, but may be lifted only by proven re-consent.
- `manual` suppression is a staff-controlled hard stop.
- `soft_bounce` is historical signal, not an immediate hard stop. Track count and last occurrence. Future thresholding can suppress after repeated soft bounces.
- Suppression history must record whether an action added, ignored, removed, or recorded a suppression signal.

### 6.3 Booked Campaign Sends

- Campaign lifecycle remains `draft`, `scheduled`, `sending`, `paused`, `sent`, `cancelled`.
- Scheduling a campaign should run preflight, render/lock HTML, materialize or prepare a recipient snapshot, and surface counts before send time.
- Dispatch must be idempotent and resumable with claimed recipient rows.
- Rate pacing must respect Resend limits and use retry-after for rate-limit responses.
- Pause and cancel must stop future claims without corrupting already-sent rows.

### 6.4 Sendability Gate

Every send/test send should validate:

- Sender domain is configured and authenticated.
- `from_email` is allowed for the selected domain.
- Body has a visible unsubscribe link for marketing sends.
- RFC 8058 headers can be added.
- Suppression/list membership exclusions are rechecked.
- HTML size warns above 104,448 bytes.
- Media URLs are absolute HTTPS and, where imported, mirrored into our bucket.
- Physical sender identity and address footer are present for marketing campaigns.

### 6.5 Tracking And Attribution

- Resend webhooks remain primary for delivery, bounce, complaint, open, and provider click signals.
- Add first-party click redirect for internal attribution:
  - Signed redirect token.
  - Records click event.
  - Appends UTM parameters.
  - Redirects to destination.
- Open tracking must be labelled directional because Apple Mail Privacy Protection can preload remote content.
- Click tracking must account for security scanners and bot clicks.
- Site tracking should join email clicks to website/session/conversion tracking where consent and domain rules permit.

### 6.6 Compliance

- Gmail/Yahoo bulk-sender expectations: SPF/DKIM/DMARC, aligned From domain, low spam rate, visible unsubscribe, one-click unsubscribe.
- CAN-SPAM: clear opt-out, no fee/login friction, opt-outs honored within 10 business days. We should process instantly.
- Australian Spam Act alignment: consent, sender identification, and unsubscribe processing within 5 business days. We should process instantly.
- One-click unsubscribe tokens must remain functional for at least 30 days after send.

## 7. Data Model Additions

### 7.1 `email_consent_events`

Records subscriber/list consent history.

Fields:

- `id`
- `subscriber_id`
- `email`
- `list_id`
- `campaign_id`
- `event_type`
- `source`
- `actor_user_id`
- `ip_address`
- `user_agent`
- `metadata`
- `occurred_at`

### 7.2 `suppression_events`

Records every suppression signal or change.

Fields:

- `id`
- `email`
- `subscriber_id`
- `campaign_id`
- `reason`
- `action`
- `source`
- `actor_user_id`
- `metadata`
- `occurred_at`

### 7.3 Subscriber Bounce Columns

Add:

- `soft_bounce_count`
- `last_soft_bounce_at`

## 8. UX Requirements

- Subscriber detail drawer: current status, lists, consent history, suppression history, recent campaign events.
- List import review: imported count, skipped invalid, duplicates, previously unsubscribed, suppressed, and blocklisted.
- Campaign schedule modal: sendability preflight summary, recipient snapshot summary, suppression exclusions, expected send time.
- Campaign report: delivery funnel, clicks, bounces, complaints, unsubscribes, and site conversions where available.
- Suppression management: search, reason filter, manual add/remove with reason and confirmation.

## 9. Success Metrics

- No campaign can send to a globally suppressed email.
- Hard bounce and complaint create suppression history and block future sends.
- One-click unsubscribe creates a global unsubscribe and audit event in one request.
- Imports show consent source and do not silently reactivate suppressed users.
- Scheduled campaigns resume safely after an interrupted dispatch.
- Campaign links include stable attribution and are traceable to site events.

## 10. Rollout

1. Backend audit foundation.
2. Consent/suppression integration across subscribe, unsubscribe, webhook, and import paths.
3. Scheduled-send preflight and snapshot hardening.
4. First-party click redirect and UTM attribution.
5. Admin UI for history, suppression management, and campaign preflight.
6. Client-scoped media/list/domain policy.

## 11. R&D References

- Google sender guidelines: https://support.google.com/a/answer/81126
- FTC CAN-SPAM guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- RFC 8058 one-click unsubscribe: https://www.rfc-editor.org/rfc/rfc8058
- Resend webhook events: https://resend.com/docs/webhooks/event-types
- Resend batch sending: https://resend.com/docs/api-reference/emails/send-batch-emails
- Resend rate limits: https://resend.com/docs/api-reference/rate-limit
- SendGrid suppressions model: https://www.twilio.com/docs/sendgrid/api-reference/suppressions-suppressions
- Mailchimp audience status model: https://mailchimp.com/developer/marketing/guides/create-your-first-audience/
- Apple Mail Privacy Protection: https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/
- Google Analytics UTM guidance: https://support.google.com/analytics/answer/10917952
- Yahoo one-click unsubscribe guidance: https://senders.yahooinc.com/subhub/
