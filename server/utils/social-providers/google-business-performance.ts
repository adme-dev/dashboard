import type { H3Event } from 'h3'
import { execute, queryRows } from '~~/server/utils/db'
import { resolveSocialAccountAccessToken } from '~~/server/utils/socialInbox/tokenRefresh'

const PERFORMANCE_API_ORIGIN = 'https://businessprofileperformance.googleapis.com'
const LOCATION_ID = /^[0-9]{1,40}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const REQUEST_TIMEOUT_MS = 15_000
const TRAILING_DAYS = 90

export const GOOGLE_BUSINESS_DAILY_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_CONVERSATIONS',
  'BUSINESS_DIRECTION_REQUESTS',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_BOOKINGS',
  'BUSINESS_FOOD_ORDERS',
  'BUSINESS_FOOD_MENU_CLICKS'
] as const

export type GoogleBusinessDailyMetric = typeof GOOGLE_BUSINESS_DAILY_METRICS[number]

const DOCUMENTED_METRICS = new Set<string>(GOOGLE_BUSINESS_DAILY_METRICS)

interface ProviderDate {
  year?: number
  month?: number
  day?: number
}

interface ProviderDatedValue {
  date?: ProviderDate
  value?: string | number
}

interface ProviderDailyMetricTimeSeries {
  dailyMetric?: string
  timeSeries?: { datedValues?: ProviderDatedValue[] }
}

export interface GoogleBusinessPerformanceResponse {
  multiDailyMetricTimeSeries?: Array<{
    dailyMetricTimeSeries?: ProviderDailyMetricTimeSeries[]
  }>
}

export interface GoogleBusinessMetricRow {
  metricName: GoogleBusinessDailyMetric
  metricDate: string
  value: number
}

export class GoogleBusinessPerformanceError extends Error {
  reasonCode: string
  statusCode: number | null

  constructor(message: string, reasonCode: string, statusCode: number | null = null) {
    super(message)
    this.name = 'GoogleBusinessPerformanceError'
    this.reasonCode = reasonCode
    this.statusCode = statusCode
  }
}

function padded(value: number): string {
  return String(value).padStart(2, '0')
}

function providerDate(value: ProviderDate | undefined): string | null {
  if (!value || !Number.isInteger(value.year) || !Number.isInteger(value.month) || !Number.isInteger(value.day)) return null
  const result = `${value.year}-${padded(value.month!)}-${padded(value.day!)}`
  if (!ISO_DATE.test(result)) return null
  const parsed = new Date(`${result}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result ? null : result
}

function metricValue(value: string | number | undefined): number | null {
  // Google documents that DatedValue.value is absent when the value is zero.
  if (value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export function normalizeGoogleBusinessDailyMetrics(
  response: GoogleBusinessPerformanceResponse
): GoogleBusinessMetricRow[] {
  const rows = new Map<string, GoogleBusinessMetricRow>()
  for (const group of response.multiDailyMetricTimeSeries ?? []) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      if (!series.dailyMetric || !DOCUMENTED_METRICS.has(series.dailyMetric)) continue
      for (const datedValue of series.timeSeries?.datedValues ?? []) {
        const metricDate = providerDate(datedValue.date)
        const value = metricValue(datedValue.value)
        if (!metricDate || value === null) continue
        rows.set(`${series.dailyMetric}:${metricDate}`, {
          metricName: series.dailyMetric as GoogleBusinessDailyMetric,
          metricDate,
          value
        })
      }
    }
  }
  return [...rows.values()].sort((a, b) => (
    a.metricDate.localeCompare(b.metricDate) || a.metricName.localeCompare(b.metricName)
  ))
}

function parseDateParts(value: string): { year: string, month: string, day: string } {
  if (!ISO_DATE.test(value)) throw new GoogleBusinessPerformanceError('Google Business performance date is invalid', 'invalid_date')
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new GoogleBusinessPerformanceError('Google Business performance date is invalid', 'invalid_date')
  }
  const [year, month, day] = value.split('-') as [string, string, string]
  return { year, month: String(Number(month)), day: String(Number(day)) }
}

export async function fetchGoogleBusinessDailyMetrics(input: {
  locationId: string
  accessToken: string
  startDate: string
  endDate: string
  fetchImpl?: typeof fetch
  now?: () => Date
}): Promise<{ rows: GoogleBusinessMetricRow[], fetchedAt: string }> {
  if (!LOCATION_ID.test(input.locationId)) {
    throw new GoogleBusinessPerformanceError('Google Business location ID is invalid', 'invalid_location')
  }
  const start = parseDateParts(input.startDate)
  const end = parseDateParts(input.endDate)
  if (input.endDate < input.startDate) {
    throw new GoogleBusinessPerformanceError('Google Business performance range is invalid', 'invalid_date_range')
  }

  const url = new URL(
    `/v1/locations/${input.locationId}:fetchMultiDailyMetricsTimeSeries`,
    PERFORMANCE_API_ORIGIN
  )
  for (const metric of GOOGLE_BUSINESS_DAILY_METRICS) url.searchParams.append('dailyMetrics', metric)
  for (const [prefix, date] of [['start_date', start], ['end_date', end]] as const) {
    url.searchParams.set(`dailyRange.${prefix}.year`, date.year)
    url.searchParams.set(`dailyRange.${prefix}.month`, date.month)
    url.searchParams.set(`dailyRange.${prefix}.day`, date.day)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await (input.fetchImpl ?? fetch)(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${input.accessToken}` },
      signal: controller.signal
    })
  } catch {
    const timeoutReason = controller.signal.aborted ? 'provider_timeout' : 'provider_unreachable'
    throw new GoogleBusinessPerformanceError(
      controller.signal.aborted
        ? 'Google Business Performance API request timed out'
        : 'Google Business Performance API request failed',
      timeoutReason
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new GoogleBusinessPerformanceError(
      `Google Business Performance API request failed (${response.status})`,
      response.status === 401
        ? 'token_invalid'
        : response.status === 403
          ? 'provider_access_denied'
          : response.status === 429
            ? 'provider_quota_exceeded'
            : 'provider_error',
      response.status
    )
  }

  let body: GoogleBusinessPerformanceResponse
  try {
    body = await response.json() as GoogleBusinessPerformanceResponse
  } catch {
    throw new GoogleBusinessPerformanceError('Google Business Performance API response was invalid', 'invalid_provider_response')
  }
  return {
    rows: normalizeGoogleBusinessDailyMetrics(body),
    fetchedAt: (input.now ?? (() => new Date()))().toISOString()
  }
}

interface GoogleBusinessPerformanceAccount {
  id: string
  client_id: string
  platform_account_id: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  metadata: Record<string, unknown> | string | null
}

function metadataObject(value: GoogleBusinessPerformanceAccount['metadata']): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function googleBusinessLocationId(account: Pick<GoogleBusinessPerformanceAccount, 'platform_account_id' | 'metadata'>): string | null {
  const metadata = metadataObject(account.metadata)
  const fallback = account.platform_account_id.split(':')[1]
  const value = String(metadata.googleBusinessLocationId || fallback || '')
  return LOCATION_ID.test(value) ? value : null
}

function dateWindow(now: Date): { startDate: string, endDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (TRAILING_DAYS - 1))
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  }
}

function reasonCode(error: unknown): string {
  return error instanceof GoogleBusinessPerformanceError
    ? error.reasonCode
    : 'sync_failed'
}

export interface GoogleBusinessPerformanceSyncResult {
  eligibleAccounts: number
  syncedAccounts: number
  failedAccounts: number
  rowsUpserted: number
}

export async function syncGoogleBusinessPerformance(input: {
  event?: H3Event
  clientId?: string
  now?: () => Date
  queryAccounts?: (clientId?: string) => Promise<GoogleBusinessPerformanceAccount[]>
  executeSql?: typeof execute
  resolveAccessToken?: typeof resolveSocialAccountAccessToken
  fetchMetrics?: typeof fetchGoogleBusinessDailyMetrics
} = {}): Promise<GoogleBusinessPerformanceSyncResult> {
  const now = input.now ?? (() => new Date())
  const window = dateWindow(now())
  const executeSql = input.executeSql ?? execute
  const accounts = await (input.queryAccounts ?? ((clientId?: string) => queryRows<GoogleBusinessPerformanceAccount>(
    `SELECT id, client_id, platform_account_id, access_token, refresh_token,
            token_expires_at::text, metadata
       FROM social_accounts
      WHERE platform = 'google-business'
        AND is_active = TRUE
        AND access_token IS NOT NULL
        AND ($1::uuid IS NULL OR client_id = $1::uuid)
      ORDER BY client_id, id`,
    [clientId ?? null]
  )))(input.clientId)

  let syncedAccounts = 0
  let failedAccounts = 0
  let rowsUpserted = 0

  for (const account of accounts) {
    const locationId = googleBusinessLocationId(account)
    if (!locationId) {
      failedAccounts++
      await recordSyncRun(executeSql, account, window, 'failed', 'invalid_location', 0, null)
      continue
    }
    try {
      const accessToken = await (input.resolveAccessToken ?? resolveSocialAccountAccessToken)({
        event: input.event,
        db: { execute: executeSql },
        account: {
          id: account.id,
          platform: 'google-business',
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          token_expires_at: account.token_expires_at
        }
      })
      const result = await (input.fetchMetrics ?? fetchGoogleBusinessDailyMetrics)({
        locationId,
        accessToken,
        ...window
      })
      if (result.rows.length > 0) {
        await executeSql(
          `INSERT INTO search_authority_google_business_metrics
             (client_id, social_account_id, location_id, metric_name, metric_date,
              metric_value, provider_fetched_at, synced_at)
           SELECT $1::uuid, $2::uuid, $3, row.metric_name, row.metric_date::date,
                  row.metric_value, $5::timestamptz, NOW()
             FROM jsonb_to_recordset($4::jsonb)
               AS row(metric_name text, metric_date text, metric_value bigint)
           ON CONFLICT (social_account_id, metric_name, metric_date) DO UPDATE SET
             metric_value = EXCLUDED.metric_value,
             provider_fetched_at = EXCLUDED.provider_fetched_at,
             synced_at = NOW()`,
          [
            account.client_id,
            account.id,
            locationId,
            JSON.stringify(result.rows.map(row => ({
              metric_name: row.metricName,
              metric_date: row.metricDate,
              metric_value: row.value
            }))),
            result.fetchedAt
          ]
        )
      }
      rowsUpserted += result.rows.length
      syncedAccounts++
      await recordSyncRun(executeSql, account, window, 'succeeded', null, result.rows.length, result.fetchedAt)
    } catch (error: unknown) {
      failedAccounts++
      const code = reasonCode(error)
      console.warn('google-business-performance.sync_failed', {
        clientId: account.client_id,
        accountId: account.id,
        reasonCode: code
      })
      await recordSyncRun(executeSql, account, window, 'failed', code, 0, null)
    }
  }

  return {
    eligibleAccounts: accounts.length,
    syncedAccounts,
    failedAccounts,
    rowsUpserted
  }
}

async function recordSyncRun(
  executeSql: typeof execute,
  account: GoogleBusinessPerformanceAccount,
  window: { startDate: string, endDate: string },
  status: 'succeeded' | 'partial' | 'failed',
  reason: string | null,
  count: number,
  fetchedAt: string | null
): Promise<void> {
  await executeSql(
    `INSERT INTO search_authority_google_business_sync_runs
       (client_id, social_account_id, requested_start_date, requested_end_date,
        status, reason_code, rows_upserted, provider_fetched_at)
     VALUES ($1::uuid, $2::uuid, $3::date, $4::date, $5, $6, $7, $8::timestamptz)`,
    [account.client_id, account.id, window.startDate, window.endDate, status, reason, count, fetchedAt]
  )
}

export function isGoogleBusinessPerformanceEnabled(event?: H3Event): boolean {
  const cloudflareValue = (event?.context as {
    cloudflare?: { env?: Record<string, unknown> }
  } | undefined)?.cloudflare?.env?.GOOGLE_BUSINESS_PERFORMANCE_ENABLED
  return cloudflareValue === 'true'
    || process.env.GOOGLE_BUSINESS_PERFORMANCE_ENABLED === 'true'
}
