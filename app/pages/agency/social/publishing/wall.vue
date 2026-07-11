<script setup lang="ts">
import type { SocialPublishPlatform, SocialWallPost } from '~/types'
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'

const { clientId } = useSocialPublishingClient()

const search = ref('')
const statusFilter = ref('all')
const platformFilter = ref<'all' | SocialPublishPlatform>('all')
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>

const posts = ref<SocialWallPost[]>([])
const pending = ref(false)
const error = ref<any>(null)

async function refresh() {
  pending.value = true
  error.value = null
  try {
    posts.value = await apiFetch<SocialWallPost[]>('/api/agency/social/publishing/wall', {
      query: { clientId: clientId.value, limit: 180 },
    })
  } catch (err) {
    posts.value = []
    error.value = err
  } finally {
    pending.value = false
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
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat().format(value || 0)
}

function platformResultLinks(post: SocialWallPost) {
  return Object.entries(post.platform_results || {})
    .map(([platform, result]) => ({
      platform,
      status: result?.status || 'unknown',
      url: result?.url || null
    }))
    .filter(item => item.url)
}

function previewContent(post: SocialWallPost) {
  return post.content?.trim() || 'No copy saved for this post.'
}

function previewPlatforms(post: SocialWallPost): SocialPublishPlatform[] {
  return post.platforms.slice(0, 1)
}

function previewPageName(post: SocialWallPost) {
  const primaryPlatform = post.platforms[0]
  const account = post.accounts.find(item => item.platform === primaryPlatform) ?? post.accounts[0]
  return account?.account_name || post.campaign_name || 'Your Brand'
}

function resolvePreview(post: SocialWallPost) {
  return (platform: string) => {
    const override = post.platform_overrides?.[platform]
    return {
      content: override?.content?.trim() || post.content || '',
      mediaUrls: override?.mediaUrls?.length ? override.mediaUrls : post.media_urls || []
    }
  }
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
        class="flex min-h-0 flex-col overflow-hidden rounded-md border border-default bg-default"
      >
        <div class="border-b border-default bg-elevated p-3">
          <div class="overflow-x-auto pb-1">
            <div class="flex min-w-[380px] justify-center">
              <SocialPublishingPlatformPreviewPane
                :platforms="previewPlatforms(post)"
                :page-name="previewPageName(post)"
                :resolve="resolvePreview(post)"
              />
            </div>
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

          <p class="line-clamp-4 whitespace-pre-wrap text-sm leading-6">
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

          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="rounded-md border border-default p-2">
              <div class="text-muted">
                Schedule
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

          <div v-if="platformResultLinks(post).length" class="flex flex-wrap justify-end gap-2">
            <UButton
              v-for="link in platformResultLinks(post)"
              :key="`${post.id}-${link.platform}`"
              :to="link.url || undefined"
              target="_blank"
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-external-link"
            >
              {{ platformLabel(link.platform) }}
            </UButton>
          </div>
        </div>
      </article>
    </div>
  </SocialPublishingShell>
</template>
