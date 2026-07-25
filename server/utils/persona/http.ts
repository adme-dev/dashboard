import type { PersonaMetricsFilters } from '~~/server/utils/persona/metrics'

function text(value: unknown, max = 512): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized.slice(0, max) : undefined
}

function date(value: unknown): string | undefined {
  const candidate = text(value, 10)
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : undefined
}

export function parsePersonaMetricFilters(query: Record<string, unknown>): PersonaMetricsFilters {
  return {
    startDate: date(query.startDate),
    endDate: date(query.endDate),
    platform: text(query.platform, 40),
    campaignId: text(query.campaignId),
    adGroupId: text(query.adGroupId),
    adSetId: text(query.adSetId),
    adId: text(query.adId),
    creativeId: text(query.creativeId),
    landingPage: text(query.landingPage, 2048),
    device: text(query.device, 40)
  }
}
