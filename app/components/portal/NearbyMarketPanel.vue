<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type {
  DealerCategory,
  NearbyMarketCandidate,
  NearbyMarketRadius,
  PortalCandidateState
} from '~/types/site-intelligence'
import NearbyMarketMap from '~/components/site-intelligence/NearbyMarketMap.client.vue'

const { canNominateCompetitors } = defineProps<{ canNominateCompetitors: boolean }>()

interface PortalMarketCandidate {
  placeId: string
  displayName: string
  formattedAddress: string
  location: { latitude: number, longitude: number }
  distanceKm: number
  category: DealerCategory
  portalState: PortalCandidateState
  googleMapsUri?: string
}

interface PortalMarketResponse {
  marketLocation: {
    id: string
    label: string
    addressText: string
    location: { latitude: number, longitude: number }
  } | null
  radiusKm: NearbyMarketRadius
  candidates: PortalMarketCandidate[]
  limited: boolean
  notice: string
}

const radiusKm = ref<NearbyMarketRadius>(25)
const includeUsedIndependent = ref(false)
const data = ref<PortalMarketResponse | null>(null)
const loading = ref(false)
const loadError = ref('')
const selectedPlaceId = ref<string | null>(null)
const nominationOpen = ref(false)
const nominationCandidate = ref<PortalMarketCandidate | null>(null)
const rowElements = new Map<string, HTMLElement>()
let requestGeneration = 0

const radiusOptions: Array<{ label: string, value: NearbyMarketRadius }> = [
  { label: '10 km', value: 10 },
  { label: '25 km', value: 25 },
  { label: '50 km', value: 50 }
]
const candidates = computed(() => data.value?.candidates || [])
const mapCandidates = computed(() => candidates.value as unknown as NearbyMarketCandidate[])

const statePresentation: Record<PortalCandidateState, { label: string, color: 'neutral' | 'warning' | 'success' }> = {
  suggested: { label: 'Suggested', color: 'neutral' },
  under_review: { label: 'Under review', color: 'warning' },
  monitored: { label: 'Monitored', color: 'success' },
  not_selected: { label: 'Not selected', color: 'neutral' }
}

function categoryLabel(category: DealerCategory) {
  return {
    franchise_new: 'Franchise / new car',
    used: 'Used car',
    independent: 'Independent',
    unclassified: 'Unclassified'
  }[category]
}

function setRowRef(placeId: string, value: Element | ComponentPublicInstance | null) {
  const element = value instanceof HTMLElement
    ? value
    : (value as ComponentPublicInstance | null)?.$el as HTMLElement | undefined
  if (element) rowElements.set(placeId, element)
  else rowElements.delete(placeId)
}

function selectCandidate(placeId: string) {
  selectedPlaceId.value = placeId
}

watch(selectedPlaceId, async (placeId) => {
  if (!placeId) return
  await nextTick()
  const row = rowElements.get(placeId)
  row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  if (row && !row.contains(document.activeElement)) {
    row.querySelector<HTMLElement>('[data-select-candidate]')?.focus()
  }
})

async function loadMarket() {
  const generation = ++requestGeneration
  loading.value = true
  loadError.value = ''
  try {
    const response = await $fetch<PortalMarketResponse>('/api/client-portal/site-intelligence/nearby-market', {
      query: {
        radiusKm: radiusKm.value,
        includeUsedIndependent: includeUsedIndependent.value
      }
    })
    if (generation !== requestGeneration) return
    data.value = response
    if (!response.candidates.some(candidate => candidate.placeId === selectedPlaceId.value)) {
      selectedPlaceId.value = response.candidates[0]?.placeId || null
    }
  } catch (error: unknown) {
    if (generation !== requestGeneration) return
    const statusCode = Number((error as { statusCode?: number, response?: { status?: number } })?.statusCode
      || (error as { response?: { status?: number } })?.response?.status)
    loadError.value = statusCode === 429
      ? 'Discovery is busy right now. Wait a moment, then try again.'
      : statusCode === 503
        ? 'Nearby market discovery is temporarily unavailable.'
        : 'Nearby market discovery could not be loaded.'
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

function setRadius(value: NearbyMarketRadius) {
  radiusKm.value = value
  void loadMarket()
}

function toggleDealerCategories(value: boolean | 'indeterminate') {
  includeUsedIndependent.value = value === true
  void loadMarket()
}

function openNomination(candidate: PortalMarketCandidate) {
  nominationCandidate.value = candidate
  nominationOpen.value = true
}

function markNominated(placeId: string) {
  const candidate = data.value?.candidates.find(item => item.placeId === placeId)
  if (candidate) candidate.portalState = 'under_review'
}

onMounted(loadMarket)
</script>

<template>
  <UCard>
    <section aria-labelledby="portal-nearby-market-heading" class="space-y-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="portal-nearby-market-heading" class="text-lg font-semibold text-highlighted">
            Dealerships around your location
          </h2>
          <p class="mt-1 max-w-3xl text-sm leading-6 text-muted">
            Distance-ranked suggestions from up to 20 nearby dealerships. Results are not exhaustive.
          </p>
        </div>
        <UBadge color="neutral" variant="subtle" label="Up to 20 suggestions" />
      </div>

      <UAlert
        v-if="!canNominateCompetitors"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock-keyhole"
        title="Read-only market view"
        description="Contact your agency to request competitor nomination access."
      />

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
        <UFormField label="Discovery radius">
          <div class="flex flex-wrap gap-2" role="group" aria-label="Discovery radius">
            <UButton
              v-for="option in radiusOptions"
              :key="option.value"
              :label="option.label"
              size="sm"
              :variant="radiusKm === option.value ? 'solid' : 'soft'"
              :aria-pressed="radiusKm === option.value"
              @click="setRadius(option.value)"
            />
          </div>
        </UFormField>
        <UFormField label="Dealer categories">
          <UCheckbox
            :model-value="includeUsedIndependent"
            label="Include used and independent dealers"
            @update:model-value="toggleDealerCategories"
          />
        </UFormField>
      </div>

      <div v-if="data?.marketLocation" class="rounded-lg border border-default bg-elevated p-4">
        <p class="text-sm font-medium text-highlighted">
          {{ data.marketLocation.label }}
        </p>
        <p class="mt-1 text-sm text-muted">
          {{ data.marketLocation.addressText }}
        </p>
      </div>

      <UAlert
        v-if="loadError"
        role="alert"
        color="error"
        variant="subtle"
        title="Nearby market unavailable"
        :description="loadError"
      >
        <template #actions>
          <UButton
            label="Try again"
            color="error"
            variant="soft"
            size="sm"
            @click="loadMarket"
          />
        </template>
      </UAlert>
      <UAlert
        v-else-if="!loading && data && !data.marketLocation"
        color="neutral"
        variant="subtle"
        title="Market location not ready"
        description="Contact your agency to confirm the trading location used for nearby discovery."
      />

      <div
        v-if="data?.marketLocation"
        class="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
      >
        <section
          data-nearby-market-list
          aria-labelledby="portal-market-list-heading"
          class="min-w-0 space-y-3"
        >
          <div class="flex items-center justify-between gap-3">
            <h3 id="portal-market-list-heading" class="text-base font-semibold text-highlighted">
              Nearby dealerships
            </h3>
            <span class="text-xs text-muted">{{ candidates.length }} shown</span>
          </div>
          <div
            v-if="loading"
            role="status"
            aria-live="polite"
            class="space-y-2"
          >
            <USkeleton v-for="index in 4" :key="index" class="h-28 w-full rounded-lg" />
            <span class="sr-only">Loading nearby dealerships…</span>
          </div>
          <UAlert
            v-else-if="!candidates.length && !loadError"
            color="neutral"
            variant="subtle"
            title="No matching dealerships under these settings"
            description="Try another radius or include used and independent dealers. This does not mean there are no local competitors."
          />
          <ol v-else class="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            <li v-for="(candidate, index) in candidates" :key="candidate.placeId">
              <article
                :ref="value => setRowRef(candidate.placeId, value)"
                class="rounded-lg border p-3 transition-colors"
                :class="selectedPlaceId === candidate.placeId ? 'border-primary bg-primary/5' : 'border-default bg-default'"
              >
                <div class="flex items-start gap-3">
                  <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-semibold text-muted">
                    {{ index + 1 }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h4 class="font-medium text-highlighted">
                          {{ candidate.displayName }}
                        </h4>
                        <p class="mt-1 text-xs text-muted">
                          {{ candidate.distanceKm.toFixed(1) }} km · {{ categoryLabel(candidate.category) }}
                        </p>
                      </div>
                      <UBadge
                        :label="statePresentation[candidate.portalState].label"
                        :color="statePresentation[candidate.portalState].color"
                        variant="subtle"
                      />
                    </div>
                    <p class="mt-2 text-xs leading-5 text-muted">
                      {{ candidate.formattedAddress }}
                    </p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <UButton
                        data-select-candidate
                        :label="`Select ${candidate.displayName}`"
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        @focus="selectCandidate(candidate.placeId)"
                        @click="selectCandidate(candidate.placeId)"
                      />
                      <UButton
                        v-if="canNominateCompetitors && ['suggested', 'not_selected'].includes(candidate.portalState)"
                        label="Nominate competitor"
                        size="sm"
                        variant="soft"
                        icon="i-lucide-flag"
                        @click="openNomination(candidate)"
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
            :center="data.marketLocation.location"
            :radius-km="radiusKm"
            :candidates="mapCandidates"
            :selected-place-id="selectedPlaceId"
            @select="selectCandidate"
          />
        </div>
      </div>
    </section>
  </UCard>

  <PortalCompetitorNominationModal
    v-model:open="nominationOpen"
    :candidate="nominationCandidate"
    :market-location-id="data?.marketLocation?.id || null"
    :radius-km="radiusKm"
    @nominated="markNominated"
  />
</template>
