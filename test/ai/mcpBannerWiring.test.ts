import { describe, it, expect, vi } from 'vitest'
import { executeWriteConfirm, type ConfirmDeps } from '~~/server/utils/ai/mcp/writeTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'creative', event: {} as any }

function baseDeps(over: Partial<ConfirmDeps> = {}): ConfirmDeps {
  return {
    enabled: true,
    claim: vi.fn().mockResolvedValue({ tool_name: 'banner_render', resolved_payload: { projectId: 'p1', format: 'mrec', fps: 30, quality: 1 } }),
    getExecutor: vi.fn().mockReturnValue(null),
    ...over,
  }
}

describe('executeWriteConfirm — banner dispatch', () => {
  it('routes a claimed banner_render proposal to bannerDispatch', async () => {
    const bannerDispatch = vi.fn().mockResolvedValue({ ok: true, data: { jobIds: ['job1'] } })
    const r = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, baseDeps({ bannerDispatch }))
    expect(r.ok).toBe(true)
    expect((r as any).data.jobIds).toEqual(['job1'])
    expect(bannerDispatch).toHaveBeenCalled()
  })
  it('falls through (bannerDispatch returns null) for non-banner tool_names', async () => {
    const bannerDispatch = vi.fn().mockResolvedValue(null)
    const claim = vi.fn().mockResolvedValue({ tool_name: 'create_task', resolved_payload: {} })
    const r = await executeWriteConfirm({ proposalId: 'prop12345' }, ctx, baseDeps({ bannerDispatch, claim, writeEnabled: false }))
    // write group off + not banner → forbidden (the 2c path), proving fall-through past bannerDispatch
    expect(r.ok).toBe(false)
    expect((r as any).code).toBe('forbidden')
  })
})
