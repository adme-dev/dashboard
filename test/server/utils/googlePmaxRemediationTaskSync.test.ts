import { describe, expect, it, vi } from 'vitest'
import {
  syncGooglePmaxRemediationTasks,
  type GooglePmaxRemediationTaskStore
} from '~~/server/utils/googlePmaxRemediationTaskSync'
import type { GooglePmaxRemediationTaskDraft } from '~~/server/utils/googlePmaxRemediationTasks'

const input = {
  launchId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  actorId: '33333333-3333-4333-8333-333333333333'
}

const drafts: GooglePmaxRemediationTaskDraft[] = [{
  taskKey: 'preflight:PMAX_STORE_CODE_MISMATCH',
  sourceCode: 'PMAX_STORE_CODE_MISMATCH',
  title: 'Resolve Google PMax blocker: Store code mismatch.',
  description: 'Correct the exact case-sensitive store code.',
  severity: 'blocker',
  execution: 'assisted',
  owner: 'platform'
}, {
  taskKey: 'preflight:PMAX_FEED_COUNT_DRIFT',
  sourceCode: 'PMAX_FEED_COUNT_DRIFT',
  title: 'Resolve Google PMax warning: Feed counts drift.',
  description: 'Wait for import or resolve rejects.',
  severity: 'advisory',
  execution: 'assisted',
  owner: 'platform'
}]

function store(projectId: string | null = '44444444-4444-4444-8444-444444444444') {
  const mappings = new Map<string, { taskId: string | null, status: 'open' | 'cleared' | 'superseded' }>()
  let taskSequence = 0
  const value: GooglePmaxRemediationTaskStore = {
    loadContext: vi.fn().mockResolvedValue({
      launchId: input.launchId,
      configVersion: 3,
      configHash: 'a'.repeat(64),
      briefId: '55555555-5555-4555-8555-555555555555',
      projectId,
      assigneeId: input.actorId,
      departmentId: '66666666-6666-4666-8666-666666666666',
      statusId: '77777777-7777-4777-8777-777777777777'
    }),
    listMappings: vi.fn().mockImplementation(async () => [...mappings.entries()].map(([taskKey, mapping]) => ({ taskKey, ...mapping }))),
    createTask: vi.fn().mockImplementation(async () => `task-${++taskSequence}`),
    reopenTask: vi.fn().mockResolvedValue(undefined),
    upsertMapping: vi.fn().mockImplementation(async (record) => {
      mappings.set(record.draft.taskKey, { taskId: record.taskId, status: 'open' })
    }),
    clearMissing: vi.fn().mockImplementation(async (_launchId, activeKeys) => {
      let cleared = 0
      for (const [taskKey, mapping] of mappings) {
        if (!activeKeys.includes(taskKey) && mapping.status === 'open') {
          mappings.set(taskKey, { ...mapping, status: 'cleared' })
          cleared++
        }
      }
      return cleared
    })
  }
  return value
}

describe('Google PMax remediation task synchronization', () => {
  it('creates each stable blocker task once and remains idempotent on rerun', async () => {
    const taskStore = store()

    const first = await syncGooglePmaxRemediationTasks({ ...input, drafts }, { store: taskStore })
    const second = await syncGooglePmaxRemediationTasks({ ...input, drafts }, { store: taskStore })

    expect(first).toMatchObject({ status: 'synced', created: 2, reopened: 0, cleared: 0 })
    expect(second).toMatchObject({ status: 'synced', created: 0, reopened: 0, cleared: 0 })
    expect(taskStore.createTask).toHaveBeenCalledTimes(2)
    expect(taskStore.upsertMapping).toHaveBeenCalledTimes(4)
  })

  it('clears no-longer-current mapping keys without deleting their audit or task records', async () => {
    const taskStore = store()
    await syncGooglePmaxRemediationTasks({ ...input, drafts }, { store: taskStore })

    const result = await syncGooglePmaxRemediationTasks({ ...input, drafts: [drafts[0]!] }, { store: taskStore })

    expect(result).toMatchObject({ status: 'synced', created: 0, cleared: 1 })
    expect(taskStore.clearMissing).toHaveBeenLastCalledWith(input.launchId, [drafts[0]!.taskKey])
  })

  it('reopens the existing task instead of duplicating it when a cleared blocker recurs', async () => {
    const taskStore = store()
    await syncGooglePmaxRemediationTasks({ ...input, drafts: [drafts[0]!] }, { store: taskStore })
    await syncGooglePmaxRemediationTasks({ ...input, drafts: [] }, { store: taskStore })

    const result = await syncGooglePmaxRemediationTasks({ ...input, drafts: [drafts[0]!] }, { store: taskStore })

    expect(result).toMatchObject({ status: 'synced', created: 0, reopened: 1, cleared: 0 })
    expect(taskStore.createTask).toHaveBeenCalledTimes(1)
    expect(taskStore.reopenTask).toHaveBeenCalledOnce()
  })

  it('rejects duplicate stable task keys before writing any tasks', async () => {
    const taskStore = store()

    await expect(syncGooglePmaxRemediationTasks({
      ...input,
      drafts: [drafts[0]!, { ...drafts[0]! }]
    }, { store: taskStore })).rejects.toThrow('PMAX_DUPLICATE_REMEDIATION_TASK_KEY')

    expect(taskStore.loadContext).not.toHaveBeenCalled()
    expect(taskStore.createTask).not.toHaveBeenCalled()
  })

  it('returns project_required without creating orphan tasks before brief conversion', async () => {
    const taskStore = store(null)

    const result = await syncGooglePmaxRemediationTasks({ ...input, drafts }, { store: taskStore })

    expect(result).toEqual({ status: 'project_required', created: 0, reopened: 0, cleared: 0 })
    expect(taskStore.createTask).not.toHaveBeenCalled()
  })
})
