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

const { default: messagesHandler } = await import(
  '../../../../server/api/agency/client-portal/requests/[id]/messages.post'
)

describe('agency client portal request messages API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'team-1' })
    mockQueryOne.mockResolvedValue({
      id: 'request-1',
      client_id: 'client-1',
      client_user_id: 'client-user-1',
      title: 'Request access to billing'
    })
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO client_request_messages')) {
        return {
          rows: [{
            id: 'message-1',
            created_at: '2026-05-28T04:00:00Z'
          }]
        }
      }
      return { rows: [] }
    })
    mockTransaction.mockImplementation(async callback => callback({ query: mockDbQuery }))
  })

  it('adds a public staff reply and logs client activity', async () => {
    const result = await messagesHandler({
      params: { id: 'request-1' },
      body: {
        content: 'We are reviewing this now.',
        isInternal: false
      }
    })

    expect(mockQueryOne).toHaveBeenCalledWith(
      'SELECT id, client_id, client_user_id, title FROM client_requests WHERE id = $1',
      ['request-1']
    )
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO client_activity_log'),
      [
        'client-1',
        'request-1',
        JSON.stringify({
          agencyUserId: 'team-1',
          messageId: 'message-1'
        })
      ]
    )
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO client_notifications'),
      [
        'client-user-1',
        'Agency replied to your request',
        'New reply on "Request access to billing".',
        '/portal/requests/request-1'
      ]
    )
    expect(result).toEqual({
      id: 'message-1',
      createdAt: '2026-05-28T04:00:00Z'
    })
  })

  it('requires message content', async () => {
    await expect(messagesHandler({
      params: { id: 'request-1' },
      body: { content: ' ' }
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Message content is required'
    })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('does not log client activity or notifications for internal notes', async () => {
    await messagesHandler({
      params: { id: 'request-1' },
      body: {
        content: 'Check billing permissions before replying.',
        isInternal: true
      }
    })

    expect(mockDbQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO client_activity_log'),
      expect.anything()
    )
    expect(mockDbQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO client_notifications'),
      expect.anything()
    )
  })
})
