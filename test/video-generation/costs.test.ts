import { describe, expect, it } from 'vitest'
import {
  canSpendVideoGenerationCents,
  estimateVideoGenerationCostCents,
} from '~~/server/utils/video-generation/costs'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

describe('video generation costs', () => {
  it('estimates per-second models', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')!

    expect(estimateVideoGenerationCostCents(model, 5)).toBe(250)
  })

  it('defaults disabled tenant policy to blocked', () => {
    const result = canSpendVideoGenerationCents({ enabled: false, monthlyCapCents: 1000 }, 0, 10)

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('tenant_generation_disabled')
  })

  it('rejects over-cap generation', () => {
    const result = canSpendVideoGenerationCents({ enabled: true, monthlyCapCents: 100 }, 75, 50)

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('tenant_cap_exceeded')
  })
})
