import type { PortalAnalyticsPrintFilters, PortalAnalyticsPrintMetric } from '~/types'

const ALLOWED_METRICS = new Set<PortalAnalyticsPrintMetric>([
  'spend',
  'impressions',
  'clicks',
  'leads',
  'cpc',
  'ctr',
  'costPerLead'
])

type QueryValue = string | string[] | null | undefined

function firstQueryValue(value: QueryValue): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value ?? undefined
}

function formatDateISO(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function validDate(value: QueryValue, fallback: string): string {
  const candidate = firstQueryValue(value)
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback
}

export function normalizePortalAnalyticsPrintFilters(
  query: Record<string, QueryValue>,
  now = new Date()
): PortalAnalyticsPrintFilters {
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)

  const platformValue = firstQueryValue(query.platform) || ''
  const platforms = Array.from(new Set(
    platformValue.split(',').map(value => value.trim()).filter(Boolean)
  ))
  const metricValue = firstQueryValue(query.metric)

  return {
    startDate: validDate(query.startDate, formatDateISO(thirtyDaysAgo)),
    endDate: validDate(query.endDate, formatDateISO(now)),
    platforms,
    runningOnly: ['1', 'true'].includes((firstQueryValue(query.runningOnly) || '').toLowerCase()),
    metric: metricValue && ALLOWED_METRICS.has(metricValue as PortalAnalyticsPrintMetric)
      ? metricValue as PortalAnalyticsPrintMetric
      : 'spend'
  }
}

export function buildPortalAnalyticsPrintUrl(filters: PortalAnalyticsPrintFilters): string {
  const params = new URLSearchParams({
    startDate: filters.startDate,
    endDate: filters.endDate
  })
  if (filters.platforms.length) params.set('platform', filters.platforms.join(','))
  if (filters.runningOnly) params.set('runningOnly', 'true')
  params.set('metric', filters.metric)
  return `/portal/analytics/print?${params.toString()}`
}
