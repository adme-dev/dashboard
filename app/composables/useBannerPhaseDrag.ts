import type { Ref } from 'vue'
import type { Layer } from '~/types/banner-studio'
import type { TimelinePhase } from '~/utils/banner-timeline-phases'
import { retimeAnimationPhase } from '~/utils/banner-timeline-edit'

export function useBannerPhaseDrag(pxPerSec: Ref<number>, phasesByLayer: Ref<Map<number, TimelinePhase[]>>) {
  const { state, selectLayer, updateLayer } = useBannerStudio()
  const { pauseTimeline } = useBannerTimeline()
  const { isLayerLockedByOther } = useBannerRealtime()
  const timingHint = ref('')
  let gesture: { layer: Layer, original: Layer, phase: TimelinePhase, mode: 'start' | 'end' | 'move', x: number, key: string, element: HTMLElement, min: number, max: number, start: number, end: number } | null = null
  let suppressClick = false
  let reset: ReturnType<typeof setTimeout> | undefined
  const editable = (layer: Layer) => !layer.locked && !isLayerLockedByOther(layer.id)
  function detach() {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', finish)
    window.removeEventListener('keydown', keydown)
    window.removeEventListener('blur', cancel)
  }
  function cancel() {
    if (gesture) {
      gesture.element.style.left = `${(gesture.phase.start - (gesture.original.startTime ?? 0)) * pxPerSec.value}px`
      gesture.element.style.width = `${(gesture.phase.end - gesture.phase.start) * pxPerSec.value}px`
    }
    gesture = null
    timingHint.value = ''
    detach()
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }
  function bounds(layer: Layer, phase: TimelinePhase) {
    const others = (phasesByLayer.value.get(layer.id) || []).filter(other => other !== phase && other.kind !== 'hold')
    const anchors = Object.values(layer.keyframes || {}).flatMap(frames => frames?.map(frame => frame.time) || [])
    return {
      min: Math.max(layer.startTime ?? 0, ...others.filter(other => other.end <= phase.start).map(other => other.end), ...anchors.filter(time => time < phase.start - 1e-6).map(time => time + 0.05)),
      max: Math.min(layer.endTime ?? state.duration, ...others.filter(other => other.start >= phase.end).map(other => other.start), ...anchors.filter(time => time > phase.end + 1e-6).map(time => time - 0.05))
    }
  }
  function interval(phase: TimelinePhase, mode: 'start' | 'end' | 'move', delta: number, min: number, max: number) {
    const length = phase.end - phase.start
    const round = (time: number) => Math.round(time * 100) / 100
    if (mode === 'start') return { start: round(Math.max(min, Math.min(phase.end - 0.05, phase.start + delta))), end: phase.end }
    if (mode === 'end') return { start: phase.start, end: round(Math.min(max, Math.max(phase.start + 0.05, phase.end + delta))) }
    const start = round(Math.max(min, Math.min(max - length, phase.start + delta)))
    return { start, end: round(start + length) }
  }
  function move(event: MouseEvent) {
    const g = gesture
    if (!g) return
    if (g.key !== state.activeKey || !editable(g.layer)) return cancel()
    if (Math.abs(event.clientX - g.x) <= 3) return
    const delta = (event.clientX - g.x) / pxPerSec.value
    const snapped = event.altKey ? delta : Math.round(delta * 20) / 20
    Object.assign(g, interval(g.phase, g.mode, snapped, g.min, g.max))
    g.element.style.left = `${(g.start - (g.original.startTime ?? 0)) * pxPerSec.value}px`
    g.element.style.width = `${(g.end - g.start) * pxPerSec.value}px`
    timingHint.value = `${g.start.toFixed(2)}–${g.end.toFixed(2)}s`
  }
  function finish(event: MouseEvent) {
    const g = gesture
    if (!g) return
    move(event)
    if (!gesture) return
    const changed = g.start !== g.phase.start || g.end !== g.phase.end
    cancel()
    if (changed) {
      updateLayer(g.layer.id, retimeAnimationPhase(g.original, g.phase, g.start, g.end))
      state.selectedKeyframe = null
      suppressClick = true
      clearTimeout(reset)
      reset = setTimeout(() => {
        suppressClick = false
      }, 0)
    }
  }
  function startPhaseDrag(event: MouseEvent, layer: Layer, phase: TimelinePhase, mode: 'start' | 'end' | 'move') {
    if (event.button !== 0 || !editable(layer) || phase.kind === 'hold' || phase.kind === 'audio') return
    const element = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-animation-phase]')
    if (!element) return
    event.preventDefault()
    event.stopPropagation()
    cancel()
    pauseTimeline()
    selectLayer(layer.id)
    gesture = { layer, original: structuredClone(toRaw(layer)), phase, mode, x: event.clientX, key: state.activeKey, element, ...bounds(layer, phase), start: phase.start, end: phase.end }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', finish)
    window.addEventListener('keydown', keydown)
    window.addEventListener('blur', cancel)
  }
  function phaseClick(event: MouseEvent) {
    if (!suppressClick) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  function nudgePhase(event: KeyboardEvent, layer: Layer, phase: TimelinePhase, edge: 'start' | 'end') {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !editable(layer)) return
    event.preventDefault()
    event.stopPropagation()
    pauseTimeline()
    const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 0.5 : 0.05)
    const { min, max } = bounds(layer, phase)
    const next = interval(phase, edge, delta, min, max)
    if (next.start === phase.start && next.end === phase.end) return
    updateLayer(layer.id, retimeAnimationPhase(layer, phase, next.start, next.end))
  }
  watch(() => [state.activeKey, state.project?.id], cancel)
  onUnmounted(() => {
    cancel()
    clearTimeout(reset)
  })
  return { startPhaseDrag, phaseClick, nudgePhase, timingHint }
}
