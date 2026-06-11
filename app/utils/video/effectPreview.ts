// effectPreview.ts — PURE mapping from clip effect presets to cheap editor-preview
// approximations. The server render (videoCompositeGraph CLIP_EFFECT_PRESETS) is
// authoritative for final pixels; this only gives the editor a directionally-honest
// look: canvas 2d ctx.filter strings, a noise-overlay alpha for grain/tape looks,
// and a deterministic jitter flag matching the render-side shake expression.
// Fisheye is geometric and not cheap on a 2d canvas — listed as unpreviewable.

export interface EffectPreviewPlan {
  /** canvas 2d context filter string ('' = none) */
  ctxFilter: string
  /** opacity for the animated noise overlay (0 = none) */
  noiseAlpha: number
  /** apply deterministic transform jitter (matches the ffmpeg shake expression) */
  shake: boolean
  /** preset ids this plan approximates */
  approximated: string[]
  /** preset ids with no preview (render-only) */
  unpreviewable: string[]
}

interface PresetPreview {
  filter?: string
  noiseAlpha?: number
  shake?: boolean
  unpreviewable?: boolean
}

const PRESET_PREVIEWS: Record<string, PresetPreview> = {
  film_grain: { noiseAlpha: 0.08 },
  motion_blur: { filter: 'blur(1px)' },
  vhs: { filter: 'saturate(1.3) contrast(0.92) brightness(1.02)', noiseAlpha: 0.1 },
  shake: { shake: true },
  bloom: { filter: 'brightness(1.06) saturate(1.12) blur(0.6px)' },
  fisheye: { unpreviewable: true }
}

export function effectPreviewPlan(effects: string[]): EffectPreviewPlan {
  const filters: string[] = []
  let noiseAlpha = 0
  let shake = false
  const approximated: string[] = []
  const unpreviewable: string[] = []

  for (const id of effects) {
    const preview = PRESET_PREVIEWS[id]
    if (!preview) continue
    if (preview.unpreviewable) {
      unpreviewable.push(id)
      continue
    }
    if (preview.filter) filters.push(preview.filter)
    if (preview.noiseAlpha) noiseAlpha = Math.max(noiseAlpha, preview.noiseAlpha)
    if (preview.shake) shake = true
    approximated.push(id)
  }

  return { ctxFilter: filters.join(' '), noiseAlpha, shake, approximated, unpreviewable }
}

/** Deterministic jitter matching the render-side ffmpeg shake expression
 * (crop offsets 8+6*sin(t*13), 8+6*cos(t*17) → ±6px around center). */
export function shakeOffsetAt(timeSec: number): { dx: number, dy: number } {
  return { dx: 6 * Math.sin(timeSec * 13), dy: 6 * Math.cos(timeSec * 17) }
}
