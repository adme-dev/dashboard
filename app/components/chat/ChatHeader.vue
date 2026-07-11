<script setup lang="ts">
import type { ChatChannel } from '~/types'

const props = defineProps<{
  channel: ChatChannel | null
  activeUsers?: ReadonlyArray<{ userId: string; userName: string; userAvatar?: string }>
  isConnected?: boolean
}>()

const emit = defineEmits<{
  'toggle-sidebar': []
  'open-members': []
  'open-thread': []
  'open-settings': []
  'open-search': []
  'open-pins': []
  'open-saved': []
}>()

const onlineCount = computed(() => props.activeUsers?.length || 0)

const channelIcon = computed(() => {
  if (!props.channel) return 'i-lucide-message-circle'
  if (props.channel.type === 'dm') return 'i-lucide-user'
  if (props.channel.type === 'group_dm') return 'i-lucide-users'
  if (props.channel.is_private) return 'i-lucide-lock'
  return 'i-lucide-hash'
})
</script>

<template>
  <div class="flex items-center gap-3 px-4 py-2.5 border-b border-default bg-elevated/25">
    <!-- Mobile sidebar toggle -->
    <UButton
      icon="i-lucide-panel-left-open"
      variant="ghost"
      color="neutral"
      size="sm"
      class="md:hidden"
      @click="emit('toggle-sidebar')"
    />

    <!-- Channel info -->
    <div v-if="channel" class="flex items-center gap-2 flex-1 min-w-0">
      <UIcon :name="channelIcon" class="w-4.5 h-4.5 text-muted shrink-0" />
      <div class="min-w-0">
        <h2 class="text-sm font-semibold truncate">{{ channel.name }}</h2>
        <p v-if="channel.description" class="text-xs text-muted truncate">{{ channel.description }}</p>
      </div>
    </div>
    <div v-else class="flex-1">
      <span class="text-sm text-muted">Select a channel</span>
    </div>

    <!-- Status + Actions -->
    <div v-if="channel" class="flex items-center gap-1.5 shrink-0">
      <!-- Connection indicator -->
      <UTooltip :text="isConnected ? 'Connected' : 'Connecting...'">
        <span
          :class="[
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-green-500' : 'bg-amber-500 animate-pulse'
          ]"
        />
      </UTooltip>

      <!-- Online count -->
      <UTooltip v-if="onlineCount > 0" :text="`${onlineCount} online`">
        <button
          class="flex items-center gap-1 text-xs text-muted hover:text-default px-1.5 py-1 rounded"
          @click="emit('open-members')"
        >
          <UIcon name="i-lucide-users" class="w-3.5 h-3.5" />
          {{ onlineCount }}
        </button>
      </UTooltip>

      <!-- Saved messages -->
      <UTooltip text="Saved messages">
        <UButton
          icon="i-lucide-bookmark"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="emit('open-saved')"
        />
      </UTooltip>

      <!-- Pinned messages -->
      <UTooltip text="Pinned messages">
        <UButton
          icon="i-lucide-pin"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="emit('open-pins')"
        />
      </UTooltip>

      <!-- Search -->
      <UTooltip text="Search messages">
        <UButton
          icon="i-lucide-search"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="emit('open-search')"
        />
      </UTooltip>

      <!-- Members -->
      <UTooltip text="Members">
        <UButton
          icon="i-lucide-users"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="emit('open-members')"
        />
      </UTooltip>

      <!-- Settings -->
      <UTooltip v-if="channel.type === 'channel'" text="Channel settings">
        <UButton
          icon="i-lucide-settings"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="emit('open-settings')"
        />
      </UTooltip>
    </div>
  </div>
</template>
