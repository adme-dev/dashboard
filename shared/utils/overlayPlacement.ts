// Overlay placement — ONE definition used by the server render (Chromium
// capture of the banner HTML in an output-size viewport) and the editor preview
// (the same HTML in a scaled iframe). Because placement is applied inside the
// HTML as a CSS transform on `.ad`, render and preview agree by construction.

export type OverlayAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export interface OverlayPlacement {
  anchor: OverlayAnchor
  /** Multiplier on the banner's native size (0.1–3). 1 = native. */
  scale: number
  /** Inset from the frame edges, as a percentage of the frame's shorter side. */
  margin_pct: number
}

export const OVERLAY_ANCHORS: OverlayAnchor[] = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

export const DEFAULT_OVERLAY_PLACEMENT: OverlayPlacement = { anchor: 'top-left', scale: 1, margin_pct: 0 }

export function normalizeOverlayPlacement(input: Partial<OverlayPlacement> | null | undefined): OverlayPlacement {
  const anchor = OVERLAY_ANCHORS.includes(input?.anchor as OverlayAnchor) ? input!.anchor as OverlayAnchor : DEFAULT_OVERLAY_PLACEMENT.anchor
  const scale = Number.isFinite(input?.scale) ? Math.min(3, Math.max(0.1, Number(input!.scale))) : 1
  const margin = Number.isFinite(input?.margin_pct) ? Math.min(40, Math.max(0, Number(input!.margin_pct))) : 0
  return { anchor, scale, margin_pct: margin }
}

/** Top-left offset (px) of the scaled banner inside a frame. */
export function overlayOffset(
  placement: OverlayPlacement,
  frame: { width: number; height: number },
  banner: { width: number; height: number }
): { left: number; top: number; scale: number } {
  const p = normalizeOverlayPlacement(placement)
  const margin = Math.min(frame.width, frame.height) * (p.margin_pct / 100)
  const w = banner.width * p.scale
  const h = banner.height * p.scale
  const [v, hz] = p.anchor === 'center' ? ['center', 'center'] : p.anchor.split('-') as [string, string]
  const left = hz === 'left' ? margin : hz === 'right' ? frame.width - w - margin : (frame.width - w) / 2
  const top = v === 'top' ? margin : v === 'bottom' ? frame.height - h - margin : (frame.height - h) / 2
  return { left: Math.round(left), top: Math.round(top), scale: p.scale }
}

/**
 * CSS that positions `.ad` for this placement. Inject into the banner HTML's
 * <head>; it overrides the builder's `position: relative` at 0,0.
 */
export function overlayPlacementStyle(
  placement: OverlayPlacement | null | undefined,
  frame: { width: number; height: number },
  banner: { width: number; height: number }
): string {
  const { left, top, scale } = overlayOffset(normalizeOverlayPlacement(placement), frame, banner)
  return `<style data-overlay-placement>.ad{position:absolute!important;left:${left}px!important;top:${top}px!important;transform:scale(${scale});transform-origin:top left}</style>`
}

/** Insert the placement style into a built banner document. */
export function applyOverlayPlacement(
  html: string,
  placement: OverlayPlacement | null | undefined,
  frame: { width: number; height: number },
  banner: { width: number; height: number }
): string {
  const style = overlayPlacementStyle(placement, frame, banner)
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${style}</head>`) : style + html
}
