<template>
  <div v-if="loading" class="text-sm text-muted">
    Loading task details…
  </div>
  <div v-else-if="loadError" class="space-y-2">
    <p role="alert" class="text-sm text-error">
      Unable to load task details.
    </p>
    <UButton variant="outline" size="sm" @click="fetchTask">
      Try again
    </UButton>
  </div>
  <div v-else class="task-info space-y-6">
    <!-- Task Details -->
    <div class="space-y-4">
      <h4 class="font-medium text-gray-900 dark:text-neutral-100">
        Details
      </h4>

      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-500 dark:text-neutral-400">Status</span>
          <div class="mt-1">
            <UBadge
              v-if="task?.status?.name"
              :color="getStatusColor(task.status?.category)"
              size="sm"
            >
              {{ task.status?.name }}
            </UBadge>
            <span v-else class="text-gray-700 dark:text-neutral-200">Not set</span>
          </div>
        </div>

        <div>
          <span class="text-gray-500 dark:text-neutral-400">Priority</span>
          <div class="mt-1">
            <UBadge
              v-if="task?.priority"
              :color="getPriorityColor(task.priority)"
              size="sm"
            >
              {{ task.priority }}
            </UBadge>
            <span v-else class="text-gray-700 dark:text-neutral-200">Not set</span>
          </div>
        </div>

        <div>
          <span class="text-gray-500 dark:text-neutral-400">Assignee</span>
          <div class="mt-1 flex items-center gap-2">
            <UAvatar
              v-if="task?.assignee?.name"
              :src="task.assignee?.avatar || undefined"
              :alt="task.assignee?.name"
              size="xs"
            />
            <span class="text-gray-700 dark:text-neutral-200">
              {{ task?.assignee?.name || 'Unassigned' }}
            </span>
          </div>
        </div>

        <div>
          <span class="text-gray-500 dark:text-neutral-400">Due Date</span>
          <div class="mt-1 text-gray-700 dark:text-neutral-200">
            {{ task?.dueDate ? formatDate(task.dueDate) : 'No due date' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Project Info -->
    <div v-if="task?.project?.name" class="space-y-2">
      <h4 class="font-medium text-gray-900 dark:text-neutral-100">
        Project
      </h4>
      <NuxtLink
        :to="`/agency/projects/${task.project?.id}`"
        class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
      >
        <UIcon name="i-lucide-briefcase" class="w-4 h-4" />
        {{ task.project?.name }}
      </NuxtLink>
    </div>

    <!-- Department Info -->
    <div v-if="task?.department?.name" class="space-y-2">
      <h4 class="font-medium text-gray-900 dark:text-neutral-100">
        Board
      </h4>
      <NuxtLink
        :to="`/agency/boards/${task.department?.slug || task.department?.id}`"
        class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
      >
        <span
          class="w-3 h-3 rounded-full"
          :style="{ backgroundColor: task.department?.color || '#6B7280' }"
        />
        {{ task.department?.name }}
      </NuxtLink>
    </div>

    <!-- Created Info -->
    <div class="pt-4 border-t border-gray-200 dark:border-neutral-700 space-y-2">
      <div class="flex justify-between text-sm">
        <span class="text-gray-500 dark:text-neutral-400">Created</span>
        <span class="text-gray-700 dark:text-neutral-200">{{ formatDate(task?.createdAt) }}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-gray-500 dark:text-neutral-400">Updated</span>
        <span class="text-gray-700 dark:text-neutral-200">{{ formatDate(task?.updatedAt) }}</span>
      </div>
      <div v-if="task?.reporter?.name" class="flex justify-between text-sm">
        <span class="text-gray-500 dark:text-neutral-400">Created by</span>
        <span class="text-gray-700 dark:text-neutral-200">{{ task.reporter?.name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  taskId: string
}

const props = defineProps<Props>()

interface TaskInfo {
  status: { name: string, category: string }
  priority: string
  assignee: { name: string, avatar?: string } | null
  reporter: { name: string } | null
  project: { id: string, name: string } | null
  department: { id: string, slug: string | null, name: string, color: string }
  dueDate: string | null
  createdAt: string
  updatedAt: string
}
const task = ref<TaskInfo | null>(null)
const loading = ref(false)
const loadError = ref(false)
let requestVersion = 0

const fetchTask = async () => {
  const version = ++requestVersion
  loading.value = true
  loadError.value = false
  task.value = null
  try {
    const response = await $fetch<TaskInfo>(`/api/agency/tasks/${props.taskId}`)
    if (version === requestVersion) task.value = response
  } catch (error) {
    if (version === requestVersion) loadError.value = true
    console.error('Failed to fetch task:', error)
  } finally {
    if (version === requestVersion) loading.value = false
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

watch(() => props.taskId, fetchTask, { immediate: true })
</script>
