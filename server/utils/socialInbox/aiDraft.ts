// server/utils/socialInbox/aiDraft.ts
// AI reply drafting via Groq. Returns structured {reply, confidence, risk}. Any failure
// to call or parse fails SAFE: empty reply + confidence 0 + risk true, so the engine
// downgrades to human approval rather than sending something unverified.
import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'
import type { AutomationContext, ReplyDraft } from './automationTypes'

const CHANNEL_HINT: Record<string, string> = {
  comment: 'a public reply to a social media comment (visible to everyone)',
  review: 'a public response to a customer review',
  dm: 'a private direct message',
  mention: 'a public reply to a mention',
}

export function buildDraftPrompt(ctx: AutomationContext, brandPrompt: string): string {
  const channel = CHANNEL_HINT[ctx.channelType] ?? 'a social media reply'
  const ratingLine = ctx.rating != null ? `\nReview rating: ${ctx.rating}/5` : ''
  return [
    `You are drafting ${channel} on ${ctx.platform} for a marketing agency's client.`,
    brandPrompt ? `Brand voice & instructions: ${brandPrompt}` : 'Use a warm, professional, concise brand voice.',
    `\nCustomer (${ctx.participantName ?? 'anonymous'}) wrote:`,
    `"""${ctx.inboundContent}"""${ratingLine}`,
    `\nWrite a reply (max 2 short sentences, no hashtags unless natural, never invent facts like prices or dates).`,
    `Respond with STRICT JSON only, no prose, no code fences:`,
    `{"reply": "<the reply text>", "confidence": <0..1 how confident a human would approve this as-is>, "risk": <true if this needs a human (complaint/legal/sensitive), else false>}`,
  ].join('\n')
}

export function parseDraftResponse(raw: string): ReplyDraft {
  const fail: ReplyDraft = { reply: '', confidence: 0, risk: true }
  if (!raw) return fail
  // Pull the first {...} block (handles code fences / surrounding prose).
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return fail
  let obj: any
  try { obj = JSON.parse(match[0]) } catch { return fail }
  const reply = typeof obj?.reply === 'string' ? obj.reply.trim() : ''
  if (!reply) return fail
  let confidence = Number(obj?.confidence)
  if (!Number.isFinite(confidence)) confidence = 0
  confidence = Math.max(0, Math.min(1, confidence))
  const risk = obj?.risk === true
  return { reply, confidence, risk }
}

/** Calls Groq. On any thrown error returns the fail-safe draft. */
export async function generateReplyDraft(ctx: AutomationContext, brandPrompt: string): Promise<ReplyDraft> {
  try {
    const out = await generateModelRoutedGroqInsight(buildDraftPrompt(ctx, brandPrompt), {
      defaultModelId: GROQ_MODELS.LLAMA_70B,
      temperature: 0.3,
      maxTokens: 300,
      systemPrompt: 'You are a senior social media community manager. You write safe, on-brand, accurate replies and you flag anything sensitive for a human.',
      featureKey: 'social_inbox_reply_draft',
      clientId: ctx.clientId ?? null,
      metadata: {
        platform: ctx.platform,
        channelType: ctx.channelType,
        hasRating: ctx.rating != null,
      },
    })
    return parseDraftResponse(out)
  } catch {
    return { reply: '', confidence: 0, risk: true }
  }
}
