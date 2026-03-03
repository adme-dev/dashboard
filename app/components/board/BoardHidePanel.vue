<template>
  <div class="w-64 p-3">
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm font-medium text-gray-700 dark:text-neutral-200">Columns</span>
      <span class="text-xs text-gray-500 dark:text-neutral-400">{{ visibleCount }} of {{ (allColumns || []).length }} visible</span>
    </div>

    <div class="space-y-1 max-h-64 overflow-y-auto">
      <label
        v-for="col in allColumns"
        :key="col.id"
        class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer text-sm"
      >
        <UCheckbox
          :model-value="col.isVisible !== false"
          @update:model-value="$emit('toggleVisibility', col.id, !!$event)"
        />
        <span class="truncate" :class="col.isVisible === false ? 'text-gray-400 dark:text-neutral-500' : 'text-gray-700 dark:text-neutral-200'">
          {{ col.name }}
        </span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BoardColumn } from '~/composables/useBoardData'

const props = defineProps<{
  allColumns: BoardColumn[]
}>()

defineEmits<{
  toggleVisibility: [columnId: string, visible: boolean]
}>()

const visibleCount = computed(() => (props.allColumns || []).filter(c => c.isVisible !== false).length)
</script>
