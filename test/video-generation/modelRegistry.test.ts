import { describe, expect, it } from 'vitest'
import {
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
    expect(ids).toContain('mock/i2v-safe')
  })

  it('describes image-to-video vehicle-safe capabilities', () => {
    const model = getVideoGenerationModel('mock/i2v-safe')

    expect(model?.modes).toContain('image-to-video')
    expect(model?.requiresApprovedSourceAsset).toBe(true)
    expect(model?.safetyClass).toBe('vehicle_i2v_safe')
  })

  it('exposes a real muapi i2v model with an endpoint mapping', () => {
    const m = getVideoGenerationModel('muapi/i2v-kling')
    expect(m).toBeTruthy()
    expect(m!.provider).toBe('muapi')
    expect(m!.modes).toContain('image-to-video')
    expect(m!.muapi?.endpoint).toBe('generate_kling_i2v')
  })

  it('exposes a real muapi t2v model (retired from selectable — kept in registry)', () => {
    const t = getVideoGenerationModel('muapi/t2v-wan')
    expect(t!.provider).toBe('muapi')
    expect(t!.modes).toContain('text-to-video')
    // muapi models are retired (defaultEnabled: false) — they exist in the registry but are
    // no longer in the selectable set; aigateway/seedance-i2v replaces them for tenants.
    const ids = listSelectableVideoGenerationModels().map((x) => x.id)
    expect(ids).not.toContain('muapi/t2v-wan')
  })

  it('does not set muapi mapping on non-muapi models', () => {
    expect(getVideoGenerationModel('mock/i2v-safe')!.muapi).toBeUndefined()
  })

  it('exposes a tenant-facing CF AI Gateway i2v model with a cfModel mapping', () => {
    const m = getVideoGenerationModel('aigateway/seedance-i2v')
    expect(m).toBeTruthy()
    expect(m!.provider).toBe('aigateway')
    expect(m!.surface).toBe('tenant')
    expect(m!.modality).toBe('i2v')
    expect(m!.modes).toContain('image-to-video')
    expect(m!.cfModel).toBe('bytedance/seedance-2.0-fast')
  })

  it('registers an internal-only CF t2v model that is NOT tenant-selectable', () => {
    const t = getVideoGenerationModel('aigateway/veo-t2v-internal')
    expect(t!.surface).toBe('internal')
    const ids = listSelectableVideoGenerationModels().map((x) => x.id)
    expect(ids).not.toContain('aigateway/veo-t2v-internal')
  })

  it('retires muapi models from the default selectable set', () => {
    const ids = listSelectableVideoGenerationModels().map((x) => x.id)
    expect(ids).not.toContain('muapi/i2v-kling')
    expect(ids).not.toContain('muapi/t2v-wan')
    expect(ids).toContain('aigateway/seedance-i2v')
  })
})
