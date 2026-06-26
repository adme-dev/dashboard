import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { isPlannerAiEnabled } from '~~/server/utils/socialPublishing/plannerGate'
import { generateSocialPublishingPlanDrafts } from '~~/server/utils/socialPublishing/planGeneration'
import type { SocialGeneratedDraft } from '~/types'

/**
 * POST /api/agency/social/publishing/ai/generate-plan
 * Body: { clientId, campaignId?, brief, count, dateFrom, dateTo, tone?, platforms[] }
 * → { posts: SocialGeneratedDraft[] }. PURE generation — writes nothing.
 */
export default defineEventHandler(async (event): Promise<{ posts: SocialGeneratedDraft[] }> => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isPlannerAiEnabled()) throw createError({ statusCode: 404, statusMessage: 'Planner AI not enabled' })
  const b = await readBody(event)
  const posts = await generateSocialPublishingPlanDrafts({
    userId: user?.id ?? null,
    clientId: typeof b?.clientId === 'string' ? b.clientId : null,
    campaignId: typeof b?.campaignId === 'string' ? b.campaignId : null,
    brief: b?.brief,
    count: b?.count,
    dateFrom: b?.dateFrom,
    dateTo: b?.dateTo,
    tone: b?.tone,
    platforms: b?.platforms,
    route: '/api/agency/social/publishing/ai/generate-plan',
  })
  return { posts }
})
