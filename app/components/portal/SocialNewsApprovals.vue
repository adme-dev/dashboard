<script setup lang="ts">
import { usePortalAuth } from '~/composables/usePortalAuth'
import type { PortalSocialNewsAction, PortalSocialNewsDraft } from '~/types'

const props = defineProps<{ status?: string }>()
const { hasPermission } = usePortalAuth()
const toast = useToast()
const canApprove = computed(() => hasPermission('canApproveWork'))
const apiFetch = $fetch as <T>(request: string, options?: { method?: string, body?: unknown, query?: Record<string, unknown> }) => Promise<T>

const data = ref<{ drafts: PortalSocialNewsDraft[], summary: Record<string, number> } | null>(null)
const loading = ref(false)
const error = ref('')
const respondingId = ref<string | null>(null)
const decision = ref<{ draft: PortalSocialNewsDraft, action: PortalSocialNewsAction } | null>(null)
const feedback = ref('')

const supportedActions = [
  { action: 'approve', status: 'approved' },
  { action: 'request_changes', status: 'revision_requested' },
  { action: 'reject', status: 'rejected' }
] as const

function errorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return null
  return (error as { data?: { statusMessage?: string } }).data?.statusMessage || null
}

const modalTitle = computed(() => ({
  approve: 'Approve social content',
  request_changes: 'Request content changes',
  reject: 'Reject social content'
}[decision.value?.action || 'approve']))

const modalActionLabel = computed(() => ({
  approve: 'Confirm approval',
  request_changes: 'Send change request',
  reject: 'Confirm rejection'
}[decision.value?.action || 'approve']))

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await apiFetch('/api/portal/social/news-drafts', {
      query: props.status ? { status: props.status } : {}
    })
  } catch (cause: unknown) {
    data.value = null
    error.value = errorMessage(cause) || 'News and social content could not be loaded.'
  } finally {
    loading.value = false
  }
}

watch(() => props.status, load, { immediate: true })

function openDecision(draft: PortalSocialNewsDraft, action: PortalSocialNewsAction) {
  if (!supportedActions.some(option => option.action === action)) return
  feedback.value = ''
  decision.value = { draft, action }
}

function closeDecision() {
  if (respondingId.value) return
  decision.value = null
  feedback.value = ''
}

async function submitDecision() {
  if (!decision.value) return
  const notes = feedback.value.trim()
  if (decision.value.action !== 'approve' && !notes) {
    toast.add({ title: 'Add feedback', description: 'Explain what needs to change.', color: 'warning' })
    return
  }
  respondingId.value = decision.value.draft.id
  try {
    await apiFetch(`/api/portal/social/news-drafts/${decision.value.draft.id}/respond`, {
      method: 'POST',
      body: { action: decision.value.action, feedback: notes || undefined }
    })
    toast.add({
      title: decision.value.action === 'approve' ? 'Content approved' : decision.value.action === 'reject' ? 'Content rejected' : 'Changes requested',
      description: decision.value.action === 'approve'
        ? 'The agency approval and publishing checks still apply.'
        : 'Your feedback is now visible to the agency team.',
      color: 'success'
    })
    decision.value = null
    feedback.value = ''
    await load()
  } catch (cause: unknown) {
    toast.add({ title: 'Decision not recorded', description: errorMessage(cause) || 'Try again.', color: 'error' })
  } finally {
    respondingId.value = null
  }
}
</script>

<template>
  <section class="space-y-4" aria-labelledby="social-news-approvals-heading">
    <div class="flex flex-wrap items-end justify-between gap-3 border-b border-default pb-3">
      <div>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-share-2" class="size-4 text-primary" />
          <h2 id="social-news-approvals-heading" class="text-lg font-semibold">
            News &amp; Social Content
          </h2>
        </div>
        <p class="mt-1 text-sm text-muted">
          Review each platform version and its original news source.
        </p>
      </div>
      <UBadge v-if="data?.summary.pending" color="warning" variant="subtle">
        {{ data.summary.pending }} awaiting decision
      </UBadge>
    </div>

    <div
      v-if="loading"
      class="space-y-3"
      aria-busy="true"
      aria-label="Loading news and social approvals"
    >
      <div v-for="index in 2" :key="index" class="h-64 animate-pulse rounded-lg bg-elevated" />
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      title="Content unavailable"
      :description="error"
    >
      <template #actions>
        <UButton
          color="error"
          variant="soft"
          size="sm"
          @click="load"
        >
          Try again
        </UButton>
      </template>
    </UAlert>
    <div v-else-if="data?.drafts.length" class="space-y-4">
      <PortalSocialNewsApprovalCard
        v-for="draft in data.drafts"
        :key="draft.id"
        :draft="draft"
        :can-approve="canApprove"
        :busy="respondingId === draft.id"
        @decide="openDecision"
      />
    </div>
    <div v-else class="rounded-lg border border-dashed border-default p-8 text-center">
      <UIcon name="i-lucide-newspaper" class="mx-auto size-6 text-muted" />
      <p class="mt-2 text-sm font-medium">
        No news or social content in this view
      </p>
      <p class="mt-1 text-xs text-muted">
        New drafts appear here when the agency requests your review.
      </p>
    </div>

    <UModal :open="!!decision" @update:open="value => { if (!value) closeDecision() }">
      <template #content>
        <div class="space-y-4 p-6">
          <div>
            <h3 class="text-lg font-semibold">
              {{ modalTitle }}
            </h3>
            <p class="mt-1 text-sm text-muted">
              This records your client decision. Agency approval is still required before anything can publish.
            </p>
          </div>
          <UFormField
            :label="decision?.action === 'approve' ? 'Comment (optional)' : 'Feedback (required)'"
            :help="decision?.action === 'approve' ? 'Add context for the agency team.' : 'Be specific about what should change.'"
          >
            <UTextarea
              v-model="feedback"
              :rows="4"
              maxlength="4000"
              placeholder="Write feedback for the agency team"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="!!respondingId"
              @click="closeDecision"
            >
              Cancel
            </UButton>
            <UButton
              :color="decision?.action === 'approve' ? 'success' : decision?.action === 'reject' ? 'error' : 'warning'"
              :loading="!!respondingId"
              @click="submitDecision"
            >
              {{ modalActionLabel }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
