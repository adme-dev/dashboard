// app/utils/audio/timelineLayout.ts — PURE layout maths for the media timeline and its dock.
// Ruler tick spacing, natural (content) height by track count, and dock-height resolution.
// No DOM, no Vue — unit-testable.

export const TIMELINE_LANE_HEIGHT = 56
export const TIMELINE_RULER_HEIGHT = 24
/** Canvas top + bottom border. */
const CANVAS_BORDER_PX = 2

/** "Nice" ruler intervals in seconds, finest first. */
const RULER_INTERVALS_SEC = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600]

/** Minimum on-screen distance between labelled ticks. A label like "1:05" is ~26px at 10px type. */
export const RULER_MIN_LABEL_SPACING_PX = 48

/**
 * Smallest nice interval whose labels stay at least `minSpacingPx` apart at this zoom.
 * The spacing depends only on zoom, never on pane width, so a narrow phone pane and a wide
 * desktop pane read identically at the same px/s.
 */
export function rulerTickInterval(pxPerSec: number, minSpacingPx = RULER_MIN_LABEL_SPACING_PX): number {
  if (!Number.isFinite(pxPerSec) || pxPerSec <= 0) return RULER_INTERVALS_SEC[RULER_INTERVALS_SEC.length - 1]!
  return RULER_INTERVALS_SEC.find(interval => interval * pxPerSec >= minSpacingPx)
    ?? RULER_INTERVALS_SEC[RULER_INTERVALS_SEC.length - 1]!
}

/** Label for a tick at `t` seconds. Sub-second intervals keep their decimals. */
export function formatRulerLabel(t: number, interval: number): string {
  const decimals = interval >= 1 ? 0 : interval === 0.25 ? 2 : 1
  // Round first so 59.999… never renders as "0:60".
  const factor = 10 ** decimals
  const rounded = Math.round(t * factor) / factor
  const mins = Math.floor(rounded / 60)
  const secs = rounded - mins * 60
  if (mins === 0) return `${Number(secs.toFixed(decimals))}s`
  const [whole, frac] = secs.toFixed(decimals).split('.')
  return `${mins}:${whole!.padStart(2, '0')}${frac ? `.${frac}` : ''}`
}

/** A label this close to the end of the canvas would overflow it and add a horizontal scrollbar at "Fit". */
const END_LABEL_CLEARANCE_PX = 28

/** Tick positions (seconds) and labels across [0, duration], skipping a final label that would overflow the canvas. */
export function rulerTicks(durationSec: number, pxPerSec: number, minSpacingPx = RULER_MIN_LABEL_SPACING_PX): { sec: number, label: string }[] {
  const duration = Math.max(durationSec, 1)
  const interval = rulerTickInterval(pxPerSec, minSpacingPx)
  const count = Math.floor(duration / interval + 1e-6)
  const ticks: { sec: number, label: string }[] = []
  for (let i = 0; i <= count; i++) {
    const sec = i * interval
    if (i > 0 && (duration - sec) * pxPerSec < END_LABEL_CLEARANCE_PX) break
    ticks.push({ sec, label: formatRulerLabel(sec, interval) })
  }
  return ticks
}

/**
 * Height the timeline needs to show every lane without vertical scrolling:
 * toolbar (measured, wraps on phones) + sticky ruler + one row per track + borders, plus a
 * classic horizontal scrollbar when the platform shows one (overlay scrollbars measure 0).
 */
export function timelineNaturalHeight(trackCount: number, toolbarHeightPx: number, horizontalScrollbarPx = 0): number {
  const lanes = Math.max(1, Math.floor(trackCount))
  return Math.ceil(Math.max(0, toolbarHeightPx) + Math.max(0, horizontalScrollbarPx))
    + TIMELINE_RULER_HEIGHT + lanes * TIMELINE_LANE_HEIGHT + CANVAS_BORDER_PX
}

/** Space a scroller's horizontal scrollbar takes, from its offset/client heights and border. */
export function horizontalScrollbarHeight(offsetHeightPx: number, clientHeightPx: number, borderPx = CANVAS_BORDER_PX): number {
  return Math.max(0, offsetHeightPx - clientHeightPx - borderPx)
}

export const TIMELINE_DOCK_MIN = 140
export const TIMELINE_DOCK_MAX = 640
/** Share of the viewport the dock may take automatically; the preview keeps the rest. */
export const TIMELINE_DOCK_VIEWPORT_SHARE = { desktop: 0.4, phone: 0.5 } as const
export const TIMELINE_DOCK_KEY_STEP = 24

export interface DockHeightInput {
  /** Timeline content height from `timelineNaturalHeight` (null until measured). */
  naturalHeight: number | null
  /** Dock chrome around the timeline (render strip, gaps). */
  chromeHeight?: number
  viewportHeight: number
  /** A height the user chose by dragging or keyboard. Always wins over the automatic size. */
  manualHeight?: number | null
  phone?: boolean
  fallbackHeight?: number
}

/**
 * Dock height in px. A manual size is honoured (clamped to the dock range and viewport share,
 * matching the previous `min(height, 40svh)` behaviour). Otherwise the dock fits the tracks:
 * few tracks → a short dock and more room for the preview; many tracks → grows to the cap and
 * the lanes scroll beneath the sticky ruler.
 */
export function resolveTimelineDockHeight(input: DockHeightInput): number {
  const share = input.phone ? TIMELINE_DOCK_VIEWPORT_SHARE.phone : TIMELINE_DOCK_VIEWPORT_SHARE.desktop
  const viewportCap = input.viewportHeight > 0 ? input.viewportHeight * share : TIMELINE_DOCK_MAX
  const cap = Math.max(TIMELINE_DOCK_MIN, Math.min(TIMELINE_DOCK_MAX, viewportCap))
  const clampTo = (value: number) => Math.round(Math.min(cap, Math.max(TIMELINE_DOCK_MIN, value)))
  if (input.manualHeight != null && Number.isFinite(input.manualHeight)) return clampTo(input.manualHeight)
  if (input.naturalHeight == null || !Number.isFinite(input.naturalHeight)) return clampTo(input.fallbackHeight ?? 196)
  return clampTo(input.naturalHeight + Math.max(0, input.chromeHeight ?? 0))
}

/**
 * Keyboard resizing for the dock separator (WAI-ARIA window splitter). Returns the next manual
 * height, or null for keys the separator does not handle. Up grows the dock (it sits below the preview).
 */
export function stepTimelineDockHeight(current: number, key: string, step = TIMELINE_DOCK_KEY_STEP): number | null {
  const clamp = (value: number) => Math.min(TIMELINE_DOCK_MAX, Math.max(TIMELINE_DOCK_MIN, value))
  if (key === 'ArrowUp') return clamp(current + step)
  if (key === 'ArrowDown') return clamp(current - step)
  if (key === 'PageUp') return clamp(current + step * 4)
  if (key === 'PageDown') return clamp(current - step * 4)
  if (key === 'Home') return TIMELINE_DOCK_MIN
  if (key === 'End') return TIMELINE_DOCK_MAX
  return null
}
