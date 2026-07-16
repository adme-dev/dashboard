import { describe, expect, it, vi } from 'vitest'
import { loadAutoFeedInventory } from '~~/server/utils/feeds/autoFeedInventory'
import type { DealerLink, FeedProvider, FeedProviderContext } from '~~/server/utils/feeds/types'

const ctx: FeedProviderContext = { actingUserEmail: 'paul@example.com', externalOrgId: 'org-1' }
const link: DealerLink = {
  clientId: 'client-1',
  providerId: 'social-dashboard',
  externalOrgId: 'org-1',
  sellerRefs: ['blood-hyundai'],
  defaultFeedIds: ['feed-2'],
}

function provider(overrides: Partial<FeedProvider>): FeedProvider {
  return overrides as FeedProvider
}

describe('loadAutoFeedInventory', () => {
  it('prefers an active configured default feed', async () => {
    const previewFeed = vi.fn(async () => ({ total: 1, items: [] }))
    const feedProvider = provider({
      listFeeds: vi.fn(async () => [
        { id: 'feed-1', name: 'First', platform: 'google', isActive: true },
        { id: 'feed-2', name: 'Default', platform: 'facebook', isActive: true },
      ]),
      previewFeed,
    })

    const result = await loadAutoFeedInventory(feedProvider, ctx, link, 12)

    expect(result.feedName).toBe('Default')
    expect(previewFeed).toHaveBeenCalledWith(
      ctx,
      link,
      { providerId: 'social-dashboard', feedId: 'feed-2', platform: 'facebook' },
      { limit: 12 },
    )
  })

  it('previews seller-scoped linked inventory when no active feed exists', async () => {
    const previewInventory = vi.fn(async () => ({ total: 87, items: [] }))
    const feedProvider = provider({
      listFeeds: vi.fn(async () => []),
      previewInventory,
    })

    const result = await loadAutoFeedInventory(feedProvider, ctx, link, 12)

    expect(result.feedName).toBe('Linked inventory')
    expect(result.preview.total).toBe(87)
    expect(previewInventory).toHaveBeenCalledWith(
      ctx,
      link,
      { name: 'Auto Feed', platform: 'facebook', filters: {} },
      { limit: 12, offset: 0 },
    )
  })
})
