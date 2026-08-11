// server/api/crm/tasks/index.post.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { TaskCreateInput } from '~~/server/utils/crm/tasks'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const parsed = TaskCreateInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const row = await transaction(async (db) => {
    await requireCrmRecordAccess(context, { type: b.target_type, id: b.target_id }, db)
    const result = await db.query(
      `INSERT INTO crm_tasks
         (client_id, target_type, target_id, title, description, task_type, priority, due_at, reminder_at, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        context.clientId, b.target_type, b.target_id, b.title, b.description ?? null,
        b.task_type, b.priority, b.due_at ?? null, b.reminder_at ?? null, b.assigned_to ?? null, context.actorId,
      ]
    )
    return result.rows[0]
  })
  return { item: row }
})
