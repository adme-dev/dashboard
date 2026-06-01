import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const CADENCES = new Set(['weekly', 'monthly'])

/** PATCH /api/agency/social/reporting/schedules/:id — update name/cadence/recipients/window/platform/enabled. */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const b = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  const set = (frag: string, val: any) => { params.push(val); sets.push(frag.replace('$?', `$${params.length}`)) }

  if (b.name?.trim()) set('name = $?', String(b.name).trim())
  if (b.cadence && CADENCES.has(b.cadence)) set('cadence = $?', b.cadence)
  if (Array.isArray(b.recipients)) {
    set('recipients = $?', b.recipients.map((r: any) => String(r).trim()).filter((r: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r)))
  }
  if (b.windowDays !== undefined) set('window_days = $?', Math.min(Math.max(Number(b.windowDays) || 30, 1), 365))
  if (b.platform !== undefined) set('platform = $?', b.platform && b.platform !== 'all' ? String(b.platform) : null)
  if (b.sections !== undefined) set('sections = $?::jsonb', JSON.stringify(b.sections ?? {}))
  if (b.enabled !== undefined) set('enabled = $?', !!b.enabled)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })

  params.push(id)
  await execute(`UPDATE social_report_schedules SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
  return { ok: true }
})
