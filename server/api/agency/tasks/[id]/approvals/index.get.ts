/**
 * Get approval status for a task
 */

import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
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

    // Get active approval for task
    const approval = await queryOne(`
      SELECT
        ta.*,
        aw.name as workflow_name,
        aw.description as workflow_description,
        requestor.name as requestor_name
      FROM task_approvals ta
      JOIN approval_workflows aw ON ta.workflow_id = aw.id
      LEFT JOIN team_members requestor ON ta.requested_by = requestor.id
      WHERE ta.task_id = $1
      ORDER BY ta.created_at DESC
      LIMIT 1
    `, [id])

    if (!approval) {
      return { approval: null, message: 'No approval workflow for this task' }
    }

    // Get workflow steps with response status
    const steps = await queryRows(`
      SELECT
        aws.id as step_id,
        aws.step_number,
        aws.step_name,
        aws.approver_role,
        aws.is_required,
        tar.id as response_id,
        tar.status as response_status,
        tar.comment as response_comment,
        tar.responded_at,
        responder.id as responder_id,
        responder.name as responder_name
      FROM approval_workflow_steps aws
      LEFT JOIN task_approval_responses tar ON aws.id = tar.step_id AND tar.approval_id = $1
      LEFT JOIN team_members responder ON tar.responder_id = responder.id
      WHERE aws.workflow_id = $2
      ORDER BY aws.step_number
    `, [approval.id, approval.workflow_id])

    // Calculate overall progress
    const requiredSteps = steps.filter(s => s.is_required)
    const approvedRequiredSteps = requiredSteps.filter(s => s.response_status === 'approved')
    const rejectedSteps = steps.filter(s => s.response_status === 'rejected')

    return {
      approval: {
        id: approval.id,
        taskId: approval.task_id,
        workflowId: approval.workflow_id,
        workflowName: approval.workflow_name,
        workflowDescription: approval.workflow_description,
        status: approval.status,
        currentStepNumber: approval.current_step_number,
        requestedBy: approval.requested_by ? {
          id: approval.requested_by,
          name: approval.requestor_name,
        } : null,
        createdAt: approval.created_at,
        completedAt: approval.completed_at,
        steps: steps.map(s => ({
          stepId: s.step_id,
          stepNumber: s.step_number,
          stepName: s.step_name,
          approverRole: s.approver_role,
          isRequired: s.is_required,
          response: s.response_id ? {
            id: s.response_id,
            status: s.response_status,
            comment: s.response_comment,
            respondedAt: s.responded_at,
            responder: s.responder_id ? {
              id: s.responder_id,
              name: s.responder_name,
            } : null,
          } : null,
        })),
        progress: {
          totalSteps: steps.length,
          completedSteps: steps.filter(s => s.response_status).length,
          requiredSteps: requiredSteps.length,
          approvedRequiredSteps: approvedRequiredSteps.length,
          hasRejection: rejectedSteps.length > 0,
        },
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch task approvals:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch task approvals'
    })
  }
})
