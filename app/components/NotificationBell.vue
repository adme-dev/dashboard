<script setup lang="ts">
const { isNotificationsSlideoverOpen } = useDashboard()
const { unreadCount, fetchNotifications, connectToStream, disconnectFromStream } = useNotifications()
const { isAuthenticated } = useAuth()

// Fetch unread count and connect to real-time stream for authenticated users
onMounted(async () => {
  if (isAuthenticated.value) {
    try {
      await fetchNotifications({ unreadOnly: true })
      // Connect to real-time notifications stream
      connectToStream()
    } catch {
      // Silently fail - user might not be authenticated
    }
  }
})

// Clean up SSE connection on unmount
onUnmounted(() => {
  disconnectFromStream()
})

// Watch for auth changes to connect/disconnect stream
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    connectToStream()
  } else {
    disconnectFromStream()
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
