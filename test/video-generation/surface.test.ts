import { describe, expect, it } from 'vitest'
import { isTenantModel } from '~~/server/utils/video-generation/surface'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

describe('isTenantModel', () => {
  it('allows active tenant Cloudflare models', () => {
    expect(isTenantModel(getVideoGenerationModel('aigateway/seedance-i2v')!)).toBe(true)
  })
  it('rejects hidden, mock, disabled, and internal models', () => {
    expect(isTenantModel(getVideoGenerationModel('mock/i2v-safe')!)).toBe(false)
    expect(isTenantModel(getVideoGenerationModel('aigateway/runway-i2v')!)).toBe(false)
    expect(isTenantModel(getVideoGenerationModel('gateway/i2v-dormant')!)).toBe(false)
    expect(isTenantModel(getVideoGenerationModel('aigateway/veo-t2v-internal')!)).toBe(false)
  })
})
