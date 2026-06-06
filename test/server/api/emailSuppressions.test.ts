import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const CLIENT_1 = '11111111-1111-4111-8111-111111111111'

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

describe('email suppressions routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockGetAssignedClientIds.mockResolvedValue([CLIENT_1])
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

  it('upgrades existing soft-bounce suppressions when staff manually suppresses an email', async () => {
    const handler = (await import('~~/server/api/email/suppressions/index.post')).default
    mockReadBody.mockResolvedValue({ email: 'person@example.com', note: 'persistent delivery issue' })
    mockQueryOne
      .mockResolvedValueOnce({ id: 'sub-1', email: 'person@example.com', client_id: null })
      .mockResolvedValueOnce({ email: 'person@example.com', reason: 'soft_bounce' })

    const result = await handler({} as never)

    const updateCall = mockExecute.mock.calls.find(([sql]) => String(sql).includes('UPDATE suppression_list'))
    expect(updateCall?.[1]).toEqual(['person@example.com', 'manual'])
    const auditCall = mockExecute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO suppression_events'))
    expect(auditCall?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      null,
      'manual',
      'updated',
      'manual',
      'user-1',
      '{"note":"persistent delivery issue","previousReason":"soft_bounce"}'
    ])
    expect(result).toEqual({ ok: true, email: 'person@example.com', action: 'updated' })
  })

  it('requires a staff note when manually suppressing an email', async () => {
    const handler = (await import('~~/server/api/email/suppressions/index.post')).default
    mockReadBody.mockResolvedValue({ email: 'person@example.com', note: '   ' })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'suppression_note_required'
    })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('removes manual suppressions and audits the removal', async () => {
    const handler = (await import('~~/server/api/email/suppressions/[email].delete')).default
    mockReadBody.mockResolvedValue({ note: 'restored by admin' })
    mockQueryOne
      .mockResolvedValueOnce({ email: 'person@example.com', reason: 'manual' })
      .mockResolvedValueOnce({ id: 'sub-1', email: 'person@example.com' })

    const result = await handler({} as never)

    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('DELETE FROM suppression_list')
    expect(String(mockExecute.mock.calls[0]?.[0])).toContain('reason = $2')
    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['person@example.com', 'manual'])
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

  it('requires a staff note when removing a suppression', async () => {
    const handler = (await import('~~/server/api/email/suppressions/[email].delete')).default
    mockReadBody.mockResolvedValue({ note: '   ' })
    mockQueryOne.mockResolvedValueOnce({ email: 'person@example.com', reason: 'manual' })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'suppression_note_required'
    })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('does not audit removal when the reviewed suppression reason changes before delete', async () => {
    const handler = (await import('~~/server/api/email/suppressions/[email].delete')).default
    mockReadBody.mockResolvedValue({ note: 'restored by admin' })
    mockQueryOne
      .mockResolvedValueOnce({ email: 'person@example.com', reason: 'manual' })
      .mockResolvedValueOnce({ id: 'sub-1', email: 'person@example.com' })
    mockExecute.mockResolvedValueOnce(0)

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'suppression_changed'
    })
    expect(mockExecute).toHaveBeenCalledTimes(1)
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

  it('requires agency admin role before removing confirmed hard-bounce suppressions', async () => {
    const handler = (await import('~~/server/api/email/suppressions/[email].delete')).default
    mockRequireWriteAccess.mockResolvedValueOnce({
      id: 'am-1',
      role: 'account_manager',
      is_active: true
    })
    mockReadBody.mockResolvedValue({ confirm: true, note: 'verified provider status' })
    mockQueryOne
      .mockResolvedValueOnce({ email: 'person@example.com', reason: 'hard_bounce' })
      .mockResolvedValueOnce({ id: 'sub-1', email: 'person@example.com', client_id: CLIENT_1 })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'suppression_removal_admin_required'
    })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('removes confirmed complaint suppressions and audits the confirmation', async () => {
    const handler = (await import('~~/server/api/email/suppressions/[email].delete')).default
    mockReadBody.mockResolvedValue({ confirm: true, note: 'verified provider status' })
    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('FROM suppression_list')) {
        return Promise.resolve({ email: 'person@example.com', reason: 'complaint' })
      }
      return Promise.resolve({ id: 'sub-1', email: 'person@example.com', client_id: null })
    })

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
