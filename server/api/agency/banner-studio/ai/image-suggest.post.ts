/**
 * AI Image Keyword Suggestions for Banners
 * POST /api/agency/banner-studio/ai/image-suggest
 * Body: { texts: string[], projectName?: string, clientName?: string, purpose?: string }
 * Returns: { suggestions: { keyword: string, description: string, style: string }[] }
 */

import { requireAuth } from '~~/server/utils/auth'
import { edgeGenerate } from '~~/server/utils/edgeAi'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

interface ImageSuggestion {
  keyword: string
  description: string
  style: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const body = await readBody(event)
  const { texts, projectName, clientName, purpose } = body as {
    texts: string[]
    projectName?: string
    clientName?: string
    purpose?: string
  }

  if (!texts?.length) {
    throw createError({ statusCode: 400, statusMessage: 'texts array is required' })
  }

  const textList = texts.slice(0, 5).map(t => `"${t}"`).join(', ')
  const contextLines = [
    projectName ? `Project: ${projectName}` : '',
    clientName ? `Brand: ${clientName}` : '',
    purpose ? `Goal: ${purpose}` : '',
  ].filter(Boolean).join('\n')

  const prompt = `You are a creative director choosing imagery for banner ads.

Banner text: ${textList}
${contextLines ? `\nContext:\n${contextLines}` : ''}

Suggest 6 image search keywords/phrases for stock photography or illustrations that would complement these ads. For each, describe the visual and suggest a style.

Return ONLY valid JSON array:
[{"keyword":"search phrase","description":"what the image shows","style":"photo|illustration|abstract|pattern"},...]`

  const systemPrompt = 'You are an expert creative director. Return only valid JSON arrays, no markdown code blocks.'

  let suggestions: ImageSuggestion[] = []

  // Workers AI first
  try {
    const aiResult = await edgeGenerate(event, prompt, {
      systemPrompt,
      maxTokens: 400,
      temperature: 0.7,
      featureKey: 'banner_image_suggest',
      userId: user?.id ?? null,
      metadata: {
        route: '/api/agency/banner-studio/ai/image-suggest',
        providerPath: 'workers_ai',
        textCount: texts.length,
      },
    })
    if (aiResult) suggestions = parseResponse(aiResult)
  } catch {
    // Fall through to Groq
  }

  // Groq fallback
  if (suggestions.length === 0) {
    try {
      const groqResult = await generateGroqInsight(prompt, {
        model: GROQ_MODELS.LLAMA_8B,
        systemPrompt,
        maxTokens: 400,
        temperature: 0.7,
        featureKey: 'banner_image_suggest',
        userId: user?.id ?? null,
        metadata: {
          route: '/api/agency/banner-studio/ai/image-suggest',
          textCount: texts.length,
          hasProjectName: Boolean(projectName),
          hasClientName: Boolean(clientName),
        },
      })
      suggestions = parseResponse(groqResult)
    } catch {
      // Both failed — generate keyword-based fallback
      suggestions = generateFallback(texts)
    }
  }

  return { suggestions }
})

function parseResponse(raw: string): ImageSuggestion[] {
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return []
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item: any) => item && typeof item.keyword === 'string' && item.keyword.trim())
      .slice(0, 6)
      .map((item: any) => ({
        keyword: item.keyword.trim(),
        description: typeof item.description === 'string' ? item.description.trim() : '',
        style: ['photo', 'illustration', 'abstract', 'pattern'].includes(item.style) ? item.style : 'photo',
      }))
  } catch {
    return []
  }
}

function generateFallback(texts: string[]): ImageSuggestion[] {
  // Extract meaningful words from texts
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'be', 'to', 'of', 'and', 'in', 'for', 'on', 'with', 'your', 'our', 'get', 'now'])
  const words = texts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))

  const unique = [...new Set(words)].slice(0, 4)

  const suggestions: ImageSuggestion[] = [
    { keyword: unique.join(' ') + ' professional', description: 'Professional imagery matching your ad theme', style: 'photo' },
    { keyword: 'abstract background gradient', description: 'Modern gradient background', style: 'abstract' },
    { keyword: unique[0] ? `${unique[0]} lifestyle` : 'business lifestyle', description: 'Lifestyle photography', style: 'photo' },
    { keyword: 'minimal flat design elements', description: 'Clean design elements', style: 'illustration' },
    { keyword: 'geometric pattern modern', description: 'Geometric pattern overlay', style: 'pattern' },
    { keyword: unique[0] ? `${unique[0]} concept` : 'creative concept', description: 'Conceptual imagery', style: 'photo' },
  ]

  return suggestions
}
