import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getHeader: (event: { headers?: Record<string, string> }, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getHeader = (event, name) => event.headers?.[name]
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/notifications', () => ({
  createBulkNotifications: vi.fn()
}))

vi.mock('~~/server/utils/leads/leadHealth', () => ({
  deriveLeadHealthIssues: vi.fn(() => []),
  getLeadHealthSnapshot: vi.fn()
}))

const { default: handler } = await import(
  '../../../../server/api/cron/lead-integration-health.post'
)

describe('lead integration health cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryRows.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('endpoint.is_active')) {
        throw new Error('column endpoint.is_active does not exist')
      }
      return []
    })
  })

  it('selects configured clients without referencing a nonexistent endpoint column', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    const result = await handler({
      headers: { 'x-cron-secret': 'test-cron-secret' }
    } as any)

    expect(result).toEqual({ ok: true, clients: 0, activeIssues: 0, notified: 0 })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('lead_webhook_endpoints')
  })
})
