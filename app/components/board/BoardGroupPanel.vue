<template>
  <div class="w-64 p-3">
    <div class="mb-3">
      <span class="text-sm font-medium text-gray-700 dark:text-neutral-200">Group by</span>
    </div>

    <div class="space-y-1 max-h-64 overflow-y-auto">
      <label
        class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer text-sm"
        :class="{ 'bg-blue-50 dark:bg-blue-950': !modelValue }"
      >
        <input
          type="radio"
          :checked="!modelValue"
          name="group-by"
          class="text-blue-600"
          @change="modelValue = null"
        />
        <span class="text-gray-700 dark:text-neutral-200">None (default groups)</span>
      </label>

      <label
        v-for="col in eligibleColumns"
        :key="col.id"
        class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer text-sm"
        :class="{ 'bg-blue-50 dark:bg-blue-950': modelValue === col.id }"
      >
        <input
          type="radio"
          :checked="modelValue === col.id"
          name="group-by"
          class="text-blue-600"
          @change="modelValue = col.id"
        />
        <span class="text-gray-700 dark:text-neutral-200">{{ col.name }}</span>
        <span class="ml-auto text-xs text-gray-400 dark:text-neutral-500">{{ columnTypeLabel(col) }}</span>
      </label>
    </div>

    <p v-if="!eligibleColumns.length" class="text-sm text-gray-500 dark:text-neutral-400 text-center py-2">
      No groupable columns
    </p>
  </div>
</template>

<script setup lang="ts">
import type { BoardColumn } from '~/composables/useBoardData'

const props = defineProps<{
  columns: BoardColumn[]
}>()

const modelValue = defineModel<string | null>({ default: null })

const groupableTypes = new Set(['status', 'dropdown', 'people', 'priority', 'text', 'label'])

const eligibleColumns = computed(() =>
  (props.columns || []).filter(c => {
    const type = c.columnType || c.type
    return groupableTypes.has(type)
  })
)

function columnTypeLabel(col: BoardColumn): string {
  const type = col.columnType || col.type
  return type.charAt(0).toUpperCase() + type.slice(1)
}
</script>
