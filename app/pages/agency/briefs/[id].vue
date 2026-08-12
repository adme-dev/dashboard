<script setup lang="ts">
import { format, formatDistanceToNow } from 'date-fns'
import type { Brief, BriefComment, BriefActivity, BriefStatus } from '~/types'

const route = useRoute()
const toast = useToast()
const { user, isAdmin } = useAuth()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const briefId = computed(() => route.params.id as string)

// Fetch brief details
const brief = ref<Brief | null>(null)
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    brief.value = await apiFetch<Brief>(`/api/agency/briefs/${briefId.value}`)
  } catch {
    brief.value = null
  } finally {
    pending.value = false
  }
}

// Fetch comments
const comments = ref<BriefComment[]>([])

async function refreshComments() {
  comments.value = await apiFetch<BriefComment[]>(`/api/agency/briefs/${briefId.value}/comments`).catch(() => [])
}

// Fetch activities
const activities = ref<BriefActivity[]>([])

async function refreshActivities() {
  activities.value = await apiFetch<BriefActivity[]>(`/api/agency/briefs/${briefId.value}/activities`).catch(() => [])
}

await Promise.all([refresh(), refreshComments(), refreshActivities()])

// Page meta
definePageMeta({
  title: 'Brief Details'
})

// Active tab
const activeTab = ref('details')
const tabs = [
  { key: 'details', label: 'Details', icon: 'i-lucide-file-text' },
  { key: 'comments', label: 'Comments', icon: 'i-lucide-message-square' },
  { key: 'activity', label: 'Activity', icon: 'i-lucide-activity' }
]

// New comment state
const newComment = ref('')
const isSubmittingComment = ref(false)

// Status update state
const isUpdatingStatus = ref(false)
const selectedStatus = ref<BriefStatus | null>(null)

// Convert to project state
const showConvertModal = ref(false)
const convertProjectName = ref('')
const convertStartDate = ref(new Date().toISOString().split('T')[0])
const isConverting = ref(false)

// Can convert: approved and not yet converted
const canConvert = computed(() => {
  if (!brief.value) return false
  return brief.value.status === 'approved' && !brief.value.convertedToProjectId
})

// G9: roll the brief's linked tasks up to a project-level summary for the Linked Project card.
const linkedProjectSummary = computed(() => {
  const tasks = brief.value?.linkedTasks || []
  // "Done" = the modern status-category signal, NOT is_final (which also flags cancelled).
  const done = tasks.filter((t: any) => t.statusCategory === 'done').length
  // Distinct assignees (skip unassigned), preserving first-seen order.
  const seen = new Set<string>()
  const assignees: Array<{ id: string, name: string }> = []
  for (const t of tasks as any[]) {
    if (t.assigneeId && t.assigneeName && !seen.has(t.assigneeId)) {
      seen.add(t.assigneeId)
      assignees.push({ id: t.assigneeId, name: t.assigneeName })
    }
  }
  return { total: tasks.length, done, assignees }
})

// Available status transitions based on current status
const availableStatuses = computed(() => {
  if (!brief.value) return []

  const transitions: Record<string, BriefStatus[]> = {
    draft: ['submitted'],
    submitted: ['under_review', 'rejected'],
    under_review: ['needs_info', 'approved', 'rejected'],
    needs_info: ['under_review', 'cancelled'],
    approved: ['in_progress', 'cancelled'],
    rejected: ['draft'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: ['draft']
  }

  return transitions[brief.value.status] || []
})

// Status badge color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'draft': return 'neutral'
    case 'submitted': return 'info'
    case 'under_review': return 'warning'
    case 'needs_info': return 'warning'
    case 'approved': return 'success'
    case 'rejected': return 'error'
    case 'in_progress': return 'info'
    case 'completed': return 'success'
    case 'cancelled': return 'error'
    default: return 'neutral'
  }
}

// Priority badge color
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'error'
    case 'high': return 'warning'
    case 'medium': return 'info'
    case 'low': return 'neutral'
    default: return 'neutral'
  }
}

// Format status label
const formatStatus = (status: string) => {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function formatConversionFollowups(result: any): string {
  const parts: string[] = []
  const allocationCount = Number(result?.budgetAllocationsCreated ?? 0)
  if (allocationCount > 0) {
    parts.push(`${allocationCount} budget allocation${allocationCount === 1 ? '' : 's'} proposed`)
  }

  const gaps = Array.isArray(result?.gatekeeper?.gaps) ? result.gatekeeper.gaps : []
  const required = gaps.filter((gap: any) => gap?.severity === 'required').length
  const recommended = gaps.filter((gap: any) => gap?.severity === 'recommended').length
  if (required > 0) {
    parts.push(`${required} required review item${required === 1 ? '' : 's'}`)
  } else if (recommended > 0) {
    parts.push(`${recommended} recommended review item${recommended === 1 ? '' : 's'}`)
  }

  return parts.length ? `; ${parts.join('; ')}` : ''
}

// Get activity icon
const getActivityIcon = (type: string) => {
  switch (type) {
    case 'created': return 'i-lucide-plus-circle'
    case 'submitted': return 'i-lucide-send'
    case 'status_change': return 'i-lucide-refresh-cw'
    case 'comment': return 'i-lucide-message-square'
    case 'attachment': return 'i-lucide-paperclip'
    case 'assigned': return 'i-lucide-user-plus'
    case 'priority_change': return 'i-lucide-flag'
    default: return 'i-lucide-activity'
  }
}

// Group field values by section
const fieldValuesBySection = computed(() => {
  if (!brief.value?.fieldValues) return []

  const sections = new Map<string, any[]>()

  for (const fv of brief.value.fieldValues) {
    const section = fv.section || 'General Information'
    if (!sections.has(section)) {
      sections.set(section, [])
    }
    sections.get(section)!.push(fv)
  }

  return Array.from(sections.entries()).map(([name, fields]) => ({
    name,
    fields: fields.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  }))
})

// Format field value for display
const formatFieldValue = (field: any) => {
  if (field.value === null || field.value === undefined) return '-'

  switch (field.fieldType) {
    case 'date':
    case 'datetime':
      return format(new Date(field.value), 'MMM d, yyyy')
    case 'daterange':
      if (typeof field.value === 'object') {
        return `${format(new Date(field.value.start), 'MMM d, yyyy')} - ${format(new Date(field.value.end), 'MMM d, yyyy')}`
      }
      return field.value
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(field.value)
    case 'checkbox':
      return field.value ? 'Yes' : 'No'
    case 'multiselect':
    case 'checkboxgroup':
      if (Array.isArray(field.value)) {
        return field.value.join(', ')
      }
      return field.value
    case 'files':
    case 'images':
      if (Array.isArray(field.value)) {
        return `${field.value.length} file(s) attached`
      }
      return field.value
    case 'rating':
      return '★'.repeat(field.value) + '☆'.repeat(5 - field.value)
    default:
      if (typeof field.value === 'object') {
        return JSON.stringify(field.value, null, 2)
      }
      return String(field.value)
  }
}

// Submit comment
async function submitComment() {
  if (!newComment.value.trim()) return

  isSubmittingComment.value = true

  try {
    await apiFetch(`/api/agency/briefs/${briefId.value}/comments`, {
      method: 'POST',
      body: {
        content: newComment.value,
        isInternal: false
      }
    })

    newComment.value = ''
    await refreshComments()
    await refreshActivities()

    toast.add({
      title: 'Comment Added',
      color: 'success',
      duration: 3000
    })
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.statusMessage || 'Failed to add comment',
      color: 'error',
      duration: 5000
    })
  } finally {
    isSubmittingComment.value = false
  }
}

// Update status
async function updateStatus(status: BriefStatus) {
  isUpdatingStatus.value = true

  try {
    const result = await apiFetch<any>(`/api/agency/briefs/${briefId.value}/status`, {
      method: 'PATCH',
      body: { status }
    })

    await refresh()
    await refreshActivities()

    toast.add({
      title: 'Status Updated',
      description: `Brief status changed to ${formatStatus(status)}`,
      color: 'success',
      duration: 3000
    })

    // Show auto-convert notification if it happened
    if (result?.autoConvert?.projectId) {
      toast.add({
        title: 'Project Created',
        description: `Auto-created project "${result.autoConvert.projectName}" with ${result.autoConvert.tasksCreated} tasks${formatConversionFollowups(result.autoConvert)}`,
        color: 'success',
        duration: 5000
      })
    }

    // Show auto-quote notification if it happened
    if (result?.autoQuote?.quoteId) {
      const autoTasksMsg = result.autoQuote.tasksLinked > 0
        ? ` — ${result.autoQuote.tasksLinked} task${result.autoQuote.tasksLinked > 1 ? 's' : ''} auto-linked`
        : ''
      toast.add({
        title: 'Quote Generated',
        description: `Auto-created ${result.autoQuote.quoteNumber} with ${result.autoQuote.lineItemCount} line items${autoTasksMsg}`,
        color: 'success',
        duration: 5000
      })
    }
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.statusMessage || 'Failed to update status',
      color: 'error',
      duration: 5000
    })
  } finally {
    isUpdatingStatus.value = false
  }
}

// Open convert modal
function openConvertModal() {
  convertProjectName.value = brief.value?.title || ''
  convertStartDate.value = new Date().toISOString().split('T')[0]
  showConvertModal.value = true
}

// Handle conversion
async function handleConvert() {
  if (!convertProjectName.value.trim()) return

  isConverting.value = true

  try {
    const result = await apiFetch<any>(`/api/agency/briefs/${briefId.value}/convert`, {
      method: 'POST',
      body: {
        projectName: convertProjectName.value.trim(),
        startDate: convertStartDate.value || undefined
      }
    })

    showConvertModal.value = false
    await refresh()
    await refreshActivities()

    toast.add({
      title: 'Project Created',
      description: `Created "${result.project.name}" with ${result.tasksCreated} tasks${formatConversionFollowups(result)}`,
      color: 'success',
      duration: 5000
    })
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.statusMessage || 'Failed to convert brief to project',
      color: 'error',
      duration: 5000
    })
  } finally {
    isConverting.value = false
  }
}

// Generate quote state
const isGeneratingQuote = ref(false)

async function generateQuote() {
  isGeneratingQuote.value = true
  try {
    const result = await apiFetch<any>(`/api/agency/briefs/${briefId.value}/generate-quote`, {
      method: 'POST'
    })

    await refresh()

    const tasksMsg = result.tasksLinked > 0
      ? ` — ${result.tasksLinked} task${result.tasksLinked > 1 ? 's' : ''} auto-linked`
      : ''
    toast.add({
      title: 'Quote Generated',
      description: `Created ${result.quoteNumber} with ${result.lineItemCount} line items${tasksMsg}`,
      color: 'success',
      duration: 5000
    })
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.statusMessage || 'Failed to generate quote',
      color: 'error',
      duration: 5000
    })
  } finally {
    isGeneratingQuote.value = false
  }
}

// Can generate quote: approved, no existing quote, admin
const canGenerateQuote = computed(() => {
  if (!brief.value) return false
  return brief.value.status === 'approved' && !brief.value.quote && isAdmin.value
})

// Create task from brief
const showCreateTask = ref(false)

function onTaskCreatedFromBrief() {
  refresh()
}

// Duplicate brief (uses dedicated endpoint that copies field values)
const isDuplicating = ref(false)
async function duplicateBrief() {
  isDuplicating.value = true
  try {
    const result = await apiFetch<any>(`/api/agency/briefs/${briefId.value}/duplicate`, {
      method: 'POST'
    })

    toast.add({
      title: 'Brief Duplicated',
      description: `New draft created: ${result.referenceNumber}`,
      color: 'success',
      duration: 3000
    })

    navigateTo(`/agency/briefs/${result.id}`)
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.statusMessage || 'Failed to duplicate brief',
      color: 'error',
      duration: 5000
    })
  } finally {
    isDuplicating.value = false
  }
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar>
        <template #left>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-arrow-left"
              variant="ghost"
              color="neutral"
              to="/agency/briefs"
            />
            <div v-if="brief">
              <h1 class="text-lg font-semibold">{{ brief.title }}</h1>
              <p class="text-sm text-muted font-mono">{{ brief.referenceNumber }}</p>
            </div>
          </div>
        </template>

        <template #right>
          <div v-if="brief" class="flex items-center gap-3">
            <!-- Status Badge -->
            <UBadge :color="getStatusColor(brief.status)" size="lg">
              {{ formatStatus(brief.status) }}
            </UBadge>

            <!-- Generate Quote Button -->
            <UButton
              v-if="canGenerateQuote"
              icon="i-lucide-receipt"
              variant="outline"
              :loading="isGeneratingQuote"
              @click="generateQuote"
            >
              Generate Quote
            </UButton>

            <!-- Convert to Project Button -->
            <UButton
              v-if="canConvert"
              icon="i-lucide-folder-plus"
              @click="openConvertModal"
            >
              Convert to Project
            </UButton>

            <!-- Status Actions -->
            <UDropdownMenu
              v-if="availableStatuses.length > 0 && isAdmin"
              :items="[availableStatuses.map(s => ({
                label: formatStatus(s),
                onSelect: () => updateStatus(s)
              }))]"
            >
              <UButton
                icon="i-lucide-chevron-down"
                variant="outline"
                :loading="isUpdatingStatus"
              >
                Update Status
              </UButton>
            </UDropdownMenu>

            <!-- More Actions -->
            <UDropdownMenu
              :items="[
                [
                  { label: 'Edit Brief', icon: 'i-lucide-pencil', disabled: brief.status !== 'draft' },
                  { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: duplicateBrief },
                  { label: 'Download PDF', icon: 'i-lucide-download' },
                  { label: 'Print', icon: 'i-lucide-printer' }
                ]
              ]"
            >
              <UButton
                icon="i-lucide-more-horizontal"
                variant="ghost"
                color="neutral"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <!-- Not Found -->
        <div v-else-if="!brief" class="text-center py-12">
          <UIcon name="i-lucide-file-x" class="size-12 mx-auto text-muted mb-4" />
          <h2 class="text-lg font-semibold mb-2">Brief Not Found</h2>
          <p class="text-muted mb-4">The requested brief could not be found.</p>
          <UButton to="/agency/briefs">Back to Briefs</UButton>
        </div>

        <!-- Content -->
        <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Main Content -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Tabs -->
            <UTabs v-model="activeTab" :items="tabs" class="w-full" />

            <!-- Details Tab -->
            <div v-if="activeTab === 'details'" class="space-y-6">
              <BriefsGoogleCampaignBudgetSummary
                v-if="brief.budgetReconciliation"
                :reconciliation="brief.budgetReconciliation"
              />

              <!-- Field Values by Section -->
              <UCard v-for="section in fieldValuesBySection" :key="section.name">
                <template #header>
                  <h3 class="font-semibold">{{ section.name }}</h3>
                </template>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    v-for="field in section.fields"
                    :key="field.fieldKey"
                    :class="{
                      'md:col-span-2': field.width === 'full' || field.fieldType === 'richtext' || field.fieldType === 'textarea'
                    }"
                  >
                    <label class="block text-sm font-medium text-muted mb-1">
                      {{ field.fieldLabel }}
                    </label>
                    <div
                      v-if="field.fieldType === 'richtext'"
                      class="prose prose-sm dark:prose-invert max-w-none"
                      v-html="field.value || '-'"
                    />
                    <p v-else class="text-highlighted">
                      {{ formatFieldValue(field) }}
                    </p>
                  </div>
                </div>
              </UCard>

              <!-- Attachments -->
              <UCard v-if="brief.attachments?.length">
                <template #header>
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-paperclip" class="size-4" />
                    <h3 class="font-semibold">Attachments</h3>
                    <UBadge size="xs" color="neutral" variant="subtle">
                      {{ brief.attachments.length }}
                    </UBadge>
                  </div>
                </template>

                <div class="space-y-2">
                  <div
                    v-for="attachment in brief.attachments"
                    :key="attachment.id"
                    class="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                  >
                    <div class="flex items-center gap-3">
                      <UIcon name="i-lucide-file" class="size-5 text-muted" />
                      <div>
                        <p class="font-medium text-sm">{{ attachment.fileName }}</p>
                        <p class="text-xs text-muted">
                          {{ ((attachment.fileSize || 0) / 1024).toFixed(1) }} KB
                        </p>
                      </div>
                    </div>
                    <UButton
                      icon="i-lucide-download"
                      variant="ghost"
                      size="xs"
                    />
                  </div>
                </div>
              </UCard>
            </div>

            <!-- Comments Tab -->
            <div v-if="activeTab === 'comments'" class="space-y-4">
              <!-- New Comment -->
              <UCard>
                <div class="space-y-3">
                  <UTextarea
                    v-model="newComment"
                    placeholder="Add a comment..."
                    :rows="3"
                  />
                  <div class="flex justify-end">
                    <UButton
                      label="Post Comment"
                      icon="i-lucide-send"
                      :loading="isSubmittingComment"
                      :disabled="!newComment.trim()"
                      @click="submitComment"
                    />
                  </div>
                </div>
              </UCard>

              <!-- Comments List -->
              <div v-if="comments?.length" class="space-y-4">
                <div
                  v-for="comment in comments"
                  :key="comment.id"
                  class="flex gap-3"
                >
                  <UAvatar
                    :alt="comment.user?.name || 'User'"
                    size="sm"
                  />
                  <div class="flex-1">
                    <UCard>
                      <div class="flex items-start justify-between mb-2">
                        <div>
                          <span class="font-medium">{{ comment.user?.name || 'Unknown' }}</span>
                          <span class="text-xs text-muted ml-2">
                            {{ formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true }) }}
                          </span>
                        </div>
                        <UBadge v-if="comment.isInternal" size="xs" color="warning" variant="subtle">
                          Internal
                        </UBadge>
                      </div>
                      <p class="text-sm whitespace-pre-wrap">{{ comment.content }}</p>
                    </UCard>
                  </div>
                </div>
              </div>

              <div v-else class="text-center py-8">
                <UIcon name="i-lucide-message-square" class="size-8 mx-auto text-muted mb-2" />
                <p class="text-muted">No comments yet</p>
              </div>
            </div>

            <!-- Activity Tab -->
            <div v-if="activeTab === 'activity'" class="space-y-4">
              <div v-if="activities?.length" class="space-y-0">
                <div
                  v-for="(activity, index) in activities"
                  :key="activity.id"
                  class="flex gap-4"
                >
                  <!-- Timeline -->
                  <div class="flex flex-col items-center">
                    <div
                      class="w-8 h-8 rounded-full flex items-center justify-center bg-muted/30"
                    >
                      <UIcon :name="getActivityIcon(activity.activityType)" class="size-4" />
                    </div>
                    <div
                      v-if="index < activities.length - 1"
                      class="w-px h-full bg-default min-h-8"
                    />
                  </div>

                  <!-- Content -->
                  <div class="pb-6">
                    <p class="text-sm">
                      <span class="font-medium">{{ activity.user?.name || 'System' }}</span>
                      <span class="text-muted">
                        <template v-if="activity.activityType === 'created'">
                          created this brief
                        </template>
                        <template v-else-if="activity.activityType === 'submitted'">
                          submitted this brief
                        </template>
                        <template v-else-if="activity.activityType === 'status_changed'">
                          changed status from
                          <UBadge :color="getStatusColor(activity.oldValue)" size="xs" variant="subtle">
                            {{ formatStatus(activity.oldValue) }}
                          </UBadge>
                          to
                          <UBadge :color="getStatusColor(activity.newValue)" size="xs" variant="subtle">
                            {{ formatStatus(activity.newValue) }}
                          </UBadge>
                        </template>
                        <template v-else-if="activity.activityType === 'commented'">
                          added a comment
                        </template>
                        <template v-else>
                          {{ activity.content || activity.activityType }}
                        </template>
                      </span>
                    </p>
                    <p class="text-xs text-muted mt-1">
                      {{ formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true }) }}
                    </p>
                  </div>
                </div>
              </div>

              <div v-else class="text-center py-8">
                <UIcon name="i-lucide-activity" class="size-8 mx-auto text-muted mb-2" />
                <p class="text-muted">No activity recorded</p>
              </div>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Brief Info -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Brief Information</h3>
              </template>

              <div class="space-y-4">
                <div>
                  <label class="text-sm text-muted">Type</label>
                  <div class="flex items-center gap-2 mt-1">
                    <UIcon
                      v-if="brief.template?.icon"
                      :name="brief.template.icon"
                      class="size-4"
                    />
                    <span>{{ brief.template?.name }}</span>
                  </div>
                </div>

                <div>
                  <label class="text-sm text-muted">Category</label>
                  <p>{{ brief.category?.name }}</p>
                </div>

                <div>
                  <label class="text-sm text-muted">Priority</label>
                  <div class="mt-1">
                    <UBadge :color="getPriorityColor(brief.priority)" variant="subtle">
                      {{ brief.priority }}
                    </UBadge>
                  </div>
                </div>

                <div v-if="brief.submittedAt">
                  <label class="text-sm text-muted">Submitted</label>
                  <p>{{ format(new Date(brief.submittedAt), 'MMM d, yyyy h:mm a') }}</p>
                </div>

                <div v-if="brief.requestedDeadline">
                  <label class="text-sm text-muted">Due Date</label>
                  <p>{{ format(new Date(brief.requestedDeadline), 'MMM d, yyyy') }}</p>
                </div>
              </div>
            </UCard>

            <!-- People -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">People</h3>
              </template>

              <div class="space-y-4">
                <div>
                  <label class="text-sm text-muted">Submitted By</label>
                  <div class="flex items-center gap-2 mt-1">
                    <UAvatar :alt="brief.submitter?.name || brief.submittedByName || 'User'" size="xs" />
                    <span>{{ brief.submitter?.name || brief.submittedByName || 'Unknown' }}</span>
                  </div>
                </div>

                <div v-if="brief.assignee?.name">
                  <label class="text-sm text-muted">Assigned To</label>
                  <div class="flex items-center gap-2 mt-1">
                    <UAvatar :alt="brief.assignee.name" size="xs" />
                    <span>{{ brief.assignee.name }}</span>
                  </div>
                </div>

                <div v-if="brief.department?.name">
                  <label class="text-sm text-muted">Department</label>
                  <div class="flex items-center gap-2 mt-1">
                    <div
                      class="w-3 h-3 rounded-full"
                      :style="{ backgroundColor: brief.department?.color || '#6366f1' }"
                    />
                    <span>{{ brief.department.name }}</span>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Client (if linked) -->
            <UCard v-if="brief.client?.name">
              <template #header>
                <h3 class="font-semibold">Client</h3>
              </template>

              <div class="flex items-center gap-3">
                <UAvatar :alt="brief.client.name" size="md" />
                <div>
                  <p class="font-medium">{{ brief.client.name }}</p>
                  <NuxtLink
                    v-if="brief.clientId"
                    :to="`/agency/clients/${brief.clientId}`"
                    class="text-sm text-primary hover:underline"
                  >
                    View Client
                  </NuxtLink>
                </div>
              </div>
            </UCard>

            <!-- Converted Project -->
            <UCard v-if="brief.convertedToProjectId">
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-folder-check" class="size-4 text-success" />
                  <h3 class="font-semibold">Linked Project</h3>
                </div>
              </template>

              <div class="space-y-2">
                <NuxtLink
                  :to="`/agency/projects/${brief.convertedToProjectId}`"
                  class="flex items-center gap-2 text-primary hover:underline font-medium"
                >
                  <UIcon name="i-lucide-external-link" class="size-4" />
                  {{ brief.project?.name || 'View Project' }}
                </NuxtLink>
                <div v-if="linkedProjectSummary.total" class="flex items-center justify-between gap-2">
                  <span class="flex items-center gap-1.5 text-xs text-muted">
                    <UIcon name="i-lucide-list-checks" class="size-3.5" />
                    {{ linkedProjectSummary.done }}/{{ linkedProjectSummary.total }} linked tasks done
                  </span>
                  <UAvatarGroup v-if="linkedProjectSummary.assignees.length" size="2xs" :max="4">
                    <UTooltip
                      v-for="a in linkedProjectSummary.assignees"
                      :key="a.id"
                      :text="a.name"
                    >
                      <UAvatar :alt="a.name" />
                    </UTooltip>
                  </UAvatarGroup>
                </div>
                <p v-if="brief.convertedAt" class="text-xs text-muted">
                  Converted {{ formatDistanceToNow(new Date(brief.convertedAt), { addSuffix: true }) }}
                </p>
              </div>
            </UCard>

            <!-- Linked Quote -->
            <UCard v-if="brief.quote">
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-receipt" class="size-4 text-primary" />
                  <h3 class="font-semibold">Linked Quote</h3>
                </div>
              </template>

              <div class="space-y-3">
                <NuxtLink
                  :to="`/agency/sales/quotes/${brief.quote.id}`"
                  class="flex items-center gap-2 text-primary hover:underline font-medium"
                >
                  <UIcon name="i-lucide-external-link" class="size-4" />
                  {{ brief.quote.quoteNumber }}
                </NuxtLink>

                <div class="flex items-center justify-between text-sm">
                  <span class="text-muted">Status</span>
                  <UBadge :color="getStatusColor(brief.quote.status)" variant="subtle" size="xs">
                    {{ formatStatus(brief.quote.status) }}
                  </UBadge>
                </div>

                <div class="flex items-center justify-between text-sm">
                  <span class="text-muted">Total</span>
                  <span class="font-medium">
                    {{ new Intl.NumberFormat('en-AU', { style: 'currency', currency: brief.quote.currency || 'AUD' }).format(brief.quote.total) }}
                  </span>
                </div>

                <div v-if="brief.quote.xeroStatus" class="flex items-center justify-between text-sm">
                  <span class="text-muted">Xero</span>
                  <UBadge
                    :color="brief.quote.xeroStatus === 'ACCEPTED' ? 'success' : brief.quote.xeroStatus === 'DECLINED' ? 'error' : brief.quote.xeroStatus === 'INVOICED' ? 'info' : 'neutral'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ brief.quote.xeroStatus }}
                  </UBadge>
                </div>
              </div>
            </UCard>

            <!-- Linked Tasks -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-list-checks" class="size-4 text-primary" />
                    <h3 class="font-semibold">Linked Tasks ({{ brief.linkedTasks?.length || 0 }})</h3>
                  </div>
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-plus"
                    label="Add Task"
                    @click="showCreateTask = true"
                  />
                </div>
              </template>

              <div v-if="!brief.linkedTasks?.length" class="text-center py-4">
                <p class="text-sm text-muted">No tasks linked yet.</p>
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="lt in brief.linkedTasks"
                  :key="lt.id"
                  class="flex items-center gap-2 text-sm"
                >
                  <span
                    class="size-2 rounded-full shrink-0"
                    :style="{ backgroundColor: lt.statusColor || '#6B7280' }"
                  />
                  <span class="truncate flex-1">{{ lt.title }}</span>
                  <UTooltip v-if="lt.assigneeName" :text="lt.assigneeName">
                    <UAvatar :alt="lt.assigneeName" size="3xs" />
                  </UTooltip>
                  <UBadge v-if="lt.boardName" color="neutral" variant="subtle" size="xs">
                    {{ lt.boardName }}
                  </UBadge>
                  <span v-if="lt.actualHours || lt.estimatedHours" class="text-xs text-gray-400 whitespace-nowrap">
                    {{ lt.actualHours || 0 }}/{{ lt.estimatedHours || '?' }}h
                  </span>
                </div>
              </div>
            </UCard>

            <!-- Completeness Score -->
            <BriefsBriefCompletenessScore :brief-id="briefId" />

            <!-- Dates -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Timestamps</h3>
              </template>

              <div class="space-y-3 text-sm">
                <div class="flex justify-between">
                  <span class="text-muted">Created</span>
                  <span>{{ format(new Date(brief.createdAt), 'MMM d, yyyy h:mm a') }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted">Updated</span>
                  <span>{{ format(new Date(brief.updatedAt), 'MMM d, yyyy h:mm a') }}</span>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </UDashboardPanel>

    <!-- Create Task from Brief -->
    <TaskQuickTaskCreate
      v-model:open="showCreateTask"
      source-type="brief"
      :prefill-title="brief?.title"
      :prefill-project-id="brief?.convertedToProjectId || brief?.projectId"
      :brief-id="brief?.id"
      :source-label="`Brief ${brief?.referenceNumber || ''} — ${brief?.title}`"
      @created="onTaskCreatedFromBrief"
    />

    <!-- Convert to Project Modal -->
    <UModal v-model:open="showConvertModal">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">Convert Brief to Project</h3>
          <p class="text-sm text-muted">
            This will create a new project from this brief. If the brief template has a linked project template, tasks will be auto-generated.
          </p>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Project Name</label>
              <UInput v-model="convertProjectName" class="w-full" placeholder="Enter project name" />
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Start Date</label>
              <UInput v-model="convertStartDate" type="date" class="w-full" />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-4">
            <UButton variant="ghost" @click="showConvertModal = false">Cancel</UButton>
            <UButton
              :loading="isConverting"
              :disabled="!convertProjectName.trim()"
              @click="handleConvert"
            >
              Create Project
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
