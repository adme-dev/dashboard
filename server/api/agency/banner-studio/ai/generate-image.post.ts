import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getBrandKit, getDefaultBrandKitForClient } from '~~/server/utils/banner/brandKits'
import { uploadBannerAsset } from '~~/server/utils/bannerStorage'
import { buildCreativeGenerationInputs, generateCreativeImage, type CreativeAiBinding } from '~~/server/utils/creative-generation/aiGatewayProvider'
import { getCreativeGenerationModel } from '~~/server/utils/creative-generation/modelRegistry'
import { resolveSourceAssetUrls } from '~~/server/utils/video-generation/resolveSourceUrls'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'
import { runCreativeComplianceCheck } from '~~/server/utils/creativeCompliance'

const MAX_CONCURRENT = 2
let activeGenerations = 0

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  if (activeGenerations >= MAX_CONCURRENT) {
    throw createError({ statusCode: 429, statusMessage: 'Too many AI generation requests in progress — try again shortly' })
  }

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
  }>(event)

  const modelId = body?.modelId || 'aigateway/recraft-offer-card'
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
    if (body.useBrandContext !== false && (body.brandKitId || body.clientId || body.projectId)) {
      try {
        const kit = body.brandKitId
          ? await getBrandKit(body.brandKitId)
          : await getDefaultBrandKitForClient(body.clientId || (body.projectId ? ((await queryOne(`SELECT client_id FROM banner_projects WHERE id = $1`, [body.projectId]) as any)?.client_id) : null))
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
    const result = await generateCreativeImage(ai, generationInput)

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
      ['ai-generated', model.safetyClass, model.cfModel],
      user.id,
      body.clientId ?? null,
    ])
    if (!asset) throw createError({ statusCode: 500, statusMessage: 'Generated asset was not persisted' })
    const referenceSourceAssetIds = model.requiresApprovedSourceAsset
      ? [body.sourceAssetId!]
      : (body.referenceSourceAssetIds ?? []).slice(0, 4)
    let compliance: Awaited<ReturnType<typeof runCreativeComplianceCheck>> | { passed: false, error: string }
    try {
      compliance = await runCreativeComplianceCheck({
        assetId: asset.id,
        clientId: body.clientId,
        createdBy: user.id,
        subjectType,
        referenceSourceAssetIds,
        expectedClaims: { price: body.expectedPrice, disclaimer: body.expectedDisclaimer, logo: body.expectedLogo },
      })
    } catch (error: any) {
      compliance = { passed: false, error: String(error?.message || 'Compliance check unavailable').slice(0, 500) }
    }
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

    return { url, r2Key: key, seed: null, modelId: model.id, safetyClass: model.safetyClass, compliance, status: compliance.passed ? 'ready' : 'review_blocked' }
  } finally {
    activeGenerations--
  }
})
