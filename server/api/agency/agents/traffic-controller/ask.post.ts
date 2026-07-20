import { requireAuth } from '~~/server/utils/auth'
import { runTrafficControllerAgentRequest } from '~~/server/utils/ai/trafficControllerAgentRuntime'
import { resolveUserPlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'
import { resolvePlatformAgentScope } from '~~/server/utils/ai/platformAgentScope'

function enabled() {
  return process.env.TRAFFIC_CONTROLLER_AGENT_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  if (!enabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Traffic Controller Agent is not enabled.' })
  }

  const user = await requireAuth(event)
  const body = await readBody(event)
  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }
  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const clientId = typeof context.clientId === 'string' && context.clientId.trim() ? context.clientId.trim() : null
  const authority = await resolveUserPlatformAgentAuthority(event, {
    permissionGroups: ['ADMIN'],
    tenant: 'none'
  })
  if (authority.actor.id !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Assistant authority actor mismatch' })
  }
  const scope = resolvePlatformAgentScope(authority, {
    requestedClientId: clientId,
    clientSelection: 'all_allowed'
  })

  return runTrafficControllerAgentRequest({
    prompt,
    scope,
    userId: authority.actor.id,
    route: '/agency/traffic-controller'
  })
})
