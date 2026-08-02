<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { NearbyMarketCandidate, NearbyMarketRadius, SiteIntelligenceCandidateState } from '~/types/site-intelligence'
import type { NearbyMarketDecisionInput } from '~/composables/useNearbyMarket'
import { useNearbyMarket } from '~/composables/useNearbyMarket'
import NearbyMarketMap from '~/components/site-intelligence/NearbyMarketMap.client.vue'

const props = defineProps<{
  clientId?: string | null
  clients: Array<{ id: string, name: string }>
  canManage: boolean
}>()
const emit = defineEmits<{
  'update:clientId': [clientId: string]
  'retryCrawl': [domain: Record<string, unknown>]
  'viewDiagnostics': [domain: Record<string, unknown>, run: Record<string, unknown> | null]
}>()
const toast = useToast()
const nearby = useNearbyMarket()
const {
  filters, selectedPlaceId, location, market, candidates, candidateReview,
  decision, nominations, status, errors, updateFilters, selectCandidate,
  loadLocation, retryLocation, search, retrySearch, reviewCandidate,
  retryCandidateReview, decideCandidate, loadNominations, retryNominations,
  activateClient, reviewNomination
} = nearby

const locationOpen = ref(false)
const reviewOpen = ref(false)
const rowElements = new Map<string, HTMLElement>()
const clientItems = computed(() => props.clients.map(client => ({ label: client.name, value: client.id })))
const radiusOptions: Array<{ label: string, value: NearbyMarketRadius }> = [
  { label: '10 km', value: 10 },
  { label: '25 km', value: 25 },
  { label: '50 km', value: 50 }
]
const brandOptions = [
  { label: 'All brands', value: 'all' },
  ...['BMW', 'Ford', 'GWM', 'Haval', 'Honda', 'Hyundai', 'Kia', 'Mazda', 'Mercedes-Benz', 'Mitsubishi', 'Nissan', 'Subaru', 'Toyota', 'Volkswagen']
    .map(brand => ({ label: brand, value: brand.toLocaleLowerCase('en-AU') }))
]
const statusOptions = [
  { label: 'All active candidates', value: 'all' },
  { label: 'Saved', value: 'saved' },
  { label: 'Client nominated', value: 'nominated' },
  { label: 'Monitored', value: 'approved' },
  { label: 'Dismissed', value: 'dismissed' }
]
const selectedCandidate = computed(() => candidates.value.find(
  candidate => candidate.placeId === selectedPlaceId.value
) ?? null)
const center = computed(() => market.value?.center ?? null)
const providerAlert = computed(() => {
  const detail = errors.search || ''
  const normalized = detail.toLocaleLowerCase('en-AU')
  if (normalized.includes('misconfig') || normalized.includes('not configured')) {
    return { title: 'Nearby market provider misconfigured', category: 'misconfigured', detail }
  }
  if (normalized.includes('rate')) {
    return { title: 'Nearby market provider rate-limited', category: 'rate-limited', detail }
  }
  if (normalized.includes('quota')) {
    return { title: 'Nearby market provider quota-exceeded', category: 'quota-exceeded', detail }
  }
  return { title: 'Nearby market provider unavailable', category: 'unavailable', detail }
})

watch(() => [props.clientId, props.canManage] as const, ([clientId, canManage]) => {
  reviewOpen.value = false
  void activateClient(clientId ?? null, canManage)
}, { immediate: true })

watch(selectedPlaceId, async (placeId) => {
  if (!placeId) return
  await nextTick()
  const row = rowElements.get(placeId)
  row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  if (row && !row.contains(document.activeElement)) {
    row.querySelector<HTMLButtonElement>('button')?.focus()
  }
})

function setRowRef(placeId: string, value: Element | ComponentPublicInstance | null) {
  const element = value instanceof HTMLElement
    ? value
    : (value as ComponentPublicInstance | null)?.$el as HTMLElement | undefined
  if (element) rowElements.set(placeId, element)
  else rowElements.delete(placeId)
}

function updateClient(value: unknown) {
  if (typeof value === 'string' && value) emit('update:clientId', value)
}

function openLocationModal() {
  locationOpen.value = true
}

async function updateDiscoveryFilters(patch: Parameters<typeof updateFilters>[0]) {
  updateFilters(patch)
  if (props.clientId && location.value) await search(props.clientId)
}

async function savedLocation() {
  if (!props.clientId) return
  await loadLocation(props.clientId)
  if (location.value) await search(props.clientId)
  toast.add({
    title: 'Market location confirmed',
    description: 'Nearby discovery now uses this trading address.',
    color: 'success'
  })
}

async function openReview(placeId: string) {
  selectCandidate(placeId)
  reviewOpen.value = true
  await reviewCandidate(placeId)
}

async function openNomination(nomination: typeof nominations.value[number]) {
  if (nomination.clientId && nomination.clientId !== props.clientId) {
    emit('update:clientId', nomination.clientId)
    await nextTick()
  }
  reviewOpen.value = true
  await reviewNomination(nomination)
}

async function decide(input: NearbyMarketDecisionInput) {
  if (!selectedPlaceId.value) return
  const result = await decideCandidate(selectedPlaceId.value, input)
  if (!result) return
  if (props.clientId) await Promise.allSettled([
    search(props.clientId),
    ...(props.canManage ? [loadNominations(props.clientId)] : [])
  ])
  const crawlFailed = result.crawlStart?.status === 'failed'
  toast.add({
    title: input.action === 'approve_and_index'
      ? 'Competitor approved'
      : input.action === 'save' ? 'Candidate saved' : 'Candidate dismissed',
    description: crawlFailed
      ? 'Approval is saved, but the first crawl needs attention.'
      : 'The nearby market decision has been recorded.',
    color: crawlFailed ? 'warning' : 'success'
  })
  if (!crawlFailed) reviewOpen.value = false
}

function candidateState(candidate: NearbyMarketCandidate) {
  if (candidate.approvedDomainId || candidate.state === 'approved') return { label: 'Monitored', color: 'success' as const }
  if (candidate.state === 'saved') return { label: 'Saved', color: 'info' as const }
  if (candidate.state === 'nominated') return { label: 'Client nominated', color: 'warning' as const }
  if (candidate.state === 'dismissed') return { label: 'Dismissed', color: 'neutral' as const }
  return { label: 'Discovery candidate', color: 'neutral' as const }
}

function categoryLabel(candidate: NearbyMarketCandidate) {
  return {
    franchise_new: 'Franchise / new car',
    used: 'Used car',
    independent: 'Independent',
    unclassified: 'Unclassified'
  }[candidate.category]
}

function updateMonitoringStatus(value: unknown) {
  if (value === 'all' || ['saved', 'nominated', 'approved', 'dismissed'].includes(String(value))) {
    void updateDiscoveryFilters({ monitoringStatus: value as SiteIntelligenceCandidateState | 'all' })
  }
}
</script>

<template>
  <UCard>
    <section aria-labelledby="nearby-market-heading" class="space-y-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-primary">
            Location-aware discovery
          </p>
          <h2 id="nearby-market-heading" class="mt-1 text-lg font-semibold text-highlighted">
            Nearby market
          </h2>
          <p class="mt-1 max-w-3xl text-sm leading-6 text-muted">
            Review public dealerships around a confirmed client location before adding any website to governed monitoring.
          </p>
        </div>
        <UBadge color="neutral" variant="subtle" label="Up to 20 discovery candidates · not exhaustive" />
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UFormField label="Market client">
          <USelectMenu
            :model-value="clientId"
            class="w-full"
            :items="clientItems"
            value-key="value"
            placeholder="Choose a client"
            @update:model-value="updateClient"
          />
        </UFormField>
        <UFormField label="Brand">
          <USelectMenu
            :model-value="filters.brand"
            class="w-full"
            :items="brandOptions"
            value-key="value"
            @update:model-value="updateDiscoveryFilters({ brand: String($event || 'all') })"
          />
        </UFormField>
        <UFormField label="Monitoring status">
          <USelectMenu
            :model-value="filters.monitoringStatus"
            class="w-full"
            :items="statusOptions"
            value-key="value"
            @update:model-value="updateMonitoringStatus"
          />
        </UFormField>
        <UFormField label="Dealer categories">
          <UCheckbox
            :model-value="filters.includeUsedIndependent"
            label="Include used and independent dealers"
            @update:model-value="updateDiscoveryFilters({ includeUsedIndependent: Boolean($event) })"
          />
        </UFormField>
      </div>

      <div class="flex flex-col gap-3 rounded-lg border border-default bg-elevated p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-medium text-highlighted">
            {{ location?.label || 'Market location not confirmed' }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{ location?.addressText || 'Confirm the client trading address before discovery.' }}
          </p>
        </div>
        <UButton
          v-if="canManage"
          :label="location ? 'Change location' : 'Confirm market location'"
          icon="i-lucide-map-pin-check"
          variant="soft"
          @click="openLocationModal"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2" aria-label="Discovery radius">
        <span class="mr-1 text-sm font-medium text-muted">Radius</span>
        <UButton
          v-for="radius in radiusOptions"
          :key="radius.value"
          :label="radius.label"
          size="sm"
          :variant="filters.radiusKm === radius.value ? 'solid' : 'soft'"
          :aria-pressed="filters.radiusKm === radius.value"
          @click="updateDiscoveryFilters({ radiusKm: radius.value })"
        />
      </div>

      <UAlert
        v-if="status.location === 'error'"
        color="error"
        variant="subtle"
        title="Market location unavailable"
        :description="errors.location || 'Existing site intelligence remains available.'"
      >
        <template #actions>
          <UButton
            label="Retry location"
            color="error"
            variant="soft"
            size="sm"
            @click="retryLocation"
          />
        </template>
      </UAlert>
      <UAlert
        v-else-if="status.search === 'error'"
        color="error"
        variant="subtle"
        :title="providerAlert.title"
        :description="providerAlert.detail || 'Existing monitored domains and diagnostics are unaffected.'"
        :data-provider-category="providerAlert.category"
      >
        <template #actions>
          <UButton
            label="Retry discovery"
            color="error"
            variant="soft"
            size="sm"
            @click="retrySearch"
          />
        </template>
      </UAlert>
      <UAlert
        v-else-if="!location && status.location !== 'pending'"
        color="neutral"
        variant="subtle"
        title="Confirm a market location to begin"
        description="No address suggestion is accepted until an agency user previews and confirms it."
      />

      <div v-if="location" class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section data-nearby-market-list aria-labelledby="nearby-market-list-heading" class="min-w-0 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h3 id="nearby-market-list-heading" class="text-base font-semibold text-highlighted">
              Distance-ranked dealerships
            </h3>
            <span class="text-xs text-muted">{{ candidates.length }} shown</span>
          </div>
          <div
            v-if="status.search === 'pending'"
            role="status"
            class="space-y-2"
            aria-live="polite"
          >
            <USkeleton v-for="index in 4" :key="index" class="h-24 w-full rounded-lg" />
            <span class="sr-only">Loading up to 20 discovery candidates…</span>
          </div>
          <UAlert
            v-else-if="!candidates.length && status.search !== 'error'"
            color="neutral"
            variant="subtle"
            title="No matching dealers under these filters"
            description="Try a wider radius or include used and independent dealers. This does not mean the market has no competitors."
          />
          <ol v-else class="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            <li v-for="(candidate, index) in candidates" :key="candidate.placeId">
              <article
                :ref="value => setRowRef(candidate.placeId, value)"
                data-candidate-row
                class="rounded-lg border p-3 transition-colors"
                :class="selectedPlaceId === candidate.placeId ? 'border-primary bg-primary/5' : 'border-default bg-default'"
              >
                <div class="flex items-start gap-3">
                  <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-semibold text-muted">{{ index + 1 }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h4 class="font-medium text-highlighted">
                          {{ candidate.displayName }}
                        </h4>
                        <p class="mt-1 text-xs text-muted">
                          {{ candidate.distanceKm.toFixed(1) }} km · {{ categoryLabel(candidate) }}
                        </p>
                      </div>
                      <UBadge :color="candidateState(candidate).color" variant="subtle" :label="candidateState(candidate).label" />
                    </div>
                    <p class="mt-2 line-clamp-2 text-xs leading-5 text-muted">
                      {{ candidate.formattedAddress }}
                    </p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <UButton
                        :label="`Select ${candidate.displayName}`"
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        @focus="selectCandidate(candidate.placeId)"
                        @click="selectCandidate(candidate.placeId)"
                      />
                      <UButton
                        v-if="candidate.approvedDomainId"
                        label="View monitored domain"
                        size="sm"
                        variant="soft"
                        @click="$emit('viewDiagnostics', { id: candidate.approvedDomainId }, null)"
                      />
                      <UButton
                        v-else-if="canManage"
                        label="Review website"
                        size="sm"
                        variant="soft"
                        @click="openReview(candidate.placeId)"
                      />
                    </div>
                  </div>
                </div>
              </article>
            </li>
          </ol>
        </section>

        <div class="min-w-0">
          <NearbyMarketMap
            v-if="center"
            :center="center"
            :radius-km="filters.radiusKm"
            :candidates="candidates"
            :selected-place-id="selectedPlaceId"
            @select="selectCandidate"
          />
          <UAlert
            v-else-if="status.search !== 'pending'"
            color="warning"
            variant="subtle"
            title="Map centre unavailable"
            description="The ranked list remains keyboard accessible. Retry discovery to resolve the confirmed client location for the map."
          />
        </div>
      </div>

      <AnalyticsAudiencesIntelligenceNominationQueue
        v-if="canManage"
        :nominations="nominations"
        :status="status.nominations"
        :error="errors.nominations"
        @retry="retryNominations"
        @review="openNomination"
      />
    </section>

    <AnalyticsAudiencesIntelligenceMarketLocationModal
      v-model:open="locationOpen"
      :client-id="clientId || null"
      :location="location"
      @saved="savedLocation"
    />
    <AnalyticsAudiencesIntelligenceCandidateReviewSlideover
      v-model:open="reviewOpen"
      :candidate="selectedCandidate"
      :review="candidateReview"
      :loading="status.candidateReview === 'pending'"
      :deciding="status.decision === 'pending'"
      :error="errors.candidateReview"
      :decision-result="decision"
      @retry-review="retryCandidateReview"
      @decide="decide"
      @retry-crawl="emit('retryCrawl', $event)"
      @view-diagnostics="(domain, run) => emit('viewDiagnostics', domain, run)"
    />
  </UCard>
</template>
