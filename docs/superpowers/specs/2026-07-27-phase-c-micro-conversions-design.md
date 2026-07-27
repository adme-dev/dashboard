# Design — Micro-Conversions to GA4/Google Ads (Phase C, item 4 of 4)

Date: 2026-07-27

## Problem

Phase C's conversion-delivery pipeline (item 1) only knows 7 CRM-lifecycle canonical event names (`lead_created` … `purchase`) and delivers to Meta CAPI / Google Data Manager. Meanwhile GA4 has zero write-direction integration anywhere in this codebase — everything GA4-related today (`ga4Client.ts`, `ga4Sync.ts`, `ga4DimensionSync.ts`) is read-only reporting via the Data/Admin API. Three real, already-firing browser signals — `phone_click`, `add_to_wishlist`, `form_submit` — are tracked in `crm_customer_signals` for persona scoring but never reach Google Ads as upper-funnel conversion signal, despite being exactly the kind of engagement action Smart Bidding benefits from.

This item closes that gap: deliver these three signals to GA4 via Measurement Protocol, and let each client's own GA4↔Google Ads Link (a one-time setup in Google's own UI) surface them as Google Ads conversions — no separate Data Manager call for these events.

## Scope

### In scope (v1)
- Three new canonical conversion events — `phone_click`, `add_to_wishlist`, `form_submit` — sourced from signals that already fire in `track.js` today. No new client-side triggers.
- Binary conversions only, no assigned monetary value.
- Delivery to GA4 Measurement Protocol only. Google Ads sees these through each client's GA4↔Google Ads Link, configured in Google's UI — documented as an operator step, not built here.
- A `track.js` addition to capture the real GA4 `_ga` cookie value, so server-side Measurement Protocol hits correlate with the visitor's actual GA4 session instead of creating disconnected synthetic users.
- Reuses the existing measurement/outbox/queue pipeline from item 1 end-to-end: new canonical event names, a new `ga4` platform, a new provider function — not new infrastructure.

### Explicitly out of scope (deferred, not overlooked)
- **Meta delivery for these signals.** The item's own name specifies GA4/Google Ads; Meta is a deliberately different scope from items 1-3, which delivered to both platforms equally.
- **Any signal needing new client-side instrumentation** (`finance_calculator_interact`, `test_drive_booking`, `trade_in_start`/`trade_in_complete`) — these are wired through consent-gating and signal classification already, but never actually emitted by `track.js`'s shipped code. A candidate follow-up, not this item.
- **Assigned/notional conversion values** (e.g. "a phone click is worth $5") — a business/product decision nobody has made, not an engineering one. The schema doesn't preclude adding it later (item 1's `value`/`currency_code` columns are already nullable and reusable).
- **Direct Google Ads delivery via Data Manager for these specific events.** Relies on the GA4↔Ads Link instead — see "Why this shape" below.
- **Any UI for configuring a client's GA4 destination.** Matches the API-only pattern items 2 and 3 both shipped with — this is now the third Phase C item deferring UI; worth tracking as one shared follow-up rather than three separate footnotes.
- **Migration numbering** assumes PR #309 (item 3, migration 312) merges first — this plan targets migration 313. Needs renumbering if that assumption is wrong by implementation time.

## Why This Shape

**Delivery target: GA4 Measurement Protocol only, not a second direct Data Manager call.** Google's own documented pattern for "conversions flowing from GA4 into Google Ads" is exactly this: send events to GA4 once, mark them as GA4 "key events," and let the GA4↔Google Ads Link (configured once per client in Google's UI) auto-import them as Google Ads conversion actions. Sending to both GA4 MP and Data Manager directly would double the delivery surface for these three events and risk double-counting the same conversion in Google Ads unless carefully deduped in Google's own settings — real risk with no upside once the Link is the standard way to do this.

**Signal scope: only currently-firing signals.** Matches how both item 2 (intent tiers) and item 3 (exclusion audiences) scoped themselves — ship the binary case fast using signals that already flow into the system, defer anything needing new instrumentation as a named follow-up rather than blocking this item on it.

**Trigger point: `eventPersistence.ts`'s existing browser-conversion promotion, not a new mechanism.** `buildBrowserCanonicalConversion()` already promotes qualifying tracking-event rows into the canonical conversion pipeline, per-row, transactionally isolated via its own savepoint, independent of the persona-identity feature flag (unlike `signalLedger.ts`'s `appendTrackingSignals`, which is gated behind `isPersonaIdentityEnabled`). Today it only recognizes `generate_lead`. Extending its condition to also match the three new event names — and passing `event_name` straight through as the canonical name — reuses 100% of the existing idempotency, consent-gating, and transactional-isolation machinery for a case (browser-originated tracking-event conversions) the schema already anticipated via `sourceEntityType: 'tracking_event'`.

## Data Model

Migration `313_ga4_micro_conversions.sql`. Both `platform` and `canonical_event_name`/`event_name` are enforced by `CHECK` constraints at the DB layer across 5 constraint sites (not just Zod) — widened following this codebase's existing `DROP CONSTRAINT`/`ADD CONSTRAINT` pattern for enum widenings (migration 288):

```sql
BEGIN;

-- GA4 becomes a third measurement platform alongside meta/google_data_manager,
-- delivering browser-tracking-event micro-conversions (phone_click,
-- add_to_wishlist, form_submit) via GA4 Measurement Protocol. Google Ads sees
-- these through each client's own GA4-Google Ads Link (configured in Google's
-- UI, not built here) rather than a second, direct Data Manager call.
ALTER TABLE conversion_destinations
  DROP CONSTRAINT IF EXISTS conversion_destinations_platform_check;
ALTER TABLE conversion_destinations
  ADD CONSTRAINT conversion_destinations_platform_check
  CHECK (platform IN ('meta', 'google_data_manager', 'ga4'));

ALTER TABLE conversion_destination_capabilities
  DROP CONSTRAINT IF EXISTS conversion_destination_capabilities_platform_check;
ALTER TABLE conversion_destination_capabilities
  ADD CONSTRAINT conversion_destination_capabilities_platform_check
  CHECK (platform IN ('meta', 'google_data_manager', 'ga4'));

ALTER TABLE conversion_destination_capabilities
  DROP CONSTRAINT IF EXISTS conversion_destination_capabilities_mode_check;
ALTER TABLE conversion_destination_capabilities
  ADD CONSTRAINT conversion_destination_capabilities_mode_check
  CHECK (mode IN (
    'meta_pixel', 'meta_web_capi', 'meta_crm_capi', 'meta_conversion_leads',
    'google_tag_enhanced_conversions', 'google_enhanced_conversions_for_leads',
    'google_data_manager', 'ga4_measurement_protocol'
  ));

-- New canonical event names for browser-originated micro-conversions.
-- lead_status_events.canonical_event_name is untouched — these signals
-- aren't CRM lead-status transitions, same reason purchase/web_conversion
-- are already absent from that table's narrower check.
ALTER TABLE conversion_event_mappings
  DROP CONSTRAINT IF EXISTS conversion_event_mappings_canonical_event_name_check;
ALTER TABLE conversion_event_mappings
  ADD CONSTRAINT conversion_event_mappings_canonical_event_name_check
  CHECK (canonical_event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion',
    'phone_click', 'add_to_wishlist', 'form_submit'
  ));

ALTER TABLE conversion_events
  DROP CONSTRAINT IF EXISTS conversion_events_event_name_check;
ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_event_name_check
  CHECK (event_name IN (
    'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',
    'lead_lost', 'purchase', 'web_conversion',
    'phone_click', 'add_to_wishlist', 'form_submit'
  ));

-- Real GA4 client_id (parsed from the _ga cookie), threaded alongside the
-- existing per-attribution-identifier columns (gclid, gbraid, wbraid, fbclid,
-- fbc, fbp, ttclid, msclkid, li_fat_id) so server-side Measurement Protocol
-- hits correlate with the visitor's actual GA4 session instead of creating a
-- disconnected synthetic user.
ALTER TABLE tracking_events
  ADD COLUMN IF NOT EXISTS ga_client_id TEXT NULL;

COMMIT;
```

**Verification needed at implementation time**: this assumes Postgres's default auto-generated constraint names (`<table>_<column>_check`), matching migration 288's precedent. Confirm against the live schema before relying on `DROP CONSTRAINT IF EXISTS` — if the real name differs, the old narrow constraint would silently keep restricting values alongside a new, differently-named one.

## Signal Capture & Promotion

**`public/track.js`**: parse the existing `_ga` cookie (format `GA1.1.<part1>.<part2>` or `GA1.2.<part1>.<part2>`), extract the `<part1>.<part2>` portion — the actual GA4 client_id — and include it in the event payload as a new field, threaded through `event-insert.ts`'s row builder into the new `ga_client_id` column.

**`server/utils/tracking/browserCanonicalConversion.ts`**: extend `buildBrowserCanonicalConversion()`'s condition from matching only `generate_lead` to also match `phone_click`, `add_to_wishlist`, `form_submit` (same `marketingConsent === 'granted'` gate), passing `input.row.event_name` straight through as the canonical event name instead of hardcoding `'web_conversion'` — these signal keys are already the new canonical event names, by design, so no separate name-mapping table is needed. The `attribution` object gains `gaClientId: input.row.ga_client_id`, a new optional field on `contracts.ts`'s `attribution` sub-schema (currently `{ browserEventId, metaLeadId, gclid, gbraid, wbraid }`) — ignored by the Meta and Google Data Manager providers, read only by the new GA4 provider.

## GA4 Provider & Platform Wiring

**`contracts.ts`**: `CanonicalEventNameSchema` gains `'phone_click'`, `'add_to_wishlist'`, `'form_submit'`; `MeasurementPlatformSchema` gains `'ga4'`; `CapabilityModeSchema` gains `'ga4_measurement_protocol'`.

**Generalizing platform/capability-mode validation.** `ConversionDestinationCreateSchema`'s `superRefine` currently assumes exactly two platforms via a binary ternary (`destination.platform === 'meta' ? mode.startsWith('meta_') : mode.startsWith('google_')`) — this silently mis-validates a third platform, since `ga4` would fall into the `else` branch and incorrectly require `google_`-prefixed modes. Replace with an explicit map:
```ts
const PLATFORM_MODE_PREFIX: Record<string, string> = {
  meta: 'meta_',
  google_data_manager: 'google_',
  ga4: 'ga4_'
}
const belongsToPlatform = capability.mode.startsWith(PLATFORM_MODE_PREFIX[destination.platform])
```

**Credential model — no new storage mechanism.** `ConversionDestinationCreateSchema` already has `externalDestinationId` (generic string) and `credentialRef` (nullable, generic secret reference). For a `ga4` destination: `externalDestinationId` holds the GA4 `measurement_id` (e.g. `G-XXXXXXX`), `credentialRef` holds a reference to the securely-stored `api_secret`, resolved through the same generic mechanism already used for Meta/Google credentials. No OAuth, no `socialConnectionId` — GA4 Measurement Protocol isn't OAuth-based, unlike the other two platforms.

**New provider function** in `workers/measurement-delivery/src/providers.ts`, alongside the existing Meta CAPI and Google Data Manager senders:
```
POST https://www.google-analytics.com/mp/collect?measurement_id={measurement_id}&api_secret={api_secret}
Body: { client_id: attribution.gaClientId, events: [{ name: eventName, params: {} }] }
```
If `attribution.gaClientId` is null, the event is skipped for GA4 delivery specifically — sending a fabricated client_id would recreate the disconnected-user problem this design exists to avoid. This is a per-provider skip, not a failure; the same canonical event still delivers normally to any other destination that client has configured.

## Error Handling & Edge Cases

- **Missing `gaClientId`**: skip GA4 delivery for that event only (not retryable) — see above.
- **No GA4 destination configured for a client**: the event is still written to `conversion_events`/the outbox; the existing per-client dispatch loop simply finds no active `ga4` mapping and does nothing for that provider — already how it behaves today for any client missing a Meta destination. No new logic needed.
- **Duplicate delivery**: inherited for free via the existing outbox's per-event idempotency key.
- **GA4 Measurement Protocol's `204`-always response.** GA4 MP returns `204 No Content` on essentially every request, including malformed ones — there's no reliable way to detect GA4-side rejection at delivery time in production (a separate `/debug/mp/collect` endpoint exists for development-time validation, not the live path). The provider function can only confirm "successfully POSTed"; genuine payload-level rejections may go silently unnoticed by design of the API itself — a documented limitation, not an engineering gap to close.
- **Consent**: already gated at promotion time (`marketingConsent === 'granted'`), inherited from the existing check.

## Testing

- Migration test asserting the widened CHECK constraints, mirroring this codebase's existing migration-test convention.
- Extend `buildBrowserCanonicalConversion`'s existing test coverage: each of the 3 new event names promotes correctly when consent is granted, still returns `null` for irrelevant event names and ungranted consent.
- New unit tests for the GA4 provider function: correct URL/body shape, and the null-`gaClientId` skip behavior.
- Test for the generalized `superRefine` across all three platforms now, not just two: a `ga4` destination with `ga4_measurement_protocol` capability passes; mismatched platform/mode-prefix combinations still fail for `meta` and `google_data_manager` as before.

## Non-Goals (deferred to future work)

- Meta delivery for these signals.
- Assigned/notional conversion values.
- New client-side instrumentation for `finance_calculator_interact`, `test_drive_booking`, `trade_in_start`/`trade_in_complete`.
- Direct Google Ads delivery via Data Manager for these specific events.
- Any UI for configuring a client's GA4 destination, or for any Phase C conversion/audience configuration generally — items 2, 3, and 4 have now all shipped API-only; this is a single shared follow-up (a configuration UI covering tier/exclusion/GA4-destination setup), not three separate ones.

This is the last of the four original Phase C (ad-spend efficiency) items. With this design approved and implemented, all four items (conversion value passing, intent-tier scoring, exclusion audiences, micro-conversions) will have moved from brainstorm to built.
