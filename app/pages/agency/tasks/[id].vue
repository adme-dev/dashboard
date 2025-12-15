<script setup lang="ts">
import { format, formatDistanceToNow } from 'date-fns'

definePageMeta({
  title: 'Task Details',
  middleware: ['auth']
})

const route = useRoute()
const toast = useToast()
const taskId = route.params.id as string

// Fetch task data
const { data: taskData, pending, refresh } = await useFetch(`/api/agency/tasks/${taskId}`)

const task = computed(() => taskData.value as any)

// Active tab
const activeTab = ref('details')

// Format helpers
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

const formatDateTime = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

const formatRelative = (date: string) => {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Priority colors
const getPriorityColor = (priority: string): 'error' | 'warning' | 'info' | 'neutral' => {
  switch (priority) {
    case 'urgent': return 'error'
    case 'high': return 'warning'
    case 'medium': return 'info'
    default: return 'neutral'
  }
}

const getPriorityLabel = (priority: string) => {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

// Activity type icons
const getActivityIcon = (type: string) => {
  switch (type) {
    case 'created': return 'i-lucide-plus'
    case 'status_changed': return 'i-lucide-arrow-right'
    case 'assignee_changed': return 'i-lucide-user'
    case 'comment': return 'i-lucide-message-circle'
    case 'attachment': return 'i-lucide-paperclip'
    case 'priority_changed': return 'i-lucide-flag'
    default: return 'i-lucide-activity'
  }
}

// Comments
const newComment = ref('')
const submittingComment = ref(false)

const submitComment = async () => {
  if (!newComment.value.trim()) return

  submittingComment.value = true
  try {
    await $fetch(`/api/agency/tasks/${taskId}/comments`, {
      method: 'POST',
      body: { content: newComment.value }
    })
    toast.add({ title: 'Comment added', color: 'success' })
    newComment.value = ''
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to add comment', description: err.data?.message || err.message, color: 'error' })
  } finally {
    submittingComment.value = false
  }
}

// Status change
const changingStatus = ref(false)
const { data: statusesData } = await useFetch('/api/agency/statuses')
const statuses = computed(() => ((statusesData.value as any)?.statuses || []) as any[])

const changeStatus = async (statusId: string) => {
  changingStatus.value = true
  try {
    await $fetch(`/api/agency/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: { statusId }
    })
    toast.add({ title: 'Status updated', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update status', description: err.data?.message || err.message, color: 'error' })
  } finally {
    changingStatus.value = false
  }
}

// Assignee change
const { data: teamData } = await useFetch('/api/agency/team-members')
const teamMembers = computed(() => ((teamData.value as any)?.members || []) as any[])

const changeAssignee = async (assigneeId: string | null) => {
  try {
    await $fetch(`/api/agency/tasks/${taskId}/assignee`, {
      method: 'PATCH',
      body: { assigneeId }
    })
    toast.add({ title: 'Assignee updated', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update assignee', description: err.data?.message || err.message, color: 'error' })
  }
}

// Edit modal
const showEditModal = ref(false)
const editForm = ref({
  title: '',
  description: '',
  priority: 'medium',
  dueDate: '',
  estimatedHours: null as number | null
})

const openEditModal = () => {
  if (task.value) {
    editForm.value = {
      title: task.value.title,
      description: task.value.description || '',
      priority: task.value.priority,
      dueDate: task.value.dueDate ? task.value.dueDate.split('T')[0] : '',
      estimatedHours: task.value.estimatedHours
    }
    showEditModal.value = true
  }
}

const saving = ref(false)
const saveTask = async () => {
  saving.value = true
  try {
    await $fetch(`/api/agency/tasks/${taskId}`, {
      method: 'PUT',
      body: editForm.value
    })
    toast.add({ title: 'Task updated', color: 'success' })
    showEditModal.value = false
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update task', description: err.data?.message || err.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' }
]
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar>
        <template #left>
          <div class="flex items-center gap-3">
            <UButton
              variant="ghost"
              icon="i-lucide-arrow-left"
              to="/agency/workflow"
            />
            <div v-if="task">
              <div class="flex items-center gap-2">
                <h1 class="text-xl font-semibold">{{ task.title }}</h1>
                <UBadge :color="getPriorityColor(task.priority)" variant="subtle" size="sm">
                  {{ getPriorityLabel(task.priority) }}
                </UBadge>
              </div>
              <div class="flex items-center gap-2 text-sm text-gray-500">
                <span v-if="task.project">{{ task.project.clientName }} / {{ task.project.name }}</span>
                <span v-else>{{ task.department?.name }}</span>
                <span v-if="task.taskType">• {{ task.taskType }}</span>
              </div>
            </div>
          </div>
        </template>
        <template #right>
          <div class="flex gap-2">
            <UButton
              label="Edit"
              icon="i-lucide-pencil"
              variant="outline"
              @click="openEditModal"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <template v-else-if="task">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Main Content -->
            <div class="lg:col-span-2 space-y-6">
              <!-- Status Bar -->
              <UCard>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-4">
                    <div>
                      <p class="text-xs text-gray-500 mb-1">Status</p>
                      <USelectMenu
                        :model-value="task.statusId"
                        :items="statuses.map(s => ({ label: s.name, value: s.id, color: s.color }))"
                        value-key="value"
                        :loading="changingStatus"
                        @update:model-value="changeStatus"
                      >
                        <template #default>
                          <UBadge
                            :style="{ backgroundColor: task.status?.color + '20', color: task.status?.color }"
                            variant="subtle"
                          >
                            {{ task.status?.name }}
                          </UBadge>
                        </template>
                      </USelectMenu>
                    </div>
                    <div>
                      <p class="text-xs text-gray-500 mb-1">Assignee</p>
                      <USelectMenu
                        :model-value="task.assigneeId"
                        :items="[{ label: 'Unassigned', value: null }, ...teamMembers.map(m => ({ label: m.name, value: m.id }))]"
                        value-key="value"
                        placeholder="Unassigned"
                        @update:model-value="changeAssignee"
                      >
                        <template #default>
                          <div class="flex items-center gap-2">
                            <UAvatar
                              v-if="task.assignee"
                              :text="task.assignee.name.charAt(0)"
                              size="xs"
                            />
                            <span>{{ task.assignee?.name || 'Unassigned' }}</span>
                          </div>
                        </template>
                      </USelectMenu>
                    </div>
                  </div>
                  <div class="flex items-center gap-4 text-sm text-gray-500">
                    <div v-if="task.dueDate">
                      <UIcon name="i-lucide-calendar" class="w-4 h-4 inline mr-1" />
                      Due {{ formatDate(task.dueDate) }}
                    </div>
                    <div v-if="task.estimatedHours">
                      <UIcon name="i-lucide-clock" class="w-4 h-4 inline mr-1" />
                      {{ task.estimatedHours }}h estimated
                    </div>
                  </div>
                </div>
              </UCard>

              <!-- Tabs -->
              <UTabs
                v-model="activeTab"
                :items="[
                  { label: 'Details', value: 'details', icon: 'i-lucide-file-text' },
                  { label: 'Subtasks', value: 'subtasks', icon: 'i-lucide-list-checks', badge: task.subtasks?.length?.toString() },
                  { label: 'Activity', value: 'activity', icon: 'i-lucide-activity' },
                  { label: 'Attachments', value: 'attachments', icon: 'i-lucide-paperclip', badge: task.attachments?.length?.toString() }
                ]"
              />

              <!-- Details Tab -->
              <div v-if="activeTab === 'details'">
                <UCard>
                  <template #header>
                    <h3 class="font-semibold">Description</h3>
                  </template>
                  <div v-if="task.description" class="prose prose-sm dark:prose-invert max-w-none">
                    {{ task.description }}
                  </div>
                  <p v-else class="text-gray-500 italic">No description provided</p>
                </UCard>

                <!-- Labels -->
                <UCard v-if="task.labels?.length" class="mt-4">
                  <template #header>
                    <h3 class="font-semibold">Labels</h3>
                  </template>
                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      v-for="label in task.labels"
                      :key="label.id"
                      :style="{ backgroundColor: label.color + '20', color: label.color }"
                      variant="subtle"
                    >
                      {{ label.name }}
                    </UBadge>
                  </div>
                </UCard>

                <!-- Dependencies -->
                <UCard v-if="task.dependencies?.length || task.dependents?.length" class="mt-4">
                  <template #header>
                    <h3 class="font-semibold">Dependencies</h3>
                  </template>
                  <div class="space-y-4">
                    <div v-if="task.dependencies?.length">
                      <p class="text-sm text-gray-500 mb-2">Blocked by:</p>
                      <div class="space-y-2">
                        <div
                          v-for="dep in task.dependencies"
                          :key="dep.dependencyId"
                          class="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-800"
                        >
                          <NuxtLink :to="`/agency/tasks/${dep.task.id}`" class="hover:text-primary-500">
                            {{ dep.task.title }}
                          </NuxtLink>
                          <UBadge
                            :style="{ backgroundColor: dep.task.status.color + '20', color: dep.task.status.color }"
                            variant="subtle"
                            size="xs"
                          >
                            {{ dep.task.status.name }}
                          </UBadge>
                        </div>
                      </div>
                    </div>
                    <div v-if="task.dependents?.length">
                      <p class="text-sm text-gray-500 mb-2">Blocking:</p>
                      <div class="space-y-2">
                        <div
                          v-for="dep in task.dependents"
                          :key="dep.dependencyId"
                          class="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-800"
                        >
                          <NuxtLink :to="`/agency/tasks/${dep.task.id}`" class="hover:text-primary-500">
                            {{ dep.task.title }}
                          </NuxtLink>
                          <UBadge
                            :style="{ backgroundColor: dep.task.status.color + '20', color: dep.task.status.color }"
                            variant="subtle"
                            size="xs"
                          >
                            {{ dep.task.status.name }}
                          </UBadge>
                        </div>
                      </div>
                    </div>
                  </div>
                </UCard>
              </div>

              <!-- Subtasks Tab -->
              <div v-if="activeTab === 'subtasks'">
                <UCard>
                  <div v-if="task.subtasks?.length" class="space-y-2">
                    <div
                      v-for="subtask in task.subtasks"
                      :key="subtask.id"
                      class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div class="flex items-center gap-3">
                        <UCheckbox :model-value="!!subtask.completedAt" disabled />
                        <div>
                          <NuxtLink :to="`/agency/tasks/${subtask.id}`" class="font-medium hover:text-primary-500">
                            {{ subtask.title }}
                          </NuxtLink>
                          <div class="flex items-center gap-2 mt-1">
                            <UBadge :color="getPriorityColor(subtask.priority)" variant="subtle" size="xs">
                              {{ subtask.priority }}
                            </UBadge>
                            <span v-if="subtask.dueDate" class="text-xs text-gray-500">
                              Due {{ formatDate(subtask.dueDate) }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <span v-if="subtask.assigneeName" class="text-sm text-gray-500">
                          {{ subtask.assigneeName }}
                        </span>
                        <UBadge
                          :style="{ backgroundColor: subtask.status.color + '20', color: subtask.status.color }"
                          variant="subtle"
                          size="xs"
                        >
                          {{ subtask.status.name }}
                        </UBadge>
                      </div>
                    </div>
                  </div>
                  <div v-else class="text-center text-gray-500 py-8">
                    No subtasks yet
                  </div>
                </UCard>
              </div>

              <!-- Activity Tab -->
              <div v-if="activeTab === 'activity'">
                <!-- Comment Form -->
                <UCard class="mb-4">
                  <div class="flex gap-3">
                    <UAvatar text="U" size="sm" />
                    <div class="flex-1">
                      <UTextarea
                        v-model="newComment"
                        placeholder="Add a comment..."
                        :rows="2"
                      />
                      <div class="flex justify-end mt-2">
                        <UButton
                          label="Comment"
                          size="sm"
                          :loading="submittingComment"
                          :disabled="!newComment.trim()"
                          @click="submitComment"
                        />
                      </div>
                    </div>
                  </div>
                </UCard>

                <UCard>
                  <div v-if="task.recentActivity?.length" class="space-y-4">
                    <div
                      v-for="activity in task.recentActivity"
                      :key="activity.id"
                      class="flex gap-3"
                    >
                      <div class="p-2 rounded-full bg-gray-100 dark:bg-gray-800 h-fit">
                        <UIcon :name="getActivityIcon(activity.type)" class="w-4 h-4 text-gray-500" />
                      </div>
                      <div class="flex-1">
                        <div class="flex items-center justify-between">
                          <p class="text-sm">
                            <span class="font-medium">{{ activity.userName || 'System' }}</span>
                            <span class="text-gray-500">
                              {{ activity.type === 'comment' ? 'commented' : activity.type.replace('_', ' ') }}
                            </span>
                          </p>
                          <span class="text-xs text-gray-400">{{ formatRelative(activity.createdAt) }}</span>
                        </div>
                        <p v-if="activity.content" class="text-sm mt-1 text-gray-600 dark:text-gray-400">
                          {{ activity.content }}
                        </p>
                        <p v-if="activity.oldValue && activity.newValue" class="text-xs text-gray-500 mt-1">
                          {{ activity.oldValue }} → {{ activity.newValue }}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div v-else class="text-center text-gray-500 py-8">
                    No activity yet
                  </div>
                </UCard>
              </div>

              <!-- Attachments Tab -->
              <div v-if="activeTab === 'attachments'">
                <UCard>
                  <div v-if="task.attachments?.length" class="space-y-2">
                    <div
                      v-for="attachment in task.attachments"
                      :key="attachment.id"
                      class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div class="flex items-center gap-3">
                        <UIcon name="i-lucide-file" class="w-5 h-5 text-gray-400" />
                        <div>
                          <p class="font-medium">{{ attachment.fileName }}</p>
                          <p class="text-xs text-gray-500">
                            {{ formatFileSize(attachment.fileSize) }} • {{ attachment.uploadedByName }} • {{ formatRelative(attachment.createdAt) }}
                          </p>
                        </div>
                      </div>
                      <UButton
                        variant="ghost"
                        icon="i-lucide-download"
                        size="xs"
                        :to="attachment.fileUrl"
                        target="_blank"
                      />
                    </div>
                  </div>
                  <div v-else class="text-center text-gray-500 py-8">
                    No attachments yet
                  </div>
                </UCard>
              </div>
            </div>

            <!-- Sidebar -->
            <div class="space-y-4">
              <!-- Task Info -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Task Info</h3>
                </template>
                <dl class="space-y-3 text-sm">
                  <div>
                    <dt class="text-gray-500">Created</dt>
                    <dd>{{ formatDateTime(task.createdAt) }}</dd>
                  </div>
                  <div v-if="task.reporter">
                    <dt class="text-gray-500">Reporter</dt>
                    <dd>{{ task.reporter.name }}</dd>
                  </div>
                  <div>
                    <dt class="text-gray-500">Department</dt>
                    <dd class="flex items-center gap-2">
                      <span
                        class="w-2 h-2 rounded-full"
                        :style="{ backgroundColor: task.department?.color }"
                      />
                      {{ task.department?.name }}
                    </dd>
                  </div>
                  <div v-if="task.project">
                    <dt class="text-gray-500">Project</dt>
                    <dd>
                      <NuxtLink :to="`/agency/projects/${task.project.id}`" class="hover:text-primary-500">
                        {{ task.project.name }}
                      </NuxtLink>
                    </dd>
                  </div>
                  <div v-if="task.parent">
                    <dt class="text-gray-500">Parent Task</dt>
                    <dd>
                      <NuxtLink :to="`/agency/tasks/${task.parent.id}`" class="hover:text-primary-500">
                        {{ task.parent.title }}
                      </NuxtLink>
                    </dd>
                  </div>
                  <div v-if="task.startDate">
                    <dt class="text-gray-500">Start Date</dt>
                    <dd>{{ formatDate(task.startDate) }}</dd>
                  </div>
                  <div v-if="task.dueDate">
                    <dt class="text-gray-500">Due Date</dt>
                    <dd>{{ formatDate(task.dueDate) }}</dd>
                  </div>
                  <div v-if="task.estimatedHours">
                    <dt class="text-gray-500">Estimated</dt>
                    <dd>{{ task.estimatedHours }} hours</dd>
                  </div>
                  <div v-if="task.actualHours">
                    <dt class="text-gray-500">Actual</dt>
                    <dd>{{ task.actualHours }} hours</dd>
                  </div>
                  <div v-if="task.completedAt">
                    <dt class="text-gray-500">Completed</dt>
                    <dd>{{ formatDateTime(task.completedAt) }}</dd>
                  </div>
                </dl>
              </UCard>

              <!-- Blocked Alert -->
              <UCard v-if="task.isBlocked" class="border-red-200 dark:border-red-800">
                <div class="flex items-start gap-3">
                  <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div>
                    <p class="font-medium text-red-600 dark:text-red-400">Task is Blocked</p>
                    <p v-if="task.blockedReason" class="text-sm text-gray-500 mt-1">
                      {{ task.blockedReason }}
                    </p>
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </template>
      </UDashboardPanelContent>
    </UDashboardPanel>

    <!-- Edit Modal -->
    <UModal v-model:open="showEditModal">
      <template #header>
        <h3 class="font-semibold">Edit Task</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Title" required>
            <UInput v-model="editForm.title" />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="editForm.description" :rows="4" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Priority">
              <USelectMenu
                v-model="editForm.priority"
                :items="priorityOptions"
                value-key="value"
              />
            </UFormField>

            <UFormField label="Due Date">
              <UInput v-model="editForm.dueDate" type="date" />
            </UFormField>
          </div>

          <UFormField label="Estimated Hours">
            <UInput v-model.number="editForm.estimatedHours" type="number" min="0" step="0.5" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showEditModal = false" />
          <UButton
            color="primary"
            label="Save Changes"
            :loading="saving"
            @click="saveTask"
          />
        </div>
      </template>
    </UModal>
  </UDashboardPage>
</template>
