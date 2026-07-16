import type {
  DealerLink,
  FeedPreviewResult,
  FeedProvider,
  FeedProviderContext,
  FeedSummary,
} from './types'

function preferredFeed(feeds: FeedSummary[], defaultFeedIds: string[]): FeedSummary | undefined {
  const active = feeds.filter(feed => feed.isActive)
  return defaultFeedIds
    .map(id => active.find(feed => feed.id === id))
    .find((feed): feed is FeedSummary => Boolean(feed))
    ?? active[0]
}

export async function loadAutoFeedInventory(
  provider: FeedProvider,
  ctx: FeedProviderContext,
  link: DealerLink,
  limit: number,
): Promise<{ feedName: string, preview: FeedPreviewResult }> {
  const feed = preferredFeed(await provider.listFeeds(ctx, link), link.defaultFeedIds)
  if (feed) {
    return {
      feedName: feed.name,
      preview: await provider.previewFeed(
        ctx,
        link,
        { providerId: link.providerId, feedId: feed.id, platform: feed.platform },
        { limit },
      ),
    }
  }

  return {
    feedName: 'Linked inventory',
    preview: await provider.previewInventory(
      ctx,
      link,
      { name: 'Auto Feed', platform: 'facebook', filters: {} },
      { limit, offset: 0 },
    ),
  }
}
