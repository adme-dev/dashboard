import { platformAgentEnabled } from '~~/server/utils/ai/platformAgentFlags'
import { requireAuth } from '~~/server/utils/auth'
import { runPublishingPlannerAgentRequest } from '~~/server/utils/ai/publishingPlannerAgentRuntime'
import { resolveUserPlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'
import { resolvePlatformAgentScope } from '~~/server/utils/ai/platformAgentScope'

export default defineEventHandler(async (event) => {
  if (!platformAgentEnabled(event, 'PUBLISHING_PLANNER_AGENT_ENABLED')) {
    throw createError({ statusCode: 404, statusMessage: 'Publishing Planner Agent is not enabled.' })
  }

  const user = await requireAuth(event)
  const body = await readBody(event)
  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }

  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const authority = await resolveUserPlatformAgentAuthority(event, {
    permissionGroups: ['CLIENTS', 'MEDIA_BUYING', 'CREATIVE'],
    tenant: 'none'
  })
  if (authority.actor.id !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Assistant authority actor mismatch' })
  }
  const scope = resolvePlatformAgentScope(authority, {
    requestedClientId: typeof context.clientId === 'string' ? context.clientId : null,
    clientSelection: 'required'
  })
  return runPublishingPlannerAgentRequest({
    prompt,
    context,
    scope,
    userId: authority.actor.id,
    route: '/agency/social/publishing/planner'
  })
})
