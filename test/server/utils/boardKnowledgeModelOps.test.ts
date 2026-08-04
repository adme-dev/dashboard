import { describe, expect, it } from 'vitest'
import { findEditableAssignmentFeature, supportedProvidersForFeature } from '~~/server/utils/ai/modelAssignments'
import { listCloudflareModelCatalog } from '~~/server/utils/ai/cloudflareModelCatalog'
import { listAiModelCatalogOptions, providerForModel } from '~~/server/utils/ai/modelRegistry'
import {
  BOARD_DOCUMENT_MODELS,
  GATEWAY_DOCUMENT_MODELS,
  parseGatewayModelId
} from '~~/server/utils/boardKnowledge/modelCatalog'

describe('board knowledge Model Ops registration', () => {
  it('exposes one editable high-risk multimodal feature', () => {
    const feature = findEditableAssignmentFeature('board_knowledge_document_extraction')

    expect(feature).toMatchObject({
      ok: true,
      row: {
        provider: 'aigateway',
        modelId: BOARD_DOCUMENT_MODELS.GEMINI_36_FLASH,
        fallback: BOARD_DOCUMENT_MODELS.GEMINI_35_FLASH_LITE,
        modality: 'multimodal',
        riskTier: 'high'
      }
    })
    expect(supportedProvidersForFeature('board_knowledge_document_extraction')).toEqual(['aigateway'])
  })

  it('routes curated upstream prefixes through AI Gateway', () => {
    expect(providerForModel(BOARD_DOCUMENT_MODELS.GEMINI_36_FLASH)).toBe('aigateway')
    expect(providerForModel(BOARD_DOCUMENT_MODELS.PADDLE_OCR_VL_16)).toBe('aigateway')
    expect(parseGatewayModelId(BOARD_DOCUMENT_MODELS.GEMINI_36_FLASH)).toEqual({
      upstreamProvider: 'google-ai-studio',
      providerModelId: 'gemini-3.6-flash'
    })
  })

  it('keeps Hugging Face OCR out of production until its endpoint is verified', () => {
    const paddle = GATEWAY_DOCUMENT_MODELS.find(model => model.id === BOARD_DOCUMENT_MODELS.PADDLE_OCR_VL_16)
    const catalog = listAiModelCatalogOptions().find(model => model.modelId === BOARD_DOCUMENT_MODELS.PADDLE_OCR_VL_16)

    expect(paddle).toMatchObject({
      upstreamProvider: 'huggingface',
      supportsPdf: true,
      supportsStructuredOutput: true
    })
    expect(['preview', 'unknown']).toContain(paddle?.operationalStatus)
    expect(catalog?.status).not.toBe('production')
  })

  it('describes curated document models accurately in the additive Gateway catalog', async () => {
    const result = await listCloudflareModelCatalog({ env: {}, forceRefresh: true })
    const gemini = result.models.find(model => model.modelId === BOARD_DOCUMENT_MODELS.GEMINI_36_FLASH)
    const paddle = result.models.find(model => model.modelId === BOARD_DOCUMENT_MODELS.PADDLE_OCR_VL_16)

    expect(gemini).toMatchObject({
      provider: 'aigateway',
      providerLabel: 'Google AI Studio via AI Gateway',
      task: 'document_extraction',
      modality: 'multimodal',
      capabilities: ['pdf', 'structured_output'],
      source: 'third_party',
      status: 'production'
    })
    expect(paddle).toMatchObject({
      provider: 'aigateway',
      providerLabel: 'Hugging Face via AI Gateway',
      task: 'document_extraction',
      modality: 'multimodal',
      source: 'third_party',
      status: 'preview'
    })
  })
})
