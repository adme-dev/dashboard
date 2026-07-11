import type { VideoGenerationModel, VideoGenerationMode, VideoGenerationSubjectType } from '~~/server/utils/video-generation/types'
import { estimateVideoGenerationCostCents } from '~~/server/utils/video-generation/costs'

export type VideoGenerationAdvancedAction = 'extend-video' | 'end-frame' | 'video-to-video'

export function modelsForMode<T extends VideoGenerationModel>(models: T[], mode: VideoGenerationMode): T[] {
  return models.filter((m) => m.modes.includes(mode))
}

export function costPreviewCents(model: VideoGenerationModel, durationSeconds: number): number {
  return estimateVideoGenerationCostCents(model, durationSeconds)
}

export function supportsAdvancedVideoAction(model: VideoGenerationModel | null, action: VideoGenerationAdvancedAction): boolean {
  if (!model) return false
  if (action === 'extend-video') return model.capabilities.extendVideo
  if (action === 'end-frame') return model.capabilities.endFrame
  return model.capabilities.videoToVideo
}

export interface GenerationJobDraftSource {
  mode: string
  modelId: string
  prompt: string
  sourceAssetIds?: string[] | null
  durationSeconds?: number | null
  subjectType?: string | null
}

export interface GenerationJobDraft {
  mode: VideoGenerationMode
  modelId: string
  prompt: string
  sourceAssetId: string | null
  durationSeconds: number
  subjectType: VideoGenerationSubjectType
}

const SUPPORTED_FORM_MODES: VideoGenerationMode[] = ['image-to-video', 'text-to-video']
const SUBJECT_TYPES: VideoGenerationSubjectType[] = ['vehicle', 'non_vehicle', 'unknown']

export function draftFromGenerationJob(job: GenerationJobDraftSource, models: VideoGenerationModel[]): GenerationJobDraft | null {
  const mode = SUPPORTED_FORM_MODES.find((candidate) => candidate === job.mode)
  if (!mode) return null

  const model = models.find((candidate) => candidate.id === job.modelId)
  if (!model || !model.modes.includes(mode)) return null

  const firstDuration = model.durationsSeconds[0] ?? 5
  const durationSeconds = typeof job.durationSeconds === 'number' && model.durationsSeconds.includes(job.durationSeconds)
    ? job.durationSeconds
    : firstDuration
  const subjectType = SUBJECT_TYPES.find((candidate) => candidate === job.subjectType) ?? 'unknown'
  const sourceAssetId = mode === 'image-to-video' ? (job.sourceAssetIds?.find(Boolean) ?? null) : null

  return {
    mode,
    modelId: model.id,
    prompt: job.prompt,
    sourceAssetId,
    durationSeconds,
    subjectType
  }
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
