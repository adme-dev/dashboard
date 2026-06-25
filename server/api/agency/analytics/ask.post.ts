/**
 * Natural-language analytics insights
 * POST /api/agency/analytics/ask  body: { question, startDate?, endDate?, clientId? }
 *
 * Answers a metric question grounded in the canonical fact: we fetch the
 * window's canonical daily fact, aggregate to a compact per-channel summary,
 * and ask Groq to answer ONLY from those numbers (no hallucinated metrics).
 * Returns the answer plus the grounding summary it was given.
 */
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { fetchCanonicalFact } from '~~/server/utils/canonicalFactQuery'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface ChannelTotals {
  channel: string
  spend: number
  leads: number
  conversions: number
  revenue: number
  sessions: number
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const body = await readBody(event).catch(() => null)
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) {
    throw createError({ statusCode: 400, statusMessage: 'question is required' })
  }
  const clientId = typeof body?.clientId === 'string' && body.clientId ? body.clientId : undefined
  const today = new Date().toISOString().slice(0, 10)
  const startDate = (typeof body?.startDate === 'string' && body.startDate) || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const endDate = (typeof body?.endDate === 'string' && body.endDate) || today
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate must be YYYY-MM-DD' })
  }

  const fact = await fetchCanonicalFact({ startDate, endDate, clientId })

  // Aggregate daily rows → per-channel totals (compact grounding to bound tokens).
  const byChannel = new Map<string, ChannelTotals>()
  for (const r of fact) {
    const c = byChannel.get(r.channel) ?? { channel: r.channel, spend: 0, leads: 0, conversions: 0, revenue: 0, sessions: 0 }
    c.spend += r.spend
    c.leads += r.leads
    c.conversions += r.conversions
    c.revenue += r.revenue
    c.sessions += r.sessions
    byChannel.set(r.channel, c)
  }
  const channels = [...byChannel.values()].map(c => ({
    ...c,
    spend: Math.round(c.spend * 100) / 100,
    revenue: Math.round(c.revenue * 100) / 100,
    cpl: c.spend > 0 && c.leads > 0 ? Math.round((c.spend / c.leads) * 100) / 100 : null,
    cpa: c.spend > 0 && c.conversions > 0 ? Math.round((c.spend / c.conversions) * 100) / 100 : null
  }))

  const grounding = { window: { startDate, endDate }, scope: clientId ? 'client' : 'agency', channels }

  let answer: string
  try {
    answer = await generateGroqInsight(
      `Question: ${question}\n\nMetrics (JSON, currency AUD, the ONLY data you may use):\n${JSON.stringify(grounding)}`,
      {
        model: GROQ_MODELS.LLAMA_70B,
        temperature: 0.1,
        maxTokens: 600,
        featureKey: 'agency_analytics_ask',
        userId: user?.id ?? null,
        clientId: clientId ?? null,
        requestId: `${startDate}:${endDate}:${clientId ?? 'agency'}`,
        metadata: {
          route: '/api/agency/analytics/ask',
          scope: clientId ? 'client' : 'agency',
          startDate,
          endDate,
          channelCount: channels.length,
          questionChars: question.length,
        },
        systemPrompt:
          'You are a marketing analytics assistant. Answer the question using ONLY the supplied metrics JSON. '
          + 'Cite concrete numbers. CPL/CPA/spend are AUD; conversions and revenue are platform-reported, leads are first-party. '
          + 'If the data does not contain the answer, say so plainly. Be concise (2–4 sentences). Do not invent metrics.'
      }
    )
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Insight generation unavailable' })
  }

  return { answer, grounding }
})
