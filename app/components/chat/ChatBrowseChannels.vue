<script setup lang="ts">
const emit = defineEmits<{
  'close': []
  'joined': [channel: any]
}>()

const toast = useToast()
const search = ref('')
const loading = ref(false)
const joining = ref<string | null>(null)
const channels = ref<any[]>([])

async function fetchBrowsable() {
  loading.value = true
  try {
    channels.value = await $fetch<any[]>('/api/chat/channels/browse', {
      params: { search: search.value || undefined, limit: 50 }
    })
  } catch {
    toast.add({ title: 'Failed to load channels', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function handleJoin(channel: any) {
  joining.value = channel.id
  try {
    const joined = await $fetch(`/api/chat/channels/${channel.id}/join`, {
      method: 'POST'
    })
    toast.add({ title: `Joined #${channel.name}`, color: 'success' })
    // Remove from browse list
    channels.value = channels.value.filter(c => c.id !== channel.id)
    emit('joined', joined)
  } catch {
    toast.add({ title: 'Failed to join channel', color: 'error' })
  } finally {
    joining.value = null
  }
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(fetchBrowsable, 300)
})

onMounted(fetchBrowsable)
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold">Browse Channels</h3>
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="emit('close')"
      />
    </div>

    <p class="text-sm text-muted mb-4">
      Discover and join public channels in your workspace.
    </p>

    <UInput
      v-model="search"
      placeholder="Search channels..."
      icon="i-lucide-search"
      size="sm"
      class="mb-4"
    />

    <!-- Loading -->
    <div v-if="loading && channels.length === 0" class="text-center text-sm text-muted py-8">
      Loading channels...
    </div>

    <!-- Channel list -->
    <div v-else-if="channels.length > 0" class="space-y-1 max-h-96 overflow-y-auto">
      <div
        v-for="ch in channels"
        :key="ch.id"
        class="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-elevated/80 transition-colors"
      >
        <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <UIcon name="i-lucide-hash" class="w-4 h-4 text-primary" />
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold truncate">{{ ch.name }}</span>
          </div>
          <p v-if="ch.description" class="text-xs text-muted line-clamp-2 mt-0.5">
            {{ ch.description }}
          </p>
          <div class="flex items-center gap-3 mt-1 text-xs text-muted">
            <span class="flex items-center gap-1">
              <UIcon name="i-lucide-users" class="w-3 h-3" />
              {{ ch.member_count }} {{ ch.member_count === 1 ? 'member' : 'members' }}
            </span>
            <span v-if="ch.message_count > 0" class="flex items-center gap-1">
              <UIcon name="i-lucide-message-square" class="w-3 h-3" />
              {{ ch.message_count }} messages
            </span>
          </div>
        </div>

        <UButton
          label="Join"
          size="xs"
          color="primary"
          variant="soft"
          :loading="joining === ch.id"
          class="shrink-0 mt-1"
          @click="handleJoin(ch)"
        />
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="text-center py-8">
      <UIcon name="i-lucide-search-x" class="w-8 h-8 text-muted mx-auto mb-2" />
      <p class="text-sm text-muted">
        {{ search ? 'No matching channels found' : 'No public channels to join' }}
      </p>
      <p class="text-xs text-muted mt-1">
        All public channels are already in your sidebar.
      </p>
    </div>
  </div>
</template>
