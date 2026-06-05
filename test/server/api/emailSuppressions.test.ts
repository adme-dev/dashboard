import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetQuery = vi.fn()
const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryCount = vi.fn()
const mockExecute = vi.fn()

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

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryCount: (...args: unknown[]) => mockQueryCount(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

describe('email suppressions routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockGetQuery.mockReturnValue({})
    mockReadBody.mockResolvedValue({})
    mockGetRouterParam.mockReturnValue('person%40example.com')
    mockQueryOne.mockResolvedValue(null)
    mockQueryRows.mockResolvedValue([])
    mockQueryCount.mockResolvedValue(0)
    mockExecute.mockResolvedValue(1)
  })

  it('lists current suppressions with subscriber context and pagination', async () => {
    const handler = (await import('~~/server/api/email/suppressions/index.get')).default
    mockGetQuery.mockReturnValue({ q: 'person', reason: 'manual', page: '2', page_size: '25' })
    mockQueryRows.mockResolvedValueOnce([
      {
        email: 'person@example.com',
        reason: 'manual',
        subscriber_id: 'sub-1',
        subscriber_name: 'Person'
      }
    ])
    mockQueryCount.mockResolvedValueOnce(26)

    const result = await handler({} as never)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('FROM suppression_list sup')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['manual', '%person%'])
    expect(result).toEqual({
      items: [
        {
          email: 'person@example.com',
          reason: 'manual',
          subscriber_id: 'sub-1',
          subscriber_name: 'Person'
        }
      ],
      total: 26,
      page: 2,
      page_size: 25
    })
  })

  it('allows filtering thresholded soft-bounce suppressions', async () => {
    const handler = (await import('~~/server/api/email/suppressions/index.get')).default
    mockGetQuery.mockReturnValue({ reason: 'soft_bounce' })

    await handler({} as never)

    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['soft_bounce'])
  })

  it('manually suppresses a normalized email and records an audit event', async () => {
    const handler = (await import('~~/server/api/email/suppressions/index.post')).default
    mockReadBody.mockResolvedValue({ email: ' Person@Example.COM ', note: 'requested by support' })
    mockQueryOne
      .mockResolvedValueOnce({ id: 'sub-1', email: 'person@example.com' })
      .mockResolvedValueOnce(null)

    const result = await handler({} as never)

    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('INSERT INTO suppression_list')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['person@example.com', 'manual'])
    const auditCall = mockExecute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO suppression_events'))
    expect(auditCall?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      null,
      'manual',
      'added',
      'manual',
      'user-1',
      '{"note":"requested by support"}'
    ])
    expect(result).toEqual({ ok: true, email: 'person@example.com', action: 'added' })
  })

  it('removes manual suppressions and audits the removal', async () => {
    const handler = (await import('~~/server/api/email/suppressions/[email].delete')).default
    mockReadBody.mockResolvedValue({ note: 'restored by admin' })
    mockQueryOne
      .mockResolvedValueOnce({ email: 'person@example.com', reason: 'manual' })
      .mockResolvedValueOnce({ id: 'sub-1', email: 'person@example.com' })

    const result = await handler({} as never)

    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('DELETE FROM suppression_list')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['person@example.com'])
    const auditCall = mockExecute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO suppression_events'))
    expect(auditCall?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      null,
      'manual',
      'removed',
      'manual',
      'user-1',
      '{"note":"restored by admin","confirmed":false}'
    ])
    expect(result).toEqual({ ok: true, email: 'person@example.com', removed: true })
  })

  it('requires explicit confirmation before removing hard-bounce suppressions', async () => {
    const handler = (await import('~~/server/api/email/suppressions/[email].delete')).default
    mockReadBody.mockResolvedValue({})
    mockQueryOne.mockResolvedValueOnce({ email: 'person@example.com', reason: 'hard_bounce' })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'suppression_removal_requires_confirmation'
    })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('removes confirmed complaint suppressions and audits the confirmation', async () => {
    const handler = (await import('~~/server/api/email/suppressions/[email].delete')).default
    mockReadBody.mockResolvedValue({ confirm: true, note: 'verified provider status' })
    mockQueryOne
      .mockResolvedValueOnce({ email: 'person@example.com', reason: 'complaint' })
      .mockResolvedValueOnce({ id: 'sub-1', email: 'person@example.com' })

    await handler({} as never)

    const auditCall = mockExecute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO suppression_events'))
    expect(auditCall?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      null,
      'complaint',
      'removed',
      'manual',
      'user-1',
      '{"note":"verified provider status","confirmed":true}'
    ])
  })
})
