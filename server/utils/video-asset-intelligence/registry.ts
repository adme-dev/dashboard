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

/** An action as offered to the studio: says whether running it can produce a result today. */
export interface AssetIntelligenceActionOffer extends AssetIntelligenceAction {
  available: boolean
  unavailableReason: string | null
}

// Actions the deployed worker can carry through to a result. Everything else is
// catalogued for later but has no provider runtime, so it must not be queued.
const RUNNABLE_ACTIONS = new Set<AssetIntelligenceActionId>([
  'asset-analysis',
  'background-removal',
  'layer-decomposition',
  'mask-lift',
  'erase-fill',
  'mask-only',
  'image-edit',
])

export function isAssetIntelligenceActionRunnable(id: string): boolean {
  return RUNNABLE_ACTIONS.has(id as AssetIntelligenceActionId)
}

export function assetIntelligenceUnavailableReason(action: Pick<AssetIntelligenceAction, 'id' | 'label'>): string | null {
  return isAssetIntelligenceActionRunnable(action.id) ? null : `${action.label} is not available yet.`
}

export interface AssetIntelligenceModel {
  id: string
  provider: 'workers-ai' | 'aigateway' | 'replicate' | 'huggingface' | 'fal' | 'openai' | 'bria' | 'mock'
  gatewayProvider: 'workers-ai' | 'aigateway' | 'replicate' | 'huggingface' | 'fal' | 'openai' | 'custom'
  displayName: string
  actions: AssetIntelligenceActionId[]
  defaultEnabled: boolean
  cfModel?: string
  /** True when every run is billed per call through AI Gateway unified billing. */
  meteredPerRun?: boolean
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
    description: 'Keep the main subject on a transparent background.',
    outputKinds: ['foreground-png'],
    // Listed in the studio as "not available yet" until a provider can run it.
    surface: 'tenant',
  },
  {
    id: 'object-segmentation',
    label: 'Segment object',
    description: 'Generate masks for selected objects or regions.',
    outputKinds: ['mask-png', 'analysis-json'],
    surface: 'internal',
  },
  {
    id: 'layer-decomposition',
    label: 'Separate layers',
    description: 'Split a flattened picture into a base and separate cut-out layers for text, logos and products.',
    outputKinds: ['layer-package', 'foreground-png', 'background-png'],
    // Listed in the studio as "not available yet" until a provider can run it.
    surface: 'tenant',
  },
  {
    id: 'mask-lift',
    label: 'Lift highlighted area',
    description: 'Paint over a graphic or object to lift it out as a transparent cut-out.',
    outputKinds: ['foreground-png'],
    // Listed in the studio as "not available yet" until a provider can run it.
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
    id: 'aigateway/seedream-5.5',
    provider: 'aigateway',
    gatewayProvider: 'aigateway',
    displayName: 'Seedream 5.5 layers',
    actions: ['layer-decomposition', 'mask-lift', 'background-removal'],
    defaultEnabled: true,
    cfModel: 'bytedance/seedream-5.5',
    meteredPerRun: true,
    notes: 'Cuts elements out as RGBA layers through Cloudflare AI Gateway. Separate layers also uses google/gemini-3.8-flash to find the elements. The gateway does not expose Seedream\'s native layer decomposition, so layers are made one element at a time.',
  },
  {
    id: 'replicate/sam-2',
    provider: 'replicate',
    gatewayProvider: 'replicate',
    displayName: 'SAM 2 segmentation',
    // Not reachable through AI Gateway, so it is not a Lift fallback. Kept as the
    // label for stored masks and for mask tracking on video later.
    actions: ['object-segmentation', 'mask-only'],
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
    displayName: 'FLUX.2 klein image edit',
    actions: ['erase-fill', 'image-edit', 'thumbnail-generation'],
    defaultEnabled: true,
    cfModel: '@cf/black-forest-labs/flux-2-klein-4b',
    notes: 'Edits a reference picture. Erase pastes only the painted region back onto the original.',
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

export function listAssetIntelligenceActions(includeInternal = false): AssetIntelligenceActionOffer[] {
  return ACTIONS
    .filter(action => includeInternal || action.surface === 'tenant')
    .map(action => ({
      ...action,
      available: isAssetIntelligenceActionRunnable(action.id),
      unavailableReason: assetIntelligenceUnavailableReason(action),
    }))
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

/** True when running this action is billed per call through AI Gateway. */
export function isAssetIntelligenceActionMetered(actionId: string): boolean {
  return Boolean(defaultModelForAction(actionId)?.meteredPerRun)
}

export function defaultModelForAction(actionId: string): AssetIntelligenceModel | null {
  return listAssetIntelligenceModelsForAction(actionId, false)[0]
    ?? listAssetIntelligenceModelsForAction(actionId, true)[0]
    ?? null
}
