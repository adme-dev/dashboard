import { runFinancialWatchAgentRequest } from '~~/server/utils/ai/financialWatchAgentRuntime'
import { resolveServicePlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'
import { optionalPlatformAgentAssertionAuthority } from '~~/server/utils/ai/platformAgentBridgeAssertion'
import { resolvePlatformAgentScope } from '~~/server/utils/ai/platformAgentScope'
import { requirePlatformAgentServiceAuth } from '~~/server/utils/ai/platformAgentServiceAuth'

function enabled() {
  return process.env.FINANCIAL_WATCH_AGENT_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  await requirePlatformAgentServiceAuth(event)

  if (!enabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Financial Watch Agent is not enabled.' })
  }

  const body = await readBody(event)
  if (body?.draftActions === true) {
    throw createError({ statusCode: 403, statusMessage: 'Financial Watch bridge does not allow direct write actions.' })
  }

  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }
  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const tenantId = typeof context.tenantId === 'string' && context.tenantId.trim() ? context.tenantId.trim() : ''
  const clientId = typeof context.clientId === 'string' && context.clientId.trim() ? context.clientId.trim() : null
  const assertedAuthority = await optionalPlatformAgentAssertionAuthority(event, 'financial-watch')
  const authority = assertedAuthority ?? await resolveServicePlatformAgentAuthority({
    serviceId: 'cloudflare-platform-agents',
    tenantId,
    tenant: 'required'
  })
  const scope = resolvePlatformAgentScope(authority, {
    requestedTenantId: tenantId,
    requestedClientId: clientId,
    clientSelection: 'all_allowed'
  })

  return runFinancialWatchAgentRequest({
    prompt,
    scope,
    userId: assertedAuthority ? authority.actor.id : null,
    route: '/internal/platform-agents/financial-watch'
  })
})
