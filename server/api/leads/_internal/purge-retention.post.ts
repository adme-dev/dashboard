// server/api/leads/_internal/purge-retention.post.ts
// Hard-deletes terminal-state leads older than retention. Soft-deleted leads
// are also cleaned. Configurable via env LEADS_RETENTION_MONTHS (default 18).
//
// "Terminal states" = won, lost, spam_suspected. New / contacted / qualified
// stay forever (or until soft-delete triggers retention).

import { execute, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const expected = `Bearer ${process.env.INTERNAL_CRON_TOKEN ?? ''}`
  if (!process.env.INTERNAL_CRON_TOKEN || auth !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const months = Number(process.env.LEADS_RETENTION_MONTHS ?? 18)
  if (!Number.isFinite(months) || months < 1) {
    return { ok: false, error: 'invalid_LEADS_RETENTION_MONTHS' }
  }

  // Sample first to log volume before deleting (no PII in the count itself).
  const probe = await queryOne<{ n: string }>(`
    SELECT COUNT(*)::text AS n FROM leads
    WHERE (
      (status IN ('won','lost','spam_suspected') AND created_at < NOW() - ($1 || ' months')::interval)
      OR (deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' months')::interval)
    )
  `, [String(months)])

  const deleted = await execute(`
    DELETE FROM leads
    WHERE (
      (status IN ('won','lost','spam_suspected') AND created_at < NOW() - ($1 || ' months')::interval)
      OR (deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' months')::interval)
    )
  `, [String(months)])

  return { ok: true, candidate_count: Number(probe?.n ?? 0), deleted, months }
})
