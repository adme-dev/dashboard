import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

type TestGlobal = typeof globalThis & {
  defineEventHandler: <T extends (...args: never[]) => unknown>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
}

const testGlobal = globalThis as TestGlobal
testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: handler } = await import('../../../../server/api/crm/verticals/index.get')

describe('GET /api/crm/verticals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryRows.mockResolvedValue([])
  })

  it('treats an empty client_id query as an omitted optional filter', async () => {
    const result = await handler({ query: { client_id: '' } } as never)

    expect(result).toEqual({ all: [], enabled: ['generic'] })
    expect(mockQueryRows).toHaveBeenCalledTimes(1)
  })

  it('returns a client error for a malformed non-empty client_id', async () => {
    await expect(handler({ query: { client_id: 'not-a-uuid' } } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid client_id'
    })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})
