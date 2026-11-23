import { createError, defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { requireBannerClientScope } from '~~/server/utils/banner/clientAccess'
import { brandContextBlock, getDefaultBrandKitForClient, getBrandKit } from '~~/server/utils/banner/brandKits'
import { loadDesignClientStyleGuide, resolveDesignReferences } from '~~/server/utils/banner/designReferences'
import { requireBrandKitReadAccess } from '~~/server/utils/banner/brandKitAccess'
import { resolveMotorstackDesignContext, motorstackOfferCanvas, refineMotorstackOfferCanvas, protectMotorstackOfferCanvas } from '~~/server/utils/banner/motorstackDesign'
import { edgeGenerate } from '~~/server/utils/edgeAi'
import { generateGroqInsight, GROQ_MODELS, type GroqModel } from '~~/server/utils/groqClient'
import { groqModelIdFromAssignment, resolveAiModelAssignment } from '~~/server/utils/ai/modelAssignments'
import {
  applyDesignProposal, assertBoundedDesignData, canvasAssetUrls, DESIGN_ASSIST_SYSTEM_PROMPT,
  designAssistRequestSchema, designCanvasDimensions, isSafeDesignAssetUrl, validateDesignCanvas
} from '~~/server/utils/banner/designAssistant'

// This endpoint only proposes native changes. There are deliberately no project,
// asset, social draft, schedule or publication writes in this request path.
export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const rawBody = await readBody(event)
  try {
    assertBoundedDesignData(rawBody)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Design request is too large or contains unsupported content' })
  }
  const parsed = designAssistRequestSchema.safeParse(rawBody)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid design request (prompt/brief: 4000 characters; history: 12 messages of 4000 characters)' })
  const body = parsed.data
  if (body.motorstack && body.brandKitId && body.brandKitId !== body.motorstack.kitId) throw createError({ statusCode: 400, statusMessage: 'MotorStack source does not match the selected brand kit' })
  const project = await queryOneFresh<{ name: string, client_id: string | null, canvas_data: unknown }>(
    'SELECT name, client_id, canvas_data FROM banner_projects WHERE id = $1', [body.projectId]
  )
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Banner project not found' })
  await requireBannerClientScope(event, project.client_id ?? undefined)

  // Saved source assets and the client library are authority. Never derive scope
  // from a client ID, an asset ID or an arbitrary URL supplied in the request.
  const persistedUrls = canvasAssetUrls(project.canvas_data)
  const [defaultKit, assets, references, clientStyleGuide] = await Promise.all([
    getDefaultBrandKitForClient(project.client_id),
    queryRowsFresh<{ name: string, url: string, client_id: string | null }>(
      `SELECT name, url, client_id FROM banner_assets
       WHERE client_id IS NOT DISTINCT FROM $1::uuid
       OR (uploaded_by = $2 AND client_id IS NULL AND tags @> ARRAY['motorstack-media']::text[])
       ORDER BY created_at DESC LIMIT 500`, [project.client_id, user.id]
    ),
    resolveDesignReferences(event, body.projectId, project.client_id, body.referenceIds),
    loadDesignClientStyleGuide(project.client_id)
  ])
  const motorstack = body.motorstack ? await resolveMotorstackDesignContext(event, body.motorstack, project.client_id, user.id) : null
  let kit = motorstack?.kit || defaultKit
  if (body.brandKitId && !motorstack) {
    kit = await getBrandKit(body.brandKitId)
    if (!kit) throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })
    await requireBrandKitReadAccess(event, kit.clientId)
  }
  const allowedUrls = new Set([...persistedUrls, ...references.assetUrls].filter(isSafeDesignAssetUrl))
  const availableAssets: { name: string, url: string }[] = []
  for (const asset of assets) {
    if (isSafeDesignAssetUrl(asset.url)) {
      allowedUrls.add(asset.url)
      availableAssets.push({ name: asset.name, url: asset.url })
    }
  }
  if (motorstack?.artwork?.url && isSafeDesignAssetUrl(motorstack.artwork.url)) {
    allowedUrls.add(motorstack.artwork.url)
    availableAssets.push({ name: 'Current MotorStack offer artwork', url: motorstack.artwork.url })
  }
  // Only the server-resolved, project-scoped kit can supply logos.
  if (kit && kit.clientId && kit.clientId !== project.client_id) throw createError({ statusCode: 403, statusMessage: 'Brand context is outside the project client' })
  for (const logo of kit?.logos || []) {
    if (isSafeDesignAssetUrl(logo.url)) {
      allowedUrls.add(logo.url)
      availableAssets.push({ name: logo.name, url: logo.url })
    }
  }
  // Check every candidate, without a LIMIT: a foreign asset must not become
  // authorized simply because it was saved into a legacy canvas or brand kit.
  const foreignAssets = await queryRowsFresh<{ url: string }>(
    `SELECT url FROM banner_assets WHERE url = ANY($1::text[])
     AND client_id IS NOT NULL AND client_id IS DISTINCT FROM $2::uuid`,
    [[...allowedUrls], project.client_id]
  )
  for (const asset of foreignAssets) allowedUrls.delete(asset.url)
  const authorizedAssets = availableAssets.filter(asset => allowedUrls.has(asset.url))
  let canvas
  try {
    canvas = validateDesignCanvas(body.canvasData, allowedUrls)
    if (!canvas[body.activeKey]) throw new Error('Active format is missing')
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Canvas has unsupported layers, invalid timing or assets outside the project/client' })
  }

  if (motorstack) {
    const dimensions = designCanvasDimensions(canvas)
    canvas = body.motorstack!.mode === 'refine'
      ? refineMotorstackOfferCanvas(canvas, dimensions, motorstack)
      : motorstackOfferCanvas(canvas, dimensions, motorstack)
    canvas = validateDesignCanvas(canvas, allowedUrls)
  }

  const prompt = JSON.stringify({
    project: project.name, brand: brandContextBlock(kit), clientStyleGuide, brief: body.brief || '',
    references: references.references, guideText: references.guideText,
    activeKey: body.activeKey, allowLocked: body.allowLocked, canvasData: canvas, formats: designCanvasDimensions(canvas),
    motorstack: motorstack ? { offer: motorstack.offer, checkedAt: motorstack.checkedAt, nationalOffer: true, instruction: 'Arrange the supplied MotorStack layers across every existing size. Return updates only. Do not add/remove layers or formats. Preserve exact source copy, prices, terms, end date, photography and fonts. Do not invent or rewrite commercial claims. Improve hierarchy, spacing, fit and restrained animation. Terms must remain visible.' } : null,
    assets: authorizedAssets.slice(0, 60), history: body.history, request: body.prompt
  })
  // Native design has its own assignment; legacy code-assist routing is unchanged.
  // Explicit modes remain finite supported choices, not arbitrary provider IDs.
  const assignment = body.model === 'auto'
    ? await resolveAiModelAssignment({
        featureKey: 'banner_design_assist', defaultProvider: 'groq',
        defaultModelId: GROQ_MODELS.REASONING_120B, defaultFallbackModelId: GROQ_MODELS.REASONING_20B,
        supportedProviders: ['workers_ai', 'groq']
      })
    : { provider: 'groq', modelId: body.model === 'quality' ? GROQ_MODELS.REASONING_120B : GROQ_MODELS.REASONING_20B, fallbackModelId: body.model === 'quality' ? GROQ_MODELS.REASONING_20B : null, source: 'explicit' }
  const options = {
    systemPrompt: DESIGN_ASSIST_SYSTEM_PROMPT, maxTokens: 6000, temperature: 0.3,
    featureKey: 'banner_design_assist', userId: user.id, clientId: project.client_id,
    metadata: { route: '/api/agency/banner-studio/ai/design-assist', projectId: body.projectId, modelAssignmentSource: assignment.source, requestedMode: body.model }
  }
  let raw: string | null = null
  let model = `${assignment.provider}/${assignment.modelId}`
  if (assignment.provider === 'workers_ai') {
    try {
      raw = await edgeGenerate(event, prompt, { ...options, modelId: assignment.modelId })
    } catch { /* A configured fallback can handle provider unavailability. */ }
  }
  const groqCandidates = [...new Set([
    ...(assignment.provider === 'groq' ? [assignment.modelId] : []),
    ...(assignment.fallbackModelId ? [assignment.fallbackModelId] : [])
  ].map(groqModelIdFromAssignment))]
  for (const groqModel of groqCandidates) {
    if (raw) break
    // Never send another provider's model ID to Groq.
    if (!(Object.values(GROQ_MODELS) as string[]).includes(groqModel)) throw createError({ statusCode: 503, statusMessage: 'Configured design model is unavailable' })
    model = `groq/${groqModel}`
    try {
      raw = await generateGroqInsight(prompt, { ...options, featureKey: options.featureKey, model: groqModel as GroqModel })
    } catch { /* Try only the finite, configured fallback. */ }
  }
  if (!raw) throw createError({ statusCode: 502, statusMessage: 'Design assistant returned no proposal; your canvas has not changed' })
  try {
    const proposal = applyDesignProposal(raw, canvas, allowedUrls, body.allowLocked)
    if (motorstack) {
      proposal.canvasData = protectMotorstackOfferCanvas(proposal.canvasData, canvas)
      validateDesignCanvas(proposal.canvasData, allowedUrls)
    }
    return { ...proposal, model, ...(motorstack ? { motorstack: { ...body.motorstack, mode: 'refine', title: motorstack.offer.title || motorstack.offer.model, checkedAt: motorstack.checkedAt } } : {}), context: { brandKit: kit?.name || null, clientStyleGuide: Boolean(clientStyleGuide), references: references.references.map(({ id, name, kind }) => ({ id, name, kind })) } }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Design assistant returned an invalid proposal; your canvas has not changed. Try a smaller edit.' })
  }
})
