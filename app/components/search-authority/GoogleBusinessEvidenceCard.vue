<script setup lang="ts">
type ProviderState = 'ready' | 'blocked' | 'unavailable' | 'not_started'

interface PerformanceResponse {
  enabled: boolean
  state: ProviderState
  reasonCode: string | null
  accountCount: number
  healthyAccountCount: number
  latestSync: null | {
    status: string
    reason_code: string | null
    rows_upserted: number
    provider_fetched_at: string | null
    completed_at: string
  }
  metrics: Array<{
    metricName: string
    metricDate: string
    value: number
    providerFetchedAt: string
  }>
  limitations: string[]
}

const props = defineProps<{ clientId: string | null }>()
const data = ref<PerformanceResponse | null>(null)
const loading = ref(false)

const statePresentation = computed(() => {
  const state = data.value?.state ?? 'unavailable'
  return {
    ready: { label: 'Available', color: 'success' as const },
    blocked: { label: 'Needs attention', color: 'warning' as const },
    unavailable: { label: 'Unavailable', color: 'neutral' as const },
    not_started: { label: 'Not synced', color: 'neutral' as const }
  }[state]
})

function metricTotal(names: string[]): number | null {
  const matching = data.value?.metrics.filter(row => names.includes(row.metricName)) ?? []
  return matching.length > 0 ? matching.reduce((total, row) => total + row.value, 0) : null
}

const evidenceTotals = computed(() => [
  {
    label: 'Search impressions',
    value: metricTotal(['BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH'])
  },
  {
    label: 'Maps impressions',
    value: metricTotal(['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS'])
  },
  { label: 'Website clicks', value: metricTotal(['WEBSITE_CLICKS']) },
  { label: 'Call clicks', value: metricTotal(['CALL_CLICKS']) }
])

const providerFetchedAt = computed(() => {
  const values = data.value?.metrics.map(row => row.providerFetchedAt).filter(Boolean) ?? []
  if (values.length === 0) return null
  return values.sort().at(-1) ?? null
})

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unavailable'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

async function load() {
  if (!props.clientId) {
    data.value = null
    return
  }
  loading.value = true
  try {
    data.value = await $fetch<PerformanceResponse>(
      `/api/agency/search-authority/google-business/performance?clientId=${encodeURIComponent(props.clientId)}`
    )
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
}

watch(() => props.clientId, () => void load(), { immediate: true })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="font-semibold text-highlighted">
            Google Business Profile evidence
          </h2>
          <p class="mt-1 text-sm text-muted">
            Optional, provider-reported location visibility kept separate from site and lead evidence.
          </p>
        </div>
        <UBadge
          :label="statePresentation.label"
          :color="statePresentation.color"
          variant="subtle"
        />
      </div>
    </template>

    <div v-if="loading" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <USkeleton v-for="index in 4" :key="index" class="h-20 w-full" />
    </div>
    <div v-else-if="data?.state === 'ready'" class="space-y-4">
      <div class="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-elevated lg:grid-cols-4">
        <div v-for="metric in evidenceTotals" :key="metric.label" class="bg-default p-4">
          <p class="text-xs text-muted">
            {{ metric.label }}
          </p>
          <p class="mt-1 text-xl font-semibold text-highlighted">
            {{ metric.value === null ? 'Unavailable' : metric.value.toLocaleString('en-AU') }}
          </p>
        </div>
      </div>
      <p class="text-xs text-muted">
        Provider fetched {{ formatTimestamp(providerFetchedAt) }}. Missing provider dates remain unavailable.
      </p>
    </div>
    <UAlert
      v-else
      :title="data?.state === 'blocked' ? 'Google Business evidence needs attention' : 'Google Business evidence unavailable'"
      :description="data?.reasonCode === 'provider_access_not_enabled'
        ? 'The Performance API remains disabled until Google production access and quota are proven.'
        : data?.reasonCode === 'google_business_not_connected'
          ? 'No healthy Google Business Profile location is connected for this client.'
          : 'No dated provider evidence is available yet; zero is not assumed.'"
      :color="data?.state === 'blocked' ? 'warning' : 'neutral'"
      variant="subtle"
    />
  </UCard>
</template>
