<script setup lang="ts">
import type { ActivityHubTab } from '~/composables/useActivityHub'

const { activeTab } = useActivityHub()
const { unreadCount } = useNotifications()
const { totalUnreadCount: chatUnreadCount } = useChat()

const tabs: { key: ActivityHubTab; icon: string; label: string }[] = [
  { key: 'feed', icon: 'i-lucide-rss', label: 'Feed' },
  { key: 'for-you', icon: 'i-lucide-bell', label: 'For You' },
  { key: 'incoming', icon: 'i-lucide-inbox', label: 'Incoming' },
  { key: 'ai', icon: 'i-lucide-sparkles', label: 'AI' },
]

function getBadge(key: ActivityHubTab): number {
  if (key === 'for-you') return unreadCount.value
  if (key === 'feed') return chatUnreadCount.value
  return 0
}
</script>

<template>
  <div class="flex border-b border-default">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors cursor-pointer"
      :class="[
        activeTab === tab.key
          ? 'text-primary border-b-2 border-primary'
          : 'text-muted hover:text-default',
      ]"
      @click="activeTab = tab.key"
    >
      <UIcon :name="tab.icon" class="w-3.5 h-3.5" />
      <span>{{ tab.label }}</span>
      <UBadge
        v-if="getBadge(tab.key) > 0"
        :label="String(getBadge(tab.key))"
        color="error"
        size="xs"
      />
    </button>
  </div>
</template>
