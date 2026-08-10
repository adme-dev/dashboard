import { describe, expect, it, vi } from 'vitest'

import {
  buildNeonLifecyclePlan,
  runNeonLifecycle
} from '../../scripts/crm-search/neon-lifecycle.mjs'

describe('CRM search guarded Neon lifecycle', () => {
  it('pins an exact schema-only TTL branch and operation polling plan', () => {
    const plan = buildNeonLifecyclePlan({
      projectId: 'project-preview-1',
      expectedProjectId: 'project-preview-1',
      parentBranchId: 'br-preview-parent',
      implementationSha: 'a'.repeat(40),
      nowMs: Date.parse('2026-08-11T00:00:00.000Z')
    })
    expect(plan.create.branch).toMatchObject({
      name: `crm-search-e2e-${'a'.repeat(12)}`,
      parent_id: 'br-preview-parent',
      init_source: 'schema-only',
      expires_at: '2026-08-11T06:00:00.000Z'
    })
    expect(plan.pollOperations).toBe(true)
    expect(plan.assertEmptyTables).toEqual(expect.arrayContaining([
      'crm_people', 'crm_companies', 'crm_opportunities'
    ]))
    expect(plan.migrations).toEqual([350, 351, 352])
  })

  it('does not call an executor in dry-run mode', async () => {
    const execute = vi.fn()
    const result = await runNeonLifecycle({
      dryRun: true,
      plan: buildNeonLifecyclePlan({
        projectId: 'project-preview-1',
        expectedProjectId: 'project-preview-1',
        parentBranchId: 'br-preview-parent',
        implementationSha: 'a'.repeat(40),
        nowMs: Date.parse('2026-08-11T00:00:00.000Z')
      }),
      execute
    })
    expect(result).toMatchObject({ dryRun: true, mutationCount: 0 })
    expect(execute).not.toHaveBeenCalled()
  })

  it('models one outer finally and always requests exact branch cleanup after failure', async () => {
    const calls: string[] = []
    const execute = vi.fn(async (step: { action: string }) => {
      calls.push(step.action)
      if (step.action === 'assert-empty') throw new Error('not_empty')
      if (step.action === 'create') return { branchId: 'br-created', operationIds: ['op-create'] }
      return { ok: true }
    })
    await expect(runNeonLifecycle({
      dryRun: false,
      allowMutationForTest: true,
      plan: buildNeonLifecyclePlan({
        projectId: 'project-preview-1',
        expectedProjectId: 'project-preview-1',
        parentBranchId: 'br-preview-parent',
        implementationSha: 'a'.repeat(40),
        nowMs: Date.parse('2026-08-11T00:00:00.000Z')
      }),
      execute
    })).rejects.toThrow('not_empty')
    expect(calls).toEqual(['create', 'poll', 'assert-empty', 'delete', 'poll'])
  })
})
