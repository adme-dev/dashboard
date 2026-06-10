// app/utils/video/composite.ts — PURE helpers for the AV preview compositor. No DOM.

export interface FitRect { x: number; y: number; width: number; height: number }

/** object-fit: cover — scale (sw×sh) to fully cover (dw×dh), centred, cropping overflow. */
export function fitRect(sw: number, sh: number, dw: number, dh: number): FitRect {
  if (sw <= 0 || sh <= 0) return { x: 0, y: 0, width: dw, height: dh }
  const scale = Math.max(dw / sw, dh / sh)
  const width = sw * scale
  const height = sh * scale
  return { x: (dw - width) / 2, y: (dh - height) / 2, width, height }
}

export interface KenBurns { zoom_from: number; zoom_to: number; pan_from: [number, number]; pan_to: [number, number] }

/** Linear-interpolate a ken-burns transform at local time t within [0, duration]. */
export function kenBurnsTransformAt(kb: KenBurns, t: number, durationSec: number): { zoom: number; panX: number; panY: number } {
  const p = durationSec > 0 ? Math.max(0, Math.min(1, t / durationSec)) : 0
  return {
    zoom: kb.zoom_from + (kb.zoom_to - kb.zoom_from) * p,
    panX: kb.pan_from[0] + (kb.pan_to[0] - kb.pan_from[0]) * p,
    panY: kb.pan_from[1] + (kb.pan_to[1] - kb.pan_from[1]) * p
  }
}

/** The last clip (top-most in array order) whose [start, start+duration) contains t.
 * At the final timeline boundary, hold the ending clip so the preview does not blank. */
export function activeVisualClipAt<T extends { timeline_start_sec: number; duration_sec: number }>(clips: T[], t: number): T | null {
  let hit: T | null = null
  for (const c of clips) {
    if (t >= c.timeline_start_sec && t < c.timeline_start_sec + c.duration_sec) hit = c
  }
  if (hit) return hit
  for (const c of clips) {
    if (t === c.timeline_start_sec + c.duration_sec) hit = c
  }
  return hit
}

/** Client mirror of server resolveOverlayFormatKey (bannerOverlay.ts) — aspect → format. */
export function resolveOverlayFormatKeyClient(width: number, height: number): string {
  const r = width / height
  if (r < 0.85) return 'fb_story'
  if (r > 1.2) return 'tt_land'
  return 'ig_sq'
}

/** Pull a banner project's layers for a format key out of its canvasData JSON. */
export function extractBannerLayers(canvasData: Record<string, { layers?: unknown[] }> | null | undefined, formatKey: string): unknown[] {
  return (canvasData?.[formatKey]?.layers as unknown[]) ?? []
}
