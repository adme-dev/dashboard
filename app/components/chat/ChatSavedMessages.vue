<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

const emit = defineEmits<{
  'close': []
  'select': [channelId: string, messageId: number]
  'unsave': [messageId: number]
}>()

interface SavedMessage {
  id: number
  messageId: number
  channelId: string
  note: string | null
  savedAt: string
  content: string
  metadata: any
  messageUserId: string
  messageUserName: string
  messageUserAvatar: string
  messageCreatedAt: string
  channelName: string
  channelType: string
  channelSlug: string
}

const saved = ref<SavedMessage[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    saved.value = await $fetch('/api/chat/saved') as SavedMessage[]
  } catch {
    // Silent
  } finally {
    loading.value = false
  }
})

async function handleUnsave(messageId: number) {
  const item = saved.value.find(s => s.messageId === messageId)
  if (!item) return
  try {
    await $fetch('/api/chat/saved', {
      method: 'POST',
      body: { messageId, channelId: item.channelId }
    })
    saved.value = saved.value.filter(s => s.messageId !== messageId)
    emit('unsave', messageId)
  } catch {
    // Silent
  }
}

function formatTime(date: string) {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  } catch {
    return ''
  }
}

function channelIcon(type: string) {
  if (type === 'dm') return 'i-lucide-user'
  if (type === 'group_dm') return 'i-lucide-users'
  return 'i-lucide-hash'
}

// Group by channel
const grouped = computed(() => {
  const map = new Map<string, { channelName: string; channelType: string; channelId: string; items: SavedMessage[] }>()
  for (const item of saved.value) {
    if (!map.has(item.channelId)) {
      map.set(item.channelId, {
        channelName: item.channelName,
        channelType: item.channelType,
        channelId: item.channelId,
        items: []
      })
    }
    map.get(item.channelId)!.items.push(item)
  }
  return [...map.values()]
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-3 border-b border-default">
      <UIcon name="i-lucide-bookmark" class="w-4.5 h-4.5 text-primary" />
      <h3 class="text-sm font-semibold flex-1">Saved Messages</h3>
      <UBadge v-if="saved.length > 0" :label="saved.length.toString()" size="xs" color="primary" variant="subtle" />
      <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="emit('close')" />
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="w-5 h-5 text-muted animate-spin" />
      </div>

      <div v-else-if="saved.length === 0" class="text-center text-sm text-muted py-8 px-4">
        <UIcon name="i-lucide-bookmark-x" class="w-8 h-8 mx-auto mb-2 text-muted/50" />
        <p>No saved messages</p>
        <p class="text-xs mt-1">Save important messages to find them quickly later.</p>
      </div>

      <div v-else>
        <div v-for="group in grouped" :key="group.channelId" class="mb-2">
          <!-- Channel header -->
          <div class="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-muted bg-elevated/25">
            <UIcon :name="channelIcon(group.channelType)" class="w-3 h-3" />
            {{ group.channelName }}
          </div>

          <!-- Saved messages in channel -->
          <div class="divide-y divide-default">
            <div
              v-for="item in group.items"
              :key="item.id"
              class="px-4 py-3 hover:bg-elevated/50 transition-colors group"
            >
              <!-- Author + time -->
              <div class="flex items-center gap-2 mb-1">
                <UAvatar :src="item.messageUserAvatar" :alt="item.messageUserName" size="xs" />
                <span class="text-sm font-semibold">{{ item.messageUserName }}</span>
                <span class="text-[11px] text-muted">{{ formatTime(item.messageCreatedAt) }}</span>
              </div>

              <!-- Content -->
              <button
                class="text-sm text-left line-clamp-3 whitespace-pre-wrap break-words w-full"
                @click="emit('select', item.channelId, item.messageId)"
              >
                {{ item.content }}
              </button>

              <!-- Note + actions -->
              <div class="flex items-center gap-2 mt-1.5">
                <span v-if="item.note" class="text-[11px] text-muted italic truncate max-w-48">
                  {{ item.note }}
                </span>
                <span class="text-[11px] text-muted">
                  Saved {{ formatTime(item.savedAt) }}
                </span>
                <UButton
                  label="Remove"
                  variant="link"
                  color="error"
                  size="xs"
                  class="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                  @click.stop="handleUnsave(item.messageId)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
