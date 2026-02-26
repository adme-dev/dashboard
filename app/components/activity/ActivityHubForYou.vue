<script setup lang="ts">
const { close } = useActivityHub()
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

// Fetch notifications on mount if empty
onMounted(async () => {
  if (notifications.value.length === 0) {
    await fetchNotifications()
  }
})

async function handleNotificationClick(notification: any) {
  if (!notification.isRead) {
    await markAsRead(notification.id)
  }
  if (notification.link) {
    close()
    router.push(notification.link)
  }
}

async function loadMore() {
  await fetchNotifications({ append: true })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Mini header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-default">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-muted">For You</span>
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

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading state -->
      <template v-if="loading && notifications.length === 0">
        <div class="space-y-2 px-3 py-2">
          <div v-for="i in 5" :key="i" class="flex items-center gap-2.5 py-2">
            <USkeleton class="h-8 w-8 rounded-full" />
            <div class="flex-1 space-y-1.5">
              <USkeleton class="h-3.5 w-28" />
              <USkeleton class="h-3 w-40" />
            </div>
          </div>
        </div>
      </template>

      <!-- Notifications list -->
      <template v-else-if="notifications.length > 0">
        <div class="space-y-0.5 px-1">
          <div
            v-for="notification in notifications"
            :key="notification.id"
            class="px-2 py-2 rounded-md hover:bg-elevated/50 flex items-start gap-2.5 relative cursor-pointer group"
            :class="{ 'bg-primary/5': !notification.isRead }"
            @click="handleNotificationClick(notification)"
          >
            <!-- Unread indicator -->
            <div
              v-if="!notification.isRead"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary rounded-r"
            />

            <!-- Icon or Avatar -->
            <div v-if="notification.actor" class="relative">
              <UAvatar
                :src="notification.actor.avatarUrl || undefined"
                :alt="notification.actor.name"
                size="sm"
              />
              <div class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-elevated flex items-center justify-center">
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
              <p class="text-xs font-medium text-highlighted truncate">
                {{ notification.title }}
              </p>
              <p class="text-xs text-muted line-clamp-2">
                {{ notification.message }}
              </p>
              <p class="text-[10px] text-dimmed mt-0.5">
                {{ formatRelativeTime(notification.createdAt) }}
              </p>
            </div>

            <!-- Delete button -->
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              @click.stop="deleteNotification(notification.id)"
            />
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
            <UIcon name="i-lucide-bell-off" class="w-6 h-6 text-muted" />
          </div>
          <p class="text-sm font-medium text-highlighted">No notifications</p>
          <p class="text-xs text-muted mt-1">You're all caught up!</p>
        </div>
      </template>
    </div>
  </div>
</template>
