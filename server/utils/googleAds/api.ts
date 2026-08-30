import { ofetch } from 'ofetch'
import { normalizeGoogleAdsError } from '~~/server/utils/googleAds/errors'
import { googleAdsApiUrl } from '~~/server/utils/googleAds/version'

export interface GoogleAdsAuth {
  accessToken: string
  developerToken: string
  loginCustomerId?: string
}

export interface GoogleAdsRequestOptions<TBody extends Record<string, unknown> = Record<string, unknown>> {
  path: string
  method: 'GET' | 'POST'
  auth: GoogleAdsAuth
  body?: TBody
  retries?: number
  write?: boolean
}

export interface GoogleAdsTransportOptions {
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: Record<string, unknown>
}

export interface GoogleAdsRequestDeps {
  fetch: (url: string, options: GoogleAdsTransportOptions) => Promise<unknown>
  sleep: (milliseconds: number) => Promise<void>
}

function cleanManagerCustomerId(value: string): string {
  const cleaned = value.replace(/-/g, '')
  if (!/^\d{10}$/.test(cleaned)) {
    throw new Error('Invalid Google Ads login customer ID')
  }
  return cleaned
}

export function buildGoogleAdsHeaders(auth: GoogleAdsAuth): Record<string, string> {
  if (!auth.accessToken || !auth.developerToken) {
    throw new Error('Google Ads credentials are required')
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    'developer-token': auth.developerToken,
    'Content-Type': 'application/json',
  }
  if (auth.loginCustomerId) {
    headers['login-customer-id'] = cleanManagerCustomerId(auth.loginCustomerId)
  }
  return headers
}

function requestIdFrom(headers: unknown): string | undefined {
  if (headers instanceof Headers) return headers.get('request-id') ?? undefined
  if (typeof headers !== 'object' || headers === null) return undefined
  const record = headers as Record<string, unknown>
  const value = record['request-id'] ?? record.requestId
  return typeof value === 'string' && value ? value : undefined
}

function unpackResponse<T>(response: unknown): { data: T, requestId?: string } {
  if (typeof response === 'object' && response !== null && '_data' in response) {
    const raw = response as { _data?: T, headers?: unknown }
    return { data: raw._data as T, requestId: requestIdFrom(raw.headers) }
  }
  return { data: response as T, requestId: undefined }
}

const defaultDeps: GoogleAdsRequestDeps = {
  fetch: (url, options) => ofetch.raw(url, options),
  sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
}

export async function googleAdsRequest<TData, TBody extends Record<string, unknown> = Record<string, unknown>>(
  options: GoogleAdsRequestOptions<TBody>,
  deps: Partial<GoogleAdsRequestDeps> = {},
): Promise<{ data: TData, requestId?: string }> {
  const url = googleAdsApiUrl(options.path)
  const headers = buildGoogleAdsHeaders(options.auth)
  const fetch = deps.fetch ?? defaultDeps.fetch
  const sleep = deps.sleep ?? defaultDeps.sleep
  const retries = Math.min(3, Math.max(0, Math.floor(options.retries ?? 2)))

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        ...(options.body === undefined ? {} : { body: options.body }),
      })
      return unpackResponse<TData>(response)
    } catch (error) {
      const normalized = normalizeGoogleAdsError(error)
      const canRetry = !options.write && normalized.retryable && attempt < retries
      if (!canRetry) throw normalized
      await sleep(250 * (2 ** attempt))
    }
  }

  throw normalizeGoogleAdsError({ status: 503 })
}
