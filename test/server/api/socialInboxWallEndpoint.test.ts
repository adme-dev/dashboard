import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, unknown> }
type TestHandler = (event: TestEvent) => Promise<unknown>

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}
testGlobal.defineEventHandler = <T>(fn: T) => fn
testGlobal.getQuery = (event: TestEvent) => event.query ?? {}
testGlobal.createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

const mockRequireSocialClientAccess = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...args: unknown[]) => mockRequireSocialClientAccess(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const { default: importedHandler } = await import('../../../server/api/agency/social/inbox/wall.get')
const handler = importedHandler as TestHandler

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireSocialClientAccess.mockResolvedValue({ id: 'user-1' })
  mockQueryRows.mockResolvedValue([])
})

describe('GET /api/agency/social/inbox/wall', () => {
  it('requires a non-empty clientId', async () => {
    await expect(handler({ query: { clientId: '   ' } })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'clientId required'
    })
  })

  it('rejects unsupported status filters before querying', async () => {
    await expect(handler({ query: { clientId: 'client-1', status: 'deleted' } })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Unsupported status filter'
    })
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.any(Object), 'client-1')
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('propagates scoped client access denial before querying', async () => {
    mockRequireSocialClientAccess.mockRejectedValueOnce(Object.assign(new Error('No access to this client'), {
      statusCode: 403,
      statusMessage: 'No access to this client'
    }))

    await expect(handler({ query: { clientId: 'client-2' } })).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'No access to this client'
    })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('normalizes query params and response rows', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        key: 'post-1',
        client_id: 'client-1',
        platform: 'facebook',
        status_summary: '{"open":"1","snoozed":0,"closed":0}',
        source_post_media: '[{"url":"https://cdn.example.com/post.jpg"}]',
        latest_conversations: '[{"id":"conv-1","channel_type":"comment","status":"open","unread_count":"2"}]',
        unread_count: '2',
        conversation_count: '1',
        message_count: '5'
      }
    ])

    const result = await handler({
      query: {
        clientId: [' client-1 '],
        platform: ' facebook ',
        status: 'open',
        limit: '9999',
        q: ' sale '
      }
    })

    const [, params] = mockQueryRows.mock.calls[0]
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.any(Object), 'client-1')
    expect(params).toEqual(['client-1', 'facebook', 'open', '%sale%', 120])
    expect(result).toEqual([
      expect.objectContaining({
        key: 'post-1',
        status_summary: { open: 1, snoozed: 0, closed: 0 },
        source_post_media: [{ url: 'https://cdn.example.com/post.jpg', type: null, thumbnailUrl: null }],
        latest_conversations: [
          expect.objectContaining({ id: 'conv-1', unread_count: 2 })
        ],
        unread_count: 2,
        conversation_count: 1,
        message_count: 5
      })
    ])
  })
})
