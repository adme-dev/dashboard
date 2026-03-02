import type { BannerFeed, FeedBinding } from '~/types/banner-studio'

// Module-scope singleton state
const feedsState = reactive({
  feeds: [] as BannerFeed[],
  activeFeedId: null as string | null,
  previewRowIndex: 0,
  previewRows: [] as Record<string, string>[],
  feedOverrides: new Map<number, Record<string, any>>(),
  isPreviewMode: false,
})

export function useBannerFeeds() {
  const toast = useToast()

  async function loadFeeds(projectId: string) {
    try {
      const data = await $fetch<BannerFeed[]>('/api/agency/banner-studio/feeds', {
        params: { projectId },
      })
      feedsState.feeds = data
    } catch {
      feedsState.feeds = []
    }
  }

  async function uploadFeed(projectId: string, file: File, name: string) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('projectId', projectId)
    formData.append('name', name)

    const feed = await $fetch<BannerFeed>('/api/agency/banner-studio/feeds', {
      method: 'POST',
      body: formData,
    })
    feedsState.feeds.unshift(feed)
    return feed
  }

  async function deleteFeed(feedId: string) {
    await $fetch(`/api/agency/banner-studio/feeds/${feedId}`, { method: 'DELETE' })
    feedsState.feeds = feedsState.feeds.filter(f => f.id !== feedId)
    if (feedsState.activeFeedId === feedId) {
      feedsState.activeFeedId = null
      feedsState.previewRows = []
      feedsState.isPreviewMode = false
      feedsState.feedOverrides.clear()
    }
  }

  async function setActiveFeed(feedId: string) {
    feedsState.activeFeedId = feedId
    feedsState.previewRowIndex = 0

    try {
      const { rows } = await $fetch<{ rows: Record<string, string>[]; total: number }>(
        `/api/agency/banner-studio/feeds/${feedId}/rows`,
        { params: { offset: 0, limit: 200 } },
      )
      feedsState.previewRows = rows
    } catch {
      const feed = feedsState.feeds.find(f => f.id === feedId)
      feedsState.previewRows = feed?.sampleData || []
    }

    computeOverrides()
  }

  function setPreviewRow(index: number) {
    feedsState.previewRowIndex = Math.max(0, Math.min(index, feedsState.previewRows.length - 1))
    computeOverrides()
  }

  function togglePreview() {
    feedsState.isPreviewMode = !feedsState.isPreviewMode
    if (!feedsState.isPreviewMode) {
      feedsState.feedOverrides.clear()
    } else {
      computeOverrides()
    }
  }

  function computeOverrides() {
    feedsState.feedOverrides.clear()
    if (!feedsState.isPreviewMode || !feedsState.previewRows.length) return

    const row = feedsState.previewRows[feedsState.previewRowIndex]
    if (!row) return

    const { activeLayers } = useBannerStudio()
    for (const layer of activeLayers.value) {
      if (!layer.feedBindings?.length) continue
      const overrides: Record<string, any> = {}
      for (const binding of layer.feedBindings) {
        if (binding.feedId !== feedsState.activeFeedId) continue
        const val = row[binding.column]
        if (val !== undefined) {
          overrides[binding.property] = val
        }
      }
      if (Object.keys(overrides).length) {
        feedsState.feedOverrides.set(layer.id, overrides)
      }
    }
  }

  function getFeedOverride(layerId: number, property: string): any {
    if (!feedsState.isPreviewMode) return undefined
    return feedsState.feedOverrides.get(layerId)?.[property]
  }

  const activeFeed = computed(() =>
    feedsState.feeds.find(f => f.id === feedsState.activeFeedId) || null,
  )

  return {
    feedsState,
    activeFeed,
    loadFeeds,
    uploadFeed,
    deleteFeed,
    setActiveFeed,
    setPreviewRow,
    togglePreview,
    computeOverrides,
    getFeedOverride,
  }
}
