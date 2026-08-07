import { computed, ref, type Ref } from 'vue'
import type {
  PortalAnalyticsCampaignsResponse,
  PortalAnalyticsFreshnessResponse,
  PortalAnalyticsLeadHealth,
  PortalAnalyticsOptionalSection,
  PortalAnalyticsOverview,
  PortalAnalyticsPersonaResponse,
  PortalAnalyticsPrintFilters,
  PortalAnalyticsPrintReport,
  PortalAnalyticsPrintSections,
  PortalAnalyticsTrackingBreakdown,
  PortalAnalyticsTrackingFunnel,
  PortalAnalyticsTrackingSummary,
  PortalAnalyticsTrackingTimeseries,
  PortalAnalyticsTrendResponse,
  PortalAnalyticsWebsiteFunnelResponse
} from '~/types'

type OptionalReportPayloads = {
  freshness: PortalAnalyticsFreshnessResponse
  websiteFunnel: PortalAnalyticsWebsiteFunnelResponse
  trackingSummary: PortalAnalyticsTrackingSummary
  trackingHealth: PortalAnalyticsLeadHealth
  trackingTimeseries: PortalAnalyticsTrackingTimeseries
  trackingFunnel: PortalAnalyticsTrackingFunnel
  trackingPages: PortalAnalyticsTrackingBreakdown
  trackingSources: PortalAnalyticsTrackingBreakdown
  trackingDevices: PortalAnalyticsTrackingBreakdown
  personas: PortalAnalyticsPersonaResponse
}

type OptionalSettledResults = Partial<{
  [K in keyof OptionalReportPayloads]: PromiseSettledResult<OptionalReportPayloads[K]>
}>

interface RequiredReportPayloads {
  overview: PortalAnalyticsOverview
  trend: PortalAnalyticsTrendResponse
  campaigns: PortalAnalyticsCampaignsResponse
}

function optionalSection<T>(result?: PromiseSettledResult<T>): PortalAnalyticsOptionalSection<T> {
  return result?.status === 'fulfilled'
    ? { status: 'available', data: result.value }
    : { status: 'unavailable', data: null }
}

export function buildPortalAnalyticsPrintReport(
  filters: PortalAnalyticsPrintFilters,
  required: RequiredReportPayloads,
  optional: OptionalSettledResults = {}
): PortalAnalyticsPrintReport {
  const sections: PortalAnalyticsPrintSections = {
    freshness: optionalSection(optional.freshness),
    websiteFunnel: optionalSection(optional.websiteFunnel),
    trackingSummary: optionalSection(optional.trackingSummary),
    trackingHealth: optionalSection(optional.trackingHealth),
    trackingTimeseries: optionalSection(optional.trackingTimeseries),
    trackingFunnel: optionalSection(optional.trackingFunnel),
    trackingPages: optionalSection(optional.trackingPages),
    trackingSources: optionalSection(optional.trackingSources),
    trackingDevices: optionalSection(optional.trackingDevices),
    personas: optionalSection(optional.personas)
  }

  return {
    filters,
    generatedAt: new Date().toISOString(),
    ...required,
    sections
  }
}

export function usePortalAnalyticsPrintReport(filters: Ref<PortalAnalyticsPrintFilters>) {
  const report = ref<PortalAnalyticsPrintReport | null>(null)
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const error = ref<unknown>(null)
  const ready = computed(() => status.value === 'success' && report.value !== null)
  const apiFetch = $fetch as <T>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>

  async function refresh() {
    status.value = 'pending'
    error.value = null

    const current = filters.value
    const query: Record<string, string> = {
      startDate: current.startDate,
      endDate: current.endDate
    }
    if (current.platforms.length) query.platform = current.platforms.join(',')
    if (current.runningOnly) query.runningOnly = 'true'

    const trackingQuery = { from: current.startDate, to: current.endDate }
    const optionalRequests = {
      freshness: apiFetch<PortalAnalyticsFreshnessResponse>('/api/portal/analytics/refresh-overview', { query }),
      websiteFunnel: apiFetch<PortalAnalyticsWebsiteFunnelResponse>('/api/portal/analytics/funnel', { query }),
      trackingSummary: apiFetch<PortalAnalyticsTrackingSummary>('/api/portal/analytics/tracking/summary', { query: trackingQuery }),
      trackingHealth: apiFetch<PortalAnalyticsLeadHealth>('/api/portal/analytics/tracking/health', { query: trackingQuery }),
      trackingTimeseries: apiFetch<PortalAnalyticsTrackingTimeseries>('/api/portal/analytics/tracking/timeseries', { query: trackingQuery }),
      trackingFunnel: apiFetch<PortalAnalyticsTrackingFunnel>('/api/portal/analytics/tracking/funnel', { query: trackingQuery }),
      trackingPages: apiFetch<PortalAnalyticsTrackingBreakdown>('/api/portal/analytics/tracking/breakdown', { query: { ...trackingQuery, dimension: 'page' } }),
      trackingSources: apiFetch<PortalAnalyticsTrackingBreakdown>('/api/portal/analytics/tracking/breakdown', { query: { ...trackingQuery, dimension: 'source' } }),
      trackingDevices: apiFetch<PortalAnalyticsTrackingBreakdown>('/api/portal/analytics/tracking/breakdown', { query: { ...trackingQuery, dimension: 'device' } }),
      personas: apiFetch<PortalAnalyticsPersonaResponse>('/api/portal/analytics/personas', { query })
    }

    try {
      const [overview, trend, campaigns, optionalResults] = await Promise.all([
        apiFetch<PortalAnalyticsOverview>('/api/portal/analytics/overview', { query }),
        apiFetch<PortalAnalyticsTrendResponse>('/api/portal/analytics/trends', {
          query: { ...query, metric: current.metric, groupBy: 'day' }
        }),
        apiFetch<PortalAnalyticsCampaignsResponse>('/api/portal/analytics/campaigns', {
          query: { ...query, limit: '200', offset: '0', sortBy: 'spend', sortDir: 'desc' }
        }),
        Promise.allSettled(Object.values(optionalRequests))
      ])
      const optionalKeys = Object.keys(optionalRequests) as Array<keyof OptionalReportPayloads>
      const optional = Object.fromEntries(
        optionalKeys.map((key, index) => [key, optionalResults[index]])
      ) as OptionalSettledResults

      report.value = buildPortalAnalyticsPrintReport(current, { overview, trend, campaigns }, optional)
      status.value = 'success'
    } catch (cause) {
      report.value = null
      error.value = cause
      status.value = 'error'
    }
  }

  return { report, status, error, ready, refresh }
}
