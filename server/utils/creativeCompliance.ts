import { queryOne } from '~~/server/utils/db'
import { getFileMetadata, getPresignedDownloadUrl } from '~~/server/utils/storage'
import { assertResolvableSources, loadSourceAssetsByIds } from '~~/server/utils/video-generation/sourceAssetStore'
import { resolveGroqGatewayBaseUrl, buildGatewayAuthHeaders } from '~~/server/utils/groqClient'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'

export const CREATIVE_COMPLIANCE_MODEL = 'qwen/qwen3.6-27b'
export const CREATIVE_COMPLIANCE_MAX_IMAGE_BYTES = 20 * 1024 * 1024

export function assertCreativeComplianceImageMetadata(input: { size: number, contentType: string }): void {
  if (!input.contentType.startsWith('image/')) throw new Error('Creative compliance inputs must be images')
  if (input.size > CREATIVE_COMPLIANCE_MAX_IMAGE_BYTES) throw new Error('Creative compliance images must be 20 MB or smaller')
}

export interface CreativeComplianceVerdict {
  vehicleMatchesReference: boolean
  badgeVisibleAndCorrect: boolean
  disclaimerPresent: boolean
  priceMatchesBrief: boolean
  logoPresentUndistorted: boolean
  artefactsDetected: boolean
  confidence: number
  notes: string
}

export interface CreativeComplianceExpectedClaims {
  price?: string
  disclaimer?: string
  logo?: string
  notes?: string
}

export interface VisionComplianceRequest {
  subjectType: 'vehicle' | 'non_vehicle'
  imageUrls: string[]
  expectedClaims?: CreativeComplianceExpectedClaims
}

export interface VisionComplianceDeps {
  gatewayUrl: string
  gatewayAuthToken?: string | null
  groqApiKey: string
  fetchImpl?: typeof fetch
}

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function booleanField(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Vision verdict is missing boolean ${field}`)
  return value
}

export function normalizeCreativeComplianceVerdict(value: unknown): CreativeComplianceVerdict {
  if (!value || typeof value !== 'object') throw new Error('Vision verdict is not an object')
  const raw = value as Record<string, unknown>
  const confidence = Number(raw.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Vision verdict confidence is outside 0-1')
  }
  return {
    vehicleMatchesReference: booleanField(raw.vehicleMatchesReference, 'vehicleMatchesReference'),
    badgeVisibleAndCorrect: booleanField(raw.badgeVisibleAndCorrect, 'badgeVisibleAndCorrect'),
    disclaimerPresent: booleanField(raw.disclaimerPresent, 'disclaimerPresent'),
    priceMatchesBrief: booleanField(raw.priceMatchesBrief, 'priceMatchesBrief'),
    logoPresentUndistorted: booleanField(raw.logoPresentUndistorted, 'logoPresentUndistorted'),
    artefactsDetected: booleanField(raw.artefactsDetected, 'artefactsDetected'),
    confidence,
    notes: boundedText(raw.notes, 2000),
  }
}

export function creativeCompliancePassed(verdict: CreativeComplianceVerdict): boolean {
  return verdict.vehicleMatchesReference
    && verdict.badgeVisibleAndCorrect
    && verdict.disclaimerPresent
    && verdict.priceMatchesBrief
    && verdict.logoPresentUndistorted
    && !verdict.artefactsDetected
    && verdict.confidence >= 0.75
}

function parseJsonContent(content: unknown): unknown {
  const text = boundedText(content, 16000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  if (!text) throw new Error('Vision provider returned no verdict')
  return JSON.parse(text)
}

export async function requestCreativeComplianceVerdict(
  input: VisionComplianceRequest,
  deps: VisionComplianceDeps,
): Promise<CreativeComplianceVerdict> {
  if (input.imageUrls.length < 1 || input.imageUrls.length > 5) throw new Error('Vision checks require 1-5 images')
  if (input.subjectType === 'vehicle' && input.imageUrls.length < 2) {
    throw new Error('Vehicle checks require the proposed asset plus an approved reference')
  }
  const gatewayBase = resolveGroqGatewayBaseUrl(deps.gatewayUrl)
  if (!gatewayBase) throw new Error('Cloudflare AI Gateway is required for creative compliance')
  if (!deps.groqApiKey) throw new Error('Groq credentials are required for creative compliance')

  const expectedClaims = {
    price: boundedText(input.expectedClaims?.price, 500),
    disclaimer: boundedText(input.expectedClaims?.disclaimer, 2000),
    logo: boundedText(input.expectedClaims?.logo, 500),
    notes: boundedText(input.expectedClaims?.notes, 2000),
  }
  const prompt = [
    'Inspect image 1 as the proposed advertising creative. Remaining images are approved references.',
    `Subject type: ${input.subjectType}.`,
    `Expected claims: ${JSON.stringify(expectedClaims)}.`,
    'Return one JSON object only with exactly these keys: vehicleMatchesReference, badgeVisibleAndCorrect,',
    'disclaimerPresent, priceMatchesBrief, logoPresentUndistorted, artefactsDetected, confidence, notes.',
    'For a genuinely non-applicable check return true and explain why in notes. Never infer unreadable copy as present.',
  ].join(' ')
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
  for (const url of input.imageUrls) content.push({ type: 'image_url', image_url: { url } })

  const headers: Record<string, string> = {
    Authorization: `Bearer ${deps.groqApiKey}`,
    'Content-Type': 'application/json',
    ...(buildGatewayAuthHeaders(gatewayBase, deps.gatewayAuthToken) ?? {}),
  }
  const response = await (deps.fetchImpl ?? fetch)(`${gatewayBase}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: CREATIVE_COMPLIANCE_MODEL,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_completion_tokens: 1200,
      stream: false,
    }),
  })
  if (!response.ok) throw new Error(`Vision compliance provider failed: ${response.status}`)
  const completion = await response.json() as any
  return normalizeCreativeComplianceVerdict(parseJsonContent(completion?.choices?.[0]?.message?.content))
}

export interface RunCreativeComplianceInput {
  assetId: string
  clientId?: string
  createdBy: string
  subjectType: 'vehicle' | 'non_vehicle'
  referenceSourceAssetIds: string[]
  expectedClaims?: CreativeComplianceExpectedClaims
  beforeDispatch?: () => Promise<void>
}

export async function runCreativeComplianceCheck(input: RunCreativeComplianceInput) {
  const target = await queryOne<{ id: string, r2_key: string, client_id: string | null, file_size: number, mime_type: string }>(
    `SELECT id, r2_key, client_id, file_size, mime_type FROM banner_assets WHERE id = $1`, [input.assetId],
  )
  if (!target) throw new Error('Creative asset not found')
  if (target.client_id && target.client_id !== (input.clientId ?? null)) throw new Error('Creative asset is not owned by this client')
  assertCreativeComplianceImageMetadata({ size: target.file_size, contentType: target.mime_type })
  if (input.referenceSourceAssetIds.length > 4) throw new Error('At most four approved references are supported')
  const tenantId = input.clientId ?? 'agency'
  const referenceRows = assertResolvableSources(
    await loadSourceAssetsByIds(input.referenceSourceAssetIds),
    input.referenceSourceAssetIds,
    tenantId,
  )
  const referenceMetadata = await Promise.all(referenceRows.map(row => getFileMetadata(row.r2_key)))
  for (let index = 0; index < referenceRows.length; index++) {
    const metadata = referenceMetadata[index]
    if (!metadata) throw new Error(`Reference image ${input.referenceSourceAssetIds[index]} is unavailable`)
    assertCreativeComplianceImageMetadata(metadata)
  }
  const [targetUrl, ...references] = await Promise.all([
    getPresignedDownloadUrl(target.r2_key, 3600),
    ...referenceRows.map(row => getPresignedDownloadUrl(row.r2_key, 3600)),
  ])
  const config = useRuntimeConfig()
  const gatewayUrl = String(config.aiGatewayUrl || process.env.AI_GATEWAY_URL || '')
  const gatewayAuthToken = String(config.aiGatewayAuthToken || process.env.AI_GATEWAY_AUTH_TOKEN || '')
  const groqApiKey = String(config.groqApiKey || process.env.GROQ_API_KEY || process.env.GROQ_API || '')
  await input.beforeDispatch?.()
  const startedAt = Date.now()
  const verdict = await requestCreativeComplianceVerdict({
    subjectType: input.subjectType,
    imageUrls: [targetUrl, ...references],
    expectedClaims: input.expectedClaims,
  }, { gatewayUrl, gatewayAuthToken, groqApiKey })
  const passed = creativeCompliancePassed(verdict)
  const row = await queryOne<{ id: string, created_at: string }>(
    `INSERT INTO creative_compliance_checks (
       client_id, asset_id, created_by, model_id, gateway_used, subject_type,
       reference_source_asset_ids, expected_claims, verdict, passed, confidence
     ) VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10)
     RETURNING id, created_at`,
    [input.clientId ?? null, input.assetId, input.createdBy, CREATIVE_COMPLIANCE_MODEL, input.subjectType,
      JSON.stringify(input.referenceSourceAssetIds), JSON.stringify(input.expectedClaims ?? {}), JSON.stringify(verdict), passed, verdict.confidence],
  )
  if (!row) throw new Error('Creative compliance evidence was not persisted')
  await recordAiInvocation({
    featureKey: 'creative_compliance_preflight', provider: 'groq', modelId: CREATIVE_COMPLIANCE_MODEL,
    gatewayUsed: true, userId: input.createdBy, clientId: input.clientId ?? null, requestId: row.id,
    status: 'success', latencyMs: Date.now() - startedAt,
    metadata: { assetId: input.assetId, subjectType: input.subjectType, passed, referenceCount: references.length },
  })
  return { checkId: row.id, assetId: input.assetId, modelId: CREATIVE_COMPLIANCE_MODEL, passed, verdict, checkedAt: row.created_at }
}
