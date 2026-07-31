import { getRouterParam } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

const Body = z.object({
  taskId: z.string().uuid()
})

interface OpportunityRow {
  id: string
  client_id: string
  lifecycle_status: string
  task_id: string | null
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const opportunityId = String(getRouterParam(event, 'id') || '')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A valid task ID is required'
    })
  }

  const opportunity = await queryOne<OpportunityRow>(
    `SELECT id, client_id, lifecycle_status, task_id
     FROM search_authority_opportunities
     WHERE id = $1
     LIMIT 1`,
    [opportunityId]
  )
  if (!opportunity) {
    throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  }
  await requireAgencySearchAuthorityAccess(event, opportunity.client_id)

  if (opportunity.lifecycle_status !== 'accepted' || opportunity.task_id) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Only an accepted opportunity without a task can be linked'
    })
  }

  const task = await queryOne<{ id: string, title: string }>(
    `SELECT task.id, task.title
     FROM tasks task
     JOIN projects project ON project.id = task.project_id
     WHERE task.id = $1
       AND project.client_id = $2
     LIMIT 1`,
    [parsed.data.taskId, opportunity.client_id]
  )
  if (!task) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  }

  const updated = await execute(
    `UPDATE search_authority_opportunities
     SET task_id = $3,
         lifecycle_status = 'task_created',
         updated_at = NOW()
     WHERE id = $1
       AND client_id = $2
       AND lifecycle_status = 'accepted'
       AND task_id IS NULL`,
    [opportunityId, opportunity.client_id, task.id]
  )
  if (updated !== 1) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The opportunity changed before the task could be linked'
    })
  }

  return {
    ok: true,
    opportunityId,
    task,
    status: 'task_created'
  }
})
