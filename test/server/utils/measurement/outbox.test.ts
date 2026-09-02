import { describe, expect, it, vi } from 'vitest'
import {
  appendCanonicalConversionEvent,
  buildCanonicalEventIdempotencyKey
} from '../../../../server/utils/measurement/outbox'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const DESTINATION_ID = '44444444-4444-4444-8444-444444444444'
const EVENT_ID = '55555555-5555-4555-8555-555555555555'

function input() {
  return {
    clientId: CLIENT_ID,
    eventName: 'lead_qualified' as const,
    sourceSystem: 'zero_crm' as const,
    sourceEntityType: 'crm_opportunity' as const,
    sourceEntityId: OPPORTUNITY_ID,
    sourceEventId: 'stage-history:66666666-6666-4666-8666-666666666666',
    occurredAt: '2026-07-17T03:30:00.000Z',
    consentDecision: 'granted' as const,
    attribution: {
      browserEventId: 'browser-event-123',
      metaLeadId: '123456789012345',
      gclid: null,
      gbraid: null,
      wbraid: null
    }
  }
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    client_id: CLIENT_ID,
    enabled: true,
    environment: 'live',
    consent_mode: 'consent_gated',
    config_version: 4,
    cache_status: 'fresh',
    cache_version: 4,
    ...overrides
  }
}

describe('canonical conversion outbox', () => {
  it('derives a compact deterministic key from the tenant and complete source transition identity', async () => {
    const first = await buildCanonicalEventIdempotencyKey(input())
    const retry = await buildCanonicalEventIdempotencyKey(input())
    const laterStage = await buildCanonicalEventIdempotencyKey({
      ...input(),
      sourceEventId: 'stage-history:77777777-7777-4777-8777-777777777777'
    })

    expect(first).toMatch(/^v1:[a-f0-9]{64}$/)
    expect(retry).toBe(first)
    expect(laterStage).not.toBe(first)
  })

  it('appends one pending event and one delivery per live mapped destination on the supplied transaction', async () => {
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
      event: {
        eventId: EVENT_ID,
        configVersion: 4,
        outboxStatus: 'pending'
      },
      deliveryCount: 1
    })
    expect(statements.map(statement => statement.sql)).toEqual([
      expect.stringMatching(/client_measurement_profiles[\s\S]*FOR SHARE/),
      expect.stringMatching(/conversion_destinations/),
      expect.stringMatching(/INSERT INTO conversion_events/),
      expect.stringMatching(/INSERT INTO conversion_deliveries/)
    ])
    expect(statements[1]?.sql).not.toMatch(/[dm]\.config_version =/)
    expect(JSON.stringify(statements)).not.toContain('customer@example.com')
  })

  it('records a policy skip without deliveries when consent is required but not granted', async () => {
    const statements: string[] = []
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql)
        if (/FROM client_measurement_profiles/.test(sql)) return { rows: [profile()] }
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
            outbox_status: 'policy_skipped',
            last_error_class: 'consent_not_granted'
          }] }
        }
        return { rows: [] }
      })
    }

    const result = await appendCanonicalConversionEvent(db, {
      ...input(),
      consentDecision: 'unknown'
    })

    expect(result).toMatchObject({
      status: 'created',
      event: { outboxStatus: 'policy_skipped', policyReason: 'consent_not_granted' },
      deliveryCount: 0
    })
    expect(statements.some(sql => /INSERT INTO conversion_deliveries/.test(sql))).toBe(false)
  })

  it('returns the existing canonical event for a retried source transition', async () => {
    const existing = {
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
      outbox_status: 'pending',
      last_error_class: null
    }
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM client_measurement_profiles/.test(sql)) return { rows: [profile()] }
        if (/FROM conversion_destinations/.test(sql)) return { rows: [{ id: DESTINATION_ID }] }
        if (/INSERT INTO conversion_events/.test(sql)) return { rows: [] }
        if (/FROM conversion_events/.test(sql)) return { rows: [existing] }
        if (/COUNT\(\*\).*conversion_deliveries/s.test(sql)) return { rows: [{ count: '1' }] }
        return { rows: [] }
      })
    }

    const result = await appendCanonicalConversionEvent(db, input())

    expect(result).toMatchObject({ status: 'duplicate', deliveryCount: 1 })
    expect(db.query).toHaveBeenCalledWith(expect.stringMatching(/source_system = \$3/), expect.any(Array))
  })

  it('fails closed when the tenant has no canonical measurement profile', async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) }

    await expect(appendCanonicalConversionEvent(db, input())).resolves.toEqual({
      status: 'profile_not_found'
    })
    expect(db.query).toHaveBeenCalledOnce()
  })

  it('persists a supplied conversion value with the derived AUD currency', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/FROM client_measurement_profiles/.test(sql)) return { rows: [profile()] }
        if (/FROM conversion_destinations/.test(sql)) return { rows: [{ id: DESTINATION_ID }] }
        if (/INSERT INTO conversion_events/.test(sql)) {
          return { rows: [{
            id: EVENT_ID, client_id: CLIENT_ID, profile_id: PROFILE_ID,
            event_name: 'lead_won', enquiry_type: null, source_system: 'zero_crm',
            source_entity_type: 'crm_opportunity', source_entity_id: OPPORTUNITY_ID,
            source_event_id: input().sourceEventId, occurred_at: new Date(input().occurredAt),
            idempotency_key: 'v1:test', config_version: 4, consent_mode: 'consent_gated',
            attribution: input().attribution, value: '15000.50', currency_code: 'AUD',
            outbox_status: 'pending', last_error_class: null
          }] }
        }
        return { rows: [] }
      })
    }

    const result = await appendCanonicalConversionEvent(db, { ...input(), eventName: 'lead_won', value: 15000.5 })
    expect(result).toMatchObject({ status: 'created', event: { eventId: EVENT_ID, value: 15000.5, currencyCode: 'AUD' } })
    const insertStatement = statements.find(statement => /INSERT INTO conversion_events/.test(statement.sql))
    expect(insertStatement?.params?.[13]).toBe(15000.5)
    expect(insertStatement?.params?.[14]).toBe('AUD')
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
            id: EVENT_ID, client_id: CLIENT_ID, profile_id: PROFILE_ID,
            event_name: 'lead_qualified', enquiry_type: null, source_system: 'zero_crm',
            source_entity_type: 'crm_opportunity', source_entity_id: OPPORTUNITY_ID,
            source_event_id: input().sourceEventId, occurred_at: new Date(input().occurredAt),
            idempotency_key: 'v1:test', config_version: 4, consent_mode: 'consent_gated',
            attribution: input().attribution, value: null, currency_code: null,
            outbox_status: 'pending', last_error_class: null
          }] }
        }
        return { rows: [] }
      })
    }

    const result = await appendCanonicalConversionEvent(db, input())
    expect(result).toMatchObject({ status: 'created', event: { value: null, currencyCode: null } })
    const insertStatement = statements.find(statement => /INSERT INTO conversion_events/.test(statement.sql))
    expect(insertStatement?.params?.[13]).toBeNull()
    expect(insertStatement?.params?.[14]).toBeNull()
  })

  it('selects an exact typed web-conversion mapping without aggregate fallback', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/FROM client_measurement_profiles/.test(sql)) return { rows: [profile()] }
        if (/FROM conversion_destinations/.test(sql)) return { rows: [{ id: DESTINATION_ID }] }
        if (/INSERT INTO conversion_events/.test(sql)) {
          return { rows: [{
            id: EVENT_ID, client_id: CLIENT_ID, profile_id: PROFILE_ID,
            event_name: 'web_conversion', enquiry_type: 'finance', source_system: 'zero_lead',
            source_entity_type: 'lead', source_entity_id: OPPORTUNITY_ID,
            source_event_id: 'receipt-finance-1', occurred_at: new Date(input().occurredAt),
            idempotency_key: 'v1:typed', config_version: 4, consent_mode: 'consent_gated',
            attribution: input().attribution, value: null, currency_code: null,
            outbox_status: 'pending', last_error_class: null
          }] }
        }
        return { rows: [] }
      })
    }

    const result = await appendCanonicalConversionEvent(db, {
      ...input(), eventName: 'web_conversion', enquiryType: 'finance', sourceSystem: 'zero_lead',
      sourceEntityType: 'lead', sourceEventId: 'receipt-finance-1'
    })
    expect(result).toMatchObject({ status: 'created', event: { eventName: 'web_conversion', enquiryType: 'finance' }, deliveryCount: 1 })
    expect(statements[1]?.params).toEqual([CLIENT_ID, PROFILE_ID, 'web_conversion', 'finance'])
    expect(statements[1]?.sql).toMatch(/m\.enquiry_type = \$4/)
    expect(statements[1]?.sql).not.toMatch(/NOT EXISTS/)
  })

  it('pauses an untyped browser conversion when several aggregate actions match', async () => {
    const secondDestinationId = '66666666-6666-4666-8666-666666666666'
    const statements: string[] = []
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql)
        if (/FROM client_measurement_profiles/.test(sql)) return { rows: [profile()] }
        if (/FROM conversion_destinations/.test(sql)) return { rows: [{ id: DESTINATION_ID }, { id: secondDestinationId }] }
        if (/INSERT INTO conversion_events/.test(sql)) {
          return { rows: [{
            id: EVENT_ID, client_id: CLIENT_ID, profile_id: PROFILE_ID,
            event_name: 'web_conversion', enquiry_type: null, source_system: 'browser',
            source_entity_type: 'tracking_event', source_entity_id: OPPORTUNITY_ID,
            source_event_id: 'browser-lead-1', occurred_at: new Date(input().occurredAt),
            idempotency_key: 'v1:ambiguous', config_version: 4, consent_mode: 'consent_gated',
            attribution: input().attribution, value: null, currency_code: null,
            outbox_status: 'paused', last_error_class: 'ambiguous_aggregate_web_conversion'
          }] }
        }
        return { rows: [] }
      })
    }

    const result = await appendCanonicalConversionEvent(db, {
      ...input(), eventName: 'web_conversion', sourceSystem: 'browser',
      sourceEntityType: 'tracking_event', sourceEventId: 'browser-lead-1'
    })
    expect(result).toMatchObject({
      status: 'created',
      event: { outboxStatus: 'paused', policyReason: 'ambiguous_aggregate_web_conversion' },
      deliveryCount: 0
    })
    expect(statements.some(sql => /INSERT INTO conversion_deliveries/.test(sql))).toBe(false)
  })

  it('pauses an untyped lead conversion even when several destinations are enabled', async () => {
    const statements: string[] = []
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql)
        if (/FROM client_measurement_profiles/.test(sql)) return { rows: [profile()] }
        if (/FROM conversion_destinations/.test(sql)) {
          return { rows: [{ id: DESTINATION_ID }, { id: '66666666-6666-4666-8666-666666666666' }] }
        }
        if (/INSERT INTO conversion_events/.test(sql)) {
          return { rows: [{
            id: EVENT_ID, client_id: CLIENT_ID, profile_id: PROFILE_ID,
            event_name: 'web_conversion', enquiry_type: null, source_system: 'zero_lead',
            source_entity_type: 'lead', source_entity_id: OPPORTUNITY_ID,
            source_event_id: 'legacy-untyped-lead-1', occurred_at: new Date(input().occurredAt),
            idempotency_key: 'v1:untyped', config_version: 4, consent_mode: 'consent_gated',
            attribution: input().attribution, value: null, currency_code: null,
            outbox_status: 'paused', last_error_class: 'unmapped_enquiry_type'
          }] }
        }
        return { rows: [] }
      })
    }

    const result = await appendCanonicalConversionEvent(db, {
      ...input(), eventName: 'web_conversion', sourceSystem: 'zero_lead',
      sourceEntityType: 'lead', sourceEventId: 'legacy-untyped-lead-1'
    })

    expect(result).toMatchObject({
      status: 'created',
      event: { outboxStatus: 'paused', policyReason: 'unmapped_enquiry_type' },
      deliveryCount: 0
    })
    expect(statements.some(sql => /INSERT INTO conversion_deliveries/.test(sql))).toBe(false)
  })
})
