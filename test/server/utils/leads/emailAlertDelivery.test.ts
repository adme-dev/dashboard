import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryRows: vi.fn(),
  transaction: vi.fn(),
  bulk: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  execute: vi.fn(),
  queryRows: mocks.queryRows,
  transaction: mocks.transaction
}))
vi.mock('~~/server/utils/leads/emailRecovery', () => ({
  cleanupTerminalEmailEvidenceWithDefaultRepository: vi.fn(),
  resolveEmailRecoveryRuntime: vi.fn()
}))
vi.mock('~~/server/utils/notifications', () => ({
  createBulkNotifications: mocks.bulk
}))

const { claimEmailEndpointAlerts, deliverEmailEndpointAlerts } = await import(
  '../../../../server/utils/leads/emailHealth'
)
type EmailEndpointAlertCode = import(
  '../../../../server/utils/leads/emailHealth'
).EmailEndpointAlertCode

describe('email endpoint alert delivery state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.EMAIL_INGESTION_NOTIFY_ALLOWLIST
    delete process.env.ANOMALY_NOTIFY_ALLOWLIST
  })

  it('claims once under concurrency and re-arms with a new incident after resolution', async () => {
    const firstIncident = '2026-07-29T12:00:00.000Z'
    const secondIncident = '2026-07-29T13:00:00.000Z'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ alert_code: 'consecutive_failures', first_detected_at: firstIncident }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ alert_code: 'consecutive_failures', first_detected_at: secondIncident }]
      })
    mocks.transaction.mockImplementation(async callback => callback({ query }))
    const base = {
      endpointId: '20000000-0000-4000-8000-000000000001',
      clientId: '30000000-0000-4000-8000-000000000001',
      activeCodes: ['consecutive_failures'] as EmailEndpointAlertCode[]
    }

    await expect(claimEmailEndpointAlerts({
      ...base,
      claimToken: '40000000-0000-4000-8000-000000000001'
    })).resolves.toEqual([{
      alertCode: 'consecutive_failures',
      incidentAt: firstIncident
    }])
    await expect(claimEmailEndpointAlerts({
      ...base,
      claimToken: '40000000-0000-4000-8000-000000000002'
    })).resolves.toEqual([])
    await expect(claimEmailEndpointAlerts({
      ...base,
      activeCodes: [],
      claimToken: '40000000-0000-4000-8000-000000000003'
    })).resolves.toEqual([])
    await expect(claimEmailEndpointAlerts({
      ...base,
      claimToken: '40000000-0000-4000-8000-000000000004'
    })).resolves.toEqual([{
      alertCode: 'consecutive_failures',
      incidentAt: secondIncident
    }])
  })

  it('retries only recipients still pending after partial notification success', async () => {
    const incidentAt = '2026-07-29T12:00:00.000Z'
    mocks.transaction.mockImplementation(async callback => callback({
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ alert_code: 'failure_rate', first_detected_at: incidentAt }]
        })
    }))
    mocks.queryRows
      .mockResolvedValueOnce([
        { id: '10000000-0000-4000-8000-000000000001', email: 'one@example.test' },
        { id: '10000000-0000-4000-8000-000000000002', email: 'two@example.test' }
      ])
      .mockResolvedValueOnce([
        { id: '10000000-0000-4000-8000-000000000001' },
        { id: '10000000-0000-4000-8000-000000000002' }
      ])
      .mockResolvedValueOnce([{ alert_code: 'failure_rate' }])
      .mockResolvedValueOnce([
        { id: '10000000-0000-4000-8000-000000000001', email: 'one@example.test' },
        { id: '10000000-0000-4000-8000-000000000002', email: 'two@example.test' }
      ])
      .mockResolvedValueOnce([
        { id: '10000000-0000-4000-8000-000000000002' }
      ])
      .mockResolvedValueOnce([{ alert_code: 'failure_rate' }])
    mocks.bulk
      .mockResolvedValueOnce({ successful: 1, failed: 1 })
      .mockResolvedValueOnce({ successful: 1, failed: 0 })

    const input = {
      endpointId: '20000000-0000-4000-8000-000000000001',
      clientId: '30000000-0000-4000-8000-000000000001',
      activeCodes: ['failure_rate'] as EmailEndpointAlertCode[],
      claimToken: '40000000-0000-4000-8000-000000000001'
    }
    await deliverEmailEndpointAlerts(input)
    await deliverEmailEndpointAlerts({
      ...input,
      claimToken: '40000000-0000-4000-8000-000000000002'
    })

    expect(mocks.bulk.mock.calls[0]?.[0]).toEqual([
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002'
    ])
    expect(mocks.bulk.mock.calls[1]?.[0]).toEqual([
      '10000000-0000-4000-8000-000000000002'
    ])
  })
})
