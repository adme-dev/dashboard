import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  body?: Record<string, unknown>
  params?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockTransaction = vi.fn()
const mockDbQuery = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const { default: patchHandler } = await import(
  '../../../../server/api/agency/client-portal/requests/[id].patch'
)

describe('agency client portal request patch API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'team-1' })
    mockQueryOne.mockResolvedValue({
      id: 'request-1',
      client_id: 'client-1',
      client_user_id: 'client-user-1',
      title: 'Request access to billing',
      status: 'submitted'
    })
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE client_requests')) {
        return {
          rows: [{
            id: 'request-1',
            status: 'in_review',
            assigned_to: 'team-2',
            priority: 'high',
            updated_at: '2026-05-28T02:00:00Z'
          }]
        }
      }
      return { rows: [] }
    })
    mockTransaction.mockImplementation(async (callback) => {
      const db = {
        query: mockDbQuery
      }

      return callback(db)
    })
  })

  it('updates a request and logs client activity', async () => {
    const result = await patchHandler({
      params: { id: 'request-1' },
      body: {
        status: 'in_review',
        assignedTo: 'team-2',
        priority: 'high'
      }
    })

    expect(mockQueryOne).toHaveBeenCalledWith(
      'SELECT id, client_id, client_user_id, title, status FROM client_requests WHERE id = $1',
      ['request-1']
    )
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO client_activity_log'),
      [
        'client-1',
        'request-1',
        JSON.stringify({
          agencyUserId: 'team-1',
          status: 'in_review',
          assignedTo: 'team-2',
          priority: 'high'
        })
      ]
    )
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO client_notifications'),
      [
        'client-user-1',
        'Request in review',
        '"Request access to billing" was updated to in review.',
        '/portal/requests/request-1'
      ]
    )
    expect(result).toMatchObject({
      id: 'request-1',
      status: 'in_review'
    })
  })
})
