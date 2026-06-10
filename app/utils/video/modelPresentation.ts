import type { VideoGenerationModel } from '~~/server/utils/video-generation/types'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

export interface VideoModelOption extends VideoGenerationModel {
  label: string
}

export function modelLabelFor(modelId: string | null | undefined): string {
  if (!modelId) return 'Unknown model'
  return getVideoGenerationModel(modelId)?.displayName ?? modelId
}

export function selectableVideoModelOptions(models: VideoGenerationModel[]): VideoModelOption[] {
  return models
    .filter((model) => model.defaultEnabled && model.safetyClass !== 'disabled' && model.surface !== 'internal')
    .map((model) => ({
      ...model,
      modes: [...model.modes],
      allowedSubjectTypes: [...model.allowedSubjectTypes],
      label: model.displayName,
    }))
}
