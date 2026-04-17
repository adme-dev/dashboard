import { createError, getRequestURL } from 'h3'
import { XeroClient } from 'xero-node'
import type { TokenSet } from 'xero-node'
import type { H3Event } from 'h3'

const DEFAULT_SCOPES = [
  'offline_access',
  'accounting.reports.read',
  'accounting.settings.read',
  'accounting.transactions.read',
  'accounting.transactions',
  'accounting.contacts.read'
]

const XERO_OIDC_DISCOVERY_URL = 'https://identity.xero.com/.well-known/openid-configuration'

// Cache the OIDC metadata in-memory to avoid re-fetching on every request
let cachedOidcMetadata: OidcMetadata | null = null
let cachedOidcMetadataExpiry = 0
const METADATA_CACHE_TTL = 60 * 60 * 1000 // 1 hour

interface OidcMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  [key: string]: any
}

export type XeroTokenSet = TokenSet & {
  expires_at: number
}

type CreateClientOptions = {
  tokenSet?: XeroTokenSet
  state?: string
  event?: H3Event
}

/**
 * Fetch Xero OIDC discovery metadata using fetch() (Cloudflare Workers compatible).
 * openid-client's Issuer.discover() uses Node.js http/https which fails on CF Workers.
 */
async function fetchOidcMetadata(): Promise<OidcMetadata> {
  const now = Date.now()
  if (cachedOidcMetadata && now < cachedOidcMetadataExpiry) {
    return cachedOidcMetadata
  }

  const response = await fetch(XERO_OIDC_DISCOVERY_URL)
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Xero OIDC discovery failed: ${response.status} ${response.statusText}`
    })
  }

  const metadata = await response.json() as OidcMetadata
  cachedOidcMetadata = metadata
  cachedOidcMetadataExpiry = now + METADATA_CACHE_TTL
  return metadata
}

function resolveRedirectUri(config: any, event?: H3Event): string {
  // Extract just the path portion — ignore any baked-in localhost or wrong host
  let redirectUri = config.xeroRedirectUri as string
  try {
    const parsed = new URL(redirectUri, 'https://placeholder')
    redirectUri = parsed.pathname // e.g. '/api/xero/callback'
  } catch {
    // Already a relative path
  }

  if (event) {
    const host = getRequestHeader(event, 'x-forwarded-host')
      || getRequestHeader(event, 'host')
      || 'agency-dashboard-6cm.pages.dev'
    const proto = getRequestHeader(event, 'x-forwarded-proto') || 'https'
    return `${proto}://${host}${redirectUri}`
  }

  return `${process.env.APP_URL || 'https://agency-dashboard-6cm.pages.dev'}${redirectUri}`
}

/**
 * Build the Xero OAuth consent URL using fetch-based OIDC discovery.
 * Replaces XeroClient.buildConsentUrl() which uses openid-client (Node.js HTTP).
 */
export async function buildXeroConsentUrl(options: { state: string; event?: H3Event }): Promise<string> {
  const config = useRuntimeConfig()
  const clientId = config.xeroClientId as string
  if (!clientId) {
    throw createError({ statusCode: 500, statusMessage: 'Xero OAuth not configured' })
  }

  const redirectUri = resolveRedirectUri(config, options.event)
  const metadata = await fetchOidcMetadata()

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: DEFAULT_SCOPES.join(' '),
    state: options.state,
  })

  return `${metadata.authorization_endpoint}?${params.toString()}`
}

/**
 * Exchange an authorization code for tokens using fetch (CF Workers compatible).
 * Replaces XeroClient.apiCallback() which uses openid-client (Node.js HTTP).
 */
export async function exchangeXeroCode(options: {
  code: string
  event: H3Event
}): Promise<XeroTokenSet> {
  const config = useRuntimeConfig()
  const clientId = config.xeroClientId as string
  const clientSecret = config.xeroClientSecret as string
  const redirectUri = resolveRedirectUri(config, options.event)
  const metadata = await fetchOidcMetadata()

  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: options.code,
      redirect_uri: redirectUri,
    }).toString(),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw createError({
      statusCode: 502,
      statusMessage: `Xero token exchange failed: ${response.status} — ${errorBody.substring(0, 200)}`
    })
  }

  const tokenData = await response.json() as any
  const expiresAt = Date.now() + (tokenData.expires_in || 1800) * 1000

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    id_token: tokenData.id_token,
    token_type: tokenData.token_type || 'Bearer',
    scope: tokenData.scope,
    expires_at: expiresAt,
  } as XeroTokenSet
}

/**
 * Refresh a Xero access token using fetch (CF Workers compatible).
 * Replaces XeroClient.refreshToken() which uses openid-client (Node.js HTTP).
 */
export async function refreshXeroToken(options: {
  refreshToken: string
  event?: H3Event
}): Promise<XeroTokenSet> {
  const config = useRuntimeConfig()
  const clientId = config.xeroClientId as string
  const clientSecret = config.xeroClientSecret as string
  const metadata = await fetchOidcMetadata()

  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: options.refreshToken,
    }).toString(),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw createError({
      statusCode: 401,
      statusMessage: `Xero token refresh failed: ${response.status} — ${errorBody.substring(0, 200)}`
    })
  }

  const tokenData = await response.json() as any
  const expiresAt = Date.now() + (tokenData.expires_in || 1800) * 1000

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || options.refreshToken,
    id_token: tokenData.id_token,
    token_type: tokenData.token_type || 'Bearer',
    scope: tokenData.scope,
    expires_at: expiresAt,
  } as XeroTokenSet
}

/**
 * Authenticated fetch against the Xero REST API.
 *
 * Replaces `client.accountingApi.*` usage. The xero-node SDK runs on axios
 * through nodejs_compat on Cloudflare Pages, where it hangs or stalls enough
 * to blow past the 30s wall-clock limit. Direct fetch() with AbortController
 * is predictable, abortable, and streams back in hundreds of ms.
 *
 * Xero returns PascalCase regardless of the Accept header (`Invoices`,
 * `Contact`, `LineItems`, …). This helper deep-converts keys to camelCase so
 * call sites read the same shape the old SDK surfaced (`invoices`, `contact`,
 * `lineItems`, …).
 *
 * `path` is anything after `https://api.xero.com/api.xro/2.0/`, e.g.
 *   `Reports/ProfitAndLoss?fromDate=2026-01-01&toDate=2026-01-31`
 */
export async function xeroFetch<T = any>(options: {
  accessToken: string
  tenantId: string
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  raw?: boolean
}): Promise<T> {
  const { accessToken, tenantId, path, method = 'GET', body, timeoutMs = 15_000, raw = false } = options
  const url = `https://api.xero.com/api.xro/2.0/${path.replace(/^\//, '')}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-Tenant-Id': tenantId,
        'Accept': 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw createError({
        statusCode: response.status === 401 ? 401 : response.status === 429 ? 429 : 502,
        statusMessage: `Xero ${method} ${path} failed: ${response.status} ${text.slice(0, 200)}`
      })
    }

    const json = await response.json()
    return (raw ? json : camelCaseKeysDeep(json)) as T
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw createError({ statusCode: 504, statusMessage: `Xero ${path} timed out after ${timeoutMs}ms` })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function lowerFirst(key: string): string {
  if (!key) return key
  // Preserve ALLCAPS keys (e.g. `ID`) — most Xero keys are PascalCase words.
  if (/^[A-Z]+$/.test(key)) return key.toLowerCase()
  return key.charAt(0).toLowerCase() + key.slice(1)
}

// Xero returns dates as Microsoft-JSON strings: "/Date(1490313600000+0000)/".
// Passing those to `new Date(...)` produces Invalid Date and any downstream
// .toISOString() throws "Invalid time value". Convert them to ISO up front
// so every endpoint can treat date fields as plain date strings.
const MS_DATE_RE = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/

function normalizeValue(value: any): any {
  if (typeof value === 'string') {
    const m = MS_DATE_RE.exec(value)
    if (m) {
      const ms = Number(m[1])
      if (Number.isFinite(ms)) return new Date(ms).toISOString()
    }
  }
  return value
}

function camelCaseKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(camelCaseKeysDeep)
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      out[lowerFirst(k)] = camelCaseKeysDeep(v)
    }
    return out
  }
  return normalizeValue(value)
}

/**
 * Fetch Xero tenant connections using fetch (CF Workers compatible).
 * Replaces XeroClient.updateTenants() which uses axios (Node.js HTTP).
 */
export async function fetchXeroTenants(accessToken: string): Promise<Array<{ tenantId: string; tenantName: string; tenantType: string }>> {
  const response = await fetch('https://api.xero.com/connections', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw createError({
      statusCode: response.status === 401 ? 401 : 502,
      statusMessage: `Xero tenants fetch failed: ${response.status}`
    })
  }

  return await response.json() as any[]
}

/**
 * Create a XeroClient instance for API calls (invoices, contacts, etc.).
 * Uses fetch-based OIDC init instead of openid-client's Node.js HTTP.
 * The accountingApi uses axios internally which works on CF Workers.
 */
export async function createXeroClient(options: CreateClientOptions = {}) {
  const config = useRuntimeConfig()
  const clientId = config.xeroClientId
  const clientSecret = config.xeroClientSecret
  const redirectUri = resolveRedirectUri(config, options.event)
  const httpTimeout = Number(config.xeroHttpTimeout ?? 15000)

  if (!clientId || !clientSecret || !redirectUri) {
    throw createError({ statusCode: 500, statusMessage: 'Xero OAuth not configured' })
  }

  const client = new XeroClient({
    clientId,
    clientSecret,
    redirectUris: [redirectUri],
    scopes: DEFAULT_SCOPES,
    state: options.state,
    httpTimeout
  })

  // Skip openid-client initialization entirely — we use fetch-based auth instead.
  // Just set the tokenSet so accountingApi calls work.
  if (options.tokenSet) {
    client.setTokenSet(toTokenSet(options.tokenSet))
  }

  if (options.state && client.config) {
    client.config.state = options.state
  }

  return client
}

export function toStoredTokenSet(token: TokenSet): XeroTokenSet {
  if (!token.expires_at) {
    throw createError({ statusCode: 500, statusMessage: 'Received token without expiry' })
  }
  return {
    ...token,
    expires_at: token.expires_at * 1000
  } as XeroTokenSet
}

export function toTokenSet(stored: XeroTokenSet): TokenSet {
  return {
    ...stored,
    expires_at: Math.floor(stored.expires_at / 1000)
  } as TokenSet
}
