import { describe, it, expect, vi } from 'vitest'
import { proposalToTaskBody } from '~~/server/utils/ai/tools/createTask'
import { executeProposal, type PendingActionDb, type PendingRow } from '~~/server/utils/ai/pendingActions'

describe('proposalToTaskBody', () => {
  it('maps a resolved proposal to the /api/agency/tasks body (nulls → undefined)', () => {
    const body = proposalToTaskBody(
      { title: 'Follow up', departmentId: 'd1', projectId: 'p1', assigneeId: 'm1', dueDate: '2026-06-10', description: 'note' },
      'reporter-1',
    )
    expect(body).toEqual({
      departmentId: 'd1', title: 'Follow up', projectId: 'p1', assigneeId: 'm1',
      dueDate: '2026-06-10', description: 'note', reporterId: 'reporter-1',
    })
  })

  it('omits optional fields that are null', () => {
    const body = proposalToTaskBody({ title: 'X', departmentId: 'd1', projectId: null, assigneeId: null, dueDate: null, description: null }, 'r1')
    expect(body.projectId).toBeUndefined()
    expect(body.assigneeId).toBeUndefined()
    expect(body.dueDate).toBeUndefined()
    expect(body.reporterId).toBe('r1')
  })
})

describe('confirm flow (executeProposal wired with the real mapper)', () => {
  it('claims the proposal, posts the mapped body to the task endpoint, idempotently', async () => {
    const row: PendingRow = {
      id: 'p1', status: 'proposed', tool_name: 'create_task', user_id: 'u1',
      resolved_payload: { title: 'Ship it', departmentId: 'd1', assigneeId: 'm1', assigneeName: 'Sam', projectId: null, dueDate: null, description: null },
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }
    let claimed = false
    const endpoint = vi.fn().mockResolvedValue({ id: 'task-99' })
    const db: PendingActionDb = {
      claim: async (id, userId) => {
        if (claimed || id !== 'p1' || userId !== 'u1') return null
        claimed = true
        return row
      },
      createTask: async (payload) => endpoint(proposalToTaskBody(payload, 'u1')),
      markExecuted: vi.fn().mockResolvedValue(undefined),
    }
    const ctx = { userId: 'u1', userRole: 'account_manager', conversationId: 'c1', event: {} as any }
    const first = await executeProposal('p1', ctx as any, db)
    const second = await executeProposal('p1', ctx as any, db)

    expect(first.ok).toBe(true)
    expect((first as any).data.taskId).toBe('task-99')
    expect(endpoint).toHaveBeenCalledTimes(1)
    expect(endpoint).toHaveBeenCalledWith(expect.objectContaining({ departmentId: 'd1', title: 'Ship it', assigneeId: 'm1', reporterId: 'u1' }))
    expect(second.ok).toBe(false) // idempotent
  })
})
