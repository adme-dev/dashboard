import { describe, expect, it } from 'vitest'
import {
  listVideoGenerationModels,
  getVideoGenerationModel,
  listSelectableVideoGenerationModels,
} from '~~/server/utils/video-generation/modelRegistry'

describe('video generation model registry', () => {
  it('returns null for unknown models', () => {
    expect(getVideoGenerationModel('missing-model')).toBeNull()
  })

  it('keeps disabled and dormant models out of normal selectable models', () => {
    const ids = listSelectableVideoGenerationModels().map((m) => m.id)
    expect(ids).not.toContain('gateway/i2v-dormant')
    expect(ids).not.toContain('mock/t2v-broll')
    // Mock models return fake output URLs, and unsupported/retired providers stay hidden.
    expect(ids).not.toContain('mock/i2v-safe')
    expect(ids).toContain('aigateway/seedance-i2v')
    expect(ids).toContain('aigateway/seedance-2-i2v')
    expect(ids).toContain('aigateway/wan-i2v')
    expect(ids).toContain('aigateway/hailuo-i2v')
  })

  it('classifies the full Seedance and Vidu additions without relaxing vehicle source governance', () => {
    const seedance = getVideoGenerationModel('aigateway/seedance-2-i2v')!
    expect(seedance).toMatchObject({
      cfModel: 'bytedance/seedance-2.0',
      supportsNativeAudio: true,
      requiresApprovedSourceAsset: true,
      safetyClass: 'vehicle_i2v_safe',
      defaultEnabled: true,
    })
    expect(seedance.durationsSeconds).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(seedance.durationsSeconds).not.toContain(30)

    const vidu = getVideoGenerationModel('aigateway/vidu-i2v')!
    expect(vidu).toMatchObject({
      cfModel: 'vidu/q3-pro',
      requiresApprovedSourceAsset: true,
      safetyClass: 'vehicle_i2v_safe',
      defaultEnabled: true,
    })
    expect(vidu.capabilities.endFrame).toBe(true)
  })

  it('describes image-to-video vehicle-safe capabilities', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')

    expect(model?.modes).toContain('image-to-video')
    expect(model?.requiresApprovedSourceAsset).toBe(true)
    expect(model?.safetyClass).toBe('vehicle_i2v_safe')
  })

  it('does not register MuAPI models in the active model registry', () => {
    expect(getVideoGenerationModel('muapi/i2v-kling')).toBeNull()
    expect(getVideoGenerationModel('muapi/t2v-wan')).toBeNull()
    const ids = listSelectableVideoGenerationModels().map((x) => x.id)
    expect(ids).not.toContain('muapi/i2v-kling')
    expect(ids).not.toContain('muapi/t2v-wan')
  })

  it('does not set MuAPI mapping on Cloudflare or mock models', () => {
    expect(getVideoGenerationModel('mock/i2v-safe')!.muapi).toBeUndefined()
    expect(getVideoGenerationModel('aigateway/seedance-i2v')!.muapi).toBeUndefined()
  })

  it('keeps verified CF AI Gateway image-to-video models selectable', () => {
    const m = getVideoGenerationModel('aigateway/seedance-i2v')
    expect(m).toBeTruthy()
    expect(m!.provider).toBe('aigateway')
    expect(m!.surface).toBe('tenant')
    expect(m!.modality).toBe('i2v')
    expect(m!.modes).toContain('image-to-video')
    expect(m!.cfModel).toBe('bytedance/seedance-2.0-fast')
    expect(listSelectableVideoGenerationModels().map((x) => x.id)).toContain('aigateway/seedance-i2v')
  })

  it('registers an internal-only CF t2v model that is NOT tenant-selectable', () => {
    const t = getVideoGenerationModel('aigateway/veo-t2v-internal')
    expect(t!.surface).toBe('internal')
    const ids = listSelectableVideoGenerationModels().map((x) => x.id)
    expect(ids).not.toContain('aigateway/veo-t2v-internal')
  })

  it('has only verified CF image-to-video models selectable by default', () => {
    const ids = listSelectableVideoGenerationModels().map((x) => x.id)
    expect(ids).not.toContain('muapi/i2v-kling')
    expect(ids).not.toContain('muapi/t2v-wan')
    expect(ids).toEqual([
      'aigateway/seedance-i2v',
      'aigateway/seedance-2-i2v',
      'aigateway/wan-i2v',
      'aigateway/hailuo-i2v',
      'aigateway/vidu-i2v',
    ])
  })

  it('keeps advanced edit capabilities conservative except the verified Vidu end-frame route', () => {
    for (const model of listVideoGenerationModels()) {
      expect(model.capabilities).toEqual({
        extendVideo: false,
        endFrame: model.id === 'aigateway/vidu-i2v',
        videoToVideo: false,
      })
    }
  })

  it('returns copied capability metadata instead of shared mutable registry state', () => {
    const first = getVideoGenerationModel('aigateway/seedance-i2v')!
    first.capabilities.extendVideo = true

    expect(getVideoGenerationModel('aigateway/seedance-i2v')!.capabilities.extendVideo).toBe(false)
  })
})
