export const TIMELINE_ZOOM_MIN = 10
export const TIMELINE_ZOOM_MAX = 800
export const TIMELINE_ZOOM_FACTOR = 1.5

export const TIMELINE_ZOOM_OPTIONS = [
  { label: '25 px/s', value: 25 },
  { label: '50 px/s', value: 50 },
  { label: '100 px/s', value: 100 },
  { label: '200 px/s', value: 200 },
  { label: '400 px/s', value: 400 },
]

export function clampTimelineZoom(pxPerSec: number): number {
  if (!Number.isFinite(pxPerSec)) return TIMELINE_ZOOM_MIN
  return Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, pxPerSec))
}

export function fitTimelineZoom(durationSec: number, containerWidthPx: number, labelWidthPx: number): number {
  const duration = Math.max(durationSec, 1)
  const usableWidth = Math.max(containerWidthPx - labelWidthPx, 100)
  return clampTimelineZoom(Math.floor(usableWidth / duration))
}

export function stepTimelineZoom(pxPerSec: number, direction: 'in' | 'out'): number {
  const next = direction === 'in'
    ? pxPerSec * TIMELINE_ZOOM_FACTOR
    : pxPerSec / TIMELINE_ZOOM_FACTOR
  return clampTimelineZoom(next)
}
