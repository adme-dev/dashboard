import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  body?: Record<string, unknown>
  params?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = async event => event.body ?? {}
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockTransaction = vi.fn()
const mockClientQuery = vi.fn()
const mockCreateNotification = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args)
}))

const { default: createRequestHandler } = await import(
  '../../../../server/api/portal/requests/index.post'
)
const { default: addMessageHandler } = await import(
  '../../../../server/api/portal/requests/[id]/messages.post'
)

describe('portal request write APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      id: 'client-user-1',
      clientId: 'client-1',
      permissions: { canSubmitRequests: true }
    })
    mockQueryOne.mockResolvedValue({ id: 'request-1', status: 'in_progress' })
    mockCreateNotification.mockResolvedValue({ id: 'notification-1' })
    mockClientQuery.mockReset()
    mockTransaction.mockImplementation(async callback => callback({ query: mockClientQuery }))
  })

  it('logs client activity when a request is submitted', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ id: 'request-1', created_at: '2026-05-28T00:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await createRequestHandler({
      body: {
        requestType: 'job_request',
        category: 'strategy',
        title: 'Launch planning',
        description: 'Please help plan our next campaign.',
        priority: 'high'
      }
    })

    expect(result).toEqual({ id: 'request-1', createdAt: '2026-05-28T00:00:00Z' })
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO client_activity_log'),
      expect.arrayContaining([
        'client-user-1',
        'client-1',
        'request-1',
        expect.stringContaining('Launch planning')
      ])
    )
    expect(mockClientQuery.mock.calls[1][0]).toContain('client_request_submitted')
  })

  it('logs client activity when a client adds a request message', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      status: 'in_progress',
      title: 'Launch planning',
      assigned_to: 'team-1'
    })
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ id: 'message-1', created_at: '2026-05-28T01:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await addMessageHandler({
      params: { id: 'request-1' },
      body: { content: 'Can we get an update?' }
    })

    expect(result).toEqual({ id: 'message-1', createdAt: '2026-05-28T01:00:00Z' })
    expect(mockQueryOne).toHaveBeenCalledWith(
      'SELECT id, status, title, assigned_to FROM client_requests WHERE id = $1 AND client_id = $2',
      ['request-1', 'client-1']
    )
    expect(mockClientQuery.mock.calls[1][0]).toContain('client_request_message_added')
    expect(mockClientQuery.mock.calls[1][1]).toEqual([
      'client-user-1',
      'client-1',
      'request-1',
      JSON.stringify({ messageId: 'message-1' })
    ])
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: 'team-1',
      type: 'team_update',
      title: 'Client replied to a request',
      message: 'New client reply on "Launch planning".',
      link: '/agency/client-portal?tab=requests&requestId=request-1',
      metadata: {
        clientId: 'client-1',
        requestId: 'request-1',
        messageId: 'message-1'
      },
      reason: 'direct'
    })
  })
})
