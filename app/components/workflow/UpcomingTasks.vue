<script setup lang="ts">
import { format, isToday, isTomorrow, differenceInDays, addDays } from 'date-fns'

const props = defineProps<{
  departmentId?: string
  days?: number
  limit?: number
}>()

const emit = defineEmits<{
  taskClick: [taskId: string]
}>()

// Fetch upcoming tasks
const { data: upcomingData, pending: loading, refresh } = await useFetch('/api/agency/dashboard/upcoming', {
  query: computed(() => ({
    departmentId: props.departmentId,
    days: props.days || 7,
    limit: props.limit || 20
  }))
})

const upcoming = computed(() => upcomingData.value || { stats: {}, tasks: [], byDay: {} })

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
const formatDueLabel = (date: string) => {
  const dueDate = new Date(date)
  if (isToday(dueDate)) return 'Today'
  if (isTomorrow(dueDate)) return 'Tomorrow'

  const daysUntil = differenceInDays(dueDate, new Date())
  if (daysUntil <= 7) return format(dueDate, 'EEEE')

  return format(dueDate, 'MMM d')
}

// Get urgency class based on days until due
const getUrgencyClass = (date: string) => {
  const daysUntil = differenceInDays(new Date(date), new Date())
  if (daysUntil <= 1) return 'border-l-amber-500'
  if (daysUntil <= 3) return 'border-l-blue-500'
  return 'border-l-neutral-300 dark:border-l-neutral-600'
}

// Expose refresh
defineExpose({ refresh })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-calendar-clock" class="h-5 w-5 text-blue-500" />
          <h3 class="font-semibold">Upcoming Tasks</h3>
        </div>
        <UBadge
          v-if="upcoming.stats?.total"
          :label="`Next ${days || 7} days`"
          color="neutral"
          variant="subtle"
        />
      </div>
    </template>

    <!-- Loading state -->
    <template v-if="loading">
      <div class="space-y-3">
        <USkeleton v-for="i in 5" :key="i" class="h-16 w-full" />
      </div>
    </template>

    <!-- Content -->
    <template v-else>
      <!-- Stats summary -->
      <div v-if="upcoming.stats?.total" class="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-neutral-200 dark:border-neutral-700">
        <div class="text-center">
          <p class="text-xl font-bold text-amber-500">{{ upcoming.byDay?.today || 0 }}</p>
          <p class="text-xs text-muted">Today</p>
        </div>
        <div class="text-center">
          <p class="text-xl font-bold text-blue-500">{{ upcoming.byDay?.tomorrow || 0 }}</p>
          <p class="text-xs text-muted">Tomorrow</p>
        </div>
        <div class="text-center">
          <p class="text-xl font-bold text-muted">{{ upcoming.byDay?.thisWeek || 0 }}</p>
          <p class="text-xs text-muted">This Week</p>
        </div>
      </div>

      <!-- Tasks list -->
      <div class="space-y-2">
        <div
          v-for="task in upcoming.tasks"
          :key="task.id"
          class="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg border-l-4 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          :class="getUrgencyClass(task.dueDate)"
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
                  v-if="task.status"
                  class="text-xs px-1.5 py-0.5 rounded"
                  :style="{
                    backgroundColor: `${task.status.color}20`,
                    color: task.status.color
                  }"
                >
                  {{ task.status.name }}
                </span>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm font-medium" :class="isToday(new Date(task.dueDate)) ? 'text-amber-500' : 'text-muted'">
                {{ formatDueLabel(task.dueDate) }}
              </p>
              <p class="text-xs text-muted">
                {{ format(new Date(task.dueDate), 'h:mm a') }}
              </p>
            </div>
          </div>

          <!-- Assignee & department -->
          <div class="flex items-center justify-between mt-2 text-xs text-muted">
            <div class="flex items-center gap-1">
              <UAvatar
                v-if="task.assignee"
                :alt="task.assignee.name"
                size="2xs"
              />
              <span>{{ task.assignee?.name || 'Unassigned' }}</span>
            </div>
            <span
              v-if="task.department"
              class="px-1.5 py-0.5 rounded"
              :style="{
                backgroundColor: `${task.department.color}20`,
                color: task.department.color
              }"
            >
              {{ task.department.name }}
            </span>
          </div>

          <!-- Project info -->
          <p v-if="task.project" class="mt-1 text-xs text-muted truncate">
            <UIcon name="i-lucide-folder" class="h-3 w-3 inline mr-1" />
            {{ task.project.clientName ? `${task.project.clientName} / ` : '' }}{{ task.project.name }}
          </p>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!upcoming.tasks?.length" class="text-center py-8">
        <UIcon name="i-lucide-calendar-check" class="h-12 w-12 text-emerald-500 mx-auto mb-2" />
        <p class="text-sm font-medium text-highlighted">Clear schedule!</p>
        <p class="text-xs text-muted">No tasks due in the next {{ days || 7 }} days</p>
      </div>

      <!-- View all link -->
      <div v-if="upcoming.stats?.total > (limit || 20)" class="mt-4 text-center">
        <UButton
          label="View all upcoming tasks"
          color="neutral"
          variant="ghost"
          size="sm"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>
    </template>
  </UCard>
</template>
