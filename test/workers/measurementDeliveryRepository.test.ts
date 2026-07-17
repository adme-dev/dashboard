import { describe, expect, it, vi } from 'vitest'
import { createMeasurementDeliveryRepository } from '../../workers/measurement-delivery/src/repository'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const EVENT_ID = '22222222-2222-4222-8222-222222222222'
const DELIVERY_ID = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-07-17T06:05:00.000Z')

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
    account_id: '9876543210',
    access_token: 'meta-token',
    refresh_token: null,
    scopes: ['ads_management'],
    metadata: {},
    attribution: { metaLeadId: '123456789012345' }
  }
}

describe('measurement delivery repository', () => {
  it('tenant-scopes and row-locks one due delivery before incrementing its attempt', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/SELECT[\s\S]*FOR UPDATE OF d SKIP LOCKED/.test(sql)) return { rows: [deliveryRow()] }
        if (/UPDATE conversion_deliveries[\s\S]*attempt_count = attempt_count \+ 1/.test(sql)) {
          return { rows: [{ attempt_count: 1 }] }
        }
        return { rows: [] }
      })
    }
    const transaction = vi.fn(async (callback: (db: typeof client) => Promise<unknown>) => callback(client))
    const repository = createMeasurementDeliveryRepository({ transaction: transaction as never })

    const result = await repository.claimNext({
      schemaVersion: 1,
      clientId: CLIENT_ID,
      eventId: EVENT_ID,
      enqueuedAt: NOW.toISOString()
    }, 'measurement-worker:test', NOW)

    expect(result).toMatchObject({
      deliveryId: DELIVERY_ID,
      attemptNumber: 1,
      operatingAccountId: '9876543210',
      loginAccountId: '9876543210',
      profileCacheCurrent: true,
      deliveryConfigCurrent: true
    })
    expect(client.query.mock.calls[0]?.[1]).toEqual([CLIENT_ID, EVENT_ID, NOW.toISOString()])
    expect(client.query.mock.calls[0]?.[0]).toMatch(/d.status = 'claimed'[\s\S]*INTERVAL '5 minutes'/)
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      DELIVERY_ID,
      'measurement-worker:test',
      NOW.toISOString()
    ])
  })

  it('atomically appends an accepted attempt and updates delivery and destination health', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        return { rows: [] }
      })
    }
    const repository = createMeasurementDeliveryRepository({
      transaction: (async (callback: (db: typeof client) => Promise<unknown>) => callback(client)) as never
    })
    const claimed = {
      ...deliveryRow(),
      clientId: CLIENT_ID,
      deliveryId: DELIVERY_ID,
      destinationId: deliveryRow().destination_id,
      attemptNumber: 1
    } as never

    await repository.complete(claimed, {
      outcome: 'accepted',
      providerRequestId: 'meta-request-1',
      errorClass: null,
      redactedDiagnostic: null
    }, NOW)

    expect(statements.map(item => item.sql)).toEqual([
      expect.stringMatching(/INSERT INTO conversion_delivery_attempts/),
      expect.stringMatching(/UPDATE conversion_deliveries[\s\S]*status = \$2/),
      expect.stringMatching(/UPDATE conversion_destinations/)
    ])
    expect(statements[0]?.params).toEqual([
      CLIENT_ID,
      DELIVERY_ID,
      1,
      'accepted',
      'meta-request-1',
      null,
      null,
      NOW.toISOString()
    ])
    expect(statements[1]?.params).toEqual([
      DELIVERY_ID,
      'accepted',
      null,
      NOW.toISOString(),
      'meta-request-1',
      null,
      null,
      'not_required',
      null
    ])
  })

  it('schedules Google diagnostics without marking provider processing delivered', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        return { rows: [] }
      })
    }
    const repository = createMeasurementDeliveryRepository({
      transaction: (async (callback: (db: typeof client) => Promise<unknown>) => callback(client)) as never
    })
    const claimed = {
      ...deliveryRow(),
      clientId: CLIENT_ID,
      deliveryId: DELIVERY_ID,
      destinationId: deliveryRow().destination_id,
      attemptNumber: 1,
      platform: 'google_data_manager'
    } as never

    await repository.complete(claimed, {
      outcome: 'accepted',
      providerRequestId: 'google-request-1',
      errorClass: null,
      redactedDiagnostic: null
    }, NOW)

    expect(statements[1]?.sql).toMatch(/diagnostic_status = \$8/)
    expect(statements[1]?.params).toEqual([
      DELIVERY_ID,
      'accepted',
      null,
      NOW.toISOString(),
      'google-request-1',
      null,
      null,
      'pending',
      '2026-07-17T06:35:00.000Z'
    ])
    expect(statements[2]?.params).toEqual(expect.arrayContaining([
      claimed.destinationId,
      'validating',
      false,
      false
    ]))
  })
})
