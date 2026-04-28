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

// Fetch notifications when slideover opens
watch(isNotificationsSlideoverOpen, async (isOpen) => {
  if (isOpen && notifications.value.length === 0) {
    await fetchNotifications()
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
  </USlideover>
</template>
