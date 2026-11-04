// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useBannerTimelineGroups } from '~/composables/useBannerTimelineGroups'
import { timelineRows } from '~/utils/banner-timeline-rows'
for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
const { useBannerStudio } = await import('~/composables/useBannerStudio')
let locked = false
beforeEach(() => { locked = false; vi.stubGlobal('useBannerStudio', useBannerStudio); vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: () => locked, sendLayerUpdate: vi.fn(), remoteUsers: Vue.ref([]) })) })
afterEach(() => vi.restoreAllMocks())
function setup() {
  const studio = useBannerStudio()
  studio.loadProject({ id: 'groups', canvasData: { mrec: { playback: { duration: 10, loopCount: 1 }, slides: [{ id: 'slide', name: 'Slide', duration: 10 }], layers: [1, 2, 3].map(id => ({ id, slideId: 'slide', type: 'image', name: `Image ${id}`, x: id * 10, y: 0, w: 100, h: 100, zIndex: id, opacity: 1, animIn: 'none', startTime: id, endTime: id + 2, keyframes: { opacity: [{ time: id, value: 1 }, { time: id + 2, value: 0 }] } })) } } } as any)
  return { studio, groups: useBannerTimelineGroups() }
}
it('groups, collapses and ungroups layers without flattening artwork, with atomic undo', () => {
  const { studio, groups } = setup()
  const id = groups.groupLayers([1, 2])!
  expect(id).toBeTruthy()
  expect(studio.activeLayers.value[0]!.x).toBe(10)
  const rows = timelineRows(studio.activeLayers.value)
  expect(rows.map(row => row.kind)).toEqual(['layer', 'group', 'layer', 'layer'])
  expect(timelineRows(studio.activeLayers.value, new Set([id])).map(row => row.kind)).toEqual(['layer', 'group'])
  const canvas = studio.getCanvasData()
  studio.loadProject({ id: 'groups', canvasData: canvas } as any)
  expect(studio.activeLayers.value[0]!.timelineGroup?.id).toBe(id)
  groups.ungroupLayers(id)
  expect(studio.activeLayers.value[0]!.timelineGroup).toBeNull()
  studio.undo()
  expect(studio.activeLayers.value[0]!.timelineGroup?.id).toBe(id)
})
it('moves group timing and keyframes together and respects slide boundaries', () => {
  const { studio, groups } = setup()
  const id = groups.groupLayers([1, 2])!
  groups.moveGroup(id, 1)
  expect(studio.activeLayers.value.slice(0, 2).map(layer => [layer.startTime, layer.endTime])).toEqual([[2, 4], [3, 5]])
  expect(studio.activeLayers.value[0]!.keyframes!.opacity![0]!.time).toBe(2)
  expect(studio.activeLayers.value[0]!.x).toBe(10)
  studio.undo()
  expect(studio.activeLayers.value[0]!.startTime).toBe(1)
  groups.moveGroup(id, -100)
  expect(studio.activeLayers.value[0]!.startTime).toBe(0)
  expect(studio.activeLayers.value[1]!.startTime).toBe(1)
})
it('refuses all group mutations when any member is locked', () => {
  const { studio, groups } = setup()
  locked = true
  expect(groups.groupLayers([1, 2])).toBeNull()
  expect(studio.canUndo.value).toBe(false)
  locked = false
  const id = groups.groupLayers([1, 2])!
  studio.activeLayers.value[0]!.locked = true
  expect(groups.moveGroup(id, 1)).toBe(false)
  expect(groups.ungroupLayers(id)).toBe(false)
})
