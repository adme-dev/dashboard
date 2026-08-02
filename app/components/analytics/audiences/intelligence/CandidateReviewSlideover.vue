<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { NearbyMarketCandidate, NearbyMarketCandidateReview } from '~/types/site-intelligence'
import type { NearbyMarketDecisionInput } from '~/composables/useNearbyMarket'

interface DecisionResult {
  candidate?: Record<string, unknown>
  domain?: Record<string, unknown> | null
  run?: Record<string, unknown> | null
  crawlStart?: { status?: string, category?: string } | null
}

const props = defineProps<{
  open: boolean
  candidate: NearbyMarketCandidate | null
  review: NearbyMarketCandidateReview | null
  loading: boolean
  deciding: boolean
  error: string | null
  decisionResult: DecisionResult | null
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'decide': [input: NearbyMarketDecisionInput]
  'retryReview': []
  'retryCrawl': [domain: Record<string, unknown>]
  'viewDiagnostics': [domain: Record<string, unknown>, run: Record<string, unknown> | null]
}>()

const reviewerReason = ref('')
const manualWebsite = ref('')
const panelOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})
const manualWebsiteValid = computed(() => {
  if (!manualWebsite.value.trim()) return false
  try {
    const url = new URL(manualWebsite.value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
})
const hasCurrentValidation = computed(() => Boolean(
  props.review?.canApprove && props.review.canonicalOrigin
))
const canApprove = computed(() => (
  reviewerReason.value.trim().length >= 10
  && !props.review?.existingDomainId
  && (hasCurrentValidation.value || manualWebsiteValid.value)
  && !props.deciding
))
const canDismiss = computed(() => reviewerReason.value.trim().length > 0 && !props.deciding)
const crawlStartFailed = computed(() => (
  props.decisionResult?.crawlStart?.status === 'failed'
  && Boolean(props.decisionResult.domain)
))

watch(() => props.candidate?.placeId, () => {
  reviewerReason.value = ''
  manualWebsite.value = ''
})

function approve() {
  if (!canApprove.value) return
  emit('decide', {
    action: 'approve_and_index',
    reviewerReason: reviewerReason.value.trim(),
    ...(manualWebsite.value.trim() ? { websiteUri: manualWebsite.value.trim() } : {})
  })
}
</script>

<template>
  <USlideover v-model:open="panelOpen" title="Review nearby dealership">
    <template #content>
      <div class="@container space-y-5 p-5 sm:p-6">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-primary">
            Agency review
          </p>
          <h2 class="mt-1 text-lg font-semibold text-highlighted">
            {{ candidate?.displayName || review?.displayName || 'Nearby dealership' }}
          </h2>
          <p v-if="candidate" class="mt-1 text-sm text-muted">
            {{ candidate.distanceKm.toFixed(1) }} km away · {{ candidate.formattedAddress }}
          </p>
        </div>

        <USkeleton v-if="loading" class="h-36 w-full rounded-lg" />
        <UAlert
          v-else-if="error"
          color="error"
          variant="subtle"
          title="Candidate website review unavailable"
          :description="error"
        >
          <template #actions>
            <UButton
              label="Retry review"
              color="error"
              variant="soft"
              size="sm"
              @click="$emit('retryReview')"
            />
          </template>
        </UAlert>

        <template v-else-if="review">
          <template v-if="crawlStartFailed">
            <UAlert
              color="error"
              variant="subtle"
              title="Approved, but the first crawl did not start"
              description="The approval and domain remain saved. Retry the crawl or open diagnostics; approval will not be repeated."
            />
            <div class="grid grid-cols-1 gap-2 @lg:grid-cols-2">
              <UButton
                label="Retry crawl"
                icon="i-lucide-refresh-cw"
                @click="$emit('retryCrawl', decisionResult!.domain!)"
              />
              <UButton
                label="View diagnostics"
                color="neutral"
                variant="soft"
                @click="$emit('viewDiagnostics', decisionResult!.domain!, decisionResult!.run || null)"
              />
            </div>
          </template>
          <template v-else>
            <div class="space-y-3 rounded-lg border border-default bg-elevated p-4">
              <div>
                <p class="text-xs font-medium text-muted">
                  Provider website
                </p>
                <p class="mt-1 break-all text-sm text-highlighted">
                  {{ review.websiteUri || 'No public website returned' }}
                </p>
              </div>
              <div>
                <p class="text-xs font-medium text-muted">
                  Canonical origin
                </p>
                <p class="mt-1 break-all text-sm text-highlighted">
                  {{ review.canonicalOrigin || 'Awaiting a valid public website' }}
                </p>
              </div>
              <UBadge
                v-if="review.existingDomainId"
                color="success"
                variant="subtle"
                label="Already monitored"
              />
              <UBadge
                v-else-if="hasCurrentValidation"
                color="success"
                variant="subtle"
                label="Website validation is current"
              />
              <UBadge
                v-else
                color="warning"
                variant="subtle"
                label="Current validation required"
              />
            </div>

            <UAlert
              v-if="review.existingDomainId"
              color="success"
              variant="subtle"
              title="This domain is already monitored"
              description="Open the existing domain and crawl history instead of approving a duplicate."
            />

            <div class="grid grid-cols-1 gap-4">
              <UFormField
                label="Manual website"
                help="Use only when the provider returned no website. The server applies the same public-origin and duplicate validation."
              >
                <UInput
                  v-model="manualWebsite"
                  class="w-full"
                  inputmode="url"
                  placeholder="https://dealer.example"
                />
              </UFormField>
              <UFormField
                label="Reviewer reason"
                help="Approval requires at least 10 characters; dismissals require an audit reason."
              >
                <UTextarea
                  v-model="reviewerReason"
                  class="w-full"
                  :rows="4"
                  placeholder="Explain why this dealership is relevant to the client's market."
                />
              </UFormField>
            </div>

            <section aria-labelledby="crawl-preview-heading" class="space-y-3 rounded-lg border border-default p-4">
              <div>
                <h3 id="crawl-preview-heading" class="text-sm font-semibold text-highlighted">
                  Fixed first crawl
                </h3>
                <p class="mt-1 text-xs leading-5 text-muted">
                  These settings cannot be changed from nearby-market approval.
                </p>
              </div>
              <dl class="grid grid-cols-1 gap-2 text-sm @lg:grid-cols-2">
                <div>
                  <dt class="text-muted">
                    Lane
                  </dt><dd class="font-medium text-highlighted">
                    Competitor
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Boundary
                  </dt><dd class="font-medium text-highlighted">
                    25 pages · Depth 1
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Rendering
                  </dt><dd class="font-medium text-highlighted">
                    Automatic rendering
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Schedule
                  </dt><dd class="font-medium text-highlighted">
                    Manual frequency
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Retention
                  </dt><dd class="font-medium text-highlighted">
                    30-day raw retention
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Use
                  </dt><dd class="font-medium text-highlighted">
                    Search purpose · AI input off
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Scope
                  </dt><dd class="font-medium text-highlighted">
                    Exact origin · No subdomains
                  </dd>
                </div>
              </dl>
            </section>

            <div class="flex flex-col-reverse gap-2 border-t border-default pt-4">
              <div class="grid grid-cols-1 gap-2 @lg:grid-cols-2">
                <UButton
                  label="Save for later"
                  color="neutral"
                  variant="soft"
                  :loading="deciding"
                  @click="$emit('decide', { action: 'save' })"
                />
                <UButton
                  label="Dismiss"
                  color="neutral"
                  variant="outline"
                  :disabled="!canDismiss"
                  @click="$emit('decide', { action: 'dismiss', reviewerReason: reviewerReason.trim() })"
                />
              </div>
              <UButton
                label="Approve & index"
                icon="i-lucide-scan-search"
                :loading="deciding"
                :disabled="!canApprove"
                @click="approve"
              />
            </div>
          </template>
        </template>
      </div>
    </template>
  </USlideover>
</template>
