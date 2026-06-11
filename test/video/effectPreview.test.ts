import { describe, expect, it } from 'vitest'
import { effectPreviewPlan, shakeOffsetAt } from '~~/app/utils/video/effectPreview'
import { CLIP_EFFECT_PRESETS } from '~~/server/utils/audio/videoCompositeGraph'

describe('effectPreviewPlan', () => {
  it('returns a neutral plan for no effects', () => {
    const plan = effectPreviewPlan([])
    expect(plan.ctxFilter).toBe('')
    expect(plan.noiseAlpha).toBe(0)
    expect(plan.shake).toBe(false)
    expect(plan.approximated).toEqual([])
    expect(plan.unpreviewable).toEqual([])
  })

  it('maps grain and vhs to a noise overlay', () => {
    expect(effectPreviewPlan(['film_grain']).noiseAlpha).toBeGreaterThan(0)
    const vhs = effectPreviewPlan(['vhs'])
    expect(vhs.noiseAlpha).toBeGreaterThan(0)
    expect(vhs.ctxFilter).toContain('saturate')
  })

  it('maps bloom and motion blur to canvas filters', () => {
    expect(effectPreviewPlan(['bloom']).ctxFilter).toContain('brightness')
    expect(effectPreviewPlan(['motion_blur']).ctxFilter).toContain('blur')
  })

  it('marks shake for transform jitter and fisheye as unpreviewable', () => {
    const plan = effectPreviewPlan(['shake', 'fisheye'])
    expect(plan.shake).toBe(true)
    expect(plan.approximated).toContain('shake')
    expect(plan.unpreviewable).toEqual(['fisheye'])
  })

  it('combines filters from multiple presets', () => {
    const plan = effectPreviewPlan(['vhs', 'bloom'])
    expect(plan.ctxFilter).toContain('saturate')
    expect(plan.ctxFilter).toContain('brightness')
  })

  it('ignores unknown ids and accounts for every render preset', () => {
    expect(effectPreviewPlan(['nope']).approximated).toEqual([])
    for (const id of Object.keys(CLIP_EFFECT_PRESETS)) {
      const plan = effectPreviewPlan([id])
      expect(plan.approximated.includes(id) || plan.unpreviewable.includes(id)).toBe(true)
    }
  })
})

describe('shakeOffsetAt', () => {
  it('matches the render-side jitter expression (6*sin(13t), 6*cos(17t))', () => {
    const { dx, dy } = shakeOffsetAt(1.5)
    expect(dx).toBeCloseTo(6 * Math.sin(1.5 * 13), 6)
    expect(dy).toBeCloseTo(6 * Math.cos(1.5 * 17), 6)
  })

  it('is deterministic', () => {
    expect(shakeOffsetAt(2)).toEqual(shakeOffsetAt(2))
  })
})
