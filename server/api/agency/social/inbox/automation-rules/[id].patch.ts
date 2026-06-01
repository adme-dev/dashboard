import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** PATCH /api/agency/social/inbox/automation-rules/:id  body: partial rule */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const b = await readBody(event)
  if (!b?.client_id) throw createError({ statusCode: 400, statusMessage: 'client_id required' })
  const sets: string[] = []
  const params: any[] = []
  const set = (col: string, val: any, cast = '') => { params.push(val); sets.push(`${col} = $${params.length}${cast}`) }

  if (b.name != null) set('name', String(b.name).trim())
  if (b.platform !== undefined) set('platform', b.platform ?? null)
  if (b.channel_type !== undefined) set('channel_type', b.channel_type ?? null)
  if (b.mode != null && ['off', 'suggest', 'approval', 'autopilot'].includes(b.mode)) set('mode', b.mode)
  if (b.conditions != null) set('conditions', JSON.stringify(b.conditions), '::jsonb')
  if (b.action != null) set('action', JSON.stringify(b.action), '::jsonb')
  if (b.approval_by != null && ['staff', 'client', 'none'].includes(b.approval_by)) set('approval_by', b.approval_by)
  if (b.rate_limit != null) set('rate_limit', Number(b.rate_limit) || 0)
  if (b.confidence_floor != null) {
    const f = Number(b.confidence_floor)
    if (Number.isFinite(f)) set('confidence_floor', Math.min(1, Math.max(0, f)))
  }
  if (b.business_hours !== undefined) set('business_hours', b.business_hours ? JSON.stringify(b.business_hours) : null, '::jsonb')
  if (b.priority != null) set('priority', Number(b.priority) || 100)
  if (b.enabled != null) set('enabled', !!b.enabled)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'no fields to update' })

  params.push(id)
  const idIdx = params.length
  params.push(b.client_id)
  return await queryOne(
    `UPDATE social_automation_rules SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${idIdx} AND client_id = $${params.length} RETURNING *`, params)
})
