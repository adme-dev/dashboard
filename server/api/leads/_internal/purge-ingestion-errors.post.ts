// server/api/leads/_internal/purge-ingestion-errors.post.ts
// Cron-target: bounded ingestion-error, signature-nonce, and staged-email cleanup.
// Auth: Bearer INTERNAL_CRON_TOKEN.

import { createHash, timingSafeEqual } from 'node:crypto'
import { purgeEmailIngestionRetention } from '~~/server/utils/leads/emailHealth'

function tokenMatches(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

export default defineEventHandler(async (event) => {
  const cloudflareEnv = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  } | undefined)?.cloudflare?.env
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
  const result = await purgeEmailIngestionRetention(event, { limit: 100 })
  return { ok: true, ...result }
})
