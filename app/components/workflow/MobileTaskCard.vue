<script setup lang="ts">
import type { Task } from '~/types'
import { useSwipeActions } from '~/composables/useSwipeActions'

const props = defineProps<{
  task: Task
  isDragging?: boolean
  doneStatusId?: string
}>()

const emit = defineEmits<{
  click: []
  statusChange: [statusId: string]
  delete: []
  edit: []
}>()

const cardRef = ref<HTMLElement | null>(null)

// Swipe actions configuration
const { isSwiping, swipeDirection, activeActionIndex, getTransformStyle, getActionStyle, leftActions, rightActions } = useSwipeActions(
  cardRef,
  {
    threshold: 80,
    leftActions: [
      {
        id: 'complete',
        label: 'Complete',
        icon: 'i-lucide-check',
        color: 'success',
        action: () => {
          // Emit the done status ID if provided, otherwise fallback
          if (props.doneStatusId) {
            emit('statusChange', props.doneStatusId)
          }
        }
      }
    ],
    rightActions: [
      {
        id: 'edit',
        label: 'Edit',
        icon: 'i-lucide-pencil',
        color: 'primary',
        action: () => emit('edit')
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'i-lucide-trash',
        color: 'error',
        action: () => emit('delete')
      }
    ]
  }
)

const actionColors: Record<string, string> = {
  success: 'bg-emerald-500',
  primary: 'bg-primary-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  neutral: 'bg-gray-500'
}
</script>

<template>
  <div class="relative overflow-hidden rounded-lg">
    <!-- Left swipe actions (revealed when swiping right) -->
    <div
      v-if="leftActions.length > 0 && swipeDirection === 'right'"
      class="absolute inset-y-0 left-0 flex items-center"
      :style="getActionStyle"
    >
      <div
        v-for="(action, index) in leftActions"
        :key="action.id"
        class="h-full flex items-center justify-center px-4"
        :class="[
          actionColors[action.color],
          { 'opacity-100': activeActionIndex === index, 'opacity-70': activeActionIndex !== index }
        ]"
      >
        <div class="text-white text-center">
          <UIcon :name="action.icon" class="w-6 h-6" />
          <p class="text-xs mt-1">{{ action.label }}</p>
        </div>
      </div>
    </div>

    <!-- Right swipe actions (revealed when swiping left) -->
    <div
      v-if="rightActions.length > 0 && swipeDirection === 'left'"
      class="absolute inset-y-0 right-0 flex items-center"
      :style="getActionStyle"
    >
      <div
        v-for="(action, index) in rightActions"
        :key="action.id"
        class="h-full flex items-center justify-center px-4"
        :class="[
          actionColors[action.color],
          { 'opacity-100': activeActionIndex === index, 'opacity-70': activeActionIndex !== index }
        ]"
      >
        <div class="text-white text-center">
          <UIcon :name="action.icon" class="w-6 h-6" />
          <p class="text-xs mt-1">{{ action.label }}</p>
        </div>
      </div>
    </div>

    <!-- Card content -->
    <div
      ref="cardRef"
      class="relative bg-white dark:bg-neutral-800 transition-transform duration-200"
      :style="getTransformStyle"
      @click="!isSwiping && emit('click')"
    >
      <WorkflowKanbanCard
        :task="task"
        :is-dragging="isDragging"
        @click.stop
      />
    </div>
  </div>
</template>

<style scoped>
/* Smooth return animation after swipe */
.transition-transform {
  transition: transform 0.2s ease-out;
}
</style>
