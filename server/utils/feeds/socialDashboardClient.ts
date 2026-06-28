import type { FeedProviderContext } from './types'

export interface SocialDashboardClientConfig {
  baseUrl: string
  serviceSecret: string
  fetchImpl?: typeof fetch
}

export function buildServiceHeaders(ctx: FeedProviderContext, serviceSecret: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-feed-service-secret': serviceSecret,
    'x-feed-acting-user': ctx.actingUserEmail,
    'x-feed-org-id': ctx.externalOrgId,
  }
}

export function createSocialDashboardClient(cfg: SocialDashboardClientConfig) {
  const doFetch = cfg.fetchImpl ?? fetch
  const base = cfg.baseUrl.replace(/\/+$/, '')

  async function call<T>(ctx: FeedProviderContext, method: string, path: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: buildServiceHeaders(ctx, cfg.serviceSecret),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`social-dashboard ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`)
    }
    return res.json() as Promise<T>
  }

  return { call }
}

export type SocialDashboardClient = ReturnType<typeof createSocialDashboardClient>
