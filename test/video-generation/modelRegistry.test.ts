import { describe, expect, it } from 'vitest'
import {
  getVideoGenerationModel,
  listSelectableVideoGenerationModels,
} from '~~/server/utils/video-generation/modelRegistry'

describe('video generation model registry', () => {
  it('returns null for unknown models', () => {
    expect(getVideoGenerationModel('missing-model')).toBeNull()
  })

  it('keeps dormant provider models out of normal selectable models', () => {
    expect(listSelectableVideoGenerationModels().map((m) => m.id)).toEqual(['mock/i2v-safe'])
  })

  it('describes image-to-video vehicle-safe capabilities', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')

    expect(model?.modes).toContain('image-to-video')
    expect(model?.requiresApprovedSourceAsset).toBe(true)
    expect(model?.safetyClass).toBe('vehicle_i2v_safe')
  })
})
