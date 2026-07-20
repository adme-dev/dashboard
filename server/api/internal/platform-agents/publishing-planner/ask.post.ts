import { runPublishingPlannerAgentRequest } from '~~/server/utils/ai/publishingPlannerAgentRuntime'
import { resolveServicePlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'
import { optionalPlatformAgentAssertionAuthority } from '~~/server/utils/ai/platformAgentBridgeAssertion'
import { resolvePlatformAgentScope } from '~~/server/utils/ai/platformAgentScope'
import { requirePlatformAgentServiceAuth } from '~~/server/utils/ai/platformAgentServiceAuth'

function enabled() {
  return process.env.PUBLISHING_PLANNER_AGENT_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  await requirePlatformAgentServiceAuth(event)

  if (!enabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Publishing Planner Agent is not enabled.' })
  }

  const body = await readBody(event)
  if (body?.draftActions === true) {
    throw createError({ statusCode: 403, statusMessage: 'Internal Publishing Planner bridge does not allow direct write actions.' })
  }

  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }

  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const assertedAuthority = await optionalPlatformAgentAssertionAuthority(event, 'publishing-planner')
  const authority = assertedAuthority ?? await resolveServicePlatformAgentAuthority({
    serviceId: 'cloudflare-platform-agents',
    tenant: 'none'
  })
  const scope = resolvePlatformAgentScope(authority, {
    requestedClientId: typeof context.clientId === 'string' ? context.clientId : null,
    clientSelection: 'required'
  })
  return runPublishingPlannerAgentRequest({
    prompt,
    context,
    scope,
    userId: assertedAuthority ? authority.actor.id : null,
    route: '/internal/platform-agents/publishing-planner'
  })
})
