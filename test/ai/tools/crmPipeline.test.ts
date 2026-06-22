import { describe, it, expect, vi } from 'vitest'
import { getCrmPipeline, crmPipelineTool, type CrmPipelineDeps } from '~~/server/utils/ai/tools/crmPipeline'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const resolveClient = vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' })

describe('get_crm_pipeline', () => {
  it('maps stage ids to names and sorts stages by total desc', async () => {
    const deps: CrmPipelineDeps = {
      resolveClient,
      pipeline: vi.fn().mockResolvedValue({
        byStage: { s1: { count: 2, total: 100, weighted: 50 }, s2: { count: 5, total: 900, weighted: 400 } },
        openTotal: 1000, weightedTotal: 450,
      }),
      stages: vi.fn().mockResolvedValue({ items: [{ id: 's1', name: 'Lead' }, { id: 's2', name: 'Proposal' }] }),
    }
    const res = await getCrmPipeline({ clientName: 'Acme' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.openTotal).toBe(1000)
    expect(data.stages.map((s: any) => s.stage)).toEqual(['Proposal', 'Lead'])
    expect(data.stages[0]).toEqual({ stage: 'Proposal', count: 5, total: 900, weighted: 400 })
  })

  it('labels unknown stage ids as "Unknown"', async () => {
    const deps: CrmPipelineDeps = {
      resolveClient,
      pipeline: vi.fn().mockResolvedValue({ byStage: { sx: { count: 1, total: 10, weighted: 5 } }, openTotal: 10, weightedTotal: 5 }),
      stages: vi.fn().mockResolvedValue({ items: [] }),
    }
    const res = await getCrmPipeline({ clientName: 'Acme' }, ctx, deps)
    expect((res as any).data.stages[0].stage).toBe('Unknown')
  })

  it('fails without calling pipeline when the client is unknown', async () => {
    const pipeline = vi.fn()
    const deps: CrmPipelineDeps = { resolveClient: vi.fn().mockResolvedValue(null), pipeline, stages: vi.fn() }
    const res = await getCrmPipeline({ clientName: 'Nope' }, ctx, deps)
    expect(res.ok).toBe(false)
    expect(pipeline).not.toHaveBeenCalled()
  })

  it('is read-only and requires CLIENTS', () => {
    expect(crmPipelineTool.mutates).toBeUndefined()
    expect(crmPipelineTool.requiredPermission).toBe('CLIENTS')
  })
})
