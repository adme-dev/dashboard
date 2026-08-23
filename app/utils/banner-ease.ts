/**
 * Custom cubic-bezier eases for banner tweens.
 * Stored as `cubic-bezier(x1,y1,x2,y2)` (what BannerEasingCurveEditor emits); the short
 * `cubic(x1,y1,x2,y2)` form is accepted too.
 * Resolved to a GSAP CustomEase at runtime and exported as an inline CustomEase.create().
 */
export type CubicEase = [number, number, number, number]

export const EASE_PRESET_CURVES: Record<string, CubicEase> = {
  'none': [0, 0, 1, 1],
  'power2.inOut': [0.45, 0, 0.55, 1],
  'power2.out': [0.22, 0.61, 0.36, 1],
  'power2.in': [0.55, 0.06, 0.68, 0.19],
  'back.inOut(1.7)': [0.68, -0.55, 0.27, 1.55]
}

export function parseCubicEase(ease?: string | null): CubicEase | null {
  if (!ease) return null
  const m = /^cubic(?:-bezier)?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(ease.trim())
  if (!m) return null
  const p = m.slice(1, 5).map(Number) as CubicEase
  if (p.some(n => !Number.isFinite(n))) return null
  p[0] = clamp01(p[0])
  p[2] = clamp01(p[2])
  return p
}

export function cubicEaseString(p: CubicEase): string {
  return `cubic-bezier(${p.map(n => Math.round(n * 1000) / 1000).join(',')})`
}

/** SVG path string GSAP's CustomEase understands (0-1 space). */
export function cubicEaseToSvg(p: CubicEase): string {
  return `M0,0 C${p[0]},${p[1]} ${p[2]},${p[3]} 1,1`
}

/** JS expression for exported HTML — assumes CustomEase is loaded + registered. */
export function easeToExportExpr(ease?: string): string {
  const p = parseCubicEase(ease)
  if (p) return `CustomEase.create('', '${cubicEaseToSvg(p)}')`
  return `'${ease || 'power2.inOut'}'`
}

export function isCustomEase(ease?: string | null): boolean {
  return parseCubicEase(ease) !== null
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}
