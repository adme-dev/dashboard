<template>
  <div class="min-h-[28px] flex items-center" @click.stop="startEditing">
    <template v-if="editing">
      <input
        ref="inputRef"
        v-model.number="localValue"
        type="number"
        :step="step"
        class="w-full px-1 py-0.5 text-sm border border-gray-200 dark:border-neutral-700 rounded outline-none focus:border-blue-500 bg-white dark:bg-neutral-800 dark:text-neutral-100 text-right"
        @blur="save"
        @keydown.enter="save"
        @keydown.escape="cancel"
        @click.stop
      />
    </template>
    <template v-else>
      <span class="text-sm text-gray-700 dark:text-neutral-300 truncate cursor-text hover:bg-gray-100 dark:hover:bg-neutral-800 px-1 py-0.5 rounded w-full text-right">
        {{ formattedValue }}
      </span>
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
const localValue = ref<number | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const decimals = computed(() => props.column.settings?.decimalPlaces ?? 0)
const step = computed(() => decimals.value > 0 ? Math.pow(10, -decimals.value) : 1)
const prefix = computed(() => props.column.settings?.prefix || '')
const suffix = computed(() => props.column.settings?.suffix || '')

const formattedValue = computed(() => {
  const num = props.value?.numberValue
  if (num == null) return '-'
  const formatted = Number(num).toLocaleString(undefined, {
    minimumFractionDigits: decimals.value,
    maximumFractionDigits: decimals.value,
  })
  return `${prefix.value}${formatted}${suffix.value}`
})

function startEditing() {
  if (props.readonly) return
  localValue.value = props.value?.numberValue ?? null
  editing.value = true
  nextTick(() => inputRef.value?.focus())
}

function save() {
  editing.value = false
  if (localValue.value !== props.value?.numberValue) {
    emit('update', { numberValue: localValue.value })
  }
}

function cancel() {
  editing.value = false
}
</script>
