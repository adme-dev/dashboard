<script setup lang="ts">
import { breakpointsTailwind, useIntersectionObserver } from '@vueuse/core'
import InboxNotification from '~/components/inbox/InboxNotification.vue'

definePageMeta({ title: 'Inbox' })

const {
  notifications,
  unreadCount,
  loading,
  hasMore,
  isConnected,
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  connectToStream,
  disconnectFromStream
} = useNotifications()

const router = useRouter()

const tabItems = [
  { label: 'All', value: 'all' },
  { label: 'Unread', value: 'unread' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'Mentions', value: 'mentions' },
  { label: 'Approvals', value: 'approvals' },
  { label: 'Chat', value: 'chat' },
  { label: 'System', value: 'system' }
]
const selectedTab = ref('all')

const typesByTab: Record<string, string[]> = {
  assigned: ['task_assigned'],
  mentions: ['task_mentioned', 'chat_mention'],
  approvals: ['approval_requested', 'approval_completed'],
  chat: ['chat_mention', 'chat_dm'],
  system: ['system', 'team_update']
}

const filteredNotifications = computed(() => {
  if (selectedTab.value === 'all') return notifications.value
  if (selectedTab.value === 'unread') return notifications.value.filter(n => !n.isRead)
  const types = typesByTab[selectedTab.value]
  if (types) return notifications.value.filter(n => types.includes(n.type))
  return notifications.value
})

const selectedNotification = ref<any>(null)

const isNotificationPanelOpen = computed({
  get() {
    return !!selectedNotification.value
  },
  set(value: boolean) {
    if (!value) {
      selectedNotification.value = null
    }
  }
})

// Reset selection if notification is no longer in filtered list
watch(filteredNotifications, () => {
  if (selectedNotification.value && !filteredNotifications.value.find(n => n.id === selectedNotification.value?.id)) {
    selectedNotification.value = null
  }
})

// Handle notification selection — mark as read
async function handleSelect(notification: any) {
  selectedNotification.value = notification
  if (!notification.isRead) {
    await markAsRead(notification.id)
  }
}

async function handleMarkRead(notification: any) {
  if (!notification.isRead) {
    await markAsRead(notification.id)
  }
}

async function handleDelete(notification: any) {
  await deleteNotification(notification.id)
  if (selectedNotification.value?.id === notification.id) {
    selectedNotification.value = null
  }
}

function handleNavigate(notification: any) {
  if (notification.link) {
    router.push(notification.link)
  }
}

// Fetch on mount + connect SSE
onMounted(async () => {
  try {
    await fetchNotifications()
  } catch {
    // Notifications API may fail if DB schema is not yet migrated
  }
  connectToStream()
})

onBeforeUnmount(() => {
  disconnectFromStream()
})

// Infinite scroll sentinel — rendered inside the list's scroll viewport
// via InboxList's #footer slot so it fires on the list itself.
const loadMoreSentinel = ref<HTMLElement | null>(null)
const loadingMore = ref(false)

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    await fetchNotifications({ append: true })
  } catch {
    // Silently fail — user can click the button manually
  } finally {
    loadingMore.value = false
  }
}

useIntersectionObserver(loadMoreSentinel, ([{ isIntersecting }]) => {
  if (isIntersecting) loadMore()
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
</script>

<template>
  <!-- The agency layout wraps every page in a flex-COLUMN content area. The inbox
       owns a unified top bar (shrink-0) above a master–detail ROW (flex-1). The row
       must be a flex-ROW or the tall list eats all the height and the detail panel
       collapses to 0px. See the inbox layout fix. -->
  <div class="flex flex-col flex-1 min-h-0 overflow-hidden">
    <!-- ── Unified top bar ───────────────────────────────────────────── -->
    <header class="shrink-0 border-b border-default px-3 sm:px-6 py-2.5 flex items-center gap-3">
      <div class="flex items-center gap-2.5 shrink-0">
        <UDashboardSidebarCollapse class="-ms-1" />
        <h1 class="text-base font-semibold text-highlighted">
          Inbox
        </h1>
        <UTooltip v-if="unreadCount > 0" :text="`${unreadCount} unread`">
          <UBadge
            :label="String(unreadCount)"
            color="error"
            variant="subtle"
            size="sm"
          />
        </UTooltip>
      </div>

      <!-- Filter tabs — scroll horizontally when the bar is narrow rather than
           overflowing into the rest of the header. -->
      <div class="min-w-0 flex-1 overflow-x-auto">
        <UTabs
          v-model="selectedTab"
          :items="tabItems"
          :content="false"
          color="neutral"
          size="xs"
          class="w-fit"
        />
      </div>

      <div class="flex items-center gap-3 shrink-0">
        <span class="hidden sm:flex items-center gap-1.5 text-xs text-muted whitespace-nowrap">
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400 dark:bg-neutral-600'"
          />
          {{ isConnected ? 'Live' : 'Reconnecting…' }}
        </span>
        <UButton
          v-if="unreadCount > 0"
          label="Mark all read"
          icon="i-lucide-check-check"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="markAllAsRead"
        />
      </div>
    </header>

    <!-- ── Master–detail split ──────────────────────────────────────── -->
    <div class="flex flex-1 min-h-0 overflow-hidden">
      <!-- List (full width on mobile, fixed rail on desktop) -->
      <div class="flex flex-col min-h-0 w-full lg:w-96 lg:shrink-0 border-r border-default">
        <InboxList
          v-model="selectedNotification"
          :notifications="filteredNotifications"
          :loading="loading"
          class="flex-1 min-h-0"
          @select="handleSelect"
        >
          <template #footer>
            <div v-if="filteredNotifications.length > 0 && hasMore" class="px-4 py-3">
              <div ref="loadMoreSentinel">
                <UButton
                  label="Load more"
                  variant="ghost"
                  color="neutral"
                  block
                  size="sm"
                  :loading="loadingMore"
                  @click="loadMore"
                />
              </div>
            </div>
          </template>
        </InboxList>
      </div>

      <!-- Detail (desktop) — rich item view when selected, else a calm empty state.
           Mobile opens the same detail in a slideover (below). -->
      <div v-if="selectedNotification" class="hidden lg:flex flex-1 min-w-0">
        <InboxNotification
          :notification="selectedNotification"
          class="flex-1 min-w-0"
          @close="selectedNotification = null"
          @mark-read="handleMarkRead"
          @delete="handleDelete"
          @navigate="handleNavigate"
        />
      </div>
      <div v-else class="hidden lg:flex flex-1 min-w-0 flex-col items-center justify-center text-center p-8">
        <div class="w-14 h-14 rounded-full bg-elevated flex items-center justify-center mb-4">
          <UIcon name="i-lucide-mail-open" class="h-7 w-7 text-dimmed" />
        </div>
        <p class="text-sm font-medium text-highlighted">
          Select a notification
        </p>
        <p class="text-xs text-muted mt-1 max-w-xs">
          Choose an item from the list to see its full details and actions here.
        </p>
      </div>
    </div>
  </div>

  <!-- Mobile detail — slideover overlay -->
  <ClientOnly>
    <USlideover v-if="isMobile" v-model:open="isNotificationPanelOpen">
      <template #content>
        <InboxNotification
          v-if="selectedNotification"
          :notification="selectedNotification"
          @close="selectedNotification = null"
          @mark-read="handleMarkRead"
          @delete="handleDelete"
          @navigate="handleNavigate"
        />
      </template>
    </USlideover>
  </ClientOnly>
</template>
