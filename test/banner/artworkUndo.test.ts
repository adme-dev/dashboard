import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { BannerProject, Layer } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')

describe('Artwork canvas edit history', () => {
  it('undoes and redoes artwork insertion and retained text visibility in one step, even with full history', () => {
    const studio = useBannerStudio()
    const text = { id: 1, name: 'Sunday', type: 'text', text: 'Open Sunday', x: 0, y: 0, w: 750, h: 40, opacity: 1, zIndex: 1, startTime: 0, endTime: 6 } as Layer
    studio.loadProject({ id: 'test', name: 'Undo trial', canvasData: { custom_1000x1000: { layers: [text] } } } as BannerProject)
    for (let i = 0; i < 55; i++) studio.updateLayer(1, { x: i })
    studio.withCanvasUndo(() => {
      studio.updateLayer(1, { hidden: true })
      studio.addLayer({ type: 'image', name: 'Sunday artwork', src: '/art.png', w: 750, h: 120, imageCrop: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 } })
    })
    studio.undo()
    expect(studio.activeLayers.value).toHaveLength(1)
    expect(studio.activeLayers.value[0]).toMatchObject({ type: 'text', x: 54 })
    expect(studio.activeLayers.value[0].hidden).not.toBe(true)
    studio.redo()
    expect(studio.activeLayers.value).toHaveLength(2)
    expect(studio.activeLayers.value[0].hidden).toBe(true)
    expect(studio.activeLayers.value[1].imageCrop).toEqual({ x: 0.1, y: 0.4, w: 0.8, h: 0.2 })
    studio.undo()
    studio.undo()
    expect(studio.activeLayers.value).toHaveLength(1)
    expect(studio.activeLayers.value[0].x).toBe(53)
  })
})
