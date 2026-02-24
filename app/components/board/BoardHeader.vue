<template>
  <div class="bg-white border-b">
    <!-- Row 1: Breadcrumb + title + actions -->
    <div class="flex items-center justify-between px-4 pt-3 pb-2">
      <div class="min-w-0">
        <UBreadcrumb :items="[
          { label: 'Boards', icon: 'i-lucide-layout-grid', to: '/agency/boards' },
          { label: boardName, icon: 'i-lucide-columns-3' }
        ]" />
        <div class="flex items-center gap-3 mt-1">
          <h1 class="text-lg font-semibold truncate">{{ boardName }}</h1>
          <span class="text-xs text-gray-400 whitespace-nowrap">
            {{ totalItems }} items
            <span v-if="lastUpdated">· {{ formatRelativeTime(lastUpdated) }}</span>
          </span>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <!-- Subscribe Button -->
        <UPopover>
          <UButton
            :icon="isSubscribed ? 'i-lucide-bell-ring' : 'i-lucide-bell'"
            :variant="isSubscribed ? 'soft' : 'ghost'"
            :color="isSubscribed ? 'primary' : 'neutral'"
            size="sm"
          >
            {{ isSubscribed ? 'Watching' : 'Watch' }}
          </UButton>
          <template #content>
            <div class="p-3 w-64 space-y-2">
              <p class="text-sm font-medium">Board Notifications</p>
              <div
                v-for="opt in subscribeOptions"
                :key="opt.value"
                class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-elevated/50 cursor-pointer text-sm"
                @click="handleSubscribe(opt.value)"
              >
                <UIcon :name="opt.icon" class="w-4 h-4" />
                <span>{{ opt.label }}</span>
                <UIcon v-if="subscriptionLevel === opt.value" name="i-lucide-check" class="w-4 h-4 ml-auto text-primary" />
              </div>
            </div>
          </template>
        </UPopover>

        <UButton color="primary" icon="i-lucide-plus" size="sm" @click="$emit('newItem')">
          New Item
        </UButton>
      </div>
    </div>

    <!-- Row 2: View switcher + search -->
    <div class="flex items-center justify-between px-4 pb-2">
      <!-- View Switcher -->
      <div class="flex items-center gap-0.5">
        <button
          v-for="v in views"
          :key="v.id"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors"
          :class="activeView === v.id
            ? 'bg-gray-100 text-gray-900'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'"
          @click="$emit('update:activeView', v.id)"
        >
          <UIcon :name="v.icon" class="w-4 h-4" />
          <span class="hidden sm:inline">{{ v.label }}</span>
        </button>
      </div>
      <UInput
        :model-value="searchQuery"
        icon="i-lucide-search"
        placeholder="Search Items..."
        size="sm"
        class="w-52"
        @update:model-value="$emit('update:searchQuery', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BoardViewType } from '~/composables/useBoardData'

const props = defineProps<{
  boardName: string
  totalItems: number
  lastUpdated?: string
  activeView: BoardViewType
  searchQuery: string
  boardId: string
}>()

defineEmits<{
  'update:activeView': [view: BoardViewType]
  'update:searchQuery': [query: string]
  newItem: []
}>()

const views: { id: BoardViewType; label: string; icon: string }[] = [
  { id: 'table', label: 'Table', icon: 'i-lucide-table-2' },
  { id: 'kanban', label: 'Kanban', icon: 'i-lucide-kanban' },
  { id: 'timeline', label: 'Timeline', icon: 'i-lucide-gantt-chart' },
  { id: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar' },
  { id: 'list', label: 'List', icon: 'i-lucide-list' },
  { id: 'gallery', label: 'Gallery', icon: 'i-lucide-layout-grid' },
]

// Subscription state
const isSubscribed = ref(false)
const subscriptionLevel = ref<string | null>(null)

const subscribeOptions = [
  { value: 'all', label: 'All activity', icon: 'i-lucide-bell-ring' },
  { value: 'mentions', label: 'Mentions only', icon: 'i-lucide-at-sign' },
  { value: 'muted', label: 'Muted', icon: 'i-lucide-bell-off' },
]

// Check subscription status on mount
onMounted(async () => {
  try {
    const { subscriptions } = await $fetch<{ subscriptions: any[] }>(`/api/agency/boards/${props.boardId}/subscriptions`)
    const boardSub = subscriptions.find((s: any) => !s.itemId && !s.columnId)
    if (boardSub) {
      isSubscribed.value = true
      subscriptionLevel.value = boardSub.isMuted ? 'muted' :
        (boardSub.events?.length ? 'mentions' : 'all')
    }
  } catch {
    // Silently fail — subscription check is non-critical
  }
})

async function handleSubscribe(level: string) {
  try {
    if (level === subscriptionLevel.value) {
      // Unsubscribe
      await $fetch(`/api/agency/boards/${props.boardId}/unsubscribe`, { method: 'DELETE' })
      isSubscribed.value = false
      subscriptionLevel.value = null
    } else {
      const events = level === 'mentions' ? ['task_mentioned'] : []
      const isMuted = level === 'muted'
      await $fetch(`/api/agency/boards/${props.boardId}/subscribe`, {
        method: 'POST',
        body: { events, notifyInapp: !isMuted, notifyEmail: false },
      })
      isSubscribed.value = true
      subscriptionLevel.value = level
    }
  } catch (err) {
    console.error('Subscribe failed:', err)
  }
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
</script>
