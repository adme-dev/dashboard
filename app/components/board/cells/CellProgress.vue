<template>
  <div class="min-h-[28px] flex items-center gap-2 w-full" @click.stop="startEditing">
    <template v-if="editing">
      <input
        ref="inputRef"
        v-model.number="localValue"
        type="number"
        min="0"
        max="100"
        class="w-16 px-1 py-0.5 text-sm border rounded outline-none focus:border-blue-500 bg-white text-right"
        @blur="save"
        @keydown.enter="save"
        @keydown.escape="cancel"
        @click.stop
      />
      <span class="text-xs text-gray-500">%</span>
    </template>
    <template v-else>
      <div class="flex-1 bg-gray-200 rounded-full h-2 cursor-pointer">
        <div
          class="h-2 rounded-full transition-all"
          :class="progressColor"
          :style="{ width: `${percent}%` }"
        />
      </div>
      <span class="text-xs text-gray-500 w-8 text-right">{{ percent }}%</span>
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
const localValue = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const percent = computed(() => Math.min(100, Math.max(0, Number(props.value?.numberValue) || 0)))

const progressColor = computed(() => {
  if (percent.value >= 100) return 'bg-green-500'
  if (percent.value >= 60) return 'bg-blue-500'
  if (percent.value >= 30) return 'bg-yellow-500'
  return 'bg-gray-400'
})

function startEditing() {
  if (props.readonly) return
  localValue.value = percent.value
  editing.value = true
  nextTick(() => inputRef.value?.focus())
}

function save() {
  editing.value = false
  const clamped = Math.min(100, Math.max(0, localValue.value || 0))
  if (clamped !== percent.value) {
    emit('update', { numberValue: clamped })
  }
}

function cancel() {
  editing.value = false
}
</script>
