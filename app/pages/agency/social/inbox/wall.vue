<script setup lang="ts">
import type { SocialEngagementWallPost } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

interface AgencyClientOption {
  id: string
  name: string
}

type AgencyClientsResponse = AgencyClientOption[] | { clients?: AgencyClientOption[] }

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>
const clientsData = ref<AgencyClientsResponse>([])
const clientsPending = ref(false)

async function refreshClients() {
  clientsPending.value = true
  try {
    clientsData.value = await apiFetch<AgencyClientsResponse>('/api/agency/clients', {
      query: { limit: 200 },
    })
  } catch {
    clientsData.value = []
  } finally {
    clientsPending.value = false
  }
}
const clients = computed<AgencyClientOption[]>(() => {
  const d = clientsData.value
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(null)
const search = ref('')
const platform = ref('all')
const status = ref('open')
const refreshedAt = ref<Date | null>(null)

const platformOptions = [
  { label: 'All platforms', value: 'all' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Google Business', value: 'google-business' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'TikTok', value: 'tiktok' }
]
const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'All statuses', value: 'all' },
  { label: 'Snoozed', value: 'snoozed' },
  { label: 'Closed', value: 'closed' }
]

const query = computed(() => ({
  clientId: clientId.value,
  q: search.value || undefined,
  platform: platform.value === 'all' ? undefined : platform.value,
  status: status.value === 'all' ? undefined : status.value,
  limit: 80
}))

const wallPosts = ref<SocialEngagementWallPost[]>([])
const pending = ref(false)
const error = ref<any>(null)

async function refresh() {
  pending.value = true
  error.value = null
  try {
    wallPosts.value = await apiFetch<SocialEngagementWallPost[]>('/api/agency/social/inbox/wall', {
      query: query.value,
    })
  } catch (err) {
    wallPosts.value = []
    error.value = err
  } finally {
    pending.value = false
  }
}

const selectedClientName = computed(() => clients.value.find(c => c.id === clientId.value)?.name ?? null)
const isLoading = computed(() => clientsPending.value || pending.value)
const wallSummary = computed(() => {
  const posts = wallPosts.value
  return [
    { label: 'Source posts', value: posts.length, icon: 'i-lucide-panels-top-left' },
    { label: 'Threads', value: posts.reduce((sum, post) => sum + post.conversation_count, 0), icon: 'i-lucide-messages-square' },
    { label: 'Unread', value: posts.reduce((sum, post) => sum + post.unread_count, 0), icon: 'i-lucide-mail-warning' },
    { label: 'Messages', value: posts.reduce((sum, post) => sum + post.message_count, 0), icon: 'i-lucide-message-circle' }
  ]
})
const headerDetail = computed(() => {
  if (selectedClientName.value) return selectedClientName.value
  if (clientsPending.value) return 'Loading clients'
  return 'Client required'
})
const refreshedLabel = computed(() => refreshedAt.value ? `Updated ${fmtDate(refreshedAt.value.toISOString())}` : null)
const errorDescription = computed(() => {
  const e = error.value as { data?: { statusMessage?: string }, message?: string } | null
  return e?.data?.statusMessage || e?.message || 'Try again'
})

watch(clients, (nextClients) => {
  if (!clientId.value && nextClients[0]) clientId.value = nextClients[0].id
}, { immediate: true })

watch(query, () => {
  if (clientId.value) refreshWall()
}, { immediate: true })

onMounted(() => {
  void refreshClients()
})

async function refreshWall() {
  if (!clientId.value) return
  await refresh()
  if (!error.value) refreshedAt.value = new Date()
}

function postImage(post: SocialEngagementWallPost) {
  return post.source_post_media?.[0]?.thumbnailUrl || post.source_post_media?.[0]?.url || null
}

function postTitle(post: SocialEngagementWallPost) {
  return post.source_post_title || post.source_post_content?.split(/\r?\n/).find(Boolean) || `${post.account_name || post.platform} post`
}

function fmtDate(value: string | null) {
  if (!value) return 'Unknown date'
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value)
}

function visibleConversations(post: SocialEngagementWallPost) {
  return post.latest_conversations.slice(0, 4)
}
</script>

<template>
  <div class="min-h-[calc(100vh-4rem)]">
    <div class="flex flex-wrap items-center gap-3 p-4 border-b border-default">
      <div class="min-w-0">
        <h1 class="text-lg font-semibold">
          Engagement Wall
        </h1>
        <p class="text-sm text-muted">
          {{ headerDetail }}
          <template v-if="refreshedLabel">
            · {{ refreshedLabel }}
          </template>
        </p>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <USelectMenu
          v-model="clientId"
          :items="clientOptions"
          value-key="value"
          placeholder="Select client"
          class="w-56 max-w-full"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="Refresh"
          variant="subtle"
          :loading="pending"
          :disabled="!clientId"
          @click="refreshWall"
        />
      </div>
    </div>

    <div class="px-4">
      <SocialSuiteSectionNav />
    </div>

    <div class="grid gap-3 border-t border-default p-4 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="item in wallSummary"
        :key="item.label"
        class="flex min-h-20 items-center gap-3 rounded-md border border-default bg-elevated px-4 py-3"
      >
        <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-default text-muted">
          <UIcon :name="item.icon" class="size-4" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-medium text-muted">
            {{ item.label }}
          </div>
          <div class="text-2xl font-semibold tabular-nums">
            {{ formatCount(item.value) }}
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-2 border-y border-default p-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search posts, comments, accounts"
        class="w-full"
        :disabled="!clientId"
      />
      <USelectMenu
        v-model="platform"
        :items="platformOptions"
        value-key="value"
        class="w-full"
        :disabled="!clientId"
      />
      <USelectMenu
        v-model="status"
        :items="statusOptions"
        value-key="value"
        class="w-full"
        :disabled="!clientId"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      title="Could not load engagement wall"
      :description="errorDescription"
      class="m-4"
    />

    <div v-if="isLoading" class="grid gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-3">
      <USkeleton
        v-for="i in 6"
        :key="i"
        class="h-96 rounded-md"
      />
    </div>

    <div v-else-if="!clients.length" class="p-8 text-center text-sm text-muted">
      No agency clients are available.
    </div>

    <div v-else-if="!clientId" class="p-8 text-center text-sm text-muted">
      Client required.
    </div>

    <div v-else-if="!wallPosts.length" class="p-8 text-center text-sm text-muted">
      No source-post engagement matches the current filters.
    </div>

    <div v-else class="grid gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-3">
      <article
        v-for="post in wallPosts"
        :key="post.key"
        class="flex min-h-0 flex-col overflow-hidden rounded-md border border-default bg-default"
      >
        <div class="flex items-start gap-3 border-b border-default p-4">
          <img
            v-if="postImage(post)"
            :src="postImage(post) || undefined"
            :alt="postTitle(post)"
            class="size-20 shrink-0 rounded object-cover"
            loading="lazy"
            referrerpolicy="no-referrer"
          >
          <div
            v-else
            class="flex size-20 shrink-0 items-center justify-center rounded bg-elevated text-muted"
          >
            <UIcon name="i-lucide-image" class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge color="neutral" variant="subtle" size="xs">
                {{ post.platform }}
              </UBadge>
              <UBadge
                v-if="post.campaign_name"
                color="primary"
                variant="subtle"
                size="xs"
              >
                {{ post.campaign_name }}
              </UBadge>
            </div>
            <h2 class="mt-1 line-clamp-2 text-sm font-semibold">
              {{ postTitle(post) }}
            </h2>
            <p
              v-if="post.source_post_content"
              class="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted"
            >
              {{ post.source_post_content }}
            </p>
            <p class="mt-2 truncate text-xs text-muted">
              {{ post.account_name || post.platform_account_id || 'Account unavailable' }} · {{ fmtDate(post.source_post_published_at || post.latest_activity_at) }}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-2 border-b border-default p-3 text-center text-xs">
          <div>
            <div class="font-semibold">
              {{ post.conversation_count }}
            </div>
            <div class="text-muted">
              Threads
            </div>
          </div>
          <div>
            <div class="font-semibold">
              {{ post.message_count }}
            </div>
            <div class="text-muted">
              Messages
            </div>
          </div>
          <div>
            <div class="font-semibold">
              {{ post.unread_count }}
            </div>
            <div class="text-muted">
              Unread
            </div>
          </div>
          <div>
            <div class="font-semibold">
              {{ post.status_summary.open }}
            </div>
            <div class="text-muted">
              Open
            </div>
          </div>
        </div>

        <div class="flex flex-1 flex-col p-3">
          <div
            v-for="conversation in visibleConversations(post)"
            :key="conversation.id"
            class="border-t border-default py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div class="flex items-center gap-2 text-xs">
              <span class="min-w-0 truncate font-medium">
                {{ conversation.latest_author_name || conversation.participant_name || 'User unavailable' }}
              </span>
              <UBadge color="neutral" variant="subtle" size="xs">
                {{ conversation.channel_type }}
              </UBadge>
              <span class="ml-auto shrink-0 text-muted">{{ fmtDate(conversation.last_message_at) }}</span>
            </div>
            <p class="mt-1 line-clamp-2 text-sm text-muted">
              {{ conversation.last_message_preview || 'No preview available.' }}
            </p>
            <div class="mt-2 flex justify-end">
              <UButton
                :to="`/agency/social/inbox?conversation=${conversation.id}`"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-message-square"
              >
                Open thread
              </UButton>
            </div>
          </div>
        </div>

        <div class="mt-auto flex items-center justify-between gap-3 border-t border-default p-3">
          <span class="min-w-0 truncate text-xs text-muted">
            Latest activity {{ fmtDate(post.latest_activity_at) }}
          </span>
          <UButton
            v-if="post.source_post_url"
            :to="post.source_post_url"
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-external-link"
          >
            Open post
          </UButton>
        </div>
      </article>
    </div>
  </div>
</template>
