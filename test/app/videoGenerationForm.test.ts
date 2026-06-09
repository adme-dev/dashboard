import { describe, expect, it } from 'vitest'
import { modelsForMode, validateGenerationForm, costPreviewCents } from '~~/app/utils/videoGenerationForm'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'

const models = listSelectableVideoGenerationModels()

describe('videoGenerationForm', () => {
  it('filters models by mode', () => {
    expect(modelsForMode(models, 'image-to-video').map((m) => m.id)).toContain('muapi/i2v-kling')
    expect(modelsForMode(models, 'text-to-video').map((m) => m.id)).toContain('muapi/t2v-wan')
    expect(modelsForMode(models, 'image-to-video').map((m) => m.id)).not.toContain('muapi/t2v-wan')
  })

  it('requires a prompt, and a source asset for image-to-video', () => {
    const i2v = models.find((m) => m.id === 'muapi/i2v-kling')!
    expect(validateGenerationForm({ mode: 'image-to-video', model: i2v, prompt: '', sourceAssetId: null, durationSeconds: 5 }).valid).toBe(false)
    expect(validateGenerationForm({ mode: 'image-to-video', model: i2v, prompt: 'go', sourceAssetId: null, durationSeconds: 5 }).errors).toContain('A source image is required for image-to-video.')
    expect(validateGenerationForm({ mode: 'image-to-video', model: i2v, prompt: 'go', sourceAssetId: 'a1', durationSeconds: 5 }).valid).toBe(true)
  })

  it('computes cost preview using the model cost unit', () => {
    const i2v = models.find((m) => m.id === 'muapi/i2v-kling')!  // 45c/second
    const t2v = models.find((m) => m.id === 'muapi/t2v-wan')!    // 180c/generation
    expect(costPreviewCents(i2v, 10)).toBe(450)
    expect(costPreviewCents(t2v, 5)).toBe(180)
  })
})
