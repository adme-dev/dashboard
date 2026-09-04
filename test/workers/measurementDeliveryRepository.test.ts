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
    tracking_ttclid: null,
    tracking_ttp: null
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
      deliveryConfigCurrent: true,
      attribution: expect.objectContaining({ metaLeadId: '1234567890123456' })
    })
    expect(result?.credentialRef).toBe('MEASUREMENT_PROVIDER_META_BIG_GARAGE')
    expect(client.query.mock.calls[0]?.[0]).toContain('dest.credential_ref')
    expect(client.query.mock.calls[0]?.[0]).not.toContain('sc.access_token')
    expect(result?.metaDeliveryMode).toBe('crm')
    expect(client.query.mock.calls[0]?.[1]).toEqual([CLIENT_ID, EVENT_ID, NOW.toISOString()])
    expect(client.query.mock.calls[0]?.[0]).toMatch(/d.status = 'claimed'[\s\S]*INTERVAL '5 minutes'/)
    expect(client.query.mock.calls[0]?.[0]).toMatch(/tracking_events/)
    expect(client.query.mock.calls[0]?.[0]).toMatch(/conversion_destination_capabilities/)
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      DELIVERY_ID,
      'measurement-worker:test',
      NOW.toISOString()
    ])
  })

  it('does not truncate overlong Meta lead IDs into deliverable identifiers', async () => {
    const row = { ...deliveryRow(), attribution: { metaLeadId: '12345678901234567' } }
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

    expect(claim?.attribution.metaLeadId).toBeNull()
  })

  it('keeps a valid Meta lead-ad event on CRM delivery when web context also exists', async () => {
    const row = {
      ...deliveryRow(),
      attribution: { browserEventId: 'browser-event-1', metaLeadId: '1234567890123456' },
      capability_modes: ['meta_crm_capi', 'meta_conversion_leads', 'meta_web_capi'],
      tracking_fbc: 'fb.1.123.click',
      tracking_page_url: 'https://www.biggaragesubaru.com.au/enquire'
    }
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

    expect(claim).toMatchObject({
      metaDeliveryMode: 'crm',
      attribution: { metaLeadId: '1234567890123456' }
    })
  })

  it('claims a browser-paired lead through ready Meta Web CAPI with tracking context joined by event ID', async () => {
    const row = {
      ...deliveryRow(),
      event_name: 'lead_created',
      provider_event_name: 'Lead',
      attribution: { browserEventId: 'browser-event-1' },
      capability_modes: ['meta_web_capi'],
      tracking_fbc: 'fb.1.123.click',
      tracking_fbp: 'fb.1.123.browser',
      tracking_page_url: 'https://www.biggaragesubaru.com.au/enquire?secret=removed',
      tracking_ua: 'Pilot Browser',
      tracking_gclid: 'gclid-from-browser'
    }
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

    expect(claim).toMatchObject({
      metaDeliveryMode: 'web',
      attribution: {
        browserEventId: 'browser-event-1',
        fbc: 'fb.1.123.click',
        fbp: 'fb.1.123.browser',
        eventSourceUrl: 'https://www.biggaragesubaru.com.au/enquire',
        clientUserAgent: 'Pilot Browser',
        gclid: 'gclid-from-browser'
      }
    })
  })

  it('projects TikTok browser identity and its purpose-scoped destination into the claim', async () => {
    const row = {
      ...deliveryRow(),
      platform: 'tiktok',
      provider_event_name: 'SubmitForm',
      external_destination_id: 'C1234567890',
      credential_ref: 'MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE',
      account_id: null,
      attribution: {
        browserEventId: 'browser-event-1',
        ttclid: 'click-1',
        eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire?email=removed'
      },
      capability_modes: ['tiktok_events_api'],
      tracking_ttp: 'browser-1',
      tracking_page_url: 'https://www.werribeetoyota.com.au/enquire?email=also-removed',
      tracking_ua: 'Test Browser'
    }
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

    expect(claim).toMatchObject({
      platform: 'tiktok',
      externalDestinationId: 'C1234567890',
      credentialRef: 'MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE',
      attribution: {
        browserEventId: 'browser-event-1',
        ttclid: 'click-1',
        ttp: 'browser-1',
        eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire',
        clientUserAgent: 'Test Browser'
      }
    })
    expect(client.query.mock.calls[0]?.[0]).toMatch(/te\.ttclid, te\.ttp/)
    expect(client.query.mock.calls[0]?.[0]).toMatch(/browser\.ttclid AS tracking_ttclid/)
    expect(client.query.mock.calls[0]?.[0]).toMatch(/browser\.ttp AS tracking_ttp/)
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

  it('marks an accepted TikTok delivery ready without scheduling Google diagnostics', async () => {
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
      platform: 'tiktok'
    } as never

    await repository.complete(claimed, {
      outcome: 'accepted',
      providerRequestId: 'tiktok-request-1',
      errorClass: null,
      redactedDiagnostic: null
    }, NOW)

    expect(statements[1]?.params).toEqual(expect.arrayContaining(['not_required']))
    expect(statements[2]?.params).toEqual(expect.arrayContaining([
      claimed.destinationId,
      'ready',
      true,
      false
    ]))
  })
})
