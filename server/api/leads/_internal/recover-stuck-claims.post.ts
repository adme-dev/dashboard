// server/api/leads/_internal/recover-stuck-claims.post.ts
// Resets stuck `claimed` deliveries back to `pending` so the queue can pick them up.
// Hit by a cron in plan 1c. In dev, can be invoked manually for testing.

import { recoverStuckClaims } from '~~/server/utils/leads/db'
import { isInternalCronAuthorized } from '~~/server/utils/leads/internalCronAuth'

export default defineEventHandler(async (event) => {
  if (!isInternalCronAuthorized(event, getHeader(event, 'authorization'))) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const reset = await recoverStuckClaims(5)
  return { reset }
})
