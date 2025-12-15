<script setup lang="ts">
import { format, differenceInDays } from 'date-fns'

const props = defineProps<{
  departmentId?: string
  limit?: number
}>()

const emit = defineEmits<{
  taskClick: [taskId: string]
}>()

// Fetch overdue tasks
const { data: overdueData, pending: loading, refresh } = await useFetch('/api/agency/dashboard/overdue', {
  query: computed(() => ({
    departmentId: props.departmentId,
    limit: props.limit || 20
  }))
})

const overdue = computed(() => overdueData.value || { stats: {}, tasks: [], byDaysOverdue: {} })

// Priority badge colors
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'error'
    case 'high': return 'warning'
    case 'medium': return 'info'
    case 'low': return 'neutral'
    default: return 'neutral'
  }
}

// Days overdue formatting
const formatDaysOverdue = (days: number) => {
  if (days === 1) return '1 day overdue'
  return `${days} days overdue`
}

// Severity styling
const getSeverityClass = (days: number) => {
  if (days > 7) return 'border-l-red-500'
  if (days >= 3) return 'border-l-orange-500'
  return 'border-l-amber-500'
}

// Expose refresh
defineExpose({ refresh })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-alert-triangle" class="h-5 w-5 text-red-500" />
          <h3 class="font-semibold">Overdue Tasks</h3>
        </div>
        <UBadge
          v-if="overdue.stats?.totalOverdue"
          :label="String(overdue.stats.totalOverdue)"
          color="error"
        />
      </div>
    </template>

    <!-- Loading state -->
    <template v-if="loading">
      <div class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-16 w-full" />
      </div>
    </template>

    <!-- Content -->
    <template v-else>
      <!-- Stats summary -->
      <div v-if="overdue.stats?.totalOverdue" class="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-neutral-200 dark:border-neutral-700">
        <div class="text-center">
          <p class="text-xl font-bold text-red-500">{{ overdue.byDaysOverdue?.critical || 0 }}</p>
          <p class="text-xs text-muted">7+ days</p>
        </div>
        <div class="text-center">
          <p class="text-xl font-bold text-orange-500">{{ overdue.byDaysOverdue?.urgent || 0 }}</p>
          <p class="text-xs text-muted">3-7 days</p>
        </div>
        <div class="text-center">
          <p class="text-xl font-bold text-amber-500">{{ overdue.byDaysOverdue?.recent || 0 }}</p>
          <p class="text-xs text-muted">&lt;3 days</p>
        </div>
      </div>

      <!-- Tasks list -->
      <div class="space-y-2">
        <div
          v-for="task in overdue.tasks"
          :key="task.id"
          class="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg border-l-4 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          :class="getSeverityClass(task.daysOverdue)"
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
                <span class="text-xs text-red-500 font-medium">
                  {{ formatDaysOverdue(task.daysOverdue) }}
                </span>
              </div>
            </div>
            <div class="text-right">
              <p class="text-xs text-muted">Due {{ format(new Date(task.dueDate), 'MMM d') }}</p>
              <div
                v-if="task.department"
                class="mt-1 px-1.5 py-0.5 text-xs rounded"
                :style="{
                  backgroundColor: `${task.department.color}20`,
                  color: task.department.color
                }"
              >
                {{ task.department.name }}
              </div>
            </div>
          </div>

          <!-- Assignee & project -->
          <div class="flex items-center justify-between mt-2 text-xs text-muted">
            <div class="flex items-center gap-1">
              <UAvatar
                v-if="task.assignee"
                :alt="task.assignee.name"
                size="2xs"
              />
              <span>{{ task.assignee?.name || 'Unassigned' }}</span>
            </div>
            <span v-if="task.project" class="truncate max-w-[120px]">
              {{ task.project.name }}
            </span>
          </div>

          <!-- Blocked indicator -->
          <div v-if="task.isBlocked" class="mt-2 flex items-center gap-1 text-xs text-red-500">
            <UIcon name="i-lucide-ban" class="h-3 w-3" />
            <span>Blocked: {{ task.blockedReason || 'No reason given' }}</span>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!overdue.tasks?.length" class="text-center py-8">
        <UIcon name="i-lucide-check-circle-2" class="h-12 w-12 text-emerald-500 mx-auto mb-2" />
        <p class="text-sm font-medium text-highlighted">All caught up!</p>
        <p class="text-xs text-muted">No overdue tasks</p>
      </div>

      <!-- View all link -->
      <div v-if="overdue.stats?.totalOverdue > (limit || 20)" class="mt-4 text-center">
        <UButton
          label="View all overdue tasks"
          color="neutral"
          variant="ghost"
          size="sm"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>
    </template>
  </UCard>
</template>
