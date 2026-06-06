import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_1 = '11111111-1111-4111-8111-111111111111'
const CLIENT_2 = '22222222-2222-4222-8222-222222222222'

const mockGetQuery = vi.fn()
const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockGetAssignedClientIds = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryCount = vi.fn()
const mockExecute = vi.fn()

const scopedUser = {
  id: 'user-1',
  email: 'am@example.com',
  name: 'Account Manager',
  role: 'account_manager',
  is_active: true
}

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  getQuery: typeof mockGetQuery
  readBody: typeof mockReadBody
  getRouterParam: typeof mockGetRouterParam
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.getQuery = mockGetQuery
testGlobal.readBody = mockReadBody
testGlobal.getRouterParam = mockGetRouterParam

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/clientScoping', () => ({
  getAssignedClientIds: (...args: unknown[]) => mockGetAssignedClientIds(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryCount: (...args: unknown[]) => mockQueryCount(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

describe('email suppressions client-scoped policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(scopedUser)
    mockRequireWriteAccess.mockResolvedValue(scopedUser)
    mockGetAssignedClientIds.mockResolvedValue([CLIENT_1])
    mockGetQuery.mockReturnValue({})
    mockReadBody.mockResolvedValue({})
    mockGetRouterParam.mockReturnValue('person%40example.com')
    mockQueryOne.mockResolvedValue(null)
    mockQueryRows.mockResolvedValue([])
    mockQueryCount.mockResolvedValue(0)
    mockExecute.mockResolvedValue(1)
  })

  it('filters suppression list reads to assigned subscriber clients', async () => {
    const handler = (await import('~~/server/api/email/suppressions/index.get')).default

    await handler({} as never)

    expect(mockGetAssignedClientIds).toHaveBeenCalledWith(expect.anything(), 'user-1')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('s.client_id = ANY($1::uuid[])')
    expect(String(mockQueryCount.mock.calls[0]?.[0])).toContain('s.client_id = ANY($1::uuid[])')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual([[CLIENT_1]])
  })

  it('blocks scoped manual suppression for another client subscriber', async () => {
    const handler = (await import('~~/server/api/email/suppressions/index.post')).default
    mockReadBody.mockResolvedValueOnce({ email: 'person@example.com' })
    mockQueryOne.mockResolvedValueOnce({
      id: 'sub-1',
      email: 'person@example.com',
      client_id: CLIENT_2
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_client_forbidden'
    })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('blocks scoped suppression removal for another client subscriber', async () => {
    const handler = (await import('~~/server/api/email/suppressions/[email].delete')).default
    mockReadBody.mockResolvedValueOnce({ note: 'wrong client' })
    mockQueryOne
      .mockResolvedValueOnce({ email: 'person@example.com', reason: 'manual' })
      .mockResolvedValueOnce({
        id: 'sub-1',
        email: 'person@example.com',
        client_id: CLIENT_2
      })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_client_forbidden'
    })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('checks scoped access before requiring hard-bounce removal confirmation', async () => {
    const handler = (await import('~~/server/api/email/suppressions/[email].delete')).default
    mockReadBody.mockResolvedValueOnce({})
    mockQueryOne
      .mockResolvedValueOnce({ email: 'person@example.com', reason: 'hard_bounce' })
      .mockResolvedValueOnce({
        id: 'sub-1',
        email: 'person@example.com',
        client_id: CLIENT_2
      })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_client_forbidden'
    })
    expect(mockExecute).not.toHaveBeenCalled()
  })
})
