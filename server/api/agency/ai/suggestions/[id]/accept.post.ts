/**
 * Accept Task Suggestions
 * POST /api/agency/ai/suggestions/:id/accept
 *
 * Creates tasks from accepted suggestions
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface AcceptBody {
  acceptedTaskIndices: number[] // Which tasks to accept (by index)
  rejectReason?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const suggestionId = getRouterParam(event, 'id')

  if (!suggestionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Suggestion ID is required'
    })
  }

  const body = await readBody<AcceptBody>(event)

  if (!body.acceptedTaskIndices || !Array.isArray(body.acceptedTaskIndices)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'acceptedTaskIndices array is required'
    })
  }

  try {
    // Get suggestion
    const suggestion = await queryOne(`
      SELECT * FROM ai_task_suggestions WHERE id = $1
    `, [suggestionId])

    if (!suggestion) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Suggestion not found'
      })
    }

    if (suggestion.status !== 'pending') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Suggestion has already been processed'
      })
    }

    const suggestedTasks = suggestion.suggested_tasks as any[]

    // Get default task status
    const defaultStatus = await queryOne(`
      SELECT id FROM task_statuses WHERE is_default = true LIMIT 1
    `, [])

    // Create accepted tasks
    const createdTaskIds: string[] = []
    const createdTasks: any[] = []

    for (const index of body.acceptedTaskIndices) {
      if (index < 0 || index >= suggestedTasks.length) {
        continue
      }

      const task = suggestedTasks[index]!

      const createdTask = await queryOne(`
        INSERT INTO tasks (
          project_id,
          name,
          description,
          status_id,
          estimated_hours,
          priority,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        suggestion.project_id,
        task.name,
        task.description || task.rationale,
        defaultStatus?.id || null,
        task.estimatedHours || 8,
        task.priority || 'normal',
        user.id
      ])

      createdTaskIds.push(createdTask.id)
      createdTasks.push(createdTask)
    }

    // Determine status
    const allAccepted = body.acceptedTaskIndices.length === suggestedTasks.length
    const noneAccepted = createdTaskIds.length === 0
    const status = noneAccepted ? 'rejected' : allAccepted ? 'accepted' : 'partial'

    // Update suggestion
    await queryOne(`
      UPDATE ai_task_suggestions
      SET
        status = $1,
        reviewed_by = $2,
        reviewed_at = NOW(),
        review_notes = $3,
        accepted_task_ids = $4
      WHERE id = $5
    `, [
      status,
      user.id,
      body.rejectReason || null,
      JSON.stringify(createdTaskIds),
      suggestionId
    ])

    return {
      success: true,
      status,
      tasksCreated: createdTasks.length,
      tasksRejected: suggestedTasks.length - createdTasks.length,
      tasks: createdTasks.map(t => ({
        id: t.id,
        name: t.name,
        estimatedHours: t.estimated_hours,
        priority: t.priority
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to accept suggestions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to accept suggestions'
    })
  }
})
