# Phase C Conversion Value Passing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass real deal value (`crm_opportunities.amount`) through to Meta CAPI and Google Data Manager on `lead_won` conversion events, replacing today's binary-only delivery, so both platforms can optimize bidding toward valuable conversions instead of just "more conversions."

**Architecture:** Add nullable `value`/`currency_code` columns directly to `conversion_events` (mirroring how `attribution` already lives on that table). The value flows through the existing pipeline unchanged in shape: `opportunityStageTransition.ts` computes it → `appendCanonicalConversionEvent` (outbox) persists it → `workers/measurement-delivery`'s `repository.ts` reads it back on claim → `providers.ts` includes it in the Meta/Google payloads only when present.

**Tech Stack:** Nuxt 4 / Nitro server (`server/utils/`), Cloudflare Worker (`workers/measurement-delivery/src/`), Postgres (Neon) migrations, Zod schemas, Vitest.

## Global Constraints

- Server code imports use `~~/server/utils/` (double-tilde), never `~/`.
- Postgres `NUMERIC` columns come back from the `pg`/`neon()` driver as **strings**, not numbers — always wrap in `Number(...)` before arithmetic or comparison (established pattern: `server/utils/crm/analytics.ts`, `aiSignals.ts`, `targetsDb.ts`).
- Currency is hardcoded `'AUD'`, derived server-side, **never** caller-supplied or stored per-client.
- `crm_opportunities.amount = 0` (its `NOT NULL DEFAULT 0`) means "never set," not a real $0 deal — always treat it as "omit value," not "send zero."
- Only `lead_won` events carry a value. Every other canonical event name (`lead_created`, `lead_contacted`, `lead_qualified`, `lead_lost`, `purchase`, `web_conversion`) always gets `value: null`, even if an opportunity amount happens to be set.
- The plain leads-status path (`server/utils/leads/statusTransition.ts`) is never touched — it has no value source and must keep behaving exactly as it does today.
- No backfill of historically-delivered `lead_won` events. Forward-only.
- **Do not run the new migration against `DATABASE_URL` without asking the user for explicit go-ahead first** — this project's established session pattern (see `docs/superpowers/handoffs/2026-07-26-phase-b-shipped-phase-c-next.md`) is author-then-ask, not auto-run, despite the general project default. Ask before running Task 1's migration step.
- Full design rationale: `docs/superpowers/specs/2026-07-26-phase-c-conversion-value-passing-design.md`.

---

### Task 1: Database migration

**Files:**
- Create: `server/database/migrations/310_conversion_event_value.sql`
- Test: `test/config/conversionEventValueMigration.test.ts`

**Interfaces:**
- Produces: `conversion_events.value NUMERIC(14,2) NULL`, `conversion_events.currency_code TEXT NULL`, both consumed by Task 2's `outbox.ts` INSERT/SELECT and Task 4's `repository.ts` SELECT.

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/310_conversion_event_value.sql',
  import.meta.url
)

describe('Conversion event value migration 310', () => {
  it('adds nullable value/currency columns paired by a CHECK constraint', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('ALTER TABLE conversion_events')
    expect(migration).toMatch(/ADD COLUMN value NUMERIC\(14,2\) NULL/)
    expect(migration).toMatch(/ADD COLUMN currency_code TEXT NULL/)
    expect(migration).toContain('conversion_events_value_currency_pair')
    expect(migration).toMatch(/CHECK \(\(value IS NULL\) = \(currency_code IS NULL\)\)\s+NOT VALID;/)
    expect(migration).toContain('VALIDATE CONSTRAINT conversion_events_value_currency_pair')
    expect(migration).toContain('COMMIT;')
  })
})
```

Save as `test/config/conversionEventValueMigration.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/config/conversionEventValueMigration.test.ts`
Expected: FAIL — `server/database/migrations/310_conversion_event_value.sql` does not exist yet.

- [ ] **Step 3: Write the migration**

```sql
BEGIN;

-- Conversion delivery to Meta CAPI and Google Data Manager has been
-- binary-only ("this happened") with no monetary value, blocking
-- value-based bidding on both platforms. crm_opportunities.amount already
-- holds a real deal value at the point a lead_won lifecycle event fires;
-- these columns let that value flow through the canonical conversion
-- pipeline to delivery. Nullable and additive: existing rows are unaffected,
-- and every event that isn't a valued lead_won keeps delivering binary.
ALTER TABLE conversion_events
  ADD COLUMN value NUMERIC(14,2) NULL,
  ADD COLUMN currency_code TEXT NULL;

-- NOT VALID + a separate VALIDATE CONSTRAINT avoids an ACCESS EXCLUSIVE
-- lock for the full validation scan, matching the pattern this codebase
-- already uses for constraints added to existing tables (migrations 225,
-- 257, 258, 273).
ALTER TABLE conversion_events
  ADD CONSTRAINT conversion_events_value_currency_pair
  CHECK ((value IS NULL) = (currency_code IS NULL))
  NOT VALID;

ALTER TABLE conversion_events
  VALIDATE CONSTRAINT conversion_events_value_currency_pair;

COMMIT;
```

Save as `server/database/migrations/310_conversion_event_value.sql`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/config/conversionEventValueMigration.test.ts`
Expected: PASS

- [ ] **Step 5: Ask the user for explicit go-ahead, then run the migration**

Per the Global Constraints above, stop and ask the user before running this against the real database. Once confirmed:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/310_conversion_event_value.sql
```

- [ ] **Step 6: Commit**

```bash
git add server/database/migrations/310_conversion_event_value.sql test/config/conversionEventValueMigration.test.ts
git commit -m "feat(measurement): add conversion_events value/currency columns"
```

---

### Task 2: Outbox persistence — schema and insert/read wiring

**Files:**
- Modify: `server/utils/measurement/contracts.ts:728-763` (`CanonicalConversionEventSchema`, `AppendCanonicalConversionEventSchema`)
- Modify: `server/utils/measurement/outbox.ts:25-41,51-69,117-121,173-199` (`ConversionEventRow`, `mapEvent`, `EVENT_COLUMNS`, insert statement)
- Test: `test/server/utils/measurement/outbox.test.ts`

**Interfaces:**
- Consumes: Task 1's `conversion_events.value`/`.currency_code` columns (only via SQL text — tests mock the DB, no live dependency).
- Produces: `AppendCanonicalConversionEvent.value: number | null` (input field), `CanonicalConversionEvent.value: number | null` / `.currencyCode: 'AUD' | null` (output fields) — consumed by Task 3's `opportunityStageTransition.ts` call site.

- [ ] **Step 1: Write the failing tests**

Add these two `it` blocks inside the existing `describe('canonical conversion outbox', ...)` block in `test/server/utils/measurement/outbox.test.ts`, after the last existing test:

```ts
  it('persists a supplied conversion value with the derived AUD currency', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/FROM client_measurement_profiles/.test(sql)) return { rows: [profile()] }
        if (/FROM conversion_destinations/.test(sql)) return { rows: [{ id: DESTINATION_ID }] }
        if (/INSERT INTO conversion_events/.test(sql)) {
          return { rows: [{
            id: EVENT_ID,
            client_id: CLIENT_ID,
            profile_id: PROFILE_ID,
            event_name: 'lead_won',
            source_system: 'zero_crm',
            source_entity_type: 'crm_opportunity',
            source_entity_id: OPPORTUNITY_ID,
            source_event_id: input().sourceEventId,
            occurred_at: new Date(input().occurredAt),
            idempotency_key: 'v1:test',
            config_version: 4,
            consent_mode: 'consent_gated',
            attribution: input().attribution,
            value: '15000.50',
            currency_code: 'AUD',
            outbox_status: 'pending',
            last_error_class: null
          }] }
        }
        return { rows: [] }
      })
    }

    const result = await appendCanonicalConversionEvent(db, {
      ...input(),
      eventName: 'lead_won',
      value: 15000.5
    })

    expect(result).toMatchObject({
      status: 'created',
      event: { eventId: EVENT_ID, value: 15000.5, currencyCode: 'AUD' }
    })
    const insertStatement = statements.find(statement => /INSERT INTO conversion_events/.test(statement.sql))
    expect(insertStatement?.params?.[12]).toBe(15000.5)
    expect(insertStatement?.params?.[13]).toBe('AUD')
  })

  it('derives a null currency when no conversion value is supplied', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/FROM client_measurement_profiles/.test(sql)) return { rows: [profile()] }
        if (/FROM conversion_destinations/.test(sql)) return { rows: [{ id: DESTINATION_ID }] }
        if (/INSERT INTO conversion_events/.test(sql)) {
          return { rows: [{
            id: EVENT_ID,
            client_id: CLIENT_ID,
            profile_id: PROFILE_ID,
            event_name: 'lead_qualified',
            source_system: 'zero_crm',
            source_entity_type: 'crm_opportunity',
            source_entity_id: OPPORTUNITY_ID,
            source_event_id: input().sourceEventId,
            occurred_at: new Date(input().occurredAt),
            idempotency_key: 'v1:test',
            config_version: 4,
            consent_mode: 'consent_gated',
            attribution: input().attribution,
            value: null,
            currency_code: null,
            outbox_status: 'pending',
            last_error_class: null
          }] }
        }
        return { rows: [] }
      })
    }

    const result = await appendCanonicalConversionEvent(db, input())

    expect(result).toMatchObject({
      status: 'created',
      event: { value: null, currencyCode: null }
    })
    const insertStatement = statements.find(statement => /INSERT INTO conversion_events/.test(statement.sql))
    expect(insertStatement?.params?.[12]).toBeNull()
    expect(insertStatement?.params?.[13]).toBeNull()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/server/utils/measurement/outbox.test.ts`
Expected: FAIL — `value` is not a recognized key on `AppendCanonicalConversionEventSchema` (Zod strict-object parse error), and `insertStatement?.params?.[12]` is `undefined` not `15000.5`/`null`.

- [ ] **Step 3: Add `value`/`currencyCode` to the contracts schemas**

In `server/utils/measurement/contracts.ts`, change `CanonicalConversionEventSchema` (currently lines 728-741):

```ts
export const CanonicalConversionEventSchema = z.strictObject({
  eventId: z.string().uuid(),
  clientId: z.string().uuid(),
  eventName: CanonicalEventNameSchema,
  sourceSystem: CanonicalEventSourceSystemSchema,
  sourceEntityType: CanonicalEventSourceEntitySchema,
  sourceEntityId: z.string().trim().min(1).max(255),
  sourceEventId: z.string().trim().min(1).max(255),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().trim().min(1).max(512),
  configVersion: z.number().int().positive(),
  consentMode: ConsentModeSchema,
  attribution: CanonicalAttributionSchema.default(EMPTY_CANONICAL_ATTRIBUTION),
  value: z.number().positive().max(9_999_999.99).nullable().default(null),
  currencyCode: z.literal('AUD').nullable().default(null)
})
```

And `AppendCanonicalConversionEventSchema` (currently lines 753-763):

```ts
export const AppendCanonicalConversionEventSchema = z.strictObject({
  clientId: z.string().uuid(),
  eventName: CanonicalEventNameSchema,
  sourceSystem: CanonicalEventSourceSystemSchema,
  sourceEntityType: CanonicalEventSourceEntitySchema,
  sourceEntityId: z.string().trim().min(1).max(255),
  sourceEventId: z.string().trim().min(1).max(255),
  occurredAt: z.string().datetime({ offset: true }),
  consentDecision: CanonicalConsentDecisionSchema.default('unknown'),
  attribution: CanonicalAttributionSchema.default(EMPTY_CANONICAL_ATTRIBUTION),
  value: z.number().positive().max(9_999_999.99).nullable().default(null)
})
```

The `9_999_999.99` cap is a deliberate business-sanity ceiling (no single vehicle deal is worth more), intentionally tighter than what `NUMERIC(14,2)` could physically hold — not a mismatch to "fix" later. `currencyCode` only appears on the *output* schema (`CanonicalConversionEventSchema`), never the input schema — it's always derived, never caller-supplied.

- [ ] **Step 4: Wire `value`/`currency_code` through `outbox.ts`**

In `server/utils/measurement/outbox.ts`, add two fields to `ConversionEventRow` (currently lines 25-41), inserted after `attribution: unknown`:

```ts
interface ConversionEventRow {
  id: string
  client_id: string
  profile_id: string
  event_name: string
  source_system: string
  source_entity_type: string
  source_entity_id: string
  source_event_id: string
  occurred_at: Date | string
  idempotency_key: string
  config_version: number | string
  consent_mode: string
  attribution: unknown
  value: number | string | null
  currency_code: string | null
  outbox_status: string
  last_error_class: string | null
}
```

Update `mapEvent` (currently lines 51-69) to map both fields through:

```ts
function mapEvent(row: ConversionEventRow): CanonicalConversionOutboxEvent {
  return CanonicalConversionOutboxEventSchema.parse({
    eventId: row.id,
    clientId: row.client_id,
    profileId: row.profile_id,
    eventName: row.event_name,
    sourceSystem: row.source_system,
    sourceEntityType: row.source_entity_type,
    sourceEntityId: row.source_entity_id,
    sourceEventId: row.source_event_id,
    occurredAt: iso(row.occurred_at),
    idempotencyKey: row.idempotency_key,
    configVersion: Number(row.config_version),
    consentMode: row.consent_mode,
    attribution: row.attribution,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : null,
    currencyCode: row.currency_code ?? null,
    outboxStatus: row.outbox_status,
    policyReason: row.last_error_class
  })
}
```

Update `EVENT_COLUMNS` (currently lines 117-121):

```ts
const EVENT_COLUMNS = `
  id, client_id, profile_id, event_name, source_system, source_entity_type,
  source_entity_id, source_event_id, occurred_at, idempotency_key,
  config_version, consent_mode, attribution, value, currency_code,
  outbox_status, last_error_class
`
```

Update the INSERT statement inside `appendCanonicalConversionEvent` (currently lines 173-199):

```ts
  const currencyCode = input.value !== null ? 'AUD' : null
  const insertedResult = await db.query(
    `INSERT INTO conversion_events (
       client_id, profile_id, event_name, source_system, source_entity_type,
       source_entity_id, source_event_id, occurred_at, idempotency_key,
       config_version, consent_mode, attribution, value, currency_code,
       outbox_status, last_error_class
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16
     )
     ON CONFLICT DO NOTHING
     RETURNING ${EVENT_COLUMNS}`,
    [
      input.clientId,
      profile.id,
      input.eventName,
      input.sourceSystem,
      input.sourceEntityType,
      input.sourceEntityId,
      input.sourceEventId,
      input.occurredAt,
      idempotencyKey,
      Number(profile.config_version),
      profile.consent_mode,
      JSON.stringify(input.attribution),
      input.value,
      currencyCode,
      policy.status,
      policy.reason
    ]
  )
```

This changes the parameter positions after `attribution` — the pre-existing tests in this file don't assert the full INSERT params array (only SQL text patterns and specific unrelated checks), so they remain unaffected.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/measurement/outbox.test.ts`
Expected: PASS — all tests including the two new ones.

- [ ] **Step 6: Commit**

```bash
git add server/utils/measurement/contracts.ts server/utils/measurement/outbox.ts test/server/utils/measurement/outbox.test.ts
git commit -m "feat(measurement): persist conversion value and derived AUD currency"
```

---

### Task 3: Source the value at the opportunity-won transition

**Files:**
- Modify: `server/utils/crm/opportunityStageTransition.ts:307-319`
- Test: `test/server/utils/crm/opportunityStageTransition.test.ts`

**Interfaces:**
- Consumes: Task 2's `AppendCanonicalConversionEvent.value: number | null` field on the object passed to `deps.appendOutbox`.
- Produces: nothing new consumed by later tasks — this is the terminal business-logic decision of *whether* a value is attached.

- [ ] **Step 1: Update the `opportunity()` test fixture and write the failing tests**

In `test/server/utils/crm/opportunityStageTransition.test.ts`, update the `opportunity()` helper (currently lines 37-46) to include an `amount` field so it matches the real `crm_opportunities` row shape:

```ts
function opportunity() {
  return {
    id: OPPORTUNITY_ID,
    client_id: CLIENT_ID,
    stage_id: FROM_STAGE_ID,
    stage_code: 'new',
    owner_id: null,
    status: 'open',
    amount: '0.00'
  }
}
```

This doesn't change any existing test's behavior (`amount` was already unused by them). Now add three new `it` blocks inside the existing `describe('opportunity stage transition service', ...)` block, after the last existing test:

```ts
  it('passes the opportunity amount as the conversion value on a won transition', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM crm_stages/.test(sql)) return { rows: [{ ...stage(), code: 'won', is_won: true }] }
        if (/FROM crm_opportunities[\s\S]*FOR UPDATE/.test(sql)) return { rows: [opportunity()] }
        if (/UPDATE crm_opportunities/.test(sql)) {
          return { rows: [{ ...opportunity(), stage_id: TO_STAGE_ID, status: 'won', amount: '15000.50' }] }
        }
        if (/INSERT INTO crm_opportunity_stage_history/.test(sql)) {
          return { rows: [{ id: HISTORY_ID, changed_at: new Date(command().occurredAt) }] }
        }
        if (/measurement_lifecycle_mappings/.test(sql)) {
          return { rows: [{ canonical_event_name: 'lead_won' }] }
        }
        if (/FROM lead_crm_links/.test(sql)) return { rows: [] }
        if (/SELECT id[\s\S]*FROM lead_status_events/.test(sql)) return { rows: [] }
        return { rows: [] }
      })
    }
    const appendOutbox = vi.fn(async () => ({
      status: 'created' as const,
      event: { eventId: '88888888-8888-4888-8888-888888888888', outboxStatus: 'pending' },
      deliveryCount: 1
    }))
    const service = createOpportunityStageTransitionService({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never,
      appendOutbox: appendOutbox as never
    })

    await service.move(command())

    expect(appendOutbox).toHaveBeenCalledWith(db, expect.objectContaining({
      eventName: 'lead_won',
      value: 15000.5
    }))
  })

  it('omits a conversion value when the won opportunity amount was never set', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM crm_stages/.test(sql)) return { rows: [{ ...stage(), code: 'won', is_won: true }] }
        if (/FROM crm_opportunities[\s\S]*FOR UPDATE/.test(sql)) return { rows: [opportunity()] }
        if (/UPDATE crm_opportunities/.test(sql)) {
          return { rows: [{ ...opportunity(), stage_id: TO_STAGE_ID, status: 'won', amount: '0.00' }] }
        }
        if (/INSERT INTO crm_opportunity_stage_history/.test(sql)) {
          return { rows: [{ id: HISTORY_ID, changed_at: new Date(command().occurredAt) }] }
        }
        if (/measurement_lifecycle_mappings/.test(sql)) {
          return { rows: [{ canonical_event_name: 'lead_won' }] }
        }
        if (/FROM lead_crm_links/.test(sql)) return { rows: [] }
        if (/SELECT id[\s\S]*FROM lead_status_events/.test(sql)) return { rows: [] }
        return { rows: [] }
      })
    }
    const appendOutbox = vi.fn(async () => ({
      status: 'created' as const,
      event: { eventId: '88888888-8888-4888-8888-888888888888', outboxStatus: 'pending' },
      deliveryCount: 1
    }))
    const service = createOpportunityStageTransitionService({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never,
      appendOutbox: appendOutbox as never
    })

    await service.move(command())

    expect(appendOutbox).toHaveBeenCalledWith(db, expect.objectContaining({
      eventName: 'lead_won',
      value: null
    }))
  })

  it('never attaches a conversion value to a non-won transition even when the opportunity has a set amount', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM crm_stages/.test(sql)) return { rows: [stage()] }
        if (/FROM crm_opportunities[\s\S]*FOR UPDATE/.test(sql)) return { rows: [opportunity()] }
        if (/UPDATE crm_opportunities/.test(sql)) {
          return { rows: [{ ...opportunity(), stage_id: TO_STAGE_ID, amount: '15000.50' }] }
        }
        if (/INSERT INTO crm_opportunity_stage_history/.test(sql)) {
          return { rows: [{ id: HISTORY_ID, changed_at: new Date(command().occurredAt) }] }
        }
        if (/measurement_lifecycle_mappings/.test(sql)) {
          return { rows: [{ canonical_event_name: 'lead_qualified' }] }
        }
        if (/FROM lead_crm_links/.test(sql)) return { rows: [] }
        if (/SELECT id[\s\S]*FROM lead_status_events/.test(sql)) return { rows: [] }
        return { rows: [] }
      })
    }
    const appendOutbox = vi.fn(async () => ({
      status: 'created' as const,
      event: { eventId: '88888888-8888-4888-8888-888888888888', outboxStatus: 'pending' },
      deliveryCount: 1
    }))
    const service = createOpportunityStageTransitionService({
      transaction: (async (callback: (client: typeof db) => Promise<unknown>) => callback(db)) as never,
      appendOutbox: appendOutbox as never
    })

    await service.move(command())

    expect(appendOutbox).toHaveBeenCalledWith(db, expect.objectContaining({
      eventName: 'lead_qualified',
      value: null
    }))
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/server/utils/crm/opportunityStageTransition.test.ts`
Expected: FAIL — `appendOutbox` is called without a `value` key at all, so `expect.objectContaining({ value: ... })` fails for all three new tests.

- [ ] **Step 3: Compute and pass the value**

In `server/utils/crm/opportunityStageTransition.ts`, replace the `appendOutbox` call block (currently lines 307-319):

```ts
        let outbox: AppendCanonicalConversionEventResult | null = null
        if (canonicalEventName && authorityDecision === 'accepted') {
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

(The rest of the `if` block — the `outbox.status === 'profile_not_found'` check and everything after it — is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/crm/opportunityStageTransition.test.ts`
Expected: PASS — all tests including the three new ones and the five pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/opportunityStageTransition.ts test/server/utils/crm/opportunityStageTransition.test.ts
git commit -m "feat(crm): pass real deal value on lead_won opportunity transitions"
```

---

### Task 4: Delivery claim carries the conversion value

**Files:**
- Modify: `workers/measurement-delivery/src/providers.ts:1-22` (`MeasurementProviderDelivery` interface only — payload logic is Task 5)
- Modify: `workers/measurement-delivery/src/repository.ts:19-53,85-150,170-259` (`DeliveryRow`, `mapClaim`, `claimNext` SELECT)
- Test: `test/workers/measurementDeliveryRepository.test.ts`

**Interfaces:**
- Consumes: Task 1's `conversion_events.value`/`.currency_code` columns (SQL text only, DB mocked in tests).
- Produces: `MeasurementProviderDelivery.value: number | null` / `.currency: string | null` (and, via `MeasurementDeliveryClaim extends MeasurementProviderDelivery`, the same fields on every delivery claim) — consumed by Task 5's provider payload functions.

- [ ] **Step 1: Write the failing tests**

Add these two `it` blocks inside the existing `describe('measurement delivery repository', ...)` block in `test/workers/measurementDeliveryRepository.test.ts`, after the last existing test:

```ts
  it('maps a stored conversion value and currency onto the claimed delivery', async () => {
    const row = { ...deliveryRow(), value: '15000.50', currency_code: 'AUD' }
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/SELECT[\s\S]*FOR UPDATE OF d SKIP LOCKED/.test(sql)) return { rows: [row] }
        if (/UPDATE conversion_deliveries/.test(sql)) return { rows: [{ attempt_count: 1 }] }
        return { rows: [] }
      })
    }
    const repository = createMeasurementDeliveryRepository({
      transaction: (async (callback: (db: typeof client) => Promise<unknown>) => callback(client)) as never
    })

    const claim = await repository.claimNext({
      schemaVersion: 1,
      clientId: CLIENT_ID,
      eventId: EVENT_ID,
      enqueuedAt: NOW.toISOString()
    }, 'measurement-worker:test', NOW)

    expect(claim).toMatchObject({ value: 15000.5, currency: 'AUD' })
  })

  it('leaves value and currency null when the event carries no conversion value', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/SELECT[\s\S]*FOR UPDATE OF d SKIP LOCKED/.test(sql)) return { rows: [deliveryRow()] }
        if (/UPDATE conversion_deliveries/.test(sql)) return { rows: [{ attempt_count: 1 }] }
        return { rows: [] }
      })
    }
    const repository = createMeasurementDeliveryRepository({
      transaction: (async (callback: (db: typeof client) => Promise<unknown>) => callback(client)) as never
    })

    const claim = await repository.claimNext({
      schemaVersion: 1,
      clientId: CLIENT_ID,
      eventId: EVENT_ID,
      enqueuedAt: NOW.toISOString()
    }, 'measurement-worker:test', NOW)

    expect(claim).toMatchObject({ value: null, currency: null })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/workers/measurementDeliveryRepository.test.ts`
Expected: FAIL — `claim.value` and `claim.currency` are `undefined`, not the expected values.

- [ ] **Step 3: Add `value`/`currency` to the `MeasurementProviderDelivery` interface**

In `workers/measurement-delivery/src/providers.ts`, update the interface (currently lines 1-22):

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
  }
}
```

- [ ] **Step 4: Add `value`/`currency_code` to the repository's row type, SELECT, and claim mapping**

In `workers/measurement-delivery/src/repository.ts`, add two fields to `DeliveryRow` (currently lines 19-53), inserted after `attribution: unknown`:

```ts
interface DeliveryRow {
  delivery_id: string
  destination_id: string
  attempt_count: number | string
  platform: 'meta' | 'google_data_manager'
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
}
```

Add `value`/`currency` to the object returned by `mapClaim` (currently lines 85-150), inserted right after `metaDeliveryMode,`:

```ts
  return {
    clientId,
    deliveryId: row.delivery_id,
    destinationId: row.destination_id,
    attemptNumber,
    platform: row.platform,
    profileEnabled: row.profile_enabled,
    profileEnvironment: row.profile_environment,
    profileCacheCurrent: row.profile_cache_status === 'fresh'
      && Number(row.profile_cache_version) === Number(row.profile_config_version),
    destinationEnabled: row.destination_enabled,
    destinationEnvironment: row.destination_environment,
    destinationHealthStatus: row.destination_health_status,
    deliveryConfigCurrent: Number(row.event_config_version) === Number(row.profile_config_version)
      && Boolean(row.provider_event_name),
    eventId: row.event_id,
    eventName: row.event_name,
    providerEventName: row.provider_event_name ?? '',
    occurredAt: iso(row.occurred_at),
    idempotencyKey: row.idempotency_key,
    externalDestinationId: row.external_destination_id,
    operatingAccountId: accountId,
    loginAccountId: loginAccountId.replace(/-/g, ''),
    metaDeliveryMode,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : null,
    currency: row.currency_code ?? null,
    credentialRef: row.credential_ref,
    refreshToken: row.refresh_token,
    connectionScopes: scopes,
    attribution: {
      browserEventId,
      metaLeadId,
      gclid: optionalString(attribution.gclid) ?? optionalString(row.tracking_gclid),
      gbraid: optionalString(attribution.gbraid) ?? optionalString(row.tracking_gbraid),
      wbraid: optionalString(attribution.wbraid) ?? optionalString(row.tracking_wbraid),
      fbc: optionalString(row.tracking_fbc),
      fbp: optionalString(row.tracking_fbp),
      eventSourceUrl: safeEventSourceUrl(row.tracking_page_url),
      clientUserAgent: optionalString(row.tracking_ua, 1024)
    }
  }
```

Add `e.value, e.currency_code,` to the `claimNext` SELECT (currently lines 170-259), inserted right after `e.attribution,`:

```sql
             SELECT d.id AS delivery_id,
                    d.destination_id,
                    d.attempt_count,
                    dest.platform,
                    p.enabled AS profile_enabled,
                    p.environment AS profile_environment,
                    p.cache_status AS profile_cache_status,
                    p.cache_version AS profile_cache_version,
                    p.config_version AS profile_config_version,
                    dest.enabled AS destination_enabled,
                    dest.environment AS destination_environment,
                    dest.health_status AS destination_health_status,
                    e.config_version AS event_config_version,
                    e.id AS event_id,
                    e.event_name,
                    m.provider_event_name,
                    e.occurred_at,
                    e.idempotency_key,
                    e.attribution,
                    e.value,
                    e.currency_code,
                    caps.capability_modes,
```

(The rest of the query — the joins and `WHERE` clause — is unchanged.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/workers/measurementDeliveryRepository.test.ts`
Expected: PASS — all tests including the two new ones.

- [ ] **Step 6: Commit**

```bash
git add workers/measurement-delivery/src/providers.ts workers/measurement-delivery/src/repository.ts test/workers/measurementDeliveryRepository.test.ts
git commit -m "feat(measurement-delivery): carry conversion value on the delivery claim"
```

---

### Task 5: Include the value in the Meta and Google provider payloads

**Files:**
- Modify: `workers/measurement-delivery/src/providers.ts:98-211` (`deliverMetaConversionEvent`), `:213-295` (`deliverGoogleDataManagerEvent`)
- Modify: `test/workers/measurementDeliveryProviders.test.ts` (`baseDelivery` fixture)
- Test: `test/workers/measurementDeliveryProviders.test.ts`

**Interfaces:**
- Consumes: Task 4's `MeasurementProviderDelivery.value: number | null` / `.currency: string | null`.
- Produces: nothing new consumed by later tasks — this is the final leaf of the pipeline.

- [ ] **Step 1: Update the `baseDelivery` fixture and write the failing tests**

In `test/workers/measurementDeliveryProviders.test.ts`, add `value: null, currency: null` to `baseDelivery` (currently lines 8-29), inserted after `metaDeliveryMode: 'crm' as const,`:

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
    clientUserAgent: null
  }
}
```

This doesn't change the behavior of any pre-existing test — every existing test that asserts an exact `custom_data`/`events[0]` payload with `toEqual` continues to pass, because `value: null` contributes nothing to the spread-based additions being introduced below.

Now add these two `it` blocks inside the existing `describe('measurement delivery provider adapters', ...)` block, after the last existing test:

```ts
  it('includes value and currency in the Meta CRM payload when a conversion value is present', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      events_received: 1,
      fbtrace_id: 'meta-trace-value'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await deliverMetaConversionEvent({
      delivery: { ...baseDelivery, eventName: 'lead_won', value: 15000.5, currency: 'AUD' },
      accessToken: 'meta-access-token',
      graphApiVersion: 'v25.0',
      fetch
    })

    const [, request] = fetch.mock.calls[0]!
    expect(JSON.parse(request.body as string).data[0].custom_data).toEqual({
      lead_event_source: 'XeroFlow',
      event_source: 'crm',
      value: 15000.5,
      currency: 'AUD'
    })
  })

  it('sends a Google Data Manager event with a root-level conversion value and currency', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      requestId: 'google-request-value'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await deliverGoogleDataManagerEvent({
      delivery: { ...baseDelivery, eventName: 'lead_won', value: 15000.5, currency: 'AUD' },
      accessToken: 'google-access-token',
      fetch
    })

    const [, request] = fetch.mock.calls[0]!
    expect(JSON.parse(request.body as string).events[0]).toEqual({
      adIdentifiers: { gclid: 'gclid-1' },
      eventTimestamp: '2026-07-17T06:00:00.000Z',
      transactionId: 'v1:canonical-event-key',
      eventSource: 'WEB',
      conversionValue: 15000.5,
      currency: 'AUD'
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/workers/measurementDeliveryProviders.test.ts`
Expected: FAIL — the two new tests fail because neither payload includes `value`/`currency` or `conversionValue`/`currency` yet. (All pre-existing tests should still pass at this point, since only the fixture gained two `null` fields.)

- [ ] **Step 3: Add value/currency to the Meta CRM payload**

In `workers/measurement-delivery/src/providers.ts`, inside `deliverMetaConversionEvent`, update the `custom_data` construction (currently lines 183-193):

```ts
          ...(!isWeb
            ? {
                custom_data: {
                  // Required Conversion Leads CRM markers. Website CAPI events
                  // intentionally do not use this payload contract.
                  // https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration
                  lead_event_source: META_CRM_LEAD_EVENT_SOURCE,
                  event_source: 'crm',
                  ...(delivery.value !== null ? { value: delivery.value, currency: delivery.currency } : {})
                }
              }
            : {})
```

- [ ] **Step 4: Add value/currency to the Google Data Manager payload**

Inside `deliverGoogleDataManagerEvent`, update the `events` array (currently lines 257-265):

```ts
      events: [{
        adIdentifiers,
        eventTimestamp: delivery.occurredAt,
        // Google Data Manager uses transactionId to deduplicate a tag event and
        // an additional API source. Browser-paired events therefore reuse the
        // browser ID; server-only lifecycle events keep the canonical key.
        // Source: https://developers.google.com/data-manager/api/devguides/events/send-events
        transactionId: delivery.attribution.browserEventId ?? delivery.idempotencyKey,
        eventSource: 'WEB',
        ...(delivery.value !== null ? { conversionValue: delivery.value, currency: delivery.currency } : {})
      }],
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/workers/measurementDeliveryProviders.test.ts`
Expected: PASS — all tests including the two new ones.

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test:run`
Expected: Same 20 pre-existing failing files as the pre-work baseline (unrelated: email panels, audio/video studio, spend controller, GA4 funnel, channel taxonomy, role resolver, leads webhook, deploy scripts) — no new failures introduced by this feature.

- [ ] **Step 7: Commit**

```bash
git add workers/measurement-delivery/src/providers.ts test/workers/measurementDeliveryProviders.test.ts
git commit -m "feat(measurement-delivery): send conversion value to Meta CAPI and Google Data Manager"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1) → contracts + persistence (Task 2) → value sourcing (Task 3) → claim plumbing (Task 4) → provider payloads (Task 5) covers every section of the design doc. The "never touch `statusTransition.ts`" and "0 means omit" constraints are enforced by Task 3's guard logic and covered by its dedicated test. Forward-only/no-backfill and AUD-only are structural (no code path exists to do otherwise) rather than needing their own task.
- **Type consistency:** `value: number | null` / `currency: string | null` names are identical across `MeasurementProviderDelivery` (Task 4), `MeasurementDeliveryClaim` (inherited via `extends`, no redeclaration needed), and their consumption in `providers.ts` payload functions (Task 5). `value: number | null` / `currencyCode: 'AUD' | null` on the Zod contracts (Task 2) intentionally use `currencyCode` (camelCase, matching every other field in that schema) while the DB column and delivery-side field use `currency_code`/`currency` (matching each layer's existing naming convention) — this is a deliberate naming boundary at each serialization layer, not an inconsistency.
- **Placeholder scan:** No TBD/TODO/"handle appropriately" anywhere in this plan — every step has literal code.
