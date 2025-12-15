<script setup lang="ts">
import type { BoardViewType } from '~/types'

const props = defineProps<{
  modelValue: BoardViewType
  availableViews?: BoardViewType[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BoardViewType]
}>()

const allViews: { value: BoardViewType; label: string; icon: string }[] = [
  { value: 'kanban', label: 'Kanban', icon: 'i-lucide-columns' },
  { value: 'table', label: 'Table', icon: 'i-lucide-table' },
  { value: 'timeline', label: 'Timeline', icon: 'i-lucide-gantt-chart' },
  { value: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar' },
  { value: 'list', label: 'List', icon: 'i-lucide-list' },
  { value: 'gallery', label: 'Gallery', icon: 'i-lucide-layout-grid' }
]

const views = computed(() => {
  if (props.availableViews?.length) {
    return allViews.filter(v => props.availableViews!.includes(v.value))
  }
  return allViews
})

const currentView = computed(() => views.value.find(v => v.value === props.modelValue))
</script>

<template>
  <UButtonGroup>
    <UButton
      v-for="view in views"
      :key="view.value"
      :icon="view.icon"
      :variant="modelValue === view.value ? 'solid' : 'ghost'"
      :color="modelValue === view.value ? 'primary' : 'neutral'"
      size="sm"
      :aria-label="view.label"
      @click="emit('update:modelValue', view.value)"
    >
      <span class="sr-only md:not-sr-only md:ml-1">{{ view.label }}</span>
    </UButton>
  </UButtonGroup>
</template>
