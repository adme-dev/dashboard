import type { Ref } from 'vue'
import { useBannerTimelineGroups } from './useBannerTimelineGroups'

export function useBannerCanvasGroup(board: Ref<HTMLElement | null>, active: () => boolean) {
  const { state, activeLayers, selectedGroup, selectGroup } = useBannerStudio()
  const { canEditGroup, translateGroup } = useBannerTimelineGroups()
  const members = computed(() => active() && selectedGroup?.value
    ? activeLayers.value.filter(layer => layer.timelineGroup?.id === selectedGroup.value!.id)
    : [])
  const bounds = ref<{ left: number, top: number, width: number, height: number } | null>(null)
  const preview = ref<{ id: string, dx: number, dy: number } | null>(null)
  let gesture: { id: string, key: string, pointer: number, x: number, y: number, scale: number } | null = null

  // The timeline writes animated transforms directly to the rendered members.
  watch([board, members, () => state.isPlaying, () => state.wsScale], ([element, layers, playing], _, cleanup) => {
    bounds.value = null
    if (!element || playing || !layers.length) return
    const nodes = layers.filter(layer => !layer.hidden && !['audio', 'bg'].includes(layer.type))
      .map(layer => element.querySelector<HTMLElement>(`#lyr-${layer.id}`)).filter((node): node is HTMLElement => node !== null)
    function measure() {
      const rects = nodes.filter(node => node.style.visibility !== 'hidden').map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height)
      if (!rects.length) {
        bounds.value = null
        return
      }
      const origin = element!.getBoundingClientRect()
      const left = Math.min(...rects.map(rect => rect.left))
      const top = Math.min(...rects.map(rect => rect.top))
      const scale = state.wsScale
      bounds.value = { left: (left - origin.left) / scale, top: (top - origin.top) / scale,
        width: (Math.max(...rects.map(rect => rect.right)) - left) / scale, height: (Math.max(...rects.map(rect => rect.bottom)) - top) / scale }
    }
    measure()
    const observer = new MutationObserver(measure)
    nodes.forEach(node => observer.observe(node, { attributes: true, attributeFilter: ['style'] }))
    cleanup(() => observer.disconnect())
  }, { flush: 'post' })

  function cancel() {
    gesture = null
    preview.value = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('blur', cancel)
  }
  function move(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointer) return
    if (!active() || gesture.key !== state.activeKey || selectedGroup.value?.id !== gesture.id) {
      cancel()
      return
    }
    let dx = Math.round((event.clientX - gesture.x) / gesture.scale)
    let dy = Math.round((event.clientY - gesture.y) / gesture.scale)
    if (state.snapToGrid && state.gridSize > 1) {
      dx = Math.round(dx / state.gridSize) * state.gridSize
      dy = Math.round(dy / state.gridSize) * state.gridSize
    }
    preview.value = { id: gesture.id, dx, dy }
  }
  function finish(event: PointerEvent) {
    if (!gesture || gesture.pointer !== event.pointerId) return
    move(event)
    const delta = preview.value
    cancel()
    if (delta) translateGroup(delta.id, delta.dx, delta.dy)
  }
  function start(event: PointerEvent, id: string) {
    if (!active() || event.button !== 0 || gesture || state.activeTool !== 'select') return
    event.preventDefault()
    event.stopPropagation()
    selectGroup(id)
    if (!canEditGroup(members.value)) return
    gesture = { id, key: state.activeKey, pointer: event.pointerId, x: event.clientX, y: event.clientY, scale: state.wsScale }
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture?.(event.pointerId)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
  }
  onBeforeUnmount(cancel)
  return { bounds, preview, start }
}
