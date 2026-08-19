export type CreativeGenerationSubjectType = 'vehicle' | 'non_vehicle'
export type CreativeGenerationSafetyClass = 'non_vehicle_generative' | 'vehicle_transform_safe'
export type CreativeGenerationMode = 'text-to-image' | 'image-upscale'

export interface CreativeGenerationModel {
  id: string
  cfModel: string
  displayName: string
  mode: CreativeGenerationMode
  allowedSubjectTypes: CreativeGenerationSubjectType[]
  requiresApprovedSourceAsset: boolean
  safetyClass: CreativeGenerationSafetyClass
  defaultEnabled: boolean
}

export interface CreativeGenerationResult {
  buffer: Buffer
  contentType: string
  modelId: string
  cfModel: string
  safetyClass: CreativeGenerationSafetyClass
}
