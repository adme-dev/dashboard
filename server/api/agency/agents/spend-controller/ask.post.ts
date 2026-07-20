import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { runSpendControllerAgentRequest } from '~~/server/utils/ai/spendControllerAgentRuntime'
import { resolveUserPlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'
import { resolvePlatformAgentScope } from '~~/server/utils/ai/platformAgentScope'

function enabled() {
  return process.env.SPEND_CONTROLLER_AGENT_ENABLED === 'true'
}

function proposalsEnabled() {
  return process.env.SPEND_CONTROLLER_AGENT_PROPOSALS_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  if (!enabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Spend Controller Agent is not enabled.' })
  }

  const body = await readBody(event)
  const draftActions = body?.draftActions === true
  if (draftActions && !proposalsEnabled()) {
    throw createError({ statusCode: 403, statusMessage: 'Spend Controller proposal mode is not enabled.' })
  }

  const user = draftActions ? await requireWriteAccess(event) : await requireAuth(event)
  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }

  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const authority = await resolveUserPlatformAgentAuthority(event, {
    permissionGroups: ['MEDIA_BUYING'],
    tenant: 'none'
  })
  if (authority.actor.id !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Assistant authority actor mismatch' })
  }
  const scope = resolvePlatformAgentScope(authority, {
    requestedClientId: typeof context.clientId === 'string' ? context.clientId : null,
    clientSelection: 'all_allowed'
  })
  return runSpendControllerAgentRequest({
    prompt,
    context,
    scope,
    draftActions,
    userId: authority.actor.id,
    route: '/agency/social/spend'
  })
})
