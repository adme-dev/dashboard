import type {
  SiteIntelligenceChangeResponse,
  SiteIntelligenceDomain,
  SiteIntelligenceGapResponse,
  SiteIntelligenceLane,
  SiteIntelligenceOverviewResponse,
  SiteIntelligenceRun
} from '~/types/site-intelligence'

export type SiteIntelligenceLaneFilter = SiteIntelligenceLane | 'all'
export type SiteIntelligenceChangeFilter = 'page_added' | 'facts_changed' | 'all'
export type SiteIntelligenceResourceStatus = 'idle' | 'pending' | 'success' | 'error'

export interface SiteIntelligenceFilters {
  from: string
  to: string
  clientId: string | null
  lane: SiteIntelligenceLaneFilter
  changeType: SiteIntelligenceChangeFilter
}

interface SiteIntelligenceRunDetail {
  generatedAt: string
  run: SiteIntelligenceRun
  domain: SiteIntelligenceDomain
  recentChanges: SiteIntelligenceChangeResponse['rows']
}

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

export function siteIntelligencePresetRange(days: 7 | 30 | 90, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end)
  start.setDate(end.getDate() - (days - 1))
  return { from: localDate(start), to: localDate(end) }
}

export function siteIntelligenceQueryParams(filters: SiteIntelligenceFilters): Record<string, string> {
  const query: Record<string, string> = { from: filters.from, to: filters.to }
  if (filters.clientId) query.clientId = filters.clientId
  if (filters.lane !== 'all') query.lane = filters.lane
  if (filters.changeType !== 'all') query.changeType = filters.changeType
  return query
}

export function siteIntelligenceFiltersFromQuery(
  input: Record<string, unknown>,
  defaults = siteIntelligencePresetRange(30)
): SiteIntelligenceFilters {
  const lane = queryString(input.lane)
  const changeType = queryString(input.changeType)
  return {
    from: queryString(input.from) ?? defaults.from,
    to: queryString(input.to) ?? defaults.to,
    clientId: queryString(input.clientId) ?? null,
    lane: lane === 'owned' || lane === 'competitor' ? lane : 'all',
    changeType: changeType === 'page_added' || changeType === 'facts_changed' ? changeType : 'all'
  }
}

export function useSiteIntelligence() {
  const apiFetch = $fetch as <T = unknown>(request: string, options?: {
    method?: 'GET' | 'POST'
    query?: Record<string, string>
    body?: unknown
    signal?: AbortSignal
  }) => Promise<T>
  const route = useRoute()
  const router = useRouter()
  const defaults = siteIntelligencePresetRange(30)
  const filters = ref<SiteIntelligenceFilters>(siteIntelligenceFiltersFromQuery(route.query, defaults))

  const overview = ref<SiteIntelligenceOverviewResponse | null>(null)
  const changes = ref<SiteIntelligenceChangeResponse | null>(null)
  const gaps = ref<SiteIntelligenceGapResponse | null>(null)
  const runDetail = ref<SiteIntelligenceRunDetail | null>(null)
  const status = reactive<Record<'overview' | 'changes' | 'gaps' | 'run', SiteIntelligenceResourceStatus>>({
    overview: 'idle',
    changes: 'idle',
    gaps: 'idle',
    run: 'idle'
  })
  const errors = reactive<Record<'overview' | 'changes' | 'gaps' | 'run', string | null>>({
    overview: null,
    changes: null,
    gaps: null,
    run: null
  })

  const query = computed(() => siteIntelligenceQueryParams(filters.value))
  const apiQuery = computed(() => ({
    from: filters.value.from,
    to: filters.value.to,
    ...(filters.value.clientId ? { clientId: filters.value.clientId } : {}),
    ...(filters.value.lane !== 'all' ? { lane: filters.value.lane } : {})
  }))
  let activeController: AbortController | null = null
  let requestVersion = 0

  function errorMessage(error: unknown): string {
    const candidate = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string } | null
    return candidate?.data?.statusMessage
      || candidate?.statusMessage
      || candidate?.message
      || 'Site intelligence could not be refreshed.'
  }

  async function refreshOverview(signal?: AbortSignal, version = requestVersion) {
    status.overview = 'pending'
    errors.overview = null
    try {
      const response = await apiFetch<SiteIntelligenceOverviewResponse>('/api/agency/site-intelligence/overview', {
        query: apiQuery.value,
        signal
      })
      if (version !== requestVersion) return
      overview.value = response
      status.overview = 'success'
    } catch (error: unknown) {
      if (version !== requestVersion || signal?.aborted) return
      status.overview = 'error'
      errors.overview = errorMessage(error)
    }
  }

  async function refreshChanges(signal?: AbortSignal, version = requestVersion) {
    status.changes = 'pending'
    errors.changes = null
    try {
      const response = await apiFetch<SiteIntelligenceChangeResponse>('/api/agency/site-intelligence/changes', {
        query: {
          ...apiQuery.value,
          ...(filters.value.changeType !== 'all' ? { changeType: filters.value.changeType } : {})
        },
        signal
      })
      if (version !== requestVersion) return
      changes.value = response
      status.changes = 'success'
    } catch (error: unknown) {
      if (version !== requestVersion || signal?.aborted) return
      status.changes = 'error'
      errors.changes = errorMessage(error)
    }
  }

  async function refreshGaps(signal?: AbortSignal, version = requestVersion) {
    status.gaps = 'pending'
    errors.gaps = null
    try {
      const response = await apiFetch<SiteIntelligenceGapResponse>('/api/agency/site-intelligence/gaps', {
        query: {
          from: filters.value.from,
          to: filters.value.to,
          ...(filters.value.clientId ? { clientId: filters.value.clientId } : {})
        },
        signal
      })
      if (version !== requestVersion) return
      gaps.value = response
      status.gaps = 'success'
    } catch (error: unknown) {
      if (version !== requestVersion || signal?.aborted) return
      status.gaps = 'error'
      errors.gaps = errorMessage(error)
    }
  }

  async function refreshAll() {
    const version = ++requestVersion
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    await refreshOverview(controller.signal, version)
    if (version !== requestVersion) return
    await Promise.allSettled([
      refreshChanges(controller.signal, version),
      refreshGaps(controller.signal, version)
    ])
  }

  async function loadRun(runId: string) {
    status.run = 'pending'
    errors.run = null
    try {
      runDetail.value = await apiFetch<SiteIntelligenceRunDetail>(`/api/agency/site-intelligence/runs/${runId}`, {
        query: filters.value.clientId ? { clientId: filters.value.clientId } : undefined
      })
      status.run = 'success'
    } catch (error: unknown) {
      status.run = 'error'
      errors.run = errorMessage(error)
    }
  }

  async function crawlDomain(domainId: string): Promise<SiteIntelligenceRun> {
    const response = await apiFetch<{ run: SiteIntelligenceRun }>(`/api/agency/site-intelligence/domains/${domainId}/crawl`, {
      method: 'POST'
    })
    if (overview.value) {
      overview.value = {
        ...overview.value,
        runs: [response.run, ...overview.value.runs.filter(run => run.domainId !== response.run.domainId)]
      }
    }
    return response.run
  }

  function mergeDomain(domain: SiteIntelligenceDomain) {
    if (!overview.value) return
    const exists = overview.value.domains.some(item => item.id === domain.id)
    overview.value = {
      ...overview.value,
      domains: exists
        ? overview.value.domains.map(item => item.id === domain.id ? domain : item)
        : [...overview.value.domains, domain]
    }
  }

  function updateFilters(patch: Partial<SiteIntelligenceFilters>) {
    filters.value = { ...filters.value, ...patch }
  }

  watch(() => route.query, (routeQuery) => {
    const next = siteIntelligenceFiltersFromQuery(routeQuery, defaults)
    if (
      next.from === filters.value.from
      && next.to === filters.value.to
      && next.clientId === filters.value.clientId
      && next.lane === filters.value.lane
      && next.changeType === filters.value.changeType
    ) return
    filters.value = next
  }, { deep: true })

  watch(query, (nextQuery) => {
    void router.replace({ query: nextQuery })
    void refreshAll()
  }, { immediate: true })

  onBeforeUnmount(() => activeController?.abort())

  return {
    filters,
    query,
    overview,
    changes,
    gaps,
    runDetail,
    status,
    errors,
    updateFilters,
    refreshAll,
    refreshOverview,
    refreshChanges,
    refreshGaps,
    loadRun,
    crawlDomain,
    mergeDomain
  }
}
