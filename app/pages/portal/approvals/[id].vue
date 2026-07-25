<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const route = useRoute()
const { hasPermission } = usePortalAuth()
const toast = useToast()
const approvalId = route.params.id as string
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const data = ref<any | null>(null)
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<any>(`/api/portal/approvals/${approvalId}`)
  } catch {
    data.value = null
  } finally {
    pending.value = false
  }
}

refresh()

const responseNotes = ref('')
const responding = ref(false)
const showRejectModal = ref(false)
const pendingAction = ref<string>('')

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    return (error as { data?: { statusMessage?: string } }).data?.statusMessage
  }
  return undefined
}

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

async function respond(action: string) {
  if ((action === 'reject' || action === 'revision_requested') && !responseNotes.value.trim()) {
    pendingAction.value = action
    showRejectModal.value = true
    return
  }

  responding.value = true
  try {
    await apiFetch(`/api/portal/approvals/${approvalId}/respond`, {
      method: 'POST',
      body: { action, notes: responseNotes.value || undefined }
    })
    toast.add({ title: `Approval ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revision requested'}`, color: 'success' })
    showRejectModal.value = false
    responseNotes.value = ''
    await refresh()
  } catch (error: unknown) {
    toast.add({ title: 'Failed', description: errorMessage(error), color: 'error' })
  } finally {
    responding.value = false
  }
}

async function submitWithNotes() {
  if (!responseNotes.value.trim()) {
    toast.add({ title: 'Notes are required', color: 'error' })
    return
  }
  await respond(pendingAction.value)
}

const statusColors: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  revision_requested: 'info'
}
</script>

<template>
  <div class="p-6 space-y-6 w-full">
    <div v-if="pending" class="space-y-4">
      <div class="h-8 w-64 bg-elevated animate-pulse rounded" />
      <div class="h-48 bg-elevated animate-pulse rounded-lg" />
    </div>

    <template v-else-if="data">
      <NuxtLink
        :to="data.approval.status ? `/portal/approvals?status=${data.approval.status}` : '/portal/approvals?status=pending'"
        class="text-sm text-muted hover:text-default inline-flex items-center gap-1"
      >
        <UIcon name="i-lucide-arrow-left" class="w-3 h-3" />
        Back to approvals
      </NuxtLink>

      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold">
            {{ data.approval.title }}
          </h1>
          <div class="flex items-center gap-2 mt-2">
            <UBadge :color="(statusColors[data.approval.status] as any) || 'neutral'" variant="subtle">
              {{ data.approval.status.replace('_', ' ') }}
            </UBadge>
            <UBadge color="neutral" variant="subtle">
              {{ data.approval.approvalType }}
            </UBadge>
            <span class="text-sm text-muted">
              {{ data.approval.project.name }}
            </span>
          </div>
        </div>
      </div>

      <!-- Details -->
      <UCard>
        <div class="space-y-4">
          <div v-if="data.approval.description" class="prose prose-sm max-w-none">
            <p class="whitespace-pre-wrap">
              {{ data.approval.description }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-muted">Requested by</span>
              <p class="font-medium">
                {{ data.approval.requestedBy.name }}
              </p>
            </div>
            <div>
              <span class="text-muted">Requested</span>
              <p>{{ formatDate(data.approval.requestedAt) }}</p>
            </div>
            <div v-if="data.approval.dueDate">
              <span class="text-muted">Due date</span>
              <p>{{ formatDate(data.approval.dueDate) }}</p>
            </div>
            <div v-if="data.approval.respondedBy">
              <span class="text-muted">Responded by</span>
              <p>{{ data.approval.respondedBy.name }} on {{ formatDate(data.approval.respondedAt) }}</p>
            </div>
          </div>

          <!-- Attachments -->
          <div v-if="data.approval.attachments?.length">
            <h3 class="text-sm font-medium mb-2">
              Attachments
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <a
                v-for="(attachment, i) in data.approval.attachments"
                :key="i"
                :href="safeMediaUrl(typeof attachment === 'string' ? attachment : attachment.url)"
                target="_blank"
                class="flex items-center gap-2 p-3 rounded-lg bg-elevated hover:bg-muted/20 transition-colors"
              >
                <UIcon name="i-lucide-paperclip" class="w-4 h-4 text-muted shrink-0" />
                <span class="text-sm truncate">
                  {{ typeof attachment === 'string' ? `Attachment ${i + 1}` : attachment.name }}
                </span>
              </a>
            </div>
          </div>

          <!-- Response notes -->
          <div v-if="data.approval.responseNotes" class="p-3 rounded-lg bg-muted/10 border border-default">
            <p class="text-sm font-medium mb-1">
              Response Notes
            </p>
            <p class="text-sm whitespace-pre-wrap">
              {{ data.approval.responseNotes }}
            </p>
          </div>
        </div>
      </UCard>

      <!-- Action Bar -->
      <div v-if="data.approval.status === 'pending' && hasPermission('canApproveWork')" class="flex items-center gap-3 p-4 rounded-lg bg-elevated">
        <UButton
          color="success"
          :loading="responding"
          icon="i-lucide-check"
          @click="respond('approve')"
        >
          Approve
        </UButton>
        <UButton
          color="warning"
          variant="soft"
          :loading="responding"
          icon="i-lucide-edit"
          @click="respond('revision_requested')"
        >
          Request Revision
        </UButton>
        <UButton
          color="error"
          variant="soft"
          :loading="responding"
          icon="i-lucide-x"
          @click="respond('reject')"
        >
          Reject
        </UButton>
      </div>

      <!-- Revision History -->
      <div v-if="data.revisionHistory.length > 1">
        <h3 class="font-semibold mb-3">
          Revision History
        </h3>
        <div class="space-y-2">
          <div v-for="rev in data.revisionHistory" :key="rev.id" class="flex items-center gap-3 p-3 rounded-lg bg-elevated">
            <UBadge :color="(statusColors[rev.status] as any) || 'neutral'" variant="subtle" size="xs">
              v{{ rev.revisionNumber }}
            </UBadge>
            <span class="text-sm">{{ rev.status.replace('_', ' ') }}</span>
            <span class="text-xs text-muted ml-auto">{{ formatDate(rev.respondedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- Comments -->
      <div v-if="data.comments.length">
        <h3 class="font-semibold mb-3">
          Discussion
        </h3>
        <div class="space-y-4">
          <div v-for="c in data.comments" :key="c.id" class="flex items-start gap-3">
            <UAvatar :src="c.author.avatarUrl || undefined" :alt="c.author.name" size="sm" />
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{{ c.author.name }}</span>
                <UBadge
                  v-if="c.author.type === 'team'"
                  size="xs"
                  variant="subtle"
                  color="primary"
                >
                  Team
                </UBadge>
                <span class="text-xs text-muted">{{ formatDate(c.createdAt) }}</span>
              </div>
              <p class="text-sm mt-1 whitespace-pre-wrap">
                {{ c.content }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Reject/Revision Modal -->
    <UModal v-model:open="showRejectModal">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">
            {{ pendingAction === 'reject' ? 'Reject Approval' : 'Request Revision' }}
          </h3>
          <div class="space-y-2">
            <label class="text-sm font-medium">Notes (required)</label>
            <UTextarea
              v-model="responseNotes"
              placeholder="Explain your feedback..."
              :rows="4"
            />
          </div>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showRejectModal = false">
              Cancel
            </UButton>
            <UButton
              :color="pendingAction === 'reject' ? 'error' : 'warning'"
              :loading="responding"
              @click="submitWithNotes"
            >
              {{ pendingAction === 'reject' ? 'Reject' : 'Request Revision' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
