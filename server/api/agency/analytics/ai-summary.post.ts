/**
 * Analytics AI Summary
 * POST /api/agency/analytics/ai-summary
 *
 * Body: { campaignId: string, breakdowns: object, campaignName?: string, platform?: string }
 * Returns: { summary: string | null }
 */
import { requireAuth } from '~~/server/utils/auth'
import { edgeGenerate } from '~~/server/utils/edgeAi'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  if (!body?.campaignId || !body?.breakdowns) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId and breakdowns are required' })
  }

  const { breakdowns, campaignName, platform } = body

  try {
    const prompt = buildSummaryPrompt(breakdowns, campaignName, platform)

    const summary = await edgeGenerate(event, prompt, {
      systemPrompt: 'You are a digital marketing analyst writing for a sales team. Use clear, non-technical language. Focus on actionable insights. Be concise — 3-4 bullet points maximum. Use bullet points (•) format.',
      maxTokens: 350,
      temperature: 0.4,
      featureKey: 'agency_analytics_ai_summary',
      userId: user?.id ?? null,
      requestId: body.campaignId,
      metadata: {
        route: '/api/agency/analytics/ai-summary',
        campaignId: body.campaignId,
        platform: typeof platform === 'string' ? platform : null,
        hasCampaignName: Boolean(campaignName),
        ageBreakdownCount: Array.isArray(breakdowns.age) ? breakdowns.age.length : 0,
        genderBreakdownCount: Array.isArray(breakdowns.gender) ? breakdowns.gender.length : 0,
        deviceBreakdownCount: Array.isArray(breakdowns.device) ? breakdowns.device.length : 0,
        geoBreakdownCount: Array.isArray(breakdowns.geo) ? breakdowns.geo.length : 0,
      },
    })

    return { summary }
  } catch (error: any) {
    console.error('AI summary generation failed:', error)
    return { summary: null }
  }
})

function buildSummaryPrompt(breakdowns: any, campaignName?: string, platform?: string): string {
  const parts: string[] = [
    `Summarize this ad campaign performance for a non-technical sales person:`
  ]

  if (campaignName) parts.push(`Campaign: ${campaignName}`)
  if (platform) parts.push(`Platform: ${platform}`)

  if (breakdowns.age?.length > 0) {
    const ageLines = breakdowns.age
      .slice(0, 5)
      .map((a: any) => `${a.dimensionValue}: $${a.spend?.toFixed(0) || 0} spend, ${a.ctr?.toFixed(1) || 0}% CTR`)
      .join('; ')
    parts.push(`Age breakdown: ${ageLines}`)
  }

  if (breakdowns.gender?.length > 0) {
    const genderLines = breakdowns.gender
      .map((g: any) => `${g.dimensionValue}: ${g.clicks || 0} clicks, ${g.ctr?.toFixed(1) || 0}% CTR`)
      .join('; ')
    parts.push(`Gender: ${genderLines}`)
  }

  if (breakdowns.device?.length > 0) {
    const deviceLines = breakdowns.device
      .map((d: any) => `${d.dimensionValue}: ${d.impressions || 0} impressions`)
      .join('; ')
    parts.push(`Device: ${deviceLines}`)
  }

  if (breakdowns.geo?.length > 0) {
    const geoLines = breakdowns.geo
      .slice(0, 5)
      .map((g: any) => `${g.dimensionValue}: $${g.spend?.toFixed(0) || 0}`)
      .join('; ')
    parts.push(`Top regions: ${geoLines}`)
  }

  parts.push('')
  parts.push('Give 3-4 bullet points: what\'s working well, what\'s underperforming, and one actionable recommendation.')

  return parts.join('\n')
}
