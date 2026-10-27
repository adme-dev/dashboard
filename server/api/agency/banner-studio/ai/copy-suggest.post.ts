/**
 * AI Copy Generation for Banner Text Layers
 * POST /api/agency/banner-studio/ai/copy-suggest
 * Body: { text, instruction?, projectId?, sourceRevision?, selection?, context? }
 * Returns: { suggestions: { text, tone, charCount }[], evidence }
 */

import { createError, type H3Event } from 'h3'
import { requireWriteAccess, type User } from '~~/server/utils/auth'
import { z } from 'zod'
import { queryOneFresh } from '~~/server/utils/db'
import { hasAllSocialClientAccess, requireSocialClientAccess, requireSocialClientScope } from '~~/server/utils/social/clientAccess'
import { isBannerCopyLayerProtected, isProtectedBannerCopy, isSafeBannerRewrite } from '../../../../../shared/bannerCopyProtection'
import { brandContextForRequest } from '~~/server/utils/banner/brandKits'
import { edgeGenerate } from '~~/server/utils/edgeAi'
import { generateGroqInsight, GROQ_MODELS, type GroqModel } from '~~/server/utils/groqClient'
import { groqModelIdFromAssignment, resolveAiModelAssignment } from '~~/server/utils/ai/modelAssignments'

interface CopySuggestion {
  text: string
  tone: string
  charCount: number
}

interface CopyProject {
  id: string
  client_id: string | null
  created_by: string
  updated_at: string | Date
  canvas_data: Record<string, { layers?: { id: number, type: string, text?: string, copyLocked?: boolean, feedBindings?: { property: string }[] }[] }>
}

function savedCopyProject(projectId: string) {
  return queryOneFresh<CopyProject>('SELECT id, client_id, created_by, updated_at, canvas_data FROM banner_projects WHERE id=$1', [projectId])
}

async function requireCopyProjectAccess(event: H3Event, project: CopyProject, user: User) {
  if (project.client_id) await requireSocialClientAccess(event, project.client_id)
  else if (project.created_by !== user.id && !hasAllSocialClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  }
}

function assertCopyRevision(project: CopyProject, sourceRevision: string) {
  if (!project.updated_at || new Date(project.updated_at).getTime() !== new Date(sourceRevision).getTime()) {
    throw createError({ statusCode: 409, statusMessage: 'Artwork changed; save/reload and request new suggestions' })
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = z.object({
    text: z.string().min(1).max(4000),
    instruction: z.string().trim().max(1000).default('Suggest concise alternatives preserving the meaning.'),
    projectId: z.string().uuid().optional(),
    sourceRevision: z.string().datetime({ offset: true }).optional(),
    selection: z.object({ layerId: z.number().int().positive(), formatKey: z.string().max(100) }).optional(),
    context: z.object({ projectName: z.string().max(200).optional(), clientName: z.string().max(200).optional(), clientId: z.string().uuid().optional(), format: z.string().max(100).optional(), purpose: z.string().max(1000).optional() }).optional()
  }).safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid copy request' })
  const { text, instruction, projectId, sourceRevision, selection, context } = parsed.data
  let clientId: string | undefined
  let validateSavedSource: (() => Promise<void>) | undefined
  if (projectId || selection || sourceRevision) {
    if (!projectId || !selection || !sourceRevision) throw createError({ statusCode: 400, statusMessage: 'Select a saved text layer and provide its sourceRevision' })
    const project = await savedCopyProject(projectId)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Banner project not found' })
    await requireCopyProjectAccess(event, project, user)
    assertCopyRevision(project, sourceRevision)
    const layer = project.canvas_data?.[selection.formatKey]?.layers?.find(l => l.id === selection.layerId)
    if (!layer || layer.type !== 'text' || layer.text !== text) throw createError({ statusCode: 409, statusMessage: 'Save the current selection before requesting copy' })
    if (isBannerCopyLayerProtected(layer)) throw createError({ statusCode: 400, statusMessage: 'Approved copy is protected' })
    clientId = project.client_id || undefined
    const capturedLayer = JSON.stringify(layer)
    validateSavedSource = async () => {
      const fresh = await savedCopyProject(projectId)
      if (!fresh || fresh.client_id !== project.client_id || fresh.created_by !== project.created_by) {
        throw createError({ statusCode: 409, statusMessage: 'Project changed while preparing suggestions; reload and try again' })
      }
      await requireCopyProjectAccess(event, fresh, user)
      assertCopyRevision(fresh, sourceRevision)
      const currentLayer = fresh.canvas_data?.[selection.formatKey]?.layers?.find(l => l.id === selection.layerId)
      if (!currentLayer || JSON.stringify(currentLayer) !== capturedLayer || isBannerCopyLayerProtected(currentLayer)) {
        throw createError({ statusCode: 409, statusMessage: 'Saved selection changed while preparing suggestions; reload and try again' })
      }
    }
  } else {
    clientId = context?.clientId
    await requireSocialClientScope(event, clientId)
  }
  if (isProtectedBannerCopy(text)) throw createError({ statusCode: 400, statusMessage: 'Commercial facts, legal copy and merge fields are protected' })

  const maxChars = text.length + 20 // Allow slightly longer alternatives
  const contextLines = [
    context?.projectName ? `Project: ${context.projectName}` : '',
    context?.clientName ? `Brand: ${context.clientName}` : '',
    context?.format ? `Banner size: ${context.format}` : '',
    context?.purpose ? `Campaign goal: ${context.purpose}` : ''
  ].filter(Boolean).join('\n')

  // Existing project/client brand defaults steer tone and guidelines.
  const brandBlock = await brandContextForRequest({ projectId, clientId })

  const prompt = `You are an advertising copywriter. Given this banner text and context, suggest 5 alternative versions.

Current text: "${text}"
Requested change: ${instruction}
Preserve named brands and meaning. Do not introduce offers, dates, amounts, addresses, phone numbers or legal claims.
Max characters: ~${maxChars}
${contextLines ? `\nContext:\n${contextLines}` : ''}

Requirements:
- Each suggestion should be a different tone/approach
- Keep text concise — it must fit in a banner ad
- Vary between: punchy, professional, playful, urgent, benefit-focused
- Return ONLY valid JSON array, no markdown

Format: [{"text":"...","tone":"punchy"},{"text":"...","tone":"professional"},...] (exactly 5 items)${brandBlock}`

  const systemPrompt = 'You are an expert advertising copywriter. Return only valid JSON arrays, no markdown code blocks.'
  const assignment = await resolveAiModelAssignment({
    featureKey: 'banner_copy_suggest',
    defaultProvider: 'workers_ai',
    defaultModelId: '@cf/meta/llama-3.1-8b-instruct',
    defaultFallbackModelId: GROQ_MODELS.LLAMA_8B,
    supportedProviders: ['workers_ai', 'groq']
  })

  if (assignment.ignoredReason) throw createError({ statusCode: 503, statusMessage: 'The assigned copy model is unsupported' })
  let evidence = { provider: assignment.provider, model: assignment.modelId, fallback: false }
  let suggestions: CopySuggestion[] = []

  if (assignment.provider === 'workers_ai') {
    try {
      const aiResult = await edgeGenerate(event, prompt, {
        modelId: assignment.modelId,
        systemPrompt,
        maxTokens: 500,
        temperature: 0.7,
        featureKey: 'banner_copy_suggest',
        userId: user?.id ?? null,
        metadata: {
          route: '/api/agency/banner-studio/ai/copy-suggest',
          providerPath: 'workers_ai',
          modelAssignmentSource: assignment.source,
          modelAssignmentIgnoredReason: assignment.ignoredReason,
          format: context?.format ?? null
        }
      })

      if (aiResult) {
        suggestions = parseAiResponse(aiResult)
      }
    } catch {
      // Fall through to Groq
    }
    // Outside the provider catch: a stale source must never trigger a fallback.
    await validateSavedSource?.()
  }

  // Fallback to Groq if Workers AI unavailable or failed
  if (suggestions.length === 0) {
    try {
      const groqModel = groqModelIdFromAssignment(
        assignment.provider === 'groq' ? assignment.modelId : assignment.fallbackModelId || GROQ_MODELS.LLAMA_8B
      ) as GroqModel
      const groqResult = await generateGroqInsight(prompt, {
        model: groqModel,
        systemPrompt,
        maxTokens: 500,
        temperature: 0.7,
        featureKey: 'banner_copy_suggest',
        userId: user?.id ?? null,
        metadata: {
          route: '/api/agency/banner-studio/ai/copy-suggest',
          providerPath: assignment.provider === 'groq' ? 'groq' : 'groq_fallback',
          modelAssignmentSource: assignment.source,
          modelAssignmentIgnoredReason: assignment.ignoredReason,
          hasProjectName: Boolean(context?.projectName),
          hasClientName: Boolean(context?.clientName),
          format: context?.format ?? null
        }
      })
      suggestions = parseAiResponse(groqResult)
      evidence = { provider: 'groq', model: groqModel, fallback: assignment.provider !== 'groq' }
    } catch {
      // No synthetic success: provider failure is visible to the operator.
      suggestions = []
    }
    await validateSavedSource?.()
  }

  suggestions = suggestions.filter(s => isSafeBannerRewrite(text, s.text))
  if (!suggestions.length) throw createError({ statusCode: 503, statusMessage: 'AI copy is unavailable or returned no safe alternatives' })
  return { suggestions, evidence, ...(sourceRevision ? { sourceRevision } : {}) }
})

function parseAiResponse(raw: string): CopySuggestion[] {
  try {
    // Extract JSON array from response (may contain markdown)
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return []
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []

    const checked = z.array(z.object({ text: z.string().trim().min(1).max(4000), tone: z.string().max(80).default('general') })).safeParse(parsed)
    if (!checked.success) return []
    return checked.data.slice(0, 5).map(item => ({ ...item, charCount: item.text.length }))
  } catch {
    return []
  }
}
