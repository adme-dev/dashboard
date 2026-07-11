<script setup lang="ts">
/**
 * Container for breakdown charts (age, gender, device, geo, placement, hourly).
 * Fetches from DB first; if empty, triggers on-demand sync from the platform API.
 */
const props = withDefaults(defineProps<{
  mediaSpendId: string
  platform: string
  apiBase?: string
  initialData?: Record<string, any[]> | null
  initialExtraMetrics?: Record<string, any> | null
}>(), {
  apiBase: '/api/agency/analytics',
  initialData: null,
  initialExtraMetrics: null,
})

const emit = defineEmits<{
  loaded: [payload: { breakdowns: any; extraMetrics: any }]
}>()
const apiFetch = $fetch as <T = unknown>(request: string, options?: {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
}) => Promise<T>

// Only platforms with on-demand sync support (see onDemandSync.ts BREAKDOWN_PLATFORMS)
const SUPPORTED_PLATFORMS = ['meta', 'google_ads']
const isSupported = computed(() => SUPPORTED_PLATFORMS.includes(props.platform))

const EMPTY_BREAKDOWNS: Record<string, any[]> = { age: [], gender: [], device: [], geo: [], placement: [], hourly: [], city: [], region: [], device_model: [], story_type: [] }

// If cached data provided, skip fetch entirely
const useCached = computed(() => props.initialData != null)

// Step 1: Try fetching from DB (skipped when cached)
const data = ref<any | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function fetchBreakdowns() {
  if (!isSupported.value || useCached.value) return
  status.value = 'pending'
  try {
    data.value = await apiFetch<any>(`${props.apiBase}/breakdowns`, {
      query: { campaignId: props.mediaSpendId },
    })
    status.value = 'success'
  } catch {
    data.value = null
    status.value = 'error'
  }
}

watch([() => props.mediaSpendId, () => props.apiBase, isSupported, useCached], () => {
  fetchBreakdowns()
}, { immediate: true })

const breakdowns = ref<Record<string, any[]>>({ ...EMPTY_BREAKDOWNS })
const extraMetrics = ref<Record<string, any> | null>(null)
const hasBreakdowns = ref(false)
const syncing = ref(false)
const syncFailed = ref(false)
const syncAttempted = ref(false)

// Seed from cache if available
if (props.initialData) {
  breakdowns.value = { ...EMPTY_BREAKDOWNS, ...props.initialData }
  hasBreakdowns.value = Object.values(breakdowns.value).some(arr => arr.length > 0)
  extraMetrics.value = props.initialExtraMetrics || null
}

const hasAnyData = computed(() => {
  const b = breakdowns.value
  return b.age?.length > 0 || b.gender?.length > 0 || b.device?.length > 0 || b.geo?.length > 0 || b.placement?.length > 0 || b.hourly?.length > 0 || b.city?.length > 0 || b.region?.length > 0 || b.story_type?.length > 0
})

// Non-hourly dimensions for the grid of bar charts
const visibleDimensions = computed(() => {
  const b = breakdowns.value
  const dims: Array<{ key: string; title: string; icon: string; items: any[] }> = []
  if (b.age?.length > 0) dims.push({ key: 'age', title: 'Age Distribution', icon: 'i-lucide-users', items: b.age })
  if (b.gender?.length > 0) dims.push({ key: 'gender', title: 'Gender Split', icon: 'i-lucide-user', items: b.gender })
  if (b.device?.length > 0) dims.push({ key: 'device', title: 'Device Mix', icon: 'i-lucide-smartphone', items: b.device })
  if (b.geo?.length > 0) dims.push({ key: 'geo', title: 'Top Countries', icon: 'i-lucide-globe', items: b.geo })
  if (b.placement?.length > 0) dims.push({ key: 'placement', title: 'Placement', icon: 'i-lucide-layout-grid', items: b.placement })
  if (b.story_type?.length > 0) dims.push({ key: 'story_type', title: 'Story Type', icon: 'i-lucide-film', items: b.story_type })
  if (b.city?.length > 0) dims.push({ key: 'city', title: 'Top Cities', icon: 'i-lucide-map-pin', items: b.city })
  if (b.region?.length > 0) dims.push({ key: 'region', title: 'Top Regions', icon: 'i-lucide-map', items: b.region })
  return dims
})

const hasHourlyData = computed(() => (breakdowns.value.hourly?.length ?? 0) > 0)

// Step 2: When DB fetch completes, check if data exists. If not, trigger on-demand sync.
watch(data, async (val) => {
  if (!val || useCached.value) return
  const resp = val as any
  breakdowns.value = { ...EMPTY_BREAKDOWNS, ...(resp.breakdowns || {}) }
  hasBreakdowns.value = resp.hasBreakdowns === true
  extraMetrics.value = resp.extraMetrics || null

  const b = breakdowns.value
  const isEmpty = !b.age?.length && !b.gender?.length && !b.device?.length && !b.geo?.length && !b.placement?.length && !b.hourly?.length && !b.city?.length && !b.region?.length && !b.story_type?.length
  // Also sync if we have breakdowns but no extra metrics (migration 041 applied after initial sync)
  const hasExtraMetrics = extraMetrics.value && Object.values(extraMetrics.value).some(v => v != null)
  const needsSync = isEmpty || (!hasExtraMetrics && isSupported.value)

  if (needsSync && isSupported.value && !syncing.value && !syncFailed.value && !syncAttempted.value) {
    // Auto-trigger on-demand sync
    syncing.value = true
    try {
      const syncResult = await apiFetch<any>(`${props.apiBase}/breakdowns/sync`, {
        method: 'POST',
        body: { campaignId: props.mediaSpendId },
      })
      if (syncResult?.breakdowns) {
        breakdowns.value = { ...EMPTY_BREAKDOWNS, ...syncResult.breakdowns }
        hasBreakdowns.value = syncResult.hasBreakdowns === true
      }
      if (syncResult?.extraMetrics) {
        extraMetrics.value = syncResult.extraMetrics
      }
    } catch (err) {
      console.warn('[BreakdownSection] On-demand sync failed:', err)
      syncFailed.value = true
    } finally {
      syncing.value = false
      syncAttempted.value = true
    }
  }

  emit('loaded', { breakdowns: breakdowns.value, extraMetrics: extraMetrics.value })
})
</script>

<template>
  <div>
    <div v-if="!isSupported" class="text-xs text-muted italic py-2">
      Demographic breakdowns are not available for this platform.
    </div>

    <div v-else-if="status === 'pending' || syncing" class="space-y-3">
      <div v-if="syncing" class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
        <span>Fetching breakdown data from {{ platform === 'meta' ? 'Meta' : platform === 'google_ads' ? 'Google' : 'platform' }}...</span>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="space-y-2">
          <USkeleton class="h-4 w-24 rounded" />
          <USkeleton v-for="j in 3" :key="j" class="h-6 w-full rounded" />
        </div>
      </div>
    </div>

    <div v-else-if="hasAnyData" class="space-y-4">
      <!-- Bar chart breakdowns grid -->
      <div
        v-if="visibleDimensions.length > 0"
        class="grid gap-4"
        :class="visibleDimensions.length >= 5 ? 'grid-cols-2 lg:grid-cols-5' : visibleDimensions.length >= 3 ? 'grid-cols-2 lg:grid-cols-4' : visibleDimensions.length === 2 ? 'grid-cols-2' : 'grid-cols-1 max-w-sm'"
      >
        <AnalyticsBreakdownBars
          v-for="dim in visibleDimensions"
          :key="dim.key"
          :title="dim.title"
          :icon="dim.icon"
          :items="dim.items"
        />
      </div>

      <!-- Hourly chart (full width below the grid) -->
      <AnalyticsBreakdownHourlyChart
        v-if="hasHourlyData"
        :items="breakdowns.hourly"
      />
    </div>

    <div v-else-if="syncFailed" class="text-xs text-muted italic py-2">
      Could not fetch breakdown data from the platform. Try again later.
    </div>

    <div v-else class="text-xs text-muted italic py-2">
      No breakdown data available for this campaign.
    </div>
  </div>
</template>
