import type {
  GoogleAiMaxCampaignDetail,
  GoogleAiMaxReadinessFilters,
  GoogleAiMaxReadinessResponse,
  GoogleAiMaxScanRun
} from '~/types'

function compactQuery(filters: GoogleAiMaxReadinessFilters, includePagination = true) {
  return Object.fromEntries(
    Object.entries(filters).filter(([key, value]) => {
      if (!includePagination && (key === 'page' || key === 'pageSize')) return false
      return value !== undefined && value !== null && value !== ''
    })
  )
}

export function useGoogleAiMax() {
  const apiFetch = $fetch as <T>(
    request: string,
    options?: { method?: string, body?: unknown, query?: Record<string, unknown> }
  ) => Promise<T>

  function fetchReadiness(filters: GoogleAiMaxReadinessFilters) {
    return apiFetch<GoogleAiMaxReadinessResponse>(
      '/api/agency/social/google/ai-max/readiness',
      { query: compactQuery(filters) }
    )
  }

  function fetchDetail(id: string) {
    return apiFetch<GoogleAiMaxCampaignDetail>(
      `/api/agency/social/google/ai-max/readiness/${encodeURIComponent(id)}`
    )
  }

  function startScan(connectionId?: string) {
    return apiFetch<{ runId: string, status: 'queued' | 'running', deduplicated: boolean }>(
      '/api/agency/social/google/ai-max/scan',
      { method: 'POST', body: connectionId ? { connectionId } : {} }
    )
  }

  function fetchScan(runId: string) {
    return apiFetch<GoogleAiMaxScanRun>(
      `/api/agency/social/google/ai-max/scans/${encodeURIComponent(runId)}`
    )
  }

  function exportUrl(filters: GoogleAiMaxReadinessFilters) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(compactQuery(filters, false))) {
      params.set(key, String(value))
    }
    const query = params.toString()
    return `/api/agency/social/google/ai-max/export.csv${query ? `?${query}` : ''}`
  }

  return { fetchReadiness, fetchDetail, startScan, fetchScan, exportUrl }
}
