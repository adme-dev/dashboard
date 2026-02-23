<template>
  <div class="min-h-[28px] flex items-center gap-0.5" @click.stop>
    <button
      v-for="star in 5"
      :key="star"
      class="p-0.5 hover:scale-110 transition-transform"
      :disabled="readonly"
      @click="setRating(star)"
    >
      <UIcon
        :name="star <= currentRating ? 'i-lucide-star' : 'i-lucide-star'"
        class="w-4 h-4"
        :class="star <= currentRating ? 'text-yellow-400' : 'text-gray-300'"
      />
    </button>
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

const currentRating = computed(() => Number(props.value?.numberValue) || 0)

function setRating(star: number) {
  if (props.readonly) return
  const newVal = star === currentRating.value ? 0 : star
  emit('update', { numberValue: newVal })
}
</script>
