import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { GenerationRunner } from './generationTools'
import type { TrustedSupplementalExecutionServices } from '~~/server/utils/ai/godModeExecution'
import { generateVoiceover } from '~~/server/utils/audio/voiceGen'
import {
  createVoiceAsset,
  createMusicAsset,
  getMusicAssetByIdempotencyKey,
  requeueFailedMusicAsset,
  getAsset
} from '~~/server/utils/audio/assets'
import { guardAudioPrompt, loadBlocklist } from '~~/server/utils/audio/musicGuard'
import { getMusicQueue, musicIdempotencyKey, type MusicJobPayload } from '~~/server/utils/audio/musicJob'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { queryOne } from '~~/server/utils/db'
import { buildCreativeGenerationInputs, generateCreativeImage, type CreativeAiBinding } from '~~/server/utils/creative-generation/aiGatewayProvider'
import { resolveSourceAssetUrls } from '~~/server/utils/video-generation/resolveSourceUrls'
import { CREATIVE_COMPLIANCE_MODEL, runCreativeComplianceCheck } from '~~/server/utils/creativeCompliance'
import { listSelectableCreativeGenerationModels } from '~~/server/utils/creative-generation/modelRegistry'
import { getAiGatewayGenerationPolicyStatus } from '~~/server/utils/aiGatewayGenerationPolicy'

/**
 * MCP Phase 2a — the REAL generation runner (the binding-dependent half of generationTools.ts).
 * Wraps the exact same owned-media engines the in-app HTTP handlers use (voiceover.post / music/
 * generate.post / music/status), but driven by `ctx.userId` (resolved by the internal endpoint from
 * the OAuth assertion) instead of a session, and reaching CF bindings via `ctx.event`. RBAC/flag/arg
 * gating is already done by executeGenerationTool before any of this runs.
 *
 * Args are already Zod-validated by executeGenerationTool, so each runner trusts its shape.
 */

interface VoiceoverArgs { text: string, lang: string, voice?: string, title?: string, clientId?: string, channels: string[] }
interface BannerImageArgs { prompt: string, aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4', modelId: 'aigateway/recraft-offer-card', subjectType: 'non_vehicle', referenceSourceAssetIds: string[], expectedPrice?: string, expectedDisclaimer?: string, expectedLogo?: string, title?: string, clientId?: string }
interface UpscaleImageArgs { sourceAssetId: string, subjectType: 'vehicle' | 'non_vehicle', clientId?: string, targetMegapixels: number, outputFormat: 'webp' | 'jpg' | 'png', outputQuality: number, enhanceDetails: boolean, enhanceRealism: boolean, expectedPrice?: string, expectedDisclaimer?: string, expectedLogo?: string, title?: string }
interface VerifyCreativeArgs { assetId: string, clientId?: string, subjectType: 'vehicle' | 'non_vehicle', referenceSourceAssetIds: string[], expectedPrice?: string, expectedDisclaimer?: string, expectedLogo?: string, notes?: string }
interface MusicArgs { prompt: string, isInstrumental: boolean, lyrics?: string, format: 'mp3' | 'wav', title?: string, clientId?: string, channels: string[] }
interface StatusArgs { jobId: string }
type JsonKvBinding = { get(key: string, type: 'json'): Promise<unknown> }

function isJsonKvBinding(value: unknown): value is JsonKvBinding {
  return !!value && typeof value === 'object' && typeof (value as { get?: unknown }).get === 'function'
}

function creativeAiBinding(ctx: ToolContext): CreativeAiBinding {
  const ai = (ctx.event?.context as { cloudflare?: { env?: { AI?: CreativeAiBinding } } })?.cloudflare?.env?.AI
  if (!ai) throw new Error('Cloudflare AI Gateway binding unavailable')
  return ai
}

function creativeExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/jpeg') return 'jpg'
  return 'webp'
}

async function persistGeneratedBannerAsset(input: {
  generated: Awaited<ReturnType<typeof generateCreativeImage>>
  userId: string
  clientId?: string
  title?: string
  extraTags: string[]
}) {
  const extension = creativeExtension(input.generated.contentType)
  const uploaded = await uploadBannerAsset(
    input.generated.buffer,
    `ai-generated-${Date.now()}.${extension}`,
    input.generated.contentType,
    input.userId,
  )
  const asset = await queryOne<{ id: string }>(
    `INSERT INTO banner_assets (name, mime_type, file_size, r2_key, url, tags, uploaded_by, client_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [input.title?.trim() || 'AI Generated Image', input.generated.contentType, uploaded.size, uploaded.key, uploaded.url,
      ['ai-generated', 'mcp', input.generated.safetyClass, input.generated.cfModel, ...input.extraTags], input.userId, input.clientId ?? null],
  )
  if (!asset) throw new Error('image asset persistence failed')
  return { asset, uploaded }
}

async function runAutomaticCreativeCompliance(
  input: Parameters<typeof runCreativeComplianceCheck>[0],
): Promise<Awaited<ReturnType<typeof runCreativeComplianceCheck>> | { passed: false, error: string }> {
  try {
    return await runCreativeComplianceCheck(input)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Compliance check unavailable'
    return { passed: false, error: message.slice(0, 500) }
  }
}

export function isMusicGenerationProviderAvailable(event: ToolContext['event']): boolean {
  return !!event && getMusicQueue(event) !== null
}

export function buildGenerationRunner(execution?: TrustedSupplementalExecutionServices): GenerationRunner {
  return {
    list_creative_models: async (_raw, ctx: ToolContext) => {
      const env = ((ctx.event?.context as { cloudflare?: { env?: Record<string, unknown> } })?.cloudflare?.env ?? {})
      return {
        models: listSelectableCreativeGenerationModels(),
        inspection: {
          modelId: CREATIVE_COMPLIANCE_MODEL,
          safetyClass: 'inspection_only',
          maxImagesPerRequest: 5,
          jsonMode: true,
          gatewayRequired: true,
        },
        gatewayPolicy: getAiGatewayGenerationPolicyStatus(env),
      }
    },
    generate_banner_image: async (raw, ctx: ToolContext) => {
      const a = raw as BannerImageArgs
      const generationInput = {
        modelId: a.modelId,
        subjectType: a.subjectType,
        prompt: a.prompt,
        aspectRatio: a.aspectRatio,
        metadata: { featureKey: 'banner_image_generation', userId: ctx.userId, clientId: a.clientId ?? 'agency' }
      } as const
      buildCreativeGenerationInputs(generationInput)
      await execution?.markDispatched()
      const generated = await generateCreativeImage(creativeAiBinding(ctx), generationInput)
      const { asset, uploaded } = await persistGeneratedBannerAsset({ generated, userId: ctx.userId, clientId: a.clientId, title: a.title, extraTags: [] })
      const compliance = await runAutomaticCreativeCompliance({
        assetId: asset.id, clientId: a.clientId, createdBy: ctx.userId, subjectType: 'non_vehicle',
        referenceSourceAssetIds: a.referenceSourceAssetIds,
        expectedClaims: { price: a.expectedPrice, disclaimer: a.expectedDisclaimer, logo: a.expectedLogo },
      })
      const result = { assetId: asset.id, kind: 'image', status: compliance.passed ? 'ready' : 'review_blocked', assetUrl: uploaded.url, seed: null, aspectRatio: a.aspectRatio, modelId: generated.modelId, safetyClass: generated.safetyClass, compliance }
      if (execution) await execution.captureResult({ ok: true, data: result })
      return result
    },

    upscale_banner_image: async (raw, ctx: ToolContext) => {
      const a = raw as UpscaleImageArgs
      const [sourceUrl] = await resolveSourceAssetUrls([a.sourceAssetId], a.clientId ?? 'agency')
      if (!sourceUrl) throw new Error('approved source asset unavailable')
      const generationInput = {
        modelId: 'aigateway/pruna-upscale',
        subjectType: a.subjectType,
        sourceUrl,
        targetMegapixels: a.targetMegapixels,
        outputFormat: a.outputFormat,
        outputQuality: a.outputQuality,
        enhanceDetails: a.enhanceDetails,
        enhanceRealism: a.enhanceRealism,
        metadata: { featureKey: 'banner_image_upscale', userId: ctx.userId, clientId: a.clientId ?? 'agency' }
      } as const
      buildCreativeGenerationInputs(generationInput)
      await execution?.markDispatched()
      const generated = await generateCreativeImage(creativeAiBinding(ctx), generationInput)
      const { asset, uploaded } = await persistGeneratedBannerAsset({
        generated,
        userId: ctx.userId,
        clientId: a.clientId,
        title: a.title,
        extraTags: [`source:${a.sourceAssetId}`],
      })
      const compliance = await runAutomaticCreativeCompliance({
        assetId: asset.id, clientId: a.clientId, createdBy: ctx.userId, subjectType: a.subjectType,
        referenceSourceAssetIds: [a.sourceAssetId],
        expectedClaims: { price: a.expectedPrice, disclaimer: a.expectedDisclaimer, logo: a.expectedLogo },
      })
      const result = { assetId: asset.id, kind: 'image', status: compliance.passed ? 'ready' : 'review_blocked', assetUrl: uploaded.url, sourceAssetId: a.sourceAssetId, modelId: generated.modelId, safetyClass: generated.safetyClass, compliance }
      if (execution) await execution.captureResult({ ok: true, data: result })
      return result
    },

    verify_creative_compliance: async (raw, ctx: ToolContext) => {
      const a = raw as VerifyCreativeArgs
      const result = await runCreativeComplianceCheck({
        assetId: a.assetId,
        clientId: a.clientId,
        createdBy: ctx.userId,
        subjectType: a.subjectType,
        referenceSourceAssetIds: a.referenceSourceAssetIds,
        expectedClaims: {
          price: a.expectedPrice,
          disclaimer: a.expectedDisclaimer,
          logo: a.expectedLogo,
          notes: a.notes,
        },
        beforeDispatch: execution?.markDispatched,
      })
      if (execution) await execution.captureResult({ ok: true, data: result })
      return result
    },

    // Synchronous: generate the VO and return the ready asset (with a playback URL).
    generate_voiceover: async (raw, ctx: ToolContext) => {
      const a = raw as VoiceoverArgs
      const generated = await generateVoiceover(
        ctx.event,
        { text: a.text, lang: a.lang },
        { beforeDispatch: execution?.markDispatched }
      )
      if (!generated) throw new Error('voice generation unavailable')
      const asset = await createVoiceAsset({
        createdBy: ctx.userId,
        clientId: a.clientId ?? null,
        title: a.title ?? null,
        text: generated.sanitizedText,
        lang: a.lang,
        voice: a.voice ?? null,
        channels: a.channels,
        audio: generated.audioBuffer,
        format: generated.format
      })
      const result = {
        assetId: asset.id,
        kind: 'voiceover',
        status: asset.status,
        streamUrl: asset.streamUrl ?? null,
        violations: generated.violations
      }
      if (execution) await execution.captureResult({ ok: true, data: result })
      return result
    },

    // Asynchronous: guard → enqueue → return jobId. Host polls get_generation_status.
    // Copyright/duplicate/disabled outcomes return a structured status rather than throwing,
    // so the host gets an actionable message instead of a generic handler_error.
    start_music_generation: async (raw, ctx: ToolContext) => {
      const a = raw as MusicArgs
      const rawKv = (ctx.event.context as { cloudflare?: { env?: { CACHE?: unknown } } }).cloudflare?.env?.CACHE
      const kv = isJsonKvBinding(rawKv) ? rawKv : null
      const blocklist = await loadBlocklist(kv)
      const briefGuard = guardAudioPrompt(a.prompt, blocklist)
      const lyricsGuard = a.lyrics ? guardAudioPrompt(a.lyrics, blocklist) : { safe: true, violations: [] as string[] }
      if (!briefGuard.safe || !lyricsGuard.safe) {
        return {
          status: 'rejected',
          reason: 'Brief or lyrics name a specific artist — rephrase to a genre or mood.',
          violations: [...briefGuard.violations, ...lyricsGuard.violations]
        }
      }

      const queue = getMusicQueue(ctx.event)
      if (!queue) {
        throw Object.assign(new Error('music generation provider unavailable'), {
          boundedCode: 'provider_unavailable',
          statusCode: 503
        })
      }

      const idempotencyKey = musicIdempotencyKey({
        createdBy: ctx.userId,
        prompt: a.prompt,
        isInstrumental: a.isInstrumental,
        lyrics: a.lyrics ?? null
      })

      let asset
      try {
        asset = await createMusicAsset({
          createdBy: ctx.userId,
          clientId: a.clientId ?? null,
          title: a.title ?? null,
          prompt: a.prompt,
          isInstrumental: a.isInstrumental,
          lyrics: a.lyrics ?? null,
          channels: a.channels,
          format: a.format,
          idempotencyKey
        })
      } catch {
        // idempotency_key UNIQUE collision — same brief already exists. Allow retry of a FAILED one.
        const existing = await getMusicAssetByIdempotencyKey(idempotencyKey)
        if (existing && existing.status === 'failed' && await requeueFailedMusicAsset(existing.id)) {
          asset = { ...existing, status: 'queued', error: null }
        } else {
          const duplicate = { status: 'duplicate', reason: 'That exact brief was just submitted — check the library.', jobId: existing?.id ?? null }
          if (execution && existing?.id) {
            await execution.markDispatched()
            await execution.captureResult({ ok: true, data: duplicate })
          }
          return duplicate
        }
      }

      const payload: MusicJobPayload = {
        assetId: asset.id,
        prompt: a.prompt,
        isInstrumental: a.isInstrumental,
        lyrics: a.lyrics ?? null,
        format: a.format,
        idempotencyKey
      }
      await execution?.markDispatched()
      await queue.send(payload)
      const result = { jobId: asset.id, status: asset.status }
      if (execution) await execution.captureResult({ ok: true, data: result })
      return result
    },

    // Poll any generation job (music) by its asset/job id; mints a fresh playback URL when ready.
    get_generation_status: async (raw) => {
      const a = raw as StatusArgs
      const asset = await getAsset(a.jobId)
      if (!asset) return { status: 'not_found' }
      return {
        jobId: asset.id,
        status: asset.status,
        assetUrl: asset.streamUrl ?? null,
        error: asset.error ?? null,
        kind: asset.kind
      }
    }
  }
}
