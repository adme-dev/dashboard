// test/ai/mcpBannerRunner.test.ts
import { describe, it, expect, vi } from 'vitest'
import { dispatchBannerConfirm, type BannerConfirmDeps } from '~~/server/utils/ai/mcp/bannerRunner'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'creative', event: {} as any }
const payload = { projectId: 'p1', format: 'mrec', fps: 30, quality: 1 as const }

function deps(over: Partial<BannerConfirmDeps> = {}): BannerConfirmDeps {
  return {
    loadLayers: vi.fn().mockResolvedValue({ layers: [{ id: 'l1' }], width: 300, height: 250 }),
    buildHtml: vi.fn().mockReturnValue('<div>banner</div>'),
    enqueue: vi.fn().mockResolvedValue({ jobIds: ['job1'] }),
    ...over,
  }
}

describe('dispatchBannerConfirm', () => {
  it('loads layers, builds HTML (format first), enqueues, returns jobIds', async () => {
    const d = deps()
    const r = await dispatchBannerConfirm(payload, ctx, d)
    expect(r.ok).toBe(true)
    expect((r as any).data.jobIds).toEqual(['job1'])
    expect((d.loadLayers as any).mock.calls[0]).toEqual(['p1', 'mrec'])
    expect((d.buildHtml as any).mock.calls[0][0]).toBe('mrec')             // format FIRST
    expect((d.buildHtml as any).mock.calls[0][1]).toEqual([{ id: 'l1' }])  // then layers
    const enqArg = (d.enqueue as any).mock.calls[0][0]
    expect(enqArg).toMatchObject({ projectId: 'p1', fps: 30, quality: 1, userId: 'u1' })
    expect(enqArg.formats[0]).toMatchObject({ key: 'mrec', html: '<div>banner</div>', width: 300, height: 250 })
  })
  it('fails gracefully (no enqueue) when the project/format cannot load', async () => {
    const d = deps({ loadLayers: vi.fn().mockRejectedValue(new Error('no format')) })
    const r = await dispatchBannerConfirm(payload, ctx, d)
    expect(r.ok).toBe(false)
    expect(d.enqueue).not.toHaveBeenCalled()
  })
})
