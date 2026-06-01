// server/api/crm/tasks/index.post.ts
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { TaskCreateInput } from '~~/server/utils/crm/tasks'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = TaskCreateInput.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const row = await queryOne(
    `INSERT INTO crm_tasks
       (client_id, target_type, target_id, title, description, task_type, priority, due_at, reminder_at, assigned_to, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      b.client_id, b.target_type, b.target_id, b.title, b.description ?? null,
      b.task_type, b.priority, b.due_at ?? null, b.reminder_at ?? null, b.assigned_to ?? null, user.id,
    ],
  )
  return { item: row }
})
