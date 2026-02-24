/**
 * Board Automation Engine
 *
 * Evaluates board-level automation rules when board events fire.
 * Executes actions (send email, create notification, update column) when trigger conditions match.
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'

interface BoardEvent {
  boardId: string
  type: string           // 'task_updated', 'status_changed', 'cell_updated', 'task_created'
  taskId?: string
  columnId?: string
  actorId?: string
  changes?: Record<string, any>
}

interface BoardAutomation {
  id: string
  board_id: string
  name: string
  trigger_type: string
  trigger_config: Record<string, any>
  action_type: string
  action_config: Record<string, any>
}

/**
 * Evaluate all active automations for a board against a given event.
 * Fire-and-forget — errors are logged, never thrown.
 */
export async function evaluateAutomations(boardId: string, event: BoardEvent): Promise<void> {
  try {
    // Get all active automations for this board
    const automations = await queryRows<BoardAutomation>(`
      SELECT id, board_id, name, trigger_type, trigger_config, action_type, action_config
      FROM board_automations
      WHERE board_id = $1 AND is_active = true
    `, [boardId])

    if (automations.length === 0) return

    for (const automation of automations) {
      try {
        if (matchesTrigger(automation, event)) {
          await executeAction(automation, event)
        }
      } catch (err) {
        console.error(`[Automation] Failed to execute "${automation.name}":`, err)
      }
    }
  } catch (error) {
    console.error('[Automation] Failed to evaluate automations:', error)
  }
}

/**
 * Check if an event matches an automation's trigger conditions.
 */
function matchesTrigger(automation: BoardAutomation, event: BoardEvent): boolean {
  const { trigger_type, trigger_config } = automation

  switch (trigger_type) {
    case 'status_changed':
      if (event.type !== 'status_changed') return false
      // Check specific status transition if configured
      if (trigger_config.toStatus && event.changes?.newStatusName !== trigger_config.toStatus) return false
      if (trigger_config.fromStatus && event.changes?.oldStatusName !== trigger_config.fromStatus) return false
      if (trigger_config.toStatusId && event.changes?.newStatusId !== trigger_config.toStatusId) return false
      return true

    case 'item_created':
      return event.type === 'task_created'

    case 'column_changed':
      if (event.type !== 'cell_updated') return false
      if (trigger_config.columnId && event.columnId !== trigger_config.columnId) return false
      return true

    case 'date_arrived':
      // Date automations are handled by a cron job, not real-time events
      return false

    default:
      return false
  }
}

/**
 * Execute an automation's action.
 */
async function executeAction(automation: BoardAutomation, event: BoardEvent): Promise<void> {
  const { action_type, action_config } = automation

  // Get task details if available
  let task: any = null
  if (event.taskId) {
    task = await queryOne(`
      SELECT t.*,
        ts.name as status_name,
        assignee.name as assignee_name,
        assignee.email as assignee_email,
        assignee.id as assignee_id,
        creator.name as creator_name,
        creator.email as creator_email,
        creator.id as creator_id
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      LEFT JOIN team_members creator ON t.created_by = creator.id
      WHERE t.id = $1
    `, [event.taskId])
  }

  switch (action_type) {
    case 'send_email':
      await executeSendEmail(automation, event, task, action_config)
      break

    case 'create_notification':
      await executeCreateNotification(automation, event, task, action_config)
      break

    case 'update_column':
      await executeUpdateColumn(event, task, action_config)
      break

    default:
      console.warn(`[Automation] Unknown action type: ${action_type}`)
  }
}

/**
 * Send email action — sends an email to the configured recipient.
 */
async function executeSendEmail(
  automation: BoardAutomation,
  event: BoardEvent,
  task: any,
  config: Record<string, any>
): Promise<void> {
  const { sendBoardChangeEmail } = await import('~~/server/utils/email')

  // Determine recipient
  let recipientEmail = ''
  let recipientName = ''

  const toTarget = config.to || 'assignee'

  if (toTarget === 'assignee' && task?.assignee_email) {
    recipientEmail = task.assignee_email
    recipientName = task.assignee_name
  } else if (toTarget === 'creator' && task?.creator_email) {
    recipientEmail = task.creator_email
    recipientName = task.creator_name
  } else if (config.customEmail) {
    recipientEmail = config.customEmail
    recipientName = config.customName || 'User'
  }

  if (!recipientEmail) return

  // Resolve template variables
  const subject = resolveTemplateVars(config.subject || `[${automation.name}] ${task?.title || 'Board Update'}`, task, event)
  const body = resolveTemplateVars(config.body || '', task, event)

  // Get board name
  const board = await queryOne('SELECT name FROM departments WHERE id = $1', [event.boardId])

  await sendBoardChangeEmail({
    to: recipientEmail,
    name: recipientName,
    boardName: board?.name || 'Board',
    actorName: 'Automation',
    action: subject,
    itemTitle: task?.title,
    boardUrl: `${process.env.APP_URL || 'http://localhost:3000'}/agency/boards/${event.boardId}`,
    itemUrl: event.taskId
      ? `${process.env.APP_URL || 'http://localhost:3000'}/agency/boards/${event.boardId}?task=${event.taskId}`
      : undefined,
  })
}

/**
 * Create notification action — creates an in-app notification.
 */
async function executeCreateNotification(
  automation: BoardAutomation,
  event: BoardEvent,
  task: any,
  config: Record<string, any>
): Promise<void> {
  // Determine recipient(s)
  const recipientIds: string[] = []
  const toTarget = config.to || 'assignee'

  if (toTarget === 'assignee' && task?.assignee_id) {
    recipientIds.push(task.assignee_id)
  } else if (toTarget === 'creator' && task?.creator_id) {
    recipientIds.push(task.creator_id)
  }

  const title = resolveTemplateVars(config.title || automation.name, task, event)
  const message = resolveTemplateVars(config.message || `Automation "${automation.name}" triggered`, task, event)

  for (const userId of recipientIds) {
    await createNotification({
      userId,
      type: 'system',
      title,
      message,
      link: event.taskId ? `/agency/boards/${event.boardId}?task=${event.taskId}` : `/agency/boards/${event.boardId}`,
      metadata: {
        automationId: automation.id,
        automationName: automation.name,
        boardId: event.boardId,
        taskId: event.taskId,
      },
    })
  }
}

/**
 * Update column value action.
 */
async function executeUpdateColumn(
  event: BoardEvent,
  task: any,
  config: Record<string, any>
): Promise<void> {
  if (!event.taskId || !config.columnId) return

  const { queryOne: qo } = await import('~~/server/utils/db')

  await qo(`
    INSERT INTO task_column_values (task_id, column_id, text_value, number_value)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (task_id, column_id) DO UPDATE SET
      text_value = COALESCE($3, task_column_values.text_value),
      number_value = COALESCE($4, task_column_values.number_value),
      updated_at = NOW()
    RETURNING id
  `, [event.taskId, config.columnId, config.textValue || null, config.numberValue || null])
}

/**
 * Replace template variables in a string.
 * Supported: {item_name}, {assignee}, {status}, {board_name}, {due_date}
 */
function resolveTemplateVars(template: string, task: any, event: BoardEvent): string {
  if (!template) return template

  return template
    .replace(/\{item_name\}/g, task?.title || 'Unknown Item')
    .replace(/\{assignee\}/g, task?.assignee_name || 'Unassigned')
    .replace(/\{status\}/g, task?.status_name || event.changes?.newStatusName || 'Unknown')
    .replace(/\{board_name\}/g, event.boardId)
    .replace(/\{due_date\}/g, task?.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date')
}
