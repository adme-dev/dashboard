import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

type TestGlobal = typeof globalThis & {
  defineEventHandler: <T extends (...args: unknown[]) => unknown>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
}

const testGlobal = globalThis as TestGlobal
testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}

const clientId = '11111111-1111-4111-8111-111111111111'
const linkRecord = {
  id: 'link-1',
  clientId,
  clientName: 'Astoria GWM',
  providerId: 'social-dashboard',
  externalOrgId: '22222222-2222-4222-8222-222222222222',
  sellerRefs: ['astoria-gwm'],
  defaultFeedIds: ['feed-1'],
  status: 'active',
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z'
}

const mockRequirePermission = vi.fn()
const mockRequireSocialClientAccess = vi.fn()
const mockCachedFetch = vi.fn()
const mockListDealerLinks = vi.fn()
const mockGetSocialDashboardClient = vi.fn()
const mockGetFeedProvider = vi.fn()
const mockLoadAutoFeedInventory = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args)
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...args: unknown[]) => mockRequireSocialClientAccess(...args)
}))
vi.mock('~~/server/utils/kv', () => ({
  cachedFetch: (...args: unknown[]) => mockCachedFetch(...args)
}))
vi.mock('~~/server/utils/feeds/dealerLinkStore', () => ({
  listDealerLinks: (...args: unknown[]) => mockListDealerLinks(...args)
}))
vi.mock('~~/server/utils/feeds/config', () => ({
  isDealerFeedsEnabled: () => true,
  getSocialDashboardClient: (...args: unknown[]) => mockGetSocialDashboardClient(...args)
}))
vi.mock('~~/server/utils/feeds/registry', () => ({
  getFeedProvider: (...args: unknown[]) => mockGetFeedProvider(...args)
}))
vi.mock('~~/server/utils/feeds/serverContext', () => ({
  cloudflareRuntimeEnv: () => ({}),
  mergedRuntimeEnv: () => ({})
}))
vi.mock('~~/server/utils/feeds/autoFeedInventory', () => ({
  loadAutoFeedInventory: (...args: unknown[]) => mockLoadAutoFeedInventory(...args)
}))

const { default: handler } = await import('../../../server/api/agency/social/feed-items.get')

describe('GET /api/agency/social/feed-items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({ id: 'user-1', email: 'staff@xeroflow.io' })
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'user-1' })
    mockCachedFetch.mockImplementation(async (_event, _key, _ttl, fetcher) => fetcher())
    mockListDealerLinks.mockResolvedValue([linkRecord])
    mockGetSocialDashboardClient.mockResolvedValue({ call: vi.fn() })
    mockGetFeedProvider.mockReturnValue({ id: 'social-dashboard' })
    mockLoadAutoFeedInventory.mockResolvedValue({
      feedName: 'Facebook inventory',
      preview: {
        total: 1,
        items: [{
          id: 'vehicle-1',
          make: 'GWM',
          model: 'Cannon',
          year: 2026,
          price: 42990,
          condition: 'New',
          stockNumber: 'A100',
          url: 'https://dealer.example/vehicle-1',
          image: 'https://cdn.example/vehicle-1.jpg'
        }],
        validation: {
          matchedTotal: 1,
          validatedTotal: 1,
          invalidTotal: 0,
          invalidSummaries: []
        }
      }
    })
  })

  it('uses the normalized dealer-link record without replacing identifiers with undefined', async () => {
    const result = await handler({ query: { clientId } } as never)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(mockListDealerLinks).toHaveBeenCalledWith({ clientId })
    expect(mockGetFeedProvider).toHaveBeenCalledWith('social-dashboard', expect.any(Object))
    expect(result.clients).toEqual([expect.objectContaining({ id: clientId, name: 'Astoria GWM', status: 'ready' })])
    expect(result.items).toEqual([expect.objectContaining({
      id: `${clientId}:vehicle-1`,
      clientId,
      readyForCompose: true,
      missingFields: []
    })])
  })

  it('requires an explicit client scope and does not query links when it is absent', async () => {
    await expect(handler({ query: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockRequireSocialClientAccess).not.toHaveBeenCalled()
    expect(mockListDealerLinks).not.toHaveBeenCalled()
  })

  it('returns safe client diagnostics instead of disguising provider failures as an empty feed', async () => {
    mockLoadAutoFeedInventory.mockRejectedValueOnce(new Error('upstream bearer token rejected'))

    const result = await handler({ query: { clientId } } as never)

    expect(result.items).toEqual([])
    expect(result.clients).toEqual([expect.objectContaining({
      id: clientId,
      status: 'error',
      error: 'Inventory could not be loaded. Try refreshing, then contact support if it continues.'
    })])
    expect(JSON.stringify(result)).not.toContain('bearer token')
  })

  it('projects validation readiness and blocks incomplete fallback candidates from Compose', async () => {
    mockLoadAutoFeedInventory.mockResolvedValueOnce({
      feedName: 'Linked inventory',
      preview: {
        total: 87,
        items: [{
          id: 'vehicle-2',
          make: 'Hyundai',
          model: 'Tucson',
          year: 2025,
          price: null,
          condition: 'Demo',
          stockNumber: 'B200',
          url: null,
          image: null
        }],
        validation: {
          matchedTotal: 87,
          validatedTotal: 0,
          invalidTotal: 87,
          invalidSummaries: [{ id: 'vehicle-2', issues: [
            { field: 'url', message: 'url is required' },
            { field: 'price', message: 'price is required' },
            { field: 'image_link', message: 'image is required' }
          ] }],
          showingFallbackCandidates: true
        }
      }
    })

    const result = await handler({ query: { clientId } } as never)

    expect(result.clients[0]).toMatchObject({
      status: 'blocked',
      total: 87,
      readiness: { status: 'blocked', matchedTotal: 87, validatedTotal: 0 }
    })
    expect(result.items[0]).toMatchObject({
      readyForCompose: false,
      missingFields: ['url', 'price', 'image']
    })
  })

  it('keys cached responses by contract version and client scope', async () => {
    await handler({ query: { clientId } } as never)

    expect(mockCachedFetch).toHaveBeenCalledWith(
      expect.anything(),
      `social-feed-items:v2:${clientId}`,
      300,
      expect.any(Function)
    )
  })
})
