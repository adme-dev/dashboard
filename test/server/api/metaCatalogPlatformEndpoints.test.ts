import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireRole = vi.fn()
const mockGetReadiness = vi.fn()
const mockAttachFeed = vi.fn()
let body: Record<string, unknown> = {}
const clientId = '11111111-1111-4111-8111-111111111111'
const connectionId = '22222222-2222-4222-8222-222222222222'

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))
vi.mock('~~/server/utils/metaCatalogApplication', () => ({
  getMetaCatalogReadinessForClient: (...args: unknown[]) => mockGetReadiness(...args),
  attachMetaCatalogFeedForClient: (...args: unknown[]) => mockAttachFeed(...args)
}))

const globals = globalThis as unknown as Record<string, unknown>
globals.defineEventHandler = (fn: (event: unknown) => unknown) => fn
globals.getQuery = (event: unknown) => {
  const value = event && typeof event === 'object' ? event as { query?: unknown } : {}
  return value.query || {}
}
globals.readBody = () => body
globals.createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

const { default: readinessHandler } = await import(
  '~~/server/api/admin/meta-catalogs/readiness.get'
)
const { default: attachHandler } = await import(
  '~~/server/api/admin/meta-catalogs/feeds.post'
)

describe('XeroFlow Meta catalogue endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    body = {}
    mockRequireRole.mockResolvedValue({ id: 'actor-1', email: 'paul@adme.net.au' })
    mockGetReadiness.mockResolvedValue({ state: 'FEED_SETUP_REQUIRED' })
    mockAttachFeed.mockResolvedValue({ state: 'READY', productFeedId: 'product-feed-1' })
  })

  it('requires admin authority and an exact client/connection scope for readiness', async () => {
    const result = await readinessHandler({
      query: { clientId, connectionId }
    } as never)

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['admin', 'owner'])
    expect(mockGetReadiness).toHaveBeenCalledWith(expect.objectContaining({
      clientId,
      connectionId,
      actorEmail: 'paul@adme.net.au'
    }))
    expect(result).toEqual({ state: 'FEED_SETUP_REQUIRED' })
  })

  it('rejects a missing scope before executing a provider read', async () => {
    await expect(readinessHandler({ query: { clientId } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockGetReadiness).not.toHaveBeenCalled()
  })

  it('rejects arbitrary feed URLs instead of sending them to the provider', async () => {
    body = {
      clientId,
      connectionId,
      catalogId: '1009958868441320',
      sourceFeedId: '33333333-3333-4333-8333-333333333333',
      feedUrl: 'http://127.0.0.1/admin'
    }

    await expect(attachHandler({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockAttachFeed).not.toHaveBeenCalled()
  })

  it('accepts only the scoped provider identities needed for a feed attachment', async () => {
    body = {
      clientId,
      connectionId,
      catalogId: '1009958868441320',
      sourceFeedId: '33333333-3333-4333-8333-333333333333'
    }

    const result = await attachHandler({} as never)

    expect(mockAttachFeed).toHaveBeenCalledWith(expect.objectContaining({
      clientId,
      connectionId,
      catalogId: '1009958868441320',
      sourceFeedId: '33333333-3333-4333-8333-333333333333',
      actorId: 'actor-1',
      actorEmail: 'paul@adme.net.au'
    }))
    expect(result).toEqual({ state: 'READY', productFeedId: 'product-feed-1' })
    expect(JSON.stringify(mockAttachFeed.mock.calls)).not.toContain('127.0.0.1')
  })
})
