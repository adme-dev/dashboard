<template>
  <div class="bg-white border-b px-4 py-2 flex items-center gap-2">
    <!-- Filter -->
    <UPopover>
      <UButton variant="ghost" size="sm" icon="i-lucide-filter">
        Filter
        <UBadge v-if="filters.length" size="xs" color="primary" class="ml-1">{{ filters.length }}</UBadge>
      </UButton>
      <template #content>
        <BoardFilterPanel v-model="filters" :columns="columns" />
      </template>
    </UPopover>

    <!-- Sort -->
    <UPopover>
      <UButton variant="ghost" size="sm" icon="i-lucide-arrow-up-down">
        Sort
        <UBadge v-if="sortRules.length" size="xs" color="primary" class="ml-1">{{ sortRules.length }}</UBadge>
      </UButton>
      <template #content>
        <BoardSortPanel v-model="sortRules" :columns="columns" />
      </template>
    </UPopover>

    <!-- Hide -->
    <UPopover>
      <UButton variant="ghost" size="sm" icon="i-lucide-eye">
        Hide
        <UBadge v-if="hiddenCount > 0" size="xs" color="neutral" class="ml-1">{{ hiddenCount }}</UBadge>
      </UButton>
      <template #content>
        <BoardHidePanel :all-columns="allColumns" @toggle-visibility="(colId: string, vis: boolean) => $emit('toggleColumnVisibility', colId, vis)" />
      </template>
    </UPopover>

    <!-- Group -->
    <UPopover>
      <UButton variant="ghost" size="sm" icon="i-lucide-layers">
        Group
        <UBadge v-if="groupByColumnId" size="xs" color="primary" class="ml-1">1</UBadge>
      </UButton>
      <template #content>
        <BoardGroupPanel v-model="groupByColumnId" :columns="columns" />
      </template>
    </UPopover>

    <div class="flex-1" />

    <UButton variant="ghost" size="sm" icon="i-lucide-download" @click="$emit('export')">Export</UButton>
    <UButton variant="ghost" size="sm" icon="i-lucide-layout-template" @click="$emit('template')">Templates</UButton>
    <UButton variant="ghost" size="sm" icon="i-lucide-zap" @click="$emit('automations')">Automations</UButton>
    <UButton variant="ghost" size="sm" icon="i-lucide-radio" @click="$emit('chatFeed')">Chat Feed</UButton>
    <div class="w-px h-5 bg-gray-200" />
    <UButton variant="ghost" size="sm" icon="i-lucide-folder-plus" @click="$emit('addGroup')">Add Group</UButton>
    <UButton variant="ghost" size="sm" icon="i-lucide-plus" @click="$emit('addColumn')">Add Column</UButton>
  </div>
</template>

<script setup lang="ts">
import type { BoardColumn, FilterRule, SortRule } from '~/composables/useBoardData'
import BoardFilterPanel from '~/components/board/BoardFilterPanel.vue'
import BoardSortPanel from '~/components/board/BoardSortPanel.vue'
import BoardHidePanel from '~/components/board/BoardHidePanel.vue'
import BoardGroupPanel from '~/components/board/BoardGroupPanel.vue'

const props = defineProps<{
  columns: BoardColumn[]
  allColumns: BoardColumn[]
  boardId: string
}>()

defineEmits<{
  export: []
  template: []
  automations: []
  chatFeed: []
  addGroup: []
  addColumn: []
  toggleColumnVisibility: [columnId: string, visible: boolean]
}>()

const filters = defineModel<FilterRule[]>('filters', { default: () => [] })
const sortRules = defineModel<SortRule[]>('sortRules', { default: () => [] })
const groupByColumnId = defineModel<string | null>('groupByColumnId', { default: null })

const hiddenCount = computed(() => (props.allColumns || []).filter(c => c.isVisible === false).length)
</script>
