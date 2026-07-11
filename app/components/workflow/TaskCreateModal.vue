<script setup lang="ts">
import type { Task } from '~/types'

const props = defineProps<{
  open: boolean
  departmentId: string
  projectId?: string
  defaultStatusId?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [task: Task]
}>()

const loading = ref(false)
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const handleSubmit = async (taskData: Partial<Task>) => {
  loading.value = true

  try {
    const response = await apiFetch<Task>('/api/agency/tasks', {
      method: 'POST',
      body: taskData
    })

    emit('created', response)
    emit('update:open', false)
  } catch (error) {
    console.error('Failed to create task:', error)
  } finally {
    loading.value = false
  }
}

const handleCancel = () => {
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-plus-circle" class="h-5 w-5 text-primary" />
        <span class="font-semibold">Create New Task</span>
      </div>
    </template>

    <template #body>
      <WorkflowTaskForm
        :department-id="departmentId"
        :project-id="projectId"
        :default-status-id="defaultStatusId"
        @submit="handleSubmit"
        @cancel="handleCancel"
      />
    </template>
  </UModal>
</template>
