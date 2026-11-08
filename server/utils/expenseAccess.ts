import { createError, type H3Event } from 'h3'
import { assertFinancePermission } from './financeAccess'
import { queryOneFresh } from './db'

/** Finance authority is fresh; a denial leaves only the authenticated user's own expense scope. */
export async function hasExpenseFinancePermission(event: H3Event, userId: string, write = false): Promise<boolean> {
  try {
    await assertFinancePermission(event, userId, write)
    return true
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 403) throw error
    return false
  }
}

/** Own-expense entry remains available to active writable staff, never to a read-only role. */
export async function assertExpenseOwnWritePermission(userId: string): Promise<void> {
  let policy: { allowed: boolean } | null
  try {
    policy = await queryOneFresh<{ allowed: boolean }>(`SELECT TRUE AS allowed
      FROM team_members tm JOIN custom_roles cr ON (
        (tm.custom_role_id IS NOT NULL AND cr.id = tm.custom_role_id)
        OR (tm.custom_role_id IS NULL AND cr.is_system = TRUE AND cr.slug = tm.user_role::text))
      WHERE tm.id = $1 AND tm.is_active = TRUE AND cr.is_read_only = FALSE
        AND tm.user_role::text NOT IN ('viewer', 'guest') LIMIT 1`, [userId])
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Expense permission verification unavailable' })
  }
  if (policy?.allowed !== true) throw createError({ statusCode: 403, statusMessage: 'Writable staff access required' })
}

/** Check fresh ownership before any receipt, report, or detailed expense query. */
export async function assertExpenseRowAccess(id: string, userId: string, finance: boolean) {
  const row = await queryOneFresh(`SELECT id, user_id, status, project_id, client_id, task_id FROM expenses WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Expense not found' })
  if (!finance && row.user_id !== userId) throw createError({ statusCode: 403, statusMessage: 'Expense access denied' })
  return row
}

/** Do not let a self-submitted expense combine unrelated client, project, and task records. */
export async function assertExpenseReferences(refs: { clientId?: string | null, projectId?: string | null, taskId?: string | null }) {
  if (refs.projectId && refs.clientId) {
    const project = await queryOneFresh('SELECT id FROM projects WHERE id = $1 AND client_id = $2', [refs.projectId, refs.clientId])
    if (!project) throw createError({ statusCode: 403, statusMessage: 'Expense project does not belong to its client' })
  }
  if (refs.taskId && (refs.projectId || refs.clientId)) {
    const task = await queryOneFresh(`SELECT t.id FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.id = $1 AND ($2::uuid IS NULL OR t.project_id = $2)
        AND ($3::uuid IS NULL OR p.client_id = $3)`, [refs.taskId, refs.projectId || null, refs.clientId || null])
    if (!task) throw createError({ statusCode: 403, statusMessage: 'Expense task does not belong to its project or client' })
  }
}
