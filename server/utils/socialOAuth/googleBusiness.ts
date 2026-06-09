import { ofetch } from 'ofetch'
import type { AccountRow } from './store'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ACCOUNT_MANAGEMENT_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const BUSINESS_INFORMATION_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'

export const GOOGLE_BUSINESS_SCOPE = 'https://www.googleapis.com/auth/business.manage'

export interface GoogleBusinessTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope?: string
}

export interface GoogleBusinessAccount {
  name: string
  accountName?: string
  type?: string
}

export interface GoogleBusinessLocation {
  name: string
  title?: string
  storefrontAddress?: {
    addressLines?: string[]
    locality?: string
    administrativeArea?: string
    postalCode?: string
    regionCode?: string
  }
  metadata?: Record<string, unknown>
}

export interface GoogleBusinessLocationSelection {
  id: string
  name: string
  accountId: string
  accountName: string
  locationId: string
  locationResourceName: string
  address: string | null
}

export function buildGoogleBusinessAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: GOOGLE_BUSINESS_SCOPE,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true'
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function exchangeGoogleBusinessCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GoogleBusinessTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })
  return ofetch<GoogleBusinessTokenResponse>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

export async function refreshGoogleBusinessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<GoogleBusinessTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token'
  })
  return ofetch<GoogleBusinessTokenResponse>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

async function googleBusinessFetch<T>(url: string, accessToken: string): Promise<T> {
  try {
    return await ofetch<T>(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
  } catch (error) {
    console.warn('[GoogleBusinessOAuth] API request failed', getGoogleApiErrorLog(url, error))
    throw error
  }
}

function getGoogleApiErrorLog(url: string, error: unknown): Record<string, unknown> {
  const raw = error as {
    status?: number
    statusCode?: number
    data?: {
      error?: {
        code?: number
        message?: string
        status?: string
      }
    }
    message?: string
  }
  const parsedUrl = new URL(url)
  return {
    endpoint: `${parsedUrl.hostname}${parsedUrl.pathname}`,
    statusCode: raw.statusCode || raw.status || raw.data?.error?.code || null,
    googleStatus: raw.data?.error?.status || null,
    message: raw.data?.error?.message || raw.message || 'Google Business API request failed'
  }
}

export async function listGoogleBusinessAccounts(accessToken: string): Promise<GoogleBusinessAccount[]> {
  const accounts: GoogleBusinessAccount[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${ACCOUNT_MANAGEMENT_BASE}/accounts`)
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const data = await googleBusinessFetch<{ accounts?: GoogleBusinessAccount[], nextPageToken?: string }>(
      url.toString(),
      accessToken
    )
    accounts.push(...(data.accounts ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return accounts
}

export async function listGoogleBusinessLocations(
  accountResourceName: string,
  accessToken: string
): Promise<GoogleBusinessLocation[]> {
  const locations: GoogleBusinessLocation[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${BUSINESS_INFORMATION_BASE}/${accountResourceName}/locations`)
    url.searchParams.set('readMask', 'name,title,storefrontAddress,metadata')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const data = await googleBusinessFetch<{ locations?: GoogleBusinessLocation[], nextPageToken?: string }>(
      url.toString(),
      accessToken
    )
    locations.push(...(data.locations ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return locations
}

export async function discoverGoogleBusinessLocations(accessToken: string): Promise<GoogleBusinessLocationSelection[]> {
  const accounts = await listGoogleBusinessAccounts(accessToken)
  const discovered: GoogleBusinessLocationSelection[] = []

  for (const account of accounts) {
    if (!account.name) continue
    const accountId = lastResourceSegment(account.name)
    const accountName = account.accountName || `Google Business account ${accountId}`
    let locations: GoogleBusinessLocation[] = []
    try {
      locations = await listGoogleBusinessLocations(account.name, accessToken)
    } catch {
      continue
    }

    for (const location of locations) {
      if (!location.name) continue
      const locationId = lastResourceSegment(location.name)
      const name = location.title || `Google Business location ${locationId}`
      discovered.push({
        id: `${accountId}:${locationId}`,
        name,
        accountId,
        accountName,
        locationId,
        locationResourceName: location.name,
        address: formatAddress(location.storefrontAddress)
      })
    }
  }

  return discovered
}

export function mapGoogleBusinessLocationsToAccountRows(
  locations: GoogleBusinessLocationSelection[],
  accessToken: string,
  refreshToken: string | null,
  expiresAt: string | null
): AccountRow[] {
  return locations.map(location => ({
    platform: 'google-business',
    platform_account_id: location.id,
    account_name: location.name,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expires_at: expiresAt,
    metadata: {
      googleBusinessAccountId: location.accountId,
      googleBusinessAccountName: location.accountName,
      googleBusinessLocationId: location.locationId,
      googleBusinessLocationName: location.locationResourceName,
      address: location.address
    }
  }))
}

function lastResourceSegment(resourceName: string): string {
  const parts = resourceName.split('/').filter(Boolean)
  return parts[parts.length - 1] || resourceName
}

function formatAddress(address: GoogleBusinessLocation['storefrontAddress']): string | null {
  if (!address) return null
  const parts = [
    ...(address.addressLines ?? []),
    address.locality,
    address.administrativeArea,
    address.postalCode,
    address.regionCode
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}
