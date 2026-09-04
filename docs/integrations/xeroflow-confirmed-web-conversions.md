# XeroFlow Confirmed Web Conversions

XeroFlow records a form submission attempt separately from a confirmed lead.
Integrations must call the confirmed-success API only after the form provider,
CRM, or backend has acknowledged success. A click, validation attempt, or native
`submit` event is not a confirmed conversion.

## Direct API

Create one event ID for the attempt and a different event ID for the confirmed
conversion:

```js
const submissionEventId = window.xf.track('form_submit', {
  form_id: 'vehicle-enquiry'
})

providerForm.onSuccess(() => {
  const conversionEventId = window.xf.createEventId()
  window.xf.confirmLead(
    {
      form_id: 'vehicle-enquiry',
      submission_event_id: submissionEventId,
      vehicle_id: 'stock-123',
      vehicle_make: 'Toyota',
      vehicle_model: 'RAV4',
      value: 1,
      currency: 'AUD'
    },
    { eventId: conversionEventId }
  )
})
```

`confirmLead` requires a caller-owned, non-empty `eventId` of at most 128
characters. Invalid or missing IDs—and a confirmation ID that reuses
`submission_event_id`—are ignored instead of being replaced. This prevents an
ambiguous conversion from being emitted and lets browser and server-side
provider copies reuse the same confirmed-conversion ID for deduplication.

## DOM event integration

Third-party form scripts that cannot call the API directly can dispatch a
document event after confirmed success:

```js
document.dispatchEvent(new CustomEvent('xeroflow:lead-confirmed', {
  detail: {
    eventId: window.xf.createEventId(),
    form_id: 'vehicle-enquiry',
    submission_event_id: submissionEventId,
    vehicle_id: 'stock-123',
    vehicle_make: 'Toyota',
    vehicle_model: 'RAV4',
    value: 1,
    currency: 'AUD'
  }
}))
```

The listener accepts only these conversion properties:

- `form_id`
- `form_name`
- `submission_event_id`
- `vehicle_id`
- `vehicle_make`
- `vehicle_model`
- `value` (finite number)
- `currency`

All string properties are bounded before transport. Arbitrary fields—including
email, phone, names, messages, and other free text—are discarded. Contact
identity continues through the separately consented lead-reconciliation path;
it is never copied into the canonical conversion event.

## Integration rules

1. Emit `form_submit` when the visitor attempts submission.
2. Wait for authoritative success from the form provider or backend.
3. Generate a new conversion event ID; do not reuse the attempt ID.
4. Call `confirmLead` or dispatch `xeroflow:lead-confirmed` exactly once.
5. Do not infer success from navigation, a button click, or a timeout.
6. Do not include contact fields or unstructured form data.

XeroFlow still applies its consent gate. A confirmed event does not bypass a
visitor's tracking or marketing choice, and provider delivery remains subject
to the destination's activation and policy controls.
