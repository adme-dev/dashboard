<script setup lang="ts">
import type { FeedMessage } from '~/types'

const { close } = useActivityHub()
const { formatRelativeTime } = useNotifications()
const { channels, totalUnreadCount } = useChat()
const router = useRouter()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { params?: Record<string, unknown> }) => Promise<T>

const feedMessages = ref<FeedMessage[]>([])
const loading = ref(false)
const hasMore = ref(true)
const seenIds = ref(new Set<number>())

async function fetchFeed(before?: number) {
  loading.value = true
  try {
    const params: Record<string, string | number> = { limit: 30 }
    if (before) params.before = before
    const data = await apiFetch<FeedMessage[]>('/api/chat/feed', { params })
    if (data.length < 30) hasMore.value = false
    for (const msg of data) {
      if (!seenIds.value.has(msg.id)) {
        seenIds.value.add(msg.id)
        feedMessages.value.push(msg)
      }
    }
  } catch {
    // Silent — feed is non-critical
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!feedMessages.value.length) return
  const lastId = feedMessages.value[feedMessages.value.length - 1].id
  await fetchFeed(lastId)
}

function refresh() {
  feedMessages.value = []
  seenIds.value.clear()
  hasMore.value = true
  fetchFeed()
}

function handleClick(msg: FeedMessage) {
  close()
  router.push(`/agency/chat?channel=${msg.channelId}`)
}

function displayChannelName(msg: FeedMessage) {
  if (msg.channelType === 'channel') return `# ${msg.channelName}`
  return msg.channelName
}

// Watch for new messages via useChat channel last_message changes
watch(
  () => channels.value.map(c => c.last_message?.id),
  (newIds, oldIds) => {
    if (!oldIds) return
    for (let i = 0; i < channels.value.length; i++) {
      const ch = channels.value[i]
      const lastMsg = ch.last_message
      if (!lastMsg || !lastMsg.id) continue
      if (newIds[i] !== oldIds[i] && !seenIds.value.has(lastMsg.id)) {
        seenIds.value.add(lastMsg.id)
        feedMessages.value.unshift({
          id: lastMsg.id,
          channelId: ch.id,
          userId: lastMsg.user_id,
          content: (lastMsg.content || '').substring(0, 200),
          metadata: lastMsg.metadata || null,
          createdAt: lastMsg.created_at,
          userName: lastMsg.user_name || '',
          userAvatar: lastMsg.user_avatar || null,
          channelName: ch.name,
          channelSlug: ch.slug,
          channelType: ch.type,
          channelIsPrivate: ch.is_private,
          threadCount: 0
        })
      }
    }
  },
  { deep: false }
)

// Fetch on mount if empty
onMounted(() => {
  if (feedMessages.value.length === 0) {
    fetchFeed()
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Mini header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-default">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-muted">Live Feed</span>
        <UBadge
          v-if="totalUnreadCount > 0"
          :label="String(totalUnreadCount)"
          color="error"
          size="xs"
        />
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="xs"
        :loading="loading && feedMessages.length === 0"
        @click="refresh"
      />
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading skeleton -->
      <template v-if="loading && feedMessages.length === 0">
        <div class="space-y-2 px-3 py-2">
          <div v-for="i in 5" :key="i" class="flex items-start gap-2.5 py-2">
            <USkeleton class="h-8 w-8 rounded-full shrink-0" />
            <div class="flex-1 space-y-1.5">
              <USkeleton class="h-3 w-24" />
              <USkeleton class="h-3.5 w-full" />
              <USkeleton class="h-3 w-16" />
            </div>
          </div>
        </div>
      </template>

      <!-- Feed list -->
      <template v-else-if="feedMessages.length > 0">
        <div class="space-y-0.5 px-1">
          <div
            v-for="msg in feedMessages"
            :key="msg.id"
            class="px-2 py-2 rounded-md hover:bg-elevated/50 flex items-start gap-2.5 cursor-pointer group"
            @click="handleClick(msg)"
          >
            <!-- Avatar -->
            <UAvatar
              :src="msg.userAvatar || undefined"
              :alt="msg.userName"
              size="sm"
              class="shrink-0"
            />

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <!-- Top row: channel + user -->
              <div class="flex items-center gap-1.5 text-xs">
                <span class="font-medium text-primary truncate max-w-[120px]">{{ displayChannelName(msg) }}</span>
                <span class="text-dimmed">&middot;</span>
                <span class="text-muted truncate">{{ msg.userName }}</span>
              </div>

              <!-- Message preview -->
              <p class="text-xs text-highlighted line-clamp-2 mt-0.5">
                {{ msg.content }}
              </p>

              <!-- Bottom row: time + thread count -->
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-[10px] text-dimmed">
                  {{ formatRelativeTime(msg.createdAt) }}
                </span>
                <span v-if="msg.threadCount > 0" class="flex items-center gap-0.5 text-[10px] text-muted">
                  <UIcon name="i-lucide-message-square" class="w-2.5 h-2.5" />
                  {{ msg.threadCount }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Load more -->
        <div v-if="hasMore" class="py-3 text-center">
          <UButton
            label="Load more"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="loading"
            @click="loadMore"
          />
        </div>
      </template>

      <!-- Empty state -->
      <template v-else>
        <div class="flex flex-col items-center justify-center h-full text-center px-6">
          <div class="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3">
            <UIcon name="i-lucide-rss" class="w-6 h-6 text-muted" />
          </div>
          <p class="text-sm font-medium text-highlighted">No messages yet</p>
          <p class="text-xs text-muted mt-1">Join some channels to see messages here.</p>
        </div>
      </template>
    </div>
  </div>
</template>
