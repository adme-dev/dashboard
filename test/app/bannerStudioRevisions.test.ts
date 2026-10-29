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
  it('updates linked content on every size while keeping its placement and timing', () => {
    const studio = useBannerStudio()
    const first = { id: 1, type: 'text', name: 'Offer', linkId: 'source:offer', text: 'Old', x: 20, y: 30, w: 200, h: 50, zIndex: 1, opacity: 1, startTime: 0, endTime: 4 }
    const second = { ...first, id: 2, x: 85, y: 120, w: 300, startTime: 1 }
    studio.loadProject({ ...project(), canvasData: { mrec: { layers: [first] }, fb_sq: { layers: [second] } } } as BannerProject)
    studio.updateLayer(1, { text: 'New offer', x: 40, startTime: 2 })
    expect(studio.state.sets.mrec.layers[0]).toMatchObject({ text: 'New offer', x: 40, startTime: 2 })
    expect(studio.state.sets.fb_sq.layers[0]).toMatchObject({ text: 'New offer', x: 85, y: 120, w: 300, startTime: 1 })
    studio.undo()
    expect(studio.state.sets.mrec.layers[0].text).toBe('Old')
    expect(studio.state.sets.fb_sq.layers[0].text).toBe('Old')
  })
  it('copies reactive text runs without sharing their mutable array across sizes', () => {
    const studio = useBannerStudio()
    const layer = { id: 1, type: 'text', name: 'Price', linkId: 'source:price', text: '$38,990', textRuns: [{ text: '$38,990' }], x: 0, y: 0, w: 100, h: 30, zIndex: 1, opacity: 1 }
    studio.loadProject({ ...project(), canvasData: { mrec: { layers: [layer] }, fb_sq: { layers: [{ ...layer, id: 2 }] } } } as BannerProject)
    const reactiveRuns = studio.state.sets.mrec.layers[0].textRuns
    studio.updateLayer(1, { textRuns: reactiveRuns })
    expect(studio.state.sets.fb_sq.layers[0].textRuns).toEqual([{ text: '$38,990' }])
    expect(studio.state.sets.fb_sq.layers[0].textRuns).not.toBe(reactiveRuns)
  })
  it('keeps duplicated layers independent of linked source content', () => {
    const studio = useBannerStudio()
    studio.loadProject({ ...project(), canvasData: { mrec: { layers: [{ id: 1, type: 'text', name: 'Offer', linkId: 'source:offer', text: 'Old', x: 0, y: 0, w: 100, h: 20, zIndex: 1, opacity: 1 }] } } } as BannerProject)
    expect(studio.duplicateLayer(1)?.linkId).toBeUndefined()
  })
})

it('single edit isolates linked content and undo follows the original scope', () => {
  const studio = useBannerStudio()
  const layer = { id: 1, type: 'text', name: 'Offer', linkId: 'source:offer', text: 'Original', x: 10, y: 10, w: 100, h: 30, zIndex: 1, opacity: 1 }
  studio.loadProject({ ...project(), canvasData: { mrec: { layers: [layer] }, fb_sq: { layers: [{ ...layer, id: 2 }] } } } as BannerProject)
  studio.setLayoutView('single', 'mrec')
  studio.updateLayer(1, { text: 'Square only' })
  expect(studio.state.sets.fb_sq.layers[0].text).toBe('Original')
  studio.setLayoutView('all')
  studio.undo()
  expect(studio.state.sets.mrec.layers[0].text).toBe('Original')
  studio.redo()
  expect(studio.state.sets.mrec.layers[0].text).toBe('Square only')
  expect(studio.state.sets.fb_sq.layers[0].text).toBe('Original')
  studio.updateLayer(1, { text: 'Shared offer' })
  expect(studio.state.sets.fb_sq.layers[0].text).toBe('Shared offer')
  studio.setLayoutView('single', 'fb_sq')
  studio.undo()
  expect(studio.state.sets.mrec.layers[0].text).toBe('Square only')
  expect(studio.state.sets.fb_sq.layers[0].text).toBe('Original')
})

it('overview selection retains zoom and changing mode never mutates the saved design', () => {
  const studio = useBannerStudio()
  studio.loadProject({ ...project(), canvasData: { mrec: { layers: [] }, fb_sq: { layers: [] } } })
  const original = studio.getCanvasData()
  studio.state.wsScale = 0.27
  studio.setActiveArtboard('fb_sq')
  expect(studio.state.wsScale).toBe(0.27)
  studio.setLayoutView('single')
  studio.setLayoutView('all')
  expect(studio.getCanvasData()).toEqual(original)
  expect(studio.state.isDirty).toBe(false)
  studio.setLayoutView('single', 'missing')
  expect(studio.state.layoutView).toBe('all')
})
