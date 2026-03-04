import type { Ref } from 'vue'
import type { DragState } from '~/types/banner-studio'
import { FORMATS } from '~/utils/banner-constants'

export interface GuideLineState {
  x: number[]
  y: number[]
}

const SNAP_THRESHOLD = 5 // pixels — snap within this distance

export function useBannerDrag(artboardEl: Ref<HTMLElement | null>) {
  const { state, updateLayer, activeLayers } = useBannerStudio()

  const dragState = ref<DragState | null>(null)
  const guides = reactive<GuideLineState>({ x: [], y: [] })

  function onLayerMouseDown(e: MouseEvent, layerId: number) {
    e.preventDefault()
    e.stopPropagation()

    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!layer || layer.locked) return

    // Check if layer is locked by another collaborator
    try {
      const rt = useBannerRealtime()
      if (rt.isLayerLockedByOther(layerId)) {
        const lock = rt.getLayerLockOwner(layerId)
        if (lock) {
          useToast().add({ title: 'Layer Locked', description: `${lock.userName} is editing this layer`, color: 'warning' })
        }
        return
      }
    } catch {}

    dragState.value = {
      type: 'move',
      layerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: layer.x,
      origY: layer.y,
      origW: layer.w,
      origH: layer.h,
      scale: state.wsScale,
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onResizeHandleMouseDown(e: MouseEvent, layerId: number, handle: string) {
    e.preventDefault()
    e.stopPropagation()

    const layer = activeLayers.value.find(l => l.id === layerId)
    if (!layer || layer.locked) return

    // Check if layer is locked by another collaborator
    try {
      const rt = useBannerRealtime()
      if (rt.isLayerLockedByOther(layerId)) {
        const lock = rt.getLayerLockOwner(layerId)
        if (lock) {
          useToast().add({ title: 'Layer Locked', description: `${lock.userName} is editing this layer`, color: 'warning' })
        }
        return
      }
    } catch {}

    dragState.value = {
      type: 'resize',
      layerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: layer.x,
      origY: layer.y,
      origW: layer.w,
      origH: layer.h,
      resizeHandle: handle,
      scale: state.wsScale,
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent) {
    const ds = dragState.value
    if (!ds) return

    const scale = ds.scale
    const dx = (e.clientX - ds.startX) / scale
    const dy = (e.clientY - ds.startY) / scale

    // Find the reactive layer to update directly
    // (Direct DOM mutation alone gets overwritten by Vue re-renders
    // triggered by guides reactive updates)
    const layer = activeLayers.value.find(l => l.id === ds.layerId)
    if (!layer) return

    if (ds.type === 'move') {
      let nx = Math.round(ds.origX + dx)
      let ny = Math.round(ds.origY + dy)
      // Snap to grid
      if (state.snapToGrid && state.gridSize > 1) {
        nx = Math.round(nx / state.gridSize) * state.gridSize
        ny = Math.round(ny / state.gridSize) * state.gridSize
      }
      // Smart guides: snap to other layers + artboard center/edges
      const snapResult = computeSmartSnap(ds.layerId, nx, ny, ds.origW ?? 100, ds.origH ?? 40)
      nx = snapResult.x
      ny = snapResult.y
      guides.x = snapResult.guidesX
      guides.y = snapResult.guidesY

      // Update reactive state directly (bypasses updateLayer to avoid undo spam).
      // This ensures Vue re-renders (triggered by guides above) use the correct position.
      layer.x = nx
      layer.y = ny
    } else if (ds.type === 'resize') {
      const handle = ds.resizeHandle!
      let nx = ds.origX!
      let ny = ds.origY!
      let nw = ds.origW!
      let nh = ds.origH!

      const minSize = state.snapToGrid && state.gridSize > 1 ? Math.max(10, state.gridSize) : 10

      // Horizontal
      if (handle.includes('l')) {
        nw = Math.max(minSize, nw - dx)
        nx = ds.origX! + (ds.origW! - nw)
      } else if (handle.includes('r')) {
        nw = Math.max(minSize, nw + dx)
      }

      // Vertical
      if (handle.includes('t')) {
        nh = Math.max(minSize, nh - dy)
        ny = ds.origY! + (ds.origH! - nh)
      } else if (handle.includes('b')) {
        nh = Math.max(minSize, nh + dy)
      }

      // Snap resize to grid
      if (state.snapToGrid && state.gridSize > 1) {
        nx = Math.round(nx / state.gridSize) * state.gridSize
        ny = Math.round(ny / state.gridSize) * state.gridSize
        nw = Math.round(nw / state.gridSize) * state.gridSize
        nh = Math.round(nh / state.gridSize) * state.gridSize
        if (nw < state.gridSize) nw = state.gridSize
        if (nh < state.gridSize) nh = state.gridSize
      }

      // Update reactive state directly
      layer.x = Math.round(nx)
      layer.y = Math.round(ny)
      layer.w = Math.round(nw)
      layer.h = Math.round(nh)
    }
  }

  /** Compute smart snap guides against other layers and artboard bounds */
  function computeSmartSnap(
    dragLayerId: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const guidesX: number[] = []
    const guidesY: number[] = []
    let snapX = x
    let snapY = y

    const fmt = FORMATS[state.activeKey]
    if (!fmt) return { x: snapX, y: snapY, guidesX, guidesY }

    // Edges of dragged layer
    const left = x
    const right = x + w
    const cx = x + w / 2
    const top = y
    const bottom = y + h
    const cy = y + h / 2

    // Artboard snap targets
    const targets: { x: number[]; y: number[] } = {
      x: [0, fmt.w / 2, fmt.w],
      y: [0, fmt.h / 2, fmt.h],
    }

    // Other layer snap targets
    for (const l of activeLayers.value) {
      if (l.id === dragLayerId || l.type === 'bg' || l.hidden) continue
      targets.x.push(l.x, l.x + l.w / 2, l.x + l.w)
      targets.y.push(l.y, l.y + l.h / 2, l.y + l.h)
    }

    // Find closest snap — X axis
    let bestDx = SNAP_THRESHOLD + 1
    for (const tx of targets.x) {
      for (const edge of [left, cx, right]) {
        const d = Math.abs(edge - tx)
        if (d < bestDx) {
          bestDx = d
          snapX = x + (tx - edge)
          guidesX.length = 0
          guidesX.push(tx)
        } else if (d === bestDx && d <= SNAP_THRESHOLD) {
          guidesX.push(tx)
        }
      }
    }
    if (bestDx > SNAP_THRESHOLD) {
      guidesX.length = 0
      snapX = x
    }

    // Find closest snap — Y axis
    let bestDy = SNAP_THRESHOLD + 1
    for (const ty of targets.y) {
      for (const edge of [top, cy, bottom]) {
        const d = Math.abs(edge - ty)
        if (d < bestDy) {
          bestDy = d
          snapY = y + (ty - edge)
          guidesY.length = 0
          guidesY.push(ty)
        } else if (d === bestDy && d <= SNAP_THRESHOLD) {
          guidesY.push(ty)
        }
      }
    }
    if (bestDy > SNAP_THRESHOLD) {
      guidesY.length = 0
      snapY = y
    }

    return { x: snapX, y: snapY, guidesX, guidesY }
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)

    const ds = dragState.value
    if (!ds) return

    const layer = activeLayers.value.find(l => l.id === ds.layerId)
    if (layer) {
      // Save final position (already updated by onMouseMove)
      const finalX = layer.x
      const finalY = layer.y
      const finalW = layer.w
      const finalH = layer.h
      const moved = finalX !== ds.origX || finalY !== ds.origY
        || (ds.type === 'resize' && (finalW !== ds.origW || finalH !== ds.origH))

      if (moved) {
        // Temporarily restore original values so updateLayer() captures correct "before"
        layer.x = ds.origX
        layer.y = ds.origY
        if (ds.type === 'resize') {
          layer.w = ds.origW!
          layer.h = ds.origH!
        }
        // updateLayer() snapshots "before", applies final values, and pushes undo
        const props: Record<string, number> = { x: finalX, y: finalY }
        if (ds.type === 'resize') {
          props.w = finalW
          props.h = finalH
        }
        updateLayer(ds.layerId, props)
      }
    }

    dragState.value = null
    guides.x = []
    guides.y = []
  }

  // Cleanup on unmount
  onUnmounted(() => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  })

  return {
    dragState,
    guides,
    onLayerMouseDown,
    onResizeHandleMouseDown,
  }
}
