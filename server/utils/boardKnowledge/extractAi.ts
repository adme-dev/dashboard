import { Buffer } from 'node:buffer'
import { z } from 'zod'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'
import { resolveAiModelAssignment } from '~~/server/utils/ai/modelAssignments'
import type { ExtractionBlock } from '~~/server/utils/boardKnowledge/extractNative'
import {
  BOARD_DOCUMENT_MODELS,
  gatewayDocumentModelForId,
  parseGatewayModelId
} from '~~/server/utils/boardKnowledge/modelCatalog'

const FEATURE_KEY = 'board_knowledge_document_extraction'

export const BOARD_KNOWLEDGE_AI_INLINE_BATCH_LIMIT_BYTES = 15 * 1024 * 1024

const extractionBlockSchema = z.object({
  kind: z.enum(['text', 'table', 'heading']),
  content: z.string().trim().min(1).max(250_000),
  heading: z.string().trim().min(1).max(1_000).optional(),
  pageStart: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
  sheetName: z.string().trim().min(1).max(500).optional(),
  slideNumber: z.number().int().positive().optional()
}).superRefine((block, context) => {
  if (block.pageStart && block.pageEnd && block.pageEnd < block.pageStart) {
    context.addIssue({ code: 'custom', message: 'pageEnd must not precede pageStart' })
  }
})

const extractionPayloadSchema = z.object({
  blocks: z.array(extractionBlockSchema).min(1).max(2_000),
  warnings: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  confidence: z.number().min(0).max(1)
}).superRefine((payload, context) => {
  const totalCharacters = payload.blocks.reduce((total, block) => total + block.content.length, 0)
  if (totalCharacters > 2_000_000) {
    context.addIssue({ code: 'custom', message: 'aggregate extracted text exceeds the safe limit' })
  }
})

const googleGatewayResponseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(z.object({ text: z.string() })).min(1)
    })
  })).min(1),
  usageMetadata: z.object({
    promptTokenCount: z.number().int().nonnegative().optional(),
    candidatesTokenCount: z.number().int().nonnegative().optional(),
    totalTokenCount: z.number().int().nonnegative().optional()
  }).optional()
})

export interface BoardKnowledgeAiEnvironment {
  AI_GATEWAY_URL?: string
  AI_GATEWAY_AUTH_TOKEN?: string
  GOOGLE_AI_STUDIO_API_KEY?: string
  GOOGLE_AI_STUDIO_PAID?: string
  HUGGINGFACE_API_TOKEN?: string
  HUGGINGFACE_BOARD_KNOWLEDGE_PRODUCTION_READY?: string
}

export interface ExtractDocumentWithAiInput {
  submissionId: string
  documentClass: string
  batchNumber: number
  bytes: Uint8Array
  mimeType: string
  env?: BoardKnowledgeAiEnvironment
  fetcher?: typeof fetch
}

export interface AiDocumentExtractionResult {
  method: 'gemini' | 'huggingface'
  provider: 'google-ai-studio' | 'huggingface'
  model: string
  blocks: ExtractionBlock[]
  warnings: string[]
  confidence: number
}

class BoardKnowledgeAiError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false
  ) {
    super(code)
    this.name = 'BoardKnowledgeAiError'
  }
}

function present(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function resolveAiGatewayRoot(value: string | undefined): string {
  const configured = present(value)
  if (!configured) throw new BoardKnowledgeAiError('ai_gateway_not_configured')

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new BoardKnowledgeAiError('ai_gateway_url_invalid')
  }
  if (url.protocol !== 'https:' || url.hostname !== 'gateway.ai.cloudflare.com') {
    throw new BoardKnowledgeAiError('ai_gateway_url_invalid')
  }

  url.pathname = url.pathname
    .replace(/\/(groq|anthropic|perplexity-ai|google-ai-studio|huggingface)\/?$/, '')
    .replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}

function privacyHeaders(env: BoardKnowledgeAiEnvironment): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cf-aig-collect-log-payload': 'false',
    'cf-aig-skip-cache': 'true'
  }
  const gatewayToken = present(env.AI_GATEWAY_AUTH_TOKEN)
  if (gatewayToken) {
    headers['cf-aig-authorization'] = `Bearer ${gatewayToken.replace(/^Bearer\s+/i, '')}`
  }
  return headers
}

function errorCode(error: unknown): string {
  if (error instanceof BoardKnowledgeAiError) return error.code
  return 'ai_document_gateway_request_failed'
}

function retryableGatewayStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function safeTelemetry(input: ExtractDocumentWithAiInput) {
  return {
    submissionId: input.submissionId,
    documentClass: input.documentClass,
    batchNumber: input.batchNumber
  }
}

async function recordAttempt(input: {
  request: ExtractDocumentWithAiInput
  modelId: string
  provider: string
  fallbackUsed: boolean
  startedAt: number
  status: 'success' | 'error'
  usage?: { promptTokens?: number, completionTokens?: number, totalTokens?: number }
  error?: unknown
}) {
  await recordAiInvocation({
    featureKey: FEATURE_KEY,
    provider: input.provider,
    modelId: input.modelId,
    gatewayUsed: true,
    fallbackUsed: input.fallbackUsed,
    promptTokens: input.usage?.promptTokens ?? null,
    completionTokens: input.usage?.completionTokens ?? null,
    totalTokens: input.usage?.totalTokens ?? null,
    status: input.status,
    errorCode: input.error ? errorCode(input.error) : null,
    latencyMs: Date.now() - input.startedAt,
    metadata: safeTelemetry(input.request)
  })
}

function googleRequestBody(input: ExtractDocumentWithAiInput) {
  return {
    contents: [{
      role: 'user',
      parts: [
        {
          text: 'Extract this business document faithfully. Preserve headings, tables, page references, and reading order. Return only the requested JSON structure. Do not infer facts that are not visible.'
        },
        {
          inlineData: {
            mimeType: input.mimeType,
            data: Buffer.from(input.bytes).toString('base64')
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        required: ['blocks', 'warnings', 'confidence'],
        properties: {
          blocks: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['kind', 'content'],
              properties: {
                kind: { type: 'STRING', enum: ['text', 'table', 'heading'] },
                content: { type: 'STRING' },
                heading: { type: 'STRING' },
                pageStart: { type: 'INTEGER' },
                pageEnd: { type: 'INTEGER' },
                sheetName: { type: 'STRING' },
                slideNumber: { type: 'INTEGER' }
              }
            }
          },
          warnings: { type: 'ARRAY', items: { type: 'STRING' } },
          confidence: { type: 'NUMBER' }
        }
      }
    }
  }
}

async function callGoogle(
  input: ExtractDocumentWithAiInput,
  modelId: string,
  fallbackUsed: boolean,
  env: BoardKnowledgeAiEnvironment,
  fetcher: typeof fetch
): Promise<AiDocumentExtractionResult> {
  const startedAt = Date.now()
  const { providerModelId } = parseGatewayModelId(modelId)
  const apiKey = present(env.GOOGLE_AI_STUDIO_API_KEY)
  if (!apiKey || env.GOOGLE_AI_STUDIO_PAID !== 'true') {
    const error = new BoardKnowledgeAiError('paid_google_ai_studio_not_configured')
    await recordAttempt({ request: input, modelId, provider: 'google-ai-studio', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }

  const url = `${resolveAiGatewayRoot(env.AI_GATEWAY_URL)}/google-ai-studio/v1/models/${encodeURIComponent(providerModelId)}:generateContent`
  let response: Response
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: { ...privacyHeaders(env), 'x-goog-api-key': apiKey },
      body: JSON.stringify(googleRequestBody(input))
    })
  } catch {
    const error = new BoardKnowledgeAiError('ai_document_gateway_request_failed', true)
    await recordAttempt({ request: input, modelId, provider: 'google-ai-studio', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }

  if (!response.ok) {
    const error = new BoardKnowledgeAiError(
      `ai_document_gateway_http_${response.status}`,
      retryableGatewayStatus(response.status)
    )
    await recordAttempt({ request: input, modelId, provider: 'google-ai-studio', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }

  let responseJson: unknown
  try {
    responseJson = await response.json()
  } catch {
    const error = new BoardKnowledgeAiError('ai_document_response_invalid')
    await recordAttempt({ request: input, modelId, provider: 'google-ai-studio', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }

  const googleResponse = googleGatewayResponseSchema.safeParse(responseJson)
  if (!googleResponse.success) {
    const error = new BoardKnowledgeAiError('ai_document_response_invalid')
    await recordAttempt({ request: input, modelId, provider: 'google-ai-studio', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }

  let structured: unknown
  try {
    structured = JSON.parse(googleResponse.data.candidates[0]!.content.parts.map(part => part.text).join(''))
  } catch {
    const error = new BoardKnowledgeAiError('ai_document_response_invalid')
    await recordAttempt({ request: input, modelId, provider: 'google-ai-studio', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }
  const payload = extractionPayloadSchema.safeParse(structured)
  if (!payload.success) {
    const error = new BoardKnowledgeAiError('ai_document_response_invalid')
    await recordAttempt({ request: input, modelId, provider: 'google-ai-studio', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }

  const usageMetadata = googleResponse.data.usageMetadata
  await recordAttempt({
    request: input,
    modelId,
    provider: 'google-ai-studio',
    fallbackUsed,
    startedAt,
    status: 'success',
    usage: {
      promptTokens: usageMetadata?.promptTokenCount,
      completionTokens: usageMetadata?.candidatesTokenCount,
      totalTokens: usageMetadata?.totalTokenCount
    }
  })
  return {
    method: 'gemini',
    provider: 'google-ai-studio',
    model: modelId,
    blocks: payload.data.blocks,
    warnings: payload.data.warnings,
    confidence: payload.data.confidence
  }
}

function huggingFaceStructuredPayload(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'blocks' in value) return value
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || typeof candidate !== 'object') throw new BoardKnowledgeAiError('ai_document_response_invalid')
  const generatedText = (candidate as { generated_text?: unknown }).generated_text
  if (typeof generatedText !== 'string') throw new BoardKnowledgeAiError('ai_document_response_invalid')
  try {
    return JSON.parse(generatedText)
  } catch {
    throw new BoardKnowledgeAiError('ai_document_response_invalid')
  }
}

async function callHuggingFace(
  input: ExtractDocumentWithAiInput,
  modelId: string,
  fallbackUsed: boolean,
  env: BoardKnowledgeAiEnvironment,
  fetcher: typeof fetch
): Promise<AiDocumentExtractionResult> {
  const startedAt = Date.now()
  const token = present(env.HUGGINGFACE_API_TOKEN)
  if (!token) throw new BoardKnowledgeAiError('paid_huggingface_not_configured')
  const { providerModelId } = parseGatewayModelId(modelId)
  const encodedModelPath = providerModelId.split('/').map(segment => encodeURIComponent(segment)).join('/')
  const url = `${resolveAiGatewayRoot(env.AI_GATEWAY_URL)}/huggingface/${encodedModelPath}`

  let response: Response
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: {
        ...privacyHeaders(env),
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        inputs: {
          mimeType: input.mimeType,
          data: Buffer.from(input.bytes).toString('base64')
        },
        parameters: {
          response_format: 'json',
          task: 'document_extraction'
        }
      })
    })
  } catch {
    const error = new BoardKnowledgeAiError('ai_document_gateway_request_failed', true)
    await recordAttempt({ request: input, modelId, provider: 'huggingface', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }

  if (!response.ok) {
    const error = new BoardKnowledgeAiError(
      `ai_document_gateway_http_${response.status}`,
      retryableGatewayStatus(response.status)
    )
    await recordAttempt({ request: input, modelId, provider: 'huggingface', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }

  let structured: unknown
  try {
    structured = huggingFaceStructuredPayload(await response.json())
  } catch {
    const error = new BoardKnowledgeAiError('ai_document_response_invalid')
    await recordAttempt({ request: input, modelId, provider: 'huggingface', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }
  const payload = extractionPayloadSchema.safeParse(structured)
  if (!payload.success) {
    const error = new BoardKnowledgeAiError('ai_document_response_invalid')
    await recordAttempt({ request: input, modelId, provider: 'huggingface', fallbackUsed, startedAt, status: 'error', error })
    throw error
  }

  await recordAttempt({ request: input, modelId, provider: 'huggingface', fallbackUsed, startedAt, status: 'success' })
  return {
    method: 'huggingface',
    provider: 'huggingface',
    model: modelId,
    blocks: payload.data.blocks,
    warnings: payload.data.warnings,
    confidence: payload.data.confidence
  }
}

async function callModel(
  input: ExtractDocumentWithAiInput,
  modelId: string,
  fallbackUsed: boolean,
  env: BoardKnowledgeAiEnvironment,
  fetcher: typeof fetch
): Promise<AiDocumentExtractionResult> {
  const model = gatewayDocumentModelForId(modelId)
  if (!model) throw new BoardKnowledgeAiError('board_document_model_not_catalogued')

  if (model.upstreamProvider === 'huggingface') {
    const startedAt = Date.now()
    const ready = model.operationalStatus === 'production'
      && env.HUGGINGFACE_BOARD_KNOWLEDGE_PRODUCTION_READY === 'true'
      && Boolean(present(env.HUGGINGFACE_API_TOKEN))
    if (!ready) {
      const error = new BoardKnowledgeAiError('model_endpoint_unverified')
      await recordAttempt({ request: input, modelId, provider: 'huggingface', fallbackUsed, startedAt, status: 'error', error })
      throw error
    }
    return callHuggingFace(input, modelId, fallbackUsed, env, fetcher)
  }

  return callGoogle(input, modelId, fallbackUsed, env, fetcher)
}

export async function extractDocumentWithAi(input: ExtractDocumentWithAiInput): Promise<AiDocumentExtractionResult> {
  if (input.bytes.byteLength > BOARD_KNOWLEDGE_AI_INLINE_BATCH_LIMIT_BYTES) {
    throw new BoardKnowledgeAiError('ai_document_inline_batch_too_large')
  }
  if (!input.submissionId || !input.documentClass || !Number.isInteger(input.batchNumber) || input.batchNumber < 1) {
    throw new BoardKnowledgeAiError('ai_document_request_invalid')
  }

  const env: BoardKnowledgeAiEnvironment = input.env ?? {
    AI_GATEWAY_URL: process.env.AI_GATEWAY_URL,
    AI_GATEWAY_AUTH_TOKEN: process.env.AI_GATEWAY_AUTH_TOKEN,
    GOOGLE_AI_STUDIO_API_KEY: process.env.GOOGLE_AI_STUDIO_API_KEY,
    GOOGLE_AI_STUDIO_PAID: process.env.GOOGLE_AI_STUDIO_PAID,
    HUGGINGFACE_API_TOKEN: process.env.HUGGINGFACE_API_TOKEN,
    HUGGINGFACE_BOARD_KNOWLEDGE_PRODUCTION_READY: process.env.HUGGINGFACE_BOARD_KNOWLEDGE_PRODUCTION_READY
  }
  const fetcher = input.fetcher ?? fetch
  const resolved = await resolveAiModelAssignment({
    featureKey: FEATURE_KEY,
    defaultProvider: 'aigateway',
    defaultModelId: BOARD_DOCUMENT_MODELS.GEMINI_36_FLASH,
    defaultFallbackModelId: BOARD_DOCUMENT_MODELS.GEMINI_35_FLASH_LITE,
    supportedProviders: ['aigateway']
  })
  if (resolved.provider !== 'aigateway') throw new BoardKnowledgeAiError('board_document_provider_not_supported')

  try {
    return await callModel(input, resolved.modelId, false, env, fetcher)
  } catch (error) {
    const fallbackModelId = resolved.fallbackModelId
    if (!(error instanceof BoardKnowledgeAiError) || !error.retryable || !fallbackModelId || fallbackModelId === resolved.modelId) {
      throw error
    }
    return callModel(input, fallbackModelId, true, env, fetcher)
  }
}
