import { computed, reactive, ref } from 'vue'
import { expect, it, vi } from 'vitest'
import type { BannerProject, Layer } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')

it('orders the current slide including shared layers and handles imported ties in a single undo step', () => {
  const studio = useBannerStudio()
  function layer(id: number, zIndex: number, props: Partial<Layer>) {
    return { id, zIndex, name: String(id), type: 'image', startTime: 0, endTime: 6, ...props }
  }
  studio.loadProject({ id: 'slide-order', canvasData: { mrec: {
    slides: [{ id: 'a', name: 'First', duration: 3 }, { id: 'b', name: 'Second', duration: 3 }],
    layers: [
      layer(1, 1, { slideId: 'a', locked: true }), layer(2, 2, { clipToPresence: true, endTime: 3 }),
      layer(3, 2, { slideId: 'a', hidden: true }), layer(4, 8, { slideId: 'b' }),
      layer(5, 0, { type: 'bg' }), layer(6, 99, { slideTransitionFor: 'a' })
    ]
  } } } as BannerProject)
  const ids = () => studio.slideLayers.value.map(layer => layer.id)
  expect(ids()).toEqual([3, 2, 1, 5])
  studio.moveSlideLayer(1, 3)
  studio.moveSlideLayer(3, 4)
  expect(ids()).toEqual([3, 2, 1, 5])
  studio.moveSlideLayer(2, 3)
  expect(ids()).toEqual([2, 3, 1, 5])
  expect(studio.activeLayers.value.find(layer => layer.id === 4)?.zIndex).toBe(8)
  studio.undo()
  expect(ids()).toEqual([3, 2, 1, 5])
  studio.redo()
  expect(ids()).toEqual([2, 3, 1, 5])
  studio.state.currentTime = 3
  expect(ids()).toEqual([4, 5])
})
