import { runSpendControllerAgentRequest } from '~~/server/utils/ai/spendControllerAgentRuntime'
import { resolveServicePlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'
import { optionalPlatformAgentAssertionAuthority } from '~~/server/utils/ai/platformAgentBridgeAssertion'
import { resolvePlatformAgentScope } from '~~/server/utils/ai/platformAgentScope'
import { requirePlatformAgentServiceAuth } from '~~/server/utils/ai/platformAgentServiceAuth'

function enabled() {
  return process.env.SPEND_CONTROLLER_AGENT_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  await requirePlatformAgentServiceAuth(event)

  if (!enabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Spend Controller Agent is not enabled.' })
  }

  const body = await readBody(event)
  if (body?.draftActions === true) {
    throw createError({ statusCode: 403, statusMessage: 'Internal Spend Controller bridge is read-only.' })
  }

  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }

  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const assertedAuthority = await optionalPlatformAgentAssertionAuthority(event, 'spend-controller')
  const authority = assertedAuthority ?? await resolveServicePlatformAgentAuthority({
    serviceId: 'cloudflare-platform-agents',
    tenant: 'none'
  })
  const scope = resolvePlatformAgentScope(authority, {
    requestedClientId: typeof context.clientId === 'string' ? context.clientId : null,
    clientSelection: 'all_allowed'
  })
  return runSpendControllerAgentRequest({
    prompt,
    context,
    scope,
    draftActions: false,
    userId: assertedAuthority ? authority.actor.id : null,
    route: '/internal/platform-agents/spend-controller'
  })
})
