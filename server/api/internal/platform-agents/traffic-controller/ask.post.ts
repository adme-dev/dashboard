import { runTrafficControllerAgentRequest } from '~~/server/utils/ai/trafficControllerAgentRuntime'
import { resolveServicePlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'
import { optionalPlatformAgentAssertionAuthority } from '~~/server/utils/ai/platformAgentBridgeAssertion'
import { resolvePlatformAgentScope } from '~~/server/utils/ai/platformAgentScope'
import { requirePlatformAgentServiceAuth } from '~~/server/utils/ai/platformAgentServiceAuth'

function enabled() {
  return process.env.TRAFFIC_CONTROLLER_AGENT_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  await requirePlatformAgentServiceAuth(event)

  if (!enabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Traffic Controller Agent is not enabled.' })
  }

  const body = await readBody(event)
  if (body?.draftActions === true) {
    throw createError({ statusCode: 403, statusMessage: 'Traffic Controller bridge does not allow direct write actions.' })
  }

  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }
  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const clientId = typeof context.clientId === 'string' && context.clientId.trim() ? context.clientId.trim() : null
  const assertedAuthority = await optionalPlatformAgentAssertionAuthority(event, 'traffic-controller')
  const authority = assertedAuthority ?? await resolveServicePlatformAgentAuthority({
    serviceId: 'cloudflare-platform-agents',
    tenant: 'none'
  })
  const scope = resolvePlatformAgentScope(authority, {
    requestedClientId: clientId,
    clientSelection: 'all_allowed'
  })

  return runTrafficControllerAgentRequest({
    prompt,
    scope,
    userId: assertedAuthority ? authority.actor.id : null,
    route: '/internal/platform-agents/traffic-controller'
  })
})
