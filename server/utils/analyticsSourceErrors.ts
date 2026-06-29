const OPTIONAL_ANALYTICS_RELATIONS = [
  'daily_spend',
  'media_spend',
  'ga4_daily_channel',
  'leads',
  'agency_clients',
  'social_connections',
  'ad_account_client_map',
]

export function isOptionalAnalyticsSourceError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null | undefined
  const message = String(err?.message || '').toLowerCase()
  if (err?.code === '42P01' || err?.code === '42703') return true
  if (!message.includes('does not exist')) return false
  return OPTIONAL_ANALYTICS_RELATIONS.some(relation => message.includes(relation))
}
