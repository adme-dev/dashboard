<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

const props = defineProps<{
  channelId: string
}>()

const emit = defineEmits<{
  'close': []
  'unpin': [messageId: number]
  'select': [messageId: number]
}>()

const pins = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    pins.value = await $fetch(`/api/chat/channels/${props.channelId}/pins`) as any[]
  } catch {
    // Silent
  } finally {
    loading.value = false
  }
})

async function handleUnpin(messageId: number) {
  try {
    await $fetch(`/api/chat/channels/${props.channelId}/messages/${messageId}/pin`, {
      method: 'PATCH'
    })
    pins.value = pins.value.filter(p => p.id !== messageId)
    emit('unpin', messageId)
  } catch {
    // Silent
  }
}

function formatTime(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-3 border-b border-default">
      <UIcon name="i-lucide-pin" class="w-4.5 h-4.5 text-primary" />
      <h3 class="text-sm font-semibold flex-1">Pinned Messages</h3>
      <UBadge v-if="pins.length > 0" :label="pins.length.toString()" size="xs" color="primary" variant="subtle" />
      <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="emit('close')" />
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="w-5 h-5 text-muted animate-spin" />
      </div>

      <div v-else-if="pins.length === 0" class="text-center text-sm text-muted py-8 px-4">
        <UIcon name="i-lucide-pin-off" class="w-8 h-8 mx-auto mb-2 text-muted/50" />
        <p>No pinned messages</p>
        <p class="text-xs mt-1">Pin important messages to keep them accessible.</p>
      </div>

      <div v-else class="divide-y divide-default">
        <div
          v-for="pin in pins"
          :key="pin.id"
          class="px-4 py-3 hover:bg-elevated/50 transition-colors group"
        >
          <!-- Author + time -->
          <div class="flex items-center gap-2 mb-1">
            <UAvatar :src="pin.user_avatar" :alt="pin.user_name" size="xs" />
            <span class="text-sm font-semibold">{{ pin.user_name }}</span>
            <span class="text-[11px] text-muted">{{ formatTime(pin.created_at) }}</span>
          </div>

          <!-- Content (truncated) -->
          <button
            class="text-sm text-left line-clamp-3 whitespace-pre-wrap break-words w-full"
            @click="emit('select', pin.id)"
          >
            {{ pin.content }}
          </button>

          <!-- Pinned by + actions -->
          <div class="flex items-center gap-2 mt-1.5">
            <span class="text-[11px] text-muted">
              Pinned by {{ pin.pinned_by_name }} {{ formatTime(pin.pinned_at) }}
            </span>
            <UButton
              label="Unpin"
              variant="link"
              color="error"
              size="xs"
              class="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
              @click.stop="handleUnpin(pin.id)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
