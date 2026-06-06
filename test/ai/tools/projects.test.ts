import { describe, it, expect, vi } from 'vitest'
import { getProjectStatus, type ProjectsDeps } from '~~/server/utils/ai/tools/projects'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any }

describe('get_project_status', () => {
  it('returns a disambiguation list when the name fuzzy-matches >1 project', async () => {
    const deps: ProjectsDeps = {
      findProjects: vi.fn().mockResolvedValue([
        { id: 'p1', name: 'Acme Rebrand', status: 'active', client: 'Acme Co', budget: 50000 },
        { id: 'p2', name: 'Acme Website', status: 'active', client: 'Acme Co', budget: 30000 },
      ]),
      taskRollup: vi.fn(),
    }
    const res = await getProjectStatus({ projectName: 'acme' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.disambiguation).toHaveLength(2)
    expect(data.disambiguation[0]).toEqual({ id: 'p1', name: 'Acme Rebrand', client: 'Acme Co' })
    // task rollup must NOT run when we can't pick a single project
    expect(deps.taskRollup).not.toHaveBeenCalled()
  })

  it('returns the compact status shape for a single match', async () => {
    const deps: ProjectsDeps = {
      findProjects: vi.fn().mockResolvedValue([
        { id: 'p1', name: 'Acme Rebrand', status: 'active', client: 'Acme Co', budget: 50000 },
      ]),
      taskRollup: vi.fn().mockResolvedValue({ total: 12 }),
    }
    const res = await getProjectStatus({ projectName: 'rebrand' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data).toEqual({
      name: 'Acme Rebrand',
      status: 'active',
      client: 'Acme Co',
      taskCount: 12,
      budget: 50000,
    })
    expect(deps.taskRollup).toHaveBeenCalledWith('p1', ctx)
  })

  it('returns a recoverable error (never throws) when the data source rejects', async () => {
    const deps: ProjectsDeps = {
      findProjects: vi.fn().mockRejectedValue(new Error('db down')),
      taskRollup: vi.fn(),
    }
    const res = await getProjectStatus({ projectName: 'acme' }, ctx, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/project/i)
  })
})
