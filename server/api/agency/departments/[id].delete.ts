/**
 * Delete/Deactivate Department
 * DELETE /api/agency/departments/:id
 *
 * Soft-deletes (deactivates) a department. Departments with active tasks cannot be deleted.
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  // Only admins and owners can delete departments
  await requireRole(event, ['owner', 'admin'])

  const departmentId = getRouterParam(event, 'id')

  if (!departmentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Department ID is required'
    })
  }

  try {
    // Check if department exists
    const department = await queryOne(
      `SELECT id, name, is_active FROM departments WHERE id = $1`,
      [departmentId]
    )

    if (!department) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Department not found'
      })
    }

    // Check for active tasks in this department
    const activeTasks = await queryRows(`
      SELECT t.id, t.title
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.department_id = $1 AND ts.is_final = false
      LIMIT 5
    `, [departmentId])

    if (activeTasks.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot delete department with active tasks. Please complete or reassign the following tasks first: ${activeTasks.map(t => t.title).join(', ')}`
      })
    }

    // Check query param for hard delete vs soft delete
    const query = getQuery(event)
    const hardDelete = query.hard === 'true'

    if (hardDelete) {
      // Hard delete - only if no tasks at all
      const taskCount = await queryOne(
        `SELECT COUNT(*) as count FROM tasks WHERE department_id = $1`,
        [departmentId]
      )

      if (Number(taskCount?.count) > 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Cannot permanently delete department with task history. Use soft delete instead.'
        })
      }

      // Also check for team member assignments
      const memberCount = await queryOne(
        `SELECT COUNT(*) as count FROM department_members WHERE department_id = $1`,
        [departmentId]
      )

      if (Number(memberCount?.count) > 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Cannot permanently delete department with member assignments. Remove members first or use soft delete.'
        })
      }

      await queryOne(
        `DELETE FROM departments WHERE id = $1 RETURNING id`,
        [departmentId]
      )

      return {
        success: true,
        message: 'Department permanently deleted',
        deleted: true
      }
    } else {
      // Soft delete - deactivate the department
      await queryOne(`
        UPDATE departments
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `, [departmentId])

      return {
        success: true,
        message: 'Department deactivated successfully',
        deactivated: true
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete department:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete department'
    })
  }
})
