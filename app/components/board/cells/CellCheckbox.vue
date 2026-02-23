<template>
  <div class="min-h-[28px] flex items-center justify-center" @click.stop>
    <UCheckbox
      :model-value="checked"
      :disabled="readonly"
      @update:model-value="toggle"
    />
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

const checked = computed(() => Number(props.value?.numberValue) === 1)

function toggle(val: boolean | string) {
  emit('update', { numberValue: val === true ? 1 : 0 })
}
</script>
