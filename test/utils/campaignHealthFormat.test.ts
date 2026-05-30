import { describe, it, expect } from 'vitest'
import { healthColor, healthLabel } from '~/app/utils/campaignHealthFormat'

describe('campaignHealthFormat', () => {
  it('maps verdicts to Nuxt UI colors', () => {
    expect(healthColor('scale')).toBe('success')
    expect(healthColor('hold')).toBe('warning')
    expect(healthColor('cut')).toBe('error')
    expect(healthColor('insufficient')).toBe('neutral')
    expect(healthColor('no-target')).toBe('neutral')
  })
  it('maps verdicts to short labels', () => {
    expect(healthLabel('scale')).toBe('Scale')
    expect(healthLabel('cut')).toBe('Cut')
    expect(healthLabel('insufficient')).toBe('Low data')
    expect(healthLabel('no-target')).toBe('Set target')
  })
})
