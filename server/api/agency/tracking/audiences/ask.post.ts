import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'
import { requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import {
  buildAudienceGrounding,
  parseAudienceRange
} from '~~/server/utils/tracking/audience-analytics'
import {
  getAudienceBreakdowns,
  getAudienceOverview
} from '~~/server/utils/tracking/audience-repository'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) {
    throw createError({ statusCode: 400, statusMessage: 'question is required' })
  }
  if (question.length > 500) {
    throw createError({ statusCode: 400, statusMessage: 'question must be 500 characters or fewer' })
  }

  const from = typeof body?.from === 'string' ? body.from : undefined
  const to = typeof body?.to === 'string' ? body.to : undefined
  const clientId = typeof body?.clientId === 'string' && body.clientId
    ? body.clientId
    : undefined
  const range = parseAudienceRange({ from, to })
  const { user, clientIds, accessibleClientIds } = await requireTrackingAudienceScope(event, clientId)

  const [overview, sources, campaigns, pages] = await Promise.all([
    getAudienceOverview({ range, clientIds, accessibleClientIds }),
    getAudienceBreakdowns({ range, clientIds, dimension: 'source' }),
    getAudienceBreakdowns({ range, clientIds, dimension: 'campaign' }),
    getAudienceBreakdowns({ range, clientIds, dimension: 'page' })
  ])

  const grounding = buildAudienceGrounding({
    window: range,
    scope: clientId ? 'client' : 'agency',
    kpis: overview.kpis,
    previousKpis: overview.previousKpis,
    opportunities: overview.opportunities,
    breakdowns: {
      source: sources.rows,
      campaign: campaigns.rows,
      page: pages.rows
    }
  })
  const serializedGrounding = JSON.stringify(grounding)

  let answer: string
  try {
    answer = await generateModelRoutedGroqInsight(
      `Question: ${question}\n\nWebsite Audience facts (JSON, the ONLY data you may use):\n${serializedGrounding}`,
      {
        defaultModelId: GROQ_MODELS.LLAMA_70B,
        temperature: 0.1,
        maxTokens: 650,
        featureKey: 'agency_audience_analytics_ask',
        userId: user?.id ?? null,
        clientId: clientId ?? null,
        requestId: `${range.fromDate}:${range.toDate}:${clientId ?? 'agency'}`,
        metadata: {
          route: '/api/agency/tracking/audiences/ask',
          scope: clientId ? 'client' : 'agency',
          startDate: range.fromDate,
          endDate: range.toDate,
          questionChars: question.length,
          opportunityCount: grounding.opportunities.length,
          breakdownRowCount: Object.values(grounding.breakdowns)
            .reduce((total, rows) => total + (rows?.length ?? 0), 0)
        },
        systemPrompt:
          'Answer only from the supplied Website Audience facts. Cite concrete values and the reporting window. '
          + 'Distinguish tracking observations from marketing recommendations. If the facts do not answer the question, say so. '
          + 'Never claim an audience was activated or a campaign was changed. Keep the answer to 2–5 concise paragraphs.'
      }
    )
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Insight generation unavailable' })
  }

  return {
    answer,
    generatedAt: new Date().toISOString(),
    grounding
  }
})
