import { describe, expect, it } from 'vitest'
import { isTenantModel } from '~~/server/utils/video-generation/surface'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

describe('isTenantModel', () => {
  it('allows tenant-surface and unmarked models', () => {
    expect(isTenantModel(getVideoGenerationModel('aigateway/seedance-i2v')!)).toBe(true)
    expect(isTenantModel(getVideoGenerationModel('mock/i2v-safe')!)).toBe(true) // no surface field → allowed
  })
  it('rejects internal-surface models', () => {
    expect(isTenantModel(getVideoGenerationModel('aigateway/veo-t2v-internal')!)).toBe(false)
  })
})
