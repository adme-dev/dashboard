// server/api/crm/stage-automations/index.post.ts — admin-configured.
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { transaction } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireAssignmentPoolMembers } from '~~/server/utils/crm/assignment'

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
  const row = await transaction(async (database) => {
    // Stage and optional assignee remain valid for the complete config write.
    const stageResult = await database.query(
      `SELECT id FROM crm_stages
        WHERE id = $1 AND (client_id IS NULL OR client_id = $2)
        FOR SHARE`,
      [b.stage_id, context.clientId]
    )
    if (!stageResult.rows?.[0]) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
    if (b.task_template.assigned_to) {
      await requireAssignmentPoolMembers(context.clientId, [b.task_template.assigned_to], database)
    }
    const result = await database.query(
      `INSERT INTO crm_stage_automations (client_id, stage_id, task_template, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [context.clientId, b.stage_id, JSON.stringify(b.task_template), b.is_active, context.actorId]
    )
    return result.rows?.[0] ?? null
  })
  return { item: row }
})
