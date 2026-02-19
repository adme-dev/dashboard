/**
 * Delete/Archive Project
 * DELETE /api/agency/projects/:id
 *
 * Archives or permanently deletes a project.
 * Projects with time entries are archived (status = 'cancelled'), not deleted.
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Only admins and owners can delete projects
  await requireRole(event, ['owner', 'admin'])

  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required'
    })
  }

  try {
    // Check if project exists
    const project = await queryOne(
      `SELECT id, name, status, client_id FROM projects WHERE id = $1`,
      [projectId]
    )

    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found'
      })
    }

    // Check for related data
    const [timeEntries, tasks, expenses] = await Promise.all([
      queryOne(`SELECT COUNT(*) as count FROM time_entries WHERE project_id = $1`, [projectId]),
      queryOne(`SELECT COUNT(*) as count FROM tasks WHERE project_id = $1`, [projectId]),
      queryOne(`SELECT COUNT(*) as count FROM project_expenses WHERE project_id = $1`, [projectId])
    ])

    const hasTimeEntries = Number(timeEntries?.count) > 0
    const hasTasks = Number(tasks?.count) > 0
    const hasExpenses = Number(expenses?.count) > 0
    const hasRelatedData = hasTimeEntries || hasTasks || hasExpenses

    // Check query param for hard delete vs archive
    const query = getQuery(event)
    const hardDelete = query.hard === 'true'

    if (hardDelete && hasRelatedData) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot permanently delete project with existing data (${
          [
            hasTimeEntries ? 'time entries' : '',
            hasTasks ? 'tasks' : '',
            hasExpenses ? 'expenses' : ''
          ].filter(Boolean).join(', ')
        }). Use archive instead.`
      })
    }

    if (hardDelete && !hasRelatedData) {
      // Hard delete - only if no related data
      await queryOne(
        `DELETE FROM projects WHERE id = $1 RETURNING id`,
        [projectId]
      )

      return {
        success: true,
        message: 'Project permanently deleted',
        deleted: true
      }
    } else {
      // Archive - change status to cancelled
      await queryOne(`
        UPDATE projects
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `, [projectId])

      return {
        success: true,
        message: 'Project archived successfully',
        archived: true,
        previousStatus: project.status
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete project:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete project'
    })
  }
})
