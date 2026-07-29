import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  queryRows: vi.fn(),
  transaction: vi.fn(),
  emit: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  execute: mocks.execute,
  queryRows: mocks.queryRows,
  transaction: mocks.transaction
}))
vi.mock('~~/server/utils/leads/emailRecovery', () => ({
  cleanupTerminalEmailEvidenceWithDefaultRepository: vi.fn(),
  resolveEmailRecoveryRuntime: vi.fn()
}))
vi.mock('~~/shared/leads/email/telemetry', () => ({
  emitEmailIngestionEvent: mocks.emit
}))

const { processEmailIngestionHealthAlerts } = await import(
  '../../../../server/utils/leads/emailHealth'
)

const runtimeConfig = {
  notificationAllowlist: null,
  unknownRecipientThreshold: null,
  signatureFailureThreshold: null,
  r2FailureThreshold: null,
  aiRejectionThreshold: null
}

function endpointRow(index: number) {
  return {
    endpoint_id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    client_id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    consecutive_failures: 0,
    expected_max_silence_hours: null,
    first_response_sla_minutes: null,
    created_at: '2026-07-30T00:00:00.000Z',
    last_received_at: null,
    last_accepted_at: null,
    messages_15m: 0,
    failures_15m: 0,
    unassigned_accepted: 0,
    beyond_first_response_sla: 0,
    assignment_expected: false,
    signature_failures: 0,
    r2_failures: 0,
    ai_schema_rejections: 0
  }
}

describe('email health scan state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue(1)
    mocks.transaction.mockImplementation(async callback => callback({
      query: vi.fn(async () => ({ rows: [] }))
    }))
  })

  it('persists a partial scan and emits bounded endpoint diagnostics while continuing', async () => {
    mocks.queryRows
      .mockResolvedValueOnce([endpointRow(1), endpointRow(2)])
      .mockResolvedValueOnce([])
    mocks.transaction
      .mockRejectedValueOnce(new Error('notification provider included customer content'))
      .mockImplementation(async callback => callback({
        query: vi.fn(async () => ({ rows: [] }))
      }))

    await expect(processEmailIngestionHealthAlerts(
      { context: {} } as never,
      runtimeConfig
    )).resolves.toEqual({
      status: 'partial',
      endpoints: 2,
      failedEndpoints: 1,
      active: 0,
      notified: 0
    })

    expect(mocks.emit).toHaveBeenCalledWith({
      event: 'email_ingestion_failure',
      endpointId: endpointRow(1).endpoint_id,
      clientId: endpointRow(1).client_id,
      status: 'failed',
      errorClass: 'email_health_endpoint_failed'
    })
    expect(JSON.stringify(mocks.emit.mock.calls)).not.toContain('customer content')
    expect(mocks.execute.mock.calls[0]?.[1]).toContain('running')
    expect(mocks.execute.mock.calls.at(-1)?.[1]).toContain('partial')
    expect(mocks.execute.mock.calls.at(-1)?.[1]).toContain('email_health_endpoint_failed')
    const scanToken = mocks.execute.mock.calls[0]?.[1]?.at(-1)
    expect(scanToken).toMatch(/^[0-9a-f-]{36}$/)
    expect(mocks.execute.mock.calls.at(-1)?.[1]?.at(-1)).toBe(scanToken)
    expect(mocks.execute.mock.calls.at(-1)?.[0]).toMatch(/run_token = \$7::uuid/)
  })

  it('persists and rethrows a whole global alert-scan failure', async () => {
    mocks.queryRows
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('global alert query unavailable'))

    await expect(processEmailIngestionHealthAlerts(
      { context: {} } as never,
      runtimeConfig
    )).rejects.toThrow('global alert query unavailable')

    expect(mocks.emit).toHaveBeenCalledWith({
      event: 'email_ingestion_failure',
      status: 'failed',
      errorClass: 'email_health_global_failed'
    })
    expect(mocks.execute.mock.calls[0]?.[1]).toContain('running')
    expect(mocks.execute.mock.calls.at(-1)?.[1]).toContain('failed')
    expect(mocks.execute.mock.calls.at(-1)?.[1]).toContain('email_health_global_failed')
    expect(mocks.execute.mock.calls.at(-1)?.[1]?.at(-1))
      .toBe(mocks.execute.mock.calls[0]?.[1]?.at(-1))
  })
})
