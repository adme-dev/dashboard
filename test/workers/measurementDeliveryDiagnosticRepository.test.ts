import { describe, expect, it, vi } from 'vitest'

import { createMeasurementDiagnosticRepository } from '../../workers/measurement-delivery/src/diagnosticRepository'

describe('measurement delivery diagnostic repository', () => {
  it('tenant-scopes and leases one due accepted Google request', async () => {
    const query = vi.fn(async (sql: string) => {
      if (/SELECT d\.id AS delivery_id/.test(sql)) {
        return { rows: [{
          delivery_id: 'delivery-1',
          client_id: 'client-1',
          destination_id: 'destination-1',
          provider_request_id: 'request-1',
          diagnostic_started_at: '2026-07-17T00:00:00.000Z',
          diagnostic_check_count: 0,
          refresh_token: 'refresh-secret',
          scopes: ['https://www.googleapis.com/auth/datamanager']
        }] }
      }
      if (/UPDATE conversion_deliveries[\s\S]*diagnostic_check_count = diagnostic_check_count \+ 1/.test(sql)) {
        return { rows: [{ diagnostic_check_count: 1 }] }
      }
      return { rows: [] }
    })
    const repository = createMeasurementDiagnosticRepository({
      transaction: async callback => callback({ query })
    })

    await expect(repository.claimNext('diagnostic-worker', new Date('2026-07-17T01:00:00.000Z')))
      .resolves.toMatchObject({
        clientId: 'client-1',
        deliveryId: 'delivery-1',
        requestId: 'request-1',
        checkNumber: 1
      })
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/dest\.platform = 'google_data_manager'[\s\S]*d\.status = 'accepted'[\s\S]*FOR UPDATE OF d SKIP LOCKED/),
      ['2026-07-17T01:00:00.000Z']
    )
  })

  it('atomically records terminal success and marks warning-bearing health degraded', async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: /UPDATE conversion_deliveries/.test(sql) ? [{ id: 'delivery-1' }] : []
    }))
    const repository = createMeasurementDiagnosticRepository({
      transaction: async callback => callback({ query })
    })

    await repository.complete({
      clientId: 'client-1',
      deliveryId: 'delivery-1',
      destinationId: 'destination-1',
      requestId: 'request-1',
      startedAt: '2026-07-17T00:00:00.000Z',
      checkNumber: 2,
      workerId: 'diagnostic-worker',
      refreshToken: 'refresh-secret',
      connectionScopes: ['https://www.googleapis.com/auth/datamanager']
    }, {
      outcome: 'success',
      warningCount: 2,
      errorCount: 0,
      errorClass: 'google_diagnostics_warning',
      redactedDiagnostic: 'Google processing completed with warnings',
      nextCheckAt: null
    }, new Date('2026-07-17T01:00:00.000Z'))

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/INSERT INTO conversion_delivery_diagnostic_checks/),
      expect.arrayContaining(['client-1', 'delivery-1', 2, 'success', 2, 0])
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/UPDATE conversion_deliveries[\s\S]*status = 'delivered'[\s\S]*diagnostic_status = \$2/),
      expect.arrayContaining(['delivery-1', 'success', 'diagnostic-worker'])
    )
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/UPDATE conversion_destinations[\s\S]*health_status = \$2/),
      expect.arrayContaining(['destination-1', 'degraded', 'client-1'])
    )
  })

  it('rejects stale completion when the diagnostic lease is no longer owned', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const repository = createMeasurementDiagnosticRepository({
      transaction: async callback => callback({ query })
    })

    await expect(repository.complete({
      clientId: 'client-1',
      deliveryId: 'delivery-1',
      destinationId: 'destination-1',
      requestId: 'request-1',
      startedAt: '2026-07-17T00:00:00.000Z',
      checkNumber: 2,
      workerId: 'stale-worker',
      refreshToken: 'refresh-secret',
      connectionScopes: ['https://www.googleapis.com/auth/datamanager']
    }, {
      outcome: 'processing',
      warningCount: 0,
      errorCount: 0,
      errorClass: null,
      redactedDiagnostic: 'Google request is still processing',
      nextCheckAt: '2026-07-17T01:39:00.000Z'
    }, new Date('2026-07-17T01:00:00.000Z'))).rejects.toThrow(
      'Measurement diagnostic lease is no longer owned'
    )
    expect(query.mock.calls[1]?.[0]).toMatch(/RETURNING id/)
  })
})
