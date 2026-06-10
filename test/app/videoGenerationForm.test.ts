import { describe, expect, it } from 'vitest'
import { modelsForMode, validateGenerationForm, costPreviewCents } from '~~/app/utils/videoGenerationForm'
import { listSelectableVideoGenerationModels, getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

const selectable = listSelectableVideoGenerationModels()

describe('videoGenerationForm', () => {
  it('filters models by mode', () => {
    // No production video model is selectable until the account has a verified provider.
    expect(modelsForMode(selectable, 'image-to-video')).toHaveLength(0)
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
    // seedance: 30c/second; muapi/t2v-wan still exists via getVideoGenerationModel (180c/generation), even if retired from selectable.
    const perSecond = getVideoGenerationModel('aigateway/seedance-i2v')!   // 30c/sec
    const perGeneration = getVideoGenerationModel('muapi/t2v-wan')!         // 180c/generation
    expect(costPreviewCents(perSecond, 10)).toBe(300)
    expect(costPreviewCents(perGeneration, 5)).toBe(180)
  })
})
