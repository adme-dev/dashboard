/**
 * AI Copy Generation for Banner Text Layers
 * POST /api/agency/banner-studio/ai/copy-suggest
 * Body: { text, context?: { projectName, clientName, format, purpose } }
 * Returns: { suggestions: { text, tone, charCount }[] }
 */

import { requireAuth } from '~~/server/utils/auth'
import { brandContextForRequest } from '~~/server/utils/banner/brandKits'
import { edgeGenerate } from '~~/server/utils/edgeAi'
import { generateGroqInsight, GROQ_MODELS, type GroqModel } from '~~/server/utils/groqClient'
import { groqModelIdFromAssignment, resolveAiModelAssignment } from '~~/server/utils/ai/modelAssignments'

interface CopySuggestion {
  text: string
  tone: string
  charCount: number
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const body = await readBody(event)
  const { text, context, projectId, brandKitId } = body as {
    text: string
    projectId?: string
    brandKitId?: string
    context?: {
      projectName?: string
      clientName?: string
      clientId?: string
      format?: string // e.g. "300x250"
      purpose?: string // e.g. "brand awareness", "lead gen"
    }
  }

  if (!text || typeof text !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'text is required' })
  }

  const maxChars = text.length + 20 // Allow slightly longer alternatives
  const contextLines = [
    context?.projectName ? `Project: ${context.projectName}` : '',
    context?.clientName ? `Brand: ${context.clientName}` : '',
    context?.format ? `Banner size: ${context.format}` : '',
    context?.purpose ? `Campaign goal: ${context.purpose}` : '',
  ].filter(Boolean).join('\n')

  // Brand kit (client default or explicit) — tone/guidelines steer the copy
  const brandBlock = await brandContextForRequest({ brandKitId, projectId, clientId: context?.clientId })

  const prompt = `You are an advertising copywriter. Given this banner text and context, suggest 5 alternative versions.

Current text: "${text}"
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
    supportedProviders: ['workers_ai', 'groq'],
  })

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
          format: context?.format ?? null,
        },
      })

      if (aiResult) {
        suggestions = parseAiResponse(aiResult)
      }
    } catch {
      // Fall through to Groq
    }
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
          format: context?.format ?? null,
        },
      })
      suggestions = parseAiResponse(groqResult)
    } catch {
      // Both AI providers failed — return simple variations
      suggestions = generateFallbackSuggestions(text)
    }
  }

  return { suggestions }
})

function parseAiResponse(raw: string): CopySuggestion[] {
  try {
    // Extract JSON array from response (may contain markdown)
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return []
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item: any) => item && typeof item.text === 'string' && item.text.trim())
      .slice(0, 5)
      .map((item: any) => ({
        text: item.text.trim(),
        tone: typeof item.tone === 'string' ? item.tone : 'general',
        charCount: item.text.trim().length,
      }))
  } catch {
    return []
  }
}

function generateFallbackSuggestions(text: string): CopySuggestion[] {
  const upper = text.toUpperCase()
  const words = text.split(/\s+/)
  const short = words.slice(0, Math.ceil(words.length * 0.7)).join(' ')

  return [
    { text: upper, tone: 'bold', charCount: upper.length },
    { text: short, tone: 'concise', charCount: short.length },
    { text: `${text}!`, tone: 'urgent', charCount: text.length + 1 },
    { text: `Discover ${text}`, tone: 'inviting', charCount: text.length + 9 },
    { text: text.replace(/\.$/, ''), tone: 'clean', charCount: text.length },
  ]
}
