import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { generateGroqInsight } from '~~/server/utils/groqClient'

/**
 * POST /api/agency/social/publishing/ai/generate-caption
 * Body: { topic?, content?, platform?, tone? } → { caption }
 * Generates an on-brand social caption via Groq, tuned per network.
 */
const PLATFORM_GUIDELINES: Record<string, string> = {
  facebook: 'Conversational, 1-3 short paragraphs (up to ~500 chars). Engage with a question.',
  instagram: 'Visual-first, punchy opening line. Use line breaks. A few relevant hashtags. Emojis welcome.',
  tiktok: 'Short, trendy, Gen-Z friendly. Hook in the first 3 words. Keep under ~150 chars.',
  linkedin: 'Professional, thought-leadership tone. 1-2 short paragraphs. Minimal emojis.',
  youtube: 'Descriptive, SEO-friendly. Include keywords naturally.',
  'google-business': 'Local-SEO focused. Concise (150-300 chars). Clear call-to-action.',
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const b = await readBody(event)
  const topic = String(b?.topic ?? b?.content ?? '').trim()
  if (!topic) throw createError({ statusCode: 400, statusMessage: 'topic or content required' })

  const platform = String(b?.platform ?? 'facebook')
  const tone = String(b?.tone ?? 'friendly')
  const guideline = PLATFORM_GUIDELINES[platform] ?? PLATFORM_GUIDELINES.facebook

  const prompt = [
    `Write a ${tone} organic social media post for ${platform}.`,
    `Platform guidelines: ${guideline}`,
    `Topic / brief: ${topic}`,
    'Return ONLY the post copy — no preamble, no quotes, no explanation.',
  ].join('\n')

  const caption = await generateGroqInsight(prompt, {
    temperature: 0.7,
    maxTokens: 400,
    systemPrompt:
      'You are an expert social media copywriter for a digital marketing agency. Write engaging, on-brand captions that fit the platform. Output only the caption text.',
    featureKey: 'social_publishing_caption',
    userId: user?.id ?? null,
    metadata: {
      route: '/api/agency/social/publishing/ai/generate-caption',
      platform,
      tone,
    },
  })

  return { caption: caption.trim() }
})
