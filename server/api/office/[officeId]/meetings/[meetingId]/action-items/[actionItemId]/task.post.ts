/**
 * POST /api/office/:officeId/meetings/:meetingId/action-items/:actionItemId/task
 * Converts a structured meeting follow-up action into an agency task.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, transaction } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { ensureOfficeMeetingThreadChannel } from '~~/server/utils/officeThreads'
import type { OfficeMeetingActionItemRow, OfficeMemberRow } from '~~/app/types/office'

type ActionItemWithMeeting = OfficeMeetingActionItemRow & {
  meeting_title: string
}

const Body = z.object({
  department_id: z.string().uuid().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium')
})

function taskDescription(actionItem: ActionItemWithMeeting) {
  return [
    `Source: Office meeting "${actionItem.meeting_title}"`,
    '',
    actionItem.content,
    '',
    `Meeting ID: ${actionItem.meeting_session_id}`,
    `Action item ID: ${actionItem.id}`,
    actionItem.source_artifact_id ? `Artifact ID: ${actionItem.source_artifact_id}` : null
  ].filter(Boolean).join('\n')
}

function taskThreadContent(actionItem: ActionItemWithMeeting, task: { id: string }) {
  return [
    `Created task from follow-up: ${actionItem.content}`,
    `/agency/tasks/${task.id}`
  ].join('\n')
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const meetingId = getRouterParam(event, 'meetingId')
  const actionItemId = getRouterParam(event, 'actionItemId')

  if (!officeId || !meetingId || !actionItemId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId, meetingId and actionItemId are required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeMeetingArtifactsTables()
  const body = Body.parse(await readBody(event))
  const actionItem = await queryOne<ActionItemWithMeeting>(
    `SELECT omai.*, oms.title AS meeting_title
     FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     WHERE omai.id = $1
       AND omai.office_id = $2
       AND omai.meeting_session_id = $3
       AND oms.office_id = $2`,
    [actionItemId, officeId, meetingId]
  )
  if (!actionItem) {
    throw createError({ statusCode: 404, statusMessage: 'Action item not found' })
  }

  if (actionItem.task_id) {
    const task = await queryOne(
      `SELECT id, title, department_id, assignee_id, due_date
       FROM tasks
       WHERE id = $1`,
      [actionItem.task_id]
    )
    return { actionItem, task, created: false }
  }

  const department = await queryOne<{ id: string }>(
    `SELECT COALESCE($1::uuid, assignee.department_id, reporter.department_id) AS id
     FROM team_members reporter
     LEFT JOIN team_members assignee ON assignee.id = $2
     WHERE reporter.id = $3`,
    [
      body.department_id ?? null,
      actionItem.assignee_user_id,
      user.id
    ]
  )
  if (!department?.id) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a department before creating a task' })
  }

  const defaultStatus = await queryOne<{ id: string }>(
    `SELECT id
     FROM task_statuses
     WHERE (department_id IS NULL OR department_id = $1)
       AND is_default = true
     ORDER BY department_id NULLS LAST
     LIMIT 1`,
    [department.id]
  )
  if (!defaultStatus?.id) {
    throw createError({ statusCode: 400, statusMessage: 'No valid status found for this department' })
  }

  const result = await transaction(async (client) => {
    const taskResult = await client.query(
      `INSERT INTO tasks (
         department_id, status_id, title, description, priority, task_type,
         assignee_id, reporter_id, due_date
       )
       VALUES ($1, $2, $3, $4, $5, 'task', $6, $7, $8)
       RETURNING id, title, department_id, assignee_id, due_date`,
      [
        department.id,
        defaultStatus.id,
        actionItem.content.slice(0, 255),
        taskDescription(actionItem),
        body.priority,
        actionItem.assignee_user_id,
        user.id,
        actionItem.due_at ? actionItem.due_at.slice(0, 10) : null
      ]
    )
    const task = taskResult.rows[0]

    const actionItemResult = await client.query(
      `UPDATE office_meeting_action_items
       SET task_id = $1,
           status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
           metadata = metadata || $2::jsonb,
           updated_at = now()
       WHERE id = $3
         AND office_id = $4
         AND meeting_session_id = $5
       RETURNING *`,
      [
        task.id,
        JSON.stringify({
          task_id: task.id,
          task_created_at: new Date().toISOString(),
          task_created_by: user.id
        }),
        actionItem.id,
        officeId,
        meetingId
      ]
    )

    await client.query(
      `INSERT INTO task_activities (task_id, user_id, activity_type, content)
       VALUES ($1, $2, 'created', $3)`,
      [
        task.id,
        user.id,
        `Created from office meeting action "${actionItem.content.slice(0, 120)}"`
      ]
    )

    return {
      task,
      actionItem: actionItemResult.rows[0]
    }
  })

  try {
    const channel = await ensureOfficeMeetingThreadChannel({ officeId, meetingId, actorId: user.id })
    if (channel) {
      await queryOne(
        `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          channel.id,
          user.id,
          taskThreadContent(actionItem, result.task),
          JSON.stringify({
            source: 'office_meeting_action_item',
            event: 'task_created',
            meeting_id: meetingId,
            action_item_id: actionItem.id,
            task_id: result.task.id,
            department_id: result.task.department_id,
            assignee_id: result.task.assignee_id
          })
        ]
      )
    }
  } catch (error) {
    console.warn('[office-action-item-task] could not write meeting thread event:', error)
  }

  return { ...result, created: true }
})
