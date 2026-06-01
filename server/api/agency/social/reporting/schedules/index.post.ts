import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const CADENCES = new Set(['weekly', 'monthly'])

/** POST /api/agency/social/reporting/schedules — create a schedule. */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const b = await readBody(event)
  if (!b?.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  if (!b?.name?.trim()) throw createError({ statusCode: 400, statusMessage: 'name required' })
  const cadence = CADENCES.has(b.cadence) ? b.cadence : 'monthly'
  const recipients: string[] = Array.isArray(b.recipients)
    ? b.recipients.map((r: any) => String(r).trim()).filter((r: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r))
    : []
  const windowDays = Math.min(Math.max(Number(b.windowDays) || 30, 1), 365)
  const platform = b.platform && b.platform !== 'all' ? String(b.platform) : null

  const row = await queryOne(
    `INSERT INTO social_report_schedules (client_id, name, cadence, recipients, window_days, platform, sections, enabled, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING *`,
    [b.clientId, String(b.name).trim(), cadence, recipients, windowDays, platform,
     JSON.stringify(b.sections ?? {}), b.enabled !== false, String(user.id)])
  return row
})
