export type AssetIntelligenceActionId =
  | 'asset-analysis'
  | 'background-removal'
  | 'object-segmentation'
  | 'layer-decomposition'
  | 'mask-lift'
  | 'erase-fill'
  | 'mask-only'
  | 'image-edit'
  | 'thumbnail-generation'
  | 'caption-generation'
  | 'timeline-assembly'
  | 'provider-test'

export type AssetDerivativeKind =
  | 'foreground-png'
  | 'mask-png'
  | 'background-png'
  | 'plate-png'
  | 'edited-image'
  | 'layer-package'
  | 'thumbnail'
  | 'caption-vtt'
  | 'analysis-json'

export interface AssetIntelligenceAction {
  id: AssetIntelligenceActionId
  label: string
  description: string
  outputKinds: AssetDerivativeKind[]
  surface: 'tenant' | 'internal'
}

export interface AssetIntelligenceModel {
  id: string
  provider: 'workers-ai' | 'replicate' | 'huggingface' | 'fal' | 'openai' | 'bria' | 'mock'
  gatewayProvider: 'workers-ai' | 'replicate' | 'huggingface' | 'fal' | 'openai' | 'custom'
  displayName: string
  actions: AssetIntelligenceActionId[]
  defaultEnabled: boolean
  cfModel?: string
  notes: string
}

const ACTIONS: AssetIntelligenceAction[] = [
  {
    id: 'asset-analysis',
    label: 'Analyze asset',
    description: 'Tag objects, copy, style, brand usage, and timeline intent.',
    outputKinds: ['analysis-json'],
    surface: 'tenant',
  },
  {
    id: 'background-removal',
    label: 'Remove background',
    description: 'Create an alpha foreground and optional background plate.',
    outputKinds: ['foreground-png', 'mask-png', 'background-png'],
    surface: 'tenant',
  },
  {
    id: 'object-segmentation',
    label: 'Segment object',
    description: 'Generate masks for selected objects or regions.',
    outputKinds: ['mask-png', 'analysis-json'],
    surface: 'tenant',
  },
  {
    id: 'layer-decomposition',
    label: 'Separate layers',
    description: 'Split a flattened image into editable RGBA layers.',
    outputKinds: ['layer-package', 'foreground-png', 'mask-png'],
    surface: 'tenant',
  },
  {
    id: 'mask-lift',
    label: 'Lift highlighted area',
    description: 'Use a brush/highlighter mask to lift embedded graphics or objects into a new alpha layer.',
    outputKinds: ['foreground-png', 'mask-png', 'layer-package'],
    surface: 'tenant',
  },
  {
    id: 'erase-fill',
    label: 'Erase and heal',
    description: 'Remove a highlighted object or graphic and fill the background.',
    outputKinds: ['edited-image', 'mask-png'],
    surface: 'tenant',
  },
  {
    id: 'mask-only',
    label: 'Mask only',
    description: 'Store the highlighted mask for later model operations.',
    outputKinds: ['mask-png'],
    surface: 'tenant',
  },
  {
    id: 'image-edit',
    label: 'Edit image',
    description: 'Use a prompt and optional mask to alter an image derivative.',
    outputKinds: ['edited-image'],
    surface: 'tenant',
  },
  {
    id: 'thumbnail-generation',
    label: 'Create thumbnail',
    description: 'Generate a social thumbnail or cover frame.',
    outputKinds: ['thumbnail'],
    surface: 'tenant',
  },
  {
    id: 'caption-generation',
    label: 'Generate captions',
    description: 'Transcribe audio/video and create caption tracks.',
    outputKinds: ['caption-vtt', 'analysis-json'],
    surface: 'tenant',
  },
  {
    id: 'timeline-assembly',
    label: 'Build draft timeline',
    description: 'Create a reviewable edit plan from project buckets.',
    outputKinds: ['analysis-json'],
    surface: 'tenant',
  },
  {
    id: 'provider-test',
    label: 'Provider test',
    description: 'Internal provider smoke test.',
    outputKinds: ['analysis-json'],
    surface: 'internal',
  },
]

const MODELS: AssetIntelligenceModel[] = [
  {
    id: 'workers-ai/kimi-planner',
    provider: 'workers-ai',
    gatewayProvider: 'workers-ai',
    displayName: 'Kimi planner / vision reasoning',
    actions: ['asset-analysis', 'timeline-assembly'],
    defaultEnabled: true,
    cfModel: '@cf/moonshotai/kimi-k2-instruct',
    notes: 'Planning and multimodal reasoning through Workers AI/Gateway.',
  },
  {
    id: 'replicate/qwen-image-layered',
    provider: 'replicate',
    gatewayProvider: 'replicate',
    displayName: 'Qwen Image Layered',
    actions: ['layer-decomposition', 'mask-lift'],
    defaultEnabled: false,
    notes: 'Specialist flattened-image-to-RGBA-layer decomposition routed through Replicate Gateway.',
  },
  {
    id: 'replicate/sam-2',
    provider: 'replicate',
    gatewayProvider: 'replicate',
    displayName: 'SAM 2 segmentation',
    actions: ['object-segmentation', 'mask-lift', 'mask-only'],
    defaultEnabled: false,
    notes: 'Prompted object masks and future video mask tracking.',
  },
  {
    id: 'bria/rmbg',
    provider: 'bria',
    gatewayProvider: 'custom',
    displayName: 'BRIA RMBG',
    actions: ['background-removal'],
    defaultEnabled: false,
    notes: 'Commercial foreground/background removal for production assets.',
  },
  {
    id: 'huggingface/birefnet',
    provider: 'huggingface',
    gatewayProvider: 'huggingface',
    displayName: 'BiRefNet background matting',
    actions: ['background-removal'],
    defaultEnabled: false,
    notes: 'Fallback source-available background removal/matting model.',
  },
  {
    id: 'workers-ai/flux-edit',
    provider: 'workers-ai',
    gatewayProvider: 'workers-ai',
    displayName: 'Flux image edit',
    actions: ['erase-fill', 'image-edit', 'thumbnail-generation'],
    defaultEnabled: true,
    cfModel: '@cf/black-forest-labs/flux-1-schnell',
    notes: 'Image generation/editing path for masked creative operations where supported.',
  },
  {
    id: 'workers-ai/deepgram-captioning',
    provider: 'workers-ai',
    gatewayProvider: 'workers-ai',
    displayName: 'Deepgram / Whisper captions',
    actions: ['caption-generation'],
    defaultEnabled: true,
    notes: 'Caption/transcript generation through Cloudflare speech model routes.',
  },
]

export function listAssetIntelligenceActions(includeInternal = false): AssetIntelligenceAction[] {
  return ACTIONS.filter(action => includeInternal || action.surface === 'tenant')
}

export function getAssetIntelligenceAction(id: string): AssetIntelligenceAction | null {
  return ACTIONS.find(action => action.id === id) ?? null
}

export function listAssetIntelligenceModels(includeDisabled = true): AssetIntelligenceModel[] {
  return MODELS.filter(model => includeDisabled || model.defaultEnabled)
}

export function getAssetIntelligenceModel(id: string): AssetIntelligenceModel | null {
  return MODELS.find(model => model.id === id) ?? null
}

export function listAssetIntelligenceModelsForAction(actionId: string, includeDisabled = true): AssetIntelligenceModel[] {
  return listAssetIntelligenceModels(includeDisabled).filter(model => model.actions.includes(actionId as AssetIntelligenceActionId))
}

export function defaultModelForAction(actionId: string): AssetIntelligenceModel | null {
  return listAssetIntelligenceModelsForAction(actionId, false)[0]
    ?? listAssetIntelligenceModelsForAction(actionId, true)[0]
    ?? null
}
