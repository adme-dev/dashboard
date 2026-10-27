import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'
import type { BannerProject } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('watch', watch)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 1000 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
const { useBannerCopyProposal } = await import('../../app/composables/useBannerCopyProposal')
const studio = useBannerStudio()
const fetcher = vi.fn()
const sourceRevision = '2026-10-27T00:00:00.000Z'
const project = () => ({ id: 'project-1', name: 'Letter', updatedAt: sourceRevision, canvasData: { custom_2480x3508: { layers: [
  { id: 1, type: 'text', name: 'Headline', text: 'WE’VE MOVED.', x: 10, y: 20, w: 900, h: 100, fontSize: 80, fontFamily: 'Arial', textStroke: '2px blue', zIndex: 1, opacity: 1 },
  { id: 2, type: 'text', name: 'Offer', text: '$500 off Subaru until 13 December 2026', x: 10, y: 150, w: 900, h: 100, zIndex: 2, opacity: 1 }
] } } } as BannerProject)
beforeEach(() => {
  studio.loadProject(project())
  studio.selectLayer(1)
  fetcher.mockReset()
})
describe('Selected copy proposal transaction', () => {
  it('previews without mutation, applies only the captured layer, and restores exact records with undo/redo', async () => {
    const api = useBannerCopyProposal(fetcher)
    const original = studio.getCanvasData()
    fetcher.mockResolvedValue({ sourceRevision, suggestions: [{ text: 'WELCOME TO OUR NEW HOME.', tone: 'inviting', charCount: 24 }], evidence: { provider: 'groq', model: 'test' } })
    api.instruction.value = 'Make it warmer'
    await api.generate()
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: expect.objectContaining({ sourceRevision }) }))
    api.preview(api.suggestions.value[0]!)
    expect(studio.canUndo.value).toBe(false)
    expect(studio.getCanvasData()).toEqual(original)
    expect(api.previewLayer.value?.text).toBe('WELCOME TO OUR NEW HOME.')
    expect(api.apply()).toBe(true)
    expect(studio.canUndo.value).toBe(true)
    expect(api.apply()).toBe(false)
    expect(studio.activeLayers.value[1]).toEqual(original.custom_2480x3508!.layers[1])
    expect(studio.activeLayers.value[0]).toMatchObject({ text: 'WELCOME TO OUR NEW HOME.', textStroke: '2px blue', x: 10 })
    studio.undo()
    expect(studio.canUndo.value).toBe(false)
    expect(studio.getCanvasData()).toEqual(original)
    studio.redo()
    expect(studio.activeLayers.value[0]?.text).toBe('WELCOME TO OUR NEW HOME.')
    api.dispose()
  })
  it.each(['selection', 'away-back', 'delete', 'edit', 'undo', 'project', 'saved-revision', 'unselected-edit', 'dirty'])('rejects pending responses after %s changes', async (change) => {
    const api = useBannerCopyProposal(fetcher)
    let resolve!: (v: unknown) => void
    fetcher.mockReturnValue(new Promise((r) => {
      resolve = r
    }))
    const pending = api.generate()
    if (change === 'selection') studio.selectLayer(2)
    if (change === 'away-back') {
      studio.selectLayer(2)
      studio.selectLayer(1)
    }
    if (change === 'delete') studio.removeLayer(1)
    if (change === 'edit' || change === 'undo') {
      studio.updateLayer(1, { x: 20 })
      if (change === 'undo') studio.undo()
    }
    if (change === 'saved-revision') studio.state.project!.updatedAt = '2026-10-27T00:01:00.000Z'
    if (change === 'unselected-edit') studio.updateLayer(2, { x: 100 })
    if (change === 'dirty') studio.state.isDirty = true
    if (change === 'project') studio.loadProject(project())
    const changed = studio.getCanvasData()
    resolve({ sourceRevision, suggestions: [{ text: 'Stale', tone: 'bold', charCount: 5 }] })
    await pending
    expect(api.suggestions.value).toEqual([])
    expect(api.apply()).toBe(false)
    expect(studio.getCanvasData()).toEqual(changed)
    api.dispose()
  })
  it('does not offer fabricated success on failure or accept changed commercial facts', async () => {
    studio.selectLayer(2)
    const api = useBannerCopyProposal(fetcher)
    fetcher.mockResolvedValue({ sourceRevision, suggestions: [{ text: '$700 off any car today', tone: 'bold', charCount: 22 }] })
    await api.generate()
    expect(api.suggestions.value).toEqual([])
    fetcher.mockRejectedValue(new Error('private upstream'))
    await api.generate()
    expect(api.error.value).toContain('protected')
    expect(api.error.value).not.toContain('private')
    api.dispose()
  })
  it('blocks copy rewrites on a text-bound feed instead of showing a misleading feed preview', async () => {
    studio.updateLayer(1, { feedBindings: [{ feedId: 'f', property: 'text', column: 'heading' }] })
    const api = useBannerCopyProposal(fetcher)
    await api.generate()
    expect(api.protectedCopy.value).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
    expect(api.apply()).toBe(false)
    api.dispose()
  })
  it('tells the operator to save when the saved source is stale', async () => {
    const api = useBannerCopyProposal(fetcher)
    fetcher.mockRejectedValue({ statusCode: 409 })
    await api.generate()
    expect(api.error.value).toContain('Save')
    expect(api.suggestions.value).toEqual([])
    api.dispose()
  })
  it.each(['missing-revision', 'dirty'])('requires saved clean artwork before requesting copy: %s', async (change) => {
    if (change === 'missing-revision') studio.state.project!.updatedAt = ''
    else studio.updateLayer(2, { x: 50 })
    const api = useBannerCopyProposal(fetcher)
    await api.generate()
    expect(fetcher).not.toHaveBeenCalled()
    expect(api.error.value).toContain('Save')
    api.dispose()
  })
  it.each([undefined, '2026-10-27T00:01:00.000Z'])('rejects response revision %s that does not match its saved source', async (revision) => {
    const api = useBannerCopyProposal(fetcher)
    fetcher.mockResolvedValue({ sourceRevision: revision, suggestions: [{ text: 'WELCOME HOME.', tone: 'warm', charCount: 13 }] })
    const original = studio.getCanvasData()
    await api.generate()
    expect(api.suggestions.value).toEqual([])
    expect(api.apply()).toBe(false)
    expect(studio.getCanvasData()).toEqual(original)
    api.dispose()
  })
})
