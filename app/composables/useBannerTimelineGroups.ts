import type { Layer } from '~/types/banner-studio'
import { retimeLayerPresence } from '~/utils/banner-timeline-edit'
import { layerSlideId, resolveSlides, slideRanges } from '~/utils/banner-slides'

export function useBannerTimelineGroups() {
  const { state, activeLayers, withCanvasUndo } = useBannerStudio()
  const realtime = useBannerRealtime()
  const editable = (layers: Layer[]) => layers.length > 0 && layers.every(layer => !layer.locked && !layer.slideTransitionFor && !realtime.isLayerLockedByOther(layer.id))
  function apply(layers: Layer[], changes: Partial<Layer>[]) {
    if (!editable(layers)) return false
    withCanvasUndo(() => layers.forEach((layer, index) => Object.assign(layer, changes[index])))
    layers.forEach((layer, index) => {
      try {
        realtime.sendLayerUpdate?.(layer.id, state.activeKey, changes[index])
      } catch { /* Local edits remain available offline. */ }
    })
    return true
  }
  function groupLayers(ids: number[]) {
    const layers = activeLayers.value.filter(layer => ids.includes(layer.id))
    if (layers.length < 2 || !editable(layers)) return null
    const id = crypto.randomUUID()
    const names = new Set(activeLayers.value.map(layer => layer.timelineGroup?.name))
    let number = 1
    while (names.has(`Group ${number}`)) number++
    apply(layers, layers.map(() => ({ timelineGroup: { id, name: `Group ${number}` } })))
    return id
  }
  function ungroupLayers(id: string) {
    const layers = activeLayers.value.filter(layer => layer.timelineGroup?.id === id)
    return apply(layers, layers.map(() => ({ timelineGroup: null })))
  }
  function moveGroup(id: string, seconds: number) {
    const layers = activeLayers.value.filter(layer => layer.timelineGroup?.id === id)
    if (!editable(layers) || !Number.isFinite(seconds)) return false
    const board = state.sets[state.activeKey]
    const slides = slideRanges(resolveSlides(board))
    const limits = layers.map((layer) => {
      const slide = slides.find(slide => slide.id === layerSlideId(board, layer))
      return { min: (slide?.start ?? 0) - layer.startTime, max: (slide?.end ?? state.duration) - layer.endTime }
    })
    const delta = Math.max(Math.max(...limits.map(limit => limit.min)), Math.min(Math.min(...limits.map(limit => limit.max)), seconds))
    if (!delta) return false
    return apply(layers, layers.map(layer => retimeLayerPresence(layer, layer.startTime + delta, layer.endTime + delta)))
  }
  return { groupLayers, ungroupLayers, moveGroup, canEditGroup: editable }
}
