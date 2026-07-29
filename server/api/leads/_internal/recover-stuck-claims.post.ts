// server/api/leads/_internal/recover-stuck-claims.post.ts
// Resets stuck `claimed` deliveries back to `pending` so the queue can pick them up.
// Hit by a cron in plan 1c. In dev, can be invoked manually for testing.

import { createHash, timingSafeEqual } from 'node:crypto'
import { recoverStuckClaims } from '~~/server/utils/leads/db'

function tokenMatches(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

export default defineEventHandler(async (event) => {
  const runtimeToken = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.INTERNAL_CRON_TOKEN
  const expected = typeof runtimeToken === 'string'
    ? runtimeToken
    : process.env.INTERNAL_CRON_TOKEN
  const authorization = getHeader(event, 'authorization')
  const provided = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''
  if (!expected || !provided || !tokenMatches(provided, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const reset = await recoverStuckClaims(5)
  return { reset }
})
