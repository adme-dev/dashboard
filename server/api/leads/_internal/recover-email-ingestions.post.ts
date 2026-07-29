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
  try {
    await processEmailIngestionHealthAlerts(event, resolveEmailHealthRuntimeConfig(event))
  } catch {
    // Alerting is operationally important but must not misreport successful
    // recovery work or cause canonical recovery to be replayed.
  }
  return { ok: true, ...result }
})
