<script setup lang="ts">
import type { ChatChannel, ChatMessage } from '~/types'

const props = defineProps<{
  message: ChatMessage
  channels: ChatChannel[]
}>()

const emit = defineEmits<{
  'forward': [channelId: string]
  'close': []
}>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const query = ref('')
const selectedIndex = ref(0)
const forwarding = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const filteredChannels = computed(() => {
  const q = query.value.toLowerCase().trim()
  const list = q
    ? props.channels.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
      )
    : props.channels

  return list
    .sort((a, b) => {
      const aTime = a.last_message?.created_at || a.updated_at
      const bTime = b.last_message?.created_at || b.updated_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
    .slice(0, 15)
})

watch(filteredChannels, () => {
  selectedIndex.value = 0
})

function channelIcon(ch: ChatChannel): string {
  if (ch.type === 'dm') return 'i-lucide-user'
  if (ch.type === 'group_dm') return 'i-lucide-users'
  if (ch.is_private) return 'i-lucide-lock'
  return 'i-lucide-hash'
}

async function forwardTo(ch: ChatChannel) {
  forwarding.value = true
  try {
    await apiFetch(`/api/chat/channels/${ch.id}/messages/forward`, {
      method: 'POST',
      body: {
        originalChannelId: props.message.channel_id,
        originalMessageId: props.message.id,
        content: props.message.content,
        metadata: props.message.metadata
      }
    })
    toast.add({ title: `Forwarded to #${ch.name}`, color: 'success' })
    emit('forward', ch.id)
    emit('close')
  } catch {
    toast.add({ title: 'Failed to forward message', color: 'error' })
  } finally {
    forwarding.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % filteredChannels.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = selectedIndex.value === 0
      ? filteredChannels.value.length - 1
      : selectedIndex.value - 1
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const ch = filteredChannels.value[selectedIndex.value]
    if (ch) forwardTo(ch)
  }
}

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
})
</script>

<template>
  <div class="p-6">
    <h3 class="text-lg font-semibold mb-3">Forward Message</h3>

    <!-- Message preview -->
    <div class="mb-4 p-3 bg-elevated/50 rounded-lg border border-default">
      <div class="flex items-center gap-2 mb-1">
        <UAvatar :src="message.user_avatar || undefined" :alt="message.user_name" size="2xs" />
        <span class="text-xs font-semibold">{{ message.user_name }}</span>
      </div>
      <p class="text-sm text-muted line-clamp-3">{{ message.content }}</p>
      <div v-if="message.metadata?.attachments?.length" class="flex items-center gap-1 mt-1 text-xs text-muted">
        <UIcon name="i-lucide-paperclip" class="w-3 h-3" />
        {{ message.metadata.attachments.length }} attachment{{ message.metadata.attachments.length > 1 ? 's' : '' }}
      </div>
    </div>

    <!-- Search -->
    <div class="relative mb-3">
      <UIcon name="i-lucide-search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        placeholder="Search channels..."
        class="w-full pl-9 pr-4 py-2 text-sm bg-elevated border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        @keydown="handleKeydown"
      />
    </div>

    <!-- Channel list -->
    <div class="max-h-64 overflow-y-auto -mx-2">
      <button
        v-for="(ch, idx) in filteredChannels"
        :key="ch.id"
        :class="[
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors',
          idx === selectedIndex ? 'bg-primary/10' : 'hover:bg-elevated/80'
        ]"
        :disabled="forwarding"
        @click="forwardTo(ch)"
        @mouseenter="selectedIndex = idx"
      >
        <UIcon :name="channelIcon(ch)" class="w-4 h-4 text-muted shrink-0" />
        <span class="text-sm font-medium truncate flex-1">{{ ch.name }}</span>
        <UIcon v-if="forwarding && idx === selectedIndex" name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-muted" />
      </button>

      <p v-if="filteredChannels.length === 0" class="text-sm text-muted text-center py-6">
        No channels found
      </p>
    </div>

    <div class="flex justify-end mt-4">
      <UButton variant="ghost" color="neutral" @click="emit('close')">Cancel</UButton>
    </div>
  </div>
</template>
