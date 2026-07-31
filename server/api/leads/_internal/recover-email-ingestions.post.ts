import { createHash, timingSafeEqual } from 'node:crypto'
import {
  recoverEmailIngestions,
  resolveEmailRecoveryRuntime
} from '~~/server/utils/leads/emailRecovery'
import {
  processEmailIngestionHealthAlerts,
  resolveEmailHealthRuntimeConfig
} from '~~/server/utils/leads/emailHealth'

function tokenMatches(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

export default defineEventHandler(async (event) => {
  const cloudflareEnv = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env
  const expected = typeof cloudflareEnv?.INTERNAL_CRON_TOKEN === 'string'
    ? cloudflareEnv.INTERNAL_CRON_TOKEN
    : process.env.INTERNAL_CRON_TOKEN
  const authorization = getHeader(event, 'authorization')
  const provided = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''

  if (!expected || !provided || !tokenMatches(provided, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }

  const result = await recoverEmailIngestions(event, resolveEmailRecoveryRuntime(event))
  const recovery = { ok: result.failed === 0, ...result }
  let health
  try {
    const scan = await processEmailIngestionHealthAlerts(
      event,
      resolveEmailHealthRuntimeConfig(event)
    )
    health = {
      ok: scan.status === 'succeeded',
      ...scan
    }
  } catch {
    health = {
      ok: false,
      status: 'failed' as const,
      endpoints: 0,
      failedEndpoints: 0,
      active: 0,
      notified: 0,
      errorClass: 'email_health_scan_failed' as const
    }
  }
  const response = {
    ok: recovery.ok && health.ok,
    recovery,
    health,
    ...result
  }
  if (!response.ok) setResponseStatus(event, 503)
  return response
})
