import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { BannerProject, Layer } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')

function setup() {
  const studio = useBannerStudio()
  const image = { id: 1, linkId: 'car', type: 'image', name: 'Vehicle', src: '/old.png', x: 30, y: 40, w: 200, h: 100, rotation: 20, opacity: 1, zIndex: 2, startTime: 1, endTime: 5, imageCrop: { x: 0.2, y: 0.1, w: 0.5, h: 0.8 }, keyframes: { x: [{ time: 1, value: -50 }, { time: 2, value: 0 }] } } as Layer
  studio.loadProject({ id: 'test', name: 'GEELY', canvasData: { mrec: { layers: [image] }, fb_story: { layers: [{ ...image, id: 2, w: 400, h: 500 }] } } } as BannerProject)
  studio.selectLayer(1)
  return studio
}
describe('image replacement and crop history', () => {
  it('replaces linked sources and clears stale crops while retaining layout geometry and animation', () => {
    const studio = setup()
    const before = JSON.stringify(studio.state.sets)
    studio.updateLayer(1, { src: '/new.png', imageCrop: undefined, fit: 'contain' })
    for (const board of Object.values(studio.state.sets)) {
      expect(board.layers[0]).toMatchObject({ src: '/new.png', x: 30, y: 40, rotation: 20, startTime: 1, endTime: 5 })
      expect(board.layers[0]!.imageCrop).toBeUndefined()
      expect(board.layers[0]!.keyframes!.x).toEqual([{ time: 1, value: -50 }, { time: 2, value: 0 }])
    }
    expect(studio.state.sets.fb_story!.layers[0]).toMatchObject({ w: 400, h: 500 })
    studio.undo()
    expect(JSON.stringify(studio.state.sets)).toBe(before)
    studio.redo()
    expect(studio.state.sets.fb_story!.layers[0]!.src).toBe('/new.png')
  })
  it('keeps crop edits local and undoes them without affecting the source image', () => {
    const studio = setup()
    const other = JSON.stringify(studio.state.sets.fb_story)
    const old = { ...studio.selectedLayer.value!.imageCrop! }
    studio.updateLayer(1, { imageCrop: { x: 0, y: 0, w: 0.4, h: 0.4 } })
    expect(JSON.stringify(studio.state.sets.fb_story)).toBe(other)
    expect(studio.selectedLayer.value!.src).toBe('/old.png')
    studio.undo()
    expect(studio.selectedLayer.value!.imageCrop).toEqual(old)
  })
})
