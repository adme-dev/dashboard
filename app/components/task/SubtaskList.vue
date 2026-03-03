<template>
  <div class="space-y-1">
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <h4 class="text-sm font-medium text-gray-700 dark:text-neutral-200">Subtasks</h4>
        <UBadge v-if="subtasks.length > 0" color="neutral" variant="subtle" size="xs">
          {{ completedCount }}/{{ subtasks.length }}
        </UBadge>
      </div>
      <UButton
        variant="ghost"
        size="xs"
        icon="i-lucide-plus"
        @click="showAddForm = true"
      >
        Add
      </UButton>
    </div>

    <!-- Progress Bar -->
    <div v-if="subtasks.length > 0" class="w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-1.5 mb-3">
      <div
        class="h-1.5 rounded-full transition-all duration-300"
        :class="progressPercent === 100 ? 'bg-green-500' : 'bg-blue-500'"
        :style="{ width: progressPercent + '%' }"
      />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-4">
      <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-gray-400 dark:text-neutral-500" />
    </div>

    <!-- Subtask List -->
    <div v-else-if="subtasks.length > 0" class="space-y-0.5">
      <SubtaskRow
        v-for="subtask in subtasks"
        :key="subtask.id"
        :subtask="subtask"
        @toggle-complete="toggleComplete"
        @delete="deleteSubtask"
      />
    </div>

    <!-- Empty State -->
    <p v-else-if="!showAddForm" class="text-sm text-gray-400 dark:text-neutral-500 py-2">
      No subtasks yet
    </p>

    <!-- Add Subtask Form -->
    <div v-if="showAddForm" class="flex items-center gap-2 mt-2" @click.stop>
      <input
        ref="addInput"
        v-model="newTitle"
        type="text"
        placeholder="Subtask title..."
        class="flex-1 text-sm border rounded-md px-3 py-1.5 outline-none focus:border-blue-500 bg-white dark:bg-neutral-800"
        :disabled="adding"
        @keydown.enter="addSubtask"
        @keydown.escape="cancelAdd"
      />
      <UButton
        size="xs"
        color="primary"
        :loading="adding"
        :disabled="!newTitle.trim()"
        @click="addSubtask"
      >
        Add
      </UButton>
      <UButton size="xs" variant="ghost" @click="cancelAdd">
        Cancel
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import SubtaskRow from './SubtaskRow.vue'

interface Subtask {
  id: string
  title: string
  priority?: string
  dueDate?: string
  completedAt?: string
  sortOrder?: number
  statusName?: string
  statusColor?: string
  statusCategory?: string
  assigneeId?: string
  assigneeName?: string
  assigneeAvatar?: string
  createdAt: string
  updatedAt: string
}

const props = defineProps<{
  taskId: string
}>()

const toast = useToast()
const subtasks = ref<Subtask[]>([])
const loading = ref(false)
const adding = ref(false)
const showAddForm = ref(false)
const newTitle = ref('')
const addInput = ref<HTMLInputElement | null>(null)

const completedCount = computed(() =>
  subtasks.value.filter(s => s.statusCategory === 'done' || !!s.completedAt).length
)

const progressPercent = computed(() => {
  if (subtasks.value.length === 0) return 0
  return Math.round((completedCount.value / subtasks.value.length) * 100)
})

async function fetchSubtasks() {
  loading.value = true
  try {
    const data = await $fetch<{ subtasks: Subtask[] }>(
      `/api/agency/tasks/${props.taskId}/subtasks`
    )
    subtasks.value = data.subtasks
  } catch (err: any) {
    console.error('Failed to fetch subtasks:', err)
  } finally {
    loading.value = false
  }
}

async function addSubtask() {
  const title = newTitle.value.trim()
  if (!title || adding.value) return

  adding.value = true
  try {
    const data = await $fetch<{ subtask: Subtask }>(
      `/api/agency/tasks/${props.taskId}/subtasks`,
      { method: 'POST', body: { title } }
    )
    subtasks.value.push(data.subtask)
    newTitle.value = ''
    // Keep form open for rapid entry
    nextTick(() => addInput.value?.focus())
  } catch (err: any) {
    toast.add({
      title: 'Failed to add subtask',
      description: err?.data?.statusMessage || 'Something went wrong',
      color: 'error',
    })
  } finally {
    adding.value = false
  }
}

async function toggleComplete(subtaskId: string) {
  const subtask = subtasks.value.find(s => s.id === subtaskId)
  if (!subtask) return

  const isDone = subtask.statusCategory === 'done' || !!subtask.completedAt
  try {
    // Toggle status via task update endpoint
    await $fetch(`/api/agency/tasks/${subtaskId}`, {
      method: 'PUT',
      body: { completed: !isDone },
    })
    await fetchSubtasks()
  } catch (err: any) {
    toast.add({
      title: 'Failed to update subtask',
      description: err?.data?.statusMessage || 'Something went wrong',
      color: 'error',
    })
  }
}

async function deleteSubtask(subtaskId: string) {
  try {
    await $fetch(`/api/agency/tasks/${subtaskId}`, { method: 'DELETE' })
    subtasks.value = subtasks.value.filter(s => s.id !== subtaskId)
    toast.add({ title: 'Subtask deleted', color: 'success' })
  } catch (err: any) {
    toast.add({
      title: 'Failed to delete subtask',
      description: err?.data?.statusMessage || 'Something went wrong',
      color: 'error',
    })
  }
}

function cancelAdd() {
  showAddForm.value = false
  newTitle.value = ''
}

// Fetch on mount and when taskId changes
watch(() => props.taskId, () => {
  if (props.taskId) fetchSubtasks()
}, { immediate: true })

defineExpose({ refresh: fetchSubtasks })
</script>
