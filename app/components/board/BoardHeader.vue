<template>
  <div class="bg-white border-b px-4 py-3">
    <div class="flex items-center justify-between">
      <div>
        <UBreadcrumb class="mb-2" :items="[
          { label: 'Boards', icon: 'i-lucide-layout-grid', to: '/agency/boards' },
          { label: boardName, icon: 'i-lucide-columns-3' }
        ]" />
        <h1 class="text-xl font-semibold">{{ boardName }}</h1>
        <p class="text-sm text-gray-500 mt-1">
          {{ totalItems }} items
          <span v-if="lastUpdated">· Last updated {{ formatRelativeTime(lastUpdated) }}</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <!-- View Switcher -->
        <div class="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button
            v-for="v in views"
            :key="v.id"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            :class="activeView === v.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'"
            @click="$emit('update:activeView', v.id)"
          >
            <UIcon :name="v.icon" class="w-4 h-4" />
            <span class="hidden sm:inline">{{ v.label }}</span>
          </button>
        </div>
        <UInput
          :model-value="searchQuery"
          icon="i-lucide-search"
          placeholder="Search items..."
          class="w-64"
          @update:model-value="$emit('update:searchQuery', $event)"
        />
        <UButton color="primary" icon="i-lucide-plus" @click="$emit('newItem')">
          New Item
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BoardViewType } from '~/composables/useBoardData'

defineProps<{
  boardName: string
  totalItems: number
  lastUpdated?: string
  activeView: BoardViewType
  searchQuery: string
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
