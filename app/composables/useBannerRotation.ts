import type { Layer } from '~/types/banner-studio'
import { layerRotationChange } from '~/utils/banner-transform'

/** Rotation previews share the existing drag/undo contract: one commit per gesture. */
export function useBannerRotation() {
  const { state, activeLayers, updateLayer } = useBannerStudio()
  const { pauseTimeline } = useBannerTimeline()
  let gesture: {
    layer: Layer
    original: Layer
    key: string
    pointerId: number
    pivotX: number
    pivotY: number
    lastAngle: number
    delta: number
  } | null = null

  function editable(layer: Layer) {
    if (layer.locked || layer.hidden || layer.type === 'audio' || layer.type === 'bg') return false
    try {
      return !useBannerRealtime().isLayerLockedByOther(layer.id)
    } catch {
      return true
    }
  }
  function detach() {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', escape)
    window.removeEventListener('blur', cancel)
  }
  function restore() {
    if (!gesture) return
    gesture.layer.rotation = gesture.original.rotation
    gesture.layer.keyframes = gesture.original.keyframes
  }
  function cancel() {
    restore()
    gesture = null
    detach()
  }
  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    cancel()
  }
  function move(event: PointerEvent) {
    const g = gesture
    if (!g || event.pointerId !== g.pointerId) return
    if (state.activeKey !== g.key || !editable(g.layer)) return cancel()
    const angle = Math.atan2(event.clientY - g.pivotY, event.clientX - g.pivotX) * 180 / Math.PI
    g.delta += ((angle - g.lastAngle + 540) % 360) - 180
    g.lastAngle = angle
    const raw = (g.original.rotation || 0) + g.delta
    const rotation = event.shiftKey ? Math.round(raw / 15) * 15 : Math.round(raw * 10) / 10
    Object.assign(g.layer, layerRotationChange(g.original, rotation))
  }
  function finish(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    move(event)
    const g = gesture
    if (!g) return
    const rotation = g.layer.rotation || 0
    restore()
    gesture = null
    detach()
    if (rotation !== (g.original.rotation || 0)) updateLayer(g.layer.id, { rotation })
  }
  function onRotatePointerDown(event: PointerEvent, layerId: number) {
    if (event.button !== 0) return
    const layer = activeLayers.value.find(layer => layer.id === layerId)
    if (!layer || !editable(layer)) return
    const handle = event.currentTarget as HTMLElement
    const pivot = handle.closest('[data-testid="banner-selection"]')?.querySelector('[data-rotation-pivot]')
    if (!pivot) return
    event.preventDefault()
    event.stopPropagation()
    cancel()
    pauseTimeline()
    const point = pivot.getBoundingClientRect()
    gesture = {
      layer, original: structuredClone(toRaw(layer)), key: state.activeKey, pointerId: event.pointerId,
      pivotX: point.left, pivotY: point.top, delta: 0,
      lastAngle: Math.atan2(event.clientY - point.top, event.clientX - point.left) * 180 / Math.PI
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', escape)
    window.addEventListener('blur', cancel)
  }
  function onRotateKeyDown(event: KeyboardEvent, layerId: number) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    const layer = activeLayers.value.find(layer => layer.id === layerId)
    if (!layer || !editable(layer)) return
    event.preventDefault()
    event.stopPropagation()
    pauseTimeline()
    updateLayer(layer.id, { rotation: (layer.rotation || 0) + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 15 : 1) })
  }
  watch(() => [state.activeKey, state.selectedLayerId, state.project?.id], cancel)
  onUnmounted(cancel)
  return { onRotatePointerDown, onRotateKeyDown }
}
