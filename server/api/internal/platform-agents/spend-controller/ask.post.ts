import { runSpendControllerAgentRequest } from '~~/server/utils/ai/spendControllerAgentRuntime'

function enabled() {
  return process.env.SPEND_CONTROLLER_AGENT_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  const expectedKey = process.env.INTERNAL_API_KEY?.trim()
  const authHeader = getHeader(event, 'authorization')
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

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
  return runSpendControllerAgentRequest({
    prompt,
    context,
    draftActions: false,
    userId: null,
    route: '/internal/platform-agents/spend-controller',
  })
})
