import { createError, defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import { requireSocialClientScope } from '~~/server/utils/social/clientAccess'
import { brandContextBlock, getDefaultBrandKitForClient } from '~~/server/utils/banner/brandKits'
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
  const project = await queryOneFresh<{ name: string, client_id: string | null, canvas_data: unknown }>(
    'SELECT name, client_id, canvas_data FROM banner_projects WHERE id = $1', [body.projectId]
  )
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Banner project not found' })
  await requireSocialClientScope(event, project.client_id ?? undefined)

  // Saved source assets and the client library are authority. Never derive scope
  // from a client ID, an asset ID or an arbitrary URL supplied in the request.
  const persistedUrls = canvasAssetUrls(project.canvas_data)
  const [kit, assets] = await Promise.all([
    getDefaultBrandKitForClient(project.client_id),
    queryRowsFresh<{ name: string, url: string, client_id: string | null }>(
      `SELECT name, url, client_id FROM banner_assets
       WHERE client_id IS NOT DISTINCT FROM $1::uuid
       ORDER BY created_at DESC LIMIT 500`, [project.client_id]
    )
  ])
  const allowedUrls = new Set(persistedUrls.filter(isSafeDesignAssetUrl))
  const availableAssets: { name: string, url: string }[] = []
  for (const asset of assets) {
    if (isSafeDesignAssetUrl(asset.url)) {
      allowedUrls.add(asset.url)
      availableAssets.push({ name: asset.name, url: asset.url })
    }
  }
  // Only the server-resolved client/default kit can supply logos.
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

  const prompt = JSON.stringify({
    project: project.name, brand: brandContextBlock(kit), brief: body.brief || '',
    activeKey: body.activeKey, allowLocked: body.allowLocked, canvasData: canvas, formats: designCanvasDimensions(canvas),
    assets: authorizedAssets.slice(0, 60), history: body.history, request: body.prompt
  })
  // Reuse the existing Banner assistant's platform-managed assignment in auto.
  // Explicit modes remain finite supported choices, not arbitrary provider IDs.
  const assignment = body.model === 'auto'
    ? await resolveAiModelAssignment({
        featureKey: 'banner_code_assist', defaultProvider: 'workers_ai',
        defaultModelId: '@cf/meta/llama-3.1-8b-instruct', defaultFallbackModelId: GROQ_MODELS.LLAMA_70B,
        supportedProviders: ['workers_ai', 'groq']
      })
    : { provider: body.model === 'quality' ? 'groq' : 'workers_ai', modelId: body.model === 'quality' ? GROQ_MODELS.LLAMA_70B : '@cf/meta/llama-3.1-8b-instruct', fallbackModelId: body.model === 'fast' ? GROQ_MODELS.LLAMA_8B : null, source: 'explicit' }
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
  if (!raw && (assignment.provider === 'groq' || assignment.fallbackModelId)) {
    const groqModel = groqModelIdFromAssignment(assignment.provider === 'groq' ? assignment.modelId : assignment.fallbackModelId!)
    // Never pass a Workers/other provider fallback ID to Groq's API.
    if (!(Object.values(GROQ_MODELS) as string[]).includes(groqModel)) throw createError({ statusCode: 503, statusMessage: 'Configured design model is unavailable' })
    model = `groq/${groqModel}`
    try {
      raw = await generateGroqInsight(prompt, { ...options, model: groqModel as GroqModel })
    } catch {
      throw createError({ statusCode: 502, statusMessage: 'Design assistant is unavailable; your canvas has not changed' })
    }
  }
  if (!raw) throw createError({ statusCode: 502, statusMessage: 'Design assistant returned no proposal; your canvas has not changed' })
  try {
    return { ...applyDesignProposal(raw, canvas, allowedUrls, body.allowLocked), model }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Design assistant returned an invalid proposal; your canvas has not changed. Try a smaller edit.' })
  }
})
