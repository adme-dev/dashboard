<template>
  <div class="min-h-[28px] flex items-center" @click.stop="startEditing">
    <template v-if="editing">
      <input
        ref="inputRef"
        v-model.number="localValue"
        type="number"
        step="0.01"
        class="w-full px-1 py-0.5 text-sm border rounded outline-none focus:border-blue-500 bg-white text-right"
        @blur="save"
        @keydown.enter="save"
        @keydown.escape="cancel"
        @click.stop
      />
    </template>
    <template v-else>
      <span class="text-sm text-gray-700 truncate cursor-text hover:bg-gray-100 px-1 py-0.5 rounded w-full text-right">
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

const currencyCode = computed(() => props.column.settings?.currencyCode || 'USD')

const formattedValue = computed(() => {
  const num = props.value?.numberValue
  if (num == null) return '-'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode.value,
    }).format(Number(num))
  } catch {
    return `${currencyCode.value} ${Number(num).toFixed(2)}`
  }
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
