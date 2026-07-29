// server/api/leads/_internal/purge-retention.post.ts
// Hard-deletes terminal-state leads older than retention. Soft-deleted leads
// are also cleaned. Configurable via env LEADS_RETENTION_MONTHS (default 18).
//
// "Terminal states" = won, lost, spam_suspected. New / contacted / qualified
// stay forever (or until soft-delete triggers retention).

import { createHash, timingSafeEqual } from 'node:crypto'
import { execute, queryOne } from '~~/server/utils/db'

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
  const runtimeRetentionMonths = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.LEADS_RETENTION_MONTHS
  const configuredRetentionMonths = typeof runtimeRetentionMonths === 'string'
    ? runtimeRetentionMonths
    : process.env.LEADS_RETENTION_MONTHS
  const months = Number(configuredRetentionMonths ?? 18)
  if (!Number.isInteger(months) || months < 1 || months > 120) {
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
