/** Pointer capture keeps slide reordering reliable over thumbnail iframes. */
export function useBannerSlideDrag(surface: 'panel' | 'strip', move: (from: number, to: number) => unknown) {
  const { state } = useBannerStudio()
  const dragged = ref<number | null>(null)
  let gesture: { index: number, x: number, y: number, key: string, project: string | undefined, target: HTMLElement, pointerId: number } | null = null
  let suppressClick = false
  let reset: ReturnType<typeof setTimeout> | undefined
  function cancel() {
    if (gesture) {
      try {
        gesture.target.releasePointerCapture(gesture.pointerId)
      } catch { /* A moved node may already have released capture. */ }
    }
    gesture = null
    dragged.value = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('blur', cancel)
  }
  function start(event: PointerEvent, index: number) {
    if (event.button !== 0) return
    cancel()
    const target = event.currentTarget as HTMLElement
    gesture = { index, x: event.clientX, y: event.clientY, key: state.activeKey, project: state.project?.id, target, pointerId: event.pointerId }
    try {
      target.setPointerCapture(event.pointerId)
    } catch { /* Synthetic keyboard tests have no pointer owner. */ }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
  }
  function onMove(event: PointerEvent) {
    if (!gesture) return
    if (state.activeKey !== gesture.key || state.project?.id !== gesture.project) return cancel()
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) {
      dragged.value = gesture.index
      event.preventDefault()
    }
  }
  function onEnd(event: PointerEvent) {
    const current = gesture
    if (current && dragged.value !== null) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(`[data-slide-surface="${surface}"][data-slide-index]`)
      const index = target ? Number(target.getAttribute('data-slide-index')) : NaN
      if (state.activeKey === current.key && state.project?.id === current.project && Number.isInteger(index) && index !== current.index) move(current.index, index)
      suppressClick = true
      if (reset) clearTimeout(reset)
      reset = setTimeout(() => {
        suppressClick = false
      }, 0)
    }
    cancel()
  }
  function preventClick(event: MouseEvent) {
    if (!suppressClick) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  onBeforeUnmount(() => {
    cancel()
    if (reset) clearTimeout(reset)
  })
  return { dragged, start, preventClick }
}
