<script setup lang="ts">
const props = defineProps<{
  boardId: string
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const feeds = ref<any[]>([])
const confirmRemove = ref<any | null>(null)
const removing = ref(false)
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const availableEvents = [
  { value: 'task_created', label: 'New item created', icon: 'i-lucide-plus-circle' },
  { value: 'status_changed', label: 'Status changes', icon: 'i-lucide-arrow-right-left' },
  { value: 'task_updated', label: 'Item updated', icon: 'i-lucide-pencil' },
  { value: 'cell_updated', label: 'Column values changed', icon: 'i-lucide-grid-3x3' },
  { value: 'task_deleted', label: 'Item deleted', icon: 'i-lucide-trash-2' },
]

async function fetchFeeds() {
  loading.value = true
  try {
    feeds.value = await apiFetch<any[]>(`/api/chat/board-feeds/${props.boardId}`)
  } catch {
    feeds.value = []
  } finally {
    loading.value = false
  }
}

async function createFeed() {
  saving.value = true
  try {
    const feed = await apiFetch<any>(`/api/chat/board-feeds/${props.boardId}`, {
      method: 'POST',
      body: {
        createChannel: true,
        eventTypes: ['task_created', 'status_changed']
      }
    })
    feeds.value.unshift({
      ...feed,
      channel_name: `Board Updates`,
      channel_slug: ''
    })
    // Re-fetch to get channel name
    await fetchFeeds()
    toast.add({ title: 'Chat feed created', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to create feed', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function toggleFeedActive(feed: any) {
  try {
    await apiFetch(`/api/chat/board-feeds/${props.boardId}/${feed.id}`, {
      method: 'PATCH',
      body: { isActive: !feed.is_active }
    })
    feed.is_active = !feed.is_active
    toast.add({ title: feed.is_active ? 'Feed enabled' : 'Feed paused', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to update feed', color: 'error' })
  }
}

async function toggleEventType(feed: any, eventType: string) {
  const types: string[] = [...(feed.event_types || [])]
  const idx = types.indexOf(eventType)
  if (idx >= 0) {
    types.splice(idx, 1)
  } else {
    types.push(eventType)
  }

  try {
    await apiFetch(`/api/chat/board-feeds/${props.boardId}/${feed.id}`, {
      method: 'PATCH',
      body: { eventTypes: types }
    })
    feed.event_types = types
  } catch {
    toast.add({ title: 'Failed to update events', color: 'error' })
  }
}

function openChannel(channelId: string) {
  navigateTo(`/agency/chat?channel=${channelId}`)
}

async function removeFeed(feed: any) {
  removing.value = true
  try {
    await apiFetch(`/api/chat/board-feeds/${props.boardId}/${feed.id}`, {
      method: 'DELETE'
    })
    feeds.value = feeds.value.filter(f => f.id !== feed.id)
    confirmRemove.value = null
    toast.add({ title: 'Chat feed removed', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to remove feed', color: 'error' })
  } finally {
    removing.value = false
  }
}

watch(() => props.open, (open) => {
  if (open) fetchFeeds()
})
</script>

<template>
  <UModal :open="open" @update:open="emit('update:open', $event)">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-radio" class="w-5 h-5 text-primary" />
        <h3 class="font-semibold">Chat Feed Settings</h3>
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Link a chat channel to this board to automatically post activity updates.
        </p>

        <!-- Loading -->
        <div v-if="loading" class="text-sm text-muted text-center py-4">Loading...</div>

        <template v-else>
          <!-- No feeds -->
          <div v-if="feeds.length === 0" class="text-center py-6">
            <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <UIcon name="i-lucide-rss" class="w-6 h-6 text-primary" />
            </div>
            <p class="text-sm text-muted mb-4">No chat feed linked yet.</p>
            <UButton
              label="Create Chat Feed"
              icon="i-lucide-plus"
              color="primary"
              :loading="saving"
              @click="createFeed"
            />
          </div>

          <!-- Feed cards -->
          <div v-for="feed in feeds" :key="feed.id" class="border border-default rounded-lg p-4 space-y-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-hash" class="w-4 h-4 text-muted" />
              <span class="text-sm font-medium flex-1">{{ feed.channel_name }}</span>
              <UBadge
                :label="feed.is_active ? 'Active' : 'Paused'"
                :color="feed.is_active ? 'success' : 'neutral'"
                variant="subtle"
                size="xs"
              />
            </div>

            <!-- Event type toggles -->
            <div class="space-y-1">
              <p class="text-xs font-medium text-muted uppercase tracking-wide">Events to post</p>
              <div
                v-for="ev in availableEvents"
                :key="ev.value"
                class="flex items-center gap-2.5 py-1"
              >
                <UCheckbox
                  :model-value="(feed.event_types || []).includes(ev.value)"
                  @update:model-value="toggleEventType(feed, ev.value)"
                />
                <UIcon :name="ev.icon" class="w-4 h-4 text-muted" />
                <span class="text-sm">{{ ev.label }}</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 pt-1 border-t border-default">
              <UButton
                :label="feed.is_active ? 'Pause' : 'Resume'"
                :icon="feed.is_active ? 'i-lucide-pause' : 'i-lucide-play'"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="toggleFeedActive(feed)"
              />
              <UButton
                label="Open Channel"
                icon="i-lucide-external-link"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="openChannel(feed.channel_id)"
              />
              <UButton
                label="Remove"
                icon="i-lucide-trash-2"
                variant="ghost"
                color="error"
                size="xs"
                class="ml-auto"
                @click="confirmRemove = feed"
              />
            </div>
          </div>

          <!-- Add another feed -->
          <div v-if="feeds.length > 0">
            <UButton
              label="Add Another Feed"
              icon="i-lucide-plus"
              variant="ghost"
              color="neutral"
              size="sm"
              :loading="saving"
              @click="createFeed"
            />
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end">
        <UButton variant="ghost" color="neutral" @click="emit('update:open', false)">
          Close
        </UButton>
      </div>
    </template>
  </UModal>

  <UModal :open="!!confirmRemove" @update:open="(v) => { if (!v) confirmRemove = null }">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-trash-2" class="w-5 h-5 text-error" />
        <h3 class="font-semibold">Remove chat feed?</h3>
      </div>
    </template>
    <template #body>
      <p class="text-sm text-muted">
        This unlinks <span class="font-medium text-default">#{{ confirmRemove?.channel_name }}</span>
        from this board. Posted activity updates will stop, but the chat channel and its messages are kept.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="confirmRemove = null">Cancel</UButton>
        <UButton color="error" :loading="removing" @click="removeFeed(confirmRemove)">
          Remove
        </UButton>
      </div>
    </template>
  </UModal>
</template>
