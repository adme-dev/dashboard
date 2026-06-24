import type { H3Event } from 'h3'
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

export async function invalidateSpendPeriodCaches(
  event: H3Event,
  input: { period: string; platform: string; tenantId?: string | null },
) {
  const tenantSeg = input.tenantId || 'no-tenant'
  const kvPlatform = accountCachePlatform(input.platform)
  const summaryDeletes = spendSummaryCachePlatforms(input.platform).map(platform =>
    kvDelete(event, `spend:summary:${tenantSeg}:${input.period}:${platform}`)
  )

  await Promise.all([
    kvDelete(event, `spend:summary:${tenantSeg}:${input.period}:all`),
    ...summaryDeletes,
    kvDelete(event, `spend:${kvPlatform}:accounts:${input.period}`),
    kvDelete(event, `spend:daily:${kvPlatform}:${input.period}`),
  ])
}
