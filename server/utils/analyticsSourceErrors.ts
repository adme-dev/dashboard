const OPTIONAL_ANALYTICS_RELATIONS = [
  'daily_spend',
  'media_spend',
  'ga4_daily_channel',
  'leads',
  'agency_clients',
  'social_connections',
  'ad_account_client_map',
]

const OPTIONAL_ANALYTICS_TERMS = [
  ...OPTIONAL_ANALYTICS_RELATIONS,
  'campaign_id',
  'campaign_name',
  'campaign_name_pattern',
  'channel_group',
  'client_id',
  'connection_id',
  'conversions',
  'deleted_at',
  'engagement_rate',
  'key_events',
  'media_spend_id',
  'metric_date',
  'period',
  'revenue',
  'sessions',
  'source',
  'spend',
  'spend_date',
  'submitted_at',
  'xero_client_name',
]

const OPTIONAL_ANALYTICS_SHAPE_ERROR_CODES = new Set([
  '42702', // ambiguous_column
  '42804', // datatype_mismatch
  '42883', // undefined_function / operator mismatch
])

export function isOptionalAnalyticsSourceError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null | undefined
  const code = err?.code
  const message = String(err?.message || '').toLowerCase()
  if (code === '42P01' || code === '42703') return true

  const mentionsOptionalAnalyticsSource = OPTIONAL_ANALYTICS_TERMS.some(term => message.includes(term))
  if (!mentionsOptionalAnalyticsSource) return false
  if (message.includes('does not exist')) return true
  return code ? OPTIONAL_ANALYTICS_SHAPE_ERROR_CODES.has(code) : false
}
