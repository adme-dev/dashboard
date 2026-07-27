# Micro-Conversions to GA4 (Phase C, item 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver three already-firing browser signals (`phone_click`, `add_to_wishlist`, `form_submit`) to GA4 via Measurement Protocol, letting each client's own GA4↔Google Ads Link surface them as Google Ads conversions — no Meta, no assigned value, no new client-side triggers.

**Architecture:** Extends item 1's existing measurement/outbox/queue pipeline end-to-end: three new canonical event names, `ga4` as a third measurement platform, and one new provider function — reusing all existing consent-gating, idempotency, and transactional-isolation machinery. `track.js` gains one addition (capturing the real GA4 `_ga` cookie) so server-side hits correlate with the visitor's actual GA4 session.

**Tech Stack:** Nitro server routes, Neon Postgres, Zod validation, Cloudflare Queue-backed delivery worker (`workers/measurement-delivery`), Vitest.

**Design doc:** `docs/superpowers/specs/2026-07-27-phase-c-micro-conversions-design.md`

## Global Constraints

- **Do not run the migration against the production database as part of this plan.** Author the SQL and its static-text test only. Running `psql` against production requires a separate, explicit user go-ahead — the established pattern for every migration in this Phase C effort.
- **Migration number is 313, assuming PR #309 (item 3, migration 312) merges first.** If that assumption is wrong by the time this plan executes, renumber the migration file and its test before proceeding — check `ls server/database/migrations/ | sort -t_ -k1 -n | tail -3` first.
- All new attribution-style identifiers use the same nullable-string convention as `gclid`/`gbraid`/`wbraid`/`fbc`/`fbp` throughout this codebase — never a required field, always `null` when absent.
- No assigned monetary value for these three events — they are binary conversions. Do not touch `value`/`currency_code` handling.
- No Meta delivery for these three events — GA4 only.
- Run a single test file with `pnpm exec vitest run <path>`; run the full suite with `pnpm exec vitest run`.

---

### Task 1: Migration 313 — data model

**Files:**
- Create: `server/database/migrations/313_ga4_micro_conversions.sql`
- Test: `test/config/ga4MicroConversionsMigration.test.ts`

**Interfaces:**
- Produces: 3 new canonical event names on `conversion_events.event_name` and `conversion_event_mappings.canonical_event_name`; `'ga4'` on `conversion_destinations.platform` and `conversion_destination_capabilities.platform`; `'ga4_measurement_protocol'` on `conversion_destination_capabilities.mode`; `tracking_events.ga_client_id TEXT NULL`. Task 3 reads the new column; Task 2 mirrors these same enum values in Zod.

- [ ] **Step 1: Write the failing migration test**

Create `test/config/ga4MicroConversionsMigration.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/313_ga4_micro_conversions.sql',
  import.meta.url
)

describe('GA4 micro-conversions migration 313', () => {
  it('widens platform/event-name checks for ga4 and adds tracking_events.ga_client_id', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('conversion_destinations_platform_check')
    expect(migration).toContain('conversion_destination_capabilities_platform_check')
    expect(migration).toContain('conversion_destination_capabilities_mode_check')
    expect(migration).toContain('conversion_event_mappings_canonical_event_name_check')
    expect(migration).toContain('conversion_events_event_name_check')
    expect(migration).toMatch(/CHECK \(platform IN \('meta', 'google_data_manager', 'ga4'\)\)/)
    expect(migration).toContain("'ga4_measurement_protocol'")
    expect(migration).toMatch(/CHECK \(canonical_event_name IN \(\s*'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',\s*'lead_lost', 'purchase', 'web_conversion',\s*'phone_click', 'add_to_wishlist', 'form_submit'\s*\)\)/)
    expect(migration).toMatch(/CHECK \(event_name IN \(\s*'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',\s*'lead_lost', 'purchase', 'web_conversion',\s*'phone_click', 'add_to_wishlist', 'form_submit'\s*\)\)/)
    expect(migration).toMatch(/ALTER TABLE tracking_events\s+ADD COLUMN IF NOT EXISTS ga_client_id TEXT NULL;/)
    expect(migration).toContain('COMMIT;')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/config/ga4MicroConversionsMigration.test.ts`
Expected: FAIL — the migration file doesn't exist yet.

- [ ] **Step 3: Write the migration**

Create `server/database/migrations/313_ga4_micro_conversions.sql`:

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/config/ga4MicroConversionsMigration.test.ts`
Expected: PASS

- [ ] **Step 5: Verify the assumed constraint names against the live schema**

Run: `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-) && psql "$DATABASE_URL" -c "\d conversion_destinations" -c "\d conversion_destination_capabilities" -c "\d conversion_event_mappings" -c "\d conversion_events"`
Confirm the constraint names shown (e.g. under "Check constraints:") match exactly what this migration's `DROP CONSTRAINT IF EXISTS` clauses target. If a name differs, update the migration file's `DROP CONSTRAINT IF EXISTS` line(s) to match before proceeding — do NOT run this migration against production; this step only reads the existing schema to verify naming.

- [ ] **Step 6: Commit**

```bash
git add server/database/migrations/313_ga4_micro_conversions.sql test/config/ga4MicroConversionsMigration.test.ts
git commit -m "feat(measurement): migration 313 — GA4 micro-conversions data model"
```

---

### Task 2: `contracts.ts` — new enum values, attribution field, generalized validation

**Files:**
- Modify: `server/utils/measurement/contracts.ts`
- Test: `test/server/utils/measurement/contracts.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure Zod schema changes, mirroring migration 313's DB constraints).
- Produces: `CanonicalEventNameSchema` including `'phone_click' | 'add_to_wishlist' | 'form_submit'`; `MeasurementPlatformSchema` including `'ga4'`; `CapabilityModeSchema` including `'ga4_measurement_protocol'`; `CanonicalAttributionSchema`/`AppendCanonicalConversionEventSchema`/`CanonicalConversionEventSchema` attribution shape gaining `gaClientId: string | null`. Task 5 consumes the new attribution field; Task 3's row plumbing is independent of this file.

- [ ] **Step 1: Write the failing tests**

Add these tests to `test/server/utils/measurement/contracts.test.ts`. Insert the `CanonicalEventNameSchema`/`MeasurementPlatformSchema` import additions into the existing import block at the top:

```ts
import {
  ActivateMeasurementProfileSchema,
  ApproveMeasurementActivationSchema,
  CanonicalConversionEventSchema,
  CanonicalEventNameSchema,
  ClientMeasurementProfileCreateSchema,
  ConversionDestinationCreateSchema,
  ConversionDestinationReadModelSchema,
  CreateConversionDestinationConfigurationSchema,
  MeasurementPlatformSchema,
  RecordDestinationValidationEvidenceSchema,
  UpdateConversionDestinationConfigurationSchema
} from '../../../../server/utils/measurement/contracts'
```

Add a new `describe` block anywhere in the file (e.g. right after the `ConversionDestinationCreateSchema` describe block):

```ts
describe('GA4 micro-conversion schema additions', () => {
  it('accepts the three new canonical micro-conversion event names', () => {
    expect(CanonicalEventNameSchema.safeParse('phone_click').success).toBe(true)
    expect(CanonicalEventNameSchema.safeParse('add_to_wishlist').success).toBe(true)
    expect(CanonicalEventNameSchema.safeParse('form_submit').success).toBe(true)
  })

  it('accepts ga4 as a measurement platform', () => {
    expect(MeasurementPlatformSchema.safeParse('ga4').success).toBe(true)
  })

  it('accepts a ga4 destination with a ga4_measurement_protocol capability', () => {
    const result = ConversionDestinationCreateSchema.safeParse({
      profileId: PROFILE_ID,
      platform: 'ga4',
      externalDestinationId: 'G-ABCDEFG123',
      capabilities: [
        { mode: 'ga4_measurement_protocol', managementOrigin: 'zero', canZeroMutate: true }
      ]
    })

    expect(result.success).toBe(true)
  })

  it('still rejects a capability mode that does not belong to the ga4 platform', () => {
    const result = ConversionDestinationCreateSchema.safeParse({
      profileId: PROFILE_ID,
      platform: 'ga4',
      externalDestinationId: 'G-ABCDEFG123',
      capabilities: [
        { mode: 'meta_crm_capi', managementOrigin: 'zero', canZeroMutate: true }
      ]
    })

    expect(result.success).toBe(false)
  })

  it('still rejects a google_data_manager destination with a meta capability, and a meta destination with a google capability', () => {
    const googleWithMeta = ConversionDestinationCreateSchema.safeParse({
      profileId: PROFILE_ID,
      platform: 'google_data_manager',
      externalDestinationId: 'customers/4221552633',
      capabilities: [{ mode: 'meta_crm_capi', managementOrigin: 'zero', canZeroMutate: true }]
    })
    const metaWithGoogle = ConversionDestinationCreateSchema.safeParse({
      profileId: PROFILE_ID,
      platform: 'meta',
      externalDestinationId: '573284833843027',
      capabilities: [{ mode: 'google_data_manager', managementOrigin: 'zero', canZeroMutate: true }]
    })

    expect(googleWithMeta.success).toBe(false)
    expect(metaWithGoogle.success).toBe(false)
  })

  it('normalizes a missing GA4 client ID to null and accepts a present one', () => {
    const { attribution: _attribution, ...eventWithoutAttribution } = {
      eventId: '33333333-3333-4333-8333-333333333333',
      clientId: CLIENT_ID,
      eventName: 'phone_click' as const,
      sourceSystem: 'browser' as const,
      sourceEntityType: 'tracking_event' as const,
      sourceEntityId: '44444444-4444-4444-8444-444444444444',
      sourceEventId: 'tracking:55555555-5555-4555-8555-555555555555:44444444-4444-4444-8444-444444444444',
      occurredAt: '2026-07-27T03:30:00.000Z',
      idempotencyKey: 'client:tracking:phone_click',
      configVersion: 1,
      consentMode: 'consent_gated' as const
    }
    const withoutGaClientId = CanonicalConversionEventSchema.parse(eventWithoutAttribution)
    expect(withoutGaClientId.attribution.gaClientId).toBeNull()

    const withGaClientId = CanonicalConversionEventSchema.parse({
      ...eventWithoutAttribution,
      attribution: { gaClientId: '1234567890.1234567890' }
    })
    expect(withGaClientId.attribution.gaClientId).toBe('1234567890.1234567890')
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm exec vitest run test/server/utils/measurement/contracts.test.ts`
Expected: the pre-existing tests still PASS; the new `describe` block's tests FAIL (`'phone_click'` etc. not yet valid enum values, `'ga4'` not a valid platform, `gaClientId` not yet a recognized attribution field).

- [ ] **Step 3: Implement the changes in `contracts.ts`**

Update `CanonicalEventNameSchema`:

```ts
export const CanonicalEventNameSchema = z.enum([
  'lead_created',
  'lead_contacted',
  'lead_qualified',
  'lead_won',
  'lead_lost',
  'purchase',
  'web_conversion',
  'phone_click',
  'add_to_wishlist',
  'form_submit'
])
```

Update `MeasurementPlatformSchema` and `CapabilityModeSchema`:

```ts
export const MeasurementPlatformSchema = z.enum(['meta', 'google_data_manager', 'ga4'])
export const CapabilityModeSchema = z.enum([
  'meta_pixel',
  'meta_web_capi',
  'meta_crm_capi',
  'meta_conversion_leads',
  'google_tag_enhanced_conversions',
  'google_enhanced_conversions_for_leads',
  'google_data_manager',
  'ga4_measurement_protocol'
])
```

Update `ConversionDestinationCreateSchema`'s `superRefine` to generalize the platform/mode-prefix check from a binary ternary to an explicit map:

```ts
const PLATFORM_MODE_PREFIX: Record<string, string> = {
  meta: 'meta_',
  google_data_manager: 'google_',
  ga4: 'ga4_'
}

export const ConversionDestinationCreateSchema = z.strictObject({
  profileId: z.string().uuid(),
  platform: MeasurementPlatformSchema,
  socialConnectionId: z.string().uuid().nullable().default(null),
  externalDestinationId: z.string().trim().min(1).max(255),
  credentialRef: MeasurementProviderCredentialRefSchema.nullable().default(null),
  enabled: z.boolean().default(false),
  environment: MeasurementEnvironmentSchema.default('test'),
  capabilities: z.array(CapabilityStateSchema).min(1).max(CapabilityModeSchema.options.length)
}).superRefine((destination, ctx) => {
  const seen = new Set<string>()
  destination.capabilities.forEach((capability, index) => {
    if (seen.has(capability.mode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities', index, 'mode'],
        message: 'Capability modes must be unique within a destination'
      })
    }
    seen.add(capability.mode)

    const belongsToPlatform = capability.mode.startsWith(PLATFORM_MODE_PREFIX[destination.platform])
    if (!belongsToPlatform) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities', index, 'mode'],
        message: 'Capability mode does not belong to the destination platform'
      })
    }
  })
})
```

(Only the `superRefine` body changes — the rest of `ConversionDestinationCreateSchema`'s field definitions are unchanged. Add the `PLATFORM_MODE_PREFIX` constant immediately above this schema.)

Update `CanonicalAttributionSchema` and `EMPTY_CANONICAL_ATTRIBUTION`:

```ts
const CanonicalAttributionSchema = z.strictObject({
  browserEventId: z.string().trim().min(1).max(128).nullable().default(null),
  metaLeadId: z.string().regex(/^\d{15,16}$/, 'Meta lead ID must contain 15 or 16 digits').nullable().default(null),
  gclid: z.string().trim().min(1).max(512).nullable().default(null),
  gbraid: z.string().trim().min(1).max(512).nullable().default(null),
  wbraid: z.string().trim().min(1).max(512).nullable().default(null),
  gaClientId: z.string().trim().min(1).max(128).nullable().default(null)
})

const EMPTY_CANONICAL_ATTRIBUTION = {
  browserEventId: null,
  metaLeadId: null,
  gclid: null,
  gbraid: null,
  wbraid: null,
  gaClientId: null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/measurement/contracts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/measurement/contracts.ts test/server/utils/measurement/contracts.test.ts
git commit -m "feat(measurement): GA4 platform, micro-conversion event names, gaClientId attribution"
```

---

### Task 3: `event-insert.ts` + `eventPersistence.ts` — `ga_client_id` row/column plumbing

**Files:**
- Modify: `server/utils/tracking/event-insert.ts`
- Modify: `server/utils/tracking/eventPersistence.ts`
- Test: `test/server/utils/tracking/event-insert.test.ts`

**Interfaces:**
- Consumes: `tracking_events.ga_client_id` column from Task 1 (referenced only in SQL text).
- Produces: `TrackingEventRow.ga_client_id: string | null`, populated from a new `attribution.ga_client_id` batch payload key. Task 5 reads this field off `TrackingEventRow`.

- [ ] **Step 1: Write the failing test**

Add this test to `test/server/utils/tracking/event-insert.test.ts`, inside the existing `describe('buildEventRows', ...)` block:

```ts
  it('flattens the GA4 client ID alongside the other attribution identifiers', () => {
    const rows = buildEventRows(site, {
      events: [{
        ...payload.events[0],
        attribution: {
          ...payload.events[0].attribution,
          ga_client_id: '1234567890.1234567890'
        }
      }]
    }, ctx)

    expect(rows[0].ga_client_id).toBe('1234567890.1234567890')
  })

  it('defaults a missing GA4 client ID to null', () => {
    const rows = buildEventRows(site, payload, ctx)

    expect(rows[0].ga_client_id).toBeNull()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/server/utils/tracking/event-insert.test.ts`
Expected: FAIL — `rows[0].ga_client_id` is `undefined` (the field doesn't exist on the built row yet), not `null`/the expected value.

- [ ] **Step 3: Implement the changes**

In `server/utils/tracking/event-insert.ts`, add `ga_client_id` to `ATTR_KEYS` and to the `TrackingEventRow` interface:

```ts
export interface TrackingEventRow {
  site_id: string
  client_id: string
  event_id: string
  anon_id: string
  session_id: string | null
  event_name: string
  page_url: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  fbclid: string | null
  fbc: string | null
  fbp: string | null
  ttclid: string | null
  msclkid: string | null
  li_fat_id: string | null
  ga_client_id: string | null
  event_data: Record<string, unknown>
  consent: unknown
  ua: string | null
  ip_hash: string | null
  origin: string | null
  occurred_at: string | null
}

const ATTR_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'fbc', 'fbp', 'ttclid', 'msclkid', 'li_fat_id',
  'ga_client_id'
] as const
```

(No other lines in `buildEventRows` change — it already spreads `flat` generically from `ATTR_KEYS`.)

In `server/utils/tracking/eventPersistence.ts`, add `ga_client_id` to the INSERT statement's column list, its `VALUES` placeholder list, and `insertParams`:

```ts
const INSERT_TRACKING_EVENT_SQL = `
  INSERT INTO tracking_events (
    site_id, client_id, event_id, anon_id, session_id, event_name, page_url, referrer,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    gclid, gbraid, wbraid, fbclid, fbc, fbp, ttclid, msclkid, li_fat_id, ga_client_id,
    event_data, consent, ua, ip_hash, origin, occurred_at
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
          $23,$24,$25,$26,$27,$28,$29)
  ON CONFLICT (site_id, event_id) DO NOTHING
  RETURNING event_id
`

function insertParams(row: TrackingEventRow): unknown[] {
  return [
    row.site_id, row.client_id, row.event_id, row.anon_id, row.session_id, row.event_name,
    row.page_url, row.referrer, row.utm_source, row.utm_medium, row.utm_campaign,
    row.utm_term, row.utm_content, row.gclid, row.gbraid, row.wbraid, row.fbclid,
    row.fbc, row.fbp, row.ttclid, row.msclkid, row.li_fat_id, row.ga_client_id,
    JSON.stringify(row.event_data), JSON.stringify(row.consent), row.ua, row.ip_hash,
    row.origin, row.occurred_at
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/server/utils/tracking/event-insert.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/tracking/event-insert.ts server/utils/tracking/eventPersistence.ts test/server/utils/tracking/event-insert.test.ts
git commit -m "feat(tracking): thread ga_client_id through tracking_events row insertion"
```

---

### Task 4: `track.js` — capture the real GA4 `_ga` cookie

**Files:**
- Modify: `public/track.js`
- Test: `test/public/track-tag.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (client-side only).
- Produces: a `ga_client_id` key in the batch's per-event `attribution` object — must match `ATTR_KEYS`' `'ga_client_id'` entry from Task 3 exactly (same key name) for the server-side flattening in `buildEventRows` to pick it up.

- [ ] **Step 1: Write the failing test**

Add this test to `test/public/track-tag.test.ts`, inside the existing `describe('public/track.js transport', ...)` block (after the `beforeEach`, alongside the other transport tests — find an existing `it('forwards the raw _xf_consent cookie...')` test nearby as your insertion point):

```ts
  it('parses the real GA4 client_id out of the _ga cookie and includes it in the batch attribution', () => {
    document.cookie = '_ga=GA1.2.1234567890.1234567890; path=/'
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    ;(window as any).xf.track('page_view', {})

    const parsed = parseTrackPayload(JSON.parse(requests[0]!.body))
    expect(parsed.events[0]!.attribution?.ga_client_id).toBe('1234567890.1234567890')
  })

  it('sends a null GA4 client_id when the _ga cookie is absent', () => {
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    ;(window as any).xf.track('page_view', {})

    const parsed = parseTrackPayload(JSON.parse(requests[0]!.body))
    expect(parsed.events[0]!.attribution?.ga_client_id ?? null).toBeNull()
  })
```

This mirrors the exact setup other tests in this file already use: `loadTag()`, then `xf.init({ writeKey: 'TESTKEY' })`, then reset `requests = []` before the action under test, then call `xf.track(...)` and read `requests[0].body`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/public/track-tag.test.ts`
Expected: FAIL — `parsed.events[0].attribution.ga_client_id` is `undefined`, not the expected cookie-derived value.

- [ ] **Step 3: Implement the changes in `public/track.js`**

Add a new function near `getFbCookies()`:

```js
  // Extract GA4's real client_id from the _ga cookie (format GA1.1.<part1>.<part2>
  // or GA1.2.<part1>.<part2>) so server-side Measurement Protocol hits correlate
  // with the visitor's actual GA4 session instead of creating a disconnected
  // synthetic user. Null when GA4/gtag.js hasn't set the cookie yet, or isn't
  // installed on this site.
  function getGaClientId() {
    var raw = getCookie('_ga')
    if (!raw) return null
    var parts = raw.split('.')
    if (parts.length < 4) return null
    return parts[2] + '.' + parts[3]
  }
```

In the `track()` function, add `gaClientId: getGaClientId()` alongside the other identifier reads (near where `fbCookies = getFbCookies()` is computed):

```js
    var clientId = getClientId()
    var sessionId = getSessionId()
    var touches = getAttributionTouches()
    var utmParams = touches.last || getUtmParams()
    var fbCookies = getFbCookies()
    var gaClientId = getGaClientId()
```

Add `ga_client_id: gaClientId` to the `payload` object (alongside `fbc: fbCookies.fbc, fbp: fbCookies.fbp`):

```js
    var payload = {
      client_id: clientId,
      session_id: sessionId,
      event_name: eventName,
      event_data: eventData || {},
      page_url: window.location.href,
      referrer: document.referrer || null,
      utm_source: utmParams.utm_source,
      utm_medium: utmParams.utm_medium,
      utm_campaign: utmParams.utm_campaign,
      utm_term: utmParams.utm_term,
      utm_content: utmParams.utm_content,
      gclid: utmParams.gclid,
      fbclid: utmParams.fbclid,
      fbc: fbCookies.fbc,
      fbp: fbCookies.fbp,
      ga_client_id: gaClientId,
      ttclid: utmParams.ttclid,
      msclkid: utmParams.msclkid,
      gbraid: utmParams.gbraid,
      wbraid: utmParams.wbraid,
      li_fat_id: utmParams.li_fat_id,
      email_click_id: utmParams.email_click_id,
      timestamp: new Date().toISOString(),
    }
```

Add `ga_client_id: payload.ga_client_id` to the batch's per-event `attribution` object (alongside `fbc: payload.fbc, fbp: payload.fbp`):

```js
        attribution: {
          utm_source: payload.utm_source,
          utm_medium: payload.utm_medium,
          utm_campaign: payload.utm_campaign,
          utm_term: payload.utm_term,
          utm_content: payload.utm_content,
          gclid: payload.gclid,
          gbraid: payload.gbraid,
          wbraid: payload.wbraid,
          fbclid: payload.fbclid,
          fbc: payload.fbc,
          fbp: payload.fbp,
          ga_client_id: payload.ga_client_id,
          ttclid: payload.ttclid,
          msclkid: payload.msclkid,
          li_fat_id: payload.li_fat_id,
          email_click_id: payload.email_click_id,
        },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/public/track-tag.test.ts`
Expected: PASS (all tests, pre-existing and new)

- [ ] **Step 5: Commit**

```bash
git add public/track.js test/public/track-tag.test.ts
git commit -m "feat(tracking): capture the real GA4 _ga cookie client_id"
```

---

### Task 5: `browserCanonicalConversion.ts` — promote the 3 micro-conversion signals

**Files:**
- Modify: `server/utils/tracking/browserCanonicalConversion.ts`
- Test: `test/server/utils/tracking/browserCanonicalConversion.test.ts`

**Interfaces:**
- Consumes: `contracts.ts`'s `gaClientId` attribution field (Task 2); `TrackingEventRow.ga_client_id` (Task 3).
- Produces: `buildBrowserCanonicalConversion()` now also promotes `phone_click`, `add_to_wishlist`, `form_submit`, with `attribution.gaClientId` populated on every promoted event (including the pre-existing `generate_lead` → `web_conversion` case). No other task consumes this function directly — it's the tail end of the ingest-side pipeline.

- [ ] **Step 1: Write the failing tests**

Replace `test/server/utils/tracking/browserCanonicalConversion.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { buildBrowserCanonicalConversion } from '~~/server/utils/tracking/browserCanonicalConversion'

const row = {
  site_id: '87754354-978b-47dd-a630-df1a1dc37101',
  client_id: 'ddd19405-5cbd-4e2f-8d9c-4f820ed75b32',
  event_id: '48fdb3af-0df1-4b24-9f08-d5ab065e1ac1',
  event_name: 'generate_lead',
  occurred_at: '2026-07-20T01:00:00.000Z',
  gclid: 'approved-click-id',
  gbraid: null,
  wbraid: null,
  ga_client_id: '1234567890.1234567890',
  event_data: { stockId: 'FORD-123', email: 'must-not-copy@example.com' }
}

describe('browser canonical conversion bridge', () => {
  it('promotes a marketing-consented generate_lead event without copying event data or PII', () => {
    const result = buildBrowserCanonicalConversion({
      row,
      marketingConsent: 'granted',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })

    expect(result).toEqual({
      clientId: 'ddd19405-5cbd-4e2f-8d9c-4f820ed75b32',
      eventName: 'web_conversion',
      sourceSystem: 'browser',
      sourceEntityType: 'tracking_event',
      sourceEntityId: '48fdb3af-0df1-4b24-9f08-d5ab065e1ac1',
      sourceEventId: 'tracking:87754354-978b-47dd-a630-df1a1dc37101:48fdb3af-0df1-4b24-9f08-d5ab065e1ac1',
      occurredAt: '2026-07-20T01:00:00.000Z',
      consentDecision: 'granted',
      attribution: {
        browserEventId: '48fdb3af-0df1-4b24-9f08-d5ab065e1ac1',
        metaLeadId: null,
        gclid: 'approved-click-id',
        gbraid: null,
        wbraid: null,
        gaClientId: '1234567890.1234567890'
      }
    })
    expect(JSON.stringify(result)).not.toContain('must-not-copy@example.com')
    expect(JSON.stringify(result)).not.toContain('FORD-123')
  })

  it('does not promote a lead when marketing consent is denied', () => {
    expect(buildBrowserCanonicalConversion({
      row,
      marketingConsent: 'denied',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })).toBeNull()
  })

  it('does not promote ordinary behavioural events', () => {
    expect(buildBrowserCanonicalConversion({
      row: { ...row, event_name: 'page_view' },
      marketingConsent: 'granted',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })).toBeNull()
  })

  it('uses the trusted receive time when the browser omits its event timestamp', () => {
    expect(buildBrowserCanonicalConversion({
      row: { ...row, occurred_at: null },
      marketingConsent: 'granted',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })?.occurredAt).toBe('2026-07-20T01:00:01.000Z')
  })

  it.each(['phone_click', 'add_to_wishlist', 'form_submit'] as const)(
    'promotes a marketing-consented %s micro-conversion using its own event name as the canonical name',
    (eventName) => {
      const result = buildBrowserCanonicalConversion({
        row: { ...row, event_name: eventName },
        marketingConsent: 'granted',
        receivedAt: '2026-07-20T01:00:01.000Z'
      })

      expect(result).toMatchObject({
        eventName,
        sourceSystem: 'browser',
        sourceEntityType: 'tracking_event',
        attribution: expect.objectContaining({ gaClientId: '1234567890.1234567890' })
      })
    }
  )

  it('does not promote a micro-conversion when marketing consent is denied', () => {
    expect(buildBrowserCanonicalConversion({
      row: { ...row, event_name: 'phone_click' },
      marketingConsent: 'denied',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })).toBeNull()
  })

  it('sets gaClientId to null when the row has no _ga cookie value', () => {
    const result = buildBrowserCanonicalConversion({
      row: { ...row, event_name: 'add_to_wishlist', ga_client_id: null },
      marketingConsent: 'granted',
      receivedAt: '2026-07-20T01:00:01.000Z'
    })

    expect(result?.attribution.gaClientId).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm exec vitest run test/server/utils/tracking/browserCanonicalConversion.test.ts`
Expected: the 4 pre-existing tests FAIL too at first (their expected `attribution` object now includes `gaClientId`, which the current implementation doesn't produce) — this is expected; all tests should fail until Step 3 lands. The 3 new micro-conversion `it.each` cases and the consent-denial/null-gaClientId cases also FAIL.

- [ ] **Step 3: Implement the changes in `browserCanonicalConversion.ts`**

```ts
import type { AppendCanonicalConversionEvent } from '~~/server/utils/measurement/contracts'
import type { TrackingEventRow } from '~~/server/utils/tracking/event-insert'

type BrowserConversionRow = Pick<
  TrackingEventRow,
  | 'site_id'
  | 'client_id'
  | 'event_id'
  | 'event_name'
  | 'occurred_at'
  | 'gclid'
  | 'gbraid'
  | 'wbraid'
  | 'ga_client_id'
>

const PROMOTABLE_EVENT_NAMES = new Set([
  'generate_lead',
  'phone_click',
  'add_to_wishlist',
  'form_submit'
])

export function buildBrowserCanonicalConversion(input: {
  row: BrowserConversionRow
  marketingConsent: 'granted' | 'denied'
  receivedAt: string
}): AppendCanonicalConversionEvent | null {
  if (!PROMOTABLE_EVENT_NAMES.has(input.row.event_name) || input.marketingConsent !== 'granted') {
    return null
  }

  return {
    clientId: input.row.client_id,
    eventName: input.row.event_name === 'generate_lead' ? 'web_conversion' : input.row.event_name,
    sourceSystem: 'browser',
    sourceEntityType: 'tracking_event',
    sourceEntityId: input.row.event_id,
    sourceEventId: `tracking:${input.row.site_id}:${input.row.event_id}`,
    occurredAt: input.row.occurred_at ?? input.receivedAt,
    consentDecision: 'granted',
    attribution: {
      browserEventId: input.row.event_id,
      metaLeadId: null,
      gclid: input.row.gclid,
      gbraid: input.row.gbraid,
      wbraid: input.row.wbraid,
      gaClientId: input.row.ga_client_id
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/tracking/browserCanonicalConversion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/tracking/browserCanonicalConversion.ts test/server/utils/tracking/browserCanonicalConversion.test.ts
git commit -m "feat(measurement): promote phone_click, add_to_wishlist, form_submit as canonical conversions"
```

---

### Task 6: `providers.ts` — GA4 Measurement Protocol delivery function

**Files:**
- Modify: `workers/measurement-delivery/src/providers.ts`
- Test: `test/workers/measurementDeliveryProviders.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks directly (this Worker-local `MeasurementProviderDelivery` interface is independent of `contracts.ts`).
- Produces: `MeasurementProviderDelivery.attribution.gaClientId: string | null`; `Ga4DeliveryInput` interface; `deliverGa4MeasurementProtocolEvent(input: Ga4DeliveryInput): Promise<ProviderDeliveryResult>`. Task 7 imports and calls this function.

- [ ] **Step 1: Write the failing tests**

Add these tests to `test/workers/measurementDeliveryProviders.test.ts`. First, add `deliverGa4MeasurementProtocolEvent` to the existing import:

```ts
import {
  deliverGa4MeasurementProtocolEvent,
  deliverGoogleDataManagerEvent,
  deliverMetaConversionEvent,
  refreshGoogleDataManagerAccessToken
} from '../../workers/measurement-delivery/src/providers'
```

Add `gaClientId: null` to the shared `baseDelivery` fixture's `attribution` object (so existing Meta/Google tests keep working against the widened shared type):

```ts
const baseDelivery = {
  eventId: '11111111-1111-4111-8111-111111111111',
  eventName: 'lead_qualified',
  providerEventName: 'QualifiedLead',
  occurredAt: '2026-07-17T06:00:00.000Z',
  idempotencyKey: 'v1:canonical-event-key',
  externalDestinationId: '123456789012345',
  operatingAccountId: '9876543210',
  loginAccountId: '9876543210',
  metaDeliveryMode: 'crm' as const,
  value: null,
  currency: null,
  attribution: {
    browserEventId: null,
    metaLeadId: '123456789012345',
    gclid: 'gclid-1',
    gbraid: null,
    wbraid: null,
    fbc: null,
    fbp: null,
    eventSourceUrl: null,
    clientUserAgent: null,
    gaClientId: null
  }
}
```

Add a new `describe` block at the end of the file:

```ts
describe('deliverGa4MeasurementProtocolEvent', () => {
  it('posts to the GA4 Measurement Protocol collect endpoint with the real client_id', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))

    const result = await deliverGa4MeasurementProtocolEvent({
      delivery: {
        ...baseDelivery,
        eventName: 'phone_click',
        providerEventName: 'phone_click',
        externalDestinationId: 'G-ABCDEFG123',
        attribution: { ...baseDelivery.attribution, gaClientId: '1234567890.1234567890' }
      },
      apiSecret: 'ga4-api-secret',
      fetch
    })

    expect(result).toEqual({
      outcome: 'accepted',
      providerRequestId: null,
      errorClass: null,
      redactedDiagnostic: null
    })
    const [url, request] = fetch.mock.calls[0]!
    expect(url).toBe('https://www.google-analytics.com/mp/collect?measurement_id=G-ABCDEFG123&api_secret=ga4-api-secret')
    expect(JSON.parse(request.body as string)).toEqual({
      client_id: '1234567890.1234567890',
      events: [{ name: 'phone_click', params: {} }]
    })
  })

  it('fails closed without calling fetch when the GA4 client_id is missing', async () => {
    const fetch = vi.fn()

    const result = await deliverGa4MeasurementProtocolEvent({
      delivery: {
        ...baseDelivery,
        eventName: 'phone_click',
        providerEventName: 'phone_click',
        externalDestinationId: 'G-ABCDEFG123',
        attribution: { ...baseDelivery.attribution, gaClientId: null }
      },
      apiSecret: 'ga4-api-secret',
      fetch
    })

    expect(result).toEqual({
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'missing_ga4_client_id',
      redactedDiagnostic: 'GA4 delivery requires a GA4 client ID from the _ga cookie'
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('treats a non-2xx response as a provider HTTP failure', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 500 }))

    const result = await deliverGa4MeasurementProtocolEvent({
      delivery: {
        ...baseDelivery,
        eventName: 'phone_click',
        providerEventName: 'phone_click',
        externalDestinationId: 'G-ABCDEFG123',
        attribution: { ...baseDelivery.attribution, gaClientId: '1234567890.1234567890' }
      },
      apiSecret: 'ga4-api-secret',
      fetch
    })

    expect(result).toEqual({
      outcome: 'retryable',
      providerRequestId: null,
      errorClass: 'provider_http_500',
      redactedDiagnostic: 'GA4 Measurement Protocol returned HTTP 500'
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm exec vitest run test/workers/measurementDeliveryProviders.test.ts`
Expected: the pre-existing Meta/Google tests still PASS (after the `gaClientId: null` fixture addition, which is inert for those); the new `deliverGa4MeasurementProtocolEvent` tests FAIL (function not exported).

- [ ] **Step 3: Implement the changes in `providers.ts`**

Add `gaClientId` to the shared `attribution` shape on `MeasurementProviderDelivery`:

```ts
export interface MeasurementProviderDelivery {
  eventId: string
  eventName: string
  providerEventName: string
  occurredAt: string
  idempotencyKey: string
  externalDestinationId: string
  operatingAccountId: string
  loginAccountId: string
  metaDeliveryMode: 'crm' | 'web'
  value: number | null
  currency: string | null
  attribution: {
    browserEventId: string | null
    metaLeadId: string | null
    gclid: string | null
    gbraid: string | null
    wbraid: string | null
    fbc: string | null
    fbp: string | null
    eventSourceUrl: string | null
    clientUserAgent: string | null
    gaClientId: string | null
  }
}
```

Add `Ga4DeliveryInput` and `deliverGa4MeasurementProtocolEvent`, after `deliverGoogleDataManagerEvent` and before `refreshGoogleDataManagerAccessToken`:

```ts
export interface Ga4DeliveryInput {
  delivery: MeasurementProviderDelivery
  apiSecret: string
  fetch: FetchLike
}

export async function deliverGa4MeasurementProtocolEvent(
  input: Ga4DeliveryInput
): Promise<ProviderDeliveryResult> {
  const { delivery } = input
  if (!delivery.attribution.gaClientId) {
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'missing_ga4_client_id',
      redactedDiagnostic: 'GA4 delivery requires a GA4 client ID from the _ga cookie'
    }
  }

  const response = await input.fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(delivery.externalDestinationId)}&api_secret=${encodeURIComponent(input.apiSecret)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: delivery.attribution.gaClientId,
        events: [{
          name: delivery.providerEventName,
          params: {}
        }]
      })
    }
  )
  if (!response.ok) return httpFailure('GA4 Measurement Protocol', response.status)

  // GA4 Measurement Protocol returns 204 No Content on essentially every
  // request, including malformed ones — there is no reliable way to detect
  // GA4-side rejection at delivery time. A 2xx here means "accepted the HTTP
  // request," not "GA4 validated the event." See the design doc's Error
  // Handling section — this is a documented API limitation, not a gap here.
  return {
    outcome: 'accepted',
    providerRequestId: null,
    errorClass: null,
    redactedDiagnostic: null
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/workers/measurementDeliveryProviders.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/measurement-delivery/src/providers.ts test/workers/measurementDeliveryProviders.test.ts
git commit -m "feat(measurement-delivery): GA4 Measurement Protocol provider"
```

---

### Task 7: `repository.ts` + `delivery.ts` — wire the `ga4` platform into the dispatch loop

**Files:**
- Modify: `workers/measurement-delivery/src/repository.ts`
- Modify: `workers/measurement-delivery/src/delivery.ts`
- Test: `test/workers/measurementDeliveryRepository.test.ts`
- Test: `test/workers/measurementDeliveryProcessor.test.ts`

**Interfaces:**
- Consumes: `deliverGa4MeasurementProtocolEvent` from Task 6.
- Produces: `MeasurementDeliveryClaim.platform` including `'ga4'`; `DeliveryProcessorDeps.deliverGa4`; a new dispatch branch in `createMeasurementDeliveryProcessor`. This is the final task — nothing later depends on it.

- [ ] **Step 1: Write the failing repository test**

Add this test to `test/workers/measurementDeliveryRepository.test.ts`, after the existing tests. First, add `tracking_ga_client_id: null` to the shared `deliveryRow()` fixture function (so existing tests keep passing against the widened row shape):

```ts
function deliveryRow() {
  return {
    delivery_id: DELIVERY_ID,
    destination_id: '44444444-4444-4444-8444-444444444444',
    attempt_count: 0,
    platform: 'meta',
    profile_enabled: true,
    profile_environment: 'live',
    profile_cache_status: 'fresh',
    profile_cache_version: 3,
    profile_config_version: 3,
    destination_enabled: true,
    destination_environment: 'live',
    destination_health_status: 'ready',
    event_config_version: 3,
    event_id: EVENT_ID,
    event_name: 'lead_qualified',
    provider_event_name: 'QualifiedLead',
    occurred_at: '2026-07-17T06:00:00.000Z',
    idempotency_key: 'v1:canonical-event-key',
    external_destination_id: '123456789012345',
    credential_ref: 'MEASUREMENT_PROVIDER_META_BIG_GARAGE',
    account_id: '9876543210',
    access_token: 'meta-token',
    refresh_token: null,
    scopes: ['ads_management'],
    metadata: {},
    attribution: { metaLeadId: '1234567890123456' },
    capability_modes: ['meta_crm_capi'],
    tracking_fbc: null,
    tracking_fbp: null,
    tracking_page_url: null,
    tracking_ua: null,
    tracking_gclid: null,
    tracking_gbraid: null,
    tracking_wbraid: null,
    tracking_ga_client_id: null
  }
}
```

Then add a new test:

```ts
  it('maps the GA4 client ID from the tracking_events join into the claim attribution', async () => {
    const row = { ...deliveryRow(), platform: 'ga4' as const, tracking_ga_client_id: '1234567890.1234567890' }
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/SELECT[\s\S]*FOR UPDATE OF d SKIP LOCKED/.test(sql)) return { rows: [row] }
        if (/UPDATE conversion_deliveries[\s\S]*attempt_count = attempt_count \+ 1/.test(sql)) {
          return { rows: [{ attempt_count: 1 }] }
        }
        return { rows: [] }
      })
    }
    const transaction = vi.fn(async (callback: (db: typeof client) => Promise<unknown>) => callback(client))
    const repository = createMeasurementDeliveryRepository({ transaction: transaction as never })

    const claim = await repository.claimNext({
      schemaVersion: 1,
      clientId: CLIENT_ID,
      eventId: EVENT_ID,
      enqueuedAt: '2026-07-17T06:00:00.000Z'
    }, 'worker-1', NOW)

    expect(claim?.platform).toBe('ga4')
    expect(claim?.attribution.gaClientId).toBe('1234567890.1234567890')
  })
```

(Match this test's exact call signature for `repository.claimNext(...)` and the `MESSAGE`/`CLIENT_ID`/`EVENT_ID`/`NOW` constants against whichever pre-existing test in this file calls it the same way — copy that call shape verbatim rather than guessing the argument order.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/workers/measurementDeliveryRepository.test.ts`
Expected: FAIL — `claim.attribution.gaClientId` is `undefined`, and the `DeliveryRow`/`mapClaim` TypeScript types don't yet have a `tracking_ga_client_id` field for the test fixture to widen against (a type-level failure surfaces as a compile/test-run error, not just a runtime assertion failure).

- [ ] **Step 3: Implement the repository changes**

In `workers/measurement-delivery/src/repository.ts`, add `tracking_ga_client_id` to the `DeliveryRow` interface:

```ts
interface DeliveryRow {
  delivery_id: string
  destination_id: string
  attempt_count: number | string
  platform: 'meta' | 'google_data_manager' | 'ga4'
  profile_enabled: boolean
  profile_environment: 'test' | 'live' | 'paused'
  profile_cache_status: string
  profile_cache_version: number | string | null
  profile_config_version: number | string
  destination_enabled: boolean
  destination_environment: 'test' | 'live' | 'paused'
  destination_health_status: MeasurementDeliveryClaim['destinationHealthStatus']
  event_config_version: number | string
  event_id: string
  event_name: string
  provider_event_name: string | null
  occurred_at: Date | string
  idempotency_key: string
  external_destination_id: string
  credential_ref: string | null
  account_id: string | null
  refresh_token: string | null
  scopes: unknown
  metadata: unknown
  attribution: unknown
  value: number | string | null
  currency_code: string | null
  capability_modes: unknown
  tracking_fbc: string | null
  tracking_fbp: string | null
  tracking_page_url: string | null
  tracking_ua: string | null
  tracking_gclid: string | null
  tracking_gbraid: string | null
  tracking_wbraid: string | null
  tracking_ga_client_id: string | null
}
```

Add `gaClientId` to `mapClaim()`'s returned `attribution` object:

```ts
    attribution: {
      browserEventId,
      metaLeadId,
      gclid: optionalString(attribution.gclid) ?? optionalString(row.tracking_gclid),
      gbraid: optionalString(attribution.gbraid) ?? optionalString(row.tracking_gbraid),
      wbraid: optionalString(attribution.wbraid) ?? optionalString(row.tracking_wbraid),
      fbc: optionalString(row.tracking_fbc),
      fbp: optionalString(row.tracking_fbp),
      eventSourceUrl: safeEventSourceUrl(row.tracking_page_url),
      clientUserAgent: optionalString(row.tracking_ua, 1024),
      gaClientId: optionalString(row.tracking_ga_client_id, 128)
    }
```

Add `browser.ga_client_id AS tracking_ga_client_id` to the outer `SELECT` list, and `te.ga_client_id` to the `browser` lateral join's inner `SELECT`, in `claimNext`'s SQL:

```sql
                  browser.fbc AS tracking_fbc,
                  browser.fbp AS tracking_fbp,
                  browser.page_url AS tracking_page_url,
                  browser.ua AS tracking_ua,
                  browser.gclid AS tracking_gclid,
                  browser.gbraid AS tracking_gbraid,
                  browser.wbraid AS tracking_wbraid,
                  browser.ga_client_id AS tracking_ga_client_id,
```
```sql
             LEFT JOIN LATERAL (
               SELECT te.fbc, te.fbp, te.page_url, te.ua,
                      te.gclid, te.gbraid, te.wbraid, te.ga_client_id
                 FROM tracking_events te
                WHERE te.client_id = e.client_id
                  AND te.event_id = e.attribution->>'browserEventId'
                ORDER BY te.occurred_at DESC, te.id DESC
                LIMIT 1
             ) browser ON TRUE
```

(Every other line of the query, and the rest of `mapClaim`, is unchanged.)

- [ ] **Step 4: Run the repository test to verify it passes**

Run: `pnpm exec vitest run test/workers/measurementDeliveryRepository.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing delivery-processor test**

Add this test to `test/workers/measurementDeliveryProcessor.test.ts`. First, add `gaClientId: null` to the `claim()` fixture function's `attribution` object (so existing Meta/Google tests keep passing against the widened shared claim shape), and add a `deliverGa4` mock plus `gaClientId: null` default to the `setup()` helper:

```ts
function claim(overrides: Record<string, unknown> = {}) {
  return {
    deliveryId: '33333333-3333-4333-8333-333333333333',
    destinationId: '44444444-4444-4444-8444-444444444444',
    attemptNumber: 1,
    platform: 'meta' as const,
    profileEnabled: true,
    profileEnvironment: 'live' as const,
    profileCacheCurrent: true,
    destinationEnabled: true,
    destinationEnvironment: 'live' as const,
    destinationHealthStatus: 'ready' as const,
    deliveryConfigCurrent: true,
    eventId: MESSAGE.eventId,
    eventName: 'lead_qualified',
    providerEventName: 'QualifiedLead',
    occurredAt: '2026-07-17T06:00:00.000Z',
    idempotencyKey: 'v1:canonical-event-key',
    externalDestinationId: '123456789012345',
    operatingAccountId: '9876543210',
    loginAccountId: '9876543210',
    metaDeliveryMode: 'crm' as const,
    credentialRef: 'MEASUREMENT_PROVIDER_META_BIG_GARAGE',
    accessToken: 'linked-facebook-oauth-token',
    refreshToken: null,
    connectionScopes: ['ads_management'],
    attribution: {
      browserEventId: 'browser-event-1',
      metaLeadId: '123456789012345',
      gclid: null,
      gbraid: null,
      wbraid: null,
      fbc: null,
      fbp: null,
      eventSourceUrl: null,
      clientUserAgent: null,
      gaClientId: null
    },
    ...overrides
  }
}
```

```ts
function setup(claims: Array<ReturnType<typeof claim> | null>) {
  const claimNext = vi.fn()
  for (const item of claims) claimNext.mockResolvedValueOnce(item)
  const complete = vi.fn(async () => undefined)
  const deliverMeta = vi.fn(async () => ({
    outcome: 'accepted' as const,
    providerRequestId: 'meta-request-1',
    errorClass: null,
    redactedDiagnostic: null
  }))
  const deliverGoogle = vi.fn(async () => ({
    outcome: 'accepted' as const,
    providerRequestId: 'google-request-1',
    errorClass: null,
    redactedDiagnostic: null
  }))
  const deliverGa4 = vi.fn(async () => ({
    outcome: 'accepted' as const,
    providerRequestId: null,
    errorClass: null,
    redactedDiagnostic: null
  }))
  const refreshGoogleAccessToken = vi.fn(async () => 'fresh-google-token')
  const resolveProviderCredential = vi.fn(async () => 'meta-dataset-token')
  const processor = createMeasurementDeliveryProcessor({
    repository: { claimNext, complete },
    deliverMeta,
    deliverGoogle,
    deliverGa4,
    refreshGoogleAccessToken,
    resolveProviderCredential,
    workerId: () => 'measurement-worker:test',
    now: () => new Date('2026-07-17T06:05:00.000Z'),
    metaGraphApiVersion: 'v25.0',
    googleClientId: 'google-client-id',
    googleClientSecret: 'google-client-secret',
    fetch: vi.fn() as never
  })
  return {
    processor,
    claimNext,
    complete,
    deliverMeta,
    deliverGoogle,
    deliverGa4,
    refreshGoogleAccessToken,
    resolveProviderCredential
  }
}
```

Add a new test in the `describe('measurement delivery processor', ...)` block:

```ts
  it('resolves a GA4 api_secret credential and delivers via Measurement Protocol', async () => {
    const ga4 = claim({
      platform: 'ga4',
      externalDestinationId: 'G-ABCDEFG123',
      credentialRef: 'MEASUREMENT_PROVIDER_GA4_BIG_GARAGE',
      attribution: { ...claim().attribution, gaClientId: '1234567890.1234567890' }
    })
    const state = setup([ga4, null])
    state.resolveProviderCredential.mockResolvedValueOnce('ga4-api-secret')

    const result = await state.processor.process(MESSAGE)

    expect(result).toEqual({ claimed: 1, accepted: 1, retryable: 0, permanentFailure: 0, policySkipped: 0 })
    expect(state.resolveProviderCredential).toHaveBeenCalledWith('MEASUREMENT_PROVIDER_GA4_BIG_GARAGE')
    expect(state.deliverGa4).toHaveBeenCalledWith(expect.objectContaining({ apiSecret: 'ga4-api-secret' }))
  })

  it('never sends GA4 delivery when the credential reference is absent', async () => {
    const ga4 = claim({ platform: 'ga4', credentialRef: null })
    const state = setup([ga4, null])

    const result = await state.processor.process(MESSAGE)

    expect(result).toMatchObject({ claimed: 1, permanentFailure: 1 })
    expect(state.resolveProviderCredential).not.toHaveBeenCalled()
    expect(state.deliverGa4).not.toHaveBeenCalled()
    expect(state.complete).toHaveBeenCalledWith(ga4, expect.objectContaining({
      errorClass: 'ga4_api_secret_ref_required'
    }), expect.any(Date))
  })

  it('fails closed when the referenced GA4 api_secret binding is unavailable', async () => {
    const ga4 = claim({ platform: 'ga4' })
    const state = setup([ga4, null])
    state.resolveProviderCredential.mockResolvedValueOnce(null)

    const result = await state.processor.process(MESSAGE)

    expect(result).toMatchObject({ claimed: 1, permanentFailure: 1 })
    expect(state.deliverGa4).not.toHaveBeenCalled()
    expect(state.complete).toHaveBeenCalledWith(ga4, expect.objectContaining({
      errorClass: 'ga4_api_secret_unavailable'
    }), expect.any(Date))
  })
```

- [ ] **Step 6: Run the processor test to verify the new tests fail**

Run: `pnpm exec vitest run test/workers/measurementDeliveryProcessor.test.ts`
Expected: pre-existing tests still PASS; the 3 new `ga4`-branch tests FAIL (`'ga4'` isn't a recognized platform in the dispatch loop yet, `deps.deliverGa4` isn't declared).

- [ ] **Step 7: Implement the delivery.ts changes**

In `workers/measurement-delivery/src/delivery.ts`, widen `MeasurementDeliveryClaim.platform` and add `deliverGa4` to `DeliveryProcessorDeps`:

```ts
import { GoogleOAuthRefreshError } from './providers'
import type {
  deliverGa4MeasurementProtocolEvent,
  deliverGoogleDataManagerEvent,
  deliverMetaConversionEvent,
  MeasurementProviderDelivery,
  ProviderDeliveryResult,
  refreshGoogleDataManagerAccessToken
} from './providers'
```

```ts
export interface MeasurementDeliveryClaim extends MeasurementProviderDelivery {
  clientId: string
  deliveryId: string
  destinationId: string
  attemptNumber: number
  platform: 'meta' | 'google_data_manager' | 'ga4'
  profileEnabled: boolean
  profileEnvironment: 'test' | 'live' | 'paused'
  profileCacheCurrent: boolean
  destinationEnabled: boolean
  destinationEnvironment: 'test' | 'live' | 'paused'
  destinationHealthStatus: 'not_configured' | 'detected' | 'configured' | 'validating' | 'ready' | 'degraded' | 'blocked'
  deliveryConfigCurrent: boolean
  credentialRef: string | null
  refreshToken: string | null
  connectionScopes: string[]
}
```

```ts
interface DeliveryProcessorDeps {
  repository: DeliveryRepository
  deliverMeta: typeof deliverMetaConversionEvent
  deliverGoogle: typeof deliverGoogleDataManagerEvent
  deliverGa4: typeof deliverGa4MeasurementProtocolEvent
  refreshGoogleAccessToken: typeof refreshGoogleDataManagerAccessToken
  resolveProviderCredential(credentialRef: string): Promise<string | null>
  workerId: () => string
  now: () => Date
  metaGraphApiVersion: string
  googleClientId: string
  googleClientSecret: string
  fetch: typeof fetch
}
```

Add a new dispatch branch immediately after the existing `google_data_manager` branch (before the final `if (!deliveryResult) { ... unsupported_measurement_platform ... }` fallback):

```ts
        if (!deliveryResult && claim.platform === 'ga4') {
          if (!claim.credentialRef) {
            deliveryResult = {
              outcome: 'permanent_failure',
              providerRequestId: null,
              errorClass: 'ga4_api_secret_ref_required',
              redactedDiagnostic: 'GA4 Measurement Protocol requires a purpose-scoped secret binding'
            }
          } else {
            try {
              const apiSecret = await deps.resolveProviderCredential(claim.credentialRef)
              deliveryResult = apiSecret
                ? await deps.deliverGa4({
                    delivery: claim,
                    apiSecret,
                    fetch: deps.fetch
                  })
                : {
                    outcome: 'permanent_failure',
                    providerRequestId: null,
                    errorClass: 'ga4_api_secret_unavailable',
                    redactedDiagnostic: 'GA4 Measurement Protocol secret binding is unavailable'
                  }
            } catch {
              deliveryResult = networkFailure()
            }
          }
        }
```

- [ ] **Step 8: Run the processor test to verify it passes**

Run: `pnpm exec vitest run test/workers/measurementDeliveryProcessor.test.ts`
Expected: PASS (all tests, pre-existing and new)

- [ ] **Step 9: Commit**

```bash
git add workers/measurement-delivery/src/repository.ts workers/measurement-delivery/src/delivery.ts test/workers/measurementDeliveryRepository.test.ts test/workers/measurementDeliveryProcessor.test.ts
git commit -m "feat(measurement-delivery): wire ga4 platform into the delivery dispatch loop"
```

---

### Final Verification

- [ ] **Run the full test suite**

Run: `pnpm exec vitest run`
Expected: all measurement/tracking/providers/repository/processor/migration tests touched by this plan PASS; the pre-existing baseline of 20 failing files / 39 failing tests (unrelated to this work — email panels, audio/video studio, spend controller, GA4 funnel, channel taxonomy, role resolver, leads webhook, deploy scripts, actionPlanAi, financialInsightsAi, groqFeatureKeyCoverage) is unchanged in count and file list.

- [ ] **Typecheck**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck`
Expected: no new type errors beyond the project's pre-existing ~60 baseline.
