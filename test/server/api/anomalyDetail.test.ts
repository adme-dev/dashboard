import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  params?: Record<string, string>
  query?: Record<string, string>
}

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getSelectedTenant: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn()
}))

vi.mock('h3', () => ({
  defineEventHandler: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  getRouterParam: (event: TestEvent, name: string) => event.params?.[name],
  getQuery: (event: TestEvent) => event.query ?? {},
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mocks.requireRole(...args)
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mocks.getSelectedTenant(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  queryRows: (...args: unknown[]) => mocks.queryRows(...args)
}))

const { default: handler } = await import('../../../../server/api/ai/anomalies/[id].get')

describe('GET /api/ai/anomalies/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue({ id: 'finance-1' })
    mocks.getSelectedTenant.mockResolvedValue('tenant-1')
    mocks.queryOne.mockResolvedValue(null)
    mocks.queryRows.mockResolvedValue([])
  })

  it('returns an empty preview for a missing tenant-scoped anomaly when explicitly requested', async () => {
    const result = await handler({
      params: { id: '5eb85597-ab27-45ed-bed0-617eb53b1b25' },
      query: { missing: 'empty' }
    } as never)

    expect(result).toEqual({ anomaly: null, events: [] })
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })

  it('preserves the normal 404 contract when nullable preview mode is not requested', async () => {
    await expect(handler({
      params: { id: '5eb85597-ab27-45ed-bed0-617eb53b1b25' }
    } as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Anomaly not found'
    })
  })
})
