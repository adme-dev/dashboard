// server/utils/ga4Client.ts
/**
 * GA4 Data API + Admin API client.
 * - getGa4AuthUrl: OAuth consent URL (analytics.readonly + openid email).
 * - listGa4Properties: Admin API accountSummaries for the property picker.
 * - ga4RunReport / parseGa4Report: daily channel metrics via Data API runReport.
 * Token exchange/refresh reuse exchangeGoogleCode/refreshGoogleToken from
 * googleAdsClient.ts — GA4 uses the same Google OAuth client.
 */
import { ofetch } from 'ofetch'

const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GA4_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta'
const GA4_ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta'

/** openid+email so the callback can key the connection by stable Google account id. */
export const GA4_SCOPE = 'openid email https://www.googleapis.com/auth/analytics.readonly'

/**
 * Metric request order. The parser maps metricValues by index, so this array is
 * the contract between request and parse — do not reorder without updating both.
 * Note: GA4 API metric name is 'averageSessionDuration'; we surface it as
 * avgSessionDuration on the parsed row.
 */
export const GA4_METRICS = [
  'sessions',
  'totalUsers',
  'newUsers',
  'engagedSessions',
  'engagementRate',
  'averageSessionDuration',
  'keyEvents',
  'purchaseRevenue'
] as const

export interface Ga4ReportRow {
  date: string // YYYY-MM-DD
  channelGroup: string
  sessions: number
  totalUsers: number
  newUsers: number
  engagedSessions: number
  engagementRate: number
  avgSessionDuration: number
  keyEvents: number
  purchaseRevenue: number
}

interface Ga4RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>
    metricValues?: Array<{ value?: string }>
  }>
}

interface AccountSummariesResponse {
  accountSummaries?: Array<{
    account?: string
    displayName?: string
    propertySummaries?: Array<{ property?: string, displayName?: string }>
  }>
}

export function getGa4AuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: GA4_SCOPE,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent'
  })
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`
}

/** Fetch the Google account identity (sub + email) for keying the connection row. */
export async function getGoogleUserInfo(accessToken: string): Promise<{ sub: string, email: string }> {
  const info = await ofetch<{ sub: string, email?: string }>(
    'https://openidconnect.googleapis.com/v1/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  return { sub: info.sub, email: info.email || info.sub }
}

export async function listGa4Properties(
  accessToken: string
): Promise<Array<{ accountName: string, propertyId: string, propertyDisplayName: string }>> {
  const resp = await ofetch<AccountSummariesResponse>(
    `${GA4_ADMIN_BASE}/accountSummaries?pageSize=200`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const out: Array<{ accountName: string, propertyId: string, propertyDisplayName: string }> = []
  for (const acc of resp.accountSummaries || []) {
    for (const prop of acc.propertySummaries || []) {
      out.push({
        accountName: acc.displayName || acc.account || '',
        propertyId: (prop.property || '').replace('properties/', ''),
        propertyDisplayName: prop.displayName || ''
      })
    }
  }
  return out
}

export function parseGa4Report(resp: Ga4RunReportResponse): Ga4ReportRow[] {
  const rows = resp.rows || []
  return rows.map((r) => {
    const dims = r.dimensionValues || []
    const mets = r.metricValues || []
    const rawDate = dims[0]?.value || ''
    const date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate
    const m = (i: number) => Number(mets[i]?.value || 0)
    return {
      date,
      channelGroup: dims[1]?.value || '(not set)',
      sessions: m(0),
      totalUsers: m(1),
      newUsers: m(2),
      engagedSessions: m(3),
      engagementRate: m(4),
      avgSessionDuration: m(5),
      keyEvents: m(6),
      purchaseRevenue: m(7)
    }
  })
}

export async function ga4RunReport(
  propertyId: string,
  accessToken: string,
  opts: { startDate: string, endDate: string }
): Promise<Ga4ReportRow[]> {
  const resp = await ofetch<Ga4RunReportResponse>(
    `${GA4_DATA_BASE}/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      // Fail fast on a stuck property so it can't hang the whole sync (ofetch
      // has no default timeout — a hung request would otherwise block forever).
      timeout: 20_000,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: GA4_METRICS.map(name => ({ name })),
        dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
        limit: 100000
      }
    }
  )
  return parseGa4Report(resp)
}

// ---------------------------------------------------------------------------
// Richer ingestion (Task 3.1): extra session dimensions, event-level
// conversions, batchRunReports, quota self-throttle, and retry/backoff.
// ---------------------------------------------------------------------------

/** Extra session dimensions we ingest, mapped to their GA4 API dimension name. */
export const GA4_DIMENSIONS = {
  sourceMedium: 'sessionSourceMedium',
  campaign: 'sessionCampaignName',
  device: 'deviceCategory',
  landingPage: 'landingPagePlusQueryString',
  country: 'country'
} as const
export type Ga4DimensionType = keyof typeof GA4_DIMENSIONS

export interface Ga4ReportRequest {
  dimensions: Array<{ name: string }>
  metrics: Array<{ name: string }>
  dateRanges: Array<{ startDate: string, endDate: string }>
  limit?: number
  offset?: number
  keepEmptyRows?: boolean
  returnPropertyQuota?: boolean
}

/** A runReport request for `date x <dimension>` with the standard session metrics. */
export function buildGa4DimensionRequest(
  dimType: Ga4DimensionType,
  startDate: string,
  endDate: string,
  offset = 0
): Ga4ReportRequest {
  return {
    dimensions: [{ name: 'date' }, { name: GA4_DIMENSIONS[dimType] }],
    metrics: GA4_METRICS.map(name => ({ name })),
    dateRanges: [{ startDate, endDate }],
    limit: 100000,
    offset,
    keepEmptyRows: false,
    returnPropertyQuota: true
  }
}

/** A runReport request for `date x eventName` with event count + value. */
export function buildGa4EventRequest(startDate: string, endDate: string, offset = 0): Ga4ReportRequest {
  return {
    dimensions: [{ name: 'date' }, { name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
    dateRanges: [{ startDate, endDate }],
    limit: 100000,
    offset,
    returnPropertyQuota: true
  }
}

export interface Ga4DimensionRow {
  date: string
  dimensionValue: string
  sessions: number
  totalUsers: number
  newUsers: number
  engagedSessions: number
  engagementRate: number
  avgSessionDuration: number
  keyEvents: number
  purchaseRevenue: number
}

/** Parse a `date x <dimension>` report (metrics in GA4_METRICS order). */
export function parseGa4DimensionReport(resp: Ga4RunReportResponse): Ga4DimensionRow[] {
  return (resp.rows || []).map((r) => {
    const dims = r.dimensionValues || []
    const mets = r.metricValues || []
    const rawDate = dims[0]?.value || ''
    const date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate
    const m = (i: number) => Number(mets[i]?.value || 0)
    return {
      date,
      dimensionValue: dims[1]?.value || '(not set)',
      sessions: m(0),
      totalUsers: m(1),
      newUsers: m(2),
      engagedSessions: m(3),
      engagementRate: m(4),
      avgSessionDuration: m(5),
      keyEvents: m(6),
      purchaseRevenue: m(7)
    }
  })
}

export interface Ga4EventRow {
  date: string
  eventName: string
  eventCount: number
  eventValue: number
}

/** Parse a `date x eventName` report. */
export function parseGa4EventReport(resp: Ga4RunReportResponse): Ga4EventRow[] {
  return (resp.rows || []).map((r) => {
    const dims = r.dimensionValues || []
    const mets = r.metricValues || []
    const rawDate = dims[0]?.value || ''
    const date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate
    return {
      date,
      eventName: dims[1]?.value || '(not set)',
      eventCount: Number(mets[0]?.value || 0),
      eventValue: Number(mets[1]?.value || 0)
    }
  })
}

export interface Ga4QuotaBucket {
  consumed: number
  remaining: number
}
export interface Ga4PropertyQuota {
  tokensPerDay?: Ga4QuotaBucket
  tokensPerHour?: Ga4QuotaBucket
  concurrentRequests?: Ga4QuotaBucket
}

/**
 * True when any hourly/daily token bucket has dropped below the safety fraction
 * of its total — caller should defer further requests this run.
 */
export function quotaShouldThrottle(quota?: Ga4PropertyQuota, minRemainingFraction = 0.1): boolean {
  const buckets = [quota?.tokensPerHour, quota?.tokensPerDay].filter(Boolean) as Ga4QuotaBucket[]
  for (const b of buckets) {
    const total = b.consumed + b.remaining
    if (total > 0 && b.remaining / total < minRemainingFraction) return true
  }
  return false
}

/** Exponential backoff with 50–100% jitter, capped. `rand` is injectable for tests. */
export function ga4BackoffMs(attempt: number, opts: { baseMs?: number, capMs?: number, rand?: () => number } = {}): number {
  const baseMs = opts.baseMs ?? 500
  const capMs = opts.capMs ?? 30_000
  const rand = opts.rand ?? Math.random
  const exp = Math.min(capMs, baseMs * 2 ** attempt)
  return Math.round(exp * (0.5 + rand() * 0.5))
}

function ga4ErrorStatus(err: unknown): number | null {
  const e = err as { response?: { status?: number }, status?: number } | null
  return e?.response?.status ?? e?.status ?? null
}

/** Retryable: 429 (rate limit) and 5xx (transient server). */
export function isRetryableGa4Error(err: unknown): boolean {
  const s = ga4ErrorStatus(err)
  return s === 429 || (s != null && s >= 500)
}

/** Run `fn`, retrying retryable errors with exponential backoff + jitter. */
export async function withGa4Retry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number, sleep?: (ms: number) => Promise<void>, rand?: () => number } = {}
): Promise<T> {
  const retries = opts.retries ?? 4
  const sleep = opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (!isRetryableGa4Error(err) || attempt >= retries) throw err
      await sleep(ga4BackoffMs(attempt, { rand: opts.rand }))
      attempt++
    }
  }
}

export interface Ga4BatchResult {
  reports: Ga4RunReportResponse[]
  quota?: Ga4PropertyQuota
}

/**
 * batchRunReports with automatic chunking (GA4 caps at 5 reports/call), retry,
 * and property-quota capture. Returns reports in request order across chunks.
 */
export async function ga4BatchRunReports(
  propertyId: string,
  accessToken: string,
  requests: Ga4ReportRequest[],
  opts: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<Ga4BatchResult> {
  const reports: Ga4RunReportResponse[] = []
  let quota: Ga4PropertyQuota | undefined
  for (let i = 0; i < requests.length; i += 5) {
    const chunk = requests.slice(i, i + 5)
    const resp = await withGa4Retry(
      () => ofetch<{ reports?: Array<Ga4RunReportResponse & { propertyQuota?: Ga4PropertyQuota }>, propertyQuota?: Ga4PropertyQuota }>(
        `${GA4_DATA_BASE}/properties/${propertyId}:batchRunReports`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: { requests: chunk } }
      ),
      { sleep: opts.sleep }
    )
    if (resp.propertyQuota) quota = resp.propertyQuota
    for (const rep of resp.reports || []) {
      reports.push(rep)
      if (rep.propertyQuota) quota = rep.propertyQuota
    }
  }
  return { reports, quota }
}
