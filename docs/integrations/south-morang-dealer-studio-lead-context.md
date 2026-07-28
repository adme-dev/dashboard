# South Morang Motor Group: Dealer Studio lead-context handoff

## Purpose

This is the South Morang Dealer Studio implementation of the provider-neutral
[browser lead-context bridge](./browser-lead-context.md). New providers should
follow that shared contract and document only their own payload mapping here.

Dealer Studio (or the website integration that submits to it) owns the customer
enquiry and its CRM fields. XeroFlow owns only the browser correlation and
campaign context. Forwarding the context below lets XeroFlow reconcile a
confirmed CRM lead with the browser `form_submit` event without placing names,
emails, phone numbers, messages, credentials, or webhook keys in the public
tracking tag or GTM.

The existing authenticated XeroFlow website webhook remains the only route that
creates or updates the CRM lead. A browser-side event is a correlation candidate,
not a conversion. A confirmed `generate_lead` is created only when that CRM
webhook accepts the provider's lead.

## Browser integration

Call this after the website has validated the enquiry, immediately before the
provider starts its normal submission request. Create the ID once per user
submission and retain it for any retry of the same submission.
The caller-owned ID must be the opaque value returned by
`window.xf.createEventId()`; do not substitute form data, CRM IDs, or labels.

This records an **attempted, validated submission candidate** so the provider
can carry its correlation fields in that same request. It is not a success or
conversion signal: if the provider rejects or times out, no `generate_lead` is
created. XeroFlow creates that confirmed conversion only after the CRM webhook
accepts the provider lead. The backend reconciles either arrival order.

```js
const eventId = window.xf.createEventId()
const context = window.xf.captureLeadContext({
  eventId
})

const providerPayload = {
  ...existingProviderPayload,
  fields: {
    ...existingProviderPayload.fields,
    ...(context?.fields || {})
  }
}

await submitExistingDealerStudioEnquiry(providerPayload)
```

`captureLeadContext()` returns `null` when tracking consent is denied or the
tag is unavailable. The normal enquiry request must still continue in that case.
Do not pass customer form values into this API. Its `fields` result includes only
the browser event ID and vetted opaque ad-click parameters. It deliberately
omits cookie identity, page paths, referrers, all UTM/campaign labels, free-text
form metadata, and any value that does not match a recognised click-ID format.

Do not generate a new event ID in a retry handler. Reuse the original `eventId`
and the same context fields so the browser candidate remains deduplicated.

## Server/provider forwarding

The Dealer Studio connector must forward the `zeroflow_*` fields unchanged with
the provider's existing authenticated server-to-server request to the XeroFlow
generic lead webhook. It must continue to send CRM-owned contact details in the
normal `customer` object (or the existing field mapping) and must keep the
webhook key on the server. It must also send the provider's immutable `lead_id`
for every retry of the same accepted lead; a new random request ID is not a
valid replacement.

```json
{
  "provider": "dealer_studio",
  "source": "webhook",
  "lead_id": "<stable provider or CRM lead ID>",
  "customer": {
    "full_name": "<provider-owned customer name>",
    "email": "<provider-owned customer email>"
  },
  "fields": {
    "zeroflow_browser_event_id": "<from context.fields>",
    "zeroflow_last_gclid": "<from context.fields>"
  }
}
```

Never put the webhook URL/key, CRM token, name, email, phone, or free-text
message in GTM, a public Custom HTML tag, or a browser tracking call.

## Optional GTM diagnostic

If the existing container needs a diagnostic signal, push only the correlation
identifier after the provider request has been initiated:

```js
window.dataLayer = window.dataLayer || []
window.dataLayer.push({
  event: 'xf_provider_lead_context',
  xf_browser_event_id: eventId
})
```

This is diagnostic-only. Do not use it as a Google Ads or Meta conversion
trigger and do not add customer fields to it.

## Acceptance and rollback

1. In a non-production provider environment, submit a synthetic lead with a
   known `eventId` and verify the CRM lead retains its normal email/name fields.
2. Verify the intake audit shows the same `browserEventId` and creates exactly
   one confirmed browser `generate_lead` after the CRM webhook succeeds.
3. Verify a denied-consent browser still submits its CRM lead without correlation
   context and without a browser tracking request.
4. Verify a provider retry reuses the event ID and does not create a duplicate
   browser candidate or CRM lead.
5. Verify a provider-rejected request leaves only the attempted candidate and
   never creates `generate_lead`.
6. Before a live production submission, obtain operator approval for a
   controlled test lead and use an agreed, clearly-labelled test identity.

Rollback is safe and immediate: remove the browser call/forwarded
`zeroflow_*` fields. The existing CRM enquiry workflow continues unchanged; the
only lost behaviour is browser-to-CRM attribution reconciliation.
