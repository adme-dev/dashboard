import { describe, expect, it } from 'vitest'
import { modelsForMode, validateGenerationForm, costPreviewCents, draftFromGenerationJob, supportsAdvancedVideoAction } from '~~/app/utils/videoGenerationForm'
import { listSelectableVideoGenerationModels, getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

const selectable = listSelectableVideoGenerationModels()

describe('videoGenerationForm', () => {
  it('filters models by mode', () => {
    expect(modelsForMode(selectable, 'image-to-video').map((m) => m.id)).toEqual([
      'aigateway/seedance-i2v',
      'aigateway/seedance-2-i2v',
      'aigateway/wan-i2v',
      'aigateway/hailuo-i2v',
      'aigateway/vidu-i2v',
    ])
    const t2v = modelsForMode(selectable, 'text-to-video').map((m) => m.id)
    expect(t2v).toHaveLength(0)
    expect(t2v).not.toContain('aigateway/veo-t2v-internal')
  })

  it('requires a prompt, and a source asset for image-to-video', () => {
    const i2v = getVideoGenerationModel('aigateway/seedance-i2v')!
    expect(validateGenerationForm({ mode: 'image-to-video', model: i2v, prompt: '', sourceAssetId: null, durationSeconds: 5 }).valid).toBe(false)
    expect(validateGenerationForm({ mode: 'image-to-video', model: i2v, prompt: 'go', sourceAssetId: null, durationSeconds: 5 }).errors).toContain('A source image is required for image-to-video.')
    expect(validateGenerationForm({ mode: 'image-to-video', model: i2v, prompt: 'go', sourceAssetId: 'a1', durationSeconds: 5 }).valid).toBe(true)
  })

  it('computes cost preview using the model cost unit', () => {
    // seedance: 30c/second; mock/t2v-broll remains a dormant per-generation model for cost tests.
    const perSecond = getVideoGenerationModel('aigateway/seedance-i2v')!   // 30c/sec
    const perGeneration = getVideoGenerationModel('mock/t2v-broll')!        // 200c/generation
    expect(costPreviewCents(perSecond, 10)).toBe(300)
    expect(costPreviewCents(perGeneration, 5)).toBe(200)
  })

  it('clones supported prior jobs into a new generation draft', () => {
    expect(draftFromGenerationJob({
      mode: 'image-to-video',
      modelId: 'aigateway/seedance-i2v',
      prompt: 'slow push-in on a red SUV',
      sourceAssetIds: ['source-1'],
      durationSeconds: 5,
      subjectType: 'vehicle'
    }, selectable)).toEqual({
      mode: 'image-to-video',
      modelId: 'aigateway/seedance-i2v',
      prompt: 'slow push-in on a red SUV',
      sourceAssetId: 'source-1',
      durationSeconds: 5,
      subjectType: 'vehicle'
    })
  })

  it('rejects unsupported prior jobs and normalizes stale duration metadata', () => {
    expect(draftFromGenerationJob({
      mode: 'video-extension',
      modelId: 'aigateway/seedance-i2v',
      prompt: 'extend this',
      durationSeconds: 5
    }, selectable)).toBeNull()

    expect(draftFromGenerationJob({
      mode: 'image-to-video',
      modelId: 'missing-model',
      prompt: 'retry this',
      durationSeconds: 5
    }, selectable)).toBeNull()

    expect(draftFromGenerationJob({
      mode: 'image-to-video',
      modelId: 'aigateway/seedance-i2v',
      prompt: 'retry this',
      sourceAssetIds: ['source-2'],
      durationSeconds: 99,
      subjectType: 'unknown'
    }, selectable)?.durationSeconds).toBe(getVideoGenerationModel('aigateway/seedance-i2v')!.durationsSeconds[0])
  })

  it('hides future advanced edit actions unless model capabilities opt in', () => {
    const model = getVideoGenerationModel('aigateway/seedance-i2v')!
    expect(supportsAdvancedVideoAction(model, 'extend-video')).toBe(false)
    expect(supportsAdvancedVideoAction(model, 'end-frame')).toBe(false)
    expect(supportsAdvancedVideoAction(model, 'video-to-video')).toBe(false)
    expect(supportsAdvancedVideoAction(null, 'extend-video')).toBe(false)

    const extensionModel = {
      ...model,
      capabilities: {
        ...model.capabilities,
        extendVideo: true,
      }
    }
    expect(supportsAdvancedVideoAction(extensionModel, 'extend-video')).toBe(true)
    expect(supportsAdvancedVideoAction(extensionModel, 'end-frame')).toBe(false)
  })
})
