# Provider-neutral browser lead-context bridge

## Contract

Use `window.xf.captureLeadContext()` whenever a JavaScript-managed or
third-party form submits a real customer enquiry and needs to preserve its
browser-to-CRM correlation. It is provider-neutral: Dealer Studio, TotalDealer,
Podium, a custom CMS, and future connectors use the same browser call and pass
the returned fields through their own server-side CRM/webhook integration.

```js
const eventId = window.xf.createEventId()
const context = window.xf.captureLeadContext({ eventId })

const providerPayload = {
  ...existingProviderPayload,
  fields: {
    ...existingProviderPayload.fields,
    ...(context?.fields || {})
  }
}
```

Create the ID once after client-side validation and before the provider starts
the request. Reuse the same `eventId` and context fields for a retry of that
same request. `captureLeadContext()` may return `null` when the tag is absent or
tracking consent is denied; the provider's normal enquiry flow must still run.

The caller-owned event ID must be the opaque value returned by
`window.xf.createEventId()`. The bridge rejects arbitrary labels and form values
as IDs. It carries only the correlation ID and strictly validated opaque
platform click IDs; it omits names, email, phones, free text, cookie IDs, page
paths, referrers, UTM/campaign labels, and provider credentials.

## Connector obligations

Each provider adapter must:

1. Keep all contact fields and credentials server-side.
2. Forward returned `zeroflow_*` fields unchanged to the authenticated XeroFlow
   generic lead webhook.
3. Send a stable, provider-owned `lead_id` with every delivery and retry. Do
   not generate a new request ID for a retry.
4. Continue its normal CRM submission if context is unavailable.
5. Treat the browser `form_submit` as an attempted candidate only. A confirmed
   `generate_lead` is created only once XeroFlow accepts the CRM lead.

Provider-specific mappings belong in separate documents such as
`south-morang-dealer-studio-lead-context.md`; they must not change this public
browser contract.

## Security boundary

Do not expose webhook URLs/keys, CRM tokens, customer fields, or raw provider
responses in a browser tag, GTM, `dataLayer`, or front-end request. An optional
diagnostic `dataLayer` event may include only the opaque browser event ID and
must not be used as an advertising conversion trigger.
