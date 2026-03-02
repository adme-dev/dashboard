/**
 * AI Copy Generation for Banner Text Layers
 * POST /api/agency/banner-studio/ai/copy-suggest
 * Body: { text, context?: { projectName, clientName, format, purpose } }
 * Returns: { suggestions: { text, tone, charCount }[] }
 */

import { requireAuth } from '~~/server/utils/auth'
import { edgeGenerate } from '~~/server/utils/edgeAi'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

interface CopySuggestion {
  text: string
  tone: string
  charCount: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { text, context } = body as {
    text: string
    context?: {
      projectName?: string
      clientName?: string
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

  const prompt = `You are an advertising copywriter. Given this banner text and context, suggest 5 alternative versions.

Current text: "${text}"
Max characters: ~${maxChars}
${contextLines ? `\nContext:\n${contextLines}` : ''}

Requirements:
- Each suggestion should be a different tone/approach
- Keep text concise — it must fit in a banner ad
- Vary between: punchy, professional, playful, urgent, benefit-focused
- Return ONLY valid JSON array, no markdown

Format: [{"text":"...","tone":"punchy"},{"text":"...","tone":"professional"},...] (exactly 5 items)`

  const systemPrompt = 'You are an expert advertising copywriter. Return only valid JSON arrays, no markdown code blocks.'

  let suggestions: CopySuggestion[] = []

  // Try Workers AI first (fast, free)
  try {
    const aiResult = await edgeGenerate(event, prompt, {
      systemPrompt,
      maxTokens: 500,
      temperature: 0.7,
    })

    if (aiResult) {
      suggestions = parseAiResponse(aiResult)
    }
  } catch {
    // Fall through to Groq
  }

  // Fallback to Groq if Workers AI unavailable or failed
  if (suggestions.length === 0) {
    try {
      const groqResult = await generateGroqInsight(prompt, {
        model: GROQ_MODELS.LLAMA_8B,
        systemPrompt,
        maxTokens: 500,
        temperature: 0.7,
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
