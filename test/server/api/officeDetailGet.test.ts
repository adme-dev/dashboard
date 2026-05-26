import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: handler } = await import('../../../server/api/office/[officeId]/index.get')

function fakeEvent() {
  return {
    context: { params: { officeId: 'office-1' } }
  } satisfies TestEvent
}

describe('GET /api/office/:officeId', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'member' })
    mockQueryOne
      .mockResolvedValueOnce({ id: 'membership-1', role: 'member' })
      .mockResolvedValueOnce({ id: 'office-1', name: 'HQ' })
    mockQueryRows
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
  })

  it('returns stored office role for ordinary members', async () => {
    const result = await handler(fakeEvent())

    expect(result.myRole).toBe('member')
  })

  it('returns admin role for platform owners with member office membership', async () => {
    mockRequireAuth.mockResolvedValueOnce({ id: 'owner-1', role: 'owner' })

    const result = await handler(fakeEvent())

    expect(result.myRole).toBe('admin')
  })
})
