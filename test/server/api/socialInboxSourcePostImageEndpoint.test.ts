import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: { id?: string }, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}
testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = event => event.id
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockFetchMetaSourcePostImage = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))
vi.mock('~~/server/utils/socialInbox/sourcePostMedia', () => ({
  fetchMetaSourcePostImage: (...args: unknown[]) => mockFetchMetaSourcePostImage(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/agency/social/inbox/conversations/[id]/source-post-image.get'
)

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  mockQueryOne.mockResolvedValue({
    platform: 'facebook',
    source_post_id: 'page_post',
    access_token: 'page-token'
  })
})

describe('GET /api/agency/social/inbox/conversations/:id/source-post-image', () => {
  it('returns refreshed image bytes from the authenticated proxy', async () => {
    mockFetchMetaSourcePostImage.mockResolvedValue({
      body: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/jpeg'
    })

    const response = await handler({ id: 'conversation-1', context: {} } as never) as Response

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toContain('private')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3])
    expect(mockFetchMetaSourcePostImage).toHaveBeenCalledWith({
      platform: 'facebook',
      sourcePostId: 'page_post',
      accessToken: 'page-token'
    })
  })

  it('returns not found when the conversation has no refreshable image', async () => {
    mockFetchMetaSourcePostImage.mockResolvedValue(null)

    await expect(handler({ id: 'conversation-1', context: {} } as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Source post image not available'
    })
  })
})
