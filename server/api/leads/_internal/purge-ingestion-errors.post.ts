// server/api/leads/_internal/purge-ingestion-errors.post.ts
// Cron-target: bounded ingestion-error, signature-nonce, and staged-email cleanup.
// Auth: Bearer INTERNAL_CRON_TOKEN.

import { purgeEmailIngestionRetention } from '~~/server/utils/leads/emailHealth'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const expected = `Bearer ${process.env.INTERNAL_CRON_TOKEN ?? ''}`
  if (!process.env.INTERNAL_CRON_TOKEN || auth !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const result = await purgeEmailIngestionRetention(event, { limit: 100 })
  return { ok: true, ...result }
})
