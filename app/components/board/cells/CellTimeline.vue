<template>
  <div class="min-h-[28px] flex items-center" @click.stop="startEditing">
    <template v-if="editing">
      <div class="flex items-center gap-1" @click.stop>
        <input
          v-model="startDate"
          type="date"
          class="px-1 py-0.5 text-xs border rounded outline-none focus:border-blue-500 bg-white w-28"
        />
        <span class="text-gray-400">-</span>
        <input
          v-model="endDate"
          type="date"
          class="px-1 py-0.5 text-xs border rounded outline-none focus:border-blue-500 bg-white w-28"
        />
        <UButton size="xs" color="primary" @click="save">OK</UButton>
        <UButton size="xs" variant="ghost" @click="cancel">
          <UIcon name="i-lucide-x" class="w-3 h-3" />
        </UButton>
      </div>
    </template>
    <template v-else>
      <div
        v-if="hasRange"
        class="flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer hover:bg-gray-100"
      >
        <UIcon name="i-lucide-gantt-chart" class="w-3.5 h-3.5 text-blue-500" />
        <span class="text-gray-700">{{ formatShort(value?.dateValue) }} - {{ formatShort(value?.dateEndValue) }}</span>
      </div>
      <span v-else class="text-sm text-gray-400 cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded">-</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { CustomColumn, TaskColumnValue } from '~/types'

const props = defineProps<{
  column: CustomColumn
  value: TaskColumnValue | null
  taskId: string
  readonly?: boolean
}>()

const emit = defineEmits<{ update: [payload: any] }>()

const editing = ref(false)
const startDate = ref('')
const endDate = ref('')

const hasRange = computed(() => props.value?.dateValue && props.value?.dateEndValue)

function formatShort(d?: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function startEditing() {
  if (props.readonly) return
  startDate.value = props.value?.dateValue || ''
  endDate.value = props.value?.dateEndValue || ''
  editing.value = true
}

function save() {
  editing.value = false
  if (startDate.value || endDate.value) {
    emit('update', {
      dateValue: startDate.value || null,
      dateEndValue: endDate.value || null,
    })
  }
}

function cancel() {
  editing.value = false
}
</script>
