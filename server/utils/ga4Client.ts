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
  date: string          // YYYY-MM-DD
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
    propertySummaries?: Array<{ property?: string; displayName?: string }>
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
export async function getGoogleUserInfo(accessToken: string): Promise<{ sub: string; email: string }> {
  const info = await ofetch<{ sub: string; email?: string }>(
    'https://openidconnect.googleapis.com/v1/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  return { sub: info.sub, email: info.email || info.sub }
}

export async function listGa4Properties(
  accessToken: string
): Promise<Array<{ accountName: string; propertyId: string; propertyDisplayName: string }>> {
  const resp = await ofetch<AccountSummariesResponse>(
    `${GA4_ADMIN_BASE}/accountSummaries?pageSize=200`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const out: Array<{ accountName: string; propertyId: string; propertyDisplayName: string }> = []
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
  opts: { startDate: string; endDate: string }
): Promise<Ga4ReportRow[]> {
  const resp = await ofetch<Ga4RunReportResponse>(
    `${GA4_DATA_BASE}/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: GA4_METRICS.map((name) => ({ name })),
        dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
        limit: 100000
      }
    }
  )
  return parseGa4Report(resp)
}
