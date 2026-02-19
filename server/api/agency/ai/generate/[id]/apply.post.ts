/**
 * Apply Generated Project
 * POST /api/agency/ai/generate/:id/apply
 *
 * Creates actual project and tasks from AI generation session
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface ApplyBody {
  modifications?: {
    name?: string
    description?: string
    budget?: number
    tasks?: Array<{
      id: string
      include: boolean
      name?: string
      estimatedHours?: number
    }>
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const sessionId = getRouterParam(event, 'id')

  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Session ID is required'
    })
  }

  const body = await readBody<ApplyBody>(event)

  try {
    // Get session
    const session = await queryOne(`
      SELECT * FROM ai_generation_sessions WHERE id = $1
    `, [sessionId])

    if (!session) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Generation session not found'
      })
    }

    if (session.status !== 'completed') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Session must be in completed status to apply'
      })
    }

    if (session.created_project_id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Project has already been created from this session'
      })
    }

    const generated = session.generated_project as any

    // Apply modifications
    const projectName = body.modifications?.name || generated.name
    const projectDescription = body.modifications?.description || generated.description
    const projectBudget = body.modifications?.budget || generated.estimatedBudget

    // Get default status
    const defaultStatus = await queryOne(`
      SELECT id FROM project_statuses WHERE is_default = true LIMIT 1
    `, [])

    // Create project
    const project = await queryOne(`
      INSERT INTO projects (
        name,
        description,
        client_id,
        status_id,
        project_type,
        budget,
        start_date,
        due_date,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      projectName,
      projectDescription,
      session.client_id,
      defaultStatus?.id || null,
      generated.projectType || 'fixed',
      projectBudget,
      generated.startDate,
      generated.endDate,
      user.id
    ])

    // Get default task status
    const defaultTaskStatus = await queryOne(`
      SELECT id FROM task_statuses WHERE is_default = true LIMIT 1
    `, [])

    // Create tasks
    const taskModifications = body.modifications?.tasks || []
    const createdTasks: any[] = []

    for (const task of generated.tasks || []) {
      // Check if task should be included
      const modification = taskModifications.find(m => m.id === task.id)
      if (modification && !modification.include) {
        continue
      }

      // Apply modifications
      const taskName = modification?.name || task.name
      const taskHours = modification?.estimatedHours || task.estimatedHours

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
        project.id,
        taskName,
        task.rationale || null,
        defaultTaskStatus?.id || null,
        taskHours,
        task.priority || 'normal',
        user.id
      ])

      createdTasks.push(createdTask)
    }

    // Update session
    await queryOne(`
      UPDATE ai_generation_sessions
      SET
        status = 'applied',
        created_project_id = $1,
        applied_at = NOW(),
        applied_by = $2,
        user_modifications = $3
      WHERE id = $4
    `, [
      project.id,
      user.id,
      body.modifications ? JSON.stringify(body.modifications) : null,
      sessionId
    ])

    return {
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        clientId: project.client_id,
        budget: project.budget,
        startDate: project.start_date,
        dueDate: project.due_date,
        createdAt: project.created_at
      },
      tasksCreated: createdTasks.length,
      tasks: createdTasks.map(t => ({
        id: t.id,
        name: t.name,
        estimatedHours: t.estimated_hours,
        priority: t.priority
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to apply generated project:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to apply generated project'
    })
  }
})
