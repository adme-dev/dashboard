import { getRouterParam } from 'h3'
import { z } from 'zod'

import { requireAuth } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

const Body = z.object({ taskId: z.string().uuid() })
const FindingId = z.string().uuid()

export default eventHandler(async (event) => {
  await requireAuth(event)
  const findingId = FindingId.safeParse(String(getRouterParam(event, 'id') || ''))
  if (!findingId.success) throw createError({ statusCode: 400, statusMessage: 'A valid finding ID is required' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A valid task ID is required' })

  const finding = await queryOne<{ id: string, client_id: string, lifecycle_status: string, task_id: string | null }>(`
    SELECT id, client_id, lifecycle_status, task_id
    FROM search_authority_trust_findings
    WHERE id = $1
    LIMIT 1
  `, [findingId.data])
  if (!finding) throw createError({ statusCode: 404, statusMessage: 'Trust finding not found' })
  await requireAgencySearchAuthorityAccess(event, finding.client_id)
  if (finding.lifecycle_status !== 'open' || finding.task_id) {
    throw createError({ statusCode: 409, statusMessage: 'Only an open finding without a task can be linked' })
  }

  const task = await queryOne<{ id: string, title: string }>(`
    SELECT task.id, task.title
    FROM tasks task
    JOIN projects project ON project.id = task.project_id
    WHERE task.id = $1
      AND project.client_id = $2
    LIMIT 1
  `, [parsed.data.taskId, finding.client_id])
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })

  const updated = await execute(`
    UPDATE search_authority_trust_findings
    SET task_id = $3,
        lifecycle_status = 'actioned',
        updated_at = NOW()
    WHERE id = $1
      AND client_id = $2
      AND lifecycle_status = 'open'
      AND task_id IS NULL
  `, [findingId.data, finding.client_id, task.id])
  if (updated !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'The finding changed before the task could be linked' })
  }
  return { ok: true, findingId: findingId.data, task, status: 'actioned' }
})
