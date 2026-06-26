export interface RawDraft {
  content: string
  variants: Record<string, string>
  hashtags: string[]
}

import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'
import type { SocialGeneratedDraft, SocialPublishPlatform } from '~/types'

export interface GenerateSocialPublishingPlanDraftsInput {
  userId?: string | null
  clientId?: string | null
  campaignId?: string | null
  brief: string
  count?: number
  dateFrom?: string | null
  dateTo?: string | null
  tone?: string | null
  platforms?: SocialPublishPlatform[]
  route?: string
}

/** Parse the model's JSON response into clean draft rows. Tolerant of ```json fences; [] on garbage. */
export function parsePlanDrafts(raw: string): RawDraft[] {
  const cleaned = String(raw ?? '').replace(/```json/gi, '').replace(/```/g, '').trim()
  let parsed: any
  try { parsed = JSON.parse(cleaned) } catch { return [] }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.posts) ? parsed.posts : []
  const out: RawDraft[] = []
  for (const p of list) {
    if (!p || typeof p.content !== 'string' || !p.content.trim()) continue
    out.push({
      content: p.content.trim(),
      variants: (p.variants && typeof p.variants === 'object') ? p.variants : {},
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.filter((h: any) => typeof h === 'string') : [],
    })
  }
  return out
}

/** Evenly distribute `count` ISO timestamps across (fromISO, toISO]. Deterministic; no Date.now(). */
export function spreadSchedule(count: number, fromISO: string, toISO: string): string[] {
  if (count <= 0) return []
  const from = new Date(fromISO).getTime()
  const to = new Date(toISO).getTime()
  const span = to - from
  return Array.from({ length: count }, (_, i) =>
    new Date(from + Math.round((span * (i + 1)) / (count + 1))).toISOString(),
  )
}

export async function generateSocialPublishingPlanDrafts(input: GenerateSocialPublishingPlanDraftsInput): Promise<SocialGeneratedDraft[]> {
  const brief = String(input.brief ?? '').trim()
  if (!brief) throw createError({ statusCode: 400, statusMessage: 'brief required' })

  const count = Math.min(Math.max(Number(input.count ?? 5), 1), 14)
  const tone = String(input.tone || 'friendly')
  const platforms = Array.isArray(input.platforms) && input.platforms.length ? input.platforms : ['facebook'] as SocialPublishPlatform[]

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
      temperature: 0.8,
      maxTokens: 2000,
      systemPrompt: 'You are an expert social media strategist. Output ONLY valid JSON matching the requested shape — no prose, no code fences.',
      featureKey: 'social_publishing_plan',
      userId: input.userId ?? null,
      clientId: input.clientId ?? null,
      metadata: {
        route: input.route ?? '/api/agency/social/publishing/ai/generate-plan',
        platformCount: platforms.length,
        postCount: count,
        hasCampaignId: Boolean(input.campaignId),
      },
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'AI generation failed — please retry' })
  }

  const drafts = parsePlanDrafts(raw)
  const nowISO = new Date().toISOString()
  const times = spreadSchedule(drafts.length, String(input.dateFrom ?? nowISO), String(input.dateTo ?? input.dateFrom ?? nowISO))
  return drafts.map((draft, index) => {
    const overrides: Record<string, { content: string }> = {}
    for (const platform of platforms) {
      if (draft.variants[platform]) overrides[platform] = { content: draft.variants[platform] }
    }
    return {
      content: draft.content,
      platforms,
      platform_overrides: overrides,
      hashtags: draft.hashtags,
      suggested_scheduled_at: times[index] ?? null,
    }
  })
}
