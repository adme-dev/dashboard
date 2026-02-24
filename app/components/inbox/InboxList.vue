<script setup lang="ts">
interface NotificationActor {
  id: string
  name: string
  avatarUrl: string | null
}

interface Notification {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  metadata: Record<string, any> | null
  isRead: boolean
  readAt: string | null
  createdAt: string
  actor: NotificationActor | null
}

const props = defineProps<{
  notifications: Notification[]
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [notification: Notification]
}>()

const { getNotificationIcon, getNotificationColor, formatRelativeTime } = useNotifications()

const notificationRefs = ref<Record<string, Element>>({})

const selectedNotification = defineModel<Notification | null>()

watch(selectedNotification, () => {
  if (!selectedNotification.value) return
  const el = notificationRefs.value[selectedNotification.value.id]
  if (el) {
    el.scrollIntoView({ block: 'nearest' })
  }
})

defineShortcuts({
  arrowdown: () => {
    const index = props.notifications.findIndex(n => n.id === selectedNotification.value?.id)
    if (index === -1) {
      selectedNotification.value = props.notifications[0]
    } else if (index < props.notifications.length - 1) {
      selectedNotification.value = props.notifications[index + 1]
    }
    if (selectedNotification.value) {
      emit('select', selectedNotification.value)
    }
  },
  arrowup: () => {
    const index = props.notifications.findIndex(n => n.id === selectedNotification.value?.id)
    if (index === -1) {
      selectedNotification.value = props.notifications[props.notifications.length - 1]
    } else if (index > 0) {
      selectedNotification.value = props.notifications[index - 1]
    }
    if (selectedNotification.value) {
      emit('select', selectedNotification.value)
    }
  }
})

function handleClick(notification: Notification) {
  selectedNotification.value = notification
  emit('select', notification)
}
</script>

<template>
  <div class="overflow-y-auto divide-y divide-default">
    <!-- Loading skeleton -->
    <template v-if="loading && notifications.length === 0">
      <div v-for="i in 6" :key="i" class="p-4 sm:px-6 flex items-center gap-3">
        <USkeleton class="h-10 w-10 rounded-full shrink-0" />
        <div class="flex-1 space-y-2">
          <USkeleton class="h-4 w-32" />
          <USkeleton class="h-3 w-48" />
        </div>
      </div>
    </template>

    <!-- Empty state -->
    <div v-else-if="notifications.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
      <UIcon name="i-lucide-bell-off" class="size-12 text-dimmed mb-3" />
      <p class="text-sm font-medium text-highlighted">No notifications</p>
      <p class="text-xs text-muted mt-1">You're all caught up</p>
    </div>

    <!-- Notification items -->
    <template v-else>
      <div
        v-for="notification in notifications"
        :key="notification.id"
        :ref="(el: any) => { if (el) notificationRefs[notification.id] = el as Element }"
      >
        <div
          class="p-4 sm:px-6 text-sm cursor-pointer border-l-2 transition-colors"
          :class="[
            !notification.isRead ? 'text-highlighted' : 'text-toned',
            selectedNotification && selectedNotification.id === notification.id
              ? 'border-primary bg-primary/10'
              : 'border-(--ui-bg) hover:border-primary hover:bg-primary/5'
          ]"
          @click="handleClick(notification)"
        >
          <div class="flex items-start gap-3">
            <!-- Avatar with type icon overlay -->
            <div v-if="notification.actor" class="relative shrink-0">
              <UAvatar
                :src="notification.actor.avatarUrl || undefined"
                :alt="notification.actor.name"
                size="md"
              />
              <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-elevated flex items-center justify-center">
                <UIcon
                  :name="getNotificationIcon(notification.type)"
                  :class="getNotificationColor(notification.type)"
                  class="h-3 w-3"
                />
              </div>
            </div>
            <div v-else class="relative shrink-0 w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
              <UIcon
                :name="getNotificationIcon(notification.type)"
                :class="getNotificationColor(notification.type)"
                class="h-5 w-5"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="truncate" :class="[!notification.isRead && 'font-semibold']">
                    {{ notification.actor?.name || 'System' }}
                  </span>
                  <UChip v-if="!notification.isRead" />
                </div>
                <span class="text-dimmed text-xs shrink-0 ml-2">
                  {{ formatRelativeTime(notification.createdAt) }}
                </span>
              </div>
              <p class="truncate" :class="[!notification.isRead && 'font-semibold']">
                {{ notification.title }}
              </p>
              <p class="text-dimmed line-clamp-1">
                {{ notification.message }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
