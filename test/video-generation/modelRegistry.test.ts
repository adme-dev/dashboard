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
    expect(ids).toContain('aigateway/wan-i2v')
    expect(ids).toContain('aigateway/hailuo-i2v')
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
      'aigateway/wan-i2v',
      'aigateway/hailuo-i2v',
    ])
  })

  it('defaults every current model to conservative advanced edit capabilities', () => {
    for (const model of listVideoGenerationModels()) {
      expect(model.capabilities).toEqual({
        extendVideo: false,
        endFrame: false,
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
