# Design — Conversion value passing (Phase C, item 1 of 4)

Date: 2026-07-26

## Problem

Both Meta Conversions API and Google Data Manager delivery in `workers/measurement-delivery/src/providers.ts` are binary-only today — every conversion event is sent as "this happened," never "this happened and was worth $X." Confirmed by reading both provider functions: `MeasurementProviderDelivery` has no `value`/`currency` field anywhere in its type, and neither `deliverMetaConversionEvent` nor `deliverGoogleDataManagerEvent` constructs one in its request payload.

This blocks value-based bidding on both platforms — Meta and Google can only optimize toward "get more of these events," not "get more of the valuable ones," even though a real dollar figure already exists in this system at the moment a deal closes (`crm_opportunities.amount`). It's just never read into the measurement pipeline.

This is item 1 of 4 candidate Phase C (ad-spend efficiency) items identified in the `2026-07-26-phase-b-shipped-phase-c-next.md` handoff (intent-tier scoring, exclusion audiences, conversion value passing, micro-conversions). Chosen to go first: smallest, most self-contained, and the value source already exists — no new data collection required.

## Scope

**In scope:**
- `lead_won` events originating from the CRM opportunity pipeline (`opportunityStageTransition.ts`), where `crm_opportunities.amount` holds a real, deliberately-entered figure.
- Forward-only — only `lead_won` events that fire after this ships carry a value.
- AUD only (every client in this system is an Australian dealership via Xero AU integration).

**Explicitly out of scope (deliberate, not overlooked):**
- The plain leads-status `lead_won` path (`statusTransition.ts`) has no value field on the `leads` table at all. It is **not** touched — no lookup of a possibly-linked opportunity is added. It continues to deliver binary events exactly as it does today.
- `lead_lost` stays binary (no `$0` value sent). Could be a fast follow if useful later.
- No backfill/correction of historically-delivered `lead_won` events. The delivery pipeline is built around one-shot create, not update — retroactive correction would need update-capable provider calls, a separate and larger piece of work.
- `crm_opportunities.amount = 0` is treated as "value never set," not a genuine $0 deal — an opportunity worth exactly zero dollars being marked "won" is not a real scenario an account manager has reason to create, so `0` almost always just means the field was never filled in. Sending it as a real value would actively mislead value-based bidding, which is worse than sending nothing.
- No client-configurable currency. Currency is a fixed `'AUD'` constant, derived (never caller-supplied), not a per-client setting.

## Why not touch the plain-leads path

`statusTransition.ts` and `opportunityStageTransition.ts` are two independent `lead_won` pathways. Only the latter has a linked `crm_opportunities` row with a real `amount`. Rather than adding an opportunity lookup to the leads-only path (more query complexity, and still frequently empty), the simpler and equally correct behavior is: no linked opportunity, no value, exactly like today.

## Data model

New migration (e.g. `288_conversion_event_value.sql`):

```sql
BEGIN;

ALTER TABLE conversion_events
  ADD COLUMN value NUMERIC(14,2) NULL,
  ADD COLUMN currency_code TEXT NULL;

-- NOT VALID defers the constraint's validation scan so this transaction's
-- ACCESS EXCLUSIVE lock is brief. VALIDATE CONSTRAINT runs in its own
-- transaction (after this COMMIT) so its scan only needs the lighter
-- SHARE UPDATE EXCLUSIVE lock, which doesn't block reads/writes.
ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_value_currency_pair
  CHECK ((value IS NULL) = (currency_code IS NULL))
  NOT VALID;

COMMIT;

ALTER TABLE conversion_events
  VALIDATE CONSTRAINT conversion_events_value_currency_pair;
```

Purely additive: nullable columns, all existing rows already satisfy `NULL = NULL`, no backfill or table rewrite. The paired CHECK constraint makes "value without currency" or "currency without value" impossible at the DB level, even though every code path already treats them as a pair.

`value`/`currency_code` live directly on `conversion_events`, the same table `attribution` already lives on, rather than:
- **Inside the `attribution` JSONB column** — rejected. `attribution` is a strictly-typed "how do we match this event to a click/user" concern (`CanonicalAttributionSchema`). Value is a different concern ("what is this worth"); conflating them means loosening a deliberately strict schema or bolting on an untyped field.
- **A separate `conversion_event_values` side table** — rejected. Strict 1:1 relationship with `conversion_events`; splitting it out adds a join to a query (`repository.ts`'s `claimNext`) that already runs on every delivery claim, for no decoupling benefit.

## Contracts (`server/utils/measurement/contracts.ts`)

- `AppendCanonicalConversionEventSchema` gains:
  ```ts
  value: z.number().positive().max(9_999_999.99).nullable().default(null)
  ```
  No `currencyCode` in the *input* schema — currency is derived, never caller-supplied. The `9,999,999.99` cap is a deliberate business-sanity ceiling (no single vehicle deal is worth more than that), tighter than what `NUMERIC(14,2)` could physically hold — not a bug, don't "fix" it to match column precision later.
- `CanonicalConversionEventSchema` (and therefore `CanonicalConversionOutboxEventSchema`) gains both `value` and `currencyCode` as output fields, so any outbox-event reader (audit views, tests) sees the full picture.
- `outbox.ts`'s insert always derives `currency_code = input.value !== null ? 'AUD' : null` — never a caller decision.

## Value sourcing (`opportunityStageTransition.ts` only)

```ts
const amount = Number(updated.amount)
const value = canonicalEventName === 'lead_won' && Number.isFinite(amount) && amount > 0
  ? Number(amount.toFixed(2))
  : null

outbox = await deps.appendOutbox(db, {
  clientId: command.clientId,
  eventName: canonicalEventName,
  sourceSystem: 'zero_crm',
  sourceEntityType: 'crm_opportunity',
  sourceEntityId: command.opportunityId,
  sourceEventId,
  occurredAt: command.occurredAt,
  consentDecision: command.consentDecision,
  attribution: canonicalAttribution(linkedLead),
  value
})
```

The `canonicalEventName === 'lead_won'` guard is the only gate — non-`lead_won` transitions (`lead_qualified`, `lead_lost`, etc.) always pass `value: null` even when `updated.amount` happens to be set, so there's no path where a value leaks onto the wrong event type.

`statusTransition.ts` is not modified at all; it never passes `value`, so it defaults to `null`.

## Delivery-side plumbing

- `DeliveryRow` / `mapClaim` in `workers/measurement-delivery/src/repository.ts` gain `value: number | null` / `currency_code: string | null`, selected directly from `conversion_events` in the existing `claimNext` query (no new join).
- `MeasurementDeliveryClaim` (`delivery.ts`) and `MeasurementProviderDelivery` (`providers.ts`) both gain `value: number | null` and `currency: string | null` at the top level, alongside (not nested inside) the existing `attribution` object.

## Provider payloads

Field names below are confirmed against each provider's current API documentation, not assumed.

**Meta** (`deliverMetaConversionEvent`) — `lead_won` always resolves to `metaDeliveryMode === 'crm'`, never `'web'`: both `statusTransition.ts` and `opportunityStageTransition.ts` hardcode `attribution.browserEventId: null` by explicit design (a "won" outcome is a backend business decision, not a browser event), and the `'web'` mode requires a non-null `browserEventId`. So only the existing CRM/`!isWeb` branch needs the change:

```ts
custom_data: {
  lead_event_source: META_CRM_LEAD_EVENT_SOURCE,
  event_source: 'crm',
  ...(delivery.value !== null ? { value: delivery.value, currency: delivery.currency } : {})
}
```
`value` (numeric) and `currency` (ISO 4217, e.g. `"AUD"`) are standard Conversions API `custom_data` fields, valid alongside the existing CRM markers.

**Google Data Manager** (`deliverGoogleDataManagerEvent`) — added at the event root, alongside the existing `eventTimestamp`/`transactionId`:

```ts
events: [{
  adIdentifiers,
  eventTimestamp: delivery.occurredAt,
  transactionId: delivery.attribution.browserEventId ?? delivery.idempotencyKey,
  eventSource: 'WEB',
  ...(delivery.value !== null ? { conversionValue: delivery.value, currency: delivery.currency } : {})
}]
```
`conversionValue` (numeric) and `currency` (ISO 4217 string) are top-level `Event` object fields per Google's Data Manager API events:ingest documentation — not nested under `adIdentifiers` or `userData`.

Both providers already handle "field absent" correctly today (that's every event currently delivered) — omission when `value === null` introduces no new error path, only additive behavior when a real value exists.

## Idempotency & duplicate delivery

`value` is not part of the idempotency key (`sourceSystem`/`sourceEntityType`/`sourceEntityId`/`sourceEventId`/`eventName` already are), so re-processing the same underlying business event can't produce two different stored values for one `conversion_events` row.

## Testing

- `opportunityStageTransition.test.ts`: `amount = 0` → `value: null` passed to `appendOutbox`; `amount = 15000.50` → `value: 15000.5`; non-`lead_won` transitions never pass a value even with `amount` set.
- `outbox.ts` tests: `value` persists on the inserted `conversion_events` row; `currency_code` is `'AUD'` exactly when `value` is non-null, `null` otherwise.
- `providers.test.ts`: Meta CRM payload includes `custom_data.value`/`.currency` when `delivery.value` is present, omits both when `null`; Google payload includes root-level `conversionValue`/`currency` when present, omits when `null`.
- `repository.test.ts`: `claimNext`'s SELECT correctly maps `value`/`currency_code` onto the returned claim.
- A migration contract test (matching the existing `test/config/*Migration.test.ts` pattern) verifying the migration's SQL text includes the CHECK constraint pairing `value` and `currency_code` — this codebase has no test database, so migration tests assert static SQL content rather than exercising live DB rejection.

## Non-goals (deferred to later Phase C items or future work)

- Intent-tier scoring, exclusion audiences, and micro-conversions to GA4/Google Ads remain separate, unscoped Phase C items — not touched here.
- `$0` on `lead_lost`, historical backfill, and per-client currency configuration were all explicitly considered and deferred (see Scope above) rather than silently dropped.
