import { describe, expect, it, vi } from 'vitest'
import { createMeasurementEventLineageService } from '~~/server/utils/measurement/eventLineage'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const EVENT_ID = '22222222-2222-4222-8222-222222222222'
const DELIVERY_ID = '33333333-3333-4333-8333-333333333333'
const DESTINATION_ID = '44444444-4444-4444-8444-444444444444'

function row(overrides: Record<string, unknown> = {}) {
  return {
    event_id: EVENT_ID,
    event_name: 'web_conversion',
    occurred_at: '2026-09-04T01:02:03.000Z',
    recorded_at: '2026-09-04T01:02:04.000Z',
    consent_decision: 'granted',
    mapping_version: 7,
    lineage_id: DELIVERY_ID,
    delivery_id: DELIVERY_ID,
    destination_id: DESTINATION_ID,
    platform: 'tiktok',
    outcome: 'accepted',
    outcome_at: '2026-09-04T01:02:05.000Z',
    provider_request_id: 'tiktok-request-1',
    redacted_reason: 'Rejected jane@example.com using Bearer super-secret +61412345678 at https://provider.test/path?token=secret',
    ...overrides
  }
}

describe('measurement event lineage', () => {
  it('returns a bounded redacted page and never selects sensitive source columns', async () => {
    const queryRows = vi.fn(async () => [
      row(),
      row({
        event_id: '55555555-5555-4555-8555-555555555555',
        lineage_id: '66666666-6666-4666-8666-666666666666',
        delivery_id: '66666666-6666-4666-8666-666666666666'
      })
    ])
    const service = createMeasurementEventLineageService({
      queryRows: queryRows as never,
      now: () => new Date('2026-09-04T12:00:00.000Z')
    })

    const result = await service.list(CLIENT_ID, {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-04T12:00:00.000Z',
      state: 'accepted',
      eventName: 'web_conversion',
      platform: 'tiktok',
      limit: '1'
    })

    expect(result.items).toEqual([{
      eventId: EVENT_ID,
      eventName: 'web_conversion',
      occurredAt: '2026-09-04T01:02:03.000Z',
      recordedAt: '2026-09-04T01:02:04.000Z',
      consentState: 'granted',
      mappingVersion: 7,
      destination: { id: DESTINATION_ID, platform: 'tiktok' },
      outcome: 'accepted',
      outcomeAt: '2026-09-04T01:02:05.000Z',
      receiptId: 'tiktok-request-1',
      redactedReason: 'Rejected [redacted-email] using [redacted-secret] [redacted-phone] at https://provider.test/path'
    }])
    expect(result.nextCursor).toEqual(expect.any(String))

    const [sql, params] = queryRows.mock.calls[0]!
    expect(sql).toContain('ce.client_id = $1')
    expect(sql).toContain('ce.occurred_at >=')
    expect(sql).toContain('COALESCE(cd.status, ce.outbox_status)')
    expect(sql).toContain('d.platform =')
    expect(sql).not.toMatch(/\battribution\b|credential_ref|external_destination_id/i)
    expect(params[0]).toBe(CLIENT_ID)
    expect(params.at(-1)).toBe(2)
    expect(JSON.stringify(result)).not.toMatch(/jane@example|super-secret|61412345678|token=secret/i)
  })

  it('uses an opaque cursor as a stable three-part keyset boundary', async () => {
    const firstQuery = vi.fn(async () => [row(), row({
      event_id: '55555555-5555-4555-8555-555555555555',
      lineage_id: '66666666-6666-4666-8666-666666666666',
      delivery_id: '66666666-6666-4666-8666-666666666666'
    })])
    const firstService = createMeasurementEventLineageService({
      queryRows: firstQuery as never,
      now: () => new Date('2026-09-04T12:00:00.000Z')
    })
    const first = await firstService.list(CLIENT_ID, { limit: 1 })

    const nextQuery = vi.fn(async () => [])
    const nextService = createMeasurementEventLineageService({
      queryRows: nextQuery as never,
      now: () => new Date('2026-09-04T12:00:00.000Z')
    })
    await nextService.list(CLIENT_ID, { cursor: first.nextCursor, limit: 1 })

    const [sql, params] = nextQuery.mock.calls[0]!
    expect(sql).toContain('(ce.occurred_at, ce.id, COALESCE(cd.id, ce.id)) <')
    expect(params).toContain(EVENT_ID)
    expect(params).toContain(DELIVERY_ID)
  })

  it('rejects invalid client, cursor, filters, and over-wide date ranges before querying', async () => {
    const queryRows = vi.fn()
    const service = createMeasurementEventLineageService({
      queryRows: queryRows as never,
      now: () => new Date('2026-09-04T12:00:00.000Z')
    })

    for (const [clientId, filters] of [
      ['not-a-client', {}],
      [CLIENT_ID, { cursor: 'not-a-cursor' }],
      [CLIENT_ID, { platform: 'facebook' }],
      [CLIENT_ID, { from: '2026-01-01T00:00:00.000Z', to: '2026-09-04T00:00:00.000Z' }],
      [CLIENT_ID, { unexpected: 'value' }]
    ] as const) {
      await expect(service.list(clientId, filters)).rejects.toMatchObject({
        code: 'MEASUREMENT_VALIDATION_ERROR',
        statusCode: 422
      })
    }
    expect(queryRows).not.toHaveBeenCalled()
  })
})
