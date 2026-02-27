/**
 * Submit a task for approval
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { notifyApprovalRequest } from '~~/server/utils/notifications'

interface SubmitApprovalBody {
  workflowId: string
  requestedBy?: string
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<SubmitApprovalBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  if (!body.workflowId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Workflow ID is required'
    })
  }

  try {
    // Verify task exists
    const task = await queryOne('SELECT id, title FROM tasks WHERE id = $1', [id])
    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Verify workflow exists
    const workflow = await queryOne('SELECT * FROM approval_workflows WHERE id = $1 AND is_active = true', [body.workflowId])
    if (!workflow) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid or inactive workflow'
      })
    }

    // Check if task already has an active approval
    const existingApproval = await queryOne(`
      SELECT id FROM task_approvals
      WHERE task_id = $1 AND status = 'pending'
    `, [id])

    if (existingApproval) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Task already has a pending approval'
      })
    }

    // Get workflow steps
    const steps = await queryRows(`
      SELECT * FROM approval_workflow_steps
      WHERE workflow_id = $1
      ORDER BY step_order
    `, [body.workflowId])

    if (steps.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Workflow has no steps defined'
      })
    }

    const result = await transaction(async (client) => {
      // Create approval request — set current_step_id to first step
      const approvalResult = await client.query(`
        INSERT INTO task_approvals (task_id, workflow_id, current_step_id, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING *
      `, [id, body.workflowId, steps[0].id])

      const approval = approvalResult.rows[0]

      // Log activity
      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content)
        VALUES ($1, $2, 'approval_submitted', $3)
      `, [
        id,
        body.requestedBy || null,
        `Submitted for approval using "${workflow.name}" workflow`,
      ])

      return approval
    })

    // Notify approvers for the first step (based on role)
    const firstStep = steps[0]
    if (firstStep.approver_role) {
      // Find all users with the required role
      const approvers = await queryRows(`
        SELECT id FROM team_members
        WHERE role = $1 AND is_active = true
      `, [firstStep.approver_role])

      for (const approver of approvers) {
        notifyApprovalRequest({
          approverId: approver.id,
          taskId: id,
          taskTitle: task.title,
          requesterId: body.requestedBy || '',
          stepName: firstStep.name
        }).catch(err => console.error('Failed to send approval request notification:', err))
      }
    }

    return {
      id: result.id,
      taskId: result.task_id,
      workflowId: result.workflow_id,
      workflowName: workflow.name,
      status: result.status,
      currentStepId: result.current_step_id,
      createdAt: result.created_at,
      steps: steps.map(s => ({
        stepId: s.id,
        stepNumber: s.step_order,
        stepName: s.name,
        approverRole: s.approver_role,
        isRequired: !s.can_skip,
      })),
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to submit for approval:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to submit for approval'
    })
  }
})
