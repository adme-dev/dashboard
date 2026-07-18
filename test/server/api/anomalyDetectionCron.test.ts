import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  resolveCronXeroAuth: vi.fn(),
  runDetectionForTenant: vi.fn()
}))

vi.mock('h3', () => ({
  defineEventHandler: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  getHeader: () => undefined,
  getQuery: (event: { query?: Record<string, string> }) => event.query ?? {},
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mocks.queryOne(...args)
}))

vi.mock('~~/server/utils/xeroCronAuth', () => ({
  resolveCronXeroAuth: (...args: unknown[]) => mocks.resolveCronXeroAuth(...args)
}))

vi.mock('~~/server/utils/anomalyDetection/runForTenant', () => ({
  runDetectionForTenant: (...args: unknown[]) => mocks.runDetectionForTenant(...args)
}))

const { default: handler } = await import('../../../../server/api/cron/anomaly-detection.post')

describe('POST /api/cron/anomaly-detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveCronXeroAuth.mockResolvedValue({
      tenantId: 'b4a0a130-48da-444b-8fdc-d91db8923318',
      accessToken: 'test-token'
    })
    mocks.queryOne.mockResolvedValue({ timezone: 'Australia/Melbourne' })
    mocks.runDetectionForTenant.mockResolvedValue({
      tenantId: 'b4a0a130-48da-444b-8fdc-d91db8923318',
      status: 'completed',
      detected: 0
    })
  })

  it('resolves the canonical tenant instead of selecting the legacy __default__ connection', async () => {
    const event = { query: { force: 'true' } }
    const result = await handler(event as never)

    expect(mocks.resolveCronXeroAuth).toHaveBeenCalledWith('anomaly-detection')
    expect(mocks.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_id = $1'),
      ['b4a0a130-48da-444b-8fdc-d91db8923318']
    )
    expect(mocks.runDetectionForTenant).toHaveBeenCalledWith(
      'b4a0a130-48da-444b-8fdc-d91db8923318',
      { event }
    )
    expect(result).toMatchObject({
      tenant_id: 'b4a0a130-48da-444b-8fdc-d91db8923318',
      status: 'completed'
    })
  })
})
