export const BOARD_DOCUMENT_MODELS = {
  GEMINI_36_FLASH: 'google-ai-studio/gemini-3.6-flash',
  GEMINI_35_FLASH_LITE: 'google-ai-studio/gemini-3.5-flash-lite',
  PADDLE_OCR_VL_16: 'huggingface/PaddlePaddle/PaddleOCR-VL-1.6'
} as const

export type BoardDocumentModelId = typeof BOARD_DOCUMENT_MODELS[keyof typeof BOARD_DOCUMENT_MODELS]
export type GatewayUpstreamProvider = 'google-ai-studio' | 'huggingface'
export type GatewayDocumentModelStatus = 'production' | 'preview' | 'deprecated' | 'unknown'

export interface GatewayDocumentModel {
  id: BoardDocumentModelId
  label: string
  upstreamProvider: GatewayUpstreamProvider
  supportsPdf: boolean
  supportsStructuredOutput: boolean
  operationalStatus: GatewayDocumentModelStatus
}

export const GATEWAY_DOCUMENT_MODELS: readonly GatewayDocumentModel[] = [
  {
    id: BOARD_DOCUMENT_MODELS.GEMINI_36_FLASH,
    label: 'Gemini 3.6 Flash',
    upstreamProvider: 'google-ai-studio',
    supportsPdf: true,
    supportsStructuredOutput: true,
    operationalStatus: 'production'
  },
  {
    id: BOARD_DOCUMENT_MODELS.GEMINI_35_FLASH_LITE,
    label: 'Gemini 3.5 Flash-Lite',
    upstreamProvider: 'google-ai-studio',
    supportsPdf: true,
    supportsStructuredOutput: true,
    operationalStatus: 'production'
  },
  {
    id: BOARD_DOCUMENT_MODELS.PADDLE_OCR_VL_16,
    label: 'PaddleOCR-VL 1.6',
    upstreamProvider: 'huggingface',
    supportsPdf: true,
    supportsStructuredOutput: true,
    operationalStatus: 'preview'
  }
] as const

export function gatewayDocumentModelForId(modelId: string): GatewayDocumentModel | null {
  return GATEWAY_DOCUMENT_MODELS.find(model => model.id === modelId) ?? null
}

export function parseGatewayModelId(modelId: string): {
  upstreamProvider: GatewayUpstreamProvider
  providerModelId: string
} {
  const model = gatewayDocumentModelForId(modelId)
  if (!model) throw new Error('board_document_model_not_catalogued')
  return {
    upstreamProvider: model.upstreamProvider,
    providerModelId: modelId.slice(model.upstreamProvider.length + 1)
  }
}
