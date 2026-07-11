<script setup lang="ts">
const { isNotificationsSlideoverOpen } = useDashboard()
const {
  notifications,
  unreadCount,
  loading,
  hasMore,
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationIcon,
  getNotificationColor,
  formatRelativeTime
} = useNotifications()

const router = useRouter()
const apiFetch = $fetch as <T>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>

type ReasonBadge = { label: string; color: 'error' | 'info' | 'neutral'; variant: 'solid' | 'subtle' }

function reasonBadge(reason: string | null | undefined): ReasonBadge | null {
  if (!reason || reason === 'direct') return null
  if (reason === 'mentioned') return { label: 'Mentioned', color: 'error', variant: 'solid' }
  if (reason === 'assigned') return { label: 'Assigned', color: 'info', variant: 'solid' }
  if (reason === 'watching_board' || reason === 'watching_item') {
    return { label: 'Watching', color: 'neutral', variant: 'subtle' }
  }
  return null
}

// Lazy-loaded "why am I seeing this" explanations, keyed by notification id.
const whyCache = ref<Record<string, string>>({})
const whyLoading = ref<Record<string, boolean>>({})

async function loadWhy(notificationId: string) {
  if (whyCache.value[notificationId] || whyLoading.value[notificationId]) return
  whyLoading.value[notificationId] = true
  try {
    const data = await apiFetch<{ reason: string }>(`/api/notifications/${notificationId}/why`)
    whyCache.value[notificationId] = data.reason
  } catch {
    whyCache.value[notificationId] = 'Could not load explanation.'
  } finally {
    whyLoading.value[notificationId] = false
  }
}

// Tabs: inbox vs today's digest
const activeTab = ref<'inbox' | 'digest'>('inbox')
const digestRange = ref<'today' | 'week'>('today')
const inboxSort = ref<'recent' | 'importance'>('recent')

watch(inboxSort, async (sort) => {
  await fetchNotifications({ sort })
})

interface DigestBoard {
  boardId: string
  boardName: string
  counts: { mentioned: number; assigned: number; watching: number; direct: number }
  topItems: Array<{ taskId: string; taskTitle: string; count: number }>
  narrative?: string | null
}
interface DigestResponse {
  range: string
  startedAt: string
  totalNotifications: number
  boards: DigestBoard[]
}

const digestLoading = ref(false)
const digest = ref<DigestResponse | null>(null)

async function loadDigest() {
  digestLoading.value = true
  try {
    // narrative=true asks the server to ask Groq for a per-board sentence.
    // It can be slow (3-5s) so we don't block the count layout — load counts
    // first, then call again with narrative=true and merge.
    digest.value = await apiFetch<DigestResponse>(`/api/notifications/digest?range=${digestRange.value}`)
    digestLoading.value = false
    try {
      const enriched = await apiFetch<DigestResponse>(`/api/notifications/digest?range=${digestRange.value}&narrative=true`)
      // Only patch in narratives if the digest tab is still active and range hasn't changed
      if (digest.value && digest.value.range === enriched.range) {
        for (const b of enriched.boards) {
          const existing = digest.value.boards.find(x => x.boardId === b.boardId)
          if (existing) existing.narrative = b.narrative
        }
      }
    } catch {
      // narrative is best-effort
    }
  } catch (err) {
    console.error('Failed to load digest:', err)
    digest.value = null
    digestLoading.value = false
  }
}

watch([activeTab, digestRange], ([tab]) => {
  if (tab === 'digest') loadDigest()
})

function goToBoard(boardId: string, taskId?: string) {
  isNotificationsSlideoverOpen.value = false
  router.push(taskId ? `/agency/boards/${boardId}?task=${taskId}` : `/agency/boards/${boardId}`)
}

function boardTotal(b: DigestBoard): number {
  return b.counts.mentioned + b.counts.assigned + b.counts.watching + b.counts.direct
}

// Fetch notifications when slideover opens
watch(isNotificationsSlideoverOpen, async (isOpen) => {
  if (isOpen && notifications.value.length === 0) {
    await fetchNotifications()
  }
  // Phase E2: refine importance scores once per session via Workers AI.
  // Best-effort and silent — UI doesn't block on it.
  if (isOpen && import.meta.client) {
    try {
      const key = 'notif-importance-refined'
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, String(Date.now()))
        apiFetch('/api/notifications/refine-scores', { method: 'POST' })
          .then(async () => {
            // Re-fetch with current sort to pick up updated scores
            await fetchNotifications({ sort: inboxSort.value })
          })
          .catch(() => { /* silent */ })
      }
    } catch { /* silent — sessionStorage may be unavailable */ }
  }
})

// Handle notification click
async function handleNotificationClick(notification: any) {
  // Mark as read
  if (!notification.isRead) {
    await markAsRead(notification.id)
  }

  // Navigate if link provided
  if (notification.link) {
    isNotificationsSlideoverOpen.value = false
    router.push(notification.link)
  }
}

// Load more notifications
async function loadMore() {
  await fetchNotifications({ append: true })
}
</script>

<template>
  <USlideover
    v-model:open="isNotificationsSlideoverOpen"
    title="Notifications"
  >
    <template #header>
      <div class="flex items-center justify-between w-full pr-2">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold">Notifications</h2>
          <UBadge
            v-if="unreadCount > 0"
            :label="String(unreadCount)"
            color="error"
            size="xs"
          />
        </div>
        <UButton
          v-if="unreadCount > 0"
          label="Mark all read"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="markAllAsRead"
        />
      </div>
    </template>

    <template #body>
      <!-- Tab switcher -->
      <div class="flex items-center gap-0.5 -mx-3 mb-3 border-b border-default px-3">
        <button
          class="px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="activeTab === 'inbox'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-highlighted'"
          @click="activeTab = 'inbox'"
        >
          Inbox
        </button>
        <button
          class="px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="activeTab === 'digest'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-highlighted'"
          @click="activeTab = 'digest'"
        >
          Digest
        </button>
      </div>

      <!-- Digest tab -->
      <template v-if="activeTab === 'digest'">
        <div class="flex items-center gap-2 mb-3">
          <UButton
            label="Today"
            :variant="digestRange === 'today' ? 'soft' : 'ghost'"
            :color="digestRange === 'today' ? 'primary' : 'neutral'"
            size="xs"
            @click="digestRange = 'today'"
          />
          <UButton
            label="Last 7 days"
            :variant="digestRange === 'week' ? 'soft' : 'ghost'"
            :color="digestRange === 'week' ? 'primary' : 'neutral'"
            size="xs"
            @click="digestRange = 'week'"
          />
          <span v-if="digest" class="text-xs text-muted ml-auto">
            {{ digest.totalNotifications }} total
          </span>
        </div>

        <div v-if="digestLoading" class="space-y-3">
          <USkeleton v-for="i in 3" :key="i" class="h-20 w-full" />
        </div>

        <div v-else-if="!digest || digest.boards.length === 0" class="text-center py-12">
          <UIcon name="i-lucide-bell-off" class="w-10 h-10 mx-auto mb-3 text-muted opacity-50" />
          <p class="text-sm text-highlighted">No activity {{ digestRange === 'today' ? 'today' : 'this week' }}</p>
          <p class="text-xs text-muted mt-1">You're all caught up.</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="board in digest.boards"
            :key="board.boardId"
            class="rounded-lg border border-default overflow-hidden"
          >
            <button
              class="w-full px-3 py-2 bg-elevated/30 flex items-center gap-2 text-left hover:bg-elevated/50"
              @click="goToBoard(board.boardId)"
            >
              <UIcon name="i-lucide-columns-3" class="w-4 h-4 text-muted" />
              <span class="text-sm font-medium truncate">{{ board.boardName }}</span>
              <span class="text-xs text-muted ml-auto">{{ boardTotal(board) }}</span>
            </button>
            <div class="px-3 py-2 space-y-1.5">
              <p
                v-if="board.narrative"
                class="text-sm text-highlighted leading-snug"
              >
                {{ board.narrative }}
              </p>
              <div class="flex flex-wrap gap-1.5">
                <UBadge v-if="board.counts.mentioned" :label="`${board.counts.mentioned} mentioned`" color="error" variant="subtle" size="xs" />
                <UBadge v-if="board.counts.assigned" :label="`${board.counts.assigned} assigned`" color="info" variant="subtle" size="xs" />
                <UBadge v-if="board.counts.watching" :label="`${board.counts.watching} watching`" color="neutral" variant="subtle" size="xs" />
                <UBadge v-if="board.counts.direct" :label="`${board.counts.direct} other`" color="neutral" variant="subtle" size="xs" />
              </div>
              <div v-if="board.topItems.length > 0" class="space-y-0.5">
                <button
                  v-for="item in board.topItems"
                  :key="item.taskId"
                  class="w-full text-left text-xs text-muted hover:text-highlighted truncate"
                  @click="goToBoard(board.boardId, item.taskId)"
                >
                  · {{ item.taskTitle }} <span class="text-dimmed">({{ item.count }})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Inbox tab -->
      <template v-else>
      <!-- Sort toggle -->
      <div v-if="notifications.length > 0" class="flex items-center gap-2 mb-3">
        <span class="text-xs text-muted">Sort:</span>
        <UButton
          label="Recent"
          :variant="inboxSort === 'recent' ? 'soft' : 'ghost'"
          :color="inboxSort === 'recent' ? 'primary' : 'neutral'"
          size="xs"
          @click="inboxSort = 'recent'"
        />
        <UButton
          label="Importance"
          :variant="inboxSort === 'importance' ? 'soft' : 'ghost'"
          :color="inboxSort === 'importance' ? 'primary' : 'neutral'"
          size="xs"
          @click="inboxSort = 'importance'"
        />
      </div>

      <!-- Loading state -->
      <template v-if="loading && notifications.length === 0">
        <div class="space-y-3 -mx-3">
          <div v-for="i in 5" :key="i" class="flex items-center gap-3 px-3 py-2.5">
            <USkeleton class="h-10 w-10 rounded-full" />
            <div class="flex-1 space-y-2">
              <USkeleton class="h-4 w-32" />
              <USkeleton class="h-3 w-48" />
            </div>
          </div>
        </div>
      </template>

      <!-- Notifications list -->
      <template v-else-if="notifications.length > 0">
        <div class="space-y-1 -mx-3">
          <div
            v-for="notification in notifications"
            :key="notification.id"
            class="px-3 py-2.5 rounded-md hover:bg-elevated/50 flex items-start gap-3 relative cursor-pointer group"
            :class="{ 'bg-primary/5': !notification.isRead }"
            @click="handleNotificationClick(notification)"
          >
            <!-- Unread indicator -->
            <div
              v-if="!notification.isRead"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r"
            />

            <!-- Icon or Avatar -->
            <div
              v-if="notification.actor"
              class="relative"
            >
              <UAvatar
                :src="notification.actor.avatarUrl || undefined"
                :alt="notification.actor.name"
                size="md"
              />
              <div
                class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-elevated flex items-center justify-center"
              >
                <UIcon
                  :name="getNotificationIcon(notification.type)"
                  :class="getNotificationColor(notification.type)"
                  class="h-3 w-3"
                />
              </div>
            </div>
            <div
              v-else
              class="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center"
            >
              <UIcon
                :name="getNotificationIcon(notification.type)"
                :class="getNotificationColor(notification.type)"
                class="h-5 w-5"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium text-highlighted truncate">
                  {{ notification.title }}
                </p>
                <UBadge
                  v-if="reasonBadge(notification.reason)"
                  :label="reasonBadge(notification.reason)!.label"
                  :color="reasonBadge(notification.reason)!.color"
                  :variant="reasonBadge(notification.reason)!.variant"
                  size="xs"
                  class="flex-shrink-0"
                />
                <UPopover
                  v-if="notification.reason && notification.reason !== 'direct'"
                  :ui="{ content: 'max-w-xs' }"
                  @click.stop
                >
                  <button
                    class="text-muted hover:text-highlighted flex-shrink-0"
                    title="Why this notification?"
                    @click.stop="loadWhy(notification.id)"
                  >
                    <UIcon name="i-lucide-help-circle" class="w-3.5 h-3.5" />
                  </button>
                  <template #content>
                    <div class="p-3 text-sm">
                      <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Why this notification</p>
                      <p v-if="whyLoading[notification.id]" class="text-muted">Generating explanation…</p>
                      <p v-else>{{ whyCache[notification.id] || 'Click to load' }}</p>
                    </div>
                  </template>
                </UPopover>
              </div>
              <p class="text-sm text-muted line-clamp-2">
                {{ notification.message }}
              </p>
              <p class="text-xs text-dimmed mt-1">
                {{ formatRelativeTime(notification.createdAt) }}
              </p>
            </div>

            <!-- Delete button -->
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              @click.stop="deleteNotification(notification.id)"
            />
          </div>
        </div>

        <!-- Load more -->
        <div v-if="hasMore" class="mt-4 text-center">
          <UButton
            label="Load more"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="loading"
            @click="loadMore"
          />
        </div>
      </template>

      <!-- Empty state -->
      <template v-else>
        <div class="text-center py-12">
          <div class="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-4">
            <UIcon name="i-lucide-bell-off" class="h-8 w-8 text-muted" />
          </div>
          <p class="text-sm font-medium text-highlighted">No notifications</p>
          <p class="text-xs text-muted mt-1">You're all caught up!</p>
        </div>
      </template>
      </template>
    </template>
  </USlideover>
</template>
