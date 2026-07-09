import type { FeedProviderContext } from './types'

export interface SocialDashboardOrganizationInput {
  actingUserEmail: string
  name: string
  slug?: string
  externalClientId?: string
  sellerRefs?: string[]
  platforms?: string[]
}

export interface SocialDashboardOrganizationResult {
  ok?: boolean
  organization_id?: string
  organization?: {
    id?: string
    name?: string
    slug?: string
  }
}

export interface SocialDashboardClientConfig {
  baseUrl: string
  serviceSecret: string
  accessToken?: string
  fetchImpl?: typeof fetch
}

export function buildSocialDashboardFeedServeUrl(baseUrl: string, feedId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/feeds/${encodeURIComponent(feedId)}/serve`
}

export function buildServiceHeaders(ctx: FeedProviderContext, serviceSecret: string, accessToken?: string): Record<string, string> {
  const headers = buildServiceBaseHeaders(ctx.actingUserEmail, serviceSecret, accessToken)
  headers['x-feed-org-id'] = ctx.externalOrgId
  return headers
}

export function buildServiceBaseHeaders(actingUserEmail: string, serviceSecret: string, accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-feed-service-secret': serviceSecret,
    'x-feed-acting-user-email': actingUserEmail,
    'x-feed-acting-user': actingUserEmail
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  return headers
}

export function createSocialDashboardClient(cfg: SocialDashboardClientConfig) {
  const doFetch = cfg.fetchImpl ?? fetch
  const base = cfg.baseUrl.replace(/\/+$/, '')

  async function call<T>(ctx: FeedProviderContext, method: string, path: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: buildServiceHeaders(ctx, cfg.serviceSecret, cfg.accessToken),
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`social-dashboard ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`)
    }
    return res.json() as Promise<T>
  }

  async function resolveOrganization(input: SocialDashboardOrganizationInput): Promise<SocialDashboardOrganizationResult> {
    const { actingUserEmail, ...body } = input
    const res = await doFetch(`${base}/api/organizations/upsert-external`, {
      method: 'POST',
      headers: buildServiceBaseHeaders(actingUserEmail, cfg.serviceSecret, cfg.accessToken),
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`social-dashboard POST /api/organizations/upsert-external → ${res.status}: ${text.slice(0, 200)}`)
    }
    return res.json() as Promise<SocialDashboardOrganizationResult>
  }

  return { call, resolveOrganization }
}

export type SocialDashboardClient = ReturnType<typeof createSocialDashboardClient>
