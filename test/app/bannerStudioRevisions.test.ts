import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { BannerProject } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const fetchMock = vi.fn()
vi.stubGlobal('$fetch', fetchMock)
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
const project = (id = 'one') => ({ id, name: id, canvasData: { mrec: { layers: [] } } }) as BannerProject

describe('Banner Studio revisions', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    useBannerStudio().loadProject(project())
  })
  it('keeps edits made during a save dirty', async () => {
    let finish!: () => void
    fetchMock.mockImplementation(() => new Promise<void>((r) => {
      finish = r
    }))
    const studio = useBannerStudio()
    const layer = studio.addLayer({ type: 'text', text: 'First' })
    const saving = studio.saveProject()
    studio.updateLayer(layer.id, { text: 'Second' })
    finish()
    await saving
    expect(studio.state.isDirty).toBe(true)
    expect(fetchMock.mock.calls[0][1].body.canvasData.mrec.layers[0].text).toBe('First')
  })
  it('does not clear a different project when the previous save completes', async () => {
    let finish!: () => void
    fetchMock.mockImplementation(() => new Promise<void>((r) => {
      finish = r
    }))
    const studio = useBannerStudio()
    studio.addLayer({ type: 'text', text: 'First' })
    const saving = studio.saveProject()
    studio.loadProject(project('two'))
    studio.addLayer({ type: 'text', text: 'Other' })
    finish()
    await saving
    expect(studio.state.isDirty).toBe(true)
  })
  it('applies and undoes a multi-format proposal as one revision', async () => {
    fetchMock.mockResolvedValue({})
    const studio = useBannerStudio()
    studio.addLayer({ type: 'text', text: 'Original' })
    const original = studio.getCanvasData()
    const proposed = structuredClone(original)
    proposed.mrec.layers[0].text = 'Revised'
    proposed.fb_sq = { layers: [] }
    studio.applyAssistantCanvas(proposed)
    expect(studio.state.setKeys).toEqual(['mrec', 'fb_sq'])
    await studio.saveProject()
    expect(studio.state.isDirty).toBe(false)
    studio.undo()
    expect(studio.getCanvasData()).toEqual(original)
    expect(studio.state.isDirty).toBe(true)
    studio.redo()
    expect(studio.getCanvasData()).toEqual(proposed)
  })
  it('clears undo history and clipboard when switching clients/projects', () => {
    const studio = useBannerStudio()
    studio.addLayer({ type: 'text', text: 'Private text' })
    studio.copyLayer()
    studio.loadProject(project('other'))
    expect(studio.canUndo.value).toBe(false)
    expect(studio.state.clipboard).toBeNull()
    studio.undo()
    expect(studio.activeLayers.value).toEqual([])
  })
  it('undoes a layer edit on its original artboard after changing tabs', () => {
    const studio = useBannerStudio()
    studio.loadProject({ ...project(), canvasData: { mrec: { layers: [] }, fb_sq: { layers: [] } } })
    studio.addLayer({ type: 'text', text: 'MRec copy' })
    studio.setActiveArtboard('fb_sq')
    studio.undo()
    expect(studio.state.sets.mrec.layers).toEqual([])
  })
})
