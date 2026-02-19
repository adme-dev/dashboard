<script setup lang="ts">
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns'
import type { TaskActivity } from '~/types'

const props = defineProps<{
  taskId: string
  limit?: number
}>()

// Fetch activities
const { data: activitiesData, pending: loading, refresh } = await useAsyncData(
  `task-activities-${props.taskId}`,
  () => fetch(`/api/agency/tasks/${props.taskId}/activities?limit=${props.limit || 50}`).then(r => r.json()) as Promise<{ activities: TaskActivity[] }>,
  { watch: [() => props.taskId] }
)

const activities = computed(() => {
  const response = activitiesData.value as { activities?: TaskActivity[] } | undefined
  return response?.activities || []
})

// Group activities by date
const groupedActivities = computed(() => {
  const groups: { label: string; date: Date; items: TaskActivity[] }[] = []
  let currentGroup: typeof groups[0] | null = null

  for (const activity of activities.value) {
    const activityDate = new Date(activity.createdAt)
    const dateKey = activityDate.toDateString()

    if (!currentGroup || currentGroup.date.toDateString() !== dateKey) {
      let label: string
      if (isToday(activityDate)) {
        label = 'Today'
      } else if (isYesterday(activityDate)) {
        label = 'Yesterday'
      } else {
        label = format(activityDate, 'EEEE, MMMM d')
      }

      currentGroup = {
        label,
        date: activityDate,
        items: []
      }
      groups.push(currentGroup)
    }

    currentGroup.items.push(activity)
  }

  return groups
})

// Activity type icons and colors
const getActivityIcon = (type: string) => {
  switch (type) {
    case 'created': return 'i-lucide-plus-circle'
    case 'status_changed': return 'i-lucide-arrow-right-circle'
    case 'assigned': return 'i-lucide-user-plus'
    case 'unassigned': return 'i-lucide-user-minus'
    case 'priority_changed': return 'i-lucide-flag'
    case 'due_date_changed': return 'i-lucide-calendar'
    case 'comment': return 'i-lucide-message-circle'
    case 'attachment': return 'i-lucide-paperclip'
    case 'blocked': return 'i-lucide-ban'
    case 'unblocked': return 'i-lucide-check-circle'
    case 'completed': return 'i-lucide-check-circle-2'
    default: return 'i-lucide-activity'
  }
}

const getActivityColor = (type: string) => {
  switch (type) {
    case 'created': return 'text-emerald-500'
    case 'status_changed': return 'text-blue-500'
    case 'assigned':
    case 'unassigned': return 'text-purple-500'
    case 'priority_changed': return 'text-orange-500'
    case 'due_date_changed': return 'text-amber-500'
    case 'comment': return 'text-primary'
    case 'attachment': return 'text-cyan-500'
    case 'blocked': return 'text-red-500'
    case 'unblocked':
    case 'completed': return 'text-emerald-500'
    default: return 'text-muted'
  }
}

// Expose refresh method
defineExpose({ refresh })
</script>

<template>
  <div class="space-y-6">
    <!-- Loading state -->
    <template v-if="loading">
      <div v-for="i in 3" :key="i" class="flex gap-3">
        <USkeleton class="h-8 w-8 rounded-full" />
        <div class="flex-1 space-y-2">
          <USkeleton class="h-4 w-3/4" />
          <USkeleton class="h-3 w-1/2" />
        </div>
      </div>
    </template>

    <!-- Activity groups -->
    <template v-else>
      <div v-for="group in groupedActivities" :key="group.label" class="space-y-4">
        <!-- Date header -->
        <div class="flex items-center gap-3">
          <div class="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
          <span class="text-xs font-medium text-muted uppercase">{{ group.label }}</span>
          <div class="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
        </div>

        <!-- Activities for this date -->
        <div class="space-y-3">
          <div
            v-for="activity in group.items"
            :key="activity.id"
            class="flex gap-3"
          >
            <!-- Icon/Avatar -->
            <div class="flex-shrink-0">
              <div
                v-if="activity.type === 'comment'"
                class="relative"
              >
                <UAvatar
                  v-if="activity.user"
                  :alt="activity.user.name"
                  size="sm"
                />
                <div
                  class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white dark:bg-neutral-800 flex items-center justify-center"
                >
                  <UIcon
                    :name="getActivityIcon(activity.type)"
                    :class="getActivityColor(activity.type)"
                    class="h-3 w-3"
                  />
                </div>
              </div>
              <div
                v-else
                class="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center"
              >
                <UIcon
                  :name="getActivityIcon(activity.type)"
                  :class="getActivityColor(activity.type)"
                  class="h-4 w-4"
                />
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="font-medium text-sm text-highlighted">
                  {{ activity.user?.name || 'System' }}
                </span>
                <span class="text-xs text-muted">
                  {{ formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true }) }}
                </span>
              </div>

              <!-- Activity content -->
              <p class="text-sm text-muted mt-0.5">
                {{ activity.content }}
              </p>

              <!-- Show old/new values for changes -->
              <div
                v-if="activity.oldValue || activity.newValue"
                class="mt-1 flex items-center gap-2 text-xs"
              >
                <span
                  v-if="activity.oldValue"
                  class="px-2 py-0.5 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded line-through"
                >
                  {{ activity.oldValue }}
                </span>
                <UIcon v-if="activity.oldValue && activity.newValue" name="i-lucide-arrow-right" class="h-3 w-3 text-muted" />
                <span
                  v-if="activity.newValue"
                  class="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded"
                >
                  {{ activity.newValue }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="activities.length === 0" class="text-center py-8">
        <UIcon name="i-lucide-activity" class="h-8 w-8 text-muted mx-auto mb-2" />
        <p class="text-sm text-muted">No activity yet</p>
      </div>
    </template>
  </div>
</template>
