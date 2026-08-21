# Universal Lead Gateway

XeroFlow can be the lead system of record without an external CRM. A browser
form signal is useful for attribution and diagnostics, but only a trusted
server receipt creates a canonical inbox lead.

## Recommended connection order

1. Use the signed first-party gateway from the website backend or form-success
   handler when the website is under your control.
2. Use an authenticated provider webhook when the form vendor owns submission.
3. Add provider API polling with an overlap window and provider-ID deduplication
   only when reliable webhooks are unavailable.
4. Use native Meta Lead Ads and Google lead-form APIs for forms rendered inside
   those platforms; a website pixel cannot observe them.
5. Treat browser form detection as a candidate and attribution record only.

CRM delivery is optional and downstream. In `capture_only` mode, XeroFlow still
stores, routes, and reports canonical leads.

## Signed webhook protocol

Create a `first_party_gateway` or `provider_webhook` connector in Leads → Setup.
The secret is returned once. Send the exact JSON bytes to the connector URL with:

- `webhook-id`: immutable receipt identifier, reused on retries;
- `webhook-timestamp`: Unix seconds;
- `webhook-signature`: `v1,<base64 HMAC-SHA256>`;
- `content-type: application/json`.

The signed content is:

```text
<webhook-id>.<webhook-timestamp>.<exact raw request body>
```

The key is the base64url-decoded bytes after the `whsec_` prefix. XeroFlow
accepts the current secret and the previous secret for 30 minutes after a
rotation. Signatures outside the five-minute replay window are rejected.

The body uses `lead.submitted.v1`:

```json
{
  "type": "lead.submitted.v1",
  "id": "provider-event-123",
  "occurredAt": "2026-08-21T08:00:00+10:00",
  "provider": "first_party",
  "source": "webhook",
  "enquiryType": "finance",
  "form": { "id": "finance-form", "name": "Finance application" },
  "customer": { "fullName": "Test Customer", "email": "test@example.com" },
  "fields": {},
  "attribution": { "browserEventId": "browser-event-id" },
  "consentDecision": "granted",
  "test": { "isTest": false }
}
```

Allowed enquiry types are `stock`, `finance`, `test_drive`, `contact`, and
`model_variant`. The signed connector is authoritative for this type. Browser
text or page heuristics cannot select a live conversion destination.

## Safe end-to-end tests

The setup panel creates a 15-minute, one-use, origin-bound test URL. The tag
records append-only evidence for tracker load, candidate creation, and explicit
provider success. A canonical test succeeds only after the signed receipt is
accepted and the test lead is stored.

Synthetic leads carry both `is_test=true` and `test_run_id`. They are excluded
from default inbox and portal metrics and cannot trigger normal conversion
delivery, routing rules, outbound destinations, CRM promotion, timeline bridges,
or staff notifications. Provider validation runs through its separate
validate-only path.

## Exact conversion routing

For typed `web_conversion` events, XeroFlow selects only an exact enquiry-type
match. An unknown or missing trusted type pauses with `unmapped_enquiry_type`;
it never falls back to every aggregate action. A legacy browser-only aggregate
mapping remains valid when it is the sole matching destination. If several
aggregate website actions match, delivery pauses with
`ambiguous_aggregate_web_conversion` instead of counting every action.

## Operational checks

- Connector status, last attempt, last accepted receipt, duplicate count,
  replay rejection count, and redacted error class are available in the setup
  panel and integration health scan.
- Retry with the same `webhook-id`; XeroFlow deduplicates it.
- Never place the signing secret in browser JavaScript.
- Never claim a browser submit event is a confirmed lead without the trusted
  server receipt.
