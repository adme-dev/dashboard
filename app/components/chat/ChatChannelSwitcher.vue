<script setup lang="ts">
import type { ChatChannel } from '~/types'

const props = defineProps<{
  channels: ChatChannel[]
  activeChannelId?: string
}>()

const emit = defineEmits<{
  'select': [channel: ChatChannel]
  'close': []
}>()

const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

// Recent channels (last 5 used, excluding active)
const recentChannels = computed(() =>
  props.channels
    .filter(c => c.id !== props.activeChannelId && c.last_message)
    .sort((a, b) => {
      const aTime = a.last_message?.created_at || a.updated_at
      const bTime = b.last_message?.created_at || b.updated_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })
    .slice(0, 5)
)

const filteredChannels = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return recentChannels.value

  return props.channels
    .filter(c => {
      const name = c.name.toLowerCase()
      const desc = (c.description || '').toLowerCase()
      return name.includes(q) || desc.includes(q)
    })
    .sort((a, b) => {
      // Exact prefix match first
      const aPrefix = a.name.toLowerCase().startsWith(q)
      const bPrefix = b.name.toLowerCase().startsWith(q)
      if (aPrefix && !bPrefix) return -1
      if (!aPrefix && bPrefix) return 1
      return a.name.localeCompare(b.name)
    })
    .slice(0, 12)
})

// Reset selection when results change
watch(filteredChannels, () => {
  selectedIndex.value = 0
})

function channelIcon(ch: ChatChannel): string {
  if (ch.type === 'dm') return 'i-lucide-user'
  if (ch.type === 'group_dm') return 'i-lucide-users'
  if (ch.is_private) return 'i-lucide-lock'
  return 'i-lucide-hash'
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
    if (ch) {
      emit('select', ch)
      emit('close')
    }
  } else if (e.key === 'Escape') {
    emit('close')
  }
}

function handleSelect(ch: ChatChannel) {
  emit('select', ch)
  emit('close')
}

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
})
</script>

<template>
  <div class="p-0">
    <!-- Search input -->
    <div class="px-4 pt-4 pb-2">
      <div class="relative">
        <UIcon name="i-lucide-search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="Switch to channel..."
          class="w-full pl-9 pr-4 py-2.5 text-sm bg-elevated border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          @keydown="handleKeydown"
        />
        <kbd class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted font-mono bg-default/50 px-1.5 py-0.5 rounded">esc</kbd>
      </div>
    </div>

    <!-- Results -->
    <div class="max-h-80 overflow-y-auto px-2 pb-3">
      <p v-if="!query" class="text-[11px] font-medium text-muted uppercase tracking-wide px-2 py-1.5">
        Recent
      </p>
      <p v-else-if="filteredChannels.length === 0" class="text-sm text-muted text-center py-6">
        No channels found
      </p>

      <button
        v-for="(ch, idx) in filteredChannels"
        :key="ch.id"
        :class="[
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors',
          idx === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-elevated/80'
        ]"
        @click="handleSelect(ch)"
        @mouseenter="selectedIndex = idx"
      >
        <UIcon
          :name="channelIcon(ch)"
          class="w-4 h-4 shrink-0"
          :class="idx === selectedIndex ? 'text-primary' : 'text-muted'"
        />
        <div class="flex-1 min-w-0">
          <span class="text-sm font-medium truncate block">{{ ch.name }}</span>
          <span v-if="ch.description" class="text-xs text-muted truncate block">{{ ch.description }}</span>
        </div>
        <UBadge
          v-if="(ch.unread_count || 0) > 0"
          :label="String(ch.unread_count)"
          size="xs"
          color="primary"
        />
        <span
          v-if="ch.type !== 'channel'"
          class="text-[10px] text-muted capitalize"
        >
          {{ ch.type === 'dm' ? 'DM' : 'Group' }}
        </span>
      </button>
    </div>

    <!-- Footer hint -->
    <div class="border-t border-default px-4 py-2 flex items-center gap-3 text-[10px] text-muted">
      <span><kbd class="font-mono bg-default/50 px-1 rounded">↑↓</kbd> navigate</span>
      <span><kbd class="font-mono bg-default/50 px-1 rounded">↵</kbd> select</span>
      <span><kbd class="font-mono bg-default/50 px-1 rounded">esc</kbd> close</span>
    </div>
  </div>
</template>
