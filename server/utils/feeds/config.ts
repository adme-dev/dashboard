import { queryOne as dbQueryOne } from '~~/server/utils/db'
import { createSocialDashboardClient, type SocialDashboardClient } from './socialDashboardClient'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from './constants'

type Env = Record<string, string | undefined>

export function isDealerFeedsEnabled(env: Env = process.env): boolean {
  return env.DEALER_FEEDS_ENABLED === 'true'
}

export interface SocialDashboardConfig { baseUrl: string, serviceSecret: string, accessToken?: string }

function settingsBaseUrl(row: unknown): string | null {
  if (!row || typeof row !== 'object' || !('settings' in row)) return null
  const settings = (row as { settings?: unknown }).settings
  if (!settings || typeof settings !== 'object' || !('baseUrl' in settings)) return null
  const baseUrl = (settings as { baseUrl?: unknown }).baseUrl
  return baseUrl ? String(baseUrl) : null
}

export async function resolveSocialDashboardBaseUrl(
  deps: { env?: Env, runtimeEnv?: Env, queryOne?: typeof dbQueryOne } = {}
): Promise<string> {
  const env = deps.env ?? process.env
  const runtimeEnv = deps.runtimeEnv ?? {}
  const configuredBaseUrl = runtimeEnv.SOCIAL_DASHBOARD_BASE_URL || env.SOCIAL_DASHBOARD_BASE_URL
  if (configuredBaseUrl) return configuredBaseUrl

  const queryOne = deps.queryOne ?? dbQueryOne
  try {
    const row = await queryOne(
      `SELECT settings FROM integration_configs WHERE integration_type = $1`,
      [SOCIAL_DASHBOARD_PROVIDER_ID]
    )
    const baseUrl = settingsBaseUrl(row)
    if (baseUrl) return String(baseUrl)
  } catch {
    // Copying a live feed URL should still work if the integration settings
    // lookup is temporarily unavailable; the feed service has a stable domain.
  }

  return 'https://socials.driveagent.io'
}

export async function loadSocialDashboardConfig(
  deps: { env?: Env, runtimeEnv?: Env, queryOne?: typeof dbQueryOne } = {}
): Promise<SocialDashboardConfig | null> {
  const env = deps.env ?? process.env
  const runtimeEnv = deps.runtimeEnv ?? {}
  const serviceSecret = runtimeEnv.SOCIAL_DASHBOARD_SERVICE_SECRET || env.SOCIAL_DASHBOARD_SERVICE_SECRET
  if (!serviceSecret) return null
  const queryOne = deps.queryOne ?? dbQueryOne
  const row = await queryOne(
    `SELECT settings FROM integration_configs WHERE integration_type = $1`,
    [SOCIAL_DASHBOARD_PROVIDER_ID]
  )
  const baseUrl = settingsBaseUrl(row)
  if (!baseUrl) return null
  const accessToken = runtimeEnv.SOCIAL_DASHBOARD_ACCESS_TOKEN || env.SOCIAL_DASHBOARD_ACCESS_TOKEN || undefined
  return { baseUrl: String(baseUrl), serviceSecret, accessToken }
}

export async function getSocialDashboardClient(
  deps: { env?: Env, runtimeEnv?: Env, queryOne?: typeof dbQueryOne, fetchImpl?: typeof fetch } = {}
): Promise<SocialDashboardClient | null> {
  const cfg = await loadSocialDashboardConfig(deps)
  if (!cfg) return null
  return createSocialDashboardClient({ baseUrl: cfg.baseUrl, serviceSecret: cfg.serviceSecret, accessToken: cfg.accessToken, fetchImpl: deps.fetchImpl })
}
