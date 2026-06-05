import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRouterParam = vi.fn()
const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  getRouterParam: typeof mockGetRouterParam
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.getRouterParam = mockGetRouterParam

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

describe('subscriber history route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockGetRouterParam.mockReturnValue('sub-1')
    mockQueryOne.mockResolvedValue({
      id: 'sub-1',
      email: 'person@example.com',
      name: 'Person',
      status: 'enabled',
      soft_bounce_count: 2,
      last_soft_bounce_at: '2026-06-05T00:00:00.000Z',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-05T00:00:00.000Z'
    })
    mockQueryRows
      .mockResolvedValueOnce([{ list_id: 'list-1', list_name: 'Retail', status: 'confirmed' }])
      .mockResolvedValueOnce([{ event_type: 'confirmed', source: 'form' }])
      .mockResolvedValueOnce([{ reason: 'manual', action: 'added' }])
      .mockResolvedValueOnce([{ event_type: 'clicked', campaign_name: 'June Offers' }])
  })

  it('returns subscriber profile, list membership, consent, suppression, and campaign event history', async () => {
    const handler = (await import('~~/server/api/email/subscribers/[id]/history.get')).default

    const result = await handler({} as never)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('FROM email_subscribers'),
      ['sub-1']
    )
    expect(mockQueryRows).toHaveBeenCalledTimes(4)
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('subscriber_lists')
    expect(String(mockQueryRows.mock.calls[1]?.[0])).toContain('email_consent_events')
    expect(String(mockQueryRows.mock.calls[2]?.[0])).toContain('suppression_events')
    expect(String(mockQueryRows.mock.calls[3]?.[0])).toContain('email_events')
    expect(result).toEqual({
      subscriber: expect.objectContaining({ id: 'sub-1', email: 'person@example.com' }),
      lists: [{ list_id: 'list-1', list_name: 'Retail', status: 'confirmed' }],
      consent_events: [{ event_type: 'confirmed', source: 'form' }],
      suppression_events: [{ reason: 'manual', action: 'added' }],
      campaign_events: [{ event_type: 'clicked', campaign_name: 'June Offers' }]
    })
  })

  it('returns 404 when the subscriber does not exist', async () => {
    const handler = (await import('~~/server/api/email/subscribers/[id]/history.get')).default
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'not_found'
    })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})
