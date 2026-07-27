import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: activityHandler } = await import(
  '../../../../server/api/portal/activity/index.get'
)

describe('portal recent activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      id: 'client-user-1',
      clientId: 'client-1'
    })
    mockQueryRows.mockResolvedValue([])
  })

  it('uses the authenticated tenant and a default limit of 50', async () => {
    await activityHandler({ query: {} })

    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('WHERE cal.client_id = $1')
    expect(sql).toContain('ORDER BY cal.created_at DESC')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 50])
  })

  it('clamps the requested limit to 100', async () => {
    await activityHandler({ query: { limit: '500' } })

    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['client-1', 100])
  })

  it('returns display fields without network or staff identity metadata', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      id: 'activity-1',
      action: 'approval_response',
      entity_type: 'approval',
      entity_id: 'approval-1',
      details: { status: 'approved', agencyUserEmail: 'private@example.com' },
      created_at: '2026-07-27T09:00:00.000Z',
      user_name: 'Jane Client',
      ip_address: '203.0.113.10',
      user_agent: 'Private browser'
    }])

    const result = await activityHandler({ query: {} })

    expect(result.activity).toEqual([{
      id: 'activity-1',
      action: 'approval_response',
      entityType: 'approval',
      entityId: 'approval-1',
      details: { status: 'approved' },
      createdAt: '2026-07-27T09:00:00.000Z',
      userName: 'Jane Client'
    }])
    expect(result.activity[0]).not.toHaveProperty('ipAddress')
    expect(result.activity[0]).not.toHaveProperty('userAgent')
    expect(result.activity[0]?.details).not.toHaveProperty('agencyUserEmail')
  })

  it('normalizes database failures', async () => {
    mockQueryRows.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(activityHandler({ query: {} })).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to fetch recent activity'
    })
  })
})
