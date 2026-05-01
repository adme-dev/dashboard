// server/api/leads/_internal/purge-ingestion-errors.post.ts
// Cron-target: deletes lead_ingestion_errors rows older than 30 days.
// Auth: Bearer INTERNAL_CRON_TOKEN.

import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const expected = `Bearer ${process.env.INTERNAL_CRON_TOKEN ?? ''}`
  if (!process.env.INTERNAL_CRON_TOKEN || auth !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const deleted = await execute(`
    DELETE FROM lead_ingestion_errors WHERE created_at < NOW() - INTERVAL '30 days'
  `)
  return { ok: true, deleted }
})
