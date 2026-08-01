import type {
  AudienceBreakdownDimension,
  AudienceBreakdownsResponse,
  AudienceMetric,
  AudienceOverviewResponse,
  AudienceTimeseriesResponse
} from '~/types/audience-analytics'

export interface AudienceFilters {
  from: string
  to: string
  clientId: string | null
  metric: AudienceMetric
}

export type AudienceResourceStatus = 'idle' | 'pending' | 'success' | 'error'

const BREAKDOWN_DIMENSIONS: AudienceBreakdownDimension[] = [
  'source',
  'campaign',
  'page'
]

function localDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export function audiencePresetRange(days: 7 | 30 | 90, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end)
  start.setDate(end.getDate() - (days - 1))
  return { from: localDate(start), to: localDate(end) }
}

export function audienceQueryParams(filters: AudienceFilters): Record<string, string> {
  const query: Record<string, string> = {
    from: filters.from,
    to: filters.to
  }
  if (filters.clientId) query.clientId = filters.clientId
  if (filters.metric !== 'visitors') query.metric = filters.metric
  return query
}

export function useAudienceAnalytics() {
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { query?: Record<string, string>, signal?: AbortSignal }
  ) => Promise<T>
  const route = useRoute()
  const router = useRouter()
  const defaults = audiencePresetRange(30)
  const filters = ref<AudienceFilters>({
    from: queryString(route.query.from) ?? defaults.from,
    to: queryString(route.query.to) ?? defaults.to,
    clientId: queryString(route.query.clientId) ?? null,
    metric: (queryString(route.query.metric) as AudienceMetric | undefined) ?? 'visitors'
  })

  const overview = ref<AudienceOverviewResponse | null>(null)
  const timeseries = ref<AudienceTimeseriesResponse | null>(null)
  const breakdowns = ref<Partial<Record<AudienceBreakdownDimension, AudienceBreakdownsResponse>>>({})
  const status = reactive<Record<'overview' | 'timeseries' | 'breakdowns', AudienceResourceStatus>>({
    overview: 'idle',
    timeseries: 'idle',
    breakdowns: 'idle'
  })
  const errors = reactive<Record<'overview' | 'timeseries' | 'breakdowns', string | null>>({
    overview: null,
    timeseries: null,
    breakdowns: null
  })

  const query = computed(() => audienceQueryParams(filters.value))
  const baseQuery = computed(() => ({
    from: filters.value.from,
    to: filters.value.to,
    ...(filters.value.clientId ? { clientId: filters.value.clientId } : {})
  }))
  let activeController: AbortController | null = null
  let requestVersion = 0

  function errorMessage(error: unknown): string {
    const maybe = error as { data?: { statusMessage?: string }, message?: string }
    return maybe?.data?.statusMessage || maybe?.message || 'This audience view could not be refreshed.'
  }

  async function refreshAll() {
    const version = ++requestVersion
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller

    status.overview = 'pending'
    status.timeseries = 'pending'
    status.breakdowns = 'pending'
    errors.overview = null
    errors.timeseries = null
    errors.breakdowns = null

    const overviewRequest = apiFetch<AudienceOverviewResponse>('/api/agency/tracking/audiences/overview', {
      query: baseQuery.value,
      signal: controller.signal
    })
    const timeseriesRequest = apiFetch<AudienceTimeseriesResponse>('/api/agency/tracking/audiences/timeseries', {
      query: { ...baseQuery.value, metric: filters.value.metric },
      signal: controller.signal
    })
    const breakdownRequest = Promise.all(BREAKDOWN_DIMENSIONS.map(async (dimension) => {
      const response = await apiFetch<AudienceBreakdownsResponse>('/api/agency/tracking/audiences/breakdowns', {
        query: { ...baseQuery.value, dimension },
        signal: controller.signal
      })
      return [dimension, response] as const
    }))

    const settleOverview = overviewRequest.then((response) => {
      if (version !== requestVersion) return
      overview.value = response
      status.overview = 'success'
    }, (error) => {
      if (version !== requestVersion) return
      status.overview = 'error'
      errors.overview = errorMessage(error)
    })

    const settleTimeseries = timeseriesRequest.then((response) => {
      if (version !== requestVersion) return
      timeseries.value = response
      status.timeseries = 'success'
    }, (error) => {
      if (version !== requestVersion) return
      status.timeseries = 'error'
      errors.timeseries = errorMessage(error)
    })

    const settleBreakdowns = breakdownRequest.then((response) => {
      if (version !== requestVersion) return
      breakdowns.value = Object.fromEntries(response)
      status.breakdowns = 'success'
    }, (error) => {
      if (version !== requestVersion) return
      status.breakdowns = 'error'
      errors.breakdowns = errorMessage(error)
    })

    await Promise.all([settleOverview, settleTimeseries, settleBreakdowns])
  }

  function updateFilters(patch: Partial<AudienceFilters>) {
    filters.value = { ...filters.value, ...patch }
  }

  function setPreset(days: 7 | 30 | 90) {
    updateFilters(audiencePresetRange(days))
  }

  watch(query, (nextQuery) => {
    void router.replace({ query: nextQuery })
    void refreshAll()
  }, { immediate: true })

  onBeforeUnmount(() => activeController?.abort())

  return {
    filters,
    query,
    overview,
    timeseries,
    breakdowns,
    status,
    errors,
    updateFilters,
    setPreset,
    refreshAll
  }
}
