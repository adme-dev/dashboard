/**
 * Respond to an approval step (approve/reject)
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { notifyApprovalCompleted, notifyNextApprover } from '~~/server/utils/notifications'

interface ApprovalResponseBody {
  status: 'approved' | 'rejected'
  comment?: string
  responderId?: string
}

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'id')
  const stepId = getRouterParam(event, 'stepId')
  const body = await readBody<ApprovalResponseBody>(event)

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  if (!stepId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Step ID is required'
    })
  }

  if (!body.status || !['approved', 'rejected'].includes(body.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Status must be "approved" or "rejected"'
    })
  }

  try {
    // Get the current approval for the task
    const approval = await queryOne(`
      SELECT ta.*, aw.name as workflow_name
      FROM task_approvals ta
      JOIN approval_workflows aw ON ta.workflow_id = aw.id
      WHERE ta.task_id = $1 AND ta.status = 'pending'
      ORDER BY ta.created_at DESC
      LIMIT 1
    `, [taskId])

    if (!approval) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No pending approval found for this task'
      })
    }

    // Verify the step belongs to this workflow
    const step = await queryOne(`
      SELECT * FROM approval_workflow_steps
      WHERE id = $1 AND workflow_id = $2
    `, [stepId, approval.workflow_id])

    if (!step) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid step for this approval workflow'
      })
    }

    // Check if step is the current step
    if (step.step_number !== approval.current_step_number) {
      throw createError({
        statusCode: 400,
        statusMessage: `This step is not ready for approval. Current step is ${approval.current_step_number}`
      })
    }

    // Check if already responded to this step
    const existingResponse = await queryOne(`
      SELECT id FROM task_approval_responses
      WHERE approval_id = $1 AND step_id = $2
    `, [approval.id, stepId])

    if (existingResponse) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This step has already been responded to'
      })
    }

    const result = await transaction(async (client) => {
      // Create the response
      const responseResult = await client.query(`
        INSERT INTO task_approval_responses (approval_id, step_id, responder_id, status, comment, responded_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `, [approval.id, stepId, body.responderId || null, body.status, body.comment?.trim() || null])

      const response = responseResult.rows[0]

      // Log activity
      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content)
        VALUES ($1, $2, 'approval_response', $3)
      `, [
        taskId,
        body.responderId || null,
        `${body.status === 'approved' ? 'Approved' : 'Rejected'} at "${step.step_name}" step${body.comment ? `: ${body.comment}` : ''}`,
      ])

      // Update approval status based on response
      if (body.status === 'rejected') {
        // Rejection - mark approval as rejected
        await client.query(`
          UPDATE task_approvals
          SET status = 'rejected', completed_at = NOW()
          WHERE id = $1
        `, [approval.id])
      } else {
        // Approved - check if there are more steps
        const nextStepResult = await client.query(`
          SELECT * FROM approval_workflow_steps
          WHERE workflow_id = $1 AND step_number > $2
          ORDER BY step_number
          LIMIT 1
        `, [approval.workflow_id, step.step_number])

        if (nextStepResult.rows.length > 0) {
          // Move to next step
          await client.query(`
            UPDATE task_approvals
            SET current_step_number = $1
            WHERE id = $2
          `, [nextStepResult.rows[0].step_number, approval.id])
        } else {
          // All steps complete - mark as approved
          await client.query(`
            UPDATE task_approvals
            SET status = 'approved', completed_at = NOW()
            WHERE id = $1
          `, [approval.id])
        }
      }

      return response
    })

    // Get updated approval status
    const updatedApproval = await queryOne('SELECT * FROM task_approvals WHERE id = $1', [approval.id])

    // Get responder info
    let responder = null
    if (body.responderId) {
      responder = await queryOne('SELECT id, name, email FROM team_members WHERE id = $1', [body.responderId])
    }

    // Get task info for notifications
    const task = await queryOne('SELECT title, reporter_id FROM tasks WHERE id = $1', [taskId])

    // Send notifications (async, don't block response)
    if (body.responderId && task?.reporter_id) {
      // Notify task owner about the approval response
      notifyApprovalCompleted({
        taskId,
        taskTitle: task.title || 'Task',
        requesterId: task.reporter_id,
        responderId: body.responderId,
        stepName: step.step_name,
        status: body.status
      }).catch(err => console.error('Failed to send approval completion notification:', err))
    }

    // If approved and there's a next step, notify the next approver
    if (body.status === 'approved' && updatedApproval.status === 'pending') {
      const nextStep = await queryOne(`
        SELECT aws.*, aws.approver_id
        FROM approval_workflow_steps aws
        WHERE aws.workflow_id = $1 AND aws.step_number = $2
      `, [approval.workflow_id, updatedApproval.current_step_number])

      if (nextStep?.approver_id) {
        notifyNextApprover({
          taskId,
          taskTitle: task?.title || 'Task',
          approverId: nextStep.approver_id,
          stepName: nextStep.step_name
        }).catch(err => console.error('Failed to send next approver notification:', err))
      }
    }

    return {
      response: {
        id: result.id,
        approvalId: result.approval_id,
        stepId: result.step_id,
        stepName: step.step_name,
        status: result.status,
        comment: result.comment,
        respondedAt: result.responded_at,
        responder: responder ? {
          id: responder.id,
          name: responder.name,
          email: responder.email,
        } : null,
      },
      approval: {
        id: updatedApproval.id,
        status: updatedApproval.status,
        currentStepNumber: updatedApproval.current_step_number,
        completedAt: updatedApproval.completed_at,
      },
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to respond to approval:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to respond to approval'
    })
  }
})
