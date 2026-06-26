import { requireAuth } from '~~/server/utils/auth'
import { runPublishingPlannerAgentRequest } from '~~/server/utils/ai/publishingPlannerAgentRuntime'

function enabled() {
  return process.env.PUBLISHING_PLANNER_AGENT_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  if (!enabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Publishing Planner Agent is not enabled.' })
  }

  const user = await requireAuth(event)
  const body = await readBody(event)
  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }

  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  return runPublishingPlannerAgentRequest({
    prompt,
    context,
    userId: user?.id ?? null,
    route: '/agency/social/publishing/planner',
  })
})
