<script setup lang="ts">
const { open: openHub } = useActivityHub()
const { unreadCount, fetchNotifications, connectToStream, disconnectFromStream } = useNotifications()
const { refreshUnreadCounts } = useChat()
const { isAuthenticated } = useAuth()

let chatPollInterval: ReturnType<typeof setInterval> | null = null

function startChatPoll() {
  if (chatPollInterval) return
  refreshUnreadCounts()
  chatPollInterval = setInterval(refreshUnreadCounts, 60_000)
}

function stopChatPoll() {
  if (chatPollInterval) {
    clearInterval(chatPollInterval)
    chatPollInterval = null
  }
}

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
    startChatPoll()
  }
})

// Clean up SSE connection and chat poll on unmount
onUnmounted(() => {
  disconnectFromStream()
  stopChatPoll()
})

// Watch for auth changes to connect/disconnect stream
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    connectToStream()
    startChatPoll()
  } else {
    disconnectFromStream()
    stopChatPoll()
  }
})
</script>

<template>
  <UTooltip text="Notifications" :shortcuts="['N']">
    <UButton
      color="neutral"
      variant="ghost"
      square
      @click="openHub('for-you')"
    >
      <UChip :color="unreadCount > 0 ? 'error' : 'neutral'" :show="unreadCount > 0" inset>
        <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
      </UChip>
    </UButton>
  </UTooltip>
</template>
