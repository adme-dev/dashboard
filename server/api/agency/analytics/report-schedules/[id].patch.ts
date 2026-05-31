/**
 * Update a report schedule (enable/disable, recipients, cadence, branding).
 * PATCH /api/agency/analytics/report-schedules/:id
 */
import { execute } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'schedule id required' })
  const body = await readBody(event).catch(() => null)

  const sets: string[] = []
  const params: unknown[] = []
  let idx = 1

  if (typeof body?.enabled === 'boolean') {
    sets.push(`enabled = $${idx++}`)
    params.push(body.enabled)
  }
  if (body?.cadence === 'weekly' || body?.cadence === 'monthly') {
    sets.push(`cadence = $${idx++}`)
    params.push(body.cadence)
  }
  if (Array.isArray(body?.recipients)) {
    const recipients = body.recipients.map((r: unknown) => String(r).trim()).filter(Boolean)
    if (recipients.length === 0 || !recipients.every((r: string) => EMAIL_RE.test(r))) {
      throw createError({ statusCode: 400, statusMessage: 'recipients must be valid email addresses' })
    }
    sets.push(`recipients = $${idx++}`)
    params.push(recipients)
  }
  if (body?.branding && typeof body.branding === 'object') {
    sets.push(`branding = $${idx++}`)
    params.push(JSON.stringify(body.branding))
  }

  if (sets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'no updatable fields supplied' })
  }
  sets.push(`updated_at = NOW()`)
  params.push(id)

  await execute(`UPDATE report_schedules SET ${sets.join(', ')} WHERE id = $${idx}`, params)
  return { ok: true }
})
