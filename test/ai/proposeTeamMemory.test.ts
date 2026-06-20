import { describe, it, expect, vi } from 'vitest'
import { proposeTeamMemory, type TeamMemoryDeps } from '~~/server/utils/ai/tools/proposeTeamMemory'
import { makeTeamMemoryExecutor } from '~~/server/utils/ai/executors/proposeTeamMemory'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const mgr = { userId: 'u1', userRole: 'lead', conversationId: 'c1', event: { headers: {} } as any } as ToolContext
const junior = { ...mgr, userRole: 'creative' } as ToolContext

const deps = (over: Partial<TeamMemoryDeps> = {}): TeamMemoryDeps => ({
  resolveDepartments: async () => [{ id: 'dept-1', name: 'Media' }],
  propose: async () => 'prop-1',
  ...over,
})

describe('propose_team_memory (curation gate)', () => {
  it('a manager promotes a fact to their single department', async () => {
    const res: any = await proposeTeamMemory({ content: 'We report ROAS not CPA', memType: 'semantic' } as any, mgr, deps())
    expect(res.ok).toBe(true)
    expect(res.data.resolved).toEqual({ departmentId: 'dept-1', departmentName: 'Media', content: 'We report ROAS not CPA', memType: 'semantic' })
  })

  it('blocks non-management roles (only leads curate shared memory)', async () => {
    const res: any = await proposeTeamMemory({ content: 'x y z', memType: 'semantic' } as any, junior, deps())
    expect(res.ok).toBe(false)
  })

  it('disambiguates when the user belongs to several departments and gives no name', async () => {
    const propose = vi.fn()
    const res: any = await proposeTeamMemory({ content: 'shared fact', memType: 'semantic' } as any, mgr,
      deps({ resolveDepartments: async () => [{ id: 'd1', name: 'Media' }, { id: 'd2', name: 'Creative' }], propose }))
    expect(res.data.disambiguation.field).toBe('departmentName')
    expect(propose).not.toHaveBeenCalled()
  })

  it('picks the named department when several exist', async () => {
    const res: any = await proposeTeamMemory({ content: 'shared fact', memType: 'procedural', departmentName: 'Creative' } as any, mgr,
      deps({ resolveDepartments: async () => [{ id: 'd1', name: 'Media' }, { id: 'd2', name: 'Creative' }] }))
    expect(res.data.resolved.departmentId).toBe('d2')
  })

  it('fails when the user has no department', async () => {
    const res: any = await proposeTeamMemory({ content: 'shared fact', memType: 'semantic' } as any, mgr, deps({ resolveDepartments: async () => [] }))
    expect(res.ok).toBe(false)
  })
})

describe('team memory executor', () => {
  it('writes a department-scoped, explicit, curated memory crediting the confirmer', async () => {
    const save = vi.fn(async () => 'mem-9')
    const r = await makeTeamMemoryExecutor(save).execute({ departmentId: 'dept-1', departmentName: 'Media', content: 'We report ROAS', memType: 'semantic' }, mgr)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', scope: 'department', scopeRef: 'dept-1', source: 'explicit', memType: 'semantic',
    }))
    expect(r.resultRef).toBe('mem-9')
    expect(r.summary).toContain('Media')
  })

  it('is MANAGEMENT-gated at confirm time (executor requiredPermission)', () => {
    expect(makeTeamMemoryExecutor().requiredPermission).toBe('MANAGEMENT')
  })
})
