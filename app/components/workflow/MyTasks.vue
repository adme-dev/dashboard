<script setup lang="ts">
import { format, isToday, isTomorrow, isPast } from 'date-fns'
import type { Task } from '~/types'

const props = defineProps<{
  userId: string
}>()

const emit = defineEmits<{
  taskClick: [taskId: string]
}>()

// Fetch user's tasks
const { data: myTasksData, pending: loading, refresh } = await useFetch('/api/agency/dashboard/my-tasks', {
  query: { userId: props.userId }
})

const myTasks = computed(() => {
  const data = myTasksData.value as any
  return data || { user: {}, stats: {}, tasks: { overdue: [], dueToday: [], inProgress: [], inReview: [] } }
})

// Priority colors
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'error'
    case 'high': return 'warning'
    case 'medium': return 'info'
    case 'low': return 'neutral'
    default: return 'neutral'
  }
}

// Due date formatting
const formatDueDate = (date: string) => {
  const dueDate = new Date(date)
  if (isToday(dueDate)) return 'Today'
  if (isTomorrow(dueDate)) return 'Tomorrow'
  return format(dueDate, 'MMM d')
}

// Task sections
const sections = computed(() => [
  {
    key: 'overdue',
    label: 'Overdue',
    icon: 'i-lucide-alert-triangle',
    color: 'text-red-500',
    tasks: myTasks.value.tasks?.overdue || []
  },
  {
    key: 'dueToday',
    label: 'Due Today',
    icon: 'i-lucide-calendar',
    color: 'text-amber-500',
    tasks: myTasks.value.tasks?.dueToday || []
  },
  {
    key: 'inProgress',
    label: 'In Progress',
    icon: 'i-lucide-play-circle',
    color: 'text-blue-500',
    tasks: myTasks.value.tasks?.inProgress || []
  },
  {
    key: 'inReview',
    label: 'In Review',
    icon: 'i-lucide-eye',
    color: 'text-purple-500',
    tasks: myTasks.value.tasks?.inReview || []
  }
])

// Expose refresh
defineExpose({ refresh })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-user-check" class="h-5 w-5 text-muted" />
          <h3 class="font-semibold">My Tasks</h3>
        </div>
        <UBadge
          v-if="myTasks.stats?.totalTasks"
          :label="`${myTasks.stats.totalTasks} active`"
          color="primary"
          variant="subtle"
        />
      </div>
    </template>

    <!-- Loading state -->
    <template v-if="loading">
      <div class="space-y-4">
        <div v-for="i in 3" :key="i" class="space-y-2">
          <USkeleton class="h-4 w-24" />
          <USkeleton class="h-16 w-full" />
        </div>
      </div>
    </template>

    <!-- Content -->
    <template v-else>
      <!-- Stats row -->
      <div class="grid grid-cols-4 gap-2 mb-4 pb-4 border-b border-neutral-200 dark:border-neutral-700">
        <div class="text-center">
          <p class="text-lg font-bold text-red-500">{{ myTasks.stats?.overdue || 0 }}</p>
          <p class="text-xs text-muted">Overdue</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-bold text-amber-500">{{ myTasks.stats?.dueToday || 0 }}</p>
          <p class="text-xs text-muted">Today</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-bold text-blue-500">{{ myTasks.stats?.inProgress || 0 }}</p>
          <p class="text-xs text-muted">In Progress</p>
        </div>
        <div class="text-center">
          <p class="text-lg font-bold text-muted">{{ myTasks.stats?.blocked || 0 }}</p>
          <p class="text-xs text-muted">Blocked</p>
        </div>
      </div>

      <!-- Task sections -->
      <div class="space-y-4">
        <div
          v-for="section in sections.filter(s => s.tasks.length > 0)"
          :key="section.key"
        >
          <!-- Section header -->
          <div class="flex items-center gap-2 mb-2">
            <UIcon :name="section.icon" :class="section.color" class="h-4 w-4" />
            <span class="text-sm font-medium" :class="section.color">
              {{ section.label }} ({{ section.tasks.length }})
            </span>
          </div>

          <!-- Tasks -->
          <div class="space-y-2">
            <div
              v-for="task in section.tasks.slice(0, 5)"
              :key="task.id"
              class="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              @click="emit('taskClick', task.id)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-sm truncate">{{ task.title }}</p>
                  <div class="flex items-center gap-2 mt-1">
                    <UBadge
                      :label="task.priority"
                      :color="getPriorityColor(task.priority)"
                      size="xs"
                    />
                    <span
                      v-if="task.department"
                      class="text-xs px-1.5 py-0.5 rounded"
                      :style="{
                        backgroundColor: `${task.department.color}20`,
                        color: task.department.color
                      }"
                    >
                      {{ task.department.name }}
                    </span>
                  </div>
                </div>
                <div class="text-right">
                  <p
                    v-if="task.dueDate"
                    class="text-xs"
                    :class="isPast(new Date(task.dueDate)) ? 'text-red-500 font-medium' : 'text-muted'"
                  >
                    {{ formatDueDate(task.dueDate) }}
                  </p>
                  <div
                    v-if="task.status"
                    class="mt-1 px-1.5 py-0.5 text-xs rounded inline-block"
                    :style="{
                      backgroundColor: `${task.status.color}20`,
                      color: task.status.color
                    }"
                  >
                    {{ task.status.name }}
                  </div>
                </div>
              </div>

              <!-- Blocked indicator -->
              <div v-if="task.isBlocked" class="mt-2 flex items-center gap-1 text-xs text-red-500">
                <UIcon name="i-lucide-ban" class="h-3 w-3" />
                <span>{{ task.blockedReason || 'Blocked' }}</span>
              </div>
            </div>

            <!-- Show more -->
            <UButton
              v-if="section.tasks.length > 5"
              :label="`Show ${section.tasks.length - 5} more`"
              color="neutral"
              variant="ghost"
              size="xs"
              class="w-full"
            />
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!sections.some(s => s.tasks.length > 0)" class="text-center py-8">
        <UIcon name="i-lucide-check-circle-2" class="h-12 w-12 text-emerald-500 mx-auto mb-2" />
        <p class="text-sm font-medium text-highlighted">All caught up!</p>
        <p class="text-xs text-muted">No active tasks assigned to you</p>
      </div>
    </template>
  </UCard>
</template>
