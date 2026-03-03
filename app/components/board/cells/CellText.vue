<template>
  <div class="min-h-[28px] flex items-center" @click.stop="startEditing">
    <template v-if="editing">
      <input
        ref="inputRef"
        v-model="localValue"
        type="text"
        class="w-full px-1 py-0.5 text-sm border border-gray-200 dark:border-neutral-700 rounded outline-none focus:border-blue-500 bg-white dark:bg-neutral-800 dark:text-neutral-100"
        @blur="save"
        @keydown.enter="save"
        @keydown.escape="cancel"
        @click.stop
      />
    </template>
    <template v-else>
      <span class="text-sm text-gray-700 dark:text-neutral-300 truncate cursor-text hover:bg-gray-100 dark:hover:bg-neutral-800 px-1 py-0.5 rounded w-full">
        {{ displayValue || '-' }}
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
const localValue = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const displayValue = computed(() => props.value?.textValue || '')

function startEditing() {
  if (props.readonly) return
  localValue.value = displayValue.value
  editing.value = true
  nextTick(() => inputRef.value?.focus())
}

function save() {
  editing.value = false
  if (localValue.value !== displayValue.value) {
    emit('update', { textValue: localValue.value || null })
  }
}

function cancel() {
  editing.value = false
  localValue.value = displayValue.value
}
</script>
