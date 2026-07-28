# South Morang CRM–Funnel Reconciliation Design

**Status:** approved for planning on 2026-07-28

## Problem

South Morang Motor Group's website receives the XeroFlow tag through Google Tag
Manager (GTM), and the established website webhook continues to create complete
CRM leads. The CRM is the authoritative record for customer identity and form
answers.

The browser-to-CRM correlation is absent. Recent CRM leads contain customer
email data but no `browserEventId`, campaign click IDs, or XeroFlow attribution
fields. Browser telemetry consequently records page and generic form activity,
but cannot prove that a particular CRM enquiry came from a particular journey or
publish a confirmed conversion to measurement destinations.

The live sell-your-car path is a JavaScript multi-step workflow. Its initial
native forms are registration lookup and search, not an email/phone enquiry
form. A document-wide `submit` listener therefore cannot reliably identify a
successful customer enquiry.

## Evidence

- The production tracking site is active, origin-enforced for the South Morang
  domains, and the live page successfully posts `page_view` and `cta_visible`
  events to XeroFlow.
- 96 browser `form_submit` events were stored in the preceding 30 days. None
  was lead-eligible; none created a submission intent or a `generate_lead`
  event.
- The CRM remains healthy: 16 website webhook leads were received in the same
  period in `full_crm` mode. All contain email data, while none contains a
  browser event ID, GCLID, or the existing `zeroflow_*` correlation fields.
- The existing generic webhook adapter already recognises
  `zeroflow_browser_event_id` and the XeroFlow first-/last-touch fields when
  the website provider forwards them.

## Goals

1. Keep the authenticated website webhook as the only route that stores raw
   customer name, email, phone, and submitted form fields in XeroFlow CRM.
2. Associate a successful website enquiry with its browser session and
   first-/last-touch campaign attribution.
3. Create a confirmed `generate_lead` event only after the CRM accepts the
   corresponding lead.
4. Preserve search, registration lookup, filters, logins, and abandoned forms
   as non-conversion behaviour signals.
5. Make the integration observable, testable, and recoverable without exposing
   CRM credentials or customer PII to GTM or the public tracking endpoint.

## Non-goals

- Sending raw form fields or the authenticated website-webhook secret through
  the public XeroFlow tracker.
- Treating every `submit` event, CTA click, or provider-iframe interaction as a
  customer enquiry.
- Backfilling historical browser-to-CRM joins without a trusted common ID.
- Replacing South Morang's dealer website, CRM, or provider-owned form flow.

## Research and decisions

Google's guidance is to put a named event and its variables on the data layer,
then use a Custom Event trigger; that is the appropriate boundary for an
actual lead-complete signal. It should not be inferred from page mechanics.
<https://developers.google.com/tag-platform/tag-manager/datalayer>

The platform's native `submit` event is a valid fallback for traditional forms,
but it does not fire for programmatic `form.submit()` and is not a success
receipt for application-managed or embedded workflows.
<https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event>

Consent must be established before measurement events are processed. Existing
XeroFlow consent forwarding remains the gate for both tracker events and
measurement delivery.
<https://developers.google.com/tag-platform/security/guides/consent>

**Decision:** use the CRM/provider webhook for PII and a stable, non-PII
browser correlation ID for the join. Do not create a public PII-ingestion
endpoint or monkey-patch arbitrary network requests from GTM.

## Architecture

```text
Visitor completes a real dealer enquiry
        |
        +-- Website success integration creates/uses browser_event_id
        |   and attaches XeroFlow context to the provider payload
        |   (no raw PII sent to tracking)
        |
        +-- GTM/XeroFlow tag records form_submit with that ID
        |   as a correlation candidate, not a conversion
        |
Provider / dealer server
        |
        +-- authenticated XeroFlow website webhook
              - receives PII + submitted fields
              - receives browser_event_id + attribution context
              - creates the CRM lead
              - links the browser event
              - records confirmed generate_lead
              - queues configured conversion deliveries
```

### Browser contract

The XeroFlow tag will expose a documented, non-PII lead-context API for the
website/GTM success integration. The API must:

- generate one valid browser event ID per real enquiry;
- record a `form_submit` correlation event with the supplied form identity;
- return only the event ID, anonymous/session IDs, and first-/last-touch
  attribution values;
- honour the existing tracking-consent gate;
- never return email, phone, free text, form field values, or webhook secrets;
- remain idempotent when the same success handler runs twice.

The native DOM `submit` listener stays as a fallback only for recognised,
traditional forms. It must keep excluding search, lookup, login, filter, and
other non-lead flows.

### Website and GTM contract

The South Morang website owner (or Dealer Studio/TotalDealer integration) must
call the browser API at the real form-success boundary and forward the returned
context in its server-side website webhook envelope. The forwarded keys are:

- `zeroflow_browser_event_id`
- `zeroflow_anon_id`
- `zeroflow_session_id`
- `zeroflow_landing_page`
- `zeroflow_first_*` and `zeroflow_last_*` click/UTM/referrer fields that are
  present

GTM may use a named Custom Event for Google/Meta tags, but it must not contain
raw PII. The final conversion event is confirmed by the XeroFlow CRM webhook,
not by the GTM trigger alone.

### XeroFlow webhook and CRM contract

The existing generic website webhook adapter normalises the forwarded context
into lead attribution. On CRM acceptance, the existing lead-intake path links
the matching browser event and writes the confirmed `generate_lead` signal.
Missing context leaves the CRM lead valid; it must be reported as an
unattributed lead rather than rejected or silently converted.

## Error handling and observability

- Browser context creation is fail-safe: it must never prevent the dealer form
  from submitting.
- Missing/invalid external correlation context produces a normal CRM lead plus
  a health signal for the unlinked lead; no PII goes into tracking tables.
- A duplicate browser event or webhook delivery remains idempotent.
- Portal health must show, for a selected period: CRM leads received,
  attributed CRM leads, unlinked CRM leads, reconciliation rate, latest
  successful linked lead, and the reason for any blocked conversion delivery.
- Provider webhook errors remain redacted and are monitored separately from
  browser telemetry failures.

## Test and acceptance plan

1. Unit-test the browser lead-context API: stable event IDs, no PII in its
   return value or tracking transport, consent suppression, and duplicate-safe
   calls.
2. Unit-test generic-webhook normalisation from every supported
   `zeroflow_*` field to CRM attribution.
3. Integration-test the accepted lead path: a webhook lead with an event ID
   creates the CRM lead, links the browser event, and emits exactly one
   confirmed conversion; a lead without context remains visible but unlinked.
4. Verify the live South Morang GTM/website success integration in a browser
   without entering customer data.
5. With explicit operator approval, submit one clearly marked test enquiry and
   confirm the full CRM record, attribution link, confirmed conversion, and
   delivery status. Clean up the test lead through the normal CRM process.

## Rollout and rollback

1. Deploy the XeroFlow browser API and tests first. Existing lead capture is
   unaffected.
2. Configure the South Morang website/provider success integration in a staged
   environment or GTM preview, then publish only after the non-PII context is
   visible in the authenticated webhook payload.
3. Run a controlled test enquiry and inspect portal health.
4. If the context bridge fails, disable that one GTM/website integration. The
   CRM webhook continues receiving complete customer leads and no historical
   data is lost.
