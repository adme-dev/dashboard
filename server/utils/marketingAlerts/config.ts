// Operator config for the marketing alerts pipeline: committed defaults
// (shared/marketingAlertsDefaults.ts) with the optional agency_settings row
// key 'marketing_alerts' merged on top. No environment variables — production
// Pages is at its text-binding cap.
import { queryOne } from '~~/server/utils/db'
import { MARKETING_ALERTS_DEFAULTS } from '~~/shared/marketingAlertsDefaults'
import { validateWebhook } from '~~/server/utils/anomalyDetection/slackBudget'

export const MARKETING_ALERTS_SETTINGS_KEY = 'marketing_alerts'

export interface MarketingAlertsThresholds {
  overPacingCriticalRatio: number
  overPacingWarningRatio: number
  underPacingWarningRatio: number
  underPacingMinDay: number
  noBudgetMinSpend: number
  pacingMaxSyncAgeHours: number
  syncStaleHours: number
  searchTermMinTermCost: number
  searchTermWastedCampaignTotal: number
  searchTermMaxSnapshotAgeDays: number
  immediateWindowHours: number
}

export interface MarketingAlertsConfig {
  enabled: boolean
  timezone: string
  digestHour: number
  delivery: { slack: boolean, inApp: boolean }
  slack: { webhookUrl: string | null, channel: string | null, useBudgetSlackWebhook: boolean }
  recipientEmails: string[]
  thresholds: MarketingAlertsThresholds
}

const bool = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null
const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback

function validTimezone(value: unknown, fallback: string): string {
  const tz = str(value)
  if (!tz) return fallback
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return fallback
  }
}

/** Merge a stored settings value over the committed defaults. Invalid fields fall back field by field;
 * the master switch only turns on for an explicit boolean `true`. */
export function mergeMarketingAlertsConfig(stored: unknown): MarketingAlertsConfig {
  const d = MARKETING_ALERTS_DEFAULTS
  const s = (stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}) as Record<string, unknown> & {
    delivery?: unknown
    slack?: unknown
    thresholds?: unknown
    recipientEmails?: unknown[]
  }
  const delivery = (s.delivery && typeof s.delivery === 'object' ? s.delivery : {}) as Record<string, unknown>
  const slack = (s.slack && typeof s.slack === 'object' ? s.slack : {}) as Record<string, unknown>
  const thresholds = (s.thresholds && typeof s.thresholds === 'object' ? s.thresholds : {}) as Record<string, unknown>
  const webhook = str(slack.webhookUrl)
  const digestHour = num(s.digestHour, d.digestHour)

  return {
    enabled: s.enabled === true ? true : d.enabled,
    timezone: validTimezone(s.timezone, d.timezone),
    digestHour: Number.isInteger(digestHour) && digestHour <= 23 ? digestHour : d.digestHour,
    delivery: {
      slack: bool(delivery.slack, d.delivery.slack),
      inApp: bool(delivery.inApp, d.delivery.inApp)
    },
    slack: {
      webhookUrl: webhook && validateWebhook(webhook) ? webhook : null,
      channel: str(slack.channel),
      useBudgetSlackWebhook: bool(slack.useBudgetSlackWebhook, d.slack.useBudgetSlackWebhook)
    },
    recipientEmails: Array.isArray(s.recipientEmails)
      ? [...new Set(s.recipientEmails.map(str).filter((e): e is string => !!e && e.includes('@')).map(e => e.toLowerCase()))]
      : [...d.recipientEmails],
    thresholds: Object.fromEntries(
      Object.entries(d.thresholds).map(([key, fallback]) => [key, num(thresholds[key], fallback)])
    ) as unknown as MarketingAlertsThresholds
  }
}

export async function getMarketingAlertsConfig(tenantId: string): Promise<MarketingAlertsConfig> {
  const row = await queryOne<{ value: unknown }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = $2`,
    [tenantId, MARKETING_ALERTS_SETTINGS_KEY]
  )
  return mergeMarketingAlertsConfig(row?.value)
}
