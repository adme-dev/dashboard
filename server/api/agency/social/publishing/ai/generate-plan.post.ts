import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'
import { isPlannerAiEnabled } from '~~/server/utils/socialPublishing/plannerGate'
import { parsePlanDrafts, spreadSchedule } from '~~/server/utils/socialPublishing/planGeneration'
import type { SocialGeneratedDraft, SocialPublishPlatform } from '~/types'

/**
 * POST /api/agency/social/publishing/ai/generate-plan
 * Body: { clientId, campaignId?, brief, count, dateFrom, dateTo, tone?, platforms[] }
 * → { posts: SocialGeneratedDraft[] }. PURE generation — writes nothing.
 */
export default defineEventHandler(async (event): Promise<{ posts: SocialGeneratedDraft[] }> => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isPlannerAiEnabled()) throw createError({ statusCode: 404, statusMessage: 'Planner AI not enabled' })
  const b = await readBody(event)
  const brief = String(b?.brief ?? '').trim()
  if (!brief) throw createError({ statusCode: 400, statusMessage: 'brief required' })
  const count = Math.min(Math.max(Number(b?.count ?? 5), 1), 14)
  const tone = String(b?.tone ?? 'friendly')
  const platforms = (Array.isArray(b?.platforms) && b.platforms.length ? b.platforms : ['facebook']) as SocialPublishPlatform[]

  const prompt = [
    `Create a ${count}-post social media content plan for a digital marketing agency client.`,
    `Brief / theme: ${brief}`,
    `Tone: ${tone}. Target platforms: ${platforms.join(', ')}.`,
    'For EACH post provide a default "content" plus per-platform "variants" tailored to each platform (Instagram = visual/emoji/hashtags, LinkedIn = professional, etc.), and 2-5 "hashtags".',
    'Return ONLY valid JSON of the exact shape:',
    '{"posts":[{"content":"...","variants":{"instagram":"...","linkedin":"..."},"hashtags":["..."]}]}',
  ].join('\n')

  let raw = ''
  try {
    raw = await generateModelRoutedGroqInsight(prompt, {
      defaultModelId: GROQ_MODELS.LLAMA_70B,
      temperature: 0.8, maxTokens: 2000,
      systemPrompt: 'You are an expert social media strategist. Output ONLY valid JSON matching the requested shape — no prose, no code fences.',
      featureKey: 'social_publishing_plan',
      userId: user?.id ?? null,
      clientId: typeof b?.clientId === 'string' ? b.clientId : null,
      metadata: {
        route: '/api/agency/social/publishing/ai/generate-plan',
        platformCount: platforms.length,
        postCount: count,
        hasCampaignId: Boolean(b?.campaignId),
      },
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'AI generation failed — please retry' })
  }

  const drafts = parsePlanDrafts(raw)
  const nowISO = new Date().toISOString()
  const times = spreadSchedule(drafts.length, String(b?.dateFrom ?? nowISO), String(b?.dateTo ?? b?.dateFrom ?? nowISO))
  const posts: SocialGeneratedDraft[] = drafts.map((d, i) => {
    const overrides: Record<string, { content: string }> = {}
    for (const pl of platforms) if (d.variants[pl]) overrides[pl] = { content: d.variants[pl] }
    return {
      content: d.content, platforms, platform_overrides: overrides,
      hashtags: d.hashtags, suggested_scheduled_at: times[i] ?? null,
    }
  })
  return { posts }
})
