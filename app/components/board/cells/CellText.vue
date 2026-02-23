<template>
  <div class="min-h-[28px] flex items-center" @click.stop="startEditing">
    <template v-if="editing">
      <input
        ref="inputRef"
        v-model="localValue"
        type="text"
        class="w-full px-1 py-0.5 text-sm border rounded outline-none focus:border-blue-500 bg-white"
        @blur="save"
        @keydown.enter="save"
        @keydown.escape="cancel"
        @click.stop
      />
    </template>
    <template v-else>
      <span class="text-sm text-gray-700 truncate cursor-text hover:bg-gray-100 px-1 py-0.5 rounded w-full">
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
