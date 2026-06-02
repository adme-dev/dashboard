import { describe, it, expect } from 'vitest'
import { presetColumnKeys, ALL_PRESET_SENTINEL, type BlendMetric } from '~~/app/utils/blendPresetColumns'

describe('presetColumnKeys', () => {
  it('returns all columns for the "all" sentinel', () => {
    expect(presetColumnKeys(ALL_PRESET_SENTINEL)).toEqual(
      ['channel', 'spend', 'leads', 'cpl', 'conversions', 'cpa', 'revenue', 'roas', 'sessions']
    )
  })
  it('keeps channel first, then the preset metrics in canonical order', () => {
    const metrics: BlendMetric[] = ['cpl', 'spend', 'leads']
    expect(presetColumnKeys(metrics)).toEqual(['channel', 'spend', 'leads', 'cpl'])
  })
  it('ignores metrics that are not real columns', () => {
    const metrics = ['spend', 'bogus'] as unknown as BlendMetric[]
    expect(presetColumnKeys(metrics)).toEqual(['channel', 'spend'])
  })
  it('empty metric list → channel only', () => {
    expect(presetColumnKeys([])).toEqual(['channel'])
  })
})
