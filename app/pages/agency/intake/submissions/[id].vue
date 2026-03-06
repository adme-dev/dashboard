<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Submission Details',
  middleware: ['auth']
})

const route = useRoute()
const toast = useToast()
const submissionId = route.params.id as string

// Fetch submission
const { data: submissionData, pending: loading, refresh } = await useFetch(`/api/agency/intake/submissions/${submissionId}`)
const submission = computed(() => (submissionData.value as any)?.submission || null)
const formFields = computed(() => (submissionData.value as any)?.formFields || [])
const activities = computed(() => (submissionData.value as any)?.activities || [])

// Fetch team members for assignment
const { data: teamData } = await useFetch('/api/agency/team-members')
const teamMembers = computed(() => ((teamData.value as any)?.members || []) as any[])

// Fetch clients for conversion
const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 100 } })
const clients = computed(() => ((clientsData.value as any)?.clients || []) as any[])

// Status options
const statusOptions = [
  { label: 'Pending', value: 'pending' },
  { label: 'Reviewing', value: 'reviewing' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Archived', value: 'archived' }
]

// Priority options
const priorityOptions = [
  { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' },
  { label: 'Normal', value: 'normal' },
  { label: 'Low', value: 'low' }
]

// Status badge colors
const getStatusColor = (status: string): 'neutral' | 'info' | 'warning' | 'success' | 'error' => {
  switch (status) {
    case 'pending': return 'warning'
    case 'reviewing': return 'info'
    case 'approved': return 'success'
    case 'rejected': return 'error'
    case 'converted': return 'success'
    case 'archived': return 'neutral'
    default: return 'neutral'
  }
}

// Priority badge colors
const getPriorityColor = (priority: string): 'neutral' | 'info' | 'warning' | 'error' => {
  switch (priority) {
    case 'urgent': return 'error'
    case 'high': return 'warning'
    case 'normal': return 'info'
    case 'low': return 'neutral'
    default: return 'neutral'
  }
}

// Format date
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

const formatDateTime = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

// Get field value display
const getFieldValue = (fieldKey: string) => {
  if (!submission.value?.data) return '—'
  const value = submission.value.data[fieldKey]
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  return value
}

// Get field label
const getFieldLabel = (fieldKey: string) => {
  const field = formFields.value.find((f: any) => f.fieldKey === fieldKey)
  return field?.label || fieldKey
}

// Update submission
const updating = ref(false)
const updateSubmission = async (updates: Record<string, any>) => {
  updating.value = true
  try {
    await $fetch(`/api/agency/intake/submissions/${submissionId}`, {
      method: 'PUT',
      body: updates
    })
    toast.add({ title: 'Submission updated', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update', description: err.data?.message, color: 'error' })
  } finally {
    updating.value = false
  }
}

// Convert to project modal
const showConvertModal = ref(false)
const convertData = ref({
  clientId: '' as string,
  projectName: ''
})
const converting = ref(false)

const openConvertModal = () => {
  if (submission.value?.client?.id) {
    convertData.value.clientId = submission.value.client.id
  }
  convertData.value.projectName = submission.value?.data?.project_name ||
                                   submission.value?.data?.name ||
                                   `Project from ${submission.value?.submittedBy?.name || 'submission'}`
  showConvertModal.value = true
}

const convertToProject = async () => {
  if (!convertData.value.clientId || !convertData.value.projectName) {
    toast.add({ title: 'Please fill in required fields', color: 'error' })
    return
  }

  converting.value = true
  try {
    const result = await $fetch(`/api/agency/intake/submissions/${submissionId}/convert`, {
      method: 'POST',
      body: convertData.value
    }) as any

    toast.add({ title: 'Project created', color: 'success' })
    showConvertModal.value = false
    navigateTo(`/agency/projects/${result.projectId}`)
  } catch (err: any) {
    toast.add({ title: 'Failed to convert', description: err.data?.message, color: 'error' })
  } finally {
    converting.value = false
  }
}

// Activity icon
const getActivityIcon = (type: string) => {
  switch (type) {
    case 'created': return 'i-lucide-plus-circle'
    case 'viewed': return 'i-lucide-eye'
    case 'assigned': return 'i-lucide-user-plus'
    case 'status_change': return 'i-lucide-refresh-cw'
    case 'comment': return 'i-lucide-message-square'
    case 'priority_change': return 'i-lucide-flag'
    case 'converted': return 'i-lucide-folder-plus'
    case 'archived': return 'i-lucide-archive'
    default: return 'i-lucide-activity'
  }
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar :title="submission?.submittedBy?.name || 'Loading...'">
        <template #left>
          <UButton
            variant="ghost"
            icon="i-lucide-arrow-left"
            to="/agency/intake"
          />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              v-if="submission && !submission.convertedProject"
              color="primary"
              icon="i-lucide-folder-plus"
              label="Convert to Project"
              @click="openConvertModal"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6" v-if="!loading && submission">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Main Content -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Submission Header -->
            <UCard>
              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center gap-3 mb-2">
                    <h2 class="text-xl font-semibold">
                      {{ submission.submittedBy.name || submission.submittedBy.email }}
                    </h2>
                    <UBadge :color="getStatusColor(submission.status)" variant="subtle">
                      {{ submission.status }}
                    </UBadge>
                    <UBadge :color="getPriorityColor(submission.priority)" variant="subtle">
                      {{ submission.priority }}
                    </UBadge>
                  </div>
                  <div class="text-sm text-gray-500 space-y-1">
                    <p>
                      <UIcon name="i-lucide-mail" class="w-4 h-4 inline-block mr-1" />
                      {{ submission.submittedBy.email }}
                    </p>
                    <p v-if="submission.submittedBy.phone">
                      <UIcon name="i-lucide-phone" class="w-4 h-4 inline-block mr-1" />
                      {{ submission.submittedBy.phone }}
                    </p>
                    <p v-if="submission.submittedBy.company">
                      <UIcon name="i-lucide-building" class="w-4 h-4 inline-block mr-1" />
                      {{ submission.submittedBy.company }}
                    </p>
                  </div>
                </div>

                <div class="text-right text-sm text-gray-500">
                  <p>Submitted {{ formatDateTime(submission.createdAt) }}</p>
                  <p class="mt-1">via {{ submission.formName }}</p>
                </div>
              </div>

              <!-- Converted Project Link -->
              <div v-if="submission.convertedProject" class="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-emerald-500" />
                  <span class="font-medium text-emerald-700 dark:text-emerald-400">Converted to Project</span>
                </div>
                <NuxtLink
                  :to="`/agency/projects/${submission.convertedProject.id}`"
                  class="text-sm text-emerald-600 hover:underline mt-1 block"
                >
                  {{ submission.convertedProject.name }} →
                </NuxtLink>
              </div>
            </UCard>

            <!-- Form Responses -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Form Responses</h3>
              </template>

              <div class="divide-y divide-gray-100 dark:divide-gray-800">
                <div
                  v-for="field in formFields"
                  :key="field.id"
                  class="py-3 first:pt-0 last:pb-0"
                >
                  <template v-if="!['heading', 'paragraph', 'divider'].includes(field.fieldType)">
                    <p class="text-sm font-medium text-gray-500 mb-1">{{ field.label }}</p>
                    <p class="text-gray-900 dark:text-gray-100">{{ getFieldValue(field.fieldKey) }}</p>
                  </template>
                </div>
              </div>

              <div v-if="formFields.length === 0" class="text-center py-8 text-gray-500">
                No form data available.
              </div>
            </UCard>

            <!-- Attachments -->
            <UCard v-if="submission.attachmentCount > 0">
              <template #header>
                <h3 class="font-semibold">Attachments</h3>
              </template>

              <div class="grid grid-cols-2 gap-3">
                <div
                  v-for="attachment in submission.attachments"
                  :key="attachment.id"
                  class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <UIcon name="i-lucide-file" class="w-8 h-8 text-gray-400" />
                  <div class="flex-1 min-w-0">
                    <p class="font-medium truncate">{{ attachment.fileName }}</p>
                    <p class="text-xs text-gray-500">{{ attachment.fileType }}</p>
                  </div>
                  <UButton
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-download"
                    :href="attachment.fileUrl"
                    target="_blank"
                  />
                </div>
              </div>
            </UCard>

            <!-- Activity Feed -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Activity</h3>
              </template>

              <div class="space-y-4">
                <div
                  v-for="activity in activities"
                  :key="activity.id"
                  class="flex items-start gap-3"
                >
                  <div class="p-2 rounded-full bg-gray-100 dark:bg-gray-800">
                    <UIcon :name="getActivityIcon(activity.activityType)" class="w-4 h-4 text-gray-500" />
                  </div>
                  <div class="flex-1">
                    <p class="text-sm">
                      <span v-if="activity.userName" class="font-medium">{{ activity.userName }}</span>
                      <span v-else class="font-medium">System</span>
                      <template v-if="activity.activityType === 'created'"> submitted this form</template>
                      <template v-else-if="activity.activityType === 'status_change'">
                        changed status from <span class="font-medium">{{ activity.oldValue }}</span>
                        to <span class="font-medium">{{ activity.newValue }}</span>
                      </template>
                      <template v-else-if="activity.activityType === 'assigned'">
                        assigned to <span class="font-medium">{{ activity.newValue }}</span>
                      </template>
                      <template v-else-if="activity.activityType === 'priority_change'">
                        changed priority to <span class="font-medium">{{ activity.newValue }}</span>
                      </template>
                      <template v-else-if="activity.activityType === 'converted'">
                        converted to project
                      </template>
                      <template v-else-if="activity.activityType === 'comment'">
                        added a comment
                      </template>
                      <template v-else>
                        {{ activity.activityType }}
                      </template>
                    </p>
                    <p v-if="activity.comment" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {{ activity.comment }}
                    </p>
                    <p class="text-xs text-gray-400 mt-1">{{ formatDateTime(activity.createdAt) }}</p>
                  </div>
                </div>

                <div v-if="activities.length === 0" class="text-center py-4 text-gray-500">
                  No activity recorded.
                </div>
              </div>
            </UCard>
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Actions -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Actions</h3>
              </template>

              <div class="space-y-4">
                <UFormField label="Status">
                  <USelectMenu
                    :model-value="submission.status"
                    :items="statusOptions"
                    value-key="value"
                    :disabled="updating"
                    @update:model-value="updateSubmission({ status: $event })"
                  />
                </UFormField>

                <UFormField label="Priority">
                  <USelectMenu
                    :model-value="submission.priority"
                    :items="priorityOptions"
                    value-key="value"
                    :disabled="updating"
                    @update:model-value="updateSubmission({ priority: $event })"
                  />
                </UFormField>

                <UFormField label="Assigned To">
                  <USelectMenu
                    :model-value="submission.assignedTo?.id"
                    :items="[{ label: 'Unassigned', value: null }, ...teamMembers.map(m => ({ label: m.name, value: m.id }))]"
                    value-key="value"
                    :disabled="updating"
                    @update:model-value="updateSubmission({ assignedTo: $event })"
                  />
                </UFormField>
              </div>
            </UCard>

            <!-- Client -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Client</h3>
              </template>

              <div v-if="submission.client">
                <NuxtLink
                  :to="`/agency/clients/${submission.client.id}`"
                  class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                    <span class="text-primary-600 dark:text-primary-400 font-medium">
                      {{ submission.client.name.charAt(0) }}
                    </span>
                  </div>
                  <div>
                    <p class="font-medium">{{ submission.client.name }}</p>
                    <p class="text-xs text-gray-500">View client →</p>
                  </div>
                </NuxtLink>
              </div>
              <div v-else class="text-center py-4 text-gray-500">
                No client linked
              </div>
            </UCard>

            <!-- Review Notes -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Review Notes</h3>
              </template>

              <UTextarea
                :model-value="submission.reviewNotes || ''"
                placeholder="Add notes about this submission..."
                :rows="4"
                @blur="updateSubmission({ reviewNotes: ($event.target as HTMLTextAreaElement).value })"
              />

              <template v-if="submission.reviewedBy" #footer>
                <p class="text-xs text-gray-500">
                  Last reviewed by {{ submission.reviewedBy.name }} on {{ formatDate(submission.reviewedAt) }}
                </p>
              </template>
            </UCard>

            <!-- Source Info -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Source</h3>
              </template>

              <dl class="text-sm space-y-2">
                <div>
                  <dt class="text-gray-500">Source</dt>
                  <dd class="font-medium">{{ submission.source || 'Direct' }}</dd>
                </div>
                <div v-if="submission.referrerUrl">
                  <dt class="text-gray-500">Referrer</dt>
                  <dd class="font-medium truncate">{{ submission.referrerUrl }}</dd>
                </div>
              </dl>
            </UCard>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-6" v-else>
        <div class="flex items-center justify-center py-12">
          <XfLoader />
        </div>
      </div>
    </UDashboardPanel>

    <!-- Convert to Project Modal -->
    <UModal v-model:open="showConvertModal">
      <template #header>
        <h3 class="font-semibold">Convert to Project</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Client" required>
            <USelectMenu
              v-model="convertData.clientId"
              :items="clients.map(c => ({ label: c.name, value: c.id }))"
              placeholder="Select client"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Project Name" required>
            <UInput v-model="convertData.projectName" placeholder="Enter project name" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showConvertModal = false" />
          <UButton
            color="primary"
            label="Create Project"
            :loading="converting"
            @click="convertToProject"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
