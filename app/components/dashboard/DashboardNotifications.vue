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
const badges = computed(() => unreadCount.value > 0 ? [{ label: `${unreadCount.value} unread`, color: 'primary' as const }] : [])
</script>

<template>
  <DashboardWidgetShell
    title="Notifications"
    icon="i-lucide-bell"
    :badges="badges"
    to="/agency/inbox"
    view-all-label="Inbox"
    :loading="!loaded"
    :is-empty="!recent.length"
    empty-text="No notifications yet"
    empty-icon="i-lucide-bell-off"
  >
    <template v-if="unreadCount > 0" #header-actions>
      <UButton variant="ghost" color="neutral" size="xs" @click="markAllAsRead()">
        Mark all read
      </UButton>
    </template>

    <div class="space-y-1">
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
  </DashboardWidgetShell>
</template>
