<script setup lang="ts">
/**
 * Public Approval Page
 * Allows clients to approve/reject deliverables via a secure token link
 * NO AUTHENTICATION REQUIRED
 */

definePageMeta({
  layout: 'auth',
  auth: false
})

const route = useRoute()
const token = computed(() => route.params.token as string)
const toast = useToast()

// Fetch approval data
const { data, pending, error, refresh } = await useFetch(
  () => `/api/approve/${token.value}`,
  {
    key: `approval-${token.value}`
  }
)

const approval = computed(() => (data.value as any)?.approval)
const comments = computed(() => (data.value as any)?.comments || [])
const canRespond = computed(() => (data.value as any)?.canRespond)

// Response form
const isSubmitting = ref(false)
const showResponseForm = ref(false)
const selectedAction = ref<'approve' | 'reject' | 'request_revision' | null>(null)
const responseNotes = ref('')
const responderName = ref('')
const responderEmail = ref('')

// Response submitted state
const responseSubmitted = ref(false)
const responseMessage = ref('')

const approvalTypeLabels: Record<string, string> = {
  deliverable: 'Deliverable',
  milestone: 'Milestone',
  design: 'Design',
  content: 'Content',
  budget_change: 'Budget Change',
  scope_change: 'Scope Change',
  invoice: 'Invoice'
}

const statusConfig: Record<string, { color: string; label: string; icon: string }> = {
  pending: { color: 'warning', label: 'Pending Review', icon: 'i-lucide-clock' },
  approved: { color: 'success', label: 'Approved', icon: 'i-lucide-check-circle' },
  rejected: { color: 'error', label: 'Rejected', icon: 'i-lucide-x-circle' },
  revision_requested: { color: 'info', label: 'Revision Requested', icon: 'i-lucide-message-circle' }
}

function selectAction(action: 'approve' | 'reject' | 'request_revision') {
  selectedAction.value = action
  showResponseForm.value = true
}

async function submitResponse() {
  if (!selectedAction.value) return

  isSubmitting.value = true
  try {
    const response = await $fetch(`/api/approve/${token.value}`, {
      method: 'POST',
      body: {
        action: selectedAction.value,
        notes: responseNotes.value || undefined,
        responderName: responderName.value || undefined,
        responderEmail: responderEmail.value || undefined
      }
    })

    responseSubmitted.value = true
    responseMessage.value = (response as any).message

    toast.add({
      title: 'Response Submitted',
      description: (response as any).message,
      color: 'success'
    })

    // Refresh to show updated status
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || 'Failed to submit response',
      color: 'error'
    })
  } finally {
    isSubmitting.value = false
  }
}

function formatDate(date: string | null) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatDateTime(date: string | null) {
  if (!date) return ''
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="text-center">
      <h1 class="text-2xl font-bold text-highlighted">Approval Request</h1>
      <p class="text-muted mt-1">Review and respond to this approval request</p>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex justify-center py-12">
      <XfLoader />
    </div>

    <!-- Error -->
    <UCard v-else-if="error" class="text-center">
      <div class="py-8">
        <UIcon name="i-lucide-alert-circle" class="h-12 w-12 text-error-500 mx-auto mb-4" />
        <h2 class="text-lg font-semibold text-highlighted mb-2">
          {{ error.statusCode === 410 ? 'Link Expired' : 'Approval Not Found' }}
        </h2>
        <p class="text-muted">
          {{ error.data?.statusMessage || 'This approval link is invalid or has expired.' }}
        </p>
        <p class="text-sm text-muted mt-4">
          Please contact your project manager for a new approval link.
        </p>
      </div>
    </UCard>

    <!-- Approval Content -->
    <template v-else-if="approval">
      <!-- Status Banner -->
      <UCard :ui="{ body: '!p-4' }">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center"
            :class="{
              'bg-warning-100 text-warning-600': approval.status === 'pending',
              'bg-success-100 text-success-600': approval.status === 'approved',
              'bg-error-100 text-error-600': approval.status === 'rejected',
              'bg-info-100 text-info-600': approval.status === 'revision_requested'
            }"
          >
            <UIcon :name="statusConfig[approval.status]?.icon || 'i-lucide-help-circle'" class="h-5 w-5" />
          </div>
          <div class="flex-1">
            <p class="font-medium text-highlighted">
              {{ statusConfig[approval.status]?.label || approval.status }}
            </p>
            <p class="text-sm text-muted">
              {{ approval.project?.name }} &middot; {{ approvalTypeLabels[approval.approvalType] || approval.approvalType }}
            </p>
          </div>
          <UBadge v-if="approval.dueDate" color="neutral" variant="soft">
            Due {{ formatDate(approval.dueDate) }}
          </UBadge>
        </div>
      </UCard>

      <!-- Approval Details -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">{{ approval.title }}</h2>
        </template>

        <div class="space-y-4">
          <!-- Description -->
          <div v-if="approval.description">
            <p class="text-sm text-muted mb-1">Description</p>
            <p class="text-highlighted whitespace-pre-wrap">{{ approval.description }}</p>
          </div>

          <!-- Meta Info -->
          <div class="flex flex-wrap gap-4 text-sm">
            <div>
              <span class="text-muted">Requested by:</span>
              <span class="text-highlighted ml-1">{{ approval.requestedBy }}</span>
            </div>
            <div>
              <span class="text-muted">Requested:</span>
              <span class="text-highlighted ml-1">{{ formatDateTime(approval.requestedAt) }}</span>
            </div>
            <div v-if="approval.revisionNumber > 1">
              <span class="text-muted">Revision:</span>
              <span class="text-highlighted ml-1">#{{ approval.revisionNumber }}</span>
            </div>
          </div>

          <!-- Attachments -->
          <div v-if="approval.attachments?.length" class="space-y-2">
            <p class="text-sm text-muted">Attachments</p>
            <div class="flex flex-wrap gap-2">
              <a
                v-for="(attachment, index) in approval.attachments"
                :key="index"
                :href="attachment.url"
                target="_blank"
                class="flex items-center gap-2 px-3 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                <UIcon name="i-lucide-file" class="h-4 w-4 text-muted" />
                <span class="text-sm text-highlighted">{{ attachment.name }}</span>
                <UIcon name="i-lucide-external-link" class="h-3 w-3 text-muted" />
              </a>
            </div>
          </div>

          <!-- Task Info -->
          <div v-if="approval.task" class="flex items-center gap-2 text-sm">
            <UIcon name="i-lucide-check-square" class="h-4 w-4 text-muted" />
            <span class="text-muted">Related task:</span>
            <span class="text-highlighted">{{ approval.task.title }}</span>
          </div>
        </div>
      </UCard>

      <!-- Comments -->
      <UCard v-if="comments.length">
        <template #header>
          <h3 class="font-medium text-highlighted">Discussion ({{ comments.length }})</h3>
        </template>

        <div class="space-y-4">
          <div
            v-for="comment in comments"
            :key="comment.id"
            class="flex gap-3"
          >
            <UAvatar :alt="comment.author" size="sm" />
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-medium text-sm text-highlighted">{{ comment.author }}</span>
                <span class="text-xs text-muted">{{ formatDateTime(comment.createdAt) }}</span>
              </div>
              <p class="text-sm text-highlighted whitespace-pre-wrap">{{ comment.content }}</p>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Response Section -->
      <UCard v-if="canRespond && !responseSubmitted">
        <template #header>
          <h3 class="font-medium text-highlighted">Your Response</h3>
        </template>

        <div v-if="!showResponseForm" class="flex flex-col sm:flex-row gap-3">
          <UButton
            color="primary"
            size="lg"
            class="flex-1"
            @click="selectAction('approve')"
          >
            <UIcon name="i-lucide-check" class="h-4 w-4 mr-2" />
            Approve
          </UButton>
          <UButton
            color="warning"
            variant="outline"
            size="lg"
            class="flex-1"
            @click="selectAction('request_revision')"
          >
            <UIcon name="i-lucide-message-circle" class="h-4 w-4 mr-2" />
            Request Changes
          </UButton>
          <UButton
            color="error"
            variant="outline"
            size="lg"
            class="flex-1"
            @click="selectAction('reject')"
          >
            <UIcon name="i-lucide-x" class="h-4 w-4 mr-2" />
            Reject
          </UButton>
        </div>

        <div v-else class="space-y-4">
          <div class="flex items-center gap-2 p-3 rounded-lg" :class="{
            'bg-success-50 dark:bg-success-950': selectedAction === 'approve',
            'bg-warning-50 dark:bg-warning-950': selectedAction === 'request_revision',
            'bg-error-50 dark:bg-error-950': selectedAction === 'reject'
          }">
            <UIcon
              :name="selectedAction === 'approve' ? 'i-lucide-check-circle' : selectedAction === 'reject' ? 'i-lucide-x-circle' : 'i-lucide-message-circle'"
              class="h-5 w-5"
              :class="{
                'text-success-600': selectedAction === 'approve',
                'text-warning-600': selectedAction === 'request_revision',
                'text-error-600': selectedAction === 'reject'
              }"
            />
            <span class="font-medium" :class="{
              'text-success-700 dark:text-success-300': selectedAction === 'approve',
              'text-warning-700 dark:text-warning-300': selectedAction === 'request_revision',
              'text-error-700 dark:text-error-300': selectedAction === 'reject'
            }">
              {{ selectedAction === 'approve' ? 'Approving' : selectedAction === 'reject' ? 'Rejecting' : 'Requesting Changes' }}
            </span>
            <UButton
              variant="link"
              size="xs"
              class="ml-auto"
              @click="showResponseForm = false; selectedAction = null"
            >
              Change
            </UButton>
          </div>

          <UFormField label="Your Name (optional)">
            <UInput v-model="responderName" placeholder="Enter your name" />
          </UFormField>

          <UFormField label="Your Email (optional)">
            <UInput v-model="responderEmail" type="email" placeholder="Enter your email" />
          </UFormField>

          <UFormField :label="selectedAction === 'approve' ? 'Comments (optional)' : 'Please provide feedback'">
            <UTextarea
              v-model="responseNotes"
              :placeholder="selectedAction === 'approve' ? 'Any additional comments...' : 'Please describe the changes needed...'"
              :rows="4"
            />
          </UFormField>

          <div class="flex gap-3">
            <UButton
              :color="selectedAction === 'approve' ? 'primary' : selectedAction === 'reject' ? 'error' : 'warning'"
              size="lg"
              :loading="isSubmitting"
              @click="submitResponse"
            >
              Submit Response
            </UButton>
            <UButton
              variant="ghost"
              size="lg"
              :disabled="isSubmitting"
              @click="showResponseForm = false; selectedAction = null"
            >
              Cancel
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Already Responded -->
      <UCard v-else-if="responseSubmitted || approval.status !== 'pending'">
        <div class="text-center py-6">
          <UIcon
            :name="approval.status === 'approved' ? 'i-lucide-check-circle' : approval.status === 'rejected' ? 'i-lucide-x-circle' : 'i-lucide-message-circle'"
            class="h-12 w-12 mx-auto mb-4"
            :class="{
              'text-success-500': approval.status === 'approved',
              'text-error-500': approval.status === 'rejected',
              'text-warning-500': approval.status === 'revision_requested'
            }"
          />
          <h3 class="text-lg font-semibold text-highlighted mb-2">
            {{ responseSubmitted ? 'Response Submitted' : `This has been ${approval.status.replace('_', ' ')}` }}
          </h3>
          <p class="text-muted">
            {{ responseSubmitted ? responseMessage : `Responded on ${formatDateTime(approval.respondedAt)}` }}
          </p>
          <div v-if="approval.responseNotes" class="mt-4 p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-left">
            <p class="text-sm text-muted mb-1">Response Notes:</p>
            <p class="text-sm text-highlighted whitespace-pre-wrap">{{ approval.responseNotes }}</p>
          </div>
        </div>
      </UCard>
    </template>

    <!-- Footer -->
    <p class="text-center text-xs text-muted">
      This is a secure approval page. Your response will be recorded and the team will be notified.
    </p>
  </div>
</template>
