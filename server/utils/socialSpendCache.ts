import type { H3Event } from 'h3'
import { analyticsCacheKey } from '~~/server/utils/analyticsCache'
import { kvDelete } from '~~/server/utils/kv'

function accountCachePlatform(platform: string) {
  return platform === 'google_ads' ? 'google' : platform
}

export function spendSummaryCachePlatforms(platform: string) {
  if (platform === 'google_ads' || platform === 'google') {
    return ['google_ads', 'google']
  }
  return [platform]
}

function monthRangeForPeriod(period: string): { startDate: string; endDate: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    startDate: `${match[1]}-${match[2]}-01`,
    endDate: `${match[1]}-${match[2]}-${String(endDay).padStart(2, '0')}`,
  }
}

export function analyticsOverviewCacheKeysForSpendPeriod(input: {
  period: string
  platform: string
  clientId?: string | null
}) {
  const range = monthRangeForPeriod(input.period)
  if (!range) return []

  const clients = Array.from(new Set(['all', input.clientId].filter(Boolean) as string[]))
  const platforms = Array.from(new Set(['all', ...spendSummaryCachePlatforms(input.platform)]))
  const keys: string[] = []

  for (const clientId of clients) {
    for (const platform of platforms) {
      keys.push(analyticsCacheKey('overview', {
        clientId: clientId === 'all' ? undefined : clientId,
        ...range,
        platforms: platform === 'all' ? null : platform,
      }))
    }
  }

  return keys
}

export async function invalidateSpendPeriodCaches(
  event: H3Event,
  input: { period: string; platform: string; tenantId?: string | null; clientId?: string | null },
) {
  const tenantSeg = input.tenantId || 'no-tenant'
  const kvPlatform = accountCachePlatform(input.platform)
  const summaryDeletes = spendSummaryCachePlatforms(input.platform).map(platform =>
    kvDelete(event, `spend:summary:${tenantSeg}:${input.period}:${platform}`)
  )
  const analyticsDeletes = analyticsOverviewCacheKeysForSpendPeriod(input).map(key =>
    kvDelete(event, key)
  )

  await Promise.all([
    kvDelete(event, `spend:summary:${tenantSeg}:${input.period}:all`),
    ...summaryDeletes,
    kvDelete(event, `spend:${kvPlatform}:accounts:${input.period}`),
    kvDelete(event, `spend:daily:${kvPlatform}:${input.period}`),
    ...analyticsDeletes,
  ])
}
