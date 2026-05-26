<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

const emit = defineEmits<{
  'close': []
  'select': [channelId: string, messageId?: number]
}>()

const searchQuery = ref('')
const results = ref<any[]>([])
const loading = ref(false)
const searched = ref(false)
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)

function handleInput() {
  if (debounceTimer.value) clearTimeout(debounceTimer.value)
  if (searchQuery.value.trim().length < 2) {
    results.value = []
    searched.value = false
    return
  }
  debounceTimer.value = setTimeout(() => {
    performSearch()
  }, 300)
}

async function performSearch() {
  const q = searchQuery.value.trim()
  if (q.length < 2) return

  loading.value = true
  searched.value = true
  try {
    results.value = await $fetch('/api/chat/search', {
      params: { q, limit: 25 }
    }) as any[]
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}

function handleSelect(result: any) {
  emit('select', result.channel_id, result.id)
}

function formatTime(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

function getChannelIcon(type: string) {
  if (type === 'dm') return 'i-lucide-user'
  return 'i-lucide-hash'
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-3 border-b border-default">
      <UIcon name="i-lucide-search" class="w-4.5 h-4.5 text-primary" />
      <h3 class="text-sm font-semibold flex-1">Search Messages</h3>
      <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="emit('close')" />
    </div>

    <!-- Search Input -->
    <div class="px-4 py-3 border-b border-default">
      <UInput
        v-model="searchQuery"
        placeholder="Search messages..."
        icon="i-lucide-search"
        autofocus
        @input="handleInput"
        @keydown.enter="performSearch"
      />
    </div>

    <!-- Results -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading" class="flex justify-center py-8">
        <XfLoader size="sm" />
      </div>

      <div v-else-if="searched && results.length === 0" class="text-center text-sm text-muted py-8">
        No messages found
      </div>

      <div v-else-if="!searched" class="text-center text-sm text-muted py-8">
        Type at least 2 characters to search
      </div>

      <div v-else class="divide-y divide-default">
        <button
          v-for="result in results"
          :key="result.id"
          class="w-full text-left px-4 py-3 hover:bg-elevated/50 transition-colors"
          @click="handleSelect(result)"
        >
          <div class="flex items-center gap-2 mb-1">
            <UIcon :name="getChannelIcon(result.channel_type)" class="w-3.5 h-3.5 text-muted" />
            <span class="text-xs font-medium text-muted">{{ result.channel_name }}</span>
            <span class="text-[11px] text-muted ml-auto">{{ formatTime(result.created_at) }}</span>
          </div>

          <div class="flex items-start gap-2">
            <UAvatar :src="result.user_avatar || undefined" :alt="result.user_name" size="xs" class="shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium">{{ result.user_name }}</span>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <p class="text-sm text-muted line-clamp-2" v-html="result.highlight || result.content" />
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
