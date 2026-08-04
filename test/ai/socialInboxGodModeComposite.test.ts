import { describe, expect, it, vi } from 'vitest'

import * as socialActions from '~~/server/utils/ai/executors/socialInboxActions'

const payload = {
  socialConversationId: 'conversation-7',
  clientId: '11111111-1111-4111-8111-111111111111',
  departmentId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  title: 'Handle escalation',
  description: 'Follow up with the customer.',
  priority: 'medium'
}

const ctx = {
  userId: '44444444-4444-4444-8444-444444444444',
  userRole: 'owner',
  event: {} as any
}

describe('create_social_case_task atomic durability', () => {
  it('does not depend on a composite progress checkpoint after moving create+link into one transaction', async () => {
    const atomicCreateAndLink = vi.fn().mockResolvedValue({ id: 'task-7' })
    const recordProgress = vi.fn().mockRejectedValue(new Error('checkpoint unavailable'))
    const executor = (socialActions.makeCreateSocialCaseTaskExecutor as any)(atomicCreateAndLink)

    const result = await executor.execute(payload, ctx, {
      idempotencyKey: 'tool:stable',
      recordProgress
    })

    expect(result).toMatchObject({ resultRef: 'task-7' })
    expect(executor.executionClass).toBe('local-transactional')
    expect(atomicCreateAndLink).toHaveBeenCalledTimes(1)
    expect(recordProgress).not.toHaveBeenCalled()
  })

  it('rolls task creation back on link failure and a retry commits exactly one linked task', async () => {
    const createAndLink = (socialActions as any).createAndLinkSocialCaseTask
    expect(createAndLink).toBeTypeOf('function')
    if (typeof createAndLink !== 'function') return

    const committed = {
      taskIds: [] as string[],
      linkedTaskId: null as string | null,
      subscriptions: [] as string[]
    }
    let failLink = true
    const transaction = async (callback: (db: { query: (sql: string, params?: unknown[]) => Promise<any> }) => Promise<any>) => {
      const draft = {
        taskIds: [...committed.taskIds],
        linkedTaskId: committed.linkedTaskId,
        subscriptions: [...committed.subscriptions]
      }
      const db = {
        query: vi.fn(async (sql: string, params: unknown[] = []) => {
          if (sql.includes('FROM social_conversations')) {
            return { rows: [{ id: 'conversation-7', client_id: payload.clientId, linked_task_id: draft.linkedTaskId }] }
          }
          if (sql.includes('FROM departments')) return { rows: [{ id: payload.departmentId }] }
          if (sql.includes('FROM projects')) return { rows: [{ id: payload.projectId }] }
          if (sql.includes('FROM task_statuses')) return { rows: [{ id: 'status-1' }] }
          if (sql.includes('INSERT INTO tasks')) {
            draft.taskIds.push('task-7')
            return { rows: [{ id: 'task-7', title: payload.title }] }
          }
          if (sql.includes('INSERT INTO task_activities')) return { rows: [], rowCount: 1 }
          if (sql.includes('SELECT auto_subscribe_on_participation')) {
            return { rows: [{ auto_subscribe_on_participation: true }] }
          }
          if (sql.includes('INSERT INTO board_subscriptions')) {
            draft.subscriptions.push(`${params[0]}:${params[1]}:${params[2]}`)
            return { rows: [], rowCount: 1 }
          }
          if (sql.includes('UPDATE social_conversations')) {
            if (failLink) throw new Error('link constraint failed')
            draft.linkedTaskId = 'task-7'
            return { rows: [{ client_id: payload.clientId, linked_task_id: 'task-7' }] }
          }
          if (sql.includes('INSERT INTO social_conversation_events')) return { rows: [{ id: 'event-1' }] }
          throw new Error(`Unexpected atomic social SQL: ${sql}`)
        })
      }
      const result = await callback(db)
      committed.taskIds = draft.taskIds
      committed.linkedTaskId = draft.linkedTaskId
      committed.subscriptions = draft.subscriptions
      return result
    }

    await expect(createAndLink(payload, ctx, { transaction })).rejects.toThrow('link constraint failed')
    expect(committed).toEqual({ taskIds: [], linkedTaskId: null, subscriptions: [] })

    failLink = false
    await expect(createAndLink(payload, ctx, { transaction })).resolves.toEqual({ id: 'task-7' })
    expect(committed).toEqual({
      taskIds: ['task-7'],
      linkedTaskId: 'task-7',
      subscriptions: [`${ctx.userId}:${payload.departmentId}:task-7`]
    })
  })

  it('uses the supplied God-mode transaction for the same creator auto-watch', async () => {
    const subscriptions: string[] = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM social_conversations')) {
          return { rows: [{ id: 'conversation-7', client_id: payload.clientId, linked_task_id: null }] }
        }
        if (sql.includes('FROM departments')) return { rows: [{ id: payload.departmentId }] }
        if (sql.includes('FROM projects')) return { rows: [{ id: payload.projectId }] }
        if (sql.includes('FROM task_statuses')) return { rows: [{ id: 'status-1' }] }
        if (sql.includes('INSERT INTO tasks')) return { rows: [{ id: 'task-7', title: payload.title }] }
        if (sql.includes('INSERT INTO task_activities')) return { rows: [], rowCount: 1 }
        if (sql.includes('SELECT auto_subscribe_on_participation')) {
          return { rows: [{ auto_subscribe_on_participation: true }] }
        }
        if (sql.includes('INSERT INTO board_subscriptions')) {
          subscriptions.push(`${params[0]}:${params[1]}:${params[2]}`)
          return { rows: [], rowCount: 1 }
        }
        if (sql.includes('UPDATE social_conversations')) return { rows: [{ id: 'conversation-7' }], rowCount: 1 }
        if (sql.includes('INSERT INTO social_conversation_events')) return { rows: [{ id: 'event-1' }] }
        throw new Error(`Unexpected God-mode social SQL: ${sql}`)
      })
    }

    await expect((socialActions as any).createAndLinkSocialCaseTask(payload, ctx, { db }))
      .resolves.toEqual({ id: 'task-7' })
    expect(subscriptions).toEqual([`${ctx.userId}:${payload.departmentId}:task-7`])
  })
})
