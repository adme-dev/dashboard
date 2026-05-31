import { describe, it, expect } from 'vitest'
import { BLEND_PRESETS, getPreset } from '~~/server/utils/blendPresets'
import { isAttributionModel } from '~~/server/utils/attribution'

describe('BLEND_PRESETS', () => {
  it('has unique ids', () => {
    const ids = BLEND_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every preset names a valid attribution model', () => {
    for (const p of BLEND_PRESETS) {
      expect(isAttributionModel(p.attributionModel)).toBe(true)
    }
  })

  it('every preset requests at least one metric and uses the canonical-channel dimension', () => {
    for (const p of BLEND_PRESETS) {
      expect(p.metrics.length).toBeGreaterThan(0)
      expect(p.dimension).toBe('canonical_channel')
    }
  })
})

describe('getPreset', () => {
  it('returns a preset by id', () => {
    expect(getPreset('blended-roas')?.label).toBe('Blended ROAS')
  })

  it('returns null for an unknown id', () => {
    expect(getPreset('nope')).toBeNull()
  })
})
