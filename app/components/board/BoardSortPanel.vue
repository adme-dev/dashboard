<template>
  <div class="w-72 p-3">
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm font-medium text-gray-700 dark:text-neutral-200">Sort</span>
      <button v-if="modelValue.length" class="text-xs text-blue-600 hover:text-blue-700" @click="$emit('update:modelValue', [])">
        Clear all
      </button>
    </div>

    <!-- Active sort rules -->
    <div v-if="modelValue.length" class="space-y-2 mb-3">
      <div
        v-for="(rule, idx) in modelValue"
        :key="rule.columnId"
        class="flex items-center gap-2 bg-gray-50 dark:bg-neutral-800 rounded-md px-2 py-1.5 text-sm"
      >
        <span v-if="idx > 0" class="text-gray-400 dark:text-neutral-500 text-xs">then</span>
        <span class="font-medium text-gray-700 dark:text-neutral-200 truncate">{{ columnName(rule.columnId) }}</span>
        <button
          class="text-xs px-1.5 py-0.5 rounded border hover:bg-gray-100 dark:hover:bg-neutral-700"
          :class="rule.direction === 'asc' ? 'text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800' : 'text-gray-600 dark:text-neutral-300 border-gray-200 dark:border-neutral-600'"
          @click="toggleDirection(rule.columnId)"
        >
          {{ rule.direction === 'asc' ? 'A-Z' : 'Z-A' }}
        </button>
        <button class="ml-auto text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:text-neutral-300 shrink-0" @click="removeSort(rule.columnId)">
          <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Add sort -->
    <div v-if="availableColumns.length" class="border-t pt-3">
      <div class="flex items-center gap-2">
        <USelect
          v-model="newColumnId"
          :items="availableColumns.map(col => ({ label: col.name, value: col.id }))"
          placeholder="Add sort..."
          size="sm"
          class="flex-1"
        />
        <UButton
          v-if="newColumnId"
          size="sm"
          color="primary"
          variant="soft"
          @click="addSort"
        >
          Add
        </UButton>
      </div>
    </div>

    <p v-else-if="!modelValue.length" class="text-sm text-gray-500 dark:text-neutral-400 text-center py-2">
      No sortable columns
    </p>
  </div>
</template>

<script setup lang="ts">
import type { BoardColumn, SortRule } from '~/composables/useBoardData'

const props = defineProps<{
  columns: BoardColumn[]
}>()

const modelValue = defineModel<SortRule[]>({ default: () => [] })
const newColumnId = ref('')

const availableColumns = computed(() =>
  (props.columns || []).filter(c => !modelValue.value.some(r => r.columnId === c.id))
)

function columnName(columnId: string): string {
  return (props.columns || []).find(c => c.id === columnId)?.name || 'Unknown'
}

function addSort() {
  if (!newColumnId.value) return
  modelValue.value = [...modelValue.value, { columnId: newColumnId.value, direction: 'asc' }]
  newColumnId.value = ''
}

function removeSort(columnId: string) {
  modelValue.value = modelValue.value.filter(r => r.columnId !== columnId)
}

function toggleDirection(columnId: string) {
  modelValue.value = modelValue.value.map(r =>
    r.columnId === columnId ? { ...r, direction: r.direction === 'asc' ? 'desc' : 'asc' } : r
  )
}
</script>
