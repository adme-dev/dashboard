// server/api/crm/stage-automations/index.post.ts — admin-configured.
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Template = z.object({
  title: z.string().min(1),
  task_type: z.enum(['call', 'email', 'sms', 'meeting', 'follow_up', 'general']).default('follow_up'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  due_offset_days: z.coerce.number().int().min(0).max(365).default(0),
  assigned_to: z.string().uuid().nullable().optional(),
})

const Body = z.object({
  client_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  task_template: Template,
  is_active: z.boolean().default(true),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  // Stage must belong to this client (or be a global default).
  const stage = await queryOne(
    `SELECT id FROM crm_stages WHERE id = $1 AND (client_id IS NULL OR client_id = $2)`,
    [b.stage_id, context.clientId],
  )
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  const row = await queryOne(
    `INSERT INTO crm_stage_automations (client_id, stage_id, task_template, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [context.clientId, b.stage_id, JSON.stringify(b.task_template), b.is_active, context.actorId],
  )
  return { item: row }
})
