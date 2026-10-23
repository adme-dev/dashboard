import { createError, defineEventHandler, readBody } from 'h3'
import { requireSocialClientScope } from '~~/server/utils/social/clientAccess'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireBannerEffectProject } from '~~/server/utils/banner/effectScope'
import { resolveDesignReferences } from '~~/server/utils/banner/designReferences'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { getBrandKit, getDefaultBrandKitForClient } from '~~/server/utils/banner/brandKits'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { buildCreativeGenerationInputs, generateCreativeImage, type CreativeAiBinding } from '~~/server/utils/creative-generation/aiGatewayProvider'
import { getCreativeGenerationModel } from '~~/server/utils/creative-generation/modelRegistry'
import { resolveSourceAssetUrls } from '~~/server/utils/video-generation/resolveSourceUrls'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'
import { CREATIVE_COMPLIANCE_MODEL, runCreativeComplianceCheck } from '~~/server/utils/creativeCompliance'

const MAX_CONCURRENT = 2
let activeGenerations = 0

async function reviewArtwork(input: Parameters<typeof runCreativeComplianceCheck>[0]) {
  try {
    const compliance = await runCreativeComplianceCheck(input)
    return {
      compliance,
      status: compliance.passed ? 'ready' : 'review_blocked',
      review: { status: compliance.passed ? 'passed' : 'rejected', message: compliance.passed ? 'Review passed' : compliance.verdict.notes || 'Review found a quality issue. Generate a revised preview.', checkId: compliance.checkId }
    }
  } catch (error: unknown) {
    const code = error instanceof Error && error.name === 'CreativeComplianceProviderAuthError' ? 'review_provider_auth' : 'review_unavailable'
    await recordAiInvocation({ featureKey: 'creative_compliance_preflight', provider: 'groq', modelId: CREATIVE_COMPLIANCE_MODEL, gatewayUsed: true, userId: input.createdBy, clientId: input.clientId ?? null, status: 'error', errorCode: code, metadata: { assetId: input.assetId } })
    return {
      compliance: { passed: false, error: code },
      status: 'review_blocked',
      review: { status: 'unavailable', message: 'The artwork was generated, but the review service could not complete its check. Retry review to keep this image.' }
    }
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)

  const body = await readBody<{
    prompt: string
    aspectRatio?: string
    guidanceScale?: number
    steps?: number
    seed?: number
    randomizeSeed?: boolean
    promptEnhance?: boolean
    modelId?: string
    subjectType?: 'vehicle' | 'non_vehicle'
    sourceAssetId?: string
    clientId?: string
    projectId?: string
    brandKitId?: string
    /** Prepend the client's brand palette to the prompt (default true when a kit exists) */
    useBrandContext?: boolean
    targetMegapixels?: number
    outputFormat?: 'webp' | 'jpg' | 'png'
    outputQuality?: number
    enhanceDetails?: boolean
    enhanceRealism?: boolean
    referenceSourceAssetIds?: string[]
    expectedPrice?: string
    expectedDisclaimer?: string
    expectedLogo?: string
    reviewAssetId?: string
    effect?: { layerId: number, formatKey: string, text: string, referenceIds: string[], referenceProjectId: string | null, mode?: 'keep-font' | 'redraw' }
  }>(event)

  if (!body || typeof body !== 'object') throw createError({ statusCode: 400, statusMessage: 'A generation brief is required' })
  const keepFont = body.effect?.mode === 'keep-font'
  if (body.projectId) {
    const project = await requireBannerEffectProject(event, body.projectId)
    body.clientId = project.client_id ?? undefined
  } else {
    await requireSocialClientScope(event, body.clientId)
  }

  if (body.effect) {
    const parsed = z.object({ layerId: z.number().int().positive(), formatKey: z.string().min(1).max(100), text: z.string().trim().min(1).max(250), referenceIds: z.array(z.string().uuid()).max(6), referenceProjectId: z.string().uuid().nullable(), mode: z.enum(['keep-font', 'redraw']).optional() }).strict().safeParse(body.effect)
    if (!parsed.success || !body.projectId) throw createError({ statusCode: 400, statusMessage: 'Select text of 250 characters or fewer in a saved banner' })
    const project = await requireBannerEffectProject(event, body.projectId)
    const layer = project.canvas_data[parsed.data.formatKey]?.layers?.find(l => l.id === parsed.data.layerId && l.type === 'text')
    if (!layer || String(layer.text || '').trim() !== parsed.data.text) throw createError({ statusCode: 409, statusMessage: 'Save the selected text layer before generating artwork' })
    if (body.reviewAssetId) {
      if (!z.string().uuid().safeParse(body.reviewAssetId).success) throw createError({ statusCode: 400, statusMessage: 'Select generated artwork in a saved banner' })
      const asset = await queryOne<{ client_id: string | null, tags: string[], mime_type: string }>('SELECT client_id, tags, mime_type FROM banner_assets WHERE id=$1', [body.reviewAssetId])
      if (!asset || asset.client_id !== (body.clientId ?? null) || !asset.tags?.includes('ai-generated') || !asset.mime_type.startsWith('image/') || keepFont !== asset.tags.includes('font-texture')) throw createError({ statusCode: 404, statusMessage: 'Generated artwork not found for this client' })
      return { assetId: body.reviewAssetId, ...await reviewArtwork({ assetId: body.reviewAssetId, clientId: body.clientId, createdBy: user.id, subjectType: 'non_vehicle', referenceSourceAssetIds: [], expectedClaims: { text: keepFont ? undefined : parsed.data.text } }) }
    }
    let context = ''
    if (parsed.data.referenceIds.length) {
      const refProject = await requireBannerEffectProject(event, parsed.data.referenceProjectId)
      if (refProject.client_id !== project.client_id && refProject.client_id !== null) throw createError({ statusCode: 403, statusMessage: 'References belong to another client' })
      const refs = await resolveDesignReferences(event, refProject.id, refProject.client_id, parsed.data.referenceIds)
      context = [refs.guideText, ...refs.references.filter(r => r.kind === 'image').map(r => r.description)].filter(Boolean).join('\n')
    }
    if (Number(layer.w) > Number(layer.h) * 1.5) body.aspectRatio = '16:9'
    else if (Number(layer.h) > Number(layer.w) * 1.5) body.aspectRatio = '9:16'
    else body.aspectRatio = '1:1'
    const layout = String(layer.text).includes('\n') ? 'Keep the supplied line breaks.' : 'Keep all text on one horizontal line.'
    const prefix = keepFont ? 'Create an edge-to-edge material texture for filling existing typography. No text, lettering, logos, objects, scenery, frame or plain background. Focus on the requested surface, colours and lighting. ' : `Create isolated typographic artwork. ${layout} Use a uniform plain black background and leave only a small margin around the lettering. Render exactly this text: ${JSON.stringify(parsed.data.text)}. No extra words, products, logos or scenery. `
    const brief = `${prefix}${String(body.prompt || '').trim()}`
    if (brief.length > 1800) throw createError({ statusCode: 400, statusMessage: 'Shorten the effect brief to leave room for the text and references' })
    body.prompt = `${brief}${context ? ` Style guidance: ${context.slice(0, Math.max(0, 1980 - brief.length))}` : ''}`
    body.subjectType = 'non_vehicle'
  }

  if (body.reviewAssetId) throw createError({ statusCode: 400, statusMessage: 'Select generated text artwork in a saved banner' })
  const modelId = body?.modelId || 'aigateway/recraft-offer-card'
  if (body.effect && modelId !== 'aigateway/recraft-offer-card') throw createError({ statusCode: 400, statusMessage: 'Select the configured Recraft text artwork model' })
  const model = getCreativeGenerationModel(modelId)
  if (!model?.defaultEnabled) throw createError({ statusCode: 400, statusMessage: 'Unknown or disabled creative model' })
  const subjectType = body.subjectType ?? 'non_vehicle'
  if (!model.allowedSubjectTypes.includes(subjectType)) {
    throw createError({ statusCode: 422, statusMessage: `${model.displayName} is not approved for ${subjectType} subjects` })
  }
  if (model.mode === 'text-to-image' && (!body?.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0)) {
    throw createError({ statusCode: 400, statusMessage: 'prompt is required' })
  }

  if ((body.prompt?.length ?? 0) > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'prompt must be 2000 characters or less' })
  }

  // Validate aspect ratio if provided
  const validAspects = ['1:1', '16:9', '9:16', '4:3', '3:4']
  if (body.aspectRatio && !validAspects.includes(body.aspectRatio)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid aspect ratio. Valid: ${validAspects.join(', ')}` })
  }

  if (activeGenerations >= MAX_CONCURRENT) throw createError({ statusCode: 429, statusMessage: 'Too many AI generation requests in progress — try again shortly' })
  activeGenerations++
  try {
    const ai = (event.context as { cloudflare?: { env?: { AI?: CreativeAiBinding } } }).cloudflare?.env?.AI
    if (!ai) throw createError({ statusCode: 503, statusMessage: 'Cloudflare AI Gateway binding is unavailable' })
    let sourceUrl: string | null = null
    if (model.requiresApprovedSourceAsset) {
      if (!body.sourceAssetId) throw createError({ statusCode: 400, statusMessage: 'An approved sourceAssetId is required' })
      try {
        sourceUrl = (await resolveSourceAssetUrls([body.sourceAssetId], body.clientId ?? 'agency'))[0] ?? null
      } catch (error: any) {
        throw createError({ statusCode: 422, statusMessage: error?.message || 'Approved source asset is unavailable' })
      }
    }
    // Brand palette as prompt guidance for image models — short, colour-focused (guidelines are for copy)
    let brandPrompt = ''
    if (body.brandKitId) {
      const kit = await getBrandKit(body.brandKitId)
      if (!kit || (kit.clientId && kit.clientId !== (body.clientId ?? null))) throw createError({ statusCode: 403, statusMessage: 'Brand kit belongs to another client' })
    }
    if (body.useBrandContext !== false && (body.brandKitId || body.clientId || body.projectId)) {
      try {
        const kit = body.brandKitId
          ? await getBrandKit(body.brandKitId)
          : await getDefaultBrandKitForClient(body.clientId ?? null)
        if (kit?.colors?.length) {
          brandPrompt = ` Brand palette: ${kit.colors.slice(0, 4).map((c: any) => `${c.role} ${c.hex}`).join(', ')}.`
        }
      } catch {
        // brand palette is optional guidance
      }
    }
    const generationInput = {
      modelId,
      subjectType,
      prompt: body.prompt ? `${body.prompt.trim()}${brandPrompt}` : body.prompt,
      aspectRatio: body.aspectRatio as any,
      sourceUrl,
      targetMegapixels: body.targetMegapixels,
      outputFormat: body.outputFormat,
      outputQuality: body.outputQuality,
      enhanceDetails: body.enhanceDetails,
      enhanceRealism: body.enhanceRealism,
      metadata: {
        featureKey: model.mode === 'image-upscale' ? 'banner_image_upscale' : 'banner_image_generation',
        userId: user.id,
        clientId: body.clientId ?? 'agency'
      }
    }
    try {
      buildCreativeGenerationInputs(generationInput)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Creative request violates model policy'
      throw createError({ statusCode: 422, statusMessage: message.slice(0, 500) })
    }
    const startedAt = Date.now()
    let result: Awaited<ReturnType<typeof generateCreativeImage>>
    try {
      result = await generateCreativeImage(ai, generationInput)
    } catch {
      await recordAiInvocation({
        featureKey: model.mode === 'image-upscale' ? 'banner_image_upscale' : 'banner_image_generation',
        provider: 'aigateway', modelId: model.cfModel, gatewayUsed: true,
        userId: user.id, clientId: body.clientId ?? null, status: 'error',
        errorCode: 'creative_generation_failed', latencyMs: Date.now() - startedAt,
        metadata: { registryModelId: model.id }
      })
      throw createError({ statusCode: 502, statusMessage: 'Image generation is unavailable. Try again; your banner is unchanged.' })
    }

    // Upload to R2
    const extension = result.contentType === 'image/png' ? 'png' : result.contentType === 'image/jpeg' ? 'jpg' : 'webp'
    const fileName = `ai-generated-${Date.now()}.${extension}`
    const { key, url, size } = await uploadBannerAsset(
      result.buffer,
      fileName,
      result.contentType,
      user.id
    )

    // Insert asset row
    const asset = await queryOne<{ id: string }>(`
      INSERT INTO banner_assets (name, mime_type, file_size, r2_key, url, tags, uploaded_by, client_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      'AI Generated Image',
      result.contentType,
      size,
      key,
      url,
      ['ai-generated', model.safetyClass, model.cfModel, ...(keepFont ? ['font-texture'] : [])],
      user.id,
      body.clientId ?? null,
    ])
    if (!asset) throw createError({ statusCode: 500, statusMessage: 'Generated asset was not persisted' })
    const referenceSourceAssetIds = model.requiresApprovedSourceAsset
      ? [body.sourceAssetId!]
      : (body.referenceSourceAssetIds ?? []).slice(0, 4)
    const review = await reviewArtwork({
      assetId: asset.id,
      clientId: body.clientId,
      createdBy: user.id,
      subjectType,
      referenceSourceAssetIds,
      expectedClaims: { price: body.expectedPrice, disclaimer: body.expectedDisclaimer, logo: body.expectedLogo, text: keepFont ? undefined : body.effect?.text }
    })
    await recordAiInvocation({
      featureKey: model.mode === 'image-upscale' ? 'banner_image_upscale' : 'banner_image_generation',
      provider: 'aigateway',
      modelId: model.cfModel,
      gatewayUsed: true,
      userId: user.id,
      clientId: body.clientId ?? null,
      status: 'success',
      latencyMs: Date.now() - startedAt,
      metadata: { registryModelId: model.id, safetyClass: model.safetyClass, subjectType, sourceAssetId: body.sourceAssetId ?? null },
    })

    return { url, r2Key: key, assetId: asset.id, seed: null, modelId: model.id, safetyClass: model.safetyClass, ...review }
  } finally {
    activeGenerations--
  }
})
