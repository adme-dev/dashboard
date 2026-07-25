<script setup lang="ts">
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

interface RefreshMeta {
  status: 'missing' | 'stale' | 'refreshing' | 'fresh' | 'failed'
  stale: boolean
  refreshing: boolean
  lastSuccessAt: string | null
  dataThroughAt: string | null
  lastError: string | null
}

const emit = defineEmits<{
  loaded: [payload: { breakdowns: any; extraMetrics: any }]
}>()
const apiFetch = $fetch as <T = unknown>(request: string, options?: {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
}) => Promise<T>

const SUPPORTED_PLATFORMS = ['meta', 'google_ads']
const isSupported = computed(() => SUPPORTED_PLATFORMS.includes(props.platform))
const EMPTY_BREAKDOWNS: Record<string, any[]> = {
  age: [],
  gender: [],
  device: [],
  geo: [],
  placement: [],
  hourly: [],
  city: [],
  region: [],
  device_model: [],
  story_type: [],
}

const breakdowns = ref<Record<string, any[]>>({
  ...EMPTY_BREAKDOWNS,
  ...(props.initialData || {}),
})
const extraMetrics = ref<Record<string, any> | null>(props.initialExtraMetrics || null)
const cache = ref<RefreshMeta | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
const syncing = ref(false)
const syncFailed = ref(false)

const hasAnyData = computed(() => Object.values(breakdowns.value).some(items => items.length > 0))
const visibleDimensions = computed(() => {
  const b = breakdowns.value
  const dims: Array<{ key: string; title: string; icon: string; items: any[] }> = []
  if (b.age?.length) dims.push({ key: 'age', title: 'Age Distribution', icon: 'i-lucide-users', items: b.age })
  if (b.gender?.length) dims.push({ key: 'gender', title: 'Gender Split', icon: 'i-lucide-user', items: b.gender })
  if (b.device?.length) dims.push({ key: 'device', title: 'Device Mix', icon: 'i-lucide-smartphone', items: b.device })
  if (b.geo?.length) dims.push({ key: 'geo', title: 'Top Countries', icon: 'i-lucide-globe', items: b.geo })
  if (b.placement?.length) dims.push({ key: 'placement', title: 'Placement', icon: 'i-lucide-layout-grid', items: b.placement })
  if (b.story_type?.length) dims.push({ key: 'story_type', title: 'Story Type', icon: 'i-lucide-film', items: b.story_type })
  if (b.city?.length) dims.push({ key: 'city', title: 'Top Cities', icon: 'i-lucide-map-pin', items: b.city })
  if (b.region?.length) dims.push({ key: 'region', title: 'Top Regions', icon: 'i-lucide-map', items: b.region })
  return dims
})
const hasHourlyData = computed(() => (breakdowns.value.hourly?.length || 0) > 0)

function applyResponse(response: any) {
  breakdowns.value = { ...EMPTY_BREAKDOWNS, ...(response?.breakdowns || {}) }
  extraMetrics.value = response?.extraMetrics || null
  cache.value = response?.cache || null
  emit('loaded', { breakdowns: breakdowns.value, extraMetrics: extraMetrics.value })
}

async function fetchBreakdowns(showPending = true) {
  if (!isSupported.value) return null
  if (showPending && !hasAnyData.value) status.value = 'pending'
  try {
    const response = await apiFetch<any>(`${props.apiBase}/breakdowns`, {
      query: { campaignId: props.mediaSpendId },
    })
    applyResponse(response)
    status.value = 'success'
    return response
  } catch {
    status.value = 'error'
    return null
  }
}

async function waitForBackgroundRefresh() {
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2500))
    const response = await fetchBreakdowns(false)
    if (!response?.cache?.refreshing) return
  }
}

async function refreshFromPlatform() {
  if (syncing.value) return
  syncing.value = true
  syncFailed.value = false
  try {
    const response = await apiFetch<any>(`${props.apiBase}/breakdowns/sync`, {
      method: 'POST',
      body: { campaignId: props.mediaSpendId },
    })
    if (response?.breakdowns) {
      applyResponse(response)
    } else {
      cache.value = response?.cache || cache.value
      await waitForBackgroundRefresh()
    }
  } catch (error) {
    console.warn('[BreakdownSection] On-demand sync failed:', error)
    syncFailed.value = true
  } finally {
    syncing.value = false
  }
}

watch(
  [() => props.mediaSpendId, () => props.apiBase, isSupported],
  async () => {
    const response = await fetchBreakdowns()
    if (!response || response.cache) return

    const hasExtraMetrics = extraMetrics.value && Object.values(extraMetrics.value).some(value => value != null)
    if ((!hasAnyData.value || !hasExtraMetrics) && isSupported.value) {
      await refreshFromPlatform()
    }
  },
  { immediate: true }
)

function timeAgo(value: string | null | undefined) {
  if (!value) return 'Never'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}
</script>

<template>
  <div>
    <div v-if="!isSupported" class="py-2 text-xs italic text-muted">
      Demographic breakdowns are not available for this platform.
    </div>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-[11px] text-muted">
          <UIcon name="i-lucide-chart-no-axes-combined" class="size-3.5" />
          <span>Audience and delivery insights</span>
          <UBadge v-if="cache?.refreshing" size="xs" color="info" variant="subtle">Refreshing</UBadge>
          <UBadge v-else-if="cache?.status === 'failed'" size="xs" color="warning" variant="subtle">Using stored data</UBadge>
          <span v-if="cache?.lastSuccessAt">Updated {{ timeAgo(cache.lastSuccessAt) }}</span>
        </div>
        <UButton
          v-if="cache"
          size="xs"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          label="Refresh"
          :loading="syncing || cache.refreshing"
          @click.stop="refreshFromPlatform"
        />
      </div>

      <div v-if="status === 'pending' && !hasAnyData" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div v-for="item in 4" :key="item" class="space-y-2">
          <USkeleton class="h-4 w-24 rounded" />
          <USkeleton v-for="bar in 3" :key="bar" class="h-6 w-full rounded" />
        </div>
      </div>

      <div v-else-if="hasAnyData" class="space-y-4">
        <div
          v-if="visibleDimensions.length"
          class="grid gap-4"
          :class="visibleDimensions.length >= 5 ? 'grid-cols-2 lg:grid-cols-5' : visibleDimensions.length >= 3 ? 'grid-cols-2 lg:grid-cols-4' : visibleDimensions.length === 2 ? 'grid-cols-2' : 'grid-cols-1 max-w-sm'"
        >
          <AnalyticsBreakdownBars
            v-for="dimension in visibleDimensions"
            :key="dimension.key"
            :title="dimension.title"
            :icon="dimension.icon"
            :items="dimension.items"
          />
        </div>
        <AnalyticsBreakdownHourlyChart v-if="hasHourlyData" :items="breakdowns.hourly" />
      </div>

      <div v-else-if="syncFailed || cache?.status === 'failed'" class="py-2 text-xs italic text-muted">
        Stored data is unavailable and the latest platform refresh failed. Use Refresh to try again.
      </div>

      <div v-else class="py-2 text-xs italic text-muted">
        {{ cache?.refreshing ? 'Preparing breakdown data in the background...' : 'No breakdown data available for this campaign.' }}
      </div>
    </template>
  </div>
</template>
