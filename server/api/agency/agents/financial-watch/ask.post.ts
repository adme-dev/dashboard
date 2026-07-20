import { requireAuth } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { runFinancialWatchAgentRequest } from '~~/server/utils/ai/financialWatchAgentRuntime'
import { resolveUserPlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'
import { resolvePlatformAgentScope } from '~~/server/utils/ai/platformAgentScope'

function enabled() {
  return process.env.FINANCIAL_WATCH_AGENT_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  if (!enabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Financial Watch Agent is not enabled.' })
  }

  const user = await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const body = await readBody(event)
  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }
  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const clientId = typeof context.clientId === 'string' && context.clientId.trim() ? context.clientId.trim() : null
  const authority = await resolveUserPlatformAgentAuthority(event, {
    permissionGroups: ['FINANCE'],
    tenant: 'required',
    clientAccess: 'all'
  })
  if (authority.actor.id !== user.id || authority.tenantId !== tenantId) {
    throw createError({ statusCode: 403, statusMessage: 'Assistant authority scope mismatch' })
  }
  const scope = resolvePlatformAgentScope(authority, {
    requestedTenantId: typeof context.tenantId === 'string' ? context.tenantId : null,
    requestedClientId: clientId,
    clientSelection: 'all_allowed'
  })

  return runFinancialWatchAgentRequest({
    prompt,
    scope,
    userId: authority.actor.id,
    route: '/agency/ai/finance'
  })
})
