import type { VideoGenerationModel, VideoGenerationMode } from '~~/server/utils/video-generation/types'
import { estimateVideoGenerationCostCents } from '~~/server/utils/video-generation/costs'

export function modelsForMode(models: VideoGenerationModel[], mode: VideoGenerationMode): VideoGenerationModel[] {
  return models.filter((m) => m.modes.includes(mode))
}

export function costPreviewCents(model: VideoGenerationModel, durationSeconds: number): number {
  return estimateVideoGenerationCostCents(model, durationSeconds)
}

export interface GenerationFormInput {
  mode: VideoGenerationMode
  model: VideoGenerationModel | null
  prompt: string
  sourceAssetId: string | null
  durationSeconds: number
}

export function validateGenerationForm(input: GenerationFormInput): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!input.model) errors.push('Select a model.')
  if (!input.prompt.trim()) errors.push('A prompt is required.')
  if (input.mode === 'image-to-video' && !input.sourceAssetId) errors.push('A source image is required for image-to-video.')
  if (input.model && !input.model.durationsSeconds.includes(input.durationSeconds)) errors.push('Pick a supported duration.')
  return { valid: errors.length === 0, errors }
}
