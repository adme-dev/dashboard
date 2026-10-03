<script setup lang="ts">
import type { SocialPublishPlatform, SocialWallPost } from '~/types'
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'
import { isVideoMediaUrl } from '~/utils/social/videoMedia'

const { clientId } = useSocialPublishingClient()

const historyPost = ref<SocialWallPost | null>(null)
const historyOpen = ref(false)
watch(clientId, () => {
  historyOpen.value = false
  historyPost.value = null
})
function showHistory(post: SocialWallPost) {
  historyPost.value = post
  historyOpen.value = true
}

const search = ref('')
const statusFilter = ref('all')
const platformFilter = ref<'all' | SocialPublishPlatform>('all')
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>

const posts = ref<SocialWallPost[]>([])
const pending = ref(false)
const error = ref<unknown>(null)
let refreshVersion = 0

async function refresh() {
  const version = ++refreshVersion
  const requestedClient = clientId.value
  pending.value = true
  posts.value = []
  error.value = null
  try {
    const result = await apiFetch<SocialWallPost[]>('/api/agency/social/publishing/wall', {
      query: { clientId: requestedClient, limit: 180 }
    })
    if (version === refreshVersion && requestedClient === clientId.value) posts.value = result
  } catch (err) {
    if (version === refreshVersion) error.value = err
  } finally {
    if (version === refreshVersion) pending.value = false
  }
}

await refresh()

watch(clientId, () => {
  void refresh()
})

const errorDescription = computed(() => {
  const e = error.value as { data?: { statusMessage?: string }, message?: string } | null
  return e?.data?.statusMessage || e?.message || 'Try again'
})

const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Approved', value: 'approved' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Published', value: 'published' },
  { label: 'Partially published', value: 'partially_published' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' }
]

const platformOptions = [
  { label: 'All platforms', value: 'all' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Google Business', value: 'google-business' }
]

const filteredPosts = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (posts.value || []).filter((post) => {
    if (statusFilter.value !== 'all' && post.status !== statusFilter.value) return false
    if (platformFilter.value !== 'all' && !post.platforms.includes(platformFilter.value)) return false
    if (!q) return true
    return [
      post.content,
      post.hashtags?.join(' '),
      post.tags?.join(' '),
      post.campaign_name,
      post.published_by_name,
      ...post.platforms,
      ...post.accounts.map(account => account.account_name || account.platform_account_id)
    ].filter(Boolean).join(' ').toLowerCase().includes(q)
  })
})

function statusColor(status: string): 'success' | 'info' | 'error' | 'warning' | 'neutral' {
  if (status === 'published') return 'success'
  if (status === 'scheduled' || status === 'approved') return 'info'
  if (status === 'failed') return 'error'
  if (status === 'partially_published') return 'warning'
  return 'neutral'
}

function platformLabel(platform: string) {
  const option = platformOptions.find(item => item.value === platform)
  return option?.label || platform
}

function fmtDate(value: string | null) {
  if (!value) return 'Unscheduled'
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  })
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat().format(value || 0)
}

function platformResultLinks(post: SocialWallPost) {
  return Object.entries(post.platform_results || {})
    .map(([platform, result]) => ({
      key: platform,
      platform: result?.platform || platform.split(':')[0],
      status: result?.status || 'unknown',
      url: result?.url || null
    }))
    .filter(item => item.url)
}

function previewContent(post: SocialWallPost) {
  return post.platform_overrides?.[post.platforms[0] || '']?.content?.trim()
    || post.content?.trim() || 'No copy saved for this post.'
}

function previewMedia(post: SocialWallPost) {
  const override = post.platform_overrides?.[post.platforms[0] || '']
  return override?.mediaUrls?.length ? override.mediaUrls : post.media_urls || []
}
</script>

<template>
  <SocialPublishingShell
    title="Social Wall"
    subtitle="All managed publishing posts with creative, copy, account context, status, and engagement."
  >
    <template #actions>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="pending"
        @click="() => refresh()"
      >
        Refresh
      </UButton>
    </template>

    <UAlert
      color="neutral"
      variant="soft"
      icon="i-lucide-history"
      title="Publishing history"
      description="This Wall records posts managed in XeroFlow. Published copy is read-only here; edits and removals made on a social network are not synced back yet. Open the network link to check the current live post."
      class="mb-4"
    />

    <div class="mb-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_12rem_13rem]">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search posts, accounts, campaigns, tags"
        class="w-full"
      />
      <USelectMenu
        v-model="statusFilter"
        :items="statusOptions"
        value-key="value"
        label-key="label"
        class="w-full"
      />
      <USelectMenu
        v-model="platformFilter"
        :items="platformOptions"
        value-key="value"
        label-key="label"
        class="w-full"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      title="Could not load social wall"
      :description="errorDescription"
      class="mb-4"
    />

    <div v-if="pending" class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <USkeleton v-for="i in 6" :key="i" class="h-80 rounded-md" />
    </div>

    <div v-else-if="!filteredPosts.length" class="rounded-md border border-default p-8 text-center text-sm text-muted">
      No managed posts match the current filters.
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <article
        v-for="post in filteredPosts"
        :key="post.id"
        class="@container flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-default bg-default"
      >
        <div v-if="previewMedia(post).length" class="min-w-0 border-b border-default bg-elevated p-3">
          <video
            v-if="isVideoMediaUrl(previewMedia(post)[0])"
            :src="previewMedia(post)[0]"
            controls
            playsinline
            preload="metadata"
            class="block max-h-96 w-full max-w-full rounded-md bg-default object-contain"
            :aria-label="`${post.accounts[0]?.account_name || 'Social post'} video`"
          />
          <a
            v-else
            :href="previewMedia(post)[0]"
            target="_blank"
            rel="noopener noreferrer"
            class="block"
            aria-label="Open post image at full size"
          >
            <img
              :src="previewMedia(post)[0]"
              alt="Post artwork"
              loading="lazy"
              class="max-h-96 w-full rounded-md object-contain"
            >
          </a>
          <div v-if="previewMedia(post).length > 1" class="mt-2 flex flex-wrap gap-2">
            <a
              v-for="(media, index) in previewMedia(post).slice(1)"
              :key="media"
              :href="media"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`Open attachment ${index + 2}`"
              class="flex size-14 items-center justify-center overflow-hidden rounded border border-default"
            >
              <UIcon v-if="isVideoMediaUrl(media)" name="i-lucide-play" class="size-5" />
              <img
                v-else
                :src="media"
                alt=""
                loading="lazy"
                class="size-full object-contain"
              >
            </a>
          </div>
        </div>

        <div class="flex flex-1 flex-col gap-3 p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge
                v-for="platform in post.platforms"
                :key="platform"
                color="neutral"
                variant="subtle"
                size="xs"
              >
                {{ platformLabel(platform) }}
              </UBadge>
            </div>
            <UBadge :color="statusColor(post.status)" variant="subtle" size="xs">
              {{ post.status.replaceAll('_', ' ') }}
            </UBadge>
          </div>

          <p class="line-clamp-4 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
            {{ previewContent(post) }}
          </p>

          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="tag in post.hashtags || []"
              :key="tag"
              color="neutral"
              variant="outline"
              size="xs"
            >
              {{ tag.startsWith('#') ? tag : `#${tag}` }}
            </UBadge>
          </div>

          <div class="grid grid-cols-1 gap-2 text-xs @xs:grid-cols-2">
            <div class="rounded-md border border-default p-2">
              <div class="text-muted">
                {{ post.published_at ? 'Published' : 'Scheduled' }}
              </div>
              <div class="mt-0.5 font-medium">
                {{ fmtDate(post.published_at || post.scheduled_at) }}
              </div>
            </div>
            <div class="rounded-md border border-default p-2">
              <div class="text-muted">
                Campaign
              </div>
              <div class="mt-0.5 truncate font-medium">
                {{ post.campaign_name || 'Unassigned' }}
              </div>
            </div>
          </div>

          <div v-if="post.published_at" class="rounded-md border border-default p-3 text-xs [overflow-wrap:anywhere]">
            <div class="text-muted">
              Published via XeroFlow by
            </div>
            <div class="mt-1 font-medium">
              {{ post.published_by_name || (post.published_by_id ? 'Former team member' : post.publication_source && post.publication_source !== 'manual' ? 'XeroFlow automation' : 'Not recorded') }}
            </div>
            <div v-if="post.publication_source" class="mt-1 text-muted">
              {{ post.publication_source === 'manual' ? 'Manual publish' : 'Automated delivery' }}
            </div>
          </div>

          <div class="min-h-[2rem]">
            <div class="mb-1 text-xs font-medium text-muted">
              Accounts
            </div>
            <div class="flex flex-wrap gap-1.5">
              <UBadge
                v-for="account in post.accounts"
                :key="account.id"
                color="neutral"
                variant="soft"
                size="xs"
              >
                {{ account.account_name || account.platform_account_id }}
              </UBadge>
              <span v-if="!post.accounts.length" class="text-xs text-muted">No target account saved</span>
            </div>
          </div>

          <div class="mt-auto grid grid-cols-5 gap-2 text-center text-xs">
            <div class="rounded-md bg-elevated p-2">
              <div class="font-semibold">
                {{ formatNumber(post.metrics.impressions) }}
              </div>
              <div class="text-muted">
                Imp
              </div>
            </div>
            <div class="rounded-md bg-elevated p-2">
              <div class="font-semibold">
                {{ formatNumber(post.metrics.engagements) }}
              </div>
              <div class="text-muted">
                Eng
              </div>
            </div>
            <div class="rounded-md bg-elevated p-2">
              <div class="font-semibold">
                {{ formatNumber(post.metrics.likes || post.metrics.reactions) }}
              </div>
              <div class="text-muted">
                Likes
              </div>
            </div>
            <div class="rounded-md bg-elevated p-2">
              <div class="font-semibold">
                {{ formatNumber(post.metrics.comments_count) }}
              </div>
              <div class="text-muted">
                Com
              </div>
            </div>
            <div class="rounded-md bg-elevated p-2">
              <div class="font-semibold">
                {{ formatNumber(post.metrics.shares) }}
              </div>
              <div class="text-muted">
                Share
              </div>
            </div>
          </div>

          <div
            v-if="post.engagement?.conversation_count"
            class="grid grid-cols-3 gap-2 rounded-md border border-default p-2 text-center text-xs"
          >
            <div>
              <div class="font-semibold">
                {{ formatNumber(post.engagement.conversation_count) }}
              </div>
              <div class="text-muted">
                Inbox
              </div>
            </div>
            <div>
              <div class="font-semibold">
                {{ formatNumber(post.engagement.open_count) }}
              </div>
              <div class="text-muted">
                Open
              </div>
            </div>
            <div>
              <div class="font-semibold">
                {{ formatNumber(post.engagement.unread_count) }}
              </div>
              <div class="text-muted">
                Unread
              </div>
            </div>
          </div>

          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              size="xs"
              variant="outline"
              color="neutral"
              icon="i-lucide-history"
              @click="showHistory(post)"
            >
              History
            </UButton>
            <UButton
              v-for="link in platformResultLinks(post)"
              :key="`${post.id}-${link.key}`"
              :to="link.url || undefined"
              target="_blank"
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-external-link"
            >
              Open on {{ platformLabel(link.platform) }}
            </UButton>
          </div>
        </div>
      </article>
    </div>
    <SocialPublishingPostHistory v-model:open="historyOpen" :post="historyPost" />
  </SocialPublishingShell>
</template>
