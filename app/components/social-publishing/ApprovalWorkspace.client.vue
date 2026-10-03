<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'
import {
  approvalPrimaryContent,
  approvalReviewSummary,
  formatApprovalDate
} from '~/utils/socialPublishingApprovals'
import { isVideoMediaUrl } from '~/utils/social/videoMedia'
import { platformLabel } from '~~/app/utils/socialReportScheduleForm'
import type { SocialPost, SocialPublishPlatform } from '~/types'

const api = useSocialPublishing()
const toast = useToast()

const { clientId } = useSocialPublishingClient()

const pending = ref<SocialPost[]>([])
const loading = ref(false)
const selectedId = ref<string | null>(null)
const previewPlatform = ref<SocialPublishPlatform | null>(null)
const approvingId = ref<string | null>(null)
const rejectTarget = ref<SocialPost | null>(null)
const rejectReason = ref('')
const rejecting = ref(false)

const selectedPost = computed(() =>
  pending.value.find(post => post.id === selectedId.value) ?? pending.value[0] ?? null
)
const selectedSummary = computed(() => selectedPost.value ? approvalReviewSummary(selectedPost.value) : null)
const platformOptions = computed(() =>
  (selectedPost.value?.platforms ?? []).map(platform => ({ label: platformLabel(platform), value: platform }))
)
const previewContent = computed(() =>
  selectedPost.value ? approvalPrimaryContent(selectedPost.value, previewPlatform.value) : ''
)
const clientApprovalBlocked = computed(() =>
  (selectedPost.value?.client_approval_status || selectedPost.value?.metadata?.source === 'mcp_news')
  && selectedPost.value.client_approval_status !== 'approved'
)

function clientDecisionLabel(status: SocialPost['client_approval_status']) {
  if (!status) return 'Not requested'
  return status.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function clientDecisionColor(status: SocialPost['client_approval_status']) {
  return ({ pending: 'warning', approved: 'success', rejected: 'error', revision_requested: 'info' } as const)[status || 'pending'] || 'neutral'
}

async function load() {
  if (!clientId.value) {
    pending.value = []
    selectedId.value = null
    return
  }
  loading.value = true
  try {
    pending.value = await api.getApprovals(clientId.value)
  } finally {
    loading.value = false
  }
}
watch(clientId, load, { immediate: true })

watch(pending, (posts) => {
  if (!posts.length) {
    selectedId.value = null
    return
  }
  if (!posts.some(post => post.id === selectedId.value)) {
    selectedId.value = posts[0].id
  }
})

watch(selectedPost, (post) => {
  if (!post) {
    previewPlatform.value = null
    return
  }
  if (!previewPlatform.value || !post.platforms.includes(previewPlatform.value)) {
    previewPlatform.value = post.platforms[0] ?? null
  }
}, { immediate: true })

async function approve(p: SocialPost) {
  approvingId.value = p.id
  try {
    await api.approve(p.id, p.review_version)
    toast.add({ title: 'Approved', color: 'success' })
    await load()
    await refreshNuxtData('social-publishing-nav-counts')
  } catch (e: unknown) {
    toast.add({ title: 'Approve failed', description: (e as { data?: { statusMessage?: string } })?.data?.statusMessage, color: 'error' })
    if ((e as { statusCode?: number }).statusCode === 409) await load()
  } finally {
    approvingId.value = null
  }
}

function openReject(p: SocialPost) {
  rejectTarget.value = p
  rejectReason.value = p.rejection_reason ?? ''
}

async function confirmReject() {
  if (!rejectTarget.value) return
  const reason = rejectReason.value.trim()
  if (!reason) {
    toast.add({ title: 'Add a reason', description: 'The requester needs clear change notes.', color: 'warning' })
    return
  }
  rejecting.value = true
  try {
    await api.reject(rejectTarget.value.id, reason, rejectTarget.value.review_version)
    toast.add({ title: 'Sent back for changes', color: 'success' })
    rejectTarget.value = null
    rejectReason.value = ''
    await load()
    await refreshNuxtData('social-publishing-nav-counts')
  } catch (e: unknown) {
    toast.add({ title: 'Reject failed', description: (e as { data?: { statusMessage?: string } })?.data?.statusMessage, color: 'error' })
    if ((e as { statusCode?: number }).statusCode === 409) {
      rejectTarget.value = null
      await load()
    }
  } finally {
    rejecting.value = false
  }
}
</script>

<template>
  <SocialPublishingShell
    title="Approvals"
    subtitle="Review content approval requests before they schedule or publish."
  >
    <template #actions>
      <UButton
        aria-label="Refresh approvals"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="loading"
        :disabled="!clientId"
        @click="load"
      />
    </template>

    <div v-if="!clientId" class="rounded-lg border border-default p-10 text-center text-sm text-muted">
      Select a client to review publishing approvals.
    </div>

    <div v-else-if="loading" class="rounded-lg border border-default p-10 text-center text-sm text-muted">
      Loading approvals...
    </div>

    <section v-else-if="!pending.length" class="flex min-h-80 flex-col items-center justify-center rounded-xl border border-default bg-default px-6 py-12 text-center" aria-labelledby="approvals-empty-title">
      <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
        <UIcon name="i-lucide-check-check" class="size-7" aria-hidden="true" />
      </div>
      <h2 id="approvals-empty-title" class="text-lg font-semibold">
        All caught up
      </h2>
      <p class="mt-2 max-w-md text-sm leading-6 text-muted">
        There are no posts waiting for approval for this client. Approved posts still need to be published or scheduled.
      </p>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <UButton :to="{ path: '/agency/social/publishing/calendar', query: { client: clientId } }" icon="i-lucide-calendar-days">
          View calendar
        </UButton>
        <UButton
          :to="{ path: '/agency/social/publishing/compose', query: { client: clientId } }"
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
        >
          Create a post
        </UButton>
      </div>
    </section>

    <div v-else class="grid min-w-0 gap-6 xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
      <section class="min-w-0 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold">
            Approval queue
          </h2>
          <UBadge color="neutral" variant="subtle">
            {{ pending.length }} pending
          </UBadge>
        </div>

        <button
          v-for="p in pending"
          :key="p.id"
          type="button"
          class="min-w-0 w-full rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :class="selectedPost?.id === p.id ? 'border-primary bg-primary/5' : 'border-default hover:border-muted'"
          :aria-pressed="selectedPost?.id === p.id"
          @click="selectedId = p.id"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">
                {{ approvalPrimaryContent(p, null) }}
              </p>
              <p class="text-xs text-muted mt-1">
                Requested {{ formatApprovalDate(p.approval_requested_at, p.timezone) }}
              </p>
              <div class="flex flex-wrap gap-1 mt-3">
                <UBadge
                  v-for="pl in p.platforms"
                  :key="pl"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  {{ platformLabel(pl) }}
                </UBadge>
                <UBadge
                  v-if="p.metadata?.source === 'mcp_news'"
                  :color="clientDecisionColor(p.client_approval_status)"
                  variant="outline"
                  size="xs"
                >
                  Client: {{ clientDecisionLabel(p.client_approval_status) }}
                </UBadge>
              </div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-muted mt-1 shrink-0" />
          </div>
        </button>
      </section>

      <section v-if="selectedPost" class="@container min-w-0 rounded-lg border border-default bg-default">
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-default p-4">
          <div>
            <h2 class="text-sm font-semibold">
              Review request
            </h2>
            <p class="text-xs text-muted mt-1">
              Scheduled {{ formatApprovalDate(selectedPost.scheduled_at, selectedPost.timezone) }}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <USelectMenu
              v-if="platformOptions.length"
              v-model="previewPlatform"
              :items="platformOptions"
              value-key="value"
              label-key="label"
              class="w-44"
            />
            <UButton
              :to="{ path: '/agency/social/publishing/compose', query: { edit: selectedPost.id, client: clientId } }"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-pencil"
            >
              Edit
            </UButton>
          </div>
        </div>

        <div class="grid min-w-0 gap-4 p-4 @3xl:grid-cols-[minmax(0,1fr)_240px]">
          <div class="min-w-0 space-y-4">
            <div class="rounded-lg border border-default p-4">
              <div class="flex items-center justify-between gap-3 mb-3">
                <span class="text-xs font-medium uppercase tracking-wide text-muted">Post preview</span>
                <UBadge v-if="previewPlatform" color="primary" variant="subtle">
                  {{ platformLabel(previewPlatform) }}
                </UBadge>
              </div>
              <p class="text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {{ previewContent }}
              </p>
              <div v-if="selectedPost.media_urls?.length" class="grid grid-cols-1 @md:grid-cols-2 gap-3 mt-4">
                <div v-for="(url, index) in selectedPost.media_urls" :key="url" class="min-w-0 overflow-hidden rounded-md border border-default bg-elevated">
                  <video
                    v-if="isVideoMediaUrl(url)"
                    :src="url"
                    controls
                    preload="metadata"
                    class="max-h-80 w-full"
                    :aria-label="`Attached video ${index + 1}`"
                  />
                  <a
                    v-else
                    :href="url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block focus-visible:outline-2 focus-visible:outline-primary"
                    :aria-label="`Open image ${index + 1} at full size`"
                  >
                    <img
                      :src="url"
                      :alt="`Post artwork ${index + 1}`"
                      class="max-h-80 w-full object-contain"
                      loading="lazy"
                    >
                  </a>
                </div>
              </div>
              <p v-if="selectedPost.first_comment" class="mt-4 rounded-md bg-elevated p-3 text-xs text-muted whitespace-pre-wrap [overflow-wrap:anywhere]">
                First comment: {{ selectedPost.first_comment }}
              </p>
            </div>

            <div class="rounded-lg border border-default p-4">
              <h3 class="text-sm font-semibold mb-3">
                Review notes
              </h3>
              <dl class="grid min-w-0 gap-3 @lg:grid-cols-2">
                <div>
                  <dt class="text-xs text-muted">
                    Requested
                  </dt>
                  <dd class="text-sm [overflow-wrap:anywhere]">
                    {{ formatApprovalDate(selectedPost.approval_requested_at, selectedPost.timezone) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">
                    Due
                  </dt>
                  <dd class="text-sm [overflow-wrap:anywhere]">
                    {{ formatApprovalDate(selectedPost.due_at, selectedPost.timezone) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">
                    Campaign
                  </dt>
                  <dd class="text-sm [overflow-wrap:anywhere]">
                    {{ selectedPost.campaign_id || 'No campaign linked' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">
                    Assigned to
                  </dt>
                  <dd class="text-sm [overflow-wrap:anywhere]">
                    {{ selectedPost.assigned_to || 'Unassigned' }}
                  </dd>
                </div>
                <div v-if="selectedPost.metadata?.source === 'mcp_news'">
                  <dt class="text-xs text-muted">
                    Client decision
                  </dt>
                  <dd class="mt-0.5">
                    <UBadge :color="clientDecisionColor(selectedPost.client_approval_status)" variant="subtle" size="xs">
                      {{ clientDecisionLabel(selectedPost.client_approval_status) }}
                    </UBadge>
                  </dd>
                </div>
                <div v-if="selectedPost.client_approval_responded_at">
                  <dt class="text-xs text-muted">
                    Client responded
                  </dt>
                  <dd class="text-sm [overflow-wrap:anywhere]">
                    {{ formatApprovalDate(selectedPost.client_approval_responded_at, selectedPost.timezone) }}
                  </dd>
                </div>
              </dl>
              <div v-if="selectedPost.client_approval_feedback" class="mt-4 rounded-md border border-default bg-elevated p-3">
                <p class="text-xs font-medium text-muted">
                  Client feedback
                </p>
                <p class="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                  {{ selectedPost.client_approval_feedback }}
                </p>
              </div>
              <div v-if="selectedPost.hashtags?.length || selectedPost.tags?.length" class="flex flex-wrap gap-1 mt-4">
                <UBadge
                  v-for="tag in selectedPost.tags"
                  :key="`tag-${tag}`"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  {{ tag }}
                </UBadge>
                <UBadge
                  v-for="tag in selectedPost.hashtags"
                  :key="`hash-${tag}`"
                  color="neutral"
                  variant="outline"
                  size="xs"
                >
                  #{{ tag }}
                </UBadge>
              </div>
              <ULink
                v-if="selectedPost.link_url"
                :to="selectedPost.link_url"
                target="_blank"
                class="mt-4 flex min-w-0 items-start gap-1 text-xs text-primary [overflow-wrap:anywhere]"
              >
                <UIcon name="i-lucide-external-link" class="size-3" />
                {{ selectedPost.link_url }}
              </ULink>
            </div>
          </div>

          <aside class="min-w-0 space-y-4 @3xl:sticky @3xl:top-4 self-start">
            <div class="rounded-lg border border-default p-4">
              <h3 class="text-sm font-semibold mb-3">
                Checklist
              </h3>
              <div v-if="selectedSummary" class="space-y-2 text-sm">
                <div class="flex justify-between gap-3">
                  <span class="text-muted">Platforms</span><span>{{ selectedSummary.platforms }}</span>
                </div>
                <div class="flex justify-between gap-3">
                  <span class="text-muted">Media</span><span>{{ selectedSummary.media }}</span>
                </div>
                <div class="flex justify-between gap-3">
                  <span class="text-muted">Hashtags</span><span>{{ selectedSummary.hashtags }}</span>
                </div>
                <div class="flex justify-between gap-3">
                  <span class="text-muted">Tags</span><span>{{ selectedSummary.tags }}</span>
                </div>
                <div class="flex justify-between gap-3">
                  <span class="text-muted">First comment</span>
                  <UBadge :color="selectedSummary.hasFirstComment ? 'success' : 'neutral'" variant="subtle" size="xs">
                    {{ selectedSummary.hasFirstComment ? 'Yes' : 'No' }}
                  </UBadge>
                </div>
                <div class="flex justify-between gap-3">
                  <span class="text-muted">Overrides</span>
                  <UBadge :color="selectedSummary.hasOverrides ? 'primary' : 'neutral'" variant="subtle" size="xs">
                    {{ selectedSummary.hasOverrides ? 'Present' : 'None' }}
                  </UBadge>
                </div>
              </div>
            </div>

            <div class="rounded-lg border border-default p-4">
              <h3 class="text-sm font-semibold mb-2">
                Decision
              </h3>
              <p class="mb-4 text-xs leading-5 text-muted">
                Approval marks this post as ready. Publishing happens in the composer or at its scheduled time.
              </p>
              <UAlert
                v-if="clientApprovalBlocked"
                color="warning"
                variant="subtle"
                title="Client approval is required before agency approval"
                description="Review the portal decision or send the draft back for changes."
                class="mb-3"
              />
              <div class="grid gap-2">
                <UButton
                  color="success"
                  icon="i-lucide-check"
                  block
                  :loading="approvingId === selectedPost.id"
                  :disabled="(selectedPost.client_approval_status || selectedPost.metadata?.source === 'mcp_news') && selectedPost.client_approval_status !== 'approved'"
                  @click="approve(selectedPost)"
                >
                  Approve
                </UButton>
                <UButton
                  color="error"
                  variant="subtle"
                  icon="i-lucide-x"
                  block
                  @click="openReject(selectedPost)"
                >
                  Request changes
                </UButton>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>

    <UModal :open="!!rejectTarget" @update:open="(v) => { if (!v) rejectTarget = null }">
      <template #content>
        <div class="p-5 space-y-4">
          <h3 class="font-semibold">
            Request changes
          </h3>
          <UFormField label="Reason" help="Shared with the requester.">
            <UTextarea
              v-model="rejectReason"
              :rows="4"
              placeholder="What needs to change?"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="rejectTarget = null">
              Cancel
            </UButton>
            <UButton
              color="error"
              :loading="rejecting"
              :disabled="!rejectReason.trim()"
              @click="confirmReject"
            >
              Send back
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </SocialPublishingShell>
</template>
