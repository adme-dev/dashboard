<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const route = useRoute()
const briefId = route.params.id as string
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const data = ref<any | null>(null)
const pending = ref(false)
const commentsData = ref<any | null>(null)

async function refreshBrief() {
  pending.value = true
  try {
    data.value = await apiFetch<any>(`/api/portal/briefs/${briefId}`)
  } catch {
    data.value = null
  } finally {
    pending.value = false
  }
}

async function refreshComments() {
  commentsData.value = await apiFetch<any>(`/api/portal/briefs/${briefId}/comments`).catch(() => null)
}

refreshBrief()
refreshComments()

const newComment = ref('')
const sendingComment = ref(false)

interface BriefFieldValue {
  fieldId: string
  fieldLabel: string
  fieldType: string
  value: unknown
  section?: string | null
  stepTitle?: string | null
  [key: string]: unknown
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    return (error as { data?: { statusMessage?: string } }).data?.statusMessage
  }
  return undefined
}

async function submitComment() {
  if (!newComment.value.trim()) return
  sendingComment.value = true
  try {
    await apiFetch(`/api/portal/briefs/${briefId}/comments`, {
      method: 'POST',
      body: { content: newComment.value }
    })
    newComment.value = ''
    await refreshComments()
    toast.add({ title: 'Comment added', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Failed to add comment', description: errorMessage(error), color: 'error' })
  } finally {
    sendingComment.value = false
  }
}

function formatDate(date: string | null | undefined) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

function formatFieldValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined) return '-'
  // Parse JSON strings
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      parsed = value
    }
  }
  if (Array.isArray(parsed)) return parsed.join(', ')
  if (typeof parsed === 'boolean') return parsed ? 'Yes' : 'No'
  if (fieldType === 'date' && typeof parsed === 'string') return formatDate(parsed)
  if (fieldType === 'currency' && typeof parsed === 'number') {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parsed)
  }
  return String(parsed)
}

const statusColors: Record<string, string> = {
  draft: 'neutral',
  submitted: 'warning',
  under_review: 'info',
  needs_info: 'warning',
  approved: 'success',
  rejected: 'error',
  in_progress: 'primary',
  completed: 'success',
  cancelled: 'neutral'
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'In Review',
  needs_info: 'Needs Info',
  approved: 'Approved',
  rejected: 'Rejected',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
}

const priorityColors: Record<string, string> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'error'
}

const isOpen = computed(() => {
  if (!data.value) return false
  return !['completed', 'cancelled', 'rejected'].includes(data.value.status)
})

// Group field values by section/step
const fieldSections = computed(() => {
  if (!data.value?.fieldValues) return []

  const sectionMap = new Map<string, BriefFieldValue[]>()
  for (const fv of data.value.fieldValues) {
    // Skip display-only fields
    if (['heading', 'paragraph', 'divider'].includes(fv.fieldType)) continue

    const key = fv.section || fv.stepTitle || 'Details'
    if (!sectionMap.has(key)) sectionMap.set(key, [])
    sectionMap.get(key)!.push(fv)
  }
  return Array.from(sectionMap.entries()).map(([name, fields]) => ({ name, fields }))
})
</script>

<template>
  <div class="p-6 space-y-6 w-full">
    <div v-if="pending" class="space-y-4">
      <div class="h-8 w-64 bg-elevated animate-pulse rounded" />
      <div class="h-32 bg-elevated animate-pulse rounded-lg" />
    </div>

    <template v-else-if="data">
      <!-- Header -->
      <div>
        <NuxtLink
          :to="data.status ? `/portal/briefs?status=${data.status}` : '/portal/briefs?status=submitted'"
          class="text-sm text-muted hover:text-default mb-2 inline-flex items-center gap-1"
        >
          <UIcon name="i-lucide-arrow-left" class="w-3 h-3" />
          Back to briefs
        </NuxtLink>

        <div class="flex items-start justify-between gap-4 mt-2">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span v-if="data.referenceNumber" class="text-sm font-mono text-muted">{{ data.referenceNumber }}</span>
            </div>
            <h1 class="text-2xl font-bold">
              {{ data.title }}
            </h1>
            <div class="flex items-center gap-2 mt-2 flex-wrap">
              <UBadge :color="(statusColors[data.status] as any) || 'neutral'" variant="subtle">
                {{ statusLabels[data.status] || data.status }}
              </UBadge>
              <UBadge :color="(priorityColors[data.priority] as any) || 'neutral'" variant="outline">
                {{ data.priority }}
              </UBadge>
              <UBadge v-if="data.category" color="neutral" variant="subtle">
                {{ data.category.name }}
              </UBadge>
            </div>
          </div>
        </div>
      </div>

      <!-- Info Card -->
      <UCard>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div v-if="data.template">
            <p class="text-muted">
              Template
            </p>
            <p class="font-medium">
              {{ data.template.name }}
            </p>
          </div>
          <div v-if="data.submittedByName">
            <p class="text-muted">
              Submitted By
            </p>
            <p class="font-medium">
              {{ data.submittedByName }}
            </p>
          </div>
          <div>
            <p class="text-muted">
              Submitted
            </p>
            <p class="font-medium">
              {{ formatDate(data.submittedAt || data.createdAt) }}
            </p>
          </div>
          <div v-if="data.requestedDeadline">
            <p class="text-muted">
              Requested Deadline
            </p>
            <p class="font-medium">
              {{ formatDate(data.requestedDeadline) }}
            </p>
          </div>
          <div v-if="data.estimatedCompletion">
            <p class="text-muted">
              Estimated Completion
            </p>
            <p class="font-medium">
              {{ formatDate(data.estimatedCompletion) }}
            </p>
          </div>
          <div v-if="data.assignee">
            <p class="text-muted">
              Assigned To
            </p>
            <p class="font-medium">
              {{ data.assignee.name }}
            </p>
          </div>
          <div v-if="data.completedAt">
            <p class="text-muted">
              Completed
            </p>
            <p class="font-medium">
              {{ formatDate(data.completedAt) }}
            </p>
          </div>
          <div v-if="data.project">
            <p class="text-muted">
              Project
            </p>
            <p class="font-medium">
              {{ data.project.name }}
            </p>
          </div>
        </div>
      </UCard>

      <!-- Review notes (if rejected or needs info) -->
      <UCard v-if="data.reviewNotes && (data.status === 'rejected' || data.status === 'needs_info')">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              :name="data.status === 'rejected' ? 'i-lucide-x-circle' : 'i-lucide-alert-circle'"
              :class="data.status === 'rejected' ? 'text-error' : 'text-warning'"
            />
            <span class="font-semibold text-sm">
              {{ data.status === 'rejected' ? 'Rejection Reason' : 'Additional Information Needed' }}
            </span>
          </div>
        </template>
        <p class="text-sm whitespace-pre-wrap">
          {{ data.reviewNotes }}
        </p>
      </UCard>

      <!-- Field values by section -->
      <UCard v-for="section in fieldSections" :key="section.name">
        <template #header>
          <span class="font-semibold text-sm">{{ section.name }}</span>
        </template>
        <div class="space-y-4">
          <div v-for="field in section.fields" :key="field.fieldId" class="text-sm">
            <p class="text-muted mb-0.5">
              {{ field.fieldLabel }}
            </p>
            <p class="font-medium whitespace-pre-wrap">
              {{ formatFieldValue(field.value, field.fieldType) }}
            </p>
          </div>
        </div>
      </UCard>

      <!-- Timeline -->
      <UCard v-if="data.timeline?.length">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-history" class="text-primary" />
            <span class="font-semibold text-sm">Timeline</span>
          </div>
        </template>
        <div class="space-y-3">
          <div v-for="event in data.timeline" :key="event.id" class="flex items-start gap-3 text-sm">
            <div class="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
            <div class="flex-1 min-w-0">
              <p>{{ event.content }}</p>
              <p class="text-xs text-muted mt-0.5">
                {{ formatDateTime(event.createdAt) }}
                <span v-if="event.userName"> · {{ event.userName }}</span>
              </p>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Comments -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-messages-square" class="text-primary" />
            <span class="font-semibold text-sm">Comments</span>
            <UBadge
              v-if="commentsData?.length"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              {{ commentsData.length }}
            </UBadge>
          </div>
        </template>

        <div class="space-y-4">
          <div
            v-for="comment in commentsData"
            :key="comment.id"
            class="space-y-3"
          >
            <!-- Main comment -->
            <div class="flex items-start gap-3">
              <UAvatar :src="comment.user?.avatarUrl || undefined" :alt="comment.user?.name || 'User'" size="sm" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">{{ comment.user?.name || 'Team Member' }}</span>
                  <span class="text-xs text-muted">{{ formatDateTime(comment.createdAt) }}</span>
                </div>
                <p class="text-sm mt-1 whitespace-pre-wrap">
                  {{ comment.content }}
                </p>
              </div>
            </div>

            <!-- Replies -->
            <div
              v-for="reply in comment.replies"
              :key="reply.id"
              class="flex items-start gap-3 ml-10"
            >
              <UAvatar :src="reply.user?.avatarUrl || undefined" :alt="reply.user?.name || 'User'" size="xs" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">{{ reply.user?.name || 'Team Member' }}</span>
                  <span class="text-xs text-muted">{{ formatDateTime(reply.createdAt) }}</span>
                </div>
                <p class="text-sm mt-1 whitespace-pre-wrap">
                  {{ reply.content }}
                </p>
              </div>
            </div>
          </div>

          <p v-if="!commentsData?.length" class="text-sm text-muted text-center py-4">
            No comments yet
          </p>
        </div>

        <!-- Comment form -->
        <div v-if="isOpen" class="mt-4 pt-4 border-t border-default">
          <form class="space-y-3" @submit.prevent="submitComment">
            <UTextarea
              v-model="newComment"
              placeholder="Add a comment..."
              :rows="3"
              class="w-full"
            />
            <div class="flex justify-end">
              <UButton
                type="submit"
                :loading="sendingComment"
                :disabled="!newComment.trim()"
                icon="i-lucide-send"
              >
                Send
              </UButton>
            </div>
          </form>
        </div>

        <div v-else class="mt-4 pt-4 border-t border-default">
          <p class="text-sm text-muted text-center">
            This brief is {{ statusLabels[data.status]?.toLowerCase() || data.status }}.
          </p>
        </div>
      </UCard>
    </template>
  </div>
</template>
