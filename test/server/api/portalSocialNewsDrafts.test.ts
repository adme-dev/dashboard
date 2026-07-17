import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
  params?: Record<string, string>
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => event.query || {}
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.readBody = async event => event.body || {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockList = vi.fn()
const mockRespond = vi.fn()
const POST_ID = '11111111-1111-4111-8111-111111111111'

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/socialNewsPortal', () => ({
  listPortalSocialNewsDrafts: (...args: unknown[]) => mockList(...args),
  respondToPortalSocialNewsDraft: (...args: unknown[]) => mockRespond(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: vi.fn(),
  transaction: vi.fn()
}))

const { default: listHandler } = await import('~~/server/api/portal/social/news-drafts/index.get')
const { default: respondHandler } = await import('~~/server/api/portal/social/news-drafts/[id]/respond.post')

describe('portal social news routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      id: 'portal-user-1',
      clientId: 'session-client',
      permissions: { canApproveWork: true }
    })
    mockList.mockResolvedValue({ drafts: [], summary: { total: 0 } })
    mockRespond.mockResolvedValue({ ok: true, status: 'approved' })
  })

  it('lists drafts using the session client id and ignores a caller-supplied clientId', async () => {
    const result = await listHandler({ query: { clientId: 'other-client', status: 'pending', limit: '25' } })

    expect(result).toEqual({ drafts: [], summary: { total: 0 } })
    expect(mockList.mock.calls[0][1]).toBe('session-client')
    expect(mockList.mock.calls[0][2]).toEqual({ status: 'pending', postId: undefined, limit: 25 })
  })

  it('requires canApproveWork and forwards the authenticated portal actor', async () => {
    const result = await respondHandler({
      params: { id: POST_ID },
      body: { action: 'approve', feedback: 'Looks good' }
    })

    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(mockRespond.mock.calls[0][1]).toEqual({
      clientId: 'session-client',
      clientUserId: 'portal-user-1',
      postId: POST_ID,
      action: 'approve',
      feedback: 'Looks good'
    })

    mockRequireClientAuth.mockResolvedValueOnce({
      id: 'portal-user-2',
      clientId: 'session-client',
      permissions: { canApproveWork: false }
    })
    await expect(respondHandler({ params: { id: POST_ID }, body: { action: 'approve' } }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('validates ids, actions, and feedback at the HTTP boundary', async () => {
    await expect(respondHandler({ body: { action: 'approve' } }))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(respondHandler({ params: { id: POST_ID }, body: { action: 'publish' } }))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(respondHandler({ params: { id: POST_ID }, body: { action: 'request_changes' } }))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(respondHandler({ params: { id: 'not-a-uuid' }, body: { action: 'approve' } }))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})
