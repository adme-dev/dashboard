<script setup lang="ts">
const { notifications, unreadCount, fetchNotifications, markAllAsRead, markAsRead, getNotificationIcon, getNotificationColor, formatRelativeTime } = useNotifications()

const loaded = ref(false)

onMounted(async () => {
  try {
    await fetchNotifications()
  } catch {
    // silently fail
  } finally {
    loaded.value = true
  }
})

const recent = computed(() => notifications.value.slice(0, 5))
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bell" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Notifications</h3>
          <UBadge v-if="unreadCount > 0" color="primary" variant="subtle" size="xs">
            {{ unreadCount }}
          </UBadge>
        </div>
        <div class="flex items-center gap-1">
          <UButton v-if="unreadCount > 0" variant="ghost" color="neutral" size="xs" @click="markAllAsRead()">
            Mark all read
          </UButton>
          <UButton to="/inbox" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
            Inbox
          </UButton>
        </div>
      </div>
    </template>

    <!-- Loading state -->
    <div v-if="!loaded" class="space-y-3">
      <div v-for="i in 3" :key="i" class="flex items-start gap-3">
        <USkeleton class="w-8 h-8 rounded-full shrink-0" />
        <div class="flex-1 space-y-1.5">
          <USkeleton class="h-3 w-3/4" />
          <USkeleton class="h-3 w-1/2" />
        </div>
      </div>
    </div>

    <!-- Notification list -->
    <div v-else-if="recent.length" class="space-y-1">
      <div
        v-for="notif in recent"
        :key="notif.id"
        class="flex items-start gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-[var(--ui-bg-elevated)] transition-colors cursor-pointer"
        :class="{ 'opacity-60': notif.isRead }"
        @click="notif.link ? navigateTo(notif.link) : markAsRead(notif.id)"
      >
        <!-- Actor avatar or icon -->
        <div class="shrink-0 relative">
          <UAvatar v-if="notif.actor?.avatarUrl" :src="notif.actor.avatarUrl" :alt="notif.actor.name" size="xs" />
          <div v-else class="w-8 h-8 rounded-full bg-[var(--ui-bg-elevated)] flex items-center justify-center">
            <UIcon :name="getNotificationIcon(notif.type)" class="w-4 h-4" :class="getNotificationColor(notif.type)" />
          </div>
          <span v-if="!notif.isRead" class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-[var(--ui-bg)]" />
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <p class="text-sm text-[var(--ui-text-highlighted)] line-clamp-2">{{ notif.title }}</p>
          <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">
            <span v-if="notif.actor">{{ notif.actor.name }} &middot; </span>
            {{ formatRelativeTime(notif.createdAt) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="text-center py-6">
      <div class="w-10 h-10 rounded-full bg-[var(--ui-bg-elevated)] flex items-center justify-center mx-auto mb-2">
        <UIcon name="i-lucide-bell-off" class="w-5 h-5 text-[var(--ui-text-muted)]" />
      </div>
      <p class="text-sm text-[var(--ui-text-muted)]">No notifications yet</p>
    </div>
  </UCard>
</template>
