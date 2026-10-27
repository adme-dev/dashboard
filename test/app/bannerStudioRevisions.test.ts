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

describe('Saved artwork proposal revisions', () => {
  it('retains the returned saved revision without overwriting newer in-flight edits', async () => {
    let finish!: (value: unknown) => void
    fetchMock.mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const studio = useBannerStudio()
    studio.loadProject({ ...project('revision'), updatedAt: '2026-10-26T00:00:00.000Z' })
    const layer = studio.addLayer({ type: 'text', text: 'First' })
    const saving = studio.saveProject()
    studio.updateLayer(layer.id, { text: 'Second' })
    finish({ ...project('revision'), updatedAt: '2026-10-26T00:01:00.000Z' })
    await saving
    expect(studio.state.project?.updatedAt).toBe('2026-10-26T00:01:00.000Z')
    expect(studio.activeLayers.value[0]?.text).toBe('Second')
    expect(studio.state.isDirty).toBe(true)
  })

  it('does not attach the previous save revision after switching projects', async () => {
    let finish!: (value: unknown) => void
    fetchMock.mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const studio = useBannerStudio()
    studio.loadProject({ ...project('first'), updatedAt: '2026-10-26T00:00:00.000Z' })
    const saving = studio.saveProject()
    studio.loadProject({ ...project('second'), updatedAt: '2026-10-25T00:00:00.000Z' })
    finish({ ...project('first'), updatedAt: '2026-10-26T00:01:00.000Z' })
    await saving
    expect(studio.state.project?.updatedAt).toBe('2026-10-25T00:00:00.000Z')
  })

  it('rolls back a failed grouped edit and retains its prior selection and undo/redo', () => {
    const studio = useBannerStudio()
    studio.loadProject(project('atomic'))
    const first = studio.addLayer({ type: 'text', text: 'Original' })
    studio.updateLayer(first.id, { text: 'Other' })
    studio.undo()
    studio.selectLayer(first.id)
    const before = studio.getCanvasData()
    const dirty = studio.state.isDirty
    expect(() => studio.withCanvasUndo(() => {
      studio.updateLayer(first.id, { hidden: true })
      studio.addLayer({ type: 'image', src: '/partial.png' })
      throw new Error('incomplete replacement')
    })).toThrow('incomplete replacement')
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.state.selectedLayerId).toBe(first.id)
    expect(studio.state.isDirty).toBe(dirty)
    expect(studio.canRedo.value).toBe(true)
    studio.redo()
    expect(studio.activeLayers.value[0]?.text).toBe('Other')
  })
  it('invalidates raster-reference recipe after manual native type edits and restores it on undo', () => {
    const studio = useBannerStudio()
    studio.loadProject(project('recipe'))
    const layer = studio.addLayer({ type: 'text', text: 'Original', fontSize: 40 })
    const recipe = { version: 1, mode: 'native', wording: 'Original', instruction: 'Bold', reference: '/original.png', sourceRevision: 'revision', proposal: {} }
    studio.updateLayer(layer.id, { letteringRecipe: recipe as never })
    const sendLayerUpdate = vi.fn()
    vi.stubGlobal('useBannerRealtime', () => ({ sendLayerUpdate }))
    studio.updateLayer(layer.id, { fontSize: 60 })
    expect(sendLayerUpdate).toHaveBeenLastCalledWith(layer.id, 'mrec', { fontSize: 60, letteringRecipe: null })
    expect(studio.activeLayers.value[0]?.letteringRecipe).toBeUndefined()
    studio.undo()
    expect(studio.activeLayers.value[0]?.letteringRecipe).toEqual(recipe)
    studio.updateLayer(layer.id, { x: 40 })
    expect(studio.activeLayers.value[0]?.letteringRecipe).toEqual(recipe)
  })
})
