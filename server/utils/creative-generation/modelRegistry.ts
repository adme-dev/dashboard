import type { CreativeGenerationModel } from './types'

const MODELS: CreativeGenerationModel[] = [
  {
    id: 'aigateway/recraft-offer-card',
    cfModel: 'recraft/recraftv4-1',
    displayName: 'Recraft V4.1 — offer-card static',
    mode: 'text-to-image',
    allowedSubjectTypes: ['non_vehicle'],
    requiresApprovedSourceAsset: false,
    safetyClass: 'non_vehicle_generative',
    defaultEnabled: true,
  },
  {
    id: 'aigateway/pruna-upscale',
    cfModel: 'pruna/p-image-upscale',
    displayName: 'Pruna P-Image — approved asset upscale',
    mode: 'image-upscale',
    allowedSubjectTypes: ['vehicle', 'non_vehicle'],
    requiresApprovedSourceAsset: true,
    safetyClass: 'vehicle_transform_safe',
    defaultEnabled: true,
  },
]

function copy(model: CreativeGenerationModel): CreativeGenerationModel {
  return { ...model, allowedSubjectTypes: [...model.allowedSubjectTypes] }
}

export function listCreativeGenerationModels(): CreativeGenerationModel[] {
  return MODELS.map(copy)
}

export function listSelectableCreativeGenerationModels(): CreativeGenerationModel[] {
  return MODELS.filter(model => model.defaultEnabled).map(copy)
}

export function getCreativeGenerationModel(id: string): CreativeGenerationModel | null {
  const model = MODELS.find(candidate => candidate.id === id)
  return model ? copy(model) : null
}
