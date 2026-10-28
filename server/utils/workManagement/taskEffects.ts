/**
 * Post-commit fan-out for task mutations, shared by the browser routes and the marketing
 * department MCP services so both paths trigger the same board events, subscriber
 * notifications, automations, lifecycle guard, chat bridge and brief-completion proposal.
 * Callers invoke these only after their own transaction has committed.
 */
import type { H3Event } from 'h3'
import { notifyTaskStatusChanged } from '~~/server/utils/notifications'
import { emitBoardEvent } from '~~/server/utils/boardEvents'
import { notifyBoardSubscribers } from '~~/server/utils/boardNotifications'
import { evaluateAutomations } from '~~/server/utils/automationEngine'
import { evaluateLifecycleTransition } from '~~/server/utils/automation/lifecycleGuard'
import { enqueue } from '~~/server/utils/queue'
import { postBoardEventToChat } from '~~/server/utils/boardChatBridge'
import { maybeProposeBriefCompletion } from '~~/server/utils/briefConversion/completionAlert'
import { runCappedBeforeResponse } from '~~/server/utils/asyncBackground'

export interface TaskStatusChangeEffects {
  task: {
    id: string
    title: string
    department_id: string | null
    project_id: string | null
    assignee_id: string | null
    reporter_id: string | null
    status_id: string
    old_status_name: string
  }
  newStatus: { id: string, name: string, is_final: boolean | null }
  actorUserId: string
}

export function dispatchTaskStatusChangeEffects(event: H3Event, input: TaskStatusChangeEffects): void {
  const { task: currentTask, newStatus, actorUserId } = input
  const id = currentTask.id
  // Emit board event for real-time updates
  if (currentTask.department_id) {
    const boardId = currentTask.department_id
    const statusChanges = {
      oldStatusId: currentTask.status_id,
      oldStatusName: currentTask.old_status_name,
      newStatusId: newStatus.id,
      newStatusName: newStatus.name
    }

    emitBoardEvent({
      boardId,
      type: 'status_changed',
      taskId: id,
      userId: actorUserId,
      changes: statusChanges
    }, event)

    const boardEvent = {
      boardId,
      type: 'status_changed',
      taskId: id,
      actorId: actorUserId,
      changes: statusChanges
    }

    // Notify board subscribers (queued with retry, fallback to fire-and-forget)
    enqueue(event, 'board.notify', boardEvent, () => notifyBoardSubscribers(boardEvent))

    // Evaluate board automations (queued with retry, fallback to fire-and-forget)
    enqueue(event, 'board.automate', boardEvent, () => evaluateAutomations(boardId, boardEvent))

    // A.3 lifecycle guard: observe the transition; raise an A.1 escalation for 🟡 gate
    // stages. Read-only to task state (never moves the task) — cannot double-fire vs the
    // engine above. Inert on generic statuses. (queued with retry, fire-and-forget fallback)
    enqueue(event, 'lifecycle.evaluate', boardEvent, async () => {
      await evaluateLifecycleTransition(boardEvent)
    })

    // Post to linked chat channels (fire-and-forget)
    postBoardEventToChat({
      ...boardEvent,
      taskTitle: currentTask.title
    }).catch(() => {})
  }

  // Notify watchers about status change (assignee, reporter, and anyone who has interacted)
  const watcherIds = new Set<string>()
  if (currentTask.assignee_id && currentTask.assignee_id !== actorUserId) {
    watcherIds.add(currentTask.assignee_id)
  }
  if (currentTask.reporter_id && currentTask.reporter_id !== actorUserId) {
    watcherIds.add(currentTask.reporter_id)
  }

  if (watcherIds.size > 0) {
    notifyTaskStatusChanged(
      id,
      currentTask.title,
      currentTask.old_status_name,
      newStatus.name,
      actorUserId,
      Array.from(watcherIds)
    ).catch(err => console.error('Failed to send status change notification:', err))
  }

  // G6: when a task reaches a final status, propose completing the brief this project came
  // from — only if every task is now done. AI-proposes / human-confirms, never auto-completes.
  if (newStatus.is_final && currentTask.project_id) {
    maybeProposeBriefCompletion({ projectId: currentTask.project_id, actorId: actorUserId })
      .catch(err => console.error('[Brief] completion proposal failed:', err))
  }
}

export interface TaskFieldUpdateEffects {
  boardId: string
  taskId: string
  taskTitle: string
  actorUserId: string
  changes: Record<string, unknown>
}

/** Board fan-out for edited task fields (the `task_updated` event family). */
export async function dispatchTaskFieldUpdateEffects(event: H3Event, input: TaskFieldUpdateEffects): Promise<void> {
  emitBoardEvent({
    boardId: input.boardId,
    type: 'task_updated',
    taskId: input.taskId,
    changes: input.changes
  }, event)

  const boardEvent = {
    boardId: input.boardId,
    type: 'task_updated',
    taskId: input.taskId,
    actorId: input.actorUserId,
    changes: input.changes
  }

  // Notify board subscribers (queued with retry, fallback to fire-and-forget)
  enqueue(event, 'board.notify', boardEvent, () => notifyBoardSubscribers(boardEvent))

  // Evaluate board automations (queued with retry, fallback to fire-and-forget)
  enqueue(event, 'board.automate', boardEvent, () => evaluateAutomations(input.boardId, boardEvent))

  // Post to linked chat channels (in-request, capped so it can't stall the response)
  await runCappedBeforeResponse(postBoardEventToChat({
    ...boardEvent,
    taskTitle: input.taskTitle
  }), 'postBoardEventToChat')
}
