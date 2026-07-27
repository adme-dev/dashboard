# Measurement Destination Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it possible to bring a conversion destination live through the product, by wiring provider tests and operator attestation into `healthService.recordValidation` so `health_status` can reach `ready`.

**Architecture:** Two evidence paths converge on the existing, already-tested `healthService.recordValidation`. Provider tests auto-record machine evidence for the capabilities they exercise; browser-tag capabilities get audited operator attestation through a new route. A new shared module becomes the single source of truth for the platform union, capability definitions, and test coverage.

**Tech Stack:** Nuxt 4 / Nitro, Vue 3 `<script setup>`, Nuxt UI v4, Zod, Vitest, Neon Postgres.

**Spec:** `docs/superpowers/specs/2026-07-27-measurement-destination-validation-design.md`

## Global Constraints

- Server imports use the `~~/` alias, never `~/`. Shared modules are imported as `~~/shared/utils/<name>` from both server and Vue code — `contracts.ts:2` already does this for `measurementProviderCredential`.
- No database migration. Every column, table, and enum value required already exists.
- All UI uses Nuxt UI v4 components. Never raw `<select>`, `<input>`, `<button>`, or browser dialogs.
- Semantic colour classes only (`text-muted`, `bg-elevated`, `border-default`) so dark mode works.
- Test-suite baseline is **20 failing files / 39 failing tests** (unrelated: email panels, audio/video studio, spend controller, GA4 funnel, channel taxonomy, role resolver, leads webhook, deploy scripts, actionPlanAi, financialInsightsAi, groqFeatureKeyCoverage). Regressions are measured against this baseline, not zero.
- Run the suite with `pnpm vitest run`. Never pipe it to `tail` when you need the exit code — the pipe masks vitest's status.
- Commit after each task. Do not push, open a PR, or deploy.

---

### Task 1: Shared platform source of truth

Creates the module every later task imports. Nothing behavioural changes yet.

**Files:**
- Create: `shared/utils/measurementPlatform.ts`
- Modify: `server/utils/measurement/contracts.ts` (lines 31-43 `CapabilityModeSchema`, line ~217 `PLATFORM_MODE_PREFIX`, and `MeasurementPlatformSchema`)
- Test: `test/server/utils/measurement/measurementPlatform.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MEASUREMENT_PLATFORMS`, `MeasurementPlatform`, `PLATFORM_LABELS`, `PLATFORM_MODE_PREFIX`, `CAPABILITY_DEFINITIONS`, `ProviderTestMode`, `TEST_PLATFORM`, `TEST_COVERAGE`, `coveredCapabilityModes(mode)`, `directlyExercisedModes(mode, deliveryMode, canonicalEventName)`, `isAttestationOnly(capabilityMode)`.

- [ ] **Step 1: Write the failing test**

Create `test/server/utils/measurement/measurementPlatform.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_DEFINITIONS,
  MEASUREMENT_PLATFORMS,
  PLATFORM_MODE_PREFIX,
  TEST_COVERAGE,
  TEST_PLATFORM,
  coveredCapabilityModes,
  directlyExercisedModes,
  isAttestationOnly
} from '../../../../shared/utils/measurementPlatform'

describe('measurementPlatform', () => {
  it('lists every supported platform', () => {
    expect(MEASUREMENT_PLATFORMS).toEqual(['meta', 'google_data_manager', 'ga4'])
  })

  it('gives every platform a mode prefix and capability set', () => {
    for (const platform of MEASUREMENT_PLATFORMS) {
      expect(PLATFORM_MODE_PREFIX[platform]).toBeTruthy()
      expect(CAPABILITY_DEFINITIONS[platform].length).toBeGreaterThan(0)
    }
  })

  it('keeps every capability mode inside its platform prefix', () => {
    for (const platform of MEASUREMENT_PLATFORMS) {
      for (const capability of CAPABILITY_DEFINITIONS[platform]) {
        expect(capability.mode.startsWith(PLATFORM_MODE_PREFIX[platform])).toBe(true)
      }
    }
  })

  it('maps each test mode to its platform', () => {
    expect(TEST_PLATFORM.meta_test_events).toBe('meta')
    expect(TEST_PLATFORM.google_validate_only).toBe('google_data_manager')
    expect(TEST_PLATFORM.ga4_debug_validation).toBe('ga4')
  })

  it('collapses all three Meta CAPI capabilities onto one test', () => {
    expect(coveredCapabilityModes('meta_test_events')).toEqual([
      'meta_web_capi',
      'meta_crm_capi',
      'meta_conversion_leads'
    ])
  })

  it('never lets a test cover meta_pixel', () => {
    expect(coveredCapabilityModes('meta_test_events')).not.toContain('meta_pixel')
  })

  it('covers exactly one capability for google and ga4', () => {
    expect(coveredCapabilityModes('google_validate_only')).toEqual(['google_data_manager'])
    expect(coveredCapabilityModes('ga4_debug_validation')).toEqual(['ga4_measurement_protocol'])
  })

  it('treats tag capabilities as attestation-only', () => {
    expect(isAttestationOnly('meta_pixel')).toBe(true)
    expect(isAttestationOnly('google_tag_enhanced_conversions')).toBe(true)
    expect(isAttestationOnly('google_enhanced_conversions_for_leads')).toBe(true)
  })

  it('does not treat test-covered capabilities as attestation-only', () => {
    expect(isAttestationOnly('meta_web_capi')).toBe(false)
    expect(isAttestationOnly('ga4_measurement_protocol')).toBe(false)
  })

  it('reports a web Meta test as directly exercising only the web path', () => {
    expect(directlyExercisedModes('meta_test_events', 'web', 'lead_created'))
      .toEqual(['meta_web_capi'])
  })

  it('reports a crm Meta test on a downstream outcome as exercising both crm capabilities', () => {
    expect(directlyExercisedModes('meta_test_events', 'crm', 'lead_qualified'))
      .toEqual(['meta_crm_capi', 'meta_conversion_leads'])
  })

  it('reports a crm Meta test on lead_created as exercising only crm capi', () => {
    expect(directlyExercisedModes('meta_test_events', 'crm', 'lead_created'))
      .toEqual(['meta_crm_capi'])
  })

  it('reports non-Meta tests as directly exercising everything they cover', () => {
    expect(directlyExercisedModes('ga4_debug_validation', null, 'purchase'))
      .toEqual(['ga4_measurement_protocol'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/server/utils/measurement/measurementPlatform.test.ts`
Expected: FAIL — cannot resolve `shared/utils/measurementPlatform`.

- [ ] **Step 3: Create the shared module**

Create `shared/utils/measurementPlatform.ts`:

```ts
export const MEASUREMENT_PLATFORMS = ['meta', 'google_data_manager', 'ga4'] as const
export type MeasurementPlatform = typeof MEASUREMENT_PLATFORMS[number]

export const PLATFORM_LABELS: Record<MeasurementPlatform, string> = {
  meta: 'Meta',
  google_data_manager: 'Google Data Manager',
  ga4: 'Google Analytics 4'
}

export const PLATFORM_MODE_PREFIX: Record<MeasurementPlatform, string> = {
  meta: 'meta_',
  google_data_manager: 'google_',
  ga4: 'ga4_'
}

export type CapabilityManagementOrigin = 'zero' | 'gtm' | 'partner' | 'external'

export interface CapabilityDefinition {
  mode: string
  label: string
  description: string
  defaultOrigin: CapabilityManagementOrigin
}

export const CAPABILITY_DEFINITIONS: Record<MeasurementPlatform, CapabilityDefinition[]> = {
  meta: [
    { mode: 'meta_pixel', label: 'Meta Pixel', description: 'Browser events, usually managed in GTM or the client website.', defaultOrigin: 'gtm' },
    { mode: 'meta_web_capi', label: 'Meta Web CAPI', description: 'Server-side web events with browser-event deduplication.', defaultOrigin: 'gtm' },
    { mode: 'meta_crm_capi', label: 'Meta CRM CAPI', description: 'Zero lead and CRM lifecycle outcomes sent server-side.', defaultOrigin: 'zero' },
    { mode: 'meta_conversion_leads', label: 'Meta Conversion Leads', description: 'Qualified and downstream lead outcomes used for optimisation.', defaultOrigin: 'zero' }
  ],
  google_data_manager: [
    { mode: 'google_tag_enhanced_conversions', label: 'Google tag enhanced conversions', description: 'Browser conversion tags enriched with consented first-party data.', defaultOrigin: 'gtm' },
    { mode: 'google_enhanced_conversions_for_leads', label: 'Google enhanced conversions for leads', description: 'Qualified and downstream lead outcomes matched to ad clicks.', defaultOrigin: 'zero' },
    { mode: 'google_data_manager', label: 'Google Data Manager', description: 'Server-side audience and conversion data delivery.', defaultOrigin: 'zero' }
  ],
  ga4: [
    { mode: 'ga4_measurement_protocol', label: 'GA4 Measurement Protocol', description: 'Server-side micro-conversions delivered to GA4, forwarded to Google Ads by the client GA4 link.', defaultOrigin: 'zero' }
  ]
}

export type ProviderTestMode = 'meta_test_events' | 'google_validate_only' | 'ga4_debug_validation'

export const TEST_PLATFORM: Record<ProviderTestMode, MeasurementPlatform> = {
  meta_test_events: 'meta',
  google_validate_only: 'google_data_manager',
  ga4_debug_validation: 'ga4'
}

/**
 * Capability modes a successful test proves.
 *
 * Meta's three CAPI capabilities are deliberately collapsed onto a single test
 * so onboarding needs one test plus one meta_pixel attestation. No single test
 * can genuinely exercise both Meta paths — web mode is restricted to
 * lead_created/purchase/web_conversion while meta_conversion_leads covers
 * downstream outcomes — so at least one capability is always proven by
 * inference. Use directlyExercisedModes() to record which is which.
 */
export const TEST_COVERAGE: Record<ProviderTestMode, readonly string[]> = {
  meta_test_events: ['meta_web_capi', 'meta_crm_capi', 'meta_conversion_leads'],
  google_validate_only: ['google_data_manager'],
  ga4_debug_validation: ['ga4_measurement_protocol']
}

const DOWNSTREAM_LIFECYCLE_EVENTS = new Set([
  'lead_contacted',
  'lead_qualified',
  'lead_won',
  'lead_lost'
])

const TEST_COVERED_MODES = new Set(Object.values(TEST_COVERAGE).flatMap(modes => [...modes]))

export function coveredCapabilityModes(mode: ProviderTestMode): string[] {
  return [...(TEST_COVERAGE[mode] ?? [])]
}

/**
 * The subset of coveredCapabilityModes() the provider call actually exercised.
 * Everything else in the covered set was inferred from the Meta collapse.
 */
export function directlyExercisedModes(
  mode: ProviderTestMode,
  deliveryMode: 'crm' | 'web' | null,
  canonicalEventName: string
): string[] {
  if (mode !== 'meta_test_events') return coveredCapabilityModes(mode)
  if (deliveryMode === 'web') return ['meta_web_capi']
  return DOWNSTREAM_LIFECYCLE_EVENTS.has(canonicalEventName)
    ? ['meta_crm_capi', 'meta_conversion_leads']
    : ['meta_crm_capi']
}

/** A capability is attestation-only precisely when no provider test covers it. */
export function isAttestationOnly(capabilityMode: string): boolean {
  return !TEST_COVERED_MODES.has(capabilityMode)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/server/utils/measurement/measurementPlatform.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Derive contracts from the shared module**

In `server/utils/measurement/contracts.ts`, add to the imports at the top:

```ts
import {
  MEASUREMENT_PLATFORMS,
  PLATFORM_MODE_PREFIX as SHARED_PLATFORM_MODE_PREFIX
} from '~~/shared/utils/measurementPlatform'
```

Replace the hand-written `MeasurementPlatformSchema` union with a derivation, and re-export the prefix map so existing importers (`healthRepository.ts:2`) keep working:

```ts
export const MeasurementPlatformSchema = z.enum(MEASUREMENT_PLATFORMS)
export const PLATFORM_MODE_PREFIX = SHARED_PLATFORM_MODE_PREFIX
```

Delete the old literal `PLATFORM_MODE_PREFIX` object (around line 217). Leave `CapabilityModeSchema` (lines 31-43) as it is — it is a Zod enum used for runtime validation and already includes `ga4_measurement_protocol`.

- [ ] **Step 6: Run the measurement suite to verify nothing regressed**

Run: `pnpm vitest run test/server/utils/measurement/`
Expected: PASS, no new failures versus baseline.

- [ ] **Step 7: Commit**

```bash
git add shared/utils/measurementPlatform.ts test/server/utils/measurement/measurementPlatform.test.ts server/utils/measurement/contracts.ts
git commit -m "feat(measurement): shared platform source of truth"
```

---

### Task 2: Carry actor type through to the audit trail

Lets evidence record whether it was machine-observed or human-asserted. Without this, attestation is indistinguishable from a real provider test in the audit trail.

**Files:**
- Modify: `server/utils/measurement/contracts.ts` (`RecordDestinationValidationEvidenceSchema`, ~line 439)
- Modify: `server/utils/measurement/healthRepository.ts` (the `measurement_config_audit` INSERT, ~line 188-215)
- Test: `test/server/utils/measurement/healthRepository.test.ts` (extend), `test/server/utils/measurement/contracts.test.ts` (extend)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `RecordDestinationValidationEvidence['actor']` is now `{ type: 'system' | 'user', id: string }`. Task 5 passes `'system'`; Task 6 passes `'user'`.

- [ ] **Step 1: Write the failing tests**

Add to `test/server/utils/measurement/contracts.test.ts`:

```ts
it('accepts a user actor on validation evidence', () => {
  const result = RecordDestinationValidationEvidenceSchema.safeParse({
    clientId: '11111111-1111-4111-8111-111111111111',
    destinationId: '22222222-2222-4222-8222-222222222222',
    expectedConfigVersion: 3,
    observedAt: '2026-07-27T00:00:00.000Z',
    actor: { type: 'user', id: 'user-1' },
    reason: 'Operator confirmed the pixel is live on the client site',
    capabilities: [{ mode: 'meta_pixel', status: 'ready', blockingReason: null }]
  })
  expect(result.success).toBe(true)
})

it('still accepts a system actor on validation evidence', () => {
  const result = RecordDestinationValidationEvidenceSchema.safeParse({
    clientId: '11111111-1111-4111-8111-111111111111',
    destinationId: '22222222-2222-4222-8222-222222222222',
    expectedConfigVersion: 3,
    observedAt: '2026-07-27T00:00:00.000Z',
    actor: { type: 'system', id: 'user-1' },
    reason: 'Meta test events run',
    capabilities: [{ mode: 'meta_crm_capi', status: 'ready', blockingReason: null }]
  })
  expect(result.success).toBe(true)
})
```

Ensure `RecordDestinationValidationEvidenceSchema` is imported in that file; add it to the existing import list from `~~/server/utils/measurement/contracts` if absent.

Add to `test/server/utils/measurement/healthRepository.test.ts`, following the existing fake-transaction pattern already used in that file:

```ts
it('writes the supplied actor type to the audit row', async () => {
  const { repository, queries } = createRepositoryHarness()
  await repository.recordValidation(buildEvidence({
    actor: { type: 'user', id: 'user-1' },
    capabilities: [{ mode: 'meta_pixel', status: 'ready', blockingReason: null }]
  }))
  const auditInsert = queries.find(query => query.text.includes('measurement_config_audit'))
  expect(auditInsert).toBeDefined()
  expect(auditInsert!.values).toContain('user')
})
```

`createRepositoryHarness` and `buildEvidence` are the helpers already defined in that test file — reuse them rather than writing new ones. If `buildEvidence` does not accept overrides, extend it to merge a partial.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/server/utils/measurement/contracts.test.ts test/server/utils/measurement/healthRepository.test.ts`
Expected: FAIL — the schema rejects `type: 'user'`, and the audit row contains the hardcoded `'system'`.

- [ ] **Step 3: Widen the schema**

In `server/utils/measurement/contracts.ts`, inside `RecordDestinationValidationEvidenceSchema`, change:

```ts
  actor: z.strictObject({
    type: z.literal('system'),
    id: z.string().trim().min(1).max(255)
  }),
```

to:

```ts
  actor: z.strictObject({
    type: z.enum(['system', 'user']),
    id: z.string().trim().min(1).max(255)
  }),
```

- [ ] **Step 4: Pass the actor type into the audit INSERT**

In `server/utils/measurement/healthRepository.ts`, the `measurement_config_audit` INSERT currently hardcodes the literal `'system'` in the `actor_type` column. Change the VALUES clause from:

```sql
           ) VALUES (
             $1, $2, 'destination', $3, 'validated', $4,
             $5::jsonb, $6::jsonb, $7, 'system', $8, $9
           )`,
```

to:

```sql
           ) VALUES (
             $1, $2, 'destination', $3, 'validated', $4,
             $5::jsonb, $6::jsonb, $7, $8, $9, $10
           )`,
```

and change the parameter array from:

```ts
            ['health_status', 'capabilities', 'last_validated_at'],
            input.actor.id,
            input.reason
```

to:

```ts
            ['health_status', 'capabilities', 'last_validated_at'],
            input.actor.type,
            input.actor.id,
            input.reason
```

Every parameter after `$7` shifts by one. Re-read the full statement after editing and confirm the placeholder numbers still match the array positions — a reused or off-by-one `$N` fails silently rather than erroring.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run test/server/utils/measurement/contracts.test.ts test/server/utils/measurement/healthRepository.test.ts test/server/utils/measurement/healthService.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/measurement/contracts.ts server/utils/measurement/healthRepository.ts test/server/utils/measurement/contracts.test.ts test/server/utils/measurement/healthRepository.test.ts
git commit -m "feat(measurement): carry validation actor type into the audit trail"
```

---

### Task 3: GA4 debug validation provider

Adds the provider call the GA4 test mode needs. Standalone and independently testable.

**Files:**
- Modify: `workers/measurement-delivery/src/providers.ts` (add after `deliverGa4MeasurementProtocolEvent`, ~line 350)
- Test: `test/workers/measurementDeliveryProviders.test.ts` (extend; if the file does not exist, create it and mirror the fake-`fetch` pattern used in `test/server/utils/measurement/providerTestService.test.ts`)

**Interfaces:**
- Consumes: `MeasurementProviderDelivery`, `ProviderDeliveryResult`, `FetchLike`, `httpFailure` — all already in `providers.ts`.
- Produces: `validateGa4MeasurementProtocolEvent(input: Ga4ValidationInput): Promise<ProviderDeliveryResult>` where `Ga4ValidationInput = { delivery: MeasurementProviderDelivery, apiSecret: string, gaClientId: string, fetch: FetchLike }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { validateGa4MeasurementProtocolEvent } from '../../workers/measurement-delivery/src/providers'

function buildDelivery() {
  return {
    eventId: 'evt-1',
    eventName: 'phone_click',
    providerEventName: 'phone_click',
    occurredAt: '2026-07-27T00:00:00.000Z',
    idempotencyKey: '33333333-3333-4333-8333-333333333333',
    externalDestinationId: 'G-ABC123',
    operatingAccountId: 'acct-1',
    loginAccountId: 'acct-1',
    metaDeliveryMode: 'crm' as const,
    attribution: { gaClientId: null }
  } as never
}

describe('validateGa4MeasurementProtocolEvent', () => {
  it('accepts a payload GA4 reports no validation messages for', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ validationMessages: [] })
    })
    const result = await validateGa4MeasurementProtocolEvent({
      delivery: buildDelivery(),
      apiSecret: 'secret',
      gaClientId: '123.456',
      fetch: fetchMock as never
    })
    expect(result.outcome).toBe('accepted')
    expect(fetchMock.mock.calls[0][0]).toContain('/debug/mp/collect')
  })

  it('rejects a payload GA4 returns validation messages for', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        validationMessages: [{ description: 'event name is invalid', validationCode: 'NAME_INVALID' }]
      })
    })
    const result = await validateGa4MeasurementProtocolEvent({
      delivery: buildDelivery(),
      apiSecret: 'secret',
      gaClientId: '123.456',
      fetch: fetchMock as never
    })
    expect(result.outcome).toBe('permanent_failure')
    expect(result.errorClass).toBe('ga4_validation_failed')
    expect(result.redactedDiagnostic).toContain('event name is invalid')
  })

  it('reports a transport failure when GA4 returns a non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    const result = await validateGa4MeasurementProtocolEvent({
      delivery: buildDelivery(),
      apiSecret: 'secret',
      gaClientId: '123.456',
      fetch: fetchMock as never
    })
    expect(result.outcome).not.toBe('accepted')
  })

  it('treats an unparseable body as a validation failure rather than success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('not json') }
    })
    const result = await validateGa4MeasurementProtocolEvent({
      delivery: buildDelivery(),
      apiSecret: 'secret',
      gaClientId: '123.456',
      fetch: fetchMock as never
    })
    expect(result.outcome).toBe('permanent_failure')
    expect(result.errorClass).toBe('ga4_validation_unreadable')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/workers/measurementDeliveryProviders.test.ts`
Expected: FAIL — `validateGa4MeasurementProtocolEvent` is not exported.

- [ ] **Step 3: Implement the validator**

Add to `workers/measurement-delivery/src/providers.ts`:

```ts
export interface Ga4ValidationInput {
  delivery: MeasurementProviderDelivery
  apiSecret: string
  gaClientId: string
  fetch: FetchLike
}

interface Ga4ValidationMessage {
  description?: string
  validationCode?: string
}

/**
 * GA4's production /mp/collect returns 204 for essentially every request,
 * including malformed ones, so it yields no validation signal. /debug/mp/collect
 * returns a validationMessages array and is the only place GA4 gives a real
 * verdict — which makes this strictly more informative than GA4 delivery.
 */
export async function validateGa4MeasurementProtocolEvent(
  input: Ga4ValidationInput
): Promise<ProviderDeliveryResult> {
  const { delivery } = input
  const response = await input.fetch(
    `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(delivery.externalDestinationId)}&api_secret=${encodeURIComponent(input.apiSecret)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: input.gaClientId,
        events: [{
          name: delivery.providerEventName,
          params: {}
        }]
      })
    }
  )
  if (!response.ok) return httpFailure('GA4 Measurement Protocol debug', response.status)

  let messages: Ga4ValidationMessage[]
  try {
    const body = await response.json() as { validationMessages?: Ga4ValidationMessage[] }
    messages = Array.isArray(body?.validationMessages) ? body.validationMessages : []
  } catch {
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'ga4_validation_unreadable',
      redactedDiagnostic: 'GA4 debug endpoint returned an unreadable response'
    }
  }

  if (messages.length > 0) {
    const first = messages[0]
    return {
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'ga4_validation_failed',
      redactedDiagnostic: (first?.description ?? 'GA4 rejected the event payload').slice(0, 1000)
    }
  }

  return {
    outcome: 'accepted',
    providerRequestId: null,
    errorClass: null,
    redactedDiagnostic: null
  }
}
```

Note the deliberate asymmetry with `deliverGa4MeasurementProtocolEvent`: that function requires `delivery.attribution.gaClientId` because a real visitor supplies it, whereas a test has no visitor, so the client id is an explicit input here.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/workers/measurementDeliveryProviders.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add workers/measurement-delivery/src/providers.ts test/workers/measurementDeliveryProviders.test.ts
git commit -m "feat(measurement): GA4 debug validation provider"
```

---

### Task 4: GA4 provider test mode

Makes a GA4 destination testable. Without this, GA4 destinations cannot reach `ready` by any machine path.

**Files:**
- Modify: `server/utils/measurement/providerTestService.ts` (schema union ~line 88, deps interface ~line 146, `baseDelivery.attribution.gaClientId` ~line 272, provider dispatch ~line 282)
- Modify: `server/utils/measurement/providerTestRepository.ts` (`ProviderContextRow.platform` line 33, `expectedPlatform` lines 77-79)
- Modify: `server/utils/measurement/runtime.ts` (`createMeasurementProviderTestRuntime`, line 78)
- Test: `test/server/utils/measurement/providerTestService.test.ts`, `test/server/utils/measurement/providerTestRepository.test.ts`

**Interfaces:**
- Consumes: `validateGa4MeasurementProtocolEvent` (Task 3); `TEST_PLATFORM` (Task 1).
- Produces: `Ga4ProviderTestSchema` in the `MeasurementProviderTestInputSchema` union; `ProviderTestServiceDeps.validateGa4(input: { delivery, apiSecret, gaClientId }): Promise<ProviderDeliveryResult>`.

- [ ] **Step 1: Write the failing tests**

Add to `test/server/utils/measurement/providerTestRepository.test.ts`:

```ts
it('maps each provider test mode to the platform it belongs to', () => {
  expect(expectedPlatform('meta_test_events')).toBe('meta')
  expect(expectedPlatform('google_validate_only')).toBe('google_data_manager')
  expect(expectedPlatform('ga4_debug_validation')).toBe('ga4')
})
```

Export `expectedPlatform` from `providerTestRepository.ts` so the test can import it.

Add to `test/server/utils/measurement/providerTestService.test.ts`, following the existing harness in that file:

```ts
it('runs a GA4 debug validation and reports acceptance', async () => {
  const validateGa4 = vi.fn().mockResolvedValue({
    outcome: 'accepted', providerRequestId: null, errorClass: null, redactedDiagnostic: null
  })
  const { service } = createServiceHarness({ validateGa4, platform: 'ga4' })
  const result = await service.run(buildGa4Input())
  expect(validateGa4).toHaveBeenCalledOnce()
  expect(validateGa4.mock.calls[0][0].gaClientId).toBe('123.456')
  expect(result.run.status).toBe('accepted')
})

it('rejects a GA4 test whose gaClientId is missing', async () => {
  const { service } = createServiceHarness({ platform: 'ga4' })
  await expect(service.run({ ...buildGa4Input(), gaClientId: undefined }))
    .rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
})
```

Add a `buildGa4Input()` helper to that test file alongside the existing input builders:

```ts
function buildGa4Input() {
  return {
    mode: 'ga4_debug_validation',
    clientId: '11111111-1111-4111-8111-111111111111',
    destinationId: '22222222-2222-4222-8222-222222222222',
    expectedConfigVersion: 1,
    canonicalEventName: 'web_conversion',
    occurredAt: new Date().toISOString(),
    idempotencyKey: '33333333-3333-4333-8333-333333333333',
    reason: 'Validating GA4 micro-conversion delivery',
    confirmed: true,
    actor: { id: '44444444-4444-4444-8444-444444444444' },
    gaClientId: '123.456'
  }
}
```

Extend `createServiceHarness` to accept `validateGa4` and a `platform` override if it does not already.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/server/utils/measurement/providerTestService.test.ts test/server/utils/measurement/providerTestRepository.test.ts`
Expected: FAIL — `ga4_debug_validation` is not a valid mode; `expectedPlatform` is not exported.

- [ ] **Step 3: Add the GA4 test schema**

In `server/utils/measurement/providerTestService.ts`, add after `GoogleProviderTestSchema` (~line 88):

```ts
const Ga4ProviderTestSchema = CommonProviderTestSchema.extend({
  mode: z.literal('ga4_debug_validation'),
  gaClientId: z.string().trim().min(1).max(255).regex(/^[0-9]+\.[0-9]+$/)
})
```

and extend the union:

```ts
export const MeasurementProviderTestInputSchema = z.union([
  MetaCrmProviderTestSchema,
  MetaWebProviderTestSchema,
  GoogleProviderTestSchema,
  Ga4ProviderTestSchema
])
```

Add `validateGa4` to `ProviderTestServiceDeps`:

```ts
  validateGa4(input: Omit<Ga4ValidationInput, 'fetch'>): Promise<ProviderDeliveryResult>
```

importing `Ga4ValidationInput` alongside the existing provider types at the top of the file.

- [ ] **Step 4: Teach the repository about GA4**

In `server/utils/measurement/providerTestRepository.ts`, change line 33 from:

```ts
  platform: 'meta' | 'google_data_manager'
```

to:

```ts
  platform: MeasurementPlatform
```

importing `MeasurementPlatform` and `TEST_PLATFORM` from `~~/shared/utils/measurementPlatform`. Then replace `expectedPlatform` (lines 77-79):

```ts
export function expectedPlatform(mode: ProviderTestMode): MeasurementPlatform {
  return TEST_PLATFORM[mode]
}
```

The `social_connections` SQL `CASE` at line 142 already handles `ga4` — leave it alone. The Meta-specific capability and delivery-mode checks at lines 180-192 are guarded by `input.mode === 'meta_test_events'` and need no change.

- [ ] **Step 5: Dispatch the GA4 provider call**

In `providerTestService.ts`, set the GA4 client id on `baseDelivery.attribution` — change `gaClientId: null` (~line 272) to:

```ts
          gaClientId: input.mode === 'ga4_debug_validation' ? input.gaClientId : null,
```

Then add a GA4 branch to the provider dispatch, after the Google branch and before the `catch`:

```ts
        } else if (input.mode === 'ga4_debug_validation') {
          if (!context.credential.credentialRef) {
            providerResult = {
              outcome: 'permanent_failure',
              providerRequestId: null,
              errorClass: 'ga4_credential_ref_required',
              redactedDiagnostic: 'GA4 Measurement Protocol requires a purpose-scoped API secret binding'
            }
          } else {
            const apiSecret = await deps.resolveProviderCredential(context.credential.credentialRef)
            providerResult = apiSecret
              ? await deps.validateGa4({
                  delivery: baseDelivery,
                  apiSecret,
                  gaClientId: input.gaClientId
                })
              : {
                  outcome: 'permanent_failure',
                  providerRequestId: null,
                  errorClass: 'ga4_credential_unavailable',
                  redactedDiagnostic: 'GA4 API secret binding is unavailable'
                }
          }
        }
```

Confirm the surrounding `if / else if` chain still ends with the Google `else` branch intact — the Google path is currently the final `else`, so the GA4 branch must be inserted as an `else if` before it, not after.

- [ ] **Step 6: Wire the runtime**

In `server/utils/measurement/runtime.ts`, import `validateGa4MeasurementProtocolEvent` alongside the other providers (line 17-21) and add to `createMeasurementProviderTestService({ ... })`:

```ts
    validateGa4: input => validateGa4MeasurementProtocolEvent({ ...input, fetch: providerFetch }),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run test/server/utils/measurement/`
Expected: PASS, no new failures versus baseline.

- [ ] **Step 8: Commit**

```bash
git add server/utils/measurement/providerTestService.ts server/utils/measurement/providerTestRepository.ts server/utils/measurement/runtime.ts test/server/utils/measurement/
git commit -m "feat(measurement): GA4 provider test mode"
```

---

### Task 5: Record validation evidence from provider tests

The core fix. After this task a Meta, Google, or GA4 destination can reach `ready` from tests plus attestation.

**Files:**
- Modify: `server/utils/measurement/providerTestService.ts` (deps interface, `run()` completion block ~line 340-360, `sanitized()` ~line 197)
- Modify: `server/utils/measurement/runtime.ts` (`createMeasurementProviderTestRuntime`)
- Test: `test/server/utils/measurement/providerTestService.test.ts`

**Interfaces:**
- Consumes: `coveredCapabilityModes`, `directlyExercisedModes` (Task 1); widened `actor.type` (Task 2); GA4 mode (Task 4).
- Produces: the provider-test response gains a sibling `validation` key: `{ run: {...}, validation: { recorded: boolean, skippedReason: string | null, healthStatus: string | null } }`.

- [ ] **Step 1: Write the failing tests**

Add to `test/server/utils/measurement/providerTestService.test.ts`:

```ts
it('records validation evidence for the capabilities a successful test covers', async () => {
  const recordValidation = vi.fn().mockResolvedValue({ healthStatus: 'ready' })
  const { service } = createServiceHarness({ recordValidation })
  const result = await service.run(buildMetaCrmInput())
  expect(recordValidation).toHaveBeenCalledOnce()
  const evidence = recordValidation.mock.calls[0][0]
  expect(evidence.actor).toEqual({ type: 'system', id: '44444444-4444-4444-8444-444444444444' })
  expect(evidence.capabilities.map((c: { mode: string }) => c.mode)).toEqual([
    'meta_web_capi', 'meta_crm_capi', 'meta_conversion_leads'
  ])
  expect(evidence.capabilities.every((c: { status: string }) => c.status === 'ready')).toBe(true)
  expect(result.validation.recorded).toBe(true)
})

it('never records evidence for meta_pixel', async () => {
  const recordValidation = vi.fn().mockResolvedValue({ healthStatus: 'validating' })
  const { service } = createServiceHarness({ recordValidation })
  await service.run(buildMetaCrmInput())
  const evidence = recordValidation.mock.calls[0][0]
  expect(evidence.capabilities.map((c: { mode: string }) => c.mode)).not.toContain('meta_pixel')
})

it('records blocked evidence with a reason when the provider rejects the event', async () => {
  const recordValidation = vi.fn().mockResolvedValue({ healthStatus: 'blocked' })
  const { service } = createServiceHarness({
    recordValidation,
    deliverMeta: vi.fn().mockResolvedValue({
      outcome: 'permanent_failure',
      providerRequestId: null,
      errorClass: 'meta_invalid_dataset',
      redactedDiagnostic: 'Dataset rejected the event'
    })
  })
  await service.run(buildMetaCrmInput())
  const evidence = recordValidation.mock.calls[0][0]
  expect(evidence.capabilities.every((c: { status: string }) => c.status === 'blocked')).toBe(true)
  expect(evidence.capabilities.every((c: { blockingReason: string | null }) => c.blockingReason)).toBe(true)
})

it('marks a retryable provider failure as degraded rather than blocked', async () => {
  const recordValidation = vi.fn().mockResolvedValue({ healthStatus: 'degraded' })
  const { service } = createServiceHarness({
    recordValidation,
    deliverMeta: vi.fn().mockResolvedValue({
      outcome: 'retryable',
      providerRequestId: null,
      errorClass: 'provider_network_error',
      redactedDiagnostic: 'Provider validation failed before a response'
    })
  })
  await service.run(buildMetaCrmInput())
  const evidence = recordValidation.mock.calls[0][0]
  expect(evidence.capabilities.every((c: { status: string }) => c.status === 'degraded')).toBe(true)
})

it('records which capabilities were directly exercised versus inferred', async () => {
  const recordValidation = vi.fn().mockResolvedValue({ healthStatus: 'ready' })
  const { service } = createServiceHarness({ recordValidation })
  await service.run(buildMetaCrmInput())
  const evidence = recordValidation.mock.calls[0][0]
  expect(evidence.directlyExercised).toEqual(['meta_crm_capi'])
  expect(evidence.inferred).toEqual(['meta_web_capi', 'meta_conversion_leads'])
})

it('reports a version conflict without failing the test run', async () => {
  const conflict = Object.assign(new Error('conflict'), { code: 'MEASUREMENT_VERSION_CONFLICT' })
  const recordValidation = vi.fn().mockRejectedValue(conflict)
  const { service } = createServiceHarness({ recordValidation })
  const result = await service.run(buildMetaCrmInput())
  expect(result.run.status).toBe('accepted')
  expect(result.validation.recorded).toBe(false)
  expect(result.validation.skippedReason).toBe('version_conflict')
})

it('does not re-record evidence for an idempotent replay of an existing run', async () => {
  const recordValidation = vi.fn()
  const { service } = createServiceHarness({ recordValidation, reserveStatus: 'existing' })
  const result = await service.run(buildMetaCrmInput())
  expect(recordValidation).not.toHaveBeenCalled()
  expect(result.validation.recorded).toBe(false)
  expect(result.validation.skippedReason).toBe('already_run')
})
```

Extend `createServiceHarness` to accept `recordValidation` and `reserveStatus`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/server/utils/measurement/providerTestService.test.ts`
Expected: FAIL — no `validation` key on the response; `recordValidation` never called.

- [ ] **Step 3: Add the dependency and evidence construction**

In `providerTestService.ts`, add to `ProviderTestServiceDeps`:

```ts
  recordValidation(evidence: unknown): Promise<{ healthStatus: string }>
```

Add these helpers above `createMeasurementProviderTestService`:

```ts
import {
  coveredCapabilityModes,
  directlyExercisedModes
} from '~~/shared/utils/measurementPlatform'

type EvidenceStatus = 'ready' | 'degraded' | 'blocked'

function evidenceStatusFor(result: ProviderDeliveryResult): EvidenceStatus {
  if (result.outcome === 'accepted') return 'ready'
  // A retryable outcome is a transport problem, not a proven misconfiguration.
  return result.outcome === 'retryable' ? 'degraded' : 'blocked'
}

function blockingReasonFor(result: ProviderDeliveryResult, status: EvidenceStatus) {
  if (status === 'ready') return null
  return (result.redactedDiagnostic ?? result.errorClass ?? 'Provider validation failed').slice(0, 1000)
}
```

- [ ] **Step 4: Call the health service after completion**

In `run()`, replace the block that currently ends with `return sanitized({ ... })` so the run summary is captured first, evidence is recorded, and both are returned. The existing `sanitized()` returns `{ run }`; extend the return rather than changing `run`'s shape, so existing assertions on `result.run` keep passing:

```ts
      const completedAt = deps.now().toISOString()
      const status = providerResult.outcome === 'accepted' ? 'accepted' as const : 'failed' as const
      await deps.repository.complete({
        clientId: input.clientId,
        runId: context.run.id,
        status,
        providerRequestId: providerResult.providerRequestId,
        errorClass: providerResult.errorClass,
        redactedError: providerResult.redactedDiagnostic,
        completedAt
      })

      const evidenceStatus = evidenceStatusFor(providerResult)
      const blockingReason = blockingReasonFor(providerResult, evidenceStatus)
      const deliveryMode = input.mode === 'meta_test_events' ? input.deliveryMode : null
      const covered = coveredCapabilityModes(input.mode)
      const directlyExercised = directlyExercisedModes(
        input.mode,
        deliveryMode,
        input.canonicalEventName
      )

      let validation = {
        recorded: false,
        skippedReason: 'no_covered_capabilities' as string | null,
        healthStatus: null as string | null
      }
      if (covered.length > 0) {
        try {
          const recorded = await deps.recordValidation({
            clientId: input.clientId,
            destinationId: input.destinationId,
            expectedConfigVersion: input.expectedConfigVersion,
            observedAt: completedAt,
            actor: { type: 'system', id: input.actor.id },
            reason: input.reason,
            providerRequestId: providerResult.providerRequestId,
            errorClass: providerResult.errorClass,
            redactedError: providerResult.redactedDiagnostic,
            capabilities: covered.map(mode => ({
              mode,
              status: evidenceStatus,
              blockingReason
            })),
            directlyExercised,
            inferred: covered.filter(mode => !directlyExercised.includes(mode))
          })
          validation = {
            recorded: true,
            skippedReason: null,
            healthStatus: recorded.healthStatus
          }
        } catch (error) {
          // A failure to record evidence must not fail the test itself, but it
          // must be visible — a silent no-op is the bug class this work exists
          // to fix.
          const code = (error as { code?: string }).code
          validation = {
            recorded: false,
            skippedReason: code === 'MEASUREMENT_VERSION_CONFLICT'
              ? 'version_conflict'
              : 'record_failed',
            healthStatus: null
          }
        }
      }

      return {
        ...sanitized({
          id: context.run.id,
          mode: input.mode,
          status,
          providerRequestId: providerResult.providerRequestId,
          errorClass: providerResult.errorClass,
          redactedError: providerResult.redactedDiagnostic,
          completedAt
        }),
        validation
      }
```

Also update the one early return so the response shape is uniform — the other early exit (`if (reserved.status !== 'reserved') throw repositoryError(...)`) throws and needs no change. `if (reserved.status === 'existing') return sanitized(reserved.run)` becomes:

```ts
      if (reserved.status === 'existing') {
        return {
          ...sanitized(reserved.run),
          validation: { recorded: false, skippedReason: 'already_run', healthStatus: null }
        }
      }
```

`directlyExercised` and `inferred` are extra keys on the evidence object. `RecordDestinationValidationEvidenceSchema` is a `z.strictObject`, so it would reject them — the health service must strip them before parsing, or they must be passed separately. Handle this in Task 6's runtime wiring by having the runtime adapter pull them off and merge them into the audit payload; the service contract above stays as written.

- [ ] **Step 5: Wire the runtime**

In `runtime.ts`, add to `createMeasurementProviderTestRuntime` — importing `createMeasurementHealthService` and `createPostgresMeasurementHealthRepository`:

```ts
  const healthService = createMeasurementHealthService({
    repository: createPostgresMeasurementHealthRepository()
  })
```

and pass into `createMeasurementProviderTestService({ ... })`:

```ts
    recordValidation: async (evidence) => {
      const { directlyExercised, inferred, ...rest } = evidence as Record<string, unknown>
      const result = await healthService.recordValidation({
        ...rest,
        reason: [
          String(rest.reason ?? ''),
          `[directly exercised: ${(directlyExercised as string[] ?? []).join(', ') || 'none'}]`,
          `[inferred: ${(inferred as string[] ?? []).join(', ') || 'none'}]`
        ].join(' ').slice(0, 1000)
      })
      return { healthStatus: result.healthStatus }
    },
```

This keeps the directly-exercised/inferred split in the audit trail (the `reason` column is already persisted on the audit row) without widening the strict evidence schema.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run test/server/utils/measurement/`
Expected: PASS, no new failures versus baseline.

- [ ] **Step 7: Check for response-shape regressions across the whole suite**

The provider-test response gained a `validation` key. Last session four test files broke because they asserted exact-match nested object literals against a payload that gained a field.

Run: `pnpm vitest run`
Expected: 20 failed files / 39 failed tests — exactly the baseline. If any *additional* file fails, inspect it for an exact-match assertion on the provider-test response and update it.

- [ ] **Step 8: Commit**

```bash
git add server/utils/measurement/providerTestService.ts server/utils/measurement/runtime.ts test/server/utils/measurement/providerTestService.test.ts
git commit -m "feat(measurement): record validation evidence from provider tests"
```

---

### Task 6: Operator attestation service and route

Closes the remaining gap: browser-tag capabilities no test can reach.

**Files:**
- Create: `server/utils/measurement/attestationService.ts`
- Create: `server/api/agency/measurement/clients/[clientId]/destinations/[destinationId]/attest.post.ts`
- Modify: `server/utils/measurement/runtime.ts` (add `createMeasurementAttestationRuntime`)
- Test: `test/server/utils/measurement/attestationService.test.ts`

**Interfaces:**
- Consumes: `isAttestationOnly` (Task 1); widened `actor.type` (Task 2); `healthService.recordValidation`.
- Produces: `createMeasurementAttestationService(deps)` exposing `attest(rawInput)`; `createMeasurementAttestationRuntime(event)`.

- [ ] **Step 1: Write the failing test**

Create `test/server/utils/measurement/attestationService.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createMeasurementAttestationService } from '~~/server/utils/measurement/attestationService'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const DESTINATION_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '44444444-4444-4444-8444-444444444444'

function buildInput(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    destinationId: DESTINATION_ID,
    expectedConfigVersion: 1,
    capabilities: [{ mode: 'meta_pixel', status: 'ready', blockingReason: null }],
    reason: 'Confirmed the pixel fires on the client site',
    confirmed: true,
    actor: { id: ACTOR_ID },
    ...overrides
  }
}

function harness(options: { destination?: { enabled: boolean, environment: string } } = {}) {
  const recordValidation = vi.fn().mockResolvedValue({ healthStatus: 'ready' })
  const readDestination = vi.fn().mockResolvedValue(
    options.destination ?? { enabled: false, environment: 'test' }
  )
  const service = createMeasurementAttestationService({
    healthService: { recordValidation },
    readDestination,
    now: () => new Date('2026-07-27T00:00:00.000Z')
  })
  return { service, recordValidation, readDestination }
}

describe('measurement attestation service', () => {
  it('records attested evidence with a user actor', async () => {
    const { service, recordValidation } = harness()
    await service.attest(buildInput())
    expect(recordValidation).toHaveBeenCalledOnce()
    expect(recordValidation.mock.calls[0][0].actor).toEqual({ type: 'user', id: ACTOR_ID })
  })

  it('rejects attesting a capability a provider test already covers', async () => {
    const { service } = harness()
    await expect(service.attest(buildInput({
      capabilities: [{ mode: 'meta_crm_capi', status: 'ready', blockingReason: null }]
    }))).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
  })

  it('requires an explicit confirmation', async () => {
    const { service } = harness()
    await expect(service.attest(buildInput({ confirmed: false })))
      .rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
  })

  it('requires a reason', async () => {
    const { service } = harness()
    await expect(service.attest(buildInput({ reason: '   ' })))
      .rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR' })
  })

  it('downgrades a blocked attestation to degraded on a live destination', async () => {
    const { service, recordValidation } = harness({
      destination: { enabled: true, environment: 'live' }
    })
    await service.attest(buildInput({
      capabilities: [{ mode: 'meta_pixel', status: 'blocked', blockingReason: 'Pixel removed' }]
    }))
    expect(recordValidation.mock.calls[0][0].capabilities[0].status).toBe('degraded')
  })

  it('allows a forced block on a live destination', async () => {
    const { service, recordValidation } = harness({
      destination: { enabled: true, environment: 'live' }
    })
    await service.attest(buildInput({
      capabilities: [{ mode: 'meta_pixel', status: 'blocked', blockingReason: 'Pixel removed' }],
      force: true
    }))
    expect(recordValidation.mock.calls[0][0].capabilities[0].status).toBe('blocked')
  })

  it('does not downgrade a blocked attestation on a dormant destination', async () => {
    const { service, recordValidation } = harness({
      destination: { enabled: false, environment: 'test' }
    })
    await service.attest(buildInput({
      capabilities: [{ mode: 'meta_pixel', status: 'blocked', blockingReason: 'Pixel removed' }]
    }))
    expect(recordValidation.mock.calls[0][0].capabilities[0].status).toBe('blocked')
  })

  it('throws when the destination does not exist', async () => {
    const { service, readDestination } = harness()
    readDestination.mockResolvedValue(null)
    await expect(service.attest(buildInput()))
      .rejects.toMatchObject({ code: 'MEASUREMENT_NOT_FOUND' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/server/utils/measurement/attestationService.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the attestation service**

Create `server/utils/measurement/attestationService.ts`:

```ts
import { z } from 'zod'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import { isAttestationOnly } from '~~/shared/utils/measurementPlatform'

const AttestationCapabilitySchema = z.strictObject({
  mode: z.string().trim().min(1).max(255),
  status: z.enum(['ready', 'degraded', 'blocked']),
  blockingReason: z.string().trim().min(1).max(1000).nullable().default(null)
}).superRefine((capability, ctx) => {
  if (capability.status !== 'ready' && capability.blockingReason === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['blockingReason'],
      message: 'Degraded and blocked attestations require a reason'
    })
  }
  if (capability.status === 'ready' && capability.blockingReason !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['blockingReason'],
      message: 'Ready attestations must not carry a blocking reason'
    })
  }
})

export const AttestCapabilitiesSchema = z.strictObject({
  clientId: z.string().uuid(),
  destinationId: z.string().uuid(),
  expectedConfigVersion: z.number().int().positive(),
  capabilities: z.array(AttestationCapabilitySchema).min(1),
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
  force: z.boolean().default(false),
  actor: z.strictObject({ id: z.string().uuid() })
})

export interface MeasurementAttestationServiceDeps {
  healthService: { recordValidation(evidence: unknown): Promise<{ healthStatus: string }> }
  readDestination(input: { clientId: string, destinationId: string }):
    Promise<{ enabled: boolean, environment: string } | null>
  now: () => Date
}

function validationError(message = 'Invalid measurement attestation') {
  return new MeasurementError('MEASUREMENT_VALIDATION_ERROR', 422, message)
}

export function createMeasurementAttestationService(deps: MeasurementAttestationServiceDeps) {
  return {
    async attest(rawInput: unknown) {
      const parsed = AttestCapabilitiesSchema.safeParse(rawInput)
      if (!parsed.success) throw validationError()
      const input = parsed.data

      const notAttestable = input.capabilities.filter(
        capability => !isAttestationOnly(capability.mode)
      )
      if (notAttestable.length > 0) {
        throw validationError(
          'These capabilities are validated by running a provider test, not by attestation'
        )
      }

      const destination = await deps.readDestination({
        clientId: input.clientId,
        destinationId: input.destinationId
      })
      if (!destination) {
        throw new MeasurementError(
          'MEASUREMENT_NOT_FOUND',
          404,
          'Measurement destination not found'
        )
      }

      // A live destination must never be taken down by accident. Blocking one
      // is still possible, but only deliberately via force.
      const isLive = destination.enabled && destination.environment === 'live'
      const capabilities = input.capabilities.map(capability => (
        isLive && capability.status === 'blocked' && !input.force
          ? { ...capability, status: 'degraded' as const }
          : capability
      ))

      const result = await deps.healthService.recordValidation({
        clientId: input.clientId,
        destinationId: input.destinationId,
        expectedConfigVersion: input.expectedConfigVersion,
        observedAt: deps.now().toISOString(),
        actor: { type: 'user', id: input.actor.id },
        reason: input.reason,
        providerRequestId: null,
        errorClass: null,
        redactedError: null,
        capabilities
      })

      return { healthStatus: result.healthStatus, capabilities }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/server/utils/measurement/attestationService.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Add the runtime factory**

In `server/utils/measurement/runtime.ts`:

```ts
export function createMeasurementAttestationRuntime(_event: H3Event) {
  return createMeasurementAttestationService({
    healthService: createMeasurementHealthService({
      repository: createPostgresMeasurementHealthRepository()
    }),
    readDestination: async ({ clientId, destinationId }) => {
      const row = await queryOne<{ enabled: boolean, environment: string }>(
        `SELECT enabled, environment
           FROM conversion_destinations
          WHERE client_id = $1 AND id = $2`,
        [clientId, destinationId]
      )
      return row ?? null
    },
    now: () => new Date()
  })
}
```

Import `queryOne` from `~~/server/utils/db` and the attestation service factory.

- [ ] **Step 6: Add the route**

Create `server/api/agency/measurement/clients/[clientId]/destinations/[destinationId]/attest.post.ts`, mirroring the sibling `test.post.ts` exactly:

```ts
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireMeasurementClientAccess } from '~~/server/utils/measurement/access'
import { throwMeasurementHttpError } from '~~/server/utils/measurement/http'
import { createMeasurementAttestationRuntime } from '~~/server/utils/measurement/runtime'

export default defineEventHandler(async (event) => {
  const clientId = getRouterParam(event, 'clientId')
  const destinationId = getRouterParam(event, 'destinationId')
  if (!clientId || !destinationId) {
    throw createError({ statusCode: 400, statusMessage: 'Client and destination IDs are required' })
  }

  const user = await requireMeasurementClientAccess(event, clientId, 'configure')
  const body = await readBody(event)

  try {
    return await createMeasurementAttestationRuntime(event).attest({
      ...body,
      clientId,
      destinationId,
      actor: { id: user.id }
    })
  } catch (error) {
    throwMeasurementHttpError(error)
  }
})
```

- [ ] **Step 7: Run the measurement suite**

Run: `pnpm vitest run test/server/utils/measurement/`
Expected: PASS, no new failures versus baseline.

- [ ] **Step 8: Commit**

```bash
git add server/utils/measurement/attestationService.ts server/utils/measurement/runtime.ts "server/api/agency/measurement/clients/[clientId]/destinations/[destinationId]/attest.post.ts" test/server/utils/measurement/attestationService.test.ts
git commit -m "feat(measurement): operator attestation for tag capabilities"
```

---

### Task 7: GA4 support in the destination editor

Without this, no GA4 destination can be created through the UI at all.

**Files:**
- Modify: `app/components/clients/ClientMeasurementDestinationEditor.vue` (type at line 14, `capabilityDefinitions` lines 47-59, `platform` ref line 71, `accounts` line 79, `<select>` line 292, labels line 321-350)

**Interfaces:**
- Consumes: `MEASUREMENT_PLATFORMS`, `MeasurementPlatform`, `PLATFORM_LABELS`, `CAPABILITY_DEFINITIONS` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Replace the local type and capability table with the shared source**

Delete the local `type Platform = 'meta' | 'google_data_manager'` (line 14) and the entire local `capabilityDefinitions` object (lines 47-59). Add:

```ts
import {
  CAPABILITY_DEFINITIONS,
  MEASUREMENT_PLATFORMS,
  PLATFORM_LABELS,
  type MeasurementPlatform
} from '~~/shared/utils/measurementPlatform'

type Platform = MeasurementPlatform
const capabilityDefinitions = CAPABILITY_DEFINITIONS
```

Keeping the local aliases means the rest of the component compiles unchanged.

- [ ] **Step 2: Widen the accounts record**

Change line 79 from `accounts = ref<Record<Platform, ConnectedAccount[]>>({ meta: [], google_data_manager: [] })` to:

```ts
const accounts = ref<Record<Platform, ConnectedAccount[]>>({
  meta: [],
  google_data_manager: [],
  ga4: []
})
```

- [ ] **Step 3: Replace the raw select with USelect**

The project's UI rules forbid raw `<select>`. Replace the element at line 292 with:

```vue
        <USelect
          v-model="platform"
          :items="platformOptions"
          value-key="value"
          class="w-full"
        />
```

and add to the script:

```ts
const platformOptions = MEASUREMENT_PLATFORMS.map(value => ({
  value,
  label: PLATFORM_LABELS[value]
}))
```

- [ ] **Step 4: Handle GA4 in the platform-conditional labels**

The field label at line 321 is a binary ternary (`platform === 'meta' ? 'Dataset ID' : 'Conversion Action ID'`). Replace with a lookup so GA4 reads correctly:

```ts
const externalDestinationLabel = computed(() => ({
  meta: 'Dataset ID',
  google_data_manager: 'Conversion Action ID',
  ga4: 'Measurement ID'
}[platform.value]))
```

and use `{{ externalDestinationLabel }}` in the template. Audit every remaining `platform === 'meta'` / `platform === 'google_data_manager'` comparison in this file and confirm each still behaves correctly when `platform` is `'ga4'` — several are `v-if`/`v-else-if` chains where GA4 must fall through to a sensible default rather than silently rendering Google's branch. The Google-specific conversion-action lookup (lines 346-350) must not render for GA4.

- [ ] **Step 5: Verify the component compiles**

Run: `pnpm vitest run test/components/`
Expected: no new failures versus baseline.

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -i "ClientMeasurementDestinationEditor" || echo "no new errors in this file"`
Expected: no errors referencing this file. The repo has ~60 pre-existing type errors elsewhere; ignore those. A silent OOM reads as a false pass, so confirm the command actually produced output.

- [ ] **Step 6: Commit**

```bash
git add app/components/clients/ClientMeasurementDestinationEditor.vue
git commit -m "feat(measurement): GA4 destination support in the editor"
```

---

### Task 8: GA4 and validation feedback in the provider test UI

**Files:**
- Modify: `app/components/clients/ClientMeasurementProviderTest.vue` (platform branches at lines 56, 86, 113, 196, 213-230, 258-261, 295, 441, 490)

**Interfaces:**
- Consumes: the `validation` key on the provider-test response (Task 5); the GA4 test mode (Task 4).
- Produces: no new exports.

- [ ] **Step 1: Add the GA4 request branch**

At the request-construction site (lines 196-230), the current code branches `isMeta` / else-Google. Add a GA4 branch that sends:

```ts
        if (props.destination.platform === 'ga4') {
          return {
            mode: 'ga4_debug_validation',
            expectedConfigVersion: props.destination.configVersion,
            canonicalEventName: selectedEvent.value,
            occurredAt: new Date().toISOString(),
            idempotencyKey: crypto.randomUUID(),
            reason: reason.value,
            confirmed: true,
            gaClientId: gaClientId.value
          }
        }
```

Add a `gaClientId` ref and a `UFormField`-wrapped `UInput` for it, shown only when `destination.platform === 'ga4'`, with help text explaining it is the `_ga` cookie value (format `123456789.1234567890`) and that a test has no real visitor so any well-formed value works.

- [ ] **Step 2: Replace binary platform labels**

Lines 258, 261 and 490 use `destination.platform === 'meta' ? ... : ...`. Replace each with a three-way lookup so GA4 does not silently display Google's copy:

```ts
const testModeLabel = computed(() => ({
  meta: 'Meta Test Events',
  google_data_manager: 'Google validate-only',
  ga4: 'GA4 debug validation'
}[props.destination.platform]))

const submitLabel = computed(() => ({
  meta: 'Send Meta test event',
  google_data_manager: 'Validate Google request',
  ga4: 'Validate GA4 event'
}[props.destination.platform]))
```

Audit lines 56, 86, 113, 295 and 441 — each is a Meta-specific guard. Confirm GA4 takes the non-Meta path and that the Meta-only capability warning at line 441 does not render for GA4.

- [ ] **Step 3: Surface the validation outcome**

After a successful run, the response now carries `validation`. Show it, because a silently-unrecorded validation is exactly the failure this work exists to fix:

- `validation.recorded === true` → a success `UAlert` reading "Destination health updated to `<healthStatus>`".
- `validation.recorded === false` with `skippedReason === 'version_conflict'` → a warning `UAlert`: the configuration changed during the test, so health was not updated; reload and re-run.
- `validation.recorded === false` with `skippedReason === 'already_run'` → an info `UAlert`: this run was a replay of an earlier test, so health was not re-recorded.
- `validation.recorded === false` with `skippedReason === 'record_failed'` → an error `UAlert` telling the operator health could not be updated and to retry.

Use semantic colours only, so the alerts work in dark mode.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run test/components/`
Expected: no new failures versus baseline.

- [ ] **Step 5: Commit**

```bash
git add app/components/clients/ClientMeasurementProviderTest.vue
git commit -m "feat(measurement): GA4 test mode and validation feedback in the test UI"
```

---

### Task 9: Attestation control and readiness breakdown in the panel

The last piece an operator needs: attesting tag capabilities, and seeing why a destination is not yet ready.

**Files:**
- Modify: `app/components/clients/ClientMeasurementPanel.vue`

**Interfaces:**
- Consumes: the attest route (Task 6); `isAttestationOnly`, `CAPABILITY_DEFINITIONS` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Show per-capability readiness**

For the selected destination, render each capability with its `status`, its label from `CAPABILITY_DEFINITIONS`, and how it is satisfied — "verified by provider test" when `isAttestationOnly(mode) === false`, "requires operator attestation" otherwise.

This directly addresses the design's stated requirement that the operator must not have to guess why a destination is still amber. A Meta destination needs one test plus one `meta_pixel` attestation, and that should be legible from this panel.

- [ ] **Step 2: Add the attestation modal**

For each attestation-only capability that is not yet `ready`, render a `UButton` opening a `UModal` containing:

- a `USelect` for status (`ready` / `degraded` / `blocked`)
- a `UTextarea` for the blocking reason, shown only when status is not `ready`, `:rows="5"`
- a `UTextarea` for the required attestation reason
- a `UCheckbox` for the explicit confirmation
- a warning `UAlert`, shown only when the destination is live and status is `blocked`, explaining that this will stop delivery and requires the force option

Every field wrapped in `UFormField` with a `label` prop. No raw HTML form elements, no `confirm()`.

On submit, `$fetch` the attest route:

```ts
await $fetch(`/api/agency/measurement/clients/${clientId}/destinations/${destinationId}/attest`, {
  method: 'POST',
  body: {
    expectedConfigVersion: destination.configVersion,
    capabilities: [{ mode, status, blockingReason }],
    reason,
    confirmed: true,
    force
  }
})
```

Show a `useToast()` success or error, then refresh the destination.

- [ ] **Step 3: Verify**

Run: `pnpm vitest run test/components/`
Expected: no new failures versus baseline.

- [ ] **Step 4: Full-suite verification**

Run: `pnpm vitest run`
Expected: exactly 20 failed files / 39 failed tests — the documented baseline. Investigate any additional failure before proceeding.

- [ ] **Step 5: Commit**

```bash
git add app/components/clients/ClientMeasurementPanel.vue
git commit -m "feat(measurement): capability attestation and readiness breakdown"
```

---

## Manual verification

Automated tests cannot prove the end-to-end chain opens, because the decisive behaviour spans the database, the activation gate, and the outbox. After Task 9, verify by hand:

1. Create a destination through the editor for each platform, including GA4. Confirm it is created with `enabled = false`, `environment = 'test'`, and `health_status` of `configured` or `not_configured`.
2. Run a provider test. Confirm the response reports `validation.recorded: true`, and that `conversion_destination_capabilities` rows for the covered modes are now `ready`.
3. Attest the tag capabilities. Confirm the destination's `health_status` becomes `ready`.
4. Call the activation readiness endpoint and confirm `destination_not_ready` is no longer among the blockers.
5. Read the `measurement_config_audit` rows and confirm the test-driven row has `actor_type = 'system'` with the directly-exercised/inferred note in `reason`, and the attestation row has `actor_type = 'user'`.

Use a scratch client, not one of the three destinations already live in production.

## Out of scope

- Database migrations — none are needed.
- Backfilling or re-validating the three live production destinations; they are already `ready`.
- A re-validation cron. Note that provider tests require a dormant profile, so a live destination cannot be re-tested without leaving live mode, and attested evidence never expires — a live destination's health is effectively frozen at activation. This is pre-existing behaviour and the strongest candidate for follow-up work.
- Migrating platform-enum duplication at sites this plan does not touch: `destinationRepository.ts`, `healthRepository.ts`, and the Worker's `repository.ts`.
