/**
 * Portal Analytics AI Summary — client-scoped
 * POST /api/portal/analytics/ai-summary
 *
 * Body: { campaignId: string, breakdowns: object, campaignName?: string, platform?: string }
 * Returns: { summary: string | null }
 */
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { edgeGenerate } from '~~/server/utils/edgeAi'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const body = await readBody(event)

  if (!body?.campaignId || !body?.breakdowns) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId and breakdowns are required' })
  }

  const { breakdowns, campaignName, platform } = body

  try {
    const prompt = buildClientSummaryPrompt(breakdowns, campaignName, platform)

    const summary = await edgeGenerate(event, prompt, {
      systemPrompt: 'You are a friendly marketing advisor explaining campaign performance to a business owner. Use simple, everyday language — avoid marketing jargon. Focus on what matters to the business: where their money is going and what results they\'re getting. Be encouraging but honest. 3-4 bullet points maximum. Use bullet points (•) format.',
      maxTokens: 350,
      temperature: 0.4,
    })

    return { summary }
  } catch (error: any) {
    console.error('Portal AI summary generation failed:', error)
    return { summary: null }
  }
})

function buildClientSummaryPrompt(breakdowns: any, campaignName?: string, platform?: string): string {
  const parts: string[] = [
    `Summarize this advertising campaign's performance for a business owner:`
  ]

  if (campaignName) parts.push(`Campaign: ${campaignName}`)
  if (platform) parts.push(`Platform: ${platform}`)

  if (breakdowns.age?.length > 0) {
    const ageLines = breakdowns.age
      .slice(0, 5)
      .map((a: any) => `${a.dimensionValue}: $${a.spend?.toFixed(0) || 0} spent, ${a.ctr?.toFixed(1) || 0}% click rate`)
      .join('; ')
    parts.push(`Age groups: ${ageLines}`)
  }

  if (breakdowns.gender?.length > 0) {
    const genderLines = breakdowns.gender
      .map((g: any) => `${g.dimensionValue}: ${g.clicks || 0} clicks`)
      .join('; ')
    parts.push(`Audience: ${genderLines}`)
  }

  if (breakdowns.device?.length > 0) {
    const deviceLines = breakdowns.device
      .map((d: any) => `${d.dimensionValue}: ${d.impressions || 0} views`)
      .join('; ')
    parts.push(`Devices: ${deviceLines}`)
  }

  if (breakdowns.geo?.length > 0) {
    const geoLines = breakdowns.geo
      .slice(0, 5)
      .map((g: any) => `${g.dimensionValue}: $${g.spend?.toFixed(0) || 0}`)
      .join('; ')
    parts.push(`Locations: ${geoLines}`)
  }

  parts.push('')
  parts.push('Give 3-4 simple bullet points: what\'s working, what could improve, and one suggestion.')

  return parts.join('\n')
}
