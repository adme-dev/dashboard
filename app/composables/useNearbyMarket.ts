import { computed, getCurrentScope, onScopeDispose, reactive, ref } from 'vue'
import type {
  ClientMarketLocation,
  NearbyMarketCandidateDecision,
  NearbyMarketCandidateReview,
  NearbyMarketRadius,
  NearbyMarketResponse,
  SiteIntelligenceCandidateState
} from '~/types/site-intelligence'

export type NearbyMarketResourceStatus = 'idle' | 'pending' | 'success' | 'error'
export type NearbyMarketResource = 'location' | 'search' | 'candidateReview' | 'decision' | 'nominations'
export type NearbyMarketMonitoringFilter = SiteIntelligenceCandidateState | 'all'

export interface NearbyMarketFilters {
  radiusKm: NearbyMarketRadius
  includeUsedIndependent: boolean
  brand: string
  monitoringStatus: NearbyMarketMonitoringFilter
}

export interface NearbyMarketNomination {
  id: string
  clientId?: string
  clientName?: string
  marketLocationId?: string
  marketLocationLabel?: string
  googlePlaceId?: string
  nominationReason?: string | null
  nominatedAt?: string | null
  nominatedByName?: string | null
  [key: string]: unknown
}

export type NearbyMarketDecisionInput
  = | { action: 'save' }
    | { action: 'dismiss', reviewerReason: string }
    | { action: 'approve_and_index', reviewerReason: string, websiteUri?: string }

interface FetchOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string>
  body?: unknown
  signal?: AbortSignal
}

interface DecisionResponse {
  candidate: Record<string, unknown>
  domain: Record<string, unknown> | null
  run: Record<string, unknown> | null
  crawlStart: Record<string, unknown> | null
}

const RESOURCES: NearbyMarketResource[] = [
  'location',
  'search',
  'candidateReview',
  'decision',
  'nominations'
]

export function useNearbyMarket() {
  const apiFetch = $fetch as <T>(request: string, options?: FetchOptions) => Promise<T>
  const filters = ref<NearbyMarketFilters>({
    radiusKm: 25,
    includeUsedIndependent: false,
    brand: 'all',
    monitoringStatus: 'all'
  })
  const activeClientId = ref<string | null>(null)
  const selectedPlaceId = ref<string | null>(null)
  const location = ref<ClientMarketLocation | null>(null)
  const market = ref<NearbyMarketResponse | null>(null)
  const candidateReview = ref<NearbyMarketCandidateReview | null>(null)
  const decision = ref<DecisionResponse | null>(null)
  const decisionPlaceId = ref<string | null>(null)
  const nominations = ref<NearbyMarketNomination[]>([])
  const status = reactive<Record<NearbyMarketResource, NearbyMarketResourceStatus>>({
    location: 'idle',
    search: 'idle',
    candidateReview: 'idle',
    decision: 'idle',
    nominations: 'idle'
  })
  const errors = reactive<Record<NearbyMarketResource, string | null>>({
    location: null,
    search: null,
    candidateReview: null,
    decision: null,
    nominations: null
  })
  const controllers = {} as Partial<Record<NearbyMarketResource, AbortController>>
  const versions = Object.fromEntries(RESOURCES.map(resource => [resource, 0])) as Record<NearbyMarketResource, number>

  let lastLocationClientId: string | null = null
  let lastSearchClientId: string | null = null
  let lastReviewPlaceId: string | null = null
  let lastDecision: { placeId: string, input: NearbyMarketDecisionInput } | null = null
  let lastNominationsClientId: string | null | undefined
  let hasNominationsRequest = false
  let activationGeneration = 0

  const candidates = computed(() => market.value?.candidates ?? [])

  function errorMessage(cause: unknown): string {
    const candidate = cause as {
      data?: { statusMessage?: string }
      statusMessage?: string
      message?: string
    } | null
    return candidate?.data?.statusMessage
      || candidate?.statusMessage
      || candidate?.message
      || 'Nearby market data could not be refreshed.'
  }

  function invalidate(resource: NearbyMarketResource) {
    versions[resource] += 1
    controllers[resource]?.abort()
    controllers[resource] = undefined
    if (status[resource] === 'pending') status[resource] = 'idle'
  }

  function resetDecision() {
    invalidate('decision')
    decision.value = null
    decisionPlaceId.value = null
    lastDecision = null
    status.decision = 'idle'
    errors.decision = null
  }

  function clearClient() {
    activationGeneration += 1
    activeClientId.value = null
    for (const resource of ['location', 'search', 'candidateReview', 'nominations'] as const) {
      invalidate(resource)
      status[resource] = 'idle'
      errors[resource] = null
    }
    resetDecision()
    location.value = null
    market.value = null
    candidateReview.value = null
    nominations.value = []
    selectedPlaceId.value = null
    lastLocationClientId = null
    lastSearchClientId = null
    lastReviewPlaceId = null
    lastNominationsClientId = undefined
    hasNominationsRequest = false
  }

  function setActiveClient(clientId: string) {
    if (activeClientId.value === clientId) return
    activeClientId.value = clientId
    for (const resource of ['location', 'search', 'candidateReview'] as const) {
      invalidate(resource)
    }
    resetDecision()
    location.value = null
    market.value = null
    candidateReview.value = null
    selectedPlaceId.value = null
  }

  async function runResource<T>(
    resource: NearbyMarketResource,
    request: (signal: AbortSignal) => Promise<T>,
    apply: (response: T) => void
  ): Promise<T | undefined> {
    const version = versions[resource] + 1
    versions[resource] = version
    controllers[resource]?.abort()
    const controller = new AbortController()
    controllers[resource] = controller
    status[resource] = 'pending'
    errors[resource] = null

    try {
      const response = await request(controller.signal)
      if (controller.signal.aborted || version !== versions[resource]) return undefined
      apply(response)
      status[resource] = 'success'
      return response
    } catch (cause: unknown) {
      if (controller.signal.aborted || version !== versions[resource]) return undefined
      status[resource] = 'error'
      errors[resource] = errorMessage(cause)
      return undefined
    } finally {
      if (versions[resource] === version) controllers[resource] = undefined
    }
  }

  function updateFilters(patch: Partial<NearbyMarketFilters>) {
    const next = { ...filters.value, ...patch }
    if (![10, 25, 50].includes(next.radiusKm)) return
    const changed = Object.entries(next).some(([key, value]) => (
      filters.value[key as keyof NearbyMarketFilters] !== value
    ))
    if (!changed) return
    filters.value = next
    invalidate('search')
    invalidate('candidateReview')
    resetDecision()
    candidateReview.value = null
    selectedPlaceId.value = null
  }

  function selectCandidate(placeId: string | null) {
    if (selectedPlaceId.value === placeId) return
    invalidate('candidateReview')
    resetDecision()
    candidateReview.value = null
    selectedPlaceId.value = placeId
  }

  async function loadLocation(clientId: string) {
    setActiveClient(clientId)
    invalidate('search')
    invalidate('candidateReview')
    resetDecision()
    market.value = null
    candidateReview.value = null
    selectedPlaceId.value = null
    lastLocationClientId = clientId
    return runResource<{ marketLocation: ClientMarketLocation | null }>(
      'location',
      signal => apiFetch('/api/agency/site-intelligence/market-locations', {
        query: { clientId },
        signal
      }),
      (response) => { location.value = response.marketLocation }
    )
  }

  function retryLocation() {
    return lastLocationClientId ? loadLocation(lastLocationClientId) : Promise.resolve(undefined)
  }

  async function search(clientId: string) {
    setActiveClient(clientId)
    lastSearchClientId = clientId
    const requestFilters = { ...filters.value }
    return runResource<NearbyMarketResponse>(
      'search',
      signal => apiFetch('/api/agency/site-intelligence/nearby-market/search', {
        method: 'POST',
        body: {
          clientId,
          radiusKm: requestFilters.radiusKm,
          includeUsedIndependent: requestFilters.includeUsedIndependent,
          ...(requestFilters.brand !== 'all' ? { brand: requestFilters.brand } : {}),
          ...(requestFilters.monitoringStatus !== 'all'
            ? { monitoringStatus: requestFilters.monitoringStatus }
            : {})
        },
        signal
      }),
      (response) => {
        market.value = response
        if (selectedPlaceId.value
          && !response.candidates.some(candidate => candidate.placeId === selectedPlaceId.value)) {
          selectedPlaceId.value = null
        }
      }
    )
  }

  function retrySearch() {
    return lastSearchClientId ? search(lastSearchClientId) : Promise.resolve(undefined)
  }

  async function reviewCandidate(placeId: string) {
    const clientId = activeClientId.value
    const marketLocationId = location.value?.id ?? market.value?.marketLocation?.id
    if (!clientId || !marketLocationId) {
      status.candidateReview = 'error'
      errors.candidateReview = 'Confirm a market location before reviewing a candidate.'
      return undefined
    }
    lastReviewPlaceId = placeId
    return runResource<NearbyMarketCandidateReview>(
      'candidateReview',
      signal => apiFetch(`/api/agency/site-intelligence/nearby-market/candidates/${encodeURIComponent(placeId)}`, {
        query: { clientId, marketLocationId },
        signal
      }),
      (response) => {
        candidateReview.value = response
        selectedPlaceId.value = response.placeId
      }
    )
  }

  function retryCandidateReview() {
    return lastReviewPlaceId ? reviewCandidate(lastReviewPlaceId) : Promise.resolve(undefined)
  }

  async function decideCandidate(placeId: string, input: NearbyMarketDecisionInput) {
    const clientId = activeClientId.value
    const marketLocationId = location.value?.id ?? market.value?.marketLocation?.id
    if (!clientId || !marketLocationId) {
      status.decision = 'error'
      errors.decision = 'Confirm a market location before recording a decision.'
      return undefined
    }
    const alreadyApproved = (
      (decisionPlaceId.value === placeId && decision.value?.candidate.state === 'approved')
      || candidates.value.some(candidate => candidate.placeId === placeId && candidate.state === 'approved')
    )
    if (alreadyApproved && input.action !== 'approve_and_index') {
      status.decision = 'error'
      errors.decision = 'This candidate is already approved; use crawl retry or diagnostics.'
      return undefined
    }
    if (decisionPlaceId.value !== placeId) resetDecision()
    lastDecision = { placeId, input }
    const body: NearbyMarketCandidateDecision = {
      ...input,
      clientId,
      marketLocationId,
      radiusKm: filters.value.radiusKm
    }
    return runResource<DecisionResponse>(
      'decision',
      signal => apiFetch(`/api/agency/site-intelligence/nearby-market/candidates/${encodeURIComponent(placeId)}/decision`, {
        method: 'POST',
        body,
        signal
      }),
      (response) => {
        decision.value = response
        decisionPlaceId.value = placeId
      }
    )
  }

  function retryDecision() {
    return lastDecision
      ? decideCandidate(lastDecision.placeId, lastDecision.input)
      : Promise.resolve(undefined)
  }

  async function loadNominations(clientId?: string | null) {
    hasNominationsRequest = true
    lastNominationsClientId = clientId
    return runResource<{ nominations: NearbyMarketNomination[] }>(
      'nominations',
      signal => apiFetch('/api/agency/site-intelligence/nearby-market/nominations', {
        query: clientId ? { clientId } : undefined,
        signal
      }),
      (response) => { nominations.value = response.nominations }
    )
  }

  function retryNominations() {
    return hasNominationsRequest
      ? loadNominations(lastNominationsClientId)
      : Promise.resolve(undefined)
  }

  async function activateClient(clientId: string | null, includeNominations: boolean) {
    const generation = activationGeneration + 1
    activationGeneration = generation
    if (!clientId) {
      clearClient()
      return undefined
    }
    setActiveClient(clientId)
    const requests: Array<Promise<unknown>> = [loadLocation(clientId)]
    if (includeNominations) requests.push(loadNominations(clientId))
    await Promise.allSettled(requests)
    if (generation !== activationGeneration || activeClientId.value !== clientId) return undefined
    if (location.value?.clientId !== clientId) return undefined
    await search(clientId)
    if (generation !== activationGeneration || activeClientId.value !== clientId) return undefined
    return location.value
  }

  async function reviewNomination(nomination: NearbyMarketNomination) {
    const { clientId, marketLocationId, googlePlaceId } = nomination
    if (!clientId || !marketLocationId || !googlePlaceId) {
      status.candidateReview = 'error'
      errors.candidateReview = 'This nomination is missing its client or market location context.'
      return undefined
    }
    await loadLocation(clientId)
    if (activeClientId.value !== clientId || location.value?.id !== marketLocationId) {
      status.candidateReview = 'error'
      errors.candidateReview = 'The nominated market location is no longer current for this client.'
      return undefined
    }
    selectCandidate(googlePlaceId)
    return reviewCandidate(googlePlaceId)
  }

  function abortAll() {
    for (const resource of RESOURCES) invalidate(resource)
  }

  if (getCurrentScope()) onScopeDispose(abortAll)

  return {
    filters,
    activeClientId,
    selectedPlaceId,
    location,
    market,
    candidates,
    candidateReview,
    decision,
    decisionPlaceId,
    nominations,
    status,
    errors,
    updateFilters,
    activateClient,
    clearClient,
    selectCandidate,
    loadLocation,
    retryLocation,
    search,
    retrySearch,
    reviewCandidate,
    retryCandidateReview,
    reviewNomination,
    decideCandidate,
    retryDecision,
    loadNominations,
    retryNominations,
    abortAll
  }
}
