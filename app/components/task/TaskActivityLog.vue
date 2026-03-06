<template>
  <div class="activity-log">
    <div v-if="loading" class="py-8 text-center">
      <XfLoader size="sm" class="mx-auto" />
    </div>
    
    <div v-else-if="activities.length === 0" class="py-8 text-center text-gray-500 dark:text-neutral-400">
      <UIcon name="i-lucide-activity" class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-neutral-600" />
      <p>No activity yet</p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="activity in activities"
        :key="activity.id"
        class="flex items-start gap-3 py-2"
      >
        <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center flex-shrink-0">
          <UIcon :name="getActivityIcon(activity.activity_type)" class="w-4 h-4 text-gray-500 dark:text-neutral-400" />
        </div>
        
        <div class="flex-1 min-w-0">
          <p class="text-sm text-gray-700 dark:text-neutral-200">
            <span class="font-medium">{{ activity.user_name || 'Someone' }}</span>
            {{ getActivityText(activity) }}
          </p>
          <p class="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
            {{ formatTime(activity.created_at) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  taskId: string
}

const props = defineProps<Props>()

const loading = ref(false)
const activities = ref<any[]>([])

const fetchActivities = async () => {
  loading.value = true
  try {
    const response = await $fetch(`/api/tasks/${props.taskId}/activities`)
    activities.value = response.activities
  } catch (error) {
    console.error('Failed to fetch activities:', error)
  } finally {
    loading.value = false
  }
}

const getActivityIcon = (type: string): string => {
  const icons: Record<string, string> = {
    created: 'i-lucide-plus',
    updated: 'i-lucide-edit-2',
    status_change: 'i-lucide-git-branch',
    assignment: 'i-lucide-user-plus',
    comment: 'i-lucide-message-square',
    attachment: 'i-lucide-paperclip',
    due_date_change: 'i-lucide-calendar',
    priority_change: 'i-lucide-flag',
    completed: 'i-lucide-check-circle',
    reopened: 'i-lucide-rotate-ccw'
  }
  return icons[type] || 'i-lucide-circle'
}

const getActivityText = (activity: any): string => {
  const texts: Record<string, string> = {
    created: 'created this task',
    updated: 'updated the task',
    status_change: `changed status to ${activity.new_value?.status || 'new status'}`,
    assignment: activity.new_value?.assignee ? `assigned to ${activity.new_value.assignee}` : 'updated assignment',
    comment: 'added a comment',
    attachment: 'attached a file',
    due_date_change: activity.new_value?.due_date ? `set due date to ${activity.new_value.due_date}` : 'changed due date',
    priority_change: `changed priority to ${activity.new_value?.priority || 'new priority'}`,
    completed: 'completed this task',
    reopened: 'reopened this task'
  }
  return texts[activity.activity_type] || 'performed an action'
}

const formatTime = (date: string): string => {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return then.toLocaleDateString()
}

onMounted(fetchActivities)
</script>
