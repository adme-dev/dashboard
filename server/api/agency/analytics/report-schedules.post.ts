/**
 * Create a report schedule.
 * POST /api/agency/analytics/report-schedules
 * body: { clientId?, cadence: 'weekly'|'monthly', recipients: string[], branding? }
 */
import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const body = await readBody(event).catch(() => null)

  const cadence = body?.cadence
  if (cadence !== 'weekly' && cadence !== 'monthly') {
    throw createError({ statusCode: 400, statusMessage: 'cadence must be weekly or monthly' })
  }
  const recipients: string[] = Array.isArray(body?.recipients)
    ? body.recipients.map((r: unknown) => String(r).trim()).filter(Boolean)
    : []
  if (recipients.length === 0 || !recipients.every(r => EMAIL_RE.test(r))) {
    throw createError({ statusCode: 400, statusMessage: 'recipients must be one or more valid email addresses' })
  }
  const clientId = typeof body?.clientId === 'string' && body.clientId ? body.clientId : null
  const branding = body?.branding && typeof body.branding === 'object' ? body.branding : {}

  const row = await queryOne<{ id: string }>(
    `INSERT INTO report_schedules (client_id, cadence, recipients, branding, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [clientId, cadence, recipients, JSON.stringify(branding), user.id]
  )
  return { id: row?.id, clientId, cadence, recipients, branding, enabled: true }
})
