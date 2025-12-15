<script setup lang="ts">
const { isNotificationsSlideoverOpen } = useDashboard()
const { unreadCount, fetchNotifications } = useNotifications()
const { isAuthenticated } = useAuth()

// Fetch unread count on mount for authenticated users
onMounted(async () => {
  if (isAuthenticated.value) {
    try {
      await fetchNotifications({ unreadOnly: true })
    } catch {
      // Silently fail - user might not be authenticated
    }
  }
})
</script>

<template>
  <UTooltip text="Notifications" :shortcuts="['N']">
    <UButton
      color="neutral"
      variant="ghost"
      square
      @click="isNotificationsSlideoverOpen = true"
    >
      <UChip :color="unreadCount > 0 ? 'error' : 'neutral'" :show="unreadCount > 0" inset>
        <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
      </UChip>
    </UButton>
  </UTooltip>
</template>
