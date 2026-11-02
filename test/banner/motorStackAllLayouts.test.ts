import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { BannerAsset, BannerProject } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')

const asset = { id: 'car', name: 'Renault · Duster · White', url: '/car.webp', mimeType: 'image/webp' } as BannerAsset

describe('MotorStack image placement', () => {
  it('adds a linked, format-sized image to every canvas in one undo step from single edit view', () => {
    const studio = useBannerStudio()
    studio.loadProject({ id: 'motorstack-all', name: 'All layouts', canvasData: {
      mrec: { layers: [] },
      leader: { layers: [] },
      custom_1080x1920: { layers: [] }
    } } as BannerProject)
    studio.state.layoutView = 'single'
    expect(studio.addMotorStackImageToAllLayouts(asset)).toBe(3)
    const layers = studio.state.setKeys.map(key => studio.state.sets[key]!.layers[0]!)
    expect(layers.every(layer => layer.src === asset.url && layer.type === 'image' && layer.fit === 'contain')).toBe(true)
    expect(new Set(layers.map(layer => layer.linkId)).size).toBe(1)
    expect(new Set(layers.map(layer => layer.id)).size).toBe(3)
    expect(layers[0]!.w).not.toBe(layers[1]!.w)
    expect(layers[2]!.x + layers[2]!.w).toBeLessThanOrEqual(1080)
    expect(studio.state.selectedLayerId).toBe(layers[0]!.id)
    studio.undo()
    expect(studio.state.setKeys.every(key => studio.state.sets[key]!.layers.length === 0)).toBe(true)
    studio.redo()
    expect(studio.state.setKeys.every(key => studio.state.sets[key]!.layers.length === 1)).toBe(true)
  })

  it('places the image in the corresponding slide on each canvas without replacing existing layers', () => {
    const studio = useBannerStudio()
    studio.loadProject({ id: 'motorstack-slides', name: 'Slides', canvasData: {
      mrec: { slides: [{ id: 'small-1', name: 'Intro', duration: 3 }, { id: 'small-2', name: 'Offer', duration: 4 }], layers: [] },
      leader: { slides: [{ id: 'wide-1', name: 'Intro', duration: 2 }, { id: 'wide-2', name: 'Offer', duration: 5 }], layers: [{ id: 99, type: 'text', name: 'Keep me', text: 'Offer', x: 0, y: 0, w: 80, h: 20, zIndex: 1, opacity: 1, startTime: 0, endTime: 7 }] }
    } } as BannerProject)
    studio.state.currentTime = 4
    studio.addMotorStackImageToAllLayouts(asset)
    expect(studio.state.sets.mrec!.layers[0]).toMatchObject({ slideId: 'small-2', startTime: 3, endTime: 7, clipToPresence: true })
    expect(studio.state.sets.leader!.layers).toHaveLength(2)
    expect(studio.state.sets.leader!.layers[1]).toMatchObject({ slideId: 'wide-2', startTime: 2, endTime: 7, clipToPresence: true })
    studio.undo()
    expect(studio.state.sets.leader!.layers.map(layer => layer.name)).toEqual(['Keep me'])
  })
})
