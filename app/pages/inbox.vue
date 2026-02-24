<script setup lang="ts">
import { breakpointsTailwind } from '@vueuse/core'
import InboxNotification from '~/components/inbox/InboxNotification.vue'

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
  getNotificationIcon,
  getNotificationColor,
  formatRelativeTime,
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
  { label: 'System', value: 'system' }
]
const selectedTab = ref('all')

const typesByTab: Record<string, string[]> = {
  assigned: ['task_assigned'],
  mentions: ['task_mentioned'],
  approvals: ['approval_requested', 'approval_completed'],
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

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
</script>

<template>
  <UDashboardPanel
    id="inbox-1"
    :default-size="25"
    :min-size="20"
    :max-size="30"
    resizable
  >
    <UDashboardNavbar title="Inbox">
      <template #leading>
        <UDashboardSidebarCollapse />
      </template>
      <template #trailing>
        <UBadge :label="filteredNotifications.length" variant="subtle" />
      </template>

      <template #right>
        <UTabs
          v-model="selectedTab"
          :items="tabItems"
          :content="false"
          size="xs"
        />
      </template>
    </UDashboardNavbar>
    <InboxList
      v-model="selectedNotification"
      :notifications="filteredNotifications"
      :loading="loading"
      @select="handleSelect"
    />
  </UDashboardPanel>

  <InboxNotification
    v-if="selectedNotification"
    :notification="selectedNotification"
    @close="selectedNotification = null"
    @mark-read="handleMarkRead"
    @delete="handleDelete"
    @navigate="handleNavigate"
  />
  <div v-else class="hidden lg:flex flex-col flex-1 overflow-hidden">
    <!-- Live Feed Header -->
    <div class="border-b px-6 py-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <div
            class="w-2 h-2 rounded-full"
            :class="isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-300'"
          />
          <h2 class="text-lg font-semibold">Live Feed</h2>
        </div>
        <UBadge v-if="unreadCount > 0" :label="String(unreadCount)" color="error" size="xs" />
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

    <!-- Live notifications stream -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="notifications.length > 0" class="divide-y">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          class="px-6 py-4 hover:bg-elevated/50 cursor-pointer transition-colors relative"
          :class="{ 'bg-primary/5': !notification.isRead }"
          @click="handleSelect(notification)"
        >
          <!-- Unread bar -->
          <div
            v-if="!notification.isRead"
            class="absolute left-0 top-0 bottom-0 w-1 bg-primary"
          />

          <div class="flex items-start gap-3">
            <!-- Actor avatar or type icon -->
            <div v-if="notification.actor" class="relative shrink-0">
              <UAvatar
                :src="notification.actor.avatarUrl || undefined"
                :alt="notification.actor.name"
                size="sm"
              />
              <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-elevated flex items-center justify-center">
                <UIcon
                  :name="getNotificationIcon(notification.type)"
                  :class="getNotificationColor(notification.type)"
                  class="h-2.5 w-2.5"
                />
              </div>
            </div>
            <div
              v-else
              class="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0"
            >
              <UIcon
                :name="getNotificationIcon(notification.type)"
                :class="getNotificationColor(notification.type)"
                class="h-4 w-4"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate" :class="!notification.isRead ? 'text-highlighted' : 'text-muted'">
                {{ notification.title }}
              </p>
              <p class="text-sm text-muted line-clamp-2 mt-0.5">
                {{ notification.message }}
              </p>
              <div class="flex items-center gap-2 mt-1.5">
                <span class="text-xs text-dimmed">{{ formatRelativeTime(notification.createdAt) }}</span>
                <UBadge
                  v-if="notification.link"
                  label="View"
                  color="primary"
                  variant="subtle"
                  size="xs"
                  class="cursor-pointer"
                  @click.stop="handleNavigate(notification)"
                />
              </div>
            </div>

            <!-- Delete -->
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              class="opacity-0 group-hover:opacity-100 shrink-0"
              @click.stop="handleDelete(notification)"
            />
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="flex flex-col items-center justify-center h-full text-center px-6">
        <div class="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
          <UIcon name="i-lucide-bell-off" class="h-8 w-8 text-muted" />
        </div>
        <p class="text-sm font-medium text-highlighted">No notifications yet</p>
        <p class="text-xs text-muted mt-1">
          Push notifications will appear here in real-time
        </p>
        <div class="flex items-center gap-1.5 mt-4 text-xs text-dimmed">
          <div
            class="w-1.5 h-1.5 rounded-full"
            :class="isConnected ? 'bg-emerald-500' : 'bg-neutral-300'"
          />
          {{ isConnected ? 'Connected — listening for updates' : 'Connecting...' }}
        </div>
      </div>
    </div>
  </div>

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
