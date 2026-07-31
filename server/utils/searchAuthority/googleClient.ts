import { ofetch } from 'ofetch'

const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SEARCH_CONSOLE_API = 'https://www.googleapis.com/webmasters/v3'
const URL_INSPECTION_API
  = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
const REQUEST_TIMEOUT_MS = 20_000
const SEARCH_ANALYTICS_PAGE_SIZE = 25_000
const SEARCH_ANALYTICS_MAX_ROWS = 50_000

export const SEARCH_CONSOLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/webmasters.readonly'
] as const

interface RequestOptions {
  method?: 'GET' | 'POST'
  headers: { Authorization: string }
  body?: Record<string, unknown>
  timeout: number
}

type ProviderRequest = (
  url: string,
  options: RequestOptions
) => Promise<unknown>

interface GoogleClientDependencies {
  request?: ProviderRequest
}

export interface SearchConsoleProperty {
  propertyUri: string
  propertyType: 'domain' | 'url_prefix'
  permissionLevel: string
}

interface SearchAnalyticsProviderRow {
  keys?: string[]
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}

export interface SearchAnalyticsRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchAnalyticsRequest {
  startDate: string
  endDate: string
  dimensions: Array<'query' | 'page' | 'date' | 'country' | 'device' | 'searchAppearance'>
  searchType?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews'
  dataState?: 'final' | 'all' | 'hourly_all'
}

export interface SearchAnalyticsResult {
  rows: SearchAnalyticsRow[]
  responseAggregationType: string | null
  firstIncompleteDate: string | null
  truncated: boolean
}

function providerRequest(dependencies: GoogleClientDependencies): ProviderRequest {
  return dependencies.request
    ?? ((url, options) => ofetch(url, options))
}

function authorization(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` }
}

export function getSearchConsoleAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SEARCH_CONSOLE_SCOPES.join(' '),
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'false',
    prompt: 'consent'
  })
  return `${GOOGLE_OAUTH_URL}?${params.toString()}`
}

export async function listSearchConsoleProperties(
  accessToken: string,
  dependencies: GoogleClientDependencies = {}
): Promise<SearchConsoleProperty[]> {
  const response = await providerRequest(dependencies)(
    `${SEARCH_CONSOLE_API}/sites`,
    {
      method: 'GET',
      headers: authorization(accessToken),
      timeout: REQUEST_TIMEOUT_MS
    }
  ) as {
    siteEntry?: Array<{ siteUrl?: string, permissionLevel?: string }>
  }

  return (response.siteEntry ?? [])
    .filter(entry => Boolean(entry.siteUrl))
    .map(entry => ({
      propertyUri: entry.siteUrl!,
      propertyType: entry.siteUrl!.startsWith('sc-domain:')
        ? 'domain'
        : 'url_prefix',
      permissionLevel: entry.permissionLevel ?? 'siteUnverifiedUser'
    }))
}

export async function querySearchAnalytics(
  accessToken: string,
  propertyUri: string,
  input: SearchAnalyticsRequest,
  dependencies: GoogleClientDependencies = {}
): Promise<SearchAnalyticsResult> {
  const request = providerRequest(dependencies)
  const rows: SearchAnalyticsRow[] = []
  let startRow = 0
  let responseAggregationType: string | null = null
  let firstIncompleteDate: string | null = null
  let truncated = false

  while (rows.length < SEARCH_ANALYTICS_MAX_ROWS) {
    const response = await request(
      `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(propertyUri)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: authorization(accessToken),
        timeout: REQUEST_TIMEOUT_MS,
        body: {
          startDate: input.startDate,
          endDate: input.endDate,
          dimensions: input.dimensions,
          type: input.searchType ?? 'web',
          dataState: input.dataState ?? 'all',
          rowLimit: SEARCH_ANALYTICS_PAGE_SIZE,
          startRow
        }
      }
    ) as {
      rows?: SearchAnalyticsProviderRow[]
      responseAggregationType?: string
      metadata?: {
        first_incomplete_date?: string
        firstIncompleteDate?: string
      }
    }

    const page = response.rows ?? []
    for (const row of page) {
      if (rows.length === SEARCH_ANALYTICS_MAX_ROWS) {
        truncated = true
        break
      }
      rows.push({
        keys: row.keys ?? [],
        clicks: Number(row.clicks ?? 0),
        impressions: Number(row.impressions ?? 0),
        ctr: Number(row.ctr ?? 0),
        position: Number(row.position ?? 0)
      })
    }

    responseAggregationType = response.responseAggregationType
      ?? responseAggregationType
    firstIncompleteDate = response.metadata?.first_incomplete_date
      ?? response.metadata?.firstIncompleteDate
      ?? firstIncompleteDate

    if (page.length < SEARCH_ANALYTICS_PAGE_SIZE) break
    if (rows.length >= SEARCH_ANALYTICS_MAX_ROWS) {
      truncated = true
      break
    }
    startRow += SEARCH_ANALYTICS_PAGE_SIZE
  }

  return {
    rows,
    responseAggregationType,
    firstIncompleteDate,
    truncated
  }
}

export interface SearchConsoleInspection {
  inspectionKind: 'indexed_version'
  verdict: string | null
  coverageState: string | null
  robotsTxtState: string | null
  indexingState: string | null
  pageFetchState: string | null
  crawledAs: string | null
  lastCrawlTime: string | null
  googleCanonical: string | null
  userCanonical: string | null
  sitemapUrls: string[]
  referringUrls: string[]
  inspectionResultLink: string | null
  providerResult: Record<string, unknown>
}

export async function inspectSearchConsoleUrl(
  accessToken: string,
  propertyUri: string,
  inspectionUrl: string,
  dependencies: GoogleClientDependencies = {}
): Promise<SearchConsoleInspection> {
  const response = await providerRequest(dependencies)(
    URL_INSPECTION_API,
    {
      method: 'POST',
      headers: authorization(accessToken),
      timeout: REQUEST_TIMEOUT_MS,
      body: {
        inspectionUrl,
        siteUrl: propertyUri,
        languageCode: 'en-AU'
      }
    }
  ) as {
    inspectionResult?: {
      inspectionResultLink?: string
      indexStatusResult?: Record<string, unknown>
    }
  }
  const inspection = response.inspectionResult ?? {}
  const status = inspection.indexStatusResult ?? {}
  const text = (key: string): string | null =>
    typeof status[key] === 'string' ? status[key] as string : null
  const strings = (key: string): string[] =>
    Array.isArray(status[key])
      ? (status[key] as unknown[]).filter((value): value is string => typeof value === 'string')
      : []

  return {
    inspectionKind: 'indexed_version',
    verdict: text('verdict'),
    coverageState: text('coverageState'),
    robotsTxtState: text('robotsTxtState'),
    indexingState: text('indexingState'),
    pageFetchState: text('pageFetchState'),
    crawledAs: text('crawledAs'),
    lastCrawlTime: text('lastCrawlTime'),
    googleCanonical: text('googleCanonical'),
    userCanonical: text('userCanonical'),
    sitemapUrls: strings('sitemap'),
    referringUrls: strings('referringUrls'),
    inspectionResultLink: inspection.inspectionResultLink ?? null,
    providerResult: status
  }
}
