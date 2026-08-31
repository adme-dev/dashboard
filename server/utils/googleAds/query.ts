import {
  googleAdsRequest,
  type GoogleAdsAuth,
  type GoogleAdsRequestOptions
} from '~~/server/utils/googleAds/api'

export interface ExecuteGoogleAdsQueryInput {
  customerId: string
  query: string
  auth: GoogleAdsAuth
  maxRows?: number
  retries?: number
}

export interface GoogleAdsQueryResult<T> {
  rows: T[]
  more: number
  requestId?: string
}

export interface GoogleAdsQueryDeps {
  request: (
    options: GoogleAdsRequestOptions<Record<string, unknown>>
  ) => Promise<{ data: unknown, requestId?: string }>
}

function cleanCustomerId(value: string): string {
  const cleaned = value.replace(/-/g, '')
  if (!/^\d{1,20}$/.test(cleaned)) {
    throw new Error('Invalid Google Ads customer ID')
  }
  return cleaned
}

function flattenStreamRows<T>(data: unknown): T[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid Google Ads searchStream response')
  }

  const rows: T[] = []
  for (const batch of data) {
    if (typeof batch !== 'object' || batch === null) {
      throw new Error('Invalid Google Ads searchStream response')
    }
    const results = (batch as { results?: unknown }).results
    if (results === undefined) continue
    if (!Array.isArray(results)) {
      throw new Error('Invalid Google Ads searchStream response')
    }
    rows.push(...results as T[])
  }
  return rows
}

function boundProviderQuery(query: string, maxRows: number): string {
  const providerLimit = maxRows + 1
  const withoutSemicolon = query.replace(/;\s*$/, '')
  const limitPattern = /\bLIMIT\s+(\d+)\s*$/i
  const match = withoutSemicolon.match(limitPattern)
  if (!match) return `${withoutSemicolon}\nLIMIT ${providerLimit}`

  const existingLimit = Number(match[1])
  if (Number.isSafeInteger(existingLimit) && existingLimit <= providerLimit) {
    return withoutSemicolon
  }
  return withoutSemicolon.replace(limitPattern, `LIMIT ${providerLimit}`)
}

const defaultDeps: GoogleAdsQueryDeps = {
  request: options => googleAdsRequest(options)
}

export async function executeGoogleAdsQuery<T = Record<string, unknown>>(
  input: ExecuteGoogleAdsQueryInput,
  deps: Partial<GoogleAdsQueryDeps> = {}
): Promise<GoogleAdsQueryResult<T>> {
  const customerId = cleanCustomerId(input.customerId)
  const query = input.query.trim()
  if (!query) throw new Error('Google Ads query is required')
  if (query.length > 100_000) throw new Error('Google Ads query is too large')

  const requestedRows = Number.isFinite(input.maxRows)
    ? Math.floor(input.maxRows as number)
    : 1_000
  const maxRows = Math.min(10_000, Math.max(1, requestedRows))
  const boundedQuery = boundProviderQuery(query, maxRows)
  const request = deps.request ?? defaultDeps.request
  const response = await request({
    path: `/customers/${customerId}/googleAds:searchStream`,
    method: 'POST',
    auth: input.auth,
    body: { query: boundedQuery },
    write: false,
    ...(input.retries === undefined ? {} : { retries: input.retries })
  })
  const rows = flattenStreamRows<T>(response.data)

  return {
    rows: rows.slice(0, maxRows),
    more: Math.max(0, rows.length - maxRows),
    requestId: response.requestId
  }
}
