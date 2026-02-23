<template>
  <div class="task-info space-y-6">
    <!-- Task Details -->
    <div class="space-y-4">
      <h4 class="font-medium text-gray-900">Details</h4>
      
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-500">Status</span>
          <div class="mt-1">
            <UBadge
              v-if="task?.status_name"
              :color="getStatusColor(task.status_category)"
              size="sm"
            >
              {{ task.status_name }}
            </UBadge>
            <span v-else class="text-gray-700">Not set</span>
          </div>
        </div>

        <div>
          <span class="text-gray-500">Priority</span>
          <div class="mt-1">
            <UBadge
              v-if="task?.priority"
              :color="getPriorityColor(task.priority)"
              size="sm"
            >
              {{ task.priority }}
            </UBadge>
            <span v-else class="text-gray-700">Not set</span>
          </div>
        </div>

        <div>
          <span class="text-gray-500">Assignee</span>
          <div class="mt-1 flex items-center gap-2">
            <UAvatar
              v-if="task?.assignee_name"
              :src="task.assignee_avatar || undefined"
              :alt="task.assignee_name"
              size="xs"
            />
            <span class="text-gray-700">
              {{ task?.assignee_name || 'Unassigned' }}
            </span>
          </div>
        </div>

        <div>
          <span class="text-gray-500">Due Date</span>
          <div class="mt-1 text-gray-700">
            {{ task?.due_date ? formatDate(task.due_date) : 'No due date' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Project Info -->
    <div v-if="task?.project_name" class="space-y-2">
      <h4 class="font-medium text-gray-900">Project</h4>
      <NuxtLink
        :to="`/agency/projects/${task.project_id}`"
        class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
      >
        <UIcon name="i-lucide-briefcase" class="w-4 h-4" />
        {{ task.project_name }}
      </NuxtLink>
    </div>

    <!-- Department Info -->
    <div v-if="task?.department_name" class="space-y-2">
      <h4 class="font-medium text-gray-900">Board</h4>
      <NuxtLink
        :to="`/agency/boards/${task.department_slug || task.department_id}`"
        class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
      >
        <span
          class="w-3 h-3 rounded-full"
          :style="{ backgroundColor: task.department_color || '#6B7280' }"
        />
        {{ task.department_name }}
      </NuxtLink>
    </div>

    <!-- Created Info -->
    <div class="pt-4 border-t border-gray-200 space-y-2">
      <div class="flex justify-between text-sm">
        <span class="text-gray-500">Created</span>
        <span class="text-gray-700">{{ formatDate(task?.created_at) }}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-gray-500">Updated</span>
        <span class="text-gray-700">{{ formatDate(task?.updated_at) }}</span>
      </div>
      <div v-if="task?.reporter_name" class="flex justify-between text-sm">
        <span class="text-gray-500">Created by</span>
        <span class="text-gray-700">{{ task.reporter_name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  taskId: string
}

const props = defineProps<Props>()

const task = ref<any>(null)
const loading = ref(false)

const fetchTask = async () => {
  loading.value = true
  try {
    const response = await $fetch(`/api/tasks/${props.taskId}`)
    task.value = response
  } catch (error) {
    console.error('Failed to fetch task:', error)
  } finally {
    loading.value = false
  }
}

const getStatusColor = (category: string): 'neutral' | 'primary' | 'warning' | 'success' | 'error' => {
  const colors: Record<string, 'neutral' | 'primary' | 'warning' | 'success' | 'error'> = {
    not_started: 'neutral',
    in_progress: 'primary',
    review: 'warning',
    done: 'success',
    cancelled: 'error'
  }
  return colors[category] || 'neutral'
}

const getPriorityColor = (priority: string): 'error' | 'warning' | 'primary' | 'neutral' => {
  const colors: Record<string, 'error' | 'warning' | 'primary' | 'neutral'> = {
    urgent: 'error',
    high: 'warning',
    medium: 'primary',
    low: 'neutral'
  }
  return colors[priority] || 'neutral'
}

const formatDate = (date: string | null): string => {
  if (!date) return 'Not set'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

onMounted(fetchTask)
</script>
