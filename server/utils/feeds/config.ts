import { queryOne as dbQueryOne } from '~~/server/utils/db'
import { createSocialDashboardClient, type SocialDashboardClient } from './socialDashboardClient'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from './constants'

type Env = Record<string, string | undefined>

export function isDealerFeedsEnabled(env: Env = process.env): boolean {
  return env.DEALER_FEEDS_ENABLED === 'true'
}

export interface SocialDashboardConfig { baseUrl: string; serviceSecret: string; accessToken?: string }

export async function loadSocialDashboardConfig(
  deps: { env?: Env; queryOne?: typeof dbQueryOne } = {},
): Promise<SocialDashboardConfig | null> {
  const env = deps.env ?? process.env
  const serviceSecret = env.SOCIAL_DASHBOARD_SERVICE_SECRET
  if (!serviceSecret) return null
  const queryOne = deps.queryOne ?? dbQueryOne
  const row = await queryOne(
    `SELECT settings FROM integration_configs WHERE integration_type = $1`,
    [SOCIAL_DASHBOARD_PROVIDER_ID],
  )
  const baseUrl = (row?.settings as any)?.baseUrl
  if (!baseUrl) return null
  const accessToken = env.SOCIAL_DASHBOARD_ACCESS_TOKEN || undefined
  return { baseUrl: String(baseUrl), serviceSecret, accessToken }
}

export async function getSocialDashboardClient(
  deps: { env?: Env; queryOne?: typeof dbQueryOne; fetchImpl?: typeof fetch } = {},
): Promise<SocialDashboardClient | null> {
  const cfg = await loadSocialDashboardConfig(deps)
  if (!cfg) return null
  return createSocialDashboardClient({ baseUrl: cfg.baseUrl, serviceSecret: cfg.serviceSecret, accessToken: cfg.accessToken, fetchImpl: deps.fetchImpl })
}
