import { describe, expect, it, vi } from 'vitest'

import { makeCreateSocialCaseTaskExecutor } from '~~/server/utils/ai/executors/socialInboxActions'

describe('create_social_case_task composite durability', () => {
  it('captures the created task before link failure so reconciliation never creates it again', async () => {
    const createTask = vi.fn().mockResolvedValue({ id: 'task-7' })
    const linkTask = vi.fn().mockRejectedValue(new Error('link response lost'))
    const recordProgress = vi.fn().mockResolvedValue(undefined)
    const executor = (makeCreateSocialCaseTaskExecutor as any)(createTask, linkTask)

    await expect(executor.execute({
      socialConversationId: 'conversation-7',
      clientId: '11111111-1111-4111-8111-111111111111',
      departmentId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      title: 'Handle escalation'
    }, {
      userId: '44444444-4444-4444-8444-444444444444',
      userRole: 'owner',
      event: {} as any
    }, {
      idempotencyKey: 'tool:stable',
      recordProgress
    })).rejects.toMatchObject({
      dispatchState: 'ambiguous',
      resultRef: 'task-7',
      executionMetadata: {
        compositePhase: 'task_created',
        taskId: 'task-7',
        socialConversationId: 'conversation-7'
      }
    })

    expect(createTask).toHaveBeenCalledTimes(1)
    expect(recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'task_created',
      resultReference: 'task-7'
    }))
    expect(linkTask).toHaveBeenCalledTimes(1)
  })
})
