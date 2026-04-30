// server/api/leads/_internal/recover-stuck-claims.post.ts
// Resets stuck `claimed` deliveries back to `pending` so the queue can pick them up.
// Hit by a cron in plan 1c. In dev, can be invoked manually for testing.

import { recoverStuckClaims } from '~~/server/utils/leads/db'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const expected = `Bearer ${process.env.INTERNAL_CRON_TOKEN ?? ''}`
  if (!process.env.INTERNAL_CRON_TOKEN || auth !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const reset = await recoverStuckClaims(5)
  return { reset }
})
