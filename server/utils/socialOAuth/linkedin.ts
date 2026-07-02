import { ofetch } from 'ofetch'
import type { AccountRow } from './store'

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest'

export const LINKEDIN_REST_VERSION = '202506'
export const LINKEDIN_ORGANIC_OAUTH_SCOPES = [
  'r_organization_admin',
  'w_organization_social',
  'r_organization_social',
  'w_member_social'
]

export interface LinkedInOrganicTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope?: string
}

interface LinkedInOrganizationAcl {
  role?: string
  state?: string
  organization?: string
  organizationTarget?: string
}

interface LinkedInOrganization {
  id?: string | number
  localizedName?: string
  vanityName?: string
  name?: {
    localized?: Record<string, string>
  }
}

export interface LinkedInOrganizationSelection {
  id: string
  urn: string
  name: string
  vanityName: string | null
  role: string
}

export function buildLinkedInOrganicAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_ORGANIC_OAUTH_SCOPES.join(' ')
  })
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`
}

export async function exchangeLinkedInOrganicCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<LinkedInOrganicTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  })
  return ofetch<LinkedInOrganicTokenResponse>(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

export async function refreshLinkedInOrganicToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<LinkedInOrganicTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  })
  return ofetch<LinkedInOrganicTokenResponse>(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

export async function discoverLinkedInOrganizations(accessToken: string): Promise<LinkedInOrganizationSelection[]> {
  const acls = await listLinkedInOrganizationAcls(accessToken)
  const ids = unique(acls.map(organizationIdFromAcl).filter((id): id is string => Boolean(id)))
  if (!ids.length) return []

  const organizations = await getLinkedInOrganizations(ids, accessToken)
  return ids.map((id) => {
    const organization = organizations[id]
    return {
      id,
      urn: `urn:li:organization:${id}`,
      name: organizationName(organization, id),
      vanityName: textOrNull(organization?.vanityName),
      role: roleForOrganization(acls, id) || 'ADMINISTRATOR'
    }
  })
}

export function getLinkedInDiscoveryErrorReason(error: unknown): string {
  const raw = error as {
    status?: number
    statusCode?: number
    data?: {
      message?: string
      serviceErrorCode?: number
    }
    message?: string
  }
  const statusCode = raw.statusCode || raw.status || null
  const message = raw.data?.message || raw.message || ''
  const haystack = message.toLowerCase()

  if ((statusCode === 401 || statusCode === 403) && haystack.includes('scope')) return 'linkedin_invalid_scope'
  if (statusCode === 401) return 'linkedin_token_invalid'
  if (statusCode === 403) return 'linkedin_permission_denied'
  return 'linkedin_organization_list_failed'
}

export function mapLinkedInOrganizationsToAccountRows(
  organizations: LinkedInOrganizationSelection[],
  accessToken: string,
  refreshToken: string | null,
  expiresAt: string | null
): AccountRow[] {
  return organizations.map(organization => ({
    platform: 'linkedin',
    platform_account_id: organization.id,
    account_name: organization.name,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expires_at: expiresAt,
    metadata: {
      linkedinOrganizationUrn: organization.urn,
      linkedinVanityName: organization.vanityName,
      linkedinRole: organization.role,
      publishingReadiness: 'oauth_connected_publish_not_enabled'
    }
  }))
}

async function listLinkedInOrganizationAcls(accessToken: string): Promise<LinkedInOrganizationAcl[]> {
  const rows: LinkedInOrganizationAcl[] = []
  const count = 100
  let start = 0
  let hasNext = true

  while (hasNext) {
    const url = `${LINKEDIN_API_BASE}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=${count}&start=${start}`
    const data = await linkedInFetch<{ elements?: LinkedInOrganizationAcl[], paging?: { links?: Array<{ rel?: string }> } }>(
      url,
      accessToken
    )
    const elements = data.elements ?? []
    rows.push(...elements)
    hasNext = Boolean(data.paging?.links?.some(link => link.rel === 'next') && elements.length > 0)
    start += count
  }

  return rows
}

async function getLinkedInOrganizations(ids: string[], accessToken: string): Promise<Record<string, LinkedInOrganization>> {
  const url = `${LINKEDIN_API_BASE}/organizations?ids=List(${ids.join(',')})`
  const data = await linkedInFetch<{
    results?: Record<string, LinkedInOrganization>
    statuses?: Record<string, number>
  }>(url, accessToken)
  return data.results ?? {}
}

async function linkedInFetch<T>(url: string, accessToken: string): Promise<T> {
  try {
    return await ofetch<T>(url, { headers: linkedInHeaders(accessToken) })
  } catch (error) {
    console.warn('[LinkedInOrganicOAuth] API request failed', getLinkedInApiErrorLog(url, error))
    throw error
  }
}

function linkedInHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'LinkedIn-Version': LINKEDIN_REST_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json'
  }
}

function getLinkedInApiErrorLog(url: string, error: unknown): Record<string, unknown> {
  const raw = error as {
    status?: number
    statusCode?: number
    data?: {
      message?: string
      serviceErrorCode?: number
    }
    message?: string
  }
  const parsedUrl = new URL(url)
  return {
    endpoint: `${parsedUrl.hostname}${parsedUrl.pathname}`,
    statusCode: raw.statusCode || raw.status || null,
    serviceErrorCode: raw.data?.serviceErrorCode || null,
    message: raw.data?.message || raw.message || 'LinkedIn API request failed'
  }
}

function organizationIdFromAcl(acl: LinkedInOrganizationAcl): string | null {
  const urn = acl.organizationTarget || acl.organization || ''
  const match = urn.match(/^urn:li:organization:(\d+)$/)
  return match?.[1] ?? null
}

function roleForOrganization(acls: LinkedInOrganizationAcl[], id: string): string | null {
  return acls.find(acl => organizationIdFromAcl(acl) === id)?.role ?? null
}

function organizationName(organization: LinkedInOrganization | undefined, id: string): string {
  const localizedName = textOrNull(organization?.localizedName)
  if (localizedName) return localizedName

  const localized = organization?.name?.localized ?? {}
  const firstLocalized = Object.values(localized).find(value => value.trim())
  return firstLocalized || `LinkedIn organization ${id}`
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed || null
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}
