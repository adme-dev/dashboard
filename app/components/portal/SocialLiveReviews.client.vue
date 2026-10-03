<script setup lang="ts">
import type { SocialLiveReview } from '~~/shared/types/socialLiveReview'
import { usePortalAuth } from '~/composables/usePortalAuth'

const { hasPermission } = usePortalAuth()
const canApprove = computed(() => hasPermission('canApproveWork'))
const reviews = ref<SocialLiveReview[]>([])
const pendingCount = computed(() => reviews.value.filter(item => item.status === 'pending' && !item.expired).length)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const feedback = ref('')
const decision = ref<{ review: SocialLiveReview, action: 'approve' | 'reject' | 'request_changes' } | null>(null)
const toast = useToast()
const title = computed(() => decision.value?.action === 'approve' ? 'Approve this exact change' : decision.value?.action === 'reject' ? 'Reject this change' : 'Request changes')
function date(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
async function load() {
  if (!canApprove.value) return
  loading.value = true
  error.value = ''
  try {
    reviews.value = await $fetch<SocialLiveReview[]>('/api/portal/social/live-reviews')
  } catch {
    reviews.value = []
    error.value = 'Could not load published-post reviews. Try refreshing.'
  } finally {
    loading.value = false
  }
}
watch(canApprove, load, { immediate: true })
function review(item: SocialLiveReview, action: 'approve' | 'reject' | 'request_changes') {
  feedback.value = ''
  decision.value = { review: item, action }
}
async function respond() {
  const selected = decision.value
  if (!selected || busy.value) return
  if (selected.action !== 'approve' && !feedback.value.trim()) return
  busy.value = true
  try {
    await $fetch(`/api/portal/social/live-reviews/${selected.review.id}/respond`, { method: 'POST', retry: 0, body: { action: selected.action, feedback: feedback.value.trim() } })
    toast.add({ title: 'Decision recorded', description: 'The agency must apply approved changes separately.', color: 'success' })
    decision.value = null
    await load()
  } catch (cause: unknown) {
    toast.add({ title: 'Decision not recorded', description: (cause as { data?: { statusMessage?: string } }).data?.statusMessage || 'Refresh and try again.', color: 'error' })
    decision.value = null
    await load()
  } finally { busy.value = false }
}
</script>

<template>
  <section v-if="canApprove" class="space-y-4" aria-labelledby="live-reviews-title">
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-default pb-3">
      <div>
        <h2 id="live-reviews-title" class="text-lg font-semibold">
          Changes to published posts
        </h2>
        <p class="mt-1 max-w-2xl text-sm text-muted">
          Review the exact caption or removal requested for your Facebook Page. Your decision is recorded here; the agency applies approved changes separately.
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        aria-label="Refresh published-post reviews"
        color="neutral"
        variant="ghost"
        :loading="loading"
        @click="load"
      />
    </div>
    <UBadge v-if="pendingCount" color="warning" variant="subtle">
      {{ pendingCount }} published-post changes awaiting your decision
    </UBadge>
    <USkeleton v-if="loading" class="h-32" />
    <UAlert v-else-if="error" color="error" :description="error" />
    <p v-else-if="!reviews.length" class="rounded-lg border border-dashed border-default p-6 text-sm text-muted">
      No published-post changes have been requested.
    </p>
    <div v-else class="space-y-4">
      <article v-for="item in reviews" :key="item.id" class="@container space-y-4 rounded-lg border border-default p-5">
        <div class="flex flex-wrap justify-between gap-3">
          <div>
            <h3 class="font-semibold">
              {{ item.action === 'remove' ? 'Remove Facebook post' : 'Update Facebook caption' }} · {{ item.account_name }}
            </h3>
            <p class="mt-1 text-xs text-muted">
              {{ item.requester_name || 'Agency staff' }} requested {{ date(item.created_at) }}. Review expires {{ date(item.expires_at) }}.
            </p>
          </div>
          <UBadge color="neutral" variant="subtle">
            {{ item.expired && ['pending', 'approved'].includes(item.status) ? 'Expired' : item.status.replaceAll('_', ' ') }}
          </UBadge>
        </div>
        <UButton
          :to="`https://www.facebook.com/${item.provider_post_id}`"
          target="_blank"
          color="neutral"
          variant="link"
          icon="i-lucide-external-link"
        >
          Open original Facebook post
        </UButton>
        <div class="grid gap-4 @lg:grid-cols-2">
          <div>
            <p class="mb-2 text-xs font-medium text-muted">
              Caption when requested
            </p><p class="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
              {{ item.before_message }}
            </p>
          </div>
          <div v-if="item.action === 'edit'" class="rounded-md bg-elevated p-4">
            <p class="mb-2 text-xs font-medium">
              Proposed caption
            </p><p class="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
              {{ item.after_message }}
            </p>
          </div>
          <UAlert
            v-else
            color="warning"
            title="Permanent removal requested"
            description="The agency proposes deleting this Facebook post. Comments and reactions may be lost. XeroFlow retains the publication archive."
          />
        </div>
        <div v-if="item.feedback || item.responded_at" class="border-t border-default pt-3 text-sm">
          <p v-if="item.responded_at" class="text-xs text-muted">
            {{ item.responder_name || 'Customer' }} responded {{ date(item.responded_at) }}
          </p>
          <p class="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {{ item.feedback }}
          </p>
        </div>
        <div v-if="item.status === 'pending' && !item.expired" class="flex flex-wrap gap-2">
          <UButton :disabled="busy" @click="review(item, 'approve')">
            Review approval
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="review(item, 'request_changes')"
          >
            Request changes
          </UButton>
          <UButton
            color="error"
            variant="ghost"
            :disabled="busy"
            @click="review(item, 'reject')"
          >
            Reject
          </UButton>
        </div>
        <p v-if="item.operation_status" class="text-sm text-muted">
          Facebook operation: {{ item.operation_status }}<span v-if="item.operation_created_at"> · {{ item.operator_name || 'Agency staff' }} · {{ date(item.operation_created_at) }}</span>
        </p>
      </article>
    </div>
    <UModal :open="!!decision" :dismissible="!busy" @update:open="value => { if (!value && !busy) decision = null }">
      <template #content>
        <div class="space-y-4 p-6">
          <h3 class="text-lg font-semibold">
            {{ title }}
          </h3>
          <p class="text-sm text-muted">
            {{ decision?.review.account_name }} — {{ decision?.review.action === 'remove' ? 'Permanent post removal, including its comments and reactions.' : 'The proposed caption shown in this request.' }} This decision does not change Facebook immediately.
          </p>
          <UFormField :label="decision?.action === 'approve' ? 'Comment (optional)' : 'Feedback (required)'">
            <UTextarea
              v-model="feedback"
              class="w-full"
              :rows="4"
              :maxlength="4000"
              :disabled="busy"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="busy"
              @click="decision = null"
            >
              Cancel
            </UButton>
            <UButton
              :color="decision?.review.action === 'remove' || decision?.action === 'reject' ? 'error' : 'primary'"
              :loading="busy"
              :disabled="decision?.action !== 'approve' && !feedback.trim()"
              @click="respond"
            >
              Confirm decision
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
