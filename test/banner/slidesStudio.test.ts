import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { BannerProject, Layer } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
const scene = (id: number, start: number, end: number) => ({ id, type: 'text', name: 'Heading', text: 'Adventure starts here', x: 1, y: 2, w: 100, h: 50, opacity: 1, zIndex: 1, startTime: start, endTime: end, clipToPresence: true, keyframes: { opacity: [{ time: start, value: 1 }, { time: end, value: 1 }] } } as Layer)
const studio = useBannerStudio()
beforeEach(() => {
  vi.stubGlobal('useBannerRealtime', () => ({ remoteUsers: ref([]) }))
  studio.loadProject({ id: 'slides', name: 'Sequence', canvasData: {
    custom_300x250: { playback: { duration: 10, loopCount: 0 }, layers: [scene(1, 0, 6), scene(2, 6, 10)] },
    custom_1080x1920: { playback: { duration: 10, loopCount: 0 }, layers: [scene(3, 0, 6), scene(4, 6, 10)] }
  } } as BannerProject)
  studio.state.currentTime = 7
})

describe('designer slide workflow', () => {
  it('applies all-layout slide edits atomically with one undo and redo, including save/reload', async () => {
    const original = studio.getCanvasData()
    studio.changeSlides({ type: 'duplicate', index: 0, id: 'new-copy' })
    const edited = studio.getCanvasData()
    expect(studio.activeSlides.value.map(slide => slide.duration)).toEqual([6, 6, 4])
    expect(edited.custom_1080x1920!.layers.filter(layer => layer.slideId === 'new-copy')).toHaveLength(1)
    studio.undo()
    expect(studio.getCanvasData()).toEqual(original)
    expect(studio.canUndo.value).toBe(false)
    studio.redo()
    expect(studio.getCanvasData()).toEqual(edited)
    const fetch = vi.fn(async () => ({}))
    vi.stubGlobal('$fetch', fetch)
    await studio.saveProject()
    const saved = fetch.mock.calls[0] as unknown as [string, { body: { canvasData: unknown } }]
    expect(saved[1].body.canvasData).toEqual(edited)
    expect(studio.state.isDirty).toBe(false)
    studio.loadProject({ id: 'slides', name: 'Reloaded', canvasData: saved[1].body.canvasData } as BannerProject)
    expect(studio.getCanvasData()).toEqual(edited)
    expect(studio.activeSlides.value.map(slide => slide.duration)).toEqual([6, 6, 4])
  })
  it('isolates single-layout edits and rejects incompatible all-layout edits without partial changes', () => {
    studio.setLayoutView('single')
    studio.changeSlides({ type: 'duration', index: 0, duration: 2 })
    expect(studio.state.sets.custom_1080x1920!.playback!.duration).toBe(10)
    studio.setLayoutView('all')
    const before = studio.getCanvasData()
    expect(() => studio.changeSlides({ type: 'delete', index: 0 })).toThrow('different slide sequences')
    expect(studio.getCanvasData()).toEqual(before)
  })
  it('puts new elements and pasted artwork on the chosen scene instead of at time zero', () => {
    const layer = studio.addLayer({ type: 'text', name: 'New text', text: 'RSVP now' })
    expect(layer).toMatchObject({ slideId: 'slide-2', startTime: 6, endTime: 10, clipToPresence: true })
    const preset = studio.addLayer({ type: 'text', name: 'Preset', startTime: 0.5, endTime: 3, animInDur: 0.5 })
    expect(preset).toMatchObject({ slideId: 'slide-2', startTime: 6.5, endTime: 9 })
    studio.selectLayer(1)
    studio.copyLayer()
    const pasted = studio.pasteLayer()!
    expect(Number.isFinite(pasted.id)).toBe(true)
    expect(pasted.startTime).toBeGreaterThanOrEqual(6)
    expect(pasted.endTime).toBeLessThanOrEqual(10)
    expect(pasted.keyframes!.opacity!.every(frame => frame.time >= 6 && frame.time <= 10)).toBe(true)
  })
  it('retains scene metadata, looping and transition dimensions when adding and syncing a layout', () => {
    studio.changeSlides({ type: 'transition', index: 0, duration: 0.5 })
    studio.addSizeToSet('custom_600x500')
    expect(studio.state.sets.custom_600x500!.slides).toEqual(studio.state.sets.custom_300x250!.slides)
    expect(studio.state.sets.custom_600x500!.playback!.loopCount).toBe(0)
    expect(studio.state.sets.custom_600x500!.layers.find(layer => layer.slideTransitionFor)).toMatchObject({ w: 600, h: 500 })
    studio.syncAllFromActive()
    expect(studio.state.sets.custom_1080x1920!.slides).toHaveLength(2)
  })
  it('does not allow structural changes while another designer is actively editing', () => {
    vi.stubGlobal('useBannerRealtime', () => ({ remoteUsers: ref([{ userId: 'another-designer' }]) }))
    const before = studio.getCanvasData()
    expect(() => studio.changeSlides({ type: 'move', index: 0, to: 1 })).toThrow('Another designer')
    expect(studio.getCanvasData()).toEqual(before)
  })
})

it('retains inferred boundaries when moving the last owned object to all slides, and undoes the operation', () => {
  const before = studio.getCanvasData()
  studio.setLayerSlide(1, null)
  expect(studio.activeSlides.value.map(slide => slide.duration)).toEqual([6, 4])
  expect(studio.activeLayers.value.find(layer => layer.id === 1)).toMatchObject({ startTime: 0, endTime: 10, clipToPresence: false })
  studio.undo()
  expect(studio.getCanvasData()).toEqual(before)
})

it('bounds property edits to the assigned scene and keeps all retimed frames inside it', () => {
  studio.updateLayer(2, { startTime: 0, endTime: 300 })
  const layer = studio.activeLayers.value.find(layer => layer.id === 2)!
  expect(layer.startTime).toBe(6)
  expect(layer.endTime).toBe(10)
  expect(layer.keyframes!.opacity!.every(frame => frame.time >= 6 && frame.time <= 10)).toBe(true)
  expect(studio.activeSlides.value.map(slide => slide.duration)).toEqual([6, 4])
  studio.updateLayer(2, { keyframes: { x: [{ time: -2, value: 0 }, { time: 100, value: 10 }] } })
  expect(studio.activeLayers.value.find(layer => layer.id === 2)!.keyframes!.x!.map(frame => frame.time)).toEqual([6, 10])
})

it('syncs duplicated scene artwork without reusing layer identities, and scales animated offsets for new layouts', () => {
  studio.updateLayer(1, { keyframes: { x: [{ time: 0, value: -100 }, { time: 6, value: 100 }] } })
  studio.changeSlides({ type: 'duplicate', index: 0, id: 'copy' })
  studio.syncAllFromActive()
  for (const board of Object.values(studio.state.sets)) expect(new Set(board.layers.map(layer => layer.id)).size).toBe(board.layers.length)
  studio.addSizeToSet('custom_600x500')
  const frames = studio.state.sets.custom_600x500!.layers[0]!.keyframes!.x!
  expect(frames.map(frame => frame.value)).toEqual([-200, 200])
  expect(frames.map(frame => frame.time)).toEqual([0, 6])
})

it('rejects a linked slide assignment atomically when another layout has no corresponding scene', () => {
  studio.activeLayers.value.find(layer => layer.id === 1)!.linkId = 'shared-heading'
  studio.state.sets.custom_1080x1920!.layers = [scene(3, 0, 10)]
  studio.state.sets.custom_1080x1920!.layers[0]!.linkId = 'shared-heading'
  const before = studio.getCanvasData()
  expect(() => studio.setLayerSlide(1, 'slide-2')).toThrow('missing this slide')
  expect(studio.getCanvasData()).toEqual(before)
})
