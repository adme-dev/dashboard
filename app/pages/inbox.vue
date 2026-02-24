<script setup lang="ts">
import { breakpointsTailwind } from '@vueuse/core'

const {
  notifications,
  unreadCount,
  loading,
  hasMore,
  fetchNotifications,
  markAsRead,
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
  await fetchNotifications()
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
  <div v-else class="hidden lg:flex flex-1 items-center justify-center">
    <UIcon name="i-lucide-inbox" class="size-32 text-dimmed" />
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
